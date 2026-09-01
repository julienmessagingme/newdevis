/**
 * src/lib/analyse/surfaceManquante.ts
 *
 * Une quantité manque-t-elle VRAIMENT au devis, ou l'avons-nous simplement
 * ratée à l'extraction ?
 *
 * La distinction est décisive et n'était pas faite jusqu'ici. Le moteur
 * déclenche déjà une action « demandez un devis détaillé avec les unités » dès
 * qu'il ne trouve pas de quantité — sans vérifier que la surface n'est pas
 * écrite noir sur blanc dans le document. Quand elle y est, on demande à
 * l'utilisateur de réclamer à son artisan ce que son devis contient déjà :
 * c'est le genre de détail qui fait perdre la confiance d'un coup.
 *
 * Mesure sur le stock (2026-08-30, 220 devis FR d'au moins 3 lignes) :
 *   · 133 devis (60 %) n'ont AUCUNE quantité métrique exploitable ;
 *   · sur ces 133, la surface est écrite quelque part dans 3 cas seulement
 *     (« 9m2 », « 20m2 », « 30M2 » perdus dans une description) ;
 *   · soit 2 % de cas où réclamer une quantité serait à côté de la plaque —
 *     rares, mais tous détectables par la simple recherche ci-dessous.
 *
 * C'est le même principe que pour le relecteur IA : on ne se fie qu'à ce qui
 * est vérifiable en code. « La surface est-elle absente du document ? » se
 * contrôle ; « avons-nous bien cherché ? » ne se contrôle pas.
 *
 * Ce module est aussi la brique préalable au fait de POSER une question à
 * l'utilisateur (« quelle est la surface de la salle de bains ? ») : on ne la
 * posera que sur une absence réelle.
 */

/** Unités métriques exploitables pour une comparaison au m²/ml/m³. */
const UNITE_METRIQUE = /^(m2|m²|m\^2|ml|m3|m³|mètre|metre)/i;

/**
 * Une surface écrite en toutes lettres dans un texte libre : « 45 m² »,
 * « 9m2 », « 30M2 », « 120 mètres carrés ». Volontairement stricte sur le
 * chiffre collé à l'unité — « 2 m de haut » ou « 3 ml de plinthe » ne sont pas
 * des surfaces, et un nombre isolé n'en est pas une non plus.
 */
// ⚠️ Pas de `\b` final : `\b` est ASCII et ne reconnaît pas « ² » comme un
// caractère de mot, donc « 45 m² au total » n'était PAS reconnu alors que
// « 45 m2 » l'était (piège déjà documenté dans CLAUDE.md pour les accents).
// On borne avec une anticipation négative, qui, elle, ne dépend pas de l'ASCII.
const SURFACE_ECRITE = /\b\d{1,4}(?:[.,]\d{1,2})?\s*(?:m²|m2|m\^2|mètres?\s+carrés?)(?![a-z0-9])/i;

export interface LigneDevis {
  description?: string | null;
  libelle?: string | null;
  unite?: string | null;
  quantite?: number | string | null;
}

export interface DiagnosticQuantites {
  /** Nombre de lignes portant une quantité métrique exploitable. */
  lignesAvecQuantite: number;
  lignesTotal: number;
  /**
   * Aucune quantité exploitable ET aucune surface écrite nulle part : le devis
   * est réellement muet sur les quantités. C'est la SEULE situation où l'on
   * peut réclamer une précision sans passer pour n'avoir pas lu le document.
   */
  absenceReelle: boolean;
  /**
   * La surface trouvée dans le texte alors qu'aucune quantité n'a été
   * extraite — donc une extraction ratée de notre côté. Tant qu'elle est
   * renseignée, on ne réclame RIEN : ni à l'artisan, ni à l'utilisateur.
   */
  surfaceEcriteNonExtraite: string | null;
}

function aUneQuantiteExploitable(l: LigneDevis): boolean {
  const unite = String(l?.unite ?? "").trim();
  if (!UNITE_METRIQUE.test(unite)) return false;
  const q = typeof l?.quantite === "string" ? Number(l.quantite.replace(",", ".")) : Number(l?.quantite ?? 0);
  return Number.isFinite(q) && q > 0;
}

/**
 * @param lignes  les lignes de travaux extraites
 * @param textesLibres  tout autre texte du devis susceptible de porter une
 *   surface (résumé factuel, conditions…). Plus on en passe, moins on risque
 *   de réclamer une quantité déjà écrite.
 */
export function diagnostiquerQuantites(
  lignes: LigneDevis[],
  textesLibres: string[] = [],
): DiagnosticQuantites {
  const liste = Array.isArray(lignes) ? lignes : [];
  const lignesAvecQuantite = liste.filter(aUneQuantiteExploitable).length;

  if (lignesAvecQuantite > 0) {
    return {
      lignesAvecQuantite,
      lignesTotal: liste.length,
      absenceReelle: false,
      surfaceEcriteNonExtraite: null,
    };
  }

  // Aucune quantité extraite : la surface est-elle malgré tout écrite ?
  const corpus = [
    ...liste.map((l) => `${l?.description ?? ""} ${l?.libelle ?? ""}`),
    ...textesLibres.map((t) => String(t ?? "")),
  ].join(" \n ");
  const trouvee = corpus.match(SURFACE_ECRITE);

  return {
    lignesAvecQuantite: 0,
    lignesTotal: liste.length,
    absenceReelle: !trouvee,
    surfaceEcriteNonExtraite: trouvee ? trouvee[0].trim() : null,
  };
}
