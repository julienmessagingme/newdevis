// ============ TYPE DEFINITIONS ============

export type ScoringColor = "VERT" | "ORANGE" | "ROUGE";
export type DocumentType = "devis_travaux" | "facture" | "diagnostic_immobilier" | "autre";
export type DomainType = "travaux" | "auto" | "dentaire";

// ============================================================
// CONDITIONS DE PAIEMENT — Extraction stricte depuis le document
// ============================================================

export interface ConditionPaiement {
  type: "acompte" | "progress" | "solde";
  percentage: number | null;
  amount: number | null;
  due_type: "date" | "delay" | "milestone" | null;
  due_date: string | null;      // format YYYY-MM-DD
  delay_days: number | null;
  label: string;                // libellé exact copié depuis le document
}

// ============================================================
// MULTI-DEVIS — Un PDF contenant plusieurs artisans/lots
// ============================================================

export interface DevisSegment {
  /** Intitulé du lot (ex: "MACONNERIE", "PLOMBERIE SANITAIRES") */
  lot_type: string;
  /** Nom de l'entreprise pour ce lot */
  entreprise_nom: string;
  /** SIRET (14 chiffres) ou SIREN/RCS (9 chiffres) ou null */
  siret: string | null;
  /** Total HT en euros */
  total_ht: number | null;
  /** Total TTC en euros */
  total_ttc: number | null;
  /** Taux de TVA (ex: 20) */
  taux_tva: number | null;
  /** Assurance décennale mentionnée */
  assurance_decennale: boolean | null;
  /** Lignes de travaux du lot */
  lignes: Array<{
    libelle: string;
    categorie: string;
    montant: number | null;
    quantite: number | null;
    unite: string | null;
  }>;
}

// ============================================================
// PHASE 1 — EXTRACTION UNIQUE (UN SEUL APPEL IA)
// ============================================================

export interface ExtractedData {
  type_document: DocumentType;
  entreprise: {
    nom: string | null;
    siret: string | null;
    adresse: string | null;
    iban: string | null;
    assurance_decennale_mentionnee: boolean | null;
    assurance_rc_pro_mentionnee: boolean | null;
    certifications_mentionnees: string[];
  };
  client: {
    adresse_chantier: string | null;
    code_postal: string | null;
    ville: string | null;
  };
  travaux: Array<{
    libelle: string;
    categorie: string;
    montant: number | null;
    quantite: number | null;
    unite: string | null;
  }>;
  paiement: {
    acompte_pct: number | null;
    acompte_avant_travaux_pct: number | null;
    modes: string[];
    echeancier_detecte: boolean;
    conditions_paiement: ConditionPaiement[];
    /**
     * V3.1 (2026-05-11) — Échéancier détaillé extrait du devis.
     * Permet de calculer côté score.ts le CUMUL des versements demandés avant
     * réception des travaux (somme des étapes ≠ "reception").
     *
     * Exemple devis Kern Terrassement :
     *   [
     *     { etape: "signature",     pct: 30, description: "30 % à la signature du devis" },
     *     { etape: "demarrage",     pct: 30, description: "30 % au démarrage du chantier" },
     *     { etape: "intermediaire", pct: 30, description: "30 % revue de chantier intermédiaire" },
     *     { etape: "reception",     pct: 10, description: "solde à la réception du chantier" },
     *   ]
     * → cumul avant réception = 90% → critère ROUGE acompte excessif.
     */
    modalites_paiement?: Array<{
      etape:
        | "signature"
        | "demarrage"
        | "intermediaire"
        | "livraison_materiaux"
        | "revue_chantier"
        | "fin_travaux"
        | "reception"
        | "autre";
      pct: number;
      description: string;
    }>;
  };
  dates: {
    date_devis: string | null;
    date_validite: string | null;
    date_execution_max: string | null;
  };
  totaux: {
    ht: number | null;
    tva: number | null;
    ttc: number | null;
    taux_tva: number | null;
  };
  anomalies_detectees: string[];
  resume_factuel: string;
  tva_non_applicable: boolean | null;
  devis_manuscrit: boolean | null;
  materiaux_fournis_client: boolean | null;
  /** true si le PDF regroupe plusieurs devis de différentes entreprises */
  multiple_quotes?: boolean;
  /** Liste des devis individuels (peuplé uniquement si multiple_quotes=true) */
  devis_list?: DevisSegment[];
  /**
   * V3.4.14 (2026-05-16) — Détection devis étranger.
   * country_code = ISO-2 ("FR", "BE", "LU", "CH", "DE", ...).
   * is_foreign_quote = true si country_code ≠ "FR".
   * Calculé par detectQuoteCountry() dans country.ts à partir de 4 signaux
   * (IBAN, TVA intracom, adresse, taux TVA).
   * Quand is_foreign_quote=true, conclusion.ts bypass complètement le matching
   * catalogue marché (calibré FR) et renvoie un verdict "comparaison indisponible"
   * + bannière explicative.
   */
  country_code?: string;
  country_label?: string;
  is_foreign_quote?: boolean;
  /**
   * V3.4.17 (2026-05-19) — Détection de clauses contractuelles
   * potentiellement litigieuses ou illégales dans le texte libre du devis.
   * Patterns ciblés :
   *   - "Devis non signé sera facturé X€" → illégal sans information préalable
   *     écrite et accord du client (Code conso L113-3 + arrêté 2 mars 1990)
   *   - "Aucun remboursement", "Pas de retour possible" → atteinte au droit
   *     de rétractation (lois Hamon 2014)
   *   - "Annulation = X%" avec X > 15% → pénalité possiblement excessive
   *   - "Acompte > 30%" → déjà géré dans paiement.acompte_pct, on duplique pas
   *   - "Sous-traitance libre / sans accord" → opacité contractuelle
   */
  clauses_litigieuses?: ClauseLitigieuse[];
}

/**
 * V3.4.17 — Clause potentiellement litigieuse extraite du texte libre du devis
 * (CGV, mentions bas de page, conditions de paiement).
 */
export interface ClauseLitigieuse {
  /** Catégorie de la clause détectée. */
  type:
    | "devis_facture_si_non_signe"
    | "pas_de_retractation"
    | "penalite_annulation_excessive"
    | "soustraitance_libre"
    | "modification_unilaterale";
  /** Citation EXACTE du texte du devis (mot pour mot, pour traçabilité). */
  citation: string;
  /** Gravité : 'rouge' = illégal probable, 'orange' = à clarifier. */
  gravite: "rouge" | "orange";
}

// ============================================================
// DEBUG ADMIN — Structure pour audit des appels API
// ============================================================

export interface ProviderCallDebug {
  enabled: boolean;
  attempted: boolean;
  cached: boolean;
  cache_hit: boolean;
  http_status: number | null;
  error: string | null;
  fetched_at: string | null;
  expires_at: string | null;
  latency_ms: number | null;
}

export interface DebugInfo {
  provider_calls: {
    entreprise: ProviderCallDebug;
    finances: ProviderCallDebug;
  };
}

// ============================================================
// COMPANY CACHE — Structure de données
// ============================================================

export interface CompanyPayload {
  date_creation: string | null;
  age_years: number | null;
  is_active: boolean;
  nom: string | null;
  adresse: string | null;
  ville: string | null;
  procedure_collective: boolean;
}

export interface CachedCompanyData {
  id: string;
  siret: string;
  siren: string;
  provider: string;
  fetched_at: string;
  expires_at: string;
  payload: CompanyPayload;
  status: "ok" | "error" | "not_found";
  error_code: string | null;
  error_message: string | null;
}

// ============================================================
// PHASE 2 — VÉRIFICATION (APIs EXTERNES - SANS IA)
// ============================================================

export interface FinancialRatios {
  date_cloture: string;
  chiffre_affaires: number | null;
  resultat_net: number | null;
  taux_endettement: number | null;
  ratio_liquidite: number | null;
  autonomie_financiere: number | null;
  capacite_remboursement: number | null;
  marge_ebe: number | null;
}

export interface RgeQualification {
  nom: string;
  domaine?: string;
  date_fin?: string;
}

export interface QualibatQualification {
  code: string;
  libelle: string;
  date_fin?: string;
}

export interface VerificationResult {
  entreprise_immatriculee: boolean | null;
  entreprise_radiee: boolean | null;
  procedure_collective: boolean | null;
  date_creation: string | null;
  anciennete_annees: number | null;
  nom_officiel: string | null;
  adresse_officielle: string | null;
  ville_officielle: string | null;
  /**
   * V3.4.19 (2026-05-19) — `ambiguous` ajouté pour les fallback nom où plusieurs
   * candidats homonymes existent SANS désambiguïsation possible par code postal.
   * Quand ce statut est retourné, `entreprise_radiee` reste null (on ne SAIT pas),
   * et le scoring + UI doivent traiter le cas comme "non vérifiable" plutôt que
   * de présenter une mauvaise entreprise comme certaine.
   */
  lookup_status: "ok" | "not_found" | "error" | "skipped" | "no_siret" | "ambiguous";
  /**
   * V3.4.19 — Liste courte des candidats homonymes quand lookup_status="ambiguous".
   * Utile pour afficher un message "X homonymes trouvés, vérification manuelle nécessaire".
   * Format : "NOM (CP VILLE)" — max 5 entries.
   */
  ambiguous_candidates?: string[];
  finances: FinancialRatios[];
  finances_status: "ok" | "not_found" | "error" | "skipped";

  iban_verifie: boolean;
  iban_valide: boolean | null;
  iban_pays: string | null;
  iban_code_pays: string | null;
  iban_banque: string | null;

  rge_pertinent: boolean;
  rge_trouve: boolean;
  rge_qualifications: RgeQualification[];

  qualibat_mentionne: boolean;
  qualibat_verifie: boolean;
  qualibat_certifie: boolean | null;
  qualibat_qualifications: QualibatQualification[];

  google_trouve: boolean;
  google_note: number | null;
  google_nb_avis: number | null;
  google_match_fiable: boolean;

  georisques_consulte: boolean;
  georisques_risques: string[];
  georisques_zone_sismique: string | null;
  georisques_commune: string | null;

  patrimoine_consulte: boolean;
  patrimoine_status: "possible" | "non_detecte" | "inconnu";
  patrimoine_types: string[];
  patrimoine_lat: number | null;
  patrimoine_lon: number | null;

  comparaisons_prix: Array<{
    categorie: string;
    libelle: string;
    prix_unitaire_devis: number;
    fourchette_min: number;
    fourchette_max: number;
    zone: string;
    score: ScoringColor;
    explication: string;
  }>;

  debug?: DebugInfo;
}

// ============================================================
// PHASE 3 — SCORING DÉTERMINISTE (SANS IA - RÈGLES STRICTES)
// ============================================================

export interface ScoringResult {
  score_global: ScoringColor;
  criteres_rouges: string[];
  criteres_oranges: string[];
  criteres_verts: string[];
  criteres_informatifs: string[];
  explication: string;
  scores_blocs: {
    entreprise: ScoringColor;
    devis: ScoringColor;
    securite: ScoringColor;
    contexte: "INFORMATIF";
  };
}
