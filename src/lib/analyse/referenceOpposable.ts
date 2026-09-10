/**
 * src/lib/analyse/referenceOpposable.ts
 *
 * 2026-09-10 (retour Johan, devis AQUIVOLTAIQUE) — UNE SEULE DÉFINITION DE
 * « NOUS AVONS UN PRIX DE RÉFÉRENCE À OPPOSER ».
 *
 * Le devis 8 000 € TTC d'AQUIVOLTAIQUE affichait, à trois écrans d'écart :
 *   - en tête : « aucune des prestations de ce devis ne correspond à un tarif
 *     de référence que nous puissions opposer » ;
 *   - dans la répartition : des postes comptés « Prix correct » (vert) ;
 *   - dans le détail : « Marché : 900 € – 2 200 € · Plutôt cher », « Marché :
 *     1 400 € – 3 500 € · Dans la norme »…
 *
 * Les trois disaient vrai selon leur propre règle, et c'est exactement le
 * problème : il y avait trois règles. Le serveur ne compte comme comparable
 * QUE les groupes rapprochés en confiance HAUTE (`conclusion.ts`) ; l'UI, elle,
 * affichait une fourchette et un verdict dès qu'une entrée catalogue avait été
 * trouvée, quelle que soit la qualité du rapprochement. Mesuré sur le stock au
 * 2026-09-10 : **37 analyses sur les 40 qui annoncent « rien de comparable »
 * affichent quand même au moins un verdict de prix**, et **59 % des cartes
 * portant un verdict reposent sur un rapprochement non fiable**.
 *
 * Du point de vue de l'utilisateur il n'y a qu'une question : connaissez-vous
 * le prix de ce poste, oui ou non ? Elle ne peut avoir qu'une réponse par
 * poste, et c'est ce module qui la donne — au serveur comme à l'écran.
 *
 * ⚠️ Ce n'est PAS un seuil à faire varier pour élargir l'affichage. La bande
 * 0,75–0,77 de similarité est fausse une fois sur deux (mesure du 2026-08-30,
 * cf. CLAUDE.md § promotion lexicale) : élargir ici ne rendrait pas plus de
 * postes comparables, seulement plus de verdicts faux. Le bon levier pour
 * couvrir davantage de postes est le CATALOGUE et le MATCHER, pas ce garde.
 */

/** Ce que le matcher vectoriel dépose sur chaque groupe rapproché. */
export interface MetaVectorielle {
  confidence?: "high" | "medium" | "low" | "no_match" | string;
  top_similarity?: number | null;
}

/**
 * true quand la fourchette catalogue rapprochée à ce poste peut être opposée à
 * l'artisan — donc affichée, chiffrée, et comptée dans la couverture.
 *
 * Absence de méta vectorielle ⇒ true : les analyses antérieures au pipeline
 * vectoriel (V3.6, groupement Gemini) n'en portent pas, et le serveur les
 * traite déjà comme comparables. Rester permissif ici évite de faire
 * silencieusement disparaître les prix de tout le stock ancien.
 */
export function referenceOpposable(vectorial?: MetaVectorielle | null): boolean {
  if (!vectorial || typeof vectorial !== "object") return true;
  if (vectorial.confidence === undefined || vectorial.confidence === null) return true;
  return vectorial.confidence === "high";
}
