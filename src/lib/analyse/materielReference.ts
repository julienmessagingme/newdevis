/**
 * src/lib/analyse/materielReference.ts
 *
 * 2026-09-15 — RAPPROCHER UNE LIGNE DE DEVIS D'UN PRIX DE MATÉRIEL PAR SA
 * RÉFÉRENCE FABRICANT (table `prix_materiel`, vertical clim).
 *
 * Origine : un devis VOLTELEC déclaré « cohérent » avec 5,22 % de couverture —
 * la phrase « les prestations standards sont au bon prix » portait sur 860 €
 * d'alimentation électrique quand 15 625 € de climatiseurs Daikin n'avaient
 * aucune référence. Or ces climatiseurs ne sont ni du sur-mesure ni du
 * réglementaire : ce sont des produits de catalogue dont le prix est public.
 *
 * 🔴 LA CORRESPONDANCE EST LITTÉRALE, JAMAIS SÉMANTIQUE.
 * Le matcher vectoriel confondrait un MXZ-4F72VF4 et un MXZ-2F53VF4 — deux
 * produits séparés par 900 €. Sur un chiffre qu'on oppose nommément à un
 * artisan, l'à-peu-près n'est pas permis. Ces entrées ne sont donc pas
 * embarquées dans l'index vectoriel et ne passent pas par lui.
 *
 * 🔴 ON NE CALCULE JAMAIS LA MARGE DE L'ARTISAN. On ne compare pas à ce qu'il
 * a payé — inconnaissable, cela dépend de son négociant, et toute erreur
 * deviendrait une accusation. On compare ce qu'il FACTURE à ce que le client
 * paierait en achetant lui-même. Un artisan dans la fourchette est normal :
 * sa marge EST sa remise d'achat, c'est son métier.
 */

/** Une entrée de la table `prix_materiel`. */
export interface PrixMateriel {
  reference: string;
  reference_normalisee: string;
  marque: string;
  famille: string;
  perimetre: "unite_seule" | "ensemble";
  designation: string;
  prix_min_ht: number;
  prix_max_ht: number;
  nb_sources: number;
  releve_le: string;
  perime_le: string;
}

/** Une ligne de devis candidate au rapprochement. */
export interface LigneDevis {
  libelle: string;
  montant: number | null;
  quantite: number | null;
}

export type ZoneEcart = "normal" | "mention" | "question";

export interface MaterielVerifie {
  /** Le libellé du DEVIS, jamais notre désignation (règle du 2026-09-10). */
  ligne: string;
  reference: string;
  designation: string;
  quantite: number;
  prix_unitaire_devis: number;
  marche_min_ht: number;
  marche_max_ht: number;
  ecart_min_pct: number;
  ecart_max_pct: number;
  zone: ZoneEcart;
  nb_sources: number;
  releve_le: string;
}

/**
 * 🔴 SEUILS VALIDÉS PAR JOHAN LE 2026-09-15, ET CE NE SONT PAS DES CURSEURS
 * D'AFFICHAGE : ils viennent d'une régularité MESURÉE.
 *
 * Sur 16 références sourcées, la marge d'installateur sur le matériel tient
 * entre +30 et +50 % pour 11 d'entre elles — chez des artisans différents, sur
 * deux marques, de 300 € à 2 600 €. C'est le fonctionnement normal du métier :
 * l'artisan achète avec une remise de négociant et revend.
 *
 * ⚠️ Un devis du corpus facture 16 % SOUS le prix distributeur (Bosch
 * CL5000M) : notre référence N'EST PAS UN PLANCHER. Un seuil à +30 % aurait
 * accusé la moitié du tableau.
 */
export const SEUIL_MENTION_PCT = 50;
export const SEUIL_QUESTION_PCT = 70;

/**
 * Motifs de nomenclature RÉELS, par constructeur.
 *
 * ⚠️ NE PAS REMPLACER PAR UNE HEURISTIQUE GÉNÉRIQUE. Un détecteur « jeton
 * alphanumérique d'au moins 5 caractères » produit du bruit mesuré sur le
 * stock : `SCOP4`, `SEER8`, `POIDS59KG`, `FROID7` (des fragments de fiche
 * technique), `33M3/H` (un débit), `C25-30` (une classe de béton) et surtout
 * `DV817` / `DV001081`, qui sont des NUMÉROS DE LIGNE de devis.
 */
const MOTIFS: RegExp[] = [
  // Mitsubishi Electric
  /MXZ[-\s]?\d{1}F\d{2,3}VF[0-9A-Z-]*/gi,      // groupe ext multi-split
  /MSZ[-\s]?[A-Z]{2}\d{2}V[GF]K?[0-9A-Z-]*/gi, // mural
  /MFZ[-\s]?[A-Z]{2}\d{2}VG[0-9A-Z-]*/gi,      // console
  /(?:PEAD|PEA|SEZ|SLZ|PLA|PKA|PUZ|SUZ)[-\s]?[A-Z]?\d{2,3}[0-9A-Z]*/gi,
  // Daikin
  /\d{1}MXM\d{2,3}[A-Z]\d?/gi,                 // groupe ext multi-split
  /(?:FTXM|CTXM|FVXM|FTXA|FTXP|ATXM|FDXM)\d{2}[A-Z]?\d?/gi,
  /RXM\d{2}[A-Z]?\d?/gi,
  /(?:ERGA|ERLA|EBHB|EHBH|EHBX|EDLA|EPRA)\d{2}[0-9A-Z]*/gi,
  // Bosch
  /CL\s?\d{4}[A-Z]?(?:\s?\d{2,3}\/\d)?/gi,
  // Atlantic / Fujitsu General
  /(?:AOYG|ASYG|AUYG|ARYG|AOHG)\d{2}[A-Z]{0,4}\d?/gi,
];

/** MAJUSCULES, sans rien d'autre que lettres et chiffres. */
export function normaliserReference(brut: string): string {
  return brut.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * RACINE d'une référence : ce qui identifie le PRODUIT, sans son millésime.
 *
 * La nomenclature CVC encode l'objet : `MXZ-`**`4F72`**`VF4` = 4 sorties,
 * 7,2 kW. Le suffixe de génération (VF4 / VF5-E1, A8 / A9) désigne le même
 * appareil à un millésime près — nos devis portent les deux, et le prix ne
 * change pas assez pour justifier deux entrées. Rapprocher sur la racine
 * évite de rater la moitié des lignes.
 *
 * ⚠️ On ne tronque QUE le millésime, jamais la puissance ni le nombre de
 * sorties : ce sont eux qui distinguent deux produits à 900 € d'écart.
 */
export function racineDeReference(brut: string): string {
  const n = normaliserReference(brut);
  let m: RegExpMatchArray | null;

  // MXZ-4F72VF4 / MXZ-4F72VF5E1 → MXZ4F72VF (le millésime VF4/VF5 tombe,
  // le nombre de sorties et la puissance restent : ils font l'identité).
  if ((m = n.match(/^(MXZ\d{1}F\d{2,3}VF)/))) return m[1];
  // 4MXM80A8 / 4MXM80A9 → 4MXM80
  if ((m = n.match(/^(\d{1}MXM\d{2,3})/))) return m[1];
  // FTXM42A / FTXM42R / CTXM15A → FTXM42
  if ((m = n.match(/^((?:FTXM|CTXM|FVXM|FTXA|FTXP|ATXM|FDXM|RXM)\d{2})/))) return m[1];
  // MSZ-AY25VGK / MSZ-AY25VGK2E1 → MSZAY25VGK
  if ((m = n.match(/^(MSZ[A-Z]{2}\d{2}VGK?)/))) return m[1];
  // MFZ-KT25VG / MFZKT25VGK → MFZKT25VG
  if ((m = n.match(/^(MFZ[A-Z]{2}\d{2}VG)/))) return m[1];
  // PEAD-M60JA2 → PEADM60JA ; SUZ-M60VA2 → SUZM60VA
  if ((m = n.match(/^((?:PEAD|PEA|SEZ|SLZ|PLA|PKA|PUZ|SUZ)[A-Z]?\d{2,3}[A-Z]{1,2})/))) return m[1];
  // ERGA08EVH7 → ERGA08 ; EHBH08E6V → EHBH08
  if ((m = n.match(/^((?:ERGA|ERLA|EBHB|EHBH|EHBX|EDLA|EPRA)\d{2})/))) return m[1];
  // CL5000M 53/2E → CL5000M532E (la puissance FAIT partie de l'identité ici)
  return n;
}

/**
 * Les clés de recherche d'une entrée du catalogue : un ET de OU.
 *
 * `'PEAD-M60JA + SUZ-M60VA'` est un ENSEMBLE : les deux composants doivent
 * être présents dans la ligne. `'4MXM80A8/A9'` désigne DEUX MILLÉSIMES du
 * même produit : l'un ou l'autre suffit. Confondre les deux ferait rapprocher
 * un gainable sur sa seule unité extérieure.
 */
export function clesDeRecherche(reference: string): string[][] {
  return reference
    .split("+")
    .map((groupe) => {
      const t = groupe.trim();
      // « 4MXM80A8/A9 » → racines de « 4MXM80A8 » et « 4MXM80A9 »
      const variantes = t.includes("/")
        ? (() => {
            const [tete, ...suites] = t.split("/").map((s) => s.trim());
            const prefixe = tete.slice(0, Math.max(0, tete.length - suites[0].length));
            return [tete, ...suites.map((s) => `${prefixe}${s}`)];
          })()
        : [t];
      return [...new Set(variantes.map(racineDeReference))].filter(Boolean);
    })
    .filter((g) => g.length > 0);
}

/**
 * 🔴 GARDE DU PÉRIMÈTRE (piège n°2, mesuré le 15/09).
 *
 * Une même référence désigne deux produits : MSZ-AY25VGK vaut **1 059 €** en
 * pack monosplit complet et **381 €** en unité intérieure seule — ×2,8. Nos
 * entrées `unite_seule` sont sourcées sur l'unité seule ; les opposer à une
 * ligne qui facture aussi la pose ferait conclure à une surfacturation
 * massive chez un artisan parfaitement normal.
 *
 * Mesuré : 19 devis clim sur 35 séparent déjà matériel et pose (83 % de ceux
 * où une marque est nommée) ; 3 combinent, et ces 3 le disent dans le libellé.
 */
/**
 * ⚠️ PAS DE `\b` EN FIN DE MOTIF — c'est le piège déjà documenté le 2026-08-30
 * sur `surfaceManquante.ts` : `\b` est ASCII et ne borne pas après un
 * caractère accentué. « Fourni et posé » n'était PAS détecté (le `\b` après
 * le « é » ne matche jamais), alors que « Fourni et pose » l'était. On utilise
 * une anticipation négative, qui, elle, fonctionne après un accent.
 */
const POSE_RE =
  /\b(?:pose|pos[ée]e?s?|installation|install[ée]e?s?|main[-\s]d['’]?(?:œu|oeu)vre|mise en (?:service|route|œuvre|oeuvre)|fourniture et pose|fourni(?:e|es|s)? et pos[ée]|f\s?&\s?p|forfait pose|raccordement|montage)(?![a-zà-ÿ])/i;

export function ligneContientPose(libelle: string): boolean {
  return POSE_RE.test(libelle);
}

/** Classe un écart selon les seuils validés. */
export function classerEcart(ecartMaxPct: number): ZoneEcart {
  if (ecartMaxPct >= SEUIL_QUESTION_PCT) return "question";
  if (ecartMaxPct >= SEUIL_MENTION_PCT) return "mention";
  return "normal";
}

/**
 * 🔴 LA COMPARAISON SE FAIT SUR LE PRIX UNITAIRE, JAMAIS SUR LE MONTANT DE
 * LIGNE (piège n°5 — celui que j'ai commis avant de le corriger).
 *
 * La ligne FTXM42 du devis VOLTELEC porte **q = 2** pour 1 510 €. Comparée
 * telle quelle à un prix unitaire de 524-533 €, elle sortait à +184 % : on
 * aurait accusé de surfacturation un artisan qui facture +44 %, c'est-à-dire
 * dans la norme du métier. En production, c'était une diffamation.
 */
export function prixUnitaire(ligne: LigneDevis): number | null {
  const montant = typeof ligne.montant === "number" ? ligne.montant : null;
  if (montant === null || montant <= 0) return null;
  const q = typeof ligne.quantite === "number" && ligne.quantite > 0 ? ligne.quantite : 1;
  return montant / q;
}

/** Une entrée dont le relevé a expiré ne s'oppose plus à personne. */
export function estPerimee(entree: PrixMateriel, aujourdHui: Date = new Date()): boolean {
  const t = Date.parse(entree.perime_le);
  return Number.isFinite(t) && t < aujourdHui.getTime();
}

/**
 * Rapproche les lignes d'un devis du catalogue matériel.
 *
 * Renvoie une entrée par ligne rapprochée, y compris celles en zone
 * « normal » : le but n'est pas seulement de trouver des écarts, c'est de
 * pouvoir dire « nous avons vérifié ce matériel » — c'est ce qui manquait au
 * devis VOLTELEC, où le verdict portait sur 5 % du montant.
 */
export function rapprocherMateriel(
  lignes: LigneDevis[],
  catalogue: PrixMateriel[],
  aujourdHui: Date = new Date(),
): MaterielVerifie[] {
  const utilisables = catalogue.filter((e) => !estPerimee(e, aujourdHui));
  if (utilisables.length === 0) return [];

  const indexe = utilisables.map((e) => ({ e, cles: clesDeRecherche(e.reference) }));
  const sortie: MaterielVerifie[] = [];

  for (const ligne of lignes) {
    const libelle = String(ligne.libelle ?? "").replace(/\s+/g, " ").trim();
    if (!libelle) continue;

    const pu = prixUnitaire(ligne);
    if (pu === null) continue;

    // Les références présentes dans la ligne, normalisées en racines.
    const racines = new Set<string>();
    for (const motif of MOTIFS) {
      for (const m of libelle.matchAll(motif)) racines.add(racineDeReference(m[0]));
    }
    if (racines.size === 0) continue;

    const porteLaPose = ligneContientPose(libelle);

    // Le meilleur candidat = celui dont TOUS les groupes de clés sont présents.
    // À égalité, on garde celui qui exige le plus de composants (un ensemble
    // prime sur l'un de ses membres : « PEAD + SUZ » plutôt que « SUZ » seul).
    let retenu: PrixMateriel | null = null;
    for (const { e, cles } of indexe) {
      const complet = cles.every((groupe) => groupe.some((c) => racines.has(c)));
      if (!complet) continue;
      // 🔴 Garde du périmètre : une entrée « unité seule » ne se compare pas à
      // une ligne qui facture aussi la pose.
      if (e.perimetre === "unite_seule" && porteLaPose) continue;
      if (retenu === null || cles.length > clesDeRecherche(retenu.reference).length) retenu = e;
    }
    if (!retenu) continue;

    const ecartMin = Math.round((pu / retenu.prix_max_ht - 1) * 100);
    const ecartMax = Math.round((pu / retenu.prix_min_ht - 1) * 100);

    sortie.push({
      ligne: libelle.length > 90 ? `${libelle.slice(0, 88)}…` : libelle,
      reference: retenu.reference,
      designation: retenu.designation,
      quantite: typeof ligne.quantite === "number" && ligne.quantite > 0 ? ligne.quantite : 1,
      prix_unitaire_devis: Math.round(pu),
      marche_min_ht: retenu.prix_min_ht,
      marche_max_ht: retenu.prix_max_ht,
      ecart_min_pct: ecartMin,
      ecart_max_pct: ecartMax,
      zone: classerEcart(ecartMax),
      nb_sources: retenu.nb_sources,
      releve_le: retenu.releve_le,
    });
  }

  return sortie;
}

/** Montant total du devis couvert par une vérification matérielle. */
export function montantVerifie(v: MaterielVerifie[]): number {
  return v.reduce((s, m) => s + m.prix_unitaire_devis * m.quantite, 0);
}

/**
 * Clé de rapprochement d'une ligne de devis, pour savoir si elle est DÉJÀ
 * chiffrée par sa référence fabricant.
 *
 * 🔴 ELLE EXISTE POUR QUE LE MASQUAGE ET L'AFFICHAGE NE PUISSENT PAS DIVERGER.
 * Le détail poste par poste doit retirer les lignes reprises par le bloc
 * matériel : mesuré sur le stock, le catalogue les rapproche sur
 * « Climatisation mono-split · 900-2 800 € » — une unité intérieure seule
 * comparée à une installation complète. Une unité facturée 647 € y paraît
 * BON MARCHÉ quand sa référence exacte la situe à +94 %. Deux fourchettes
 * contradictoires sur la même ligne, c'est le défaut corrigé le 2026-09-10.
 *
 * ⚠️ Tronquée à 60 caractères : les libellés de fiche technique dépassent
 * souvent 300 caractères et sont recopiés différemment d'un champ à l'autre
 * (`extracted.travaux` contre `n8n_price_data.devis_lines`). Le début, lui,
 * est stable.
 */
export function cleLigneDevis(libelle: string): string {
  return String(libelle ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 60);
}

/** Les lignes à retirer du détail poste par poste, sous forme de clés. */
export function clesLignesMateriel(v: MaterielVerifie[]): Set<string> {
  return new Set(v.map((m) => cleLigneDevis(m.ligne.replace(/…$/, ""))));
}

/**
 * 2026-09-15 (retour Johan) — L'OBJET D'UNE LIGNE, SANS SA FICHE TECHNIQUE.
 *
 * Les libellés d'équipement CVC portent la fiche produit entière : « GROUPE
 * EXTERTIEUR DAIKIN 4 SORTIES 8 kW DC INVERTER R32 4MXM80A8 **Puissance
 * froid: 1,50-4.00 – 4,20 Puissance chaud: … Compresseur SWING Poids : 60 kg
 * Pression sonore …** » — 400 caractères. Affichés bruts et trois fois de
 * suite, ils transformaient une phrase censée aider le lecteur à reconnaître
 * sa ligne en mur de spécifications.
 *
 * On coupe à la première marque de spécification. ⚠️ On ne coupe PAS à une
 * longueur fixe : la référence fabricant est souvent au milieu du libellé, et
 * c'est elle qui permet de reconnaître le poste.
 */
const DEBUT_SPECS_RE =
  /\s(?:Puissance|Dimensions?|Poids|Compresseur|Label|Très haute|Ultra silencieu|SEER|SCOP|Classe|Niveau sonore|Pression sonore|Filtre|Télécommande|Garantie|Alimentation électrique|Fluide|Débit|Réfrigérant)\b/i;

export function objetDeLigne(libelle: string): string {
  const propre = String(libelle ?? "").replace(/\s+/g, " ").trim().replace(/^[-–—•\s]+/, "");
  if (!propre) return "";
  const coupe = propre.split(DEBUT_SPECS_RE)[0].trim() || propre;
  return coupe.length > 80 ? `${coupe.slice(0, 78).trim()}…` : coupe;
}

/** Une ligne du détail est-elle déjà couverte par une référence matériel ? */
export function ligneCouverteParMateriel(libelle: string, cles: Set<string>): boolean {
  const k = cleLigneDevis(libelle);
  if (!k) return false;
  for (const c of cles) {
    if (!c) continue;
    if (k === c || k.startsWith(c) || c.startsWith(k)) return true;
  }
  return false;
}
