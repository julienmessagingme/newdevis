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
   RÈGLE CRITIQUE pour "categorie" : Ce champ doit refléter UNIQUEMENT le type de travaux décrit dans la ligne du devis (ex: "pavage", "carrelage", "chape", "terrassement", "maçonnerie"). NE JAMAIS déduire la catégorie depuis le nom commercial, le slogan ou la liste de services de l'entreprise visibles dans l'en-tête. Exemple : une entreprise "Aménagement extérieur / Piscine - Mur de soutènement" qui facture du pavage de cour → categorie = "pavage", pas "piscine". Une entreprise "Électricité / Plomberie" qui facture de la peinture → categorie = "peinture", pas "electricite".
5. Extrais TOUS les postes de travaux du devis, sans exception. Inclus chaque ligne individuelle (fournitures, main d'œuvre, accessoires, frais divers, transport, etc.). EXCEPTION : voir règle 8 pour les devis de menuiseries.
6. Pour le champ "libelle" de chaque travail : COPIE MOT POUR MOT le texte exact tel qu'il apparaît sur le devis. NE REFORMULE PAS, NE RÉSUME PAS, NE TRADUIS PAS. Si le devis dit "Fourniture et pose baguette PVC", écris exactement "Fourniture et pose baguette PVC".
7. Réponds UNIQUEMENT avec un JSON valide et COMPLET. Ne tronque pas la réponse.
8. **PRIORITAIRE** — DEVIS DE MENUISERIES avec structure BLOC/SOUS-TOTAL (fenêtres, baies vitrées, portes-fenêtres, châssis composés, volets) :
   DÉTECTION STRICTE — N'applique cette règle QUE si les DEUX conditions suivantes sont vraies :
   a) Le devis est organisé en blocs par PIÈCE (CUISINE, SALON...) ou par élément, où les lignes internes sont des descriptions techniques SANS colonne PU.HT propre.
   b) Chaque bloc se termine par un SOUS-TOTAL explicite (libellé "SOUS-TOTAL" ou ligne récapitulative = fourniture + pose).
   ⚠️ Si chaque ligne du devis a sa propre colonne Qte + U + PU.HT + Total HT (un prix par article) → utilise l'extraction STANDARD (règle 5). Ne te base PAS sur le nom de l'entreprise pour décider.

   Structure typique d'un bloc menuiserie avec SOUS-TOTAL (seul cas où cette règle s'applique) :
   - Titre : "Châssis composé, Dormant rénovation, Hauteur 2150 mm, Largeur 2200 mm" + prix fourniture
   - Sous-éléments techniques (châssis fixes, vitrages, panneaux...) → IGNORER, ce sont des descriptions
   - "MO Forfait pose" → IGNORER comme ligne séparée
   - "SOUS-TOTAL : ..." → C'EST LE MONTANT À PRENDRE (fourniture + pose)

   RÈGLES ABSOLUES pour ce type de devis :
   a) Chaque ligne SOUS-TOTAL = UNE SEULE ligne dans "travaux". NE PAS extraire les lignes de fourniture ou de pose séparément.
   b) Le "libelle" = la PIÈCE + le titre du SOUS-TOTAL. Ex: "CUISINE - Châssis composé, Dormant rénovation, Hauteur 2150 mm, Largeur 2200 mm"
   c) Le "montant" = le montant du SOUS-TOTAL (PAS la fourniture seule, PAS la pose seule, mais le SOUS-TOTAL qui additionne les deux)
   d) La "quantite" = 1, "unite" = "unité"
   e) La "categorie" = classifier selon le TITRE du bloc :
      - Contient "Porte-fenêtre" → "porte-fenêtre"
      - Contient "Châssis composé" → "châssis composé"
      - Contient "Coulissant" ou "Baie" → "baie vitrée"
      - Contient "Fenêtre" (sans "Porte-") → "fenêtre"
      En cas de doute → "menuiserie"
   f) Les lignes HORS blocs (gestion déchets, frais divers, etc.) restent des lignes séparées normales
   g) VÉRIFICATION : le total de tes lignes extraites doit correspondre au MONTANT TOTAL HT du devis. Si ce n'est pas le cas, tu as probablement extrait des lignes internes au lieu des SOUS-TOTAUX.

9. **CHAMPS COMPLÉMENTAIRES** — Détecte et indique dans le JSON racine :
   - "tva_non_applicable": true si le devis mentionne "TVA non applicable" ou "Article 293B" ou "auto-entrepreneur" sans TVA affichée. false sinon. null si ambiguïté.
   - "devis_manuscrit": true si le document est entièrement ou majoritairement manuscrit (rempli à la main, pas dactylographié). false si tapé/imprimé.
   - "materiaux_fournis_client": true si le devis précise que les matériaux seront fournis par le client (formulations : "matériaux fournis par le client", "MO uniquement", "main d'œuvre seule", "pose seule - fournitures client"). false sinon.

10. Extrait la date de validité du devis ("date_validite" dans "dates") si mentionnée (ex: "valable jusqu'au XX/XX/XXXX", "validité jusqu'au", "devis valable jusqu'au"). Format YYYY-MM-DD. null si non mentionnée.

Tu dois effectuer UNE SEULE extraction complète et structurée.`,

  marketPriceExpertPrompt: `Tu es un expert en travaux de bâtiment et rénovation.

RÈGLE ABSOLUE — EN-TÊTE ENTREPRISE : La raison sociale, le slogan ou la liste de services de l'entreprise dans l'en-tête du devis (ex: "Aménagement extérieur / Piscine", "Électricité / CVC", "Spécialiste isolation") ne constituent PAS des travaux. Analyse UNIQUEMENT les postes listés dans la section POSTES DU DEVIS. Si l'en-tête mentionne "Piscine" mais que les lignes du devis décrivent du pavage, de la chape et du carrelage → les groupes doivent refléter pavage/carrelage, JAMAIS pompe/filtre/piscine.

ESCALIER vs MONTE-ESCALIER : Un escalier en maçonnerie/carrelage (dépose carrelage, chape ciment, dalle céramique, primaire d'accrochage, coupe dalles, ip14) = travaux de finition sur des marches → utiliser l'identifiant carrelage le plus adapté (carrelage_sol, carrelage_escalier ou similaire). "Monte-escalier" désigne un équipement mécanique d'élévation (stairlift) — ne jamais l'utiliser pour des travaux de maçonnerie ou carrelage sur escalier.

RÈGLE GÉNÉRALE : Pour tous les postes du devis, sélectionne l'identifiant du CATALOGUE qui correspond le mieux. Les règles ci-dessous sont des précisions pour des cas ambigus uniquement — elles ne remplacent pas la correspondance catalogue pour les autres types de travaux (électricité, plomberie, peinture, maçonnerie, etc.).

PRÉCISIONS PAR TYPE DE TRAVAUX (cas ambigus uniquement) :

MENUISERIES (fenêtres, baies vitrées, portes-fenêtres, châssis composés) :
1. Si le libellé contient "châssis composé" ou "chassis composé" → utilise "chassis_compose_pvc_fourniture_pose" (PVC) ou l'équivalent alu
2. Si le libellé contient "porte-fenêtre" ou "porte fenêtre" → utilise "porte_fenetre_pvc_fourniture_pose" (PVC) ou "porte_fenetre_alu_fourniture_pose" (alu)
3. Si le libellé contient "baie vitrée" ou "baie coulissante" ou si les DIMENSIONS sont ≥ 2000mm en hauteur ET ≥ 1800mm en largeur → c'est une BAIE VITRÉE, utilise "baie_vitree_pvc_fourniture_pose" ou "baie_vitree_alu_fourniture_pose"
4. Si les dimensions sont plus petites (fenêtre standard < 1500mm de large) → utilise "pose_fenetre_pvc_fourniture_pose" ou "pose_fenetre_aluminium_fourniture_pose"
5. Le matériau (PVC, aluminium, bois) est indiqué dans la description — choisis la version catalogue correspondante.
6. Calcul de main_quantity selon la structure du devis :
   — Devis avec SOUS-TOTAUX par bloc : chaque bloc = 1 unité. S'il y a 4 blocs du même type → main_quantity = 4.
   — Devis avec lignes individuelles Qte × PU.HT (chaque article a son propre prix) : SOMME toutes les quantités du groupe.
     Exemple : [550x460 : 1U] + [2600x2210 : 1U] + [1400x2210 : 2U] + [700x700 : 2U] + [600x1260 : 3U] + [1200x1810 : 3U] + [420x960 : 1U] = 13 fenêtres → main_quantity = 13. Ne PAS mettre 1.
     La ligne "Pose de l'ensemble" (forfait global) ne compte pas dans les unités de menuiserie.
     Les eco-participations (lignes à 2-4€ l'unité) ne comptent pas dans main_quantity.
   — Groupes distincts : si le devis contient à la fois des fenêtres standard ET des baies vitrées (≥1800mm×2000mm) ET des portes-fenêtres → crée des groupes séparés avec leur quantité respective.
7. Si le devis inclut fourniture + pose → version "fourniture_pose". Si pose seule → version "_mo" ou "_pose".

ESCALIER :
8. "Fabrication et pose d'un escalier" (fourniture + main d'œuvre) ne se compare PAS à "pose_escalier_mo" (main d'œuvre seule). Si le devis inclut la fabrication sur-mesure, utilise job_types: [] (pas de référence marché fiable) plutôt qu'une comparaison incorrecte.

CLIMATISATION / CVC :
9. Mono-split (1 unité intérieure + 1 unité extérieure) → utilise "clim"
   Multi-split (plusieurs unités intérieures + 1 unité extérieure) → utilise "clim_multisplit" (main_quantity = nombre d'unités intérieures), accessoires/liaisons frigorifiques → "clim_accessoires"
   Gainable / centralisée / conduits → utilise "clim_gainable"
   Entretien / maintenance climatisation → utilise "maintenance_clim"
   Pompe à chaleur air/air → traiter comme climatisation (multi-split ou gainable selon le cas)`,

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
