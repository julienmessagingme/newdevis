/**
 * Types partagés pour le verdict expert IA (ConclusionIA).
 * Importé par : API route, hook useConclusionIA, composant ConclusionIA.
 */

export interface AnomalieConclusion {
  poste: string;
  ligne_devis: string;
  prix_unitaire_devis: number;
  unite: string;
  fourchette_min: number | null;
  fourchette_max: number | null;
  surcout_estime: number | null;
  explication: string | null;
}

export interface ConclusionData {
  // ── Analyse narrative ──────────────────────────────────────────────────────
  verdict_global:   "dans_la_norme" | "eleve_justifie" | "a_negocier" | "a_risque";
  phrase_intro:     string;
  anomalies:        AnomalieConclusion[];
  justifications:   string;
  has_anomalies:    boolean;

  // ── Aide à la décision ─────────────────────────────────────────────────────
  /** Recommandation binaire pour le particulier */
  verdict_decisionnel: "signer" | "signer_avec_negociation" | "ne_pas_signer";

  /** Surcoût global estimé (Σ anomalies + marge d'incertitude) */
  surcout_global: { min: number; max: number };

  /** Niveau de risque financier global */
  niveau_risque: "faible" | "modéré" | "élevé";

  /** 3 actions concrètes à réaliser avant de signer */
  actions_avant_signature: string[];

  // ── Explication verdict (section "Pourquoi ce verdict ?") ───────────────────
  /** Bloc structuré généré par generateVerdictReasons() */
  verdict_reasons?: {
    summary: string;
    reasons: string[];
    context: string[];
  };

  // ── Contexte marché (seuils adaptatifs — affiché dans ConclusionIA) ──────────
  /** Phrase courte expliquant pourquoi les seuils ont été ajustés (dispersion / complexité) */
  market_context_note?: string;

  // ── Métadonnée ─────────────────────────────────────────────────────────────
  generated_at: string;
}
