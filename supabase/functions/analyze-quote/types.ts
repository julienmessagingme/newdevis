// ============ TYPE DEFINITIONS ============

export type ScoringColor = "VERT" | "ORANGE" | "ROUGE";
export type DocumentType = "devis_travaux" | "facture" | "diagnostic_immobilier" | "autre";

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
  };
  dates: {
    date_devis: string | null;
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

export interface VerificationResult {
  entreprise_immatriculee: boolean | null;
  entreprise_radiee: boolean | null;
  procedure_collective: boolean | null;
  date_creation: string | null;
  anciennete_annees: number | null;
  nom_officiel: string | null;
  adresse_officielle: string | null;
  ville_officielle: string | null;
  lookup_status: "ok" | "not_found" | "error" | "skipped" | "no_siret";
  finances: FinancialRatios[];
  finances_status: "ok" | "not_found" | "error" | "skipped";

  iban_verifie: boolean;
  iban_valide: boolean | null;
  iban_pays: string | null;
  iban_code_pays: string | null;
  iban_banque: string | null;

  rge_pertinent: boolean;
  rge_trouve: boolean;
  rge_qualifications: string[];

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
