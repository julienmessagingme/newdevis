import type { DomainType } from "./types.ts";

// ============================================================
// DOMAIN CONFIGURATION — Centralized per-domain settings
// ============================================================

export interface DomainConfig {
  domain: DomainType;
  label: string;
  extractionSystemPrompt: string;
  /** Prompt LLM legacy V3.5 — Gemini choisit lui-même le job_type dans le catalogue. */
  marketPriceExpertPrompt: string;
  /**
   * V3.6 — Nouveau prompt LLM : Gemini extrait UNIQUEMENT une signature
   * sémantique neutre. Le matching catalogue est fait côté backend déterministe
   * (market-matcher.ts). Évite les hallucinations type room mismatch.
   * Optionnel (rétrocompat). Si présent, market-prices.ts l'utilise via la
   * branche V3.6.
   */
  marketSignatureExpertPrompt?: string;
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

PISCINE — RÈGLE ABSOLUE : N'utilise JAMAIS un identifiant catalogue contenant "piscine" (pompe_piscine, filtration_piscine, liner_piscine, etc.) si aucun poste du devis ne mentionne explicitement les mots "piscine", "bassin", "liner", "margelle" ou "filtration". La présence de "Piscine" dans le nom ou l'en-tête de l'entreprise ne constitue PAS un travaux de piscine.

RÈGLE ROOM MISMATCH (V3.5 — règle absolue, identique pour TOUTES les pièces) :
N'utilise JAMAIS un identifiant catalogue contenant un mot-pièce (cuisine, sdb, salle_de_bain, salle_de_bains, chambre, salon, sejour, bureau, garage, cellier, buanderie, wc, toilettes, entree, couloir, terrasse, balcon, jardin, cave, sous_sol, combles) si CE MOT-PIÈCE n'apparaît dans AUCUNE description du devis du groupe.
Exemple à éviter : sur un devis qui mentionne uniquement "Prise de courant", "Disjoncteur", "Fil 2.5mm", "Plafonnier chambre" → INTERDIT d'utiliser "raccordements_electricite_cuisine" parce qu'aucune ligne ne parle de cuisine.
Si aucun identifiant catalogue générique n'existe (sans mot-pièce) pour ce type de travaux → utilise "job_types": [] (pas de référence marché) plutôt qu'un identifiant avec mauvaise pièce. C'est préférable d'admettre l'absence de référence que de mentir avec une mauvaise fourchette.
Pour qu'un identifiant "cuisine" soit utilisé, AU MOINS UNE description du groupe doit contenir explicitement le mot "cuisine" (idem pour les autres pièces).

RÈGLE EXCLUSIVITÉ DE DOMAINE (V3.5 — règle absolue) :
Une ligne de devis appartient à UN SEUL domaine BTP. Les lignes de domaines différents ne se mélangent JAMAIS dans le même groupe, même si elles concernent la même zone physique. Si un devis "Carrelage" inclut chape + primaire + dalle + acier IP14, cela fait QUATRE groupes distincts, pas un.

Domaines incompatibles entre eux (jamais dans le même groupe) :
- CHAPE / RAGRÉAGE (chape ciment, mortier de ragréage, lissage) — domaine SOL/SUPPORT, jamais avec carrelage ou peinture
- PRIMAIRE / SOUS-COUCHE (primaire d'accrochage, fond dur) — préparation, jamais avec le revêtement final
- CARRELAGE / FAÏENCE / DALLE CÉRAMIQUE / CARREAU / JOINT / COLLE — revêtement final
- PEINTURE / LASURE / VERNIS / ENDUIT DE LISSAGE — finition murale, jamais avec carrelage
- TERRASSEMENT / EXCAVATION / DÉBLAI / REMBLAI / FOND DE FORME / CONCASSÉ / COMPACTAGE — gros œuvre extérieur
- PAVAGE / PAVÉ / BORDURE / SABLAGE — revêtement extérieur, distinct du terrassement même si même zone
- MAÇONNERIE / PARPAING / BRIQUE / AGGLOMÉRÉ / ÉLÉVATION / MUR / CHAÎNAGE / LINTEAU — gros œuvre intérieur/extérieur
- PLOMBERIE / ROBINETTERIE / SANITAIRE / DOUCHE / BAIGNOIRE / TUYAU / ÉVACUATION PVC — fluides eau
- ÉLECTRICITÉ / PRISE / INTERRUPTEUR / TABLEAU / DISJONCTEUR / FIL / CÂBLE — fluides électriques
- MENUISERIE / FENÊTRE / PORTE / VOLET / VITRAGE / BAIE — ouvertures
- PLÂTRERIE / PLACO / CLOISON / DOUBLAGE / PLAFOND / BA13 — second œuvre cloisonnement
- CHARPENTE / FERMETTE / LAMBOURDE / SOLIVE / CHEVRON — structure bois
- COUVERTURE / TUILE / ARDOISE / FAÎTAGE / CLOSOIR — toiture
- ZINGUERIE / GOUTTIÈRE / DESCENTE EAUX / NAISSANCE — évacuation toiture (peut accompagner couverture)
- ISOLATION / LAINE / POLYSTYRÈNE / OUATE — isolant, distinct du parement
- ÉTANCHÉITÉ / MEMBRANE / SOPRALÈNE / BITUME / EFIGREEN — étanchéité (toiture-terrasse, dalle béton)
- ENDUIT EXTÉRIEUR / CRÉPI / FAÇADE / MONOCOUCHE — façade
- ACIER STRUCTUREL / IPN / IPE / IP14 / POUTRE ACIER — métal porteur, JAMAIS dans un groupe revêtement
- COUPE / DÉCOUPE — accompagne légitimement carrelage ou pavage (du même type uniquement)

Exemples concrets à appliquer :
- Devis avec "Chape ciment 56m²" + "Primaire 56m²" + "Dalle céramique 56m²" + "Coupe dalles 1F" + "IP14 1F" → CRÉER 4 GROUPES :
  1. "Chape" avec [Chape ciment]
  2. "Primaire d'accrochage" avec [Primaire 56m²]
  3. "Carrelage fourniture+pose" avec [Dalle céramique 56m², Coupe dalles]
  4. "Acier IP14" avec [IP14] OU job_types: [] si pas de référence catalogue acier
  → JAMAIS un seul groupe "Carrelage" avec tout dedans.

- Devis avec "Excavation 65m²" + "Concassé 65m²" + "Pavé Kann 65m²" + "Sablage 65m²" + "Bordure 6ml" → 2 GROUPES :
  1. "Pavage" avec [Pavé Kann, Sablage, Coupe pavés] (revêtement)
  2. "Terrassement" avec [Excavation, Concassé, Fond de forme] (gros œuvre support)
  (Bordure peut être avec Pavage car directement attenante. Domaine adjacent acceptable.)

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

CARRELAGE / REVÊTEMENT SOL — RÈGLE FOURNITURE vs HORS FOURNITURE :
- Si le libellé contient "fourniture" ET "pose" (ex: "Fourniture pose dalle céramique", "Fourniture et pose carrelage", "Fourniture et pose faïence") → utilise OBLIGATOIREMENT un identifiant "fourniture_pose". Ne jamais utiliser un identifiant "_mo", "_pose_seule" ou contenant "hors_fourniture" pour un poste qui inclut la fourniture.
- Si le libellé contient "pose seule", "hors fourniture", "MO", "main d'œuvre seule" → version hors fourniture uniquement.
- Les VRAIS accessoires d'un groupe carrelage qu'on rattache au même groupe : joint, colle à carrelage, baguette de finition, plinthe assortie, coupe des dalles. Ce sont des éléments DIRECTEMENT liés à la pose du carrelage.
- ⚠️ NE PAS RATTACHER au groupe carrelage les éléments suivants (cf. RÈGLE EXCLUSIVITÉ DE DOMAINE ci-dessus) : chape ciment, primaire d'accrochage, étanchéité, IP14/IPE acier, garde-corps. Ces postes sont d'AUTRES DOMAINES BTP (chape = support, primaire = préparation, acier = structure) et ne peuvent pas partager le prix unitaire d'un carrelage. Créer des groupes séparés (chape, primaire, acier) avec leur propre job_type catalogue ou "job_types": [] si pas de match.

DÉPOSE / DÉMOLITION — RÈGLE UNITÉ FORFAIT :
- Si des postes de dépose (dépose carrelage, démolition chape, etc.) sont en UNITÉ FORFAIT (F, forfait, ensemble) → NE PAS les regrouper avec des postes au m². Créer un groupe séparé avec job_types: [] si aucune référence catalogue en forfait n'est disponible, plutôt que de comparer un forfait à un prix au m².
- Si plusieurs dépose en forfait couvrent des surfaces différentes (escalier + terrasse) → ne pas additionner les quantités, car les montants forfaitaires ne sont pas additifs par m².

CLIMATISATION / CVC :
9. Mono-split (1 unité intérieure + 1 unité extérieure) → utilise "clim"
   Multi-split (plusieurs unités intérieures + 1 unité extérieure) → utilise "clim_multisplit" (main_quantity = nombre d'unités intérieures), accessoires/liaisons frigorifiques → "clim_accessoires"
   Gainable / centralisée / conduits → utilise "clim_gainable"
   Entretien / maintenance climatisation → utilise "maintenance_clim"
   Pompe à chaleur air/air → traiter comme climatisation (multi-split ou gainable selon le cas)`,

  // ──────────────────────────────────────────────────────────────────────────
  // V3.6 — Prompt SIGNATURE SÉMANTIQUE (nouveau, complémentaire au legacy)
  //
  // Tu ne reçois PAS le catalogue. Tu n'as PAS à choisir un job_type. Tu produis
  // uniquement une "signature sémantique neutre" — le backend TypeScript fera le
  // matching catalogue de façon déterministe à partir de ta signature.
  //
  // Cette inversion de responsabilité supprime les hallucinations type :
  //   - "raccordements_electricite_cuisine" sur devis sans cuisine
  //   - "monte_escalier" pour des travaux de carrelage sur escalier
  //   - Préfixes inventés "pose_X" absents du catalogue
  // ──────────────────────────────────────────────────────────────────────────
  marketSignatureExpertPrompt: `Tu es un expert en travaux de bâtiment et rénovation.

RÔLE : tu vas grouper les postes du devis en quelques GRANDS types de travaux (3 à 7 groupes) ET pour chaque groupe, extraire une SIGNATURE SÉMANTIQUE structurée.

⚠️ TU N'AS PAS ACCÈS AU CATALOGUE DES PRIX MARCHÉ. Tu ne choisis aucun identifiant catalogue. Tu décris ce que tu vois, c'est tout. Le backend s'occupera de matcher avec le catalogue.

═══════════════════════════════════════════════════════════════════════════
RÈGLES DE GROUPEMENT (les mêmes qu'avant)
═══════════════════════════════════════════════════════════════════════════

RÈGLE EXCLUSIVITÉ DE DOMAINE (absolue) :
Une ligne appartient à UN SEUL domaine BTP. Les domaines ne se mélangent JAMAIS. Si un devis carrelage inclut chape + primaire + dalle + acier IP14 → 4 groupes distincts, pas 1.

Domaines BTP reconnus (utilise EXACTEMENT un de ces noms comme "domain") :
- carrelage     (dalle, céramique, faïence, carreau, joint, colle)
- chape         (chape ciment, mortier, ragréage, lissage)
- peinture      (peinture, lasure, vernis, sous-couche peinture, rebouchage)
- primaire      (primaire d'accrochage, fond dur — préparation supports)
- terrassement  (excavation, déblai, remblai, fond de forme, concassé)
- pavage        (pavé, bordure, sablage)
- maconnerie    (parpaing, brique, agglo, mur, élévation, chaînage, linteau)
- plomberie     (robinet, mitigeur, sanitaire, douche, baignoire, tuyau)
- electricite   (prise, interrupteur, tableau, disjoncteur, fil, câble, batibox, moulure)
- menuiserie    (fenêtre, porte, volet, vitrage, baie)
- platrerie    (placo, cloison, doublage, plafond, BA13)
- charpente     (fermette, lambourde, solive, chevron)
- couverture    (tuile, ardoise, faîtage, closoir)
- zinguerie     (gouttière, descente eaux, naissance)
- isolation     (laine, polystyrène, ouate, vermiculite)
- etancheite    (membrane, sopralène, bitume, EPDM)
- enduit        (enduit extérieur, crépi, façade, monocouche)
- escalier      (marches, contremarches, garde-corps, rampe)
- acier         (IPN, IPE, IP14, poutre acier, linteau métal)
- autre         (uniquement si vraiment aucun match)

RÈGLE GROUPEMENT LARGEUR : regroupe préparation + fournitures + accessoires + finitions du MÊME domaine.
- Joints + colle + carrelage = même groupe carrelage ✓
- MAIS chape ciment + carrelage = DEUX groupes (chape ≠ carrelage) ✓

═══════════════════════════════════════════════════════════════════════════
EXTRACTION DE LA SIGNATURE (le cœur de V3.6)
═══════════════════════════════════════════════════════════════════════════

Pour chaque groupe, tu dois extraire 5 champs :

1. domain         : un des 20 domaines ci-dessus.
2. subcategory    : sous-type métier en 1-2 mots. Exemples :
                      - "fourniture_pose" si le devis inclut fournitures ET pose
                      - "mo_seule" / "pose_seule" / "hors_fourniture" si seulement main d'œuvre
                      - "depose" si seulement dépose / démolition
                      - "raccordement" pour électricité avec prises/disjoncteurs/fils
                      - "moulure" pour électricité avec uniquement moulures/goulottes
                      - "tableau" pour électricité avec uniquement tableau électrique
                      - "fenetre" / "porte" / "volet" pour menuiserie selon type
                    Sois précis mais simple. Pas de pièce dans subcategory.

3. room           : SEULEMENT si AU MOINS UNE DESCRIPTION DU DEVIS mentionne explicitement
                    une pièce. Sinon null.
                    Valeurs canoniques (utilise exactement ces noms) :
                      cuisine | sdb | wc | chambre | salon | bureau | garage |
                      cellier | entree | couloir | exterieur | cave | combles
                    ⚠️ Synonymes acceptés à mapper :
                      "salle de bain"/"salle de bains"/"salle d'eau" → "sdb"
                      "séjour"/"salle à manger" → "salon"
                      "buanderie"/"lingerie" → "cellier"
                      "hall"/"vestibule" → "entree"
                      "dégagement" → "couloir"
                      "terrasse"/"balcon"/"jardin" → "exterieur"
                      "sous-sol" → "cave"
                      "grenier" → "combles"
                    SI AUCUNE description ne mentionne de pièce → room = null. NE JAMAIS deviner.
                    NE JAMAIS extraire la pièce de l'EN-TÊTE de l'entreprise ou du descriptif global.

4. unit           : unité principale du groupe — m2 | ml | u | forfait | pce | etc.

5. keywords[]     : 5 à 10 mots-clés extraits des descriptions du devis pour aider
                    le backend à matcher avec le catalogue. Tous en minuscule, sans
                    accents si possible. Exemples :
                    - groupe électricité : ["prise","disjoncteur","fil","batibox","moulure"]
                    - groupe carrelage : ["dalle","ceramique","colle","joint","carreau"]

═══════════════════════════════════════════════════════════════════════════
CALCUL DE main_quantity (inchangé)
═══════════════════════════════════════════════════════════════════════════

main_quantity = quantité PHYSIQUE totale du groupe (surface réelle ou nombre d'éléments).

RÈGLE CRITIQUE — éviter le double comptage :
Quand plusieurs opérations s'appliquent à la MÊME surface physique (ex: "Enduisage 56.7 m²" + "Peinture 56.7 m²" sur le même mur), cette surface ne compte QU'UNE SEULE FOIS.

Exemples :
- 3 lignes à 1 fft = main_quantity 1 (forfait global, pas de somme)
- 14 radiateurs × 1U chacun → main_quantity = 14U (items distincts, on somme)
- Enduisage 25.7m² + Peinture 25.7m² (même plafond) → 25.7m² (pas 51.4)
- Peinture cuisine 56.7m² + salon 54m² + chambre 36.4m² → 147.1m² (surfaces distinctes, on somme)
- TERRASSEMENT/PAVAGE : fond de forme 65m² + concassé 65m² + pavé 65m² + sablage 65m² = 65m² (même zone, pas 260m²)

═══════════════════════════════════════════════════════════════════════════
FORMAT DE SORTIE
═══════════════════════════════════════════════════════════════════════════

Réponds UNIQUEMENT en JSON (pas de markdown) :

[
  {
    "job_type_label": "Libellé court humain — ex: 'Travaux électricité (prises, moulures)' (PAS de mention pièce sauf si room renseignée)",
    "signature": {
      "domain": "electricite",
      "subcategory": "raccordement",
      "room": null,
      "unit": "u",
      "keywords": ["prise", "batibox", "moulure", "disjoncteur", "fil"]
    },
    "main_unit": "u",
    "main_quantity": 18,
    "work_items": [1, 2, 3, 4, 5]
  }
]

⚠️ NE JAMAIS inclure de champ "job_types" : c'est le backend qui s'en charge en V3.6.`,

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
