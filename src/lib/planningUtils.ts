/**
 * Planning utilities — fonctions pures partagées entre frontend et API.
 * Gère le calcul des dates, jours ouvrés, et ordonnancement des lots.
 */
import type { LotChantier } from '@/types/chantier-ia';

// ── Estimation automatique pour lots sans données planning ────────────────────

/** Durées moyennes par métier (jours ouvrés). Clé = mot-clé dans le nom du lot. */
const TRADE_DURATIONS: [RegExp, number, number][] = [
  // [pattern, duree_jours, ordre dans la séquence BTP]
  [/démol|dépose|démont/i,          3,  1],
  [/maçon|gros.?œuvre|fondation/i, 15,  2],
  [/charpent|ossature/i,           10,  3],
  [/couvreur|toiture|couverture/i,  8,  4],
  [/étanch/i,                       5,  5],
  [/menuiseri.*ext|fenêtre|baie|volet/i, 5, 6],
  [/plomb|sanitaire/i,              8,  7],
  [/électri|câblage/i,              8,  7],  // parallèle avec plombier
  [/chauffag|clim|pompe.*chaleur/i, 5,  7],  // parallèle aussi
  [/plaquis|cloison|plâtr|doublage/i, 10, 8],
  [/carrel|faïence/i,               8,  9],
  [/peint|enduit.*int|ravalement/i,  8, 10],
  [/menuiseri.*int|cuisine|dressing|placard/i, 5, 11],
  [/sol.*souple|parquet|stratifié/i, 5, 10],
  [/terrass/i,                       5,  2],
  [/piscin/i,                       15,  3],
  [/jardin|paysag|clôture/i,        5, 12],
  [/nettoyage|fin.*chantier/i,      2, 13],
  [/architect|maîtri/i,             3,  0],
  [/façad/i,                         8,  6],
  [/isol/i,                          8,  5],
];

/**
 * Pour des lots sans duree_jours / ordre_planning, estime des valeurs raisonnables
 * basées sur le nom du lot (détection du métier).
 * Retourne les lots enrichis (les lots déjà renseignés restent inchangés).
 */
export function estimateMissingPlanningData(lots: LotChantier[]): LotChantier[] {
  // D'abord, déterminer quels groupes parallèles existent déjà
  let nextPG = 1;
  const usedPGs = lots.filter(l => l.parallel_group != null).map(l => l.parallel_group!);
  if (usedPGs.length > 0) nextPG = Math.max(...usedPGs) + 1;

  // Mapper chaque lot
  const enriched = lots.map((lot, idx) => {
    if (lot.duree_jours != null && lot.duree_jours > 0 && lot.ordre_planning != null) {
      return lot; // déjà renseigné
    }

    const nom = (lot.nom ?? '') + ' ' + (lot.role ?? '') + ' ' + (lot.job_type ?? '');
    let duree = 5; // défaut : 1 semaine
    let ordre = idx + 1;
    let matchedOrdre: number | null = null;

    for (const [pattern, d, o] of TRADE_DURATIONS) {
      if (pattern.test(nom)) {
        duree = d;
        matchedOrdre = o;
        break;
      }
    }

    return {
      ...lot,
      duree_jours: lot.duree_jours ?? duree,
      ordre_planning: lot.ordre_planning ?? (matchedOrdre ?? (idx + 1)),
      parallel_group: lot.parallel_group ?? null,
    };
  });

  // Détecter les lots qui ont le même ordre (potentiellement parallèles)
  const ordreMap = new Map<number, LotChantier[]>();
  for (const lot of enriched) {
    const o = lot.ordre_planning ?? 0;
    if (!ordreMap.has(o)) ordreMap.set(o, []);
    ordreMap.get(o)!.push(lot);
  }

  // Assigner un parallel_group aux lots qui partagent le même ordre
  for (const [, group] of ordreMap) {
    if (group.length > 1) {
      const needGroup = group.filter(l => l.parallel_group == null);
      if (needGroup.length > 1) {
        for (const lot of needGroup) {
          lot.parallel_group = nextPG;
        }
        nextPG++;
      }
    }
  }

  // Re-trier par ordre_planning et réassigner des ordres séquentiels propres
  enriched.sort((a, b) => (a.ordre_planning ?? 0) - (b.ordre_planning ?? 0));

  return enriched;
}

// ── Jours ouvrés ──────────────────────────────────────────────────────────────

/** Ajoute N jours ouvrés à une date (skip samedi/dimanche) */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

/** Nombre de jours ouvrés entre 2 dates (exclusif de start, inclusif de end) */
export function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

// ── Calcul du planning ────────────────────────────────────────────────────────

/**
 * Recalcule date_debut et date_fin de chaque lot à partir de la date de départ.
 *
 * Algorithme (main lane / side lanes) :
 * 1. Trier par ordre_planning
 * 2. Grouper les lots consécutifs ayant le même parallel_group
 * 3. Dans chaque groupe : LE PREMIER lot pilote la "main lane" (séquentielle) :
 *    il démarre au cursor et avance le cursor à sa fin.
 * 4. Les lots suivants du groupe sont des "side lanes" : même date_debut que le
 *    premier, mais n'avancent PAS le cursor (ils tournent en parallèle, à côté).
 * 5. Résultat : la main lane reste compactée même si un lot parallèle dure plus
 *    longtemps — il dépasse sur sa propre side lane, sans impacter la suite.
 *
 * Retourne une copie des lots avec date_debut/date_fin mis à jour.
 */
export function computePlanningDates(lots: LotChantier[], startDate: Date): LotChantier[] {
  // Tri par ordre_planning (stable pour conserver l'ordre DB sur les égalités)
  const sorted = [...lots]
    .filter(l => l.ordre_planning != null && l.duree_jours != null && l.duree_jours > 0)
    .sort((a, b) => (a.ordre_planning ?? 0) - (b.ordre_planning ?? 0));

  // Lots sans planning data → inchangés
  const withoutPlanning = lots.filter(l => l.ordre_planning == null || l.duree_jours == null || l.duree_jours <= 0);

  // Grouper les lots consécutifs ayant le même parallel_group
  const groups: LotChantier[][] = [];
  let currentGroup: LotChantier[] = [];
  let currentPG: number | null | undefined = undefined;
  for (const lot of sorted) {
    const pg = lot.parallel_group;
    if (pg != null && pg === currentPG) {
      currentGroup.push(lot);
    } else {
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = [lot];
      currentPG = pg;
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  // Calcul des dates : main lane (premier de chaque groupe) pilote le cursor
  let cursor = new Date(startDate);
  const result: LotChantier[] = [];

  for (const group of groups) {
    // Délai explicite avant le groupe (piloté par le leader) — permet à l'agent
    // IA ou au D&D de décaler un lot de N jours sans casser la cascade.
    const leader = group[0];
    const delay = Math.max(0, leader?.delai_avant_jours ?? 0);
    const groupStart = delay > 0 ? addBusinessDays(new Date(cursor), delay) : new Date(cursor);

    for (let i = 0; i < group.length; i++) {
      const lot = group[i];
      const debut = new Date(groupStart);
      const fin = addBusinessDays(debut, lot.duree_jours!);

      result.push({
        ...lot,
        date_debut: debut.toISOString().split('T')[0],
        date_fin: fin.toISOString().split('T')[0],
      });

      // Le leader (premier du groupe) pilote le cursor main lane
      if (i === 0) {
        cursor = fin;
      }
      // Les autres membres (side lanes) tournent à côté, sans bloquer la main lane
    }
  }

  return [...result, ...withoutPlanning];
}

/**
 * Calcul inverse : à partir d'une date de fin souhaitée, remonte en arrière
 * pour calculer la date de début nécessaire. Retourne la startDate calculée.
 */
export function computeStartDateFromEnd(lots: LotChantier[], endDate: Date): Date {
  const sorted = [...lots]
    .filter(l => l.ordre_planning != null && l.duree_jours != null && l.duree_jours > 0)
    .sort((a, b) => (a.ordre_planning ?? 0) - (b.ordre_planning ?? 0));

  // Grouper
  const groups: LotChantier[][] = [];
  let currentGroup: LotChantier[] = [];
  let currentPG: number | null | undefined = undefined;
  for (const lot of sorted) {
    const pg = lot.parallel_group;
    if (pg != null && pg === currentPG) {
      currentGroup.push(lot);
    } else {
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = [lot];
      currentPG = pg;
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  // Calculer la durée totale en jours ouvrés
  let totalBusinessDays = 0;
  for (const group of groups) {
    const maxDays = Math.max(...group.map(l => l.duree_jours ?? 0));
    totalBusinessDays += maxDays;
  }

  // Soustraire les jours ouvrés depuis la date de fin
  return subtractBusinessDays(endDate, totalBusinessDays);
}

/** Soustrait N jours ouvrés d'une date (skip weekends) */
export function subtractBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let removed = 0;
  while (removed < days) {
    result.setDate(result.getDate() - 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) removed++;
  }
  return result;
}

// ── Formatage ─────────────────────────────────────────────────────────────────

/** "2 semaines", "3 jours", "1 semaine et 2 jours" */
export function formatDuration(days: number): string {
  if (days <= 0) return '—';
  const weeks = Math.floor(days / 5);
  const remaining = days % 5;

  if (weeks === 0) return `${remaining} jour${remaining > 1 ? 's' : ''}`;
  if (remaining === 0) return `${weeks} semaine${weeks > 1 ? 's' : ''}`;
  return `${weeks} sem. et ${remaining}j`;
}

/** Numéro de semaine relative (S1, S2...) depuis la date de début du chantier */
export function getWeekNumber(date: Date, startDate: Date): number {
  const diffMs = date.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

/** Nombre total de semaines couvertes par le planning */
export function getTotalWeeks(lots: LotChantier[]): number {
  const withDates = lots.filter(l => l.date_debut && l.date_fin);
  if (withDates.length === 0) return 0;

  const starts = withDates.map(l => new Date(l.date_debut!).getTime());
  const ends = withDates.map(l => new Date(l.date_fin!).getTime());

  const earliest = Math.min(...starts);
  const latest = Math.max(...ends);
  const diffDays = Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24));

  return Math.ceil(diffDays / 7) || 1;
}

/** Génère les labels de semaines (S1, S2...) avec la date de début de chaque semaine */
export function getWeekLabels(startDate: Date, totalWeeks: number): { label: string; date: string }[] {
  const labels: { label: string; date: string }[] = [];
  for (let i = 0; i < totalWeeks; i++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + i * 7);
    labels.push({
      label: `S${i + 1}`,
      date: weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
    });
  }
  return labels;
}

/** Parse une date ISO string en Date (safe, retourne null si invalide) */
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
