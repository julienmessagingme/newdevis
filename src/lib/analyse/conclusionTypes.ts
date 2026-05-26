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

  /**
   * V3.4.13 — `true` quand `overprice_pct > 0.50` ET `anomalies_count === 0`.
   * Cas typique : catalogue marché qui sous-couvre la prestation (ex: assainissement
   * réhabilitation complète matché à un seul "micro-station" → écart aberrant).
   * Quand ce flag est set, ConclusionIA :
   *  - Masque le hero "+X €" alarmiste (chiffre non fiable)
   *  - Affiche un encadré "Comparaison globale indicative" à la place
   *  - Garde le verdict `signer_avec_negociation` (action de précaution conseillée)
   */
  comparison_indicative?: boolean;

  /**
   * V3.4.14 (2026-05-16) — Devis étranger (Belgique, Luxembourg, Suisse, etc.).
   * Le catalogue marché, les vérifications SIRET/RGE/RNE et l'analyse financière
   * sont calibrés sur la réglementation française. Quand `is_foreign=true`,
   * la conclusion est entièrement bypassée (pas d'appel Gemini, pas de comparaison
   * catalogue) et un wording dédié est généré côté serveur.
   * UI : ConclusionIA affiche une bannière ambre explicite, masque le hero surcoût.
   */
  foreign_quote?: {
    country_code: string;
    country_label: string;
  };

  /**
   * V3.4.20 (2026-05-19) — Estimation courtier travaux (pas un vrai devis d'artisan).
   * Couvre Renovation Man, Ootravaux, Hellio, Travaux.com, Bricoleur du Coin, etc.
   * Quand le doc est détecté comme estimation courtier :
   * - Bypass complet de l'appel Gemini conclusion
   * - Bypass du bloc Entreprise (pas d'artisan à vérifier — il sera désigné plus tard)
   * - Bypass du matching catalogue (pas pertinent — l'estimation est déjà au prix marché)
   * - Bannière UI dédiée invitant à re-uploader le VRAI devis quand l'artisan sera désigné
   * Bug d'origine : VMD cherchait "Renovation Man" sur INSEE → 6 homonymes dont 3 RADIÉS
   * → bloc ROUGE faux + verdict REFUSER mensonger.
   */
  estimation_courtier?: {
    courtier_nom: string | null;
  };

  /**
   * V3.4.28 (2026-05-22) — Devis HORS-SCOPE BTP (réparation véhicule, électroménager,
   * service personnel, médical, etc.). Quand ce champ est set, ConclusionIA affiche
   * une bannière dédiée et AnalysisResult masque BlockPrixMarche (qui sinon afficherait
   * des hallucinations de matching catalogue type "Remplacement chaudière fioul" pour
   * un nettoyage de vélo).
   */
  hors_scope?: {
    categorie: "reparation_vehicule" | "reparation_electromenager" | "achat_biens" | "service_personnel" | "medical" | "veterinaire" | "autre";
  };

  /**
   * V3.5.1 (2026-05-26) — Devis incomplet / résumé par lot (sous-totaux par
   * corps de métier sans quantités ni prix unitaires). Quand ce champ est set,
   * ConclusionIA affiche une bannière dédiée "Devis trop synthétique" et
   * AnalysisResult peut masquer BlockPrixMarche (qui sinon afficherait des
   * fausses anomalies type "Plomberie 7600€ vs 90-220€" pour un sous-total
   * de lot).
   */
  incomplete_quote?: {
    reason: string;
  };

  // ── Métadonnée ─────────────────────────────────────────────────────────────
  generated_at: string;
}
