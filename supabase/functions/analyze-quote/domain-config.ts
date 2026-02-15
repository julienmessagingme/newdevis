import type { DomainType } from "./types.ts";

// ============================================================
// DOMAIN CONFIGURATION — Centralized per-domain settings
// ============================================================

export interface DomainConfig {
  domain: DomainType;
  label: string;
  extractionSystemPrompt: string;
  marketPriceExpertPrompt: string;
  insuranceChecks: { primary: string; secondary?: string[] };
  certifications: string[];
  insuranceLabels: { primary: string; secondary?: string };
  blocksVisible: string[];
}

// ---- Travaux domain (current production config) ----

const TRAVAUX_CONFIG: DomainConfig = {
  domain: "travaux",
  label: "Travaux / BTP",

  extractionSystemPrompt: `Tu es VerifierMonDevis.fr, un outil d'aide à la décision à destination des particuliers.

Tu n'évalues PAS les artisans.
Tu ne portes AUCUN jugement de valeur.
Tu fournis des indicateurs factuels, pédagogiques et vérifiables.

RÈGLES D'EXTRACTION:
1. N'invente AUCUNE information. Si une donnée n'est pas visible, retourne null.
2. Pour le mode de paiement:
   - "espèces" SEULEMENT si les mots "espèces", "cash", "comptant en espèces" sont explicitement présents.
   - Si "chèque", "virement", "carte bancaire", "CB", "à réception", "à la livraison" sont mentionnés, les inclure.
   - Si un IBAN ou RIB est présent, le mode de paiement INCLUT "virement".
   - Ne jamais déduire "espèces" par défaut.
3. Pour les assurances: true si clairement mentionnée, false si absente, null si doute.
4. Pour les travaux: identifier la CATÉGORIE MÉTIER principale même si un produit spécifique/marque est mentionné.
5. Extrais TOUS les postes de travaux du devis, sans exception. Inclus chaque ligne individuelle (fournitures, main d'œuvre, accessoires, frais divers, transport, etc.).
6. Pour le champ "libelle" de chaque travail : COPIE MOT POUR MOT le texte exact tel qu'il apparaît sur le devis. NE REFORMULE PAS, NE RÉSUME PAS, NE TRADUIS PAS. Si le devis dit "Fourniture et pose baguette PVC", écris exactement "Fourniture et pose baguette PVC".
7. Réponds UNIQUEMENT avec un JSON valide et COMPLET. Ne tronque pas la réponse.

Tu dois effectuer UNE SEULE extraction complète et structurée.`,

  marketPriceExpertPrompt: `Tu es un expert en travaux de bâtiment et rénovation.`,

  insuranceChecks: {
    primary: "assurance_decennale",
    secondary: ["assurance_rc_pro"],
  },

  certifications: ["RGE", "QUALIBAT"],

  insuranceLabels: {
    primary: "Assurance décennale",
    secondary: "RC Pro",
  },

  blocksVisible: ["entreprise", "devis", "prix_marche", "securite", "contexte", "urbanisme"],
};

// ---- Auto domain (placeholder for future) ----

const AUTO_CONFIG: DomainConfig = {
  domain: "auto",
  label: "Automobile / Garage",

  extractionSystemPrompt: TRAVAUX_CONFIG.extractionSystemPrompt,
  marketPriceExpertPrompt: `Tu es un expert en réparation automobile.`,

  insuranceChecks: {
    primary: "assurance_rc_pro",
  },

  certifications: [],

  insuranceLabels: {
    primary: "RC Pro",
  },

  blocksVisible: ["entreprise", "devis", "prix_marche", "securite"],
};

// ---- Dentaire domain (placeholder for future) ----

const DENTAIRE_CONFIG: DomainConfig = {
  domain: "dentaire",
  label: "Dentaire",

  extractionSystemPrompt: TRAVAUX_CONFIG.extractionSystemPrompt,
  marketPriceExpertPrompt: `Tu es un expert en tarification dentaire.`,

  insuranceChecks: {
    primary: "assurance_rc_pro",
  },

  certifications: [],

  insuranceLabels: {
    primary: "RC Pro",
  },

  blocksVisible: ["entreprise", "devis", "securite"],
};

// ---- Registry ----

const DOMAIN_CONFIGS: Record<DomainType, DomainConfig> = {
  travaux: TRAVAUX_CONFIG,
  auto: AUTO_CONFIG,
  dentaire: DENTAIRE_CONFIG,
};

export function getDomainConfig(domain: DomainType): DomainConfig {
  return DOMAIN_CONFIGS[domain] || DOMAIN_CONFIGS.travaux;
}
