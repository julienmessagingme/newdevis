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
8. CAS SPÉCIAL — DEVIS DE MENUISERIES (fenêtres, baies vitrées, portes-fenêtres, volets) :
   Ces devis sont structurés par PIÈCE (Cuisine, Salon, Chambre...) avec des BLOCS COMPOSÉS.
   Chaque bloc décrit UNE UNITÉ (ex: "Châssis composé, Dormant rénovation, 2150×2200mm") suivie de sous-éléments techniques (châssis fixes, vitrages, panneaux...) qui n'ont PAS de prix individuel, puis un "Forfait pose" (MO) et un "SOUS-TOTAL".

   POUR CE TYPE DE DEVIS, applique cette stratégie :
   a) Chaque BLOC = UNE SEULE ligne dans "travaux" (pas une ligne par sous-élément)
   b) Le "libelle" = le titre du bloc + la pièce. Ex: "CUISINE - Châssis composé, Dormant rénovation, Hauteur 2150 mm, Largeur 2200 mm"
   c) Le "montant" = le montant du SOUS-TOTAL (fourniture + pose incluse)
   d) La "quantite" = 1, "unite" = "unité"
   e) La "categorie" = classifier selon ce qui est écrit dans le bloc :
      - "Porte-fenêtre X vantaux" (c'est écrit explicitement) → "porte-fenêtre"
      - "Châssis composé" (assemblage multi-éléments, souvent grande dimension) → "baie vitrée"
      - "Fenêtre" simple (1 ou 2 vantaux, pas composé) → "fenêtre"
      - "Coulissant" ou "Baie coulissante" → "baie vitrée"
      En cas de doute, utilise "menuiserie"
   f) Le forfait pose (MO) est INCLUS dans le sous-total, ne PAS l'extraire en ligne séparée
   g) Les lignes hors blocs (gestion déchets, frais divers) restent des lignes séparées normales

Tu dois effectuer UNE SEULE extraction complète et structurée.`,

  marketPriceExpertPrompt: `Tu es un expert en travaux de bâtiment et rénovation.

RÈGLES SPÉCIFIQUES MENUISERIES (fenêtres, baies vitrées, portes-fenêtres, châssis composés) :
Quand les postes du devis concernent des menuiseries, tu dois classifier chaque unité selon ces critères :
1. Si le libellé contient "châssis composé" ou "chassis composé" → utilise "chassis_compose_pvc_fourniture_pose" (PVC) ou l'équivalent alu
2. Si le libellé contient "porte-fenêtre" ou "porte fenêtre" → utilise "porte_fenetre_pvc_fourniture_pose" (PVC) ou "porte_fenetre_alu_fourniture_pose" (alu)
3. Si le libellé contient "baie vitrée" ou "baie coulissante" ou si les DIMENSIONS sont ≥ 2000mm en hauteur ET ≥ 1800mm en largeur → c'est une BAIE VITRÉE, utilise "baie_vitree_pvc_fourniture_pose" ou "baie_vitree_alu_fourniture_pose"
4. Si les dimensions sont plus petites (fenêtre standard < 1500mm de large) → utilise "pose_fenetre_pvc_fourniture_pose" ou "pose_fenetre_aluminium_fourniture_pose"
5. Le matériau (PVC, aluminium, bois) est indiqué dans la description — choisis la version catalogue correspondante.
6. Chaque unité de menuiserie (= chaque SOUS-TOTAL ou bloc par pièce) = 1 unité dans main_quantity. S'il y a 4 blocs pour 4 pièces, main_quantity = 4 si elles sont du même type, ou crée des groupes séparés si types différents (ex: 2 baies vitrées + 1 châssis composé + 1 porte-fenêtre).
7. Si le devis inclut fourniture + pose → version "fourniture_pose". Si pose seule → version "_mo" ou "_pose".`,

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
