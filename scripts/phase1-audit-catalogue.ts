#!/usr/bin/env tsx
/**
 * scripts/phase1-audit-catalogue.ts
 *
 * 🟢 REFONTE Phase 1.3 (2026-06-23) — Audit + pré-classement du catalogue
 *
 * Fetch les 911 entrées de `market_prices`, applique une classification
 * automatique par parsing du `label` (métier, nature_prix, gamme,
 * multiplicateur_couches), détecte les doublons, génère 3 fichiers :
 *
 *   docs/refonte/catalogue-classement/audit-911-raw.csv         (export brut)
 *   docs/refonte/catalogue-classement/audit-911-classified.csv  (avec mes propositions)
 *   docs/refonte/catalogue-classement/RAPPORT-AUDIT.md          (synthèse)
 *
 * USAGE :
 *   npx tsx scripts/phase1-audit-catalogue.ts
 *
 * ENV VARS REQUISES (.env à la racine du projet) :
 *   SUPABASE_URL (ou PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Le script ne MUTE PAS la DB — il fetch en lecture seule.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(ROOT, "docs", "refonte", "catalogue-classement");

// ──────────────────────────────────────────────────────────────────────────────
// .env loader (zéro dep)
// ──────────────────────────────────────────────────────────────────────────────
function loadEnv(): void {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

// 🟢 Phase 1.3.1 (2026-06-23) — Mode --from-csv
// Permet de lire le catalogue depuis un CSV exporté manuellement (Supabase
// Studio → Export → CSV) au lieu de fetcher via service_role. Utile quand
// la clé service_role n'est pas accessible (cas Julien possede la cle, pas Johan).
const FROM_CSV = process.argv.includes("--from-csv");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase: ReturnType<typeof createClient> | null = null;
if (!FROM_CSV) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Env vars manquantes. Requis dans .env :");
    console.error("   - SUPABASE_URL (ou PUBLIC_SUPABASE_URL)");
    console.error("   - SUPABASE_SERVICE_ROLE_KEY");
    console.error("");
    console.error("💡 Alternative : exporte le CSV depuis Supabase Studio + lance avec --from-csv");
    console.error("   1. Lance le SQL d'audit dans Supabase Studio");
    console.error("   2. Studio → Results → Export ▼ → CSV");
    console.error(`   3. Sauvegarde sous ${join(OUTPUT_DIR, "audit-911-raw.csv")}`);
    console.error("   4. Relance : npm run phase1:audit -- --from-csv");
    process.exit(1);
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────
interface MarketRow {
  id: number;
  job_type: string;
  label: string;
  unit: string | null;
  price_min_unit_ht: number | null;
  price_avg_unit_ht: number | null;
  price_max_unit_ht: number | null;
  fixed_min_ht: number | null;
  fixed_avg_ht: number | null;
  fixed_max_ht: number | null;
  variability_ratio: number | null;
  confidence: string | null;
  sample_size: number | null;
  source: string | null;
  notes: string | null;
  room_specific: boolean | null;
  required_room: string[] | null;
  generic_family: string | null;
}

interface Classified extends MarketRow {
  metier_propose: string;
  nature_prix_proposee: "pose_seule" | "fourniture_pose" | "fourniture_seule" | "non_applicable" | "inconnu";
  multiplicateur_couches_applicable: boolean;
  gamme_proposee: string;
  niveau_doute: "auto" | "doute" | "conflit" | "doublon_probable" | "inclassable";
  notes_auto: string[];
  commentaire_julien: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Règles de classement métier (mots-clés en priorité descendante)
// ──────────────────────────────────────────────────────────────────────────────
// L'ordre compte : la PREMIÈRE règle qui matche détermine le métier.
// Donc les règles spécifiques (forfait rénovation, diagnostic, cuisine) AVANT
// les règles générales (plomberie, peinture, etc.).

// 🟢 RAFFINEMENT v4 (2026-06-23) — 4 ajustements priorités pour réduire conflits
// Changements vs v3 :
//   1. maconnerie_structure MOVED UP avant menuiserie (création ouverture, IPN, mur porteur)
//   2. facade_ravalement MOVED UP avant peinture (ravalement façade → famille dédiée)
//   3. stores_occultation MOVED UP avant menuiserie (volets/stores → famille dédiée)
//   4. domotique_securite RESTREINTE aux vrais cas (KNX/MyHome/BUS/Z-Wave/Tahoma/Jeedom)
//      Les alarmes/caméras/interphones génériques restent en electricite.
// Cible : 163 conflits → ~70 conflits restants
const METIER_RULES: { name: string; rx: RegExp }[] = [
  // Forfaits rénovation globale — TRÈS spécifique, doit passer en premier
  { name: "forfait_renovation_globale", rx: /(?<![A-Za-zÀ-ÿ])(r[ée]novation\s+(compl[èe]te|sdb|salle\s+de\s+bain|[ée]lectric|[ée]nerg[ée]tique\s+globale|plomberie)|sdb\s+r[ée]novation|am[ée]nagement\s+(combles|sous[\s-]?sol)|sur[ée]l[ée]vation\s+maison|cr[ée]ation\s+(salle\s+de\s+bain|sdb|pi[èe]ce\s+suppl[ée]mentaire)|extension\s+(ma[çc]onnerie|ossature)|veranda)/i },

  // Diagnostics réglementaires
  { name: "diagnostic_reglementaire", rx: /(?<![A-Za-zÀ-ÿ])(diagnostics?|audit\s+[ée]nerg[ée]tique|[ée]tude\s+thermique|expertise|pack\s+diagnostics?|loi\s+(carrez|boutin)|dpe|erp|esris|re2020|[ée]tat\s+parasitaire)(?![A-Za-zÀ-ÿ])/i },

  // Ouvrages spécialisés
  { name: "ouvrages_piscine", rx: /(?<![A-Za-zÀ-ÿ])(piscine|spa|bassin\s+(natation|piscine)|filtration\s+piscine|local\s+technique\s+piscine|r[ée]gulation\s+ph|chlorinateur|[ée]lectrolyseur|sable\s+filtre|filtre\s+piscine)(?![A-Za-zÀ-ÿ])/i },
  { name: "ouvrages_photovoltaique", rx: /(?<![A-Za-zÀ-ÿ])(photovolta|panneaux?\s+(solaires?|photovolta)|onduleur|batterie\s+(de\s+stockage\s+)?solaire|kwc|installation\s+panneaux)(?![A-Za-zÀ-ÿ])/i },
  { name: "ouvrages_anc", rx: /(?<![A-Za-zÀ-ÿ])(anc|assainissement|fosse\s+septique|micro[\s-]?station|[ée]puration|phyto[ée]puration|tertre\s+d?[''']?infiltration|fili[èe]re\s+(filtre|[ée]pandage|tertre)|station\s+(de\s+)?relevage\s+(eaux\s+us[ée]es)?)(?![A-Za-zÀ-ÿ])/i },
  { name: "ouvrages_geothermie", rx: /(?<![A-Za-zÀ-ÿ])(g[ée]othermie|capteurs?\s+g[ée]othermiques?)(?![A-Za-zÀ-ÿ])/i },
  { name: "ouvrages_paysagisme", rx: /(?<![A-Za-zÀ-ÿ])(paysag|jardin|plantation|arbre|haie|engazon|gazon|pelouse|[ée]lagage|dessouchage|arrosage|pompe\s+arrosage|portique|aire\s+de\s+jeu)(?![A-Za-zÀ-ÿ])/i },
  { name: "ouvrages_ascenseur", rx: /(?<![A-Za-zÀ-ÿ])(ascenseur|monte[\s-]?(escalier|charge)|pmr|[ée]l[ée]vateur)(?![A-Za-zÀ-ÿ])/i },
  { name: "ouvrages_vrd", rx: /(?<![A-Za-zÀ-ÿ])(vrd|terrassements?|terrasses?\s+(bois|composite|dalles?|carrelage)|terrasses?(?=\s|$|\()|pav[ée]s?|enrob[ée]s?|all[ée]es?|caniveau|drainage\s+(p[ée]riph[ée]rique|fran[çc]ais|pied\s+de\s+mur)|drain\s+p[ée]riph[ée]rique|drainage|grave|stabilis[ée]|pr[ée]paration\s+(support\s+)?pavage|fraisage|[ée]tanch[ée]it[ée]\s+terrasse)(?![A-Za-zÀ-ÿ])/i },

  // Cuisine / agencement cuisine
  { name: "cuisine_agencement", rx: /(?<![A-Za-zÀ-ÿ])(cuisine|plan\s+de\s+travail|cr[ée]dences?|hottes?|four\s+encastr[ée]?|lave[\s-]?vaisselle|plaques?\s+(de\s+)?cuisson|[ée]viers?|[ée]lectrom[ée]nager|int[ée]gration\s+[ée]lectrom[ée]nager|placards?|dressings?|biblioth[èe]que|meuble\s+(double[\s-]?)?vasque|meuble\s+sdb)(?![A-Za-zÀ-ÿ])/i },

  // Chauffage
  { name: "chauffage", rx: /(?<![A-Za-zÀ-ÿ])(chauffage|chaudi[èe]res?|radiateurs?|plancher\s+chauffant|po[êe]les?|inserts?|granul[ée]s?|pellets?|tubage|ramonage|cumulus|chauffe[\s-]?eau|ballons?(\s+(ecs|thermodynamique))?|calorifugeage|plinthes?\s+chauffantes?|changement\s+ballon|purge[\s/]?(et\s+)?(r[ée]glage)?\s+radiateurs?|[ée]quilibrage\s+chauffage|robinets?\s+thermostatiques?|conduit\s+(de\s+)?fum[ée]e)(?![A-Za-zÀ-ÿ])/i },

  // CVC / ventilation
  { name: "cvc_ventilation", rx: /(?<![A-Za-zÀ-ÿ])(climatisation|\bclim\b|pac\b|pompe.*chaleur|vmc|ventilation|extracteur|gaine\s+ventilation|hotte\s+conduit|gaines?\s+vmc|r[ée]seau\s+gaines?)(?![A-Za-zÀ-ÿ])/i },

  // 🟢 v4 — Maçonnerie/structure MONTÉ avant menuiserie pour capturer
  // "Création ouverture porte", "IPN", "Mur porteur", etc. (gros œuvre prioritaire)
  { name: "maconnerie_structure", rx: /(?<![A-Za-zÀ-ÿ])(ma[çc]onneries?|b[ée]ton(?!\s+cir[ée])|briques?|parpaings?|dalles?\s+b[ée]ton|chape|gros[\s-]?(œuvre|oeuvre)|fondations?|semelles?\s+filantes?|murs?\s+(soutènement|porteur|brique|parpaing)|ipn|hea|micropieux|cuvelage|[ée]tanch[ée]it[ée]\s+(sous[\s-]?sol|sdb|salle\s+de\s+bain|toiture\s+plate)|syst[èe]me\s+[ée]tanch[ée]it[ée]|traitements?\s+(humidit[ée]|pont\s+thermique)|anti[\s-]?humidit[ée]|d[ée]samiantage|injection\s+r[ée]sine|reprise\s+en\s+sous[\s-]?(œuvre|oeuvre)|cr[ée]ation\s+(muret|ouverture|pi[èe]ce|alimentation\s+ext[ée]rieure)|ouverture\s+(mur\s+(porteur|non\s+porteur)|porte)|agglo\s+b[ée]ton|extension\s+(ma[çc]onnerie|ossature\s+bois)|moellons?|injection|drainages?|drain\s+p[ée]riph[ée]rique|reprise\s+fissures?\s+fa[çc]ade|r[ée]paration\s+fissure\s+fa[çc]ade)(?![A-Za-zÀ-ÿ])/i },

  // Toiture / couverture
  { name: "toiture_couverture", rx: /(?<![A-Za-zÀ-ÿ])(toiture|couverture|tuiles?|ardoises?|zinguerie|goutti[èe]re?s?|chevron|ch[ée]neau|fa[îi]tage|noue|shingle|bac\s+acier|membrane\s+epdm|[ée]tanch[ée]it[ée]\s+toiture|sous[\s-]?toiture|nettoyage\s+toiture|d[ée]moussage\s+toiture|hydrofuge\s+toiture|descente\s+(ep|eaux\s+pluviales)|regard\s+(ep|eaux\s+pluviales)|skylight|toiture\s+v[ée]g[ée]talis[ée]e|[ée]cran\s+sous[\s-]?toiture)(?![A-Za-zÀ-ÿ])/i },

  // 🟢 v4 — Façade / ravalement MONTÉ avant peinture (ravalement façade = famille dédiée)
  { name: "facade_ravalement", rx: /(?<![A-Za-zÀ-ÿ])(fa[çc]ade|ravalement|cr[ée]pi|nettoyage\s+fa[çc]ade)(?![A-Za-zÀ-ÿ])/i },

  // 🟢 v4 — Stores / occultation MONTÉ avant menuiserie (volets/stores = famille dédiée)
  { name: "stores_occultation", rx: /(?<![A-Za-zÀ-ÿ])(stores?(?!ur)|volets?(?:\s+(roulants?|battants?|alu|bois|pvc))?|tablier\s+volet|sangle|motorisation\s+volet|moteur\s+volet|claustra|abris?\s+voiture|carport|pergola|v[ée]randa)(?![A-Za-zÀ-ÿ])/i },

  // Menuiserie / vitrages (volets sortis → vont en stores_occultation)
  { name: "menuiserie_vitrages", rx: /(?<![A-Za-zÀ-ÿ])(menuiserie|portes?|fen[êe]tres?|baies?\s+vitr[ée]es?|escaliers?|velux|verri[èe]res?|v[ée]ri[èe]re|puits\s+de\s+lumi[èe]re|moustiquaires?|ch[âa]ssis|marquise|vitrage|cylindres?|poign[ée]es?|verrous?|serrures?|garde[\s-]?corps|bloc[\s-]?portes?|portails?|portillon|tabliers?|rampes?\s+bois|trappe\s+(d[''']?)?acc[èe]s)(?![A-Za-zÀ-ÿ])/i },

  // Métallerie / serrurerie (générique)
  { name: "metallerie_serrurerie", rx: /(?<![A-Za-zÀ-ÿ])(serrur|cl[ôo]tures?|grilles?|grillage|blindage)(?![A-Za-zÀ-ÿ])/i },

  // Plomberie / sanitaires
  { name: "plomberie_sanitaires", rx: /(?<![A-Za-zÀ-ÿ])(plomberie|plombier|wc|robinets?|mitigeurs?|sanitaires?|baignoires?|douches?|lavabos?|vasques?|s[èe]che[\s-]?serviettes?|adoucisseurs?|filtre\s+(anti[\s-]?calcaire|eau)|d[ée]bouchage|fuites?\s+(d[''']?)?eau|d[ée]tection\s+fuite|lave[\s-]?mains|pompe\s+(de\s+)?relevage|siphons?|canalisations?|colonne\s+(fonte|plomberie|de\s+douche)|alimentation\s+(eau|ext[ée]rieure|ef\/?ec)|cr[ée]ation\s+(arriv[ée]e\s+(d[''']?)?eau|[ée]vacuation|r[ée]seau\s+[ée]vacuation)|arriv[ée]e\s+(d[''']?)?eau|[ée]vacuation\s+(pvc|us[ée]es?|plomberie)|raccordement\s+(lave|r[ée]seau)|paroi\s+douche|receveur|cumulus\s+(d[ée]tartrage|groupe|s[ée]curit[ée])|robinetterie|bain[\s-]?douche\s+conversion|reprise\s+(tuyauterie|[ée]vacuation\s+pvc)|raccordement\s+r[ée]seau\s+assainissement|remplacement\s+(canalisations?\s+plomb|colonne\s+fonte|robinet|siphon|vanne))(?![A-Za-zÀ-ÿ])/i },

  // 🟢 v4 — Domotique RESTREINTE aux vrais systèmes (KNX, MyHome, BUS, Z-Wave, Tahoma, Jeedom)
  // Alarme/caméra/interphone génériques restent en electricite (cas standard pose).
  { name: "domotique_securite", rx: /(?<![A-Za-zÀ-ÿ])(knx|my[\s-]?home|bus\s+(domotique|knx)|z[\s-]?wave|tahoma|jeedom|eedomus|module\s+domotique|pack\s+domotique|installation\s+domotique\s+(compl[èe]te|pack)|automatisme\s+(complet|maison)|syst[èe]me\s+(contr[ôo]le\s+(d[''']?\s*)?acc[èe]s|domotique)|contr[ôo]le\s+(d[''']?\s*)?acc[èe]s\s+badge)(?![A-Za-zÀ-ÿ])/i },

  // Électricité (alarme/caméra/interphone/domotique générique tombe ici)
  { name: "electricite", rx: /(?<![A-Za-zÀ-ÿ])([ée]lectric(ien|ique|it[ée])?s?|tableaux?|prises?|interrupteurs?|disjoncteurs?|diff[ée]rentiels?|c[âa]bles?|gaines?|spots?|luminaires?|[ée]clairages?|rubans?\s+led|bandes?\s+led|cablage|c[âa]blage\s+r[ée]seau|borne\s+(de\s+)?recharge|irve|wallbox|d[ée]tecteurs?\s+(fum[ée]es?|co\s+monoxyde)|interphones?|alarmes?\s+(intrusion|maison|filaire|sans\s+fil)?|alarmes?\b|cam[ée]ras?\s+(surveillance|ip)?|cam[ée]ras?\b|domotique|mise\s+aux?\s+normes?|mise\s+en\s+conformit[ée]|mise\s+[àa]\s+la\s+terre|saign[ée]es|tirage\s+ligne|thermostat|parafoudre|coffret\s+gtl|installation\s+(elec|[ée]lectrique)|point\s+lumineux|visiophone|extension\s+tableau|remplacement\s+tableau|portails?\s+motoris[ée]s?)(?![A-Za-zÀ-ÿ])/i },

  // Carrelage / faïence / mosaïque
  { name: "carrelage_faience", rx: /(?<![A-Za-zÀ-ÿ])(carrelage|fa[ïi]ence|gr[èe]s|mosa[ïi]que|nez\s+de\s+marche|carreaux\s+(de\s+)?ciment|terrazzo|joint\s+carrelage|cr[ée]dence\s+carrelage)(?![A-Za-zÀ-ÿ])/i },

  // Sols durs
  { name: "sols_durs", rx: /(?<![A-Za-zÀ-ÿ])(marbres?\s+sol|pierres?\s+naturelles?(\s+(int[ée]rieur|sol|interieur|ext[ée]rieur))?|dallage\s+pierre|dalle\s+pierre\s+naturelle|marches?\s+en\s+pierre|b[ée]ton\s+cir[ée]|micro[\s-]?ciment\s+sol|terrazzo|microtopping\s+sol|r[ée]sines?\s+([ée]poxy|epoxy)\s+sol|sol\s+r[ée]sine)(?![A-Za-zÀ-ÿ])/i },

  // Sols souples
  { name: "sols_souples", rx: /(?<![A-Za-zÀ-ÿ])(parquets?|planchers?\s+(flottant|massif|chevrons|hongrie|colle)|stratifi[ée]s?|moquettes?|lino|linol[ée]ums?|sols?\s+(pvc|stratifi[ée]|vinyle|vinyl|r[ée]sine)|vinyle?|lambris\s+(bois|pvc|pos[ée])|li[èe]ges?|ragr[ée]ages?|po[nç]?[çc]age\s+(parquet|vitrification)|vitrification\s+parquet|plinthes?|baguettes?(\s+(finition|quart[\s-]?de[\s-]?rond))?|seuils?|sous[\s-]?couches?\s+sol|barres?\s+de\s+jonction|revetements?\s+sols?|soubassement)(?![A-Za-zÀ-ÿ])/i },

  // Peinture / revêtements muraux (façade/ravalement déjà capturé plus haut → va à facade_ravalement)
  { name: "peinture_revetements", rx: /(?<![A-Za-zÀ-ÿ])(peintures?|enduits?(\s+(de\s+)?(lissage|chaux|d[ée]coratif|monocouche|gratt[ée]|talo[cç]h[ée]|finition|int[ée]rieur))?|ratissage|lessivage|sous[\s-]?couches?|toile\s+(de\s+)?verre|fibre\s+verre|papiers?\s+peints?|stuc|tadelakt|a[ée]rogommage|cristallisation\s+marbre|reprise\s+(pl[âa]tre|fissures|enduit)|d[ée]collement\s+papier\s+peint|rafraichissement\s+peinture|moulures?\s+d[ée]co|boiseries?\s+(d[ée]co|moulure)|microtopping\s+murs?|lambris\s+(pl[âa]fond|boiserie\s+murale|[/]\s*boiserie))(?![A-Za-zÀ-ÿ])/i },

  // Démolition / dépose
  { name: "demolition_depose", rx: /(?<![A-Za-zÀ-ÿ])(d[ée]molition|d[ée]pose|[ée]vacuation\s+(gravats|d[ée]chets)|curage|d[ée]m[ée]nagement)(?![A-Za-zÀ-ÿ])/i },

  // Placo / isolation / cloisons
  { name: "placo_isolation", rx: /(?<![A-Za-zÀ-ÿ])(placo|ba\s*13|isolation|cloisons?|laines?|pare[\s-]?vapeur|bandes?(\s+(\+|et)\s+joints?)?|bandes?\s+(joints?\s+)?placo|doublage|faux\s+plafonds?|ite|iti|ouate\s+(de\s+)?cellulose|projection\s+ouate|mousse\s+projet[ée]e|soufflage\s+laine|panneaux?\s+osb|flocage|laine\s+de\s+bois|lambris\s+plafond|joints?\s+placo)(?![A-Za-zÀ-ÿ])/i },

  // Charpente / bois
  { name: "charpente_bois", rx: /(?<![A-Za-zÀ-ÿ])(charpentes?|combles(?!\s+habitables)|ossature\s+bois|traitement\s+charpente|poutres?)(?![A-Za-zÀ-ÿ])/i },

  // Logistique de chantier
  { name: "logistique_chantier", rx: /(?<![A-Za-zÀ-ÿ])(logistique|livraison|nettoyages?\s+(chantier|fin\s+(de\s+)?chantier|fa[çc]ade|haute\s+pression|toiture)|mise.*disposition|protection\s+chantier|[ée]chafaudages?|nacelle|bennes?|d[ée]placement|[ée]vacuation\s+d[ée]chets)(?![A-Za-zÀ-ÿ])/i },

  // Bardage extérieur
  { name: "bardage_exterieur", rx: /(?<![A-Za-zÀ-ÿ])bardage(?![A-Za-zÀ-ÿ])/i },

  // Énergies / cuves / batteries
  { name: "energie_environnement", rx: /(?<![A-Za-zÀ-ÿ])(cuve\s+(eau\s+pluie|r[ée]cup[ée]ration)|panneau\s+solaire\s+thermique)(?![A-Za-zÀ-ÿ])/i },

  // Prestations intellectuelles
  { name: "prestations_intellectuelles", rx: /(?<![A-Za-zÀ-ÿ])(moe|ma[îi]tre.*[œo]euvre|maitrise.*oeuvre|architecte|amo|opc|ing[ée]nierie|taux\s+horaire|main[\s-]?(d[''']?)?(œuvre|oeuvre)|heure\s+(de\s+)?(travail|main)|d[ée]placement\s+forfait|menuiserie\s+taux\s+horaire|serrurerie\s+taux\s+horaire)(?![A-Za-zÀ-ÿ])/i },

  // Catch-all
  { name: "petits_ouvrages_divers", rx: /(?<![A-Za-zÀ-ÿ])(joints?\s+silicone|miroirs?|cristallisation)(?![A-Za-zÀ-ÿ])/i },
];

function classifyMetier(label: string): { metier: string; conflits: string[] } {
  const matches: string[] = [];
  for (const rule of METIER_RULES) {
    if (rule.rx.test(label)) matches.push(rule.name);
  }
  if (matches.length === 0) return { metier: "non_classable", conflits: [] };
  // Le premier match (priorité descendante) est la réponse.
  // Les suivants sont des conflits potentiels à signaler.
  return { metier: matches[0], conflits: matches.slice(1) };
}

// ──────────────────────────────────────────────────────────────────────────────
// Règles nature_prix (v2 — défaut fourniture_pose si métier identifié)
// ──────────────────────────────────────────────────────────────────────────────
// Note : ratio_main_oeuvre est uniformément 0.55 (donnée non populée), inutilisable.
// On déduit nature_prix depuis le label en 5 couches :
//   1. Services (diag/maintenance/nettoyage) → non_applicable
//   2. Marqueur explicite (MO) / (hors fourniture) → pose_seule
//   3. Marqueur explicite (fourni+posé) → fourniture_pose
//   4. Démarrage "Fourniture " sans "pos" → fourniture_seule
//   5. 🟢 v2 — Si métier identifié + 0 marqueur → DÉFAUT fourniture_pose
//      Justification : 73% du BTP résidentiel est en fourniture+pose, c'est le cas par
//      défaut. Si Julien voit un faux positif, il corrige dans le CSV.
function classifyNaturePrix(label: string, metier: string): Classified["nature_prix_proposee"] {
  // Diagnostics, audits, études → non_applicable (pas de notion fourniture/pose)
  if (/diagnostic|audit\s+[ée]nerg[ée]tique|[ée]tude\s+thermique|mesurage|expertise/i.test(label)) {
    return "non_applicable";
  }
  if (metier === "diagnostic_reglementaire" || metier === "prestations_intellectuelles") {
    return "non_applicable";
  }

  // Ramonage, maintenance, débouchage, nettoyage = services → non_applicable
  if (/ramonage|maintenance|d[ée]bouchage|nettoyage(?!\s+facade)|d[ée]moussage|vidange|d[ée]tection\s+fuite|sav|test\s+eau|protection\s+chantier|[ée]vacuation\s+(gravats|d[ée]chets)|location\s+(nacelle|benne)|[ée]chafaudage|purge\b|[ée]quilibrage\s+chauffage/i.test(label)) {
    return "non_applicable";
  }

  // pose seule explicite — (MO), (hors fourniture), "pose seule/uniquement"
  if (/\(\s*mo\s*\)|\(\s*main[\s-]?d[''']?(œuvre|oeuvre)\s*\)|\(\s*hors\s+fourniture\s*\)|pose\s+(uniquement|seule|seul)|\(\s*pose\s*\)/i.test(label)) {
    return "pose_seule";
  }

  // fourniture+pose explicite
  if (/\(\s*fourni\s*\+?\s*pos[ée]\s*\)|fourniture\s+et\s+pose|fourniture\s+\+\s+pose|fourniture\s+pose|\(fp\)/i.test(label)) {
    return "fourniture_pose";
  }

  // fourniture seule (rare) — commence par "Fourniture" sans "pos" derrière
  if (/^fourniture/i.test(label) && !/pos[ée]?/i.test(label)) {
    return "fourniture_seule";
  }

  // 🟢 v2 — Défaut intelligent
  // Si pas de marqueur explicite ET métier identifié → présumer fourniture_pose
  // (~73% des entrées BTP catalogue sont en fourniture+pose, c'est la nature la plus
  // probable. Julien arbitre si faux positif.)
  if (metier !== "non_classable") {
    return "fourniture_pose";
  }

  return "inconnu";
}

// ──────────────────────────────────────────────────────────────────────────────
// Détection multiplicateur_couches
// ──────────────────────────────────────────────────────────────────────────────
function detectMultiplicateurCouches(label: string, metier: string): boolean {
  if (!["peinture_revetements", "facade_ravalement"].includes(metier)) return false;
  return /couche|passe(?!\s+de\s+temps)|voile|lasure/i.test(label);
}

// ──────────────────────────────────────────────────────────────────────────────
// Détection gamme
// ──────────────────────────────────────────────────────────────────────────────
function classifyGamme(label: string): string {
  const L = label.toLowerCase();
  if (/\bpremium\b|haut[\s-]?(de\s+)?gamme|luxe|grand\s+format/i.test(label)) return "premium";
  if (/\bstandard\b/i.test(label)) return "standard";
  if (/entr[ée]e\s+(de\s+)?gamme|bas[\s-]?(de\s+)?gamme/i.test(label)) return "entree_gamme";
  if (/(chantier\s+difficile|complexe|urgence)/i.test(label)) return "variante_complexite";
  return "—";
}

// ──────────────────────────────────────────────────────────────────────────────
// Doublons : normalisation du label
// ──────────────────────────────────────────────────────────────────────────────
function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire accents
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// CSV utils
// ──────────────────────────────────────────────────────────────────────────────
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[,;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T)[]): string {
  const header = columns.map((c) => csvEscape(c)).join(",");
  const lines = rows.map((r) => columns.map((c) => csvEscape(r[c])).join(","));
  return [header, ...lines].join("\n");
}

// ──────────────────────────────────────────────────────────────────────────────
// Fetch all (Supabase ou CSV)
// ──────────────────────────────────────────────────────────────────────────────
async function fetchAll(): Promise<MarketRow[]> {
  if (!supabase) throw new Error("supabase client non initialisé");
  // Page de 1000 pour être sûr de tout chopper en 1 call
  const { data, error } = await supabase
    .from("market_prices")
    .select(
      "id,job_type,label,unit,price_min_unit_ht,price_avg_unit_ht,price_max_unit_ht,fixed_min_ht,fixed_avg_ht,fixed_max_ht,variability_ratio,confidence,sample_size,source,notes,room_specific,required_room,generic_family",
    )
    .order("label", { ascending: true })
    .limit(2000);

  if (error) {
    console.error("❌ Erreur fetch market_prices :", error.message);
    process.exit(1);
  }
  return (data ?? []) as unknown as MarketRow[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Parser CSV minimal (gère les guillemets + virgules dans les champs)
// ──────────────────────────────────────────────────────────────────────────────
function parseCsv(content: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const lines: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (field !== "" || cur.length > 0) {
          cur.push(field);
          lines.push(cur);
          cur = [];
          field = "";
        }
        if (c === "\r" && content[i + 1] === "\n") i++;
      } else {
        field += c;
      }
    }
  }
  if (field !== "" || cur.length > 0) {
    cur.push(field);
    lines.push(cur);
  }
  if (lines.length === 0) return rows;

  const header = lines[0];
  for (let r = 1; r < lines.length; r++) {
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = lines[r][c] ?? "";
    }
    rows.push(obj);
  }
  return rows;
}

function num(s: string | undefined): number | null {
  if (s === undefined || s === null || s === "" || s === "null" || s === "NULL") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function bool(s: string | undefined): boolean | null {
  if (s === undefined || s === null || s === "" || s === "null" || s === "NULL") return null;
  if (s === "true" || s === "t" || s === "1") return true;
  if (s === "false" || s === "f" || s === "0") return false;
  return null;
}

function arr(s: string | undefined): string[] | null {
  if (s === undefined || s === null || s === "" || s === "null" || s === "NULL") return null;
  // Postgres exporte les arrays sous forme {a,b,c} ou ["a","b","c"] selon studio
  try {
    if (s.startsWith("[")) return JSON.parse(s);
    if (s.startsWith("{") && s.endsWith("}")) {
      return s.slice(1, -1).split(",").map((x) => x.replace(/^"|"$/g, "").trim()).filter(Boolean);
    }
  } catch {
    /* ignore */
  }
  return [s];
}

async function loadFromCsv(): Promise<MarketRow[]> {
  const csvPath = join(OUTPUT_DIR, "audit-911-raw.csv");
  if (!existsSync(csvPath)) {
    console.error(`❌ Fichier CSV introuvable : ${csvPath}`);
    console.error("");
    console.error("Pour exporter le CSV depuis Supabase Studio :");
    console.error("  1. Ouvre Supabase Studio → SQL Editor");
    console.error("  2. Colle ce SQL :");
    console.error("     SELECT id,job_type,label,unit,price_min_unit_ht,price_avg_unit_ht,");
    console.error("            price_max_unit_ht,fixed_min_ht,fixed_avg_ht,fixed_max_ht,");
    console.error("            variability_ratio,confidence,sample_size,source,notes,");
    console.error("            room_specific,required_room,generic_family");
    console.error("     FROM public.market_prices ORDER BY label;");
    console.error("  3. Lance la query");
    console.error("  4. Results panel → bouton Export ▼ → CSV");
    console.error(`  5. Sauvegarde sous ${csvPath}`);
    console.error("  6. Relance : npm run phase1:audit -- --from-csv");
    process.exit(1);
  }
  const content = readFileSync(csvPath, "utf-8");
  const parsed = parseCsv(content);
  console.log(`✓ ${parsed.length} lignes lues depuis ${csvPath}`);

  return parsed.map((r) => ({
    id: Number(r.id),
    job_type: r.job_type ?? "",
    label: r.label ?? "",
    unit: r.unit || null,
    price_min_unit_ht: num(r.price_min_unit_ht),
    price_avg_unit_ht: num(r.price_avg_unit_ht),
    price_max_unit_ht: num(r.price_max_unit_ht),
    fixed_min_ht: num(r.fixed_min_ht),
    fixed_avg_ht: num(r.fixed_avg_ht),
    fixed_max_ht: num(r.fixed_max_ht),
    variability_ratio: num(r.variability_ratio),
    confidence: r.confidence || null,
    sample_size: num(r.sample_size) === null ? null : Math.trunc(num(r.sample_size)!),
    source: r.source || null,
    notes: r.notes || null,
    room_specific: bool(r.room_specific),
    required_room: arr(r.required_room),
    generic_family: r.generic_family || null,
  }));
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("🟢 Phase 1.3 — Audit catalogue market_prices");
  console.log(FROM_CSV ? "   Mode : lecture CSV (--from-csv)\n" : "   Mode : fetch Supabase\n");

  const rows = FROM_CSV ? await loadFromCsv() : await fetchAll();
  if (!FROM_CSV) console.log(`✓ ${rows.length} entrées fetchées depuis market_prices`);
  console.log("");

  // Map de comptage des labels normalisés (pour détection doublons)
  const labelCounts = new Map<string, number>();
  for (const r of rows) {
    const norm = normalizeLabel(r.label);
    labelCounts.set(norm, (labelCounts.get(norm) ?? 0) + 1);
  }

  // Classement
  const classified: Classified[] = rows.map((r) => {
    const { metier, conflits } = classifyMetier(r.label);
    const nature_prix = classifyNaturePrix(r.label, metier);
    const multi_couches = detectMultiplicateurCouches(r.label, metier);
    const gamme = classifyGamme(r.label);

    const notes_auto: string[] = [];

    // 🟢 v2 — Détection nature_prix par défaut (= fourniture_pose sans marqueur explicite)
    // pour annoter le niveau de confiance dans la note.
    const hasExplicitNatureMarker = /\(\s*mo\s*\)|\(\s*hors\s+fourniture\s*\)|\(\s*pose\s*\)|\(\s*fourni\s*\+?\s*pos[ée]\s*\)|fourniture\s+et\s+pose|^fourniture/i.test(r.label);
    const naturePrixIsDefault = nature_prix === "fourniture_pose" && !hasExplicitNatureMarker;

    let niveau_doute: Classified["niveau_doute"] = "auto";
    if (metier === "non_classable") {
      niveau_doute = "inclassable";
      notes_auto.push("aucune règle métier ne match");
    } else if (conflits.length > 0) {
      niveau_doute = "conflit";
      notes_auto.push(`conflit avec : ${conflits.join(", ")}`);
    } else if (nature_prix === "inconnu") {
      niveau_doute = "doute";
      notes_auto.push("nature_prix non déduite — label sans marqueur ET métier ambigu");
    }

    if (naturePrixIsDefault) {
      // On reste sur "auto" mais on signale que la nature_prix est par défaut
      notes_auto.push("nature_prix=fourniture_pose par défaut (pas de marqueur explicite — à confirmer)");
    }

    if ((labelCounts.get(normalizeLabel(r.label)) ?? 0) > 1) {
      niveau_doute = "doublon_probable";
      notes_auto.push("label identique à au moins une autre entrée");
    }

    return {
      ...r,
      metier_propose: metier,
      nature_prix_proposee: nature_prix,
      multiplicateur_couches_applicable: multi_couches,
      gamme_proposee: gamme,
      niveau_doute,
      notes_auto,
      commentaire_julien: "",
    };
  });

  // ── CSV brut ───────────────────────────────────────────────────────────────
  const rawCols: (keyof MarketRow)[] = [
    "id",
    "job_type",
    "label",
    "unit",
    "price_min_unit_ht",
    "price_avg_unit_ht",
    "price_max_unit_ht",
    "fixed_min_ht",
    "fixed_avg_ht",
    "fixed_max_ht",
    "variability_ratio",
    "confidence",
    "sample_size",
    "source",
    "notes",
    "room_specific",
    "required_room",
    "generic_family",
  ];
  if (!FROM_CSV) {
    // En mode --from-csv, le fichier audit-911-raw.csv vient déjà du Studio,
    // on ne le réécrit pas (pour ne pas perdre le format original Postgres si l'user veut le ré-importer)
    writeFileSync(join(OUTPUT_DIR, "audit-911-raw.csv"), toCsv(rows, rawCols), "utf-8");
  }

  // ── CSV classé (trié par metier → niveau_doute → label) ────────────────────
  const sorted = [...classified].sort((a, b) => {
    if (a.metier_propose !== b.metier_propose) return a.metier_propose.localeCompare(b.metier_propose);
    if (a.niveau_doute !== b.niveau_doute) return a.niveau_doute.localeCompare(b.niveau_doute);
    return a.label.localeCompare(b.label);
  });

  const classifiedCols: (keyof Classified)[] = [
    "id",
    "job_type",
    "label",
    "unit",
    "metier_propose",
    "nature_prix_proposee",
    "multiplicateur_couches_applicable",
    "gamme_proposee",
    "niveau_doute",
    "notes_auto",
    "price_min_unit_ht",
    "price_max_unit_ht",
    "fixed_min_ht",
    "fixed_max_ht",
    "variability_ratio",
    "confidence",
    "sample_size",
    "notes",
    "commentaire_julien",
  ];

  // notes_auto est un array → on le joint en string pour CSV
  const sortedForCsv = sorted.map((r) => ({ ...r, notes_auto: r.notes_auto.join(" | ") }));
  writeFileSync(
    join(OUTPUT_DIR, "audit-911-classified.csv"),
    toCsv(sortedForCsv as any, classifiedCols as any),
    "utf-8",
  );

  // ── Rapport markdown ───────────────────────────────────────────────────────
  const byMetier = new Map<string, Classified[]>();
  for (const c of classified) {
    if (!byMetier.has(c.metier_propose)) byMetier.set(c.metier_propose, []);
    byMetier.get(c.metier_propose)!.push(c);
  }
  const metierStats = [...byMetier.entries()]
    .map(([m, entries]) => ({
      metier: m,
      nb: entries.length,
      nb_auto: entries.filter((e) => e.niveau_doute === "auto").length,
      nb_doute: entries.filter((e) => e.niveau_doute === "doute").length,
      nb_conflit: entries.filter((e) => e.niveau_doute === "conflit").length,
      nb_doublon: entries.filter((e) => e.niveau_doute === "doublon_probable").length,
      nb_inclassable: entries.filter((e) => e.niveau_doute === "inclassable").length,
    }))
    .sort((a, b) => b.nb - a.nb);

  const totalAuto = classified.filter((c) => c.niveau_doute === "auto").length;
  const totalDoute = classified.filter((c) => c.niveau_doute === "doute").length;
  const totalConflit = classified.filter((c) => c.niveau_doute === "conflit").length;
  const totalDoublon = classified.filter((c) => c.niveau_doute === "doublon_probable").length;
  const totalInclassable = classified.filter((c) => c.niveau_doute === "inclassable").length;

  const naturePrixStats = new Map<string, number>();
  for (const c of classified) {
    naturePrixStats.set(c.nature_prix_proposee, (naturePrixStats.get(c.nature_prix_proposee) ?? 0) + 1);
  }

  // Top doublons
  const doublonsTop = [...labelCounts.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const rapport = `# Rapport audit catalogue — Phase 1.3

**Date** : ${new Date().toISOString().slice(0, 10)}
**Source** : script \`scripts/phase1-audit-catalogue.ts\`
**Inputs** : ${rows.length} entrées de \`market_prices\`

---

## Synthèse

| Statut | Nb entrées | % |
|---|---|---|
| 🟢 \`auto\` (consensuel, à valider d'un œil) | ${totalAuto} | ${((totalAuto / rows.length) * 100).toFixed(1)}% |
| 🟡 \`doute\` (nature_prix ambiguë) | ${totalDoute} | ${((totalDoute / rows.length) * 100).toFixed(1)}% |
| 🟠 \`conflit\` (capté par plusieurs familles) | ${totalConflit} | ${((totalConflit / rows.length) * 100).toFixed(1)}% |
| 🔴 \`doublon_probable\` (label identique) | ${totalDoublon} | ${((totalDoublon / rows.length) * 100).toFixed(1)}% |
| ⚫ \`inclassable\` (aucune règle métier ne match) | ${totalInclassable} | ${((totalInclassable / rows.length) * 100).toFixed(1)}% |

---

## Distribution par métier proposé

| Métier | Total | 🟢 auto | 🟡 doute | 🟠 conflit | 🔴 doublon | ⚫ inclassable |
|---|---:|---:|---:|---:|---:|---:|
${metierStats
  .map(
    (s) =>
      `| \`${s.metier}\` | ${s.nb} | ${s.nb_auto} | ${s.nb_doute} | ${s.nb_conflit} | ${s.nb_doublon} | ${s.nb_inclassable} |`,
  )
  .join("\n")}

---

## Distribution nature_prix proposée

| Nature prix | Nb entrées | Note |
|---|---:|---|
${[...naturePrixStats.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([n, c]) => `| \`${n}\` | ${c} | ${n === "inconnu" ? "→ à arbitrer manuellement" : ""} |`)
  .join("\n")}

---

## Top 20 doublons (label normalisé)

| Label | Nb |
|---|---:|
${doublonsTop.map(([l, n]) => `| ${l} | ${n} |`).join("\n")}

---

## Comment relire le CSV \`audit-911-classified.csv\`

Le CSV est **trié par métier proposé**, puis par niveau de doute, puis par label.

**Stratégie de relecture rapide** :
1. **Filtre sur \`niveau_doute = inclassable\`** (${totalInclassable} lignes) → c'est là qu'il y a le plus de boulot
2. **Filtre sur \`niveau_doute = conflit\`** (${totalConflit} lignes) → arbitrer entre 2 familles
3. **Filtre sur \`niveau_doute = doublon_probable\`** (${totalDoublon} lignes) → décider quoi fusionner / expliciter
4. **Filtre sur \`niveau_doute = doute\`** (${totalDoute} lignes) → souvent juste préciser la nature_prix
5. **Les ${totalAuto} \`auto\` ne nécessitent QU'un coup d'œil rapide** par métier (relecture en bloc)

**Colonnes à remplir si nécessaire** :
- \`commentaire_julien\` : correction métier proposé OU nature_prix OU notes libres

**Une fois le CSV relu**, je reprends la version validée pour générer la migration SQL Phase 1.4 (ALTER TABLE market_prices + UPDATE en bloc).

---

## Prochaines actions

1. ⏳ Julien relit \`audit-911-classified.csv\` (~2-4h)
2. 🟡 Génération de la migration SQL Phase 1.4 depuis le CSV validé
3. 🟡 Recalibrage fourchettes vs prix réels observés dans \`analyses\` (Phase 1.5)
4. 🟡 Régénération embeddings après modif libellés (Phase 1.6)
`;

  writeFileSync(join(OUTPUT_DIR, "RAPPORT-AUDIT.md"), rapport, "utf-8");

  console.log("✓ 3 fichiers générés :");
  console.log(`  - ${join(OUTPUT_DIR, "audit-911-raw.csv")}`);
  console.log(`  - ${join(OUTPUT_DIR, "audit-911-classified.csv")}`);
  console.log(`  - ${join(OUTPUT_DIR, "RAPPORT-AUDIT.md")}`);
  console.log("");
  console.log(`📊 Synthèse :`);
  console.log(`   ${totalAuto} auto · ${totalDoute} doute · ${totalConflit} conflit · ${totalDoublon} doublon · ${totalInclassable} inclassable`);
  console.log("");
  console.log("👉 Étape suivante : relire docs/refonte/catalogue-classement/audit-911-classified.csv");
}

main().catch((err) => {
  console.error("❌ Erreur :", err);
  process.exit(1);
});
