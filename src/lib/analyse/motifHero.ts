/**
 * src/lib/analyse/motifHero.ts
 *
 * 2026-09-04 (cas DEV-202608-1, retour Johan) — d'où vient le MOTIF affiché
 * sous le verdict quand un expert corrige une analyse.
 *
 * Le rattrapage de `decide.ts` reprenait aveuglément le titre du premier
 * levier. Sur ce devis, l'expert a passé le verdict à « ne pas signer » parce
 * que l'entreprise a cessé son activité le 01/09/2025 — un an avant la date
 * du devis — et le hero annonçait « faites chiffrer par un second devis les
 * prestations spécifiques (~2 200 €) » sous une pastille rouge. Le seul
 * endroit qui portait la vraie raison était l'encadré expert, plus bas.
 *
 * Règle : quand l'expert a écrit un message pour le client, sa PREMIÈRE PHRASE
 * est le motif. C'est lui qui vient de trancher, il sait pourquoi ; le levier
 * n'est qu'un reste du calcul automatique qu'il corrige.
 */

/** Au-delà, la phrase n'est plus une accroche : on ne la tronque pas, on
 *  retombe sur le levier — mieux vaut un motif faible qu'une phrase coupée. */
const MOTIF_LONGUEUR_MAX = 240;

/** En deçà, c'est presque sûrement une découpe ratée (abréviation, « n° 3. »). */
const MOTIF_LONGUEUR_MIN = 30;

/** Première phrase d'un texte libre, sans le point final. */
export function premierePhrase(texte: string): string {
  const t = texte.trim().replace(/\s+/g, " ");
  if (!t) return "";
  // Fin de phrase = . ! ? suivi d'un espace ou de la fin. Le lookahead évite
  // de couper sur les décimales (« 12.5 ») qui ne sont pas suivies d'un blanc.
  const m = t.match(/^(.+?[.!?])(?=\s|$)/);
  const phrase = (m ? m[1] : t).trim();
  return phrase.replace(/[.!?]+$/, "").trim();
}

/**
 * Motif du hero après correction d'expert.
 *
 * @param expertMessage  Message rédigé POUR LE CLIENT (jamais les notes internes).
 * @param topLevierTitre Titre du premier levier restant, fallback historique.
 */
export function deriveMotifHero(
  expertMessage: string | null | undefined,
  topLevierTitre: string | null | undefined,
): string {
  const message = (expertMessage ?? "").trim();
  if (message) {
    const phrase = premierePhrase(message);
    // Une découpe trop courte OU une phrase trop longue pour une accroche :
    // on préfère le fallback à un motif bancal.
    if (phrase.length >= MOTIF_LONGUEUR_MIN && phrase.length <= MOTIF_LONGUEUR_MAX) {
      return minusculeInitiale(phrase);
    }
    // Message d'un seul tenant, court et sans ponctuation finale : utilisable.
    if (!/[.!?]/.test(message) && message.length >= MOTIF_LONGUEUR_MIN && message.length <= MOTIF_LONGUEUR_MAX) {
      return minusculeInitiale(message);
    }
  }

  const titre = (topLevierTitre ?? "").trim();
  if (titre) return minusculeInitiale(titre);

  return "des points restent à clarifier avec l'artisan avant signature";
}

/**
 * Le motif s'insère après un tiret (« 2 200 € HT — … ») : il commence donc en
 * minuscule. On ne touche PAS aux sigles ni aux noms propres, qui doivent
 * rester capitalisés (« SIREN », « L'entreprise » → « l'entreprise », mais
 * « EDF facture… » resterait « EDF »).
 */
function minusculeInitiale(s: string): string {
  if (!s) return s;
  const premierMot = s.split(/\s/)[0] ?? "";
  // Mot tout en capitales de 2 lettres ou plus = sigle → on n'y touche pas.
  if (/^[A-ZÀ-Ÿ]{2,}$/.test(premierMot.replace(/[^A-Za-zÀ-ÿ]/g, ""))) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}
