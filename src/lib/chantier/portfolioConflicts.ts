// Coeur PUR de la phase 2 du portefeuille : rapprochement d'artisans entre
// chantiers (annuaire unifie) + detection de conflits de ressources (un meme
// artisan attendu sur 2 chantiers en meme temps).
//
// Aucun import Supabase/fetch/env : transforme des donnees deja recuperees.
// Garde-fou du plan : honnetete par confiance. Un conflit n'est "confirme" que
// sur un rapprochement fort (telephone / SIRET) ; sinon "a verifier". Jamais de
// fausse alerte. Un contact sans lot rattache (donc sans fenetre de dates) est
// exclu du calcul de chevauchement (pas d'invention).

// ── Formes brutes consommees ─────────────────────────────────────────────────

export interface RawContact {
  id: string;
  chantier_id: string;
  nom: string;
  telephone: string | null;
  siret: string | null;
  role: string | null;
  lot_id: string | null;
}

export interface RawLotWindow {
  id: string;
  chantier_id: string;
  nom: string;
  date_debut: string | null;
  date_fin: string | null;
}

export interface ChantierRef {
  id: string;
  nom: string;
}

// ── Sorties typees ───────────────────────────────────────────────────────────

export interface ArtisanOccurrence {
  chantierId: string;
  chantierNom: string;
  lotId: string | null;
  lotNom: string | null;
  role: string | null;
  /** Fenetre de dates du lot rattache (null si pas de lot ou pas de dates). */
  start: string | null;
  end: string | null;
}

export interface UnifiedArtisan {
  key: string;
  label: string;
  phone: string | null;
  siret: string | null;
  /** high = rapproche par telephone/SIRET ; low = par nom approche uniquement. */
  confidence: 'high' | 'low';
  /** Nb de chantiers DISTINCTS ou cet artisan intervient. */
  chantierCount: number;
  occurrences: ArtisanOccurrence[];
}

export interface ConflictWindow {
  chantierNom: string;
  lotNom: string | null;
  start: string;
  end: string;
}

export interface PortfolioConflict {
  artisanLabel: string;
  /** confirmed = rapprochement fort + chevauchement ; to_verify = rapprochement faible. */
  confidence: 'confirmed' | 'to_verify';
  windows: ConflictWindow[];
}

// ── Normalisations (cles de rapprochement) ───────────────────────────────────

/** Telephone canonique (+33XXXXXXXXX). Vide si trop partiel / inutilisable. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length < 6) return ''; // trop partiel -> on ne matche pas a tort
  if (digits.startsWith('00')) digits = digits.slice(2); // 0033... -> 33...
  if (digits.length === 10 && digits.startsWith('0')) digits = '33' + digits.slice(1); // 0X...(FR)
  return '+' + digits;
}

/** SIRET = 14 chiffres exacts, sinon vide (cle non fiable). */
export function normalizeSiret(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = String(raw).replace(/\D/g, '');
  return d.length === 14 ? d : '';
}

/** Nom normalise (minuscule, sans accents ni ponctuation) pour match approche. */
export function normalizeName(raw: string | null | undefined): string {
  return (raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ── Union-find ───────────────────────────────────────────────────────────────

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

// ── Annuaire unifie ──────────────────────────────────────────────────────────

/**
 * Deduplique les contacts par personne, entre tous les chantiers.
 * Rapprochement par confiance decroissante :
 *   - telephone normalise (fort) -> high
 *   - SIRET (fort) -> high
 *   - nom approche (faible) UNIQUEMENT entre contacts sans tel ni SIRET -> low
 * Le match par nom est volontairement conservateur (jamais entre deux contacts
 * qui ont chacun un telephone/SIRET distinct) pour eviter les faux rapprochements.
 */
export function buildUnifiedArtisans(
  contacts: RawContact[],
  lots: RawLotWindow[],
  chantiers: ChantierRef[],
): UnifiedArtisan[] {
  const n = contacts.length;
  const uf = new UnionFind(n);

  const chantierNomById = new Map(chantiers.map((c) => [c.id, c.nom]));
  const lotById = new Map(lots.map((l) => [l.id, l]));

  const phoneKey = contacts.map((c) => normalizePhone(c.telephone));
  const siretKey = contacts.map((c) => normalizeSiret(c.siret));
  const nameKey = contacts.map((c) => normalizeName(c.nom));

  // Edges forts : telephone puis SIRET.
  const firstByPhone = new Map<string, number>();
  const firstBySiret = new Map<string, number>();
  // Edges faibles : nom, seulement si pas de cle forte.
  const firstByName = new Map<string, number>();

  // Trace si un groupe (par racine) possede au moins une arete forte.
  const strongMembers = new Set<number>(); // index ayant participe a une arete forte

  for (let i = 0; i < n; i++) {
    if (phoneKey[i]) {
      const f = firstByPhone.get(phoneKey[i]);
      if (f === undefined) firstByPhone.set(phoneKey[i], i);
      else { uf.union(i, f); strongMembers.add(i); strongMembers.add(f); }
    }
    if (siretKey[i]) {
      const f = firstBySiret.get(siretKey[i]);
      if (f === undefined) firstBySiret.set(siretKey[i], i);
      else { uf.union(i, f); strongMembers.add(i); strongMembers.add(f); }
    }
  }
  // Aretes faibles par nom, conservatrices.
  for (let i = 0; i < n; i++) {
    if (phoneKey[i] || siretKey[i]) continue; // a une cle forte -> pas de match nom
    if (!nameKey[i]) continue;
    const f = firstByName.get(nameKey[i]);
    if (f === undefined) firstByName.set(nameKey[i], i);
    else uf.union(i, f);
  }

  // Regroupement par racine.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = uf.find(i);
    const arr = groups.get(r);
    if (arr) arr.push(i);
    else groups.set(r, [i]);
  }

  const artisans: UnifiedArtisan[] = [];
  for (const [root, members] of groups) {
    const hasStrong = members.some((i) => strongMembers.has(i));
    // Confiance : high si rapproche par tel/SIRET, OU singleton ayant une cle forte.
    const singletonStrong = members.length === 1 && (phoneKey[members[0]] !== '' || siretKey[members[0]] !== '');
    const confidence: 'high' | 'low' = hasStrong || singletonStrong ? 'high' : 'low';

    // Label = nom non vide le plus long (le plus complet).
    let label = '';
    for (const i of members) {
      const nom = contacts[i].nom?.trim() ?? '';
      if (nom.length > label.length) label = nom;
    }
    if (!label) label = 'Artisan sans nom';

    const phone = members.map((i) => phoneKey[i]).find((p) => p) ?? null;
    const siret = members.map((i) => siretKey[i]).find((s) => s) ?? null;

    const occurrences: ArtisanOccurrence[] = members.map((i) => {
      const c = contacts[i];
      const lot = c.lot_id ? lotById.get(c.lot_id) : undefined;
      const hasWindow = !!lot?.date_debut && !!lot?.date_fin;
      return {
        chantierId: c.chantier_id,
        chantierNom: chantierNomById.get(c.chantier_id) ?? 'Chantier',
        lotId: c.lot_id ?? null,
        lotNom: lot?.nom ?? null,
        role: c.role ?? null,
        start: hasWindow ? lot!.date_debut : null,
        end: hasWindow ? lot!.date_fin : null,
      };
    });

    const chantierCount = new Set(occurrences.map((o) => o.chantierId)).size;

    artisans.push({
      key: `a${root}`,
      label,
      phone,
      siret,
      confidence,
      chantierCount,
      occurrences,
    });
  }

  // Tri : multi-chantier d'abord, puis par nb d'occurrences.
  artisans.sort((a, b) =>
    (b.chantierCount - a.chantierCount) || (b.occurrences.length - a.occurrences.length),
  );
  return artisans;
}

// ── Detection de conflits (chevauchement de periodes) ────────────────────────

// Chevauchement STRICT : deux fenetres qui se touchent seulement (fin de l'une =
// debut de l'autre, ex 30/06 -> 30/06) ne sont PAS un conflit (l'artisan enchaine).
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Pour chaque artisan present sur >= 2 chantiers DISTINCTS, croise les fenetres
 * de dates de ses lots (sur des chantiers differents). Si au moins deux fenetres
 * de chantiers differents se recoupent -> conflit. confirmed si rapprochement
 * fort (high), sinon to_verify.
 */
export function detectConflicts(artisans: UnifiedArtisan[]): PortfolioConflict[] {
  const conflicts: PortfolioConflict[] = [];

  for (const a of artisans) {
    if (a.chantierCount < 2) continue;

    // Fenetres valides (lot rattache + dates presentes).
    const wins = a.occurrences
      .filter((o) => o.start && o.end)
      .map((o) => ({
        chantierId: o.chantierId,
        chantierNom: o.chantierNom,
        lotNom: o.lotNom,
        start: o.start as string,
        end: o.end as string,
        startMs: new Date(o.start as string).getTime(),
        endMs: new Date(o.end as string).getTime(),
      }))
      .filter((w) => !Number.isNaN(w.startMs) && !Number.isNaN(w.endMs));

    if (wins.length < 2) continue;

    // Existe-t-il un chevauchement entre deux fenetres de chantiers DIFFERENTS ?
    let hasCrossOverlap = false;
    for (let i = 0; i < wins.length && !hasCrossOverlap; i++) {
      for (let j = i + 1; j < wins.length; j++) {
        if (wins[i].chantierId === wins[j].chantierId) continue;
        if (overlaps(wins[i].startMs, wins[i].endMs, wins[j].startMs, wins[j].endMs)) {
          hasCrossOverlap = true;
          break;
        }
      }
    }
    if (!hasCrossOverlap) continue;

    conflicts.push({
      artisanLabel: a.label,
      confidence: a.confidence === 'high' ? 'confirmed' : 'to_verify',
      windows: wins.map((w) => ({
        chantierNom: w.chantierNom,
        lotNom: w.lotNom,
        start: w.start,
        end: w.end,
      })),
    });
  }

  // Conflits confirmes d'abord.
  conflicts.sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === 'confirmed' ? -1 : 1));
  return conflicts;
}
