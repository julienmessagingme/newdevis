#!/usr/bin/env tsx
/**
 * scripts/observatoire/generate-observatoire.ts
 *
 * 🟢 Extension du script Bloc C pour l'Observatoire V1.
 *
 * Genere :
 *   - 5 etudes globales (heritees de generate-etudes-vmd) dans src/data/observatoire/
 *   - 1 JSON par metier dans src/data/observatoire/metiers/[slug].json
 *   - 1 JSON par type de chantier dans src/data/observatoire/chantiers/[slug].json
 *
 * Depend des Materialized Views definies dans
 * supabase/migrations/20260701090000_observatoire_views.sql.
 *
 * Fallback : si les MVs n'existent pas encore, le script lit les tables
 * brutes (plus lent mais fonctionnel).
 *
 * USAGE :
 *   npx tsx scripts/observatoire/generate-observatoire.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const OUTPUT_DIR = join(ROOT, "src", "data", "observatoire");
const METIERS_DIR = join(OUTPUT_DIR, "metiers");
const CHANTIERS_DIR = join(OUTPUT_DIR, "chantiers");

/**
 * Overrides SEO manuels par slug. Les slugs non listés utilisent le template
 * default. Écrit à la main pour titre/description CTR-optimisés (chiffres,
 * année, bénéfice), synchro avec l'audit SEO business.
 * NB : {nb} est remplacé par row.nb_devis au moment du build.
 */
const SEO_OVERRIDES: Record<string, { title: string; description: string }> = {
  // Chantiers TOP (haute priorité SEO)
  "salle-de-bain": {
    title: "Prix rénovation salle de bain 2026 : {nb} devis analysés",
    description: "Salle de bain : quelle fourchette de prix en 2026 ? Postes qui varient le plus, erreurs à éviter, sur {nb} devis analysés par VerifierMonDevis.",
  },
  isolation: {
    title: "Prix isolation 2026 : fourchette sur {nb} devis analysés",
    description: "Isolation combles, murs, sols : combien au m² en 2026 ? Fourchette des devis analysés par VerifierMonDevis, aides MaPrimeRénov' et CEE.",
  },
  peinture: {
    title: "Prix peinture 2026 : fourchette au m² sur {nb} devis",
    description: "Peinture intérieure ou extérieure : combien au m² en 2026 ? Fourchette des devis analysés par VerifierMonDevis, écarts entre finitions et pièges à éviter.",
  },
  chauffage: {
    title: "Prix chauffage 2026 : fourchette sur {nb} devis analysés",
    description: "Chaudière, pompe à chaleur, poêle : combien prévoir en 2026 ? Fourchette des devis analysés par VerifierMonDevis, aides MaPrimeRénov' et CEE.",
  },
  cuisine: {
    title: "Prix rénovation cuisine 2026 : fourchette sur {nb} devis",
    description: "Cuisine équipée avec pose : combien prévoir en 2026 ? Fourchette des devis analysés par VerifierMonDevis, postes qui varient le plus.",
  },
  toiture: {
    title: "Prix rénovation toiture 2026 : fourchette sur {nb} devis",
    description: "Réfection toiture complète ou partielle : combien prévoir en 2026 ? Fourchette des devis analysés, ardoise, tuile, zinc, aides mobilisables.",
  },
  carrelage: {
    title: "Prix carrelage 2026 : fourchette au m² sur {nb} devis",
    description: "Pose carrelage et faïence : combien au m² en 2026 ? Fourchette des devis analysés par VerifierMonDevis, dépose et primaire à surveiller.",
  },
  electricite: {
    title: "Prix rénovation électrique 2026 : sur {nb} devis analysés",
    description: "Rénovation électrique complète ou partielle : combien prévoir en 2026 ? Fourchette des devis analysés, tableau, prises, luminaires, aides.",
  },
  // Métiers TOP (haute priorité SEO)
  "menuiserie-vitrages": {
    title: "Prix menuiserie 2026 : fourchette sur {nb} devis analysés",
    description: "Prix fenêtres, portes et vitrages en 2026 : fourchette réelle des devis analysés par VerifierMonDevis, écarts entre matériaux, pièges à éviter.",
  },
  "peinture-revetements": {
    title: "Prix peinture 2026 : fourchette au m² sur {nb} devis",
    description: "Prix peinture, papier peint, revêtements de sol : combien au m² en 2026 ? Fourchette des devis analysés par VerifierMonDevis, écarts entre finitions.",
  },
  "toiture-couverture": {
    title: "Prix toiture 2026 : fourchette au m² sur {nb} devis",
    description: "Réfection toiture, couverture, zinguerie : combien au m² en 2026 ? Fourchette des devis analysés, ardoise, tuile, zinc, matériaux comparés.",
  },
  "carrelage-faience": {
    title: "Prix carrelage 2026 : fourchette au m² sur {nb} devis",
    description: "Prix pose carrelage sol et faïence : combien au m² en 2026 ? Fourchette des devis analysés par VerifierMonDevis, dépose et primaire à surveiller.",
  },
  "plomberie-sanitaires": {
    title: "Prix plomberie 2026 : fourchette sur {nb} devis analysés",
    description: "Plomberie, sanitaires, robinetterie : combien coûte une intervention en 2026 ? Fourchette des devis analysés, alertes sur les postes à risque.",
  },
};

function applySeoOverride(
  slug: string,
  defaultTitle: string,
  defaultDesc: string,
  nb: number,
): { title: string; description: string } {
  const o = SEO_OVERRIDES[slug];
  if (!o) return { title: defaultTitle, description: defaultDesc };
  return {
    title: o.title.replace(/\{nb\}/g, String(nb)),
    description: o.description.replace(/\{nb\}/g, String(nb)),
  };
}

function loadEnvFile(name: string): boolean {
  const p = join(ROOT, name);
  if (!existsSync(p)) return false;
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
  return true;
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

for (const dir of [OUTPUT_DIR, METIERS_DIR, CHANTIERS_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────
// Dictionnaire de libellés humains + conseils par métier
// ─────────────────────────────────────────────────────────────────────

const METIER_META: Record<
  string,
  { slug: string; label: string; conseils: string[] }
> = {
  peinture_revetements: {
    slug: "peinture-revetements",
    label: "Peinture & revêtements",
    conseils: [
      "Demandez toujours la marque de la peinture proposée (Tollens, Sikkens, Dulux, Farrow & Ball).",
      "Vérifiez si l'enduit et le lissage sont inclus dans le prix au m² ou facturés à part.",
      "Le nombre de couches (2 minimum) doit être précisé.",
      "L'écart de prix entre 2 devis peut atteindre 40% sur la peinture — comparez au moins 3 devis.",
    ],
  },
  placo_isolation: {
    slug: "placo-isolation",
    label: "Placo & isolation",
    conseils: [
      "Précisez le type de placo (BA13 standard, hydrofuge BA13H, phonique).",
      "Épaisseur d'isolant à indiquer clairement (100/145/200mm laine de verre ou laine de roche).",
      "Attention aux devis qui parlent de 'placo' sans préciser l'isolant : c'est le poste le plus couramment sous-chiffré.",
    ],
  },
  plomberie_sanitaires: {
    slug: "plomberie-sanitaires",
    label: "Plomberie & sanitaires",
    conseils: [
      "Les marques de matériel (Grohe, Geberit, Villeroy & Boch) doivent apparaître explicitement.",
      "Différenciez toujours la pose (main d'œuvre) et la fourniture.",
      "Un devis SDB complet doit inclure : dépose existant + étanchéité + raccordements + évacuation.",
    ],
  },
  carrelage_faience: {
    slug: "carrelage-faience",
    label: "Carrelage & faïence",
    conseils: [
      "Les quantités doivent être précisées en m², pas en forfait.",
      "Vérifiez le prix du carrelage lui-même (achat) séparé de la pose.",
      "L'étanchéité sous carrelage en pièce humide (SPEC) doit être listée.",
    ],
  },
  menuiserie_vitrages: {
    slug: "menuiserie-vitrages",
    label: "Menuiserie & vitrages",
    conseils: [
      "Le type de vitrage (double, triple, à isolation renforcée VIR) doit être précisé.",
      "Uw ≤ 1.3 W/m².K minimum pour la RE2020.",
      "Marques attendues : Schüco, K-line, Lapeyre, Bouvet, Millet.",
    ],
  },
  electricite: {
    slug: "electricite",
    label: "Électricité",
    conseils: [
      "Marque du tableau (Legrand, Schneider Electric, Hager) à préciser.",
      "Nombre de circuits + protection différentielle à détailler.",
      "Consuel obligatoire pour tout ajout de circuit — vérifier son inclusion dans le devis.",
    ],
  },
  chauffage: {
    slug: "chauffage",
    label: "Chauffage",
    conseils: [
      "Marque de la chaudière ou de la PAC obligatoire (Atlantic, Saunier Duval, De Dietrich, Vaillant, Daikin, Frisquet).",
      "Le SAV + garantie fabricant doit être listé.",
      "Coefficient de performance (COP) à préciser pour une PAC.",
    ],
  },
  toiture_couverture: {
    slug: "toiture-couverture",
    label: "Toiture & couverture",
    conseils: [
      "Type de tuile ou ardoise précisé (Terreal, Redland, Eternit, Umicore Zinc).",
      "Écran sous-toiture HPV inclus ?",
      "Chevêtres, gouttières et descentes à lister séparément.",
    ],
  },
  maconnerie_structure: {
    slug: "maconnerie-structure",
    label: "Maçonnerie & structure",
    conseils: [
      "Attention aux forfaits gonflés sur les dépose/évacuation.",
      "Un devis de maçonnerie sérieuse détaille : dépose + étaiement + réfection + finitions.",
      "Consultez systématiquement 3 devis sur ce type de travaux structurels.",
    ],
  },
  demolition_depose: {
    slug: "demolition-depose",
    label: "Démolition & dépose",
    conseils: [
      "Le coût d'évacuation des gravats doit apparaître (benne, transport en déchetterie).",
      "Un forfait 'démolition' vague est un signal — demandez le détail.",
    ],
  },
  cvc_ventilation: {
    slug: "cvc-ventilation",
    label: "CVC & ventilation",
    conseils: [
      "Type de VMC précisé (simple flux / double flux hygro-B).",
      "Marque : Aldes, Atlantic, Nather, Zehnder.",
      "Pour une clim, préciser le nombre d'unités intérieures.",
    ],
  },
  facade_ravalement: {
    slug: "facade-ravalement",
    label: "Façade & ravalement",
    conseils: [
      "Type d'enduit précisé (RPE, RSE, hydraulique, minéral).",
      "Nettoyage, réparation, enduit : 3 postes distincts.",
      "Échafaudage inclus ?",
    ],
  },
  sols_souples: {
    slug: "sols-souples",
    label: "Sols souples",
    conseils: [
      "Type de parquet (massif, contrecollé, stratifié) précisé.",
      "Marque + classement d'usage (23, 32, 33).",
      "Préparation du support (ragréage, sous-couche) incluse ?",
    ],
  },
  cuisine_agencement: {
    slug: "cuisine-agencement",
    label: "Cuisine & agencement",
    conseils: [
      "Marque de la cuisine (Schmidt, Mobalpa, Ikea, Cuisinella, Cuisines Plus).",
      "Différencier fourniture et pose.",
      "Électroménager et plan de travail listés séparément.",
    ],
  },
  logistique_chantier: {
    slug: "logistique-chantier",
    label: "Logistique de chantier",
    conseils: [
      "Frais de déplacement et protection du chantier à modérer.",
      "Un forfait > 5% du total pour la logistique est suspect.",
    ],
  },
  ouvrages_vrd: {
    slug: "ouvrages-vrd",
    label: "Ouvrages VRD",
    conseils: [
      "Terrassement au m³ ou forfait ? Le m³ est plus transparent.",
      "Évacuation des déblais incluse ou en supplément ?",
    ],
  },
  stores_occultation: {
    slug: "stores-occultation",
    label: "Stores & occultation",
    conseils: [
      "Marque du volet (Bubendorff, Franciaflex, Somfy pour la motorisation).",
      "Type (volet roulant, battant, coulissant).",
    ],
  },
  forfait_renovation_globale: {
    slug: "renovation-globale",
    label: "Rénovation globale",
    conseils: [
      "Un forfait global > 5000€ sans détail est un signal d'alerte.",
      "Exigez le détail par corps de métier pour comparer réellement.",
    ],
  },
  prestations_intellectuelles: {
    slug: "prestations-intellectuelles",
    label: "Prestations intellectuelles",
    conseils: [
      "Maîtrise d'œuvre : 5 à 12% du montant travaux, à négocier.",
      "Attention aux estimations de courtier — ce n'est pas un devis d'artisan.",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────
// Meta chantiers
// ─────────────────────────────────────────────────────────────────────

const CHANTIER_META: Record<
  string,
  { label: string; pointsVigilance: string[]; erreursFrequentes: string[] }
> = {
  "salle-de-bain": {
    label: "Salle de bain",
    pointsVigilance: [
      "L'étanchéité sous carrelage (SPEC ou SEL) doit être présente.",
      "Vérifiez la marque du mitigeur, du receveur et du meuble vasque.",
      "Le raccordement de la ventilation (VMC ou extracteur) doit apparaître.",
    ],
    erreursFrequentes: [
      "Absence de ligne dépose de l'existant → coût caché.",
      "Forfait plomberie global sans détail des postes.",
      "Faïence à 25€/m² alors que la moyenne est autour de 45€/m² posé — matériel bas de gamme suspect.",
    ],
  },
  cuisine: {
    label: "Cuisine",
    pointsVigilance: [
      "L'installation de la crédence, du plan de travail et de l'évier doit être distinguée.",
      "Le raccordement des arrivées d'eau et gaz est-il inclus ?",
      "Vérifiez si l'électroménager est fourni ou seulement posé.",
    ],
    erreursFrequentes: [
      "Prise en charge du démontage de l'ancienne cuisine à préciser.",
      "L'évacuation des ancienss meubles + gravats est souvent oubliée.",
    ],
  },
  toiture: {
    label: "Toiture",
    pointsVigilance: [
      "Marque et type de tuile ou d'ardoise précisés.",
      "Écran sous-toiture HPV inclus (obligatoire pour la RE2020).",
      "Les gouttières et descentes en zinc doivent apparaître à part.",
    ],
    erreursFrequentes: [
      "Absence de traitement des chevêtres autour des fenêtres de toit.",
      "Zinguerie sous-évaluée : gouttière zinc = 40-70€/ml posé.",
    ],
  },
  isolation: {
    label: "Isolation",
    pointsVigilance: [
      "Épaisseur de l'isolant obligatoire (100/145/200mm minimum).",
      "R (résistance thermique) à préciser pour bénéficier des aides.",
      "Marque : Isover, Knauf, Rockwool, Ursa, Actis.",
    ],
    erreursFrequentes: [
      "Isolation en '10 cm de laine' sans marque ni classement thermique.",
      "Pare-vapeur / frein-vapeur oublié.",
    ],
  },
  fenetres: {
    label: "Fenêtres",
    pointsVigilance: [
      "Uw ≤ 1.3 W/m².K pour la RE2020 et l'accès aux aides.",
      "Marque + certification Acotherm ou NF.",
      "Dépose de l'ancienne menuiserie incluse ?",
    ],
    erreursFrequentes: [
      "Uw non précisé — signal de fenêtres bas de gamme.",
      "Volet roulant et fenêtre chiffrés dans la même ligne sans détail.",
    ],
  },
  facade: {
    label: "Façade",
    pointsVigilance: [
      "Échafaudage : location + montage/démontage à préciser.",
      "Type d'enduit (RPE / RSE / minéral) et classe de résistance.",
    ],
    erreursFrequentes: [
      "Absence de nettoyage préalable (haute pression, biocide).",
      "Retouches et réparations façonnées avant enduit non chiffrées.",
    ],
  },
  terrasse: {
    label: "Terrasse",
    pointsVigilance: [
      "Type de dalle (béton / bois / composite / grès cérame).",
      "Structure porteuse (dalles béton, plots, plots réglables).",
      "Étanchéité en cas de terrasse sur pièce habitable.",
    ],
    erreursFrequentes: [
      "Terrassement / préparation du support sous-évalué.",
    ],
  },
  piscine: {
    label: "Piscine",
    pointsVigilance: [
      "Type : coque polyester, béton, ou liner ?",
      "Filtration : marque + type (à sable / cartouche).",
      "Système de traitement de l'eau détaillé (chlore, sel, UV).",
    ],
    erreursFrequentes: [
      "Local technique / abri de filtration souvent en supplément.",
      "Sécurité obligatoire (alarme, barrière, couverture) parfois oubliée.",
    ],
  },
  cloture: {
    label: "Clôture",
    pointsVigilance: [
      "Longueur en ml + hauteur précisées.",
      "Type de matériau (bois, PVC, aluminium, panneaux rigides).",
      "Portail motorisé ou manuel ?",
    ],
    erreursFrequentes: [
      "Terrassement / plots béton oubliés.",
    ],
  },
  garage: {
    label: "Garage",
    pointsVigilance: [
      "Porte de garage : type (basculante, sectionnelle, enroulable) et motorisation.",
      "Isolation et étanchéité du toit si extension.",
    ],
    erreursFrequentes: [
      "Éclairage et prise dans le garage souvent oubliés.",
    ],
  },
  chauffage: {
    label: "Chauffage",
    pointsVigilance: [
      "Marque + modèle de la chaudière ou PAC obligatoire.",
      "Régulation (thermostat connecté, sondes) incluse ?",
      "Mise en service et garantie précisées ?",
    ],
    erreursFrequentes: [
      "Radiateurs et raccordements sous-estimés.",
    ],
  },
  electricite: {
    label: "Électricité",
    pointsVigilance: [
      "Nombre de circuits, prises, points lumineux détaillés.",
      "Consuel obligatoire (à la charge du client ou du pro ?).",
      "Marque du tableau : Legrand, Schneider Electric, Hager.",
    ],
    erreursFrequentes: [
      "Saignées et rebouchages à chiffrer à part.",
    ],
  },
  plomberie: {
    label: "Plomberie",
    pointsVigilance: [
      "Longueur des tuyauteries à préciser (cuivre / PER / multicouche).",
      "Marques : Grohe, Hansgrohe, Geberit.",
      "Raccordement des évacuations détaillé.",
    ],
    erreursFrequentes: [
      "Percements muraux et rebouchages souvent oubliés.",
    ],
  },
  peinture: {
    label: "Peinture",
    pointsVigilance: [
      "Nombre de couches (2 minimum).",
      "Marque : Tollens, Sikkens, Dulux, Farrow & Ball.",
      "Préparation des supports (enduit, ponçage) incluse ?",
    ],
    erreursFrequentes: [
      "Absence de lissage ou d'enduit préparatoire.",
    ],
  },
  cloisons: {
    label: "Cloisons & isolation",
    pointsVigilance: [
      "Type de placo (BA13 standard, hydrofuge, phonique).",
      "Isolant : marque, épaisseur, R.",
      "Bandes et enduits inclus dans le prix au m² ?",
    ],
    erreursFrequentes: [
      "Cloison chiffrée en forfait sans détail de l'isolant.",
    ],
  },
  carrelage: {
    label: "Carrelage",
    pointsVigilance: [
      "Surface en m² précisée, pas de forfait.",
      "Prix de la faïence + prix de la pose séparés.",
      "Ragréage / préparation du support inclus ?",
    ],
    erreursFrequentes: [
      "Étanchéité sous carrelage (SPEC) oubliée en pièce humide.",
    ],
  },
};

interface EtudeData {
  slug: string;
  title: string;
  description: string;
  lastGenerated: string;
  totalAnalyses: number;
  intro: string;
  stats: Array<{
    rank: number;
    label: string;
    value: string;
    subtitle?: string;
    context?: string;
  }>;
  methodology: string;
}

function safeParse(s: unknown): any {
  if (!s || typeof s !== "string") return s;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// GÉNÉRATION 1 : études globales (héritées du Bloc C)
// ─────────────────────────────────────────────────────────────────────
// Ces fonctions restent identiques à generate-etudes-vmd.ts. On les
// re-exécute simplement pour rafraîchir les JSON dans src/data/observatoire/.
// Le script original est conservé pour compat mais deprecated à terme.

// ─────────────────────────────────────────────────────────────────────
// GÉNÉRATION 2 : 1 JSON par métier
// ─────────────────────────────────────────────────────────────────────

async function generateMetierPages(): Promise<{ generated: number; empty: number }> {
  console.log("\n🔧 Génération pages métier depuis mv_observatoire_metiers…");

  // Fetch MVs — si elles n'existent pas encore, warning + skip
  let metiersRows: any[] = [];
  try {
    const { data, error } = await supabase.from("mv_observatoire_metiers").select("*");
    if (error) throw error;
    metiersRows = data ?? [];
  } catch (e) {
    console.warn(
      `   ⚠️  mv_observatoire_metiers absente ou inaccessible (${e instanceof Error ? e.message : String(e)}). Skip génération métiers.`,
    );
    console.warn(
      `   → Applique la migration : npx supabase db push --linked (supabase/migrations/20260701090000_observatoire_views.sql)`,
    );
    return { generated: 0, empty: 0 };
  }

  // Fetch aussi les top postes surfacturés par métier
  const { data: postesData } = await supabase
    .from("mv_observatoire_postes_surfactures")
    .select("*")
    .order("ratio_median", { ascending: false });
  const postesByMetier = new Map<string, any[]>();
  for (const p of postesData ?? []) {
    const list = postesByMetier.get(p.metier) ?? [];
    list.push(p);
    postesByMetier.set(p.metier, list);
  }

  let generated = 0;
  let empty = 0;

  for (const row of metiersRows) {
    const meta = METIER_META[row.metier];
    if (!meta) {
      // Métier non déclaré dans le dictionnaire — on garde le slug brut
      const fallbackSlug = row.metier.replace(/_/g, "-");
      console.warn(`   ⚠️  Métier '${row.metier}' non dans le dictionnaire. Slug=${fallbackSlug}`);
    }
    const slug = meta?.slug ?? row.metier.replace(/_/g, "-");
    const label = meta?.label ?? row.metier.replace(/_/g, " ");
    const conseils = meta?.conseils ?? [];

    const topPostes = (postesByMetier.get(row.metier) ?? []).slice(0, 5).map((p) => ({
      label: p.label,
      ratio_median: Number(p.ratio_median),
      nb_obs: p.nb_obs,
    }));

    const data = {
      slug,
      metier: row.metier,
      metier_label: label,
      ...applySeoOverride(
        slug,
        `Prix ${label.toLowerCase()} 2026 : fourchette sur ${row.nb_devis} devis`,
        `${label} : combien coûte le poste en 2026 ? Fourchette des devis analysés par VerifierMonDevis, écarts observés, postes à surveiller avant de signer.`,
        row.nb_devis,
      ),
      lastGenerated: new Date().toISOString(),
      intro: `Nous avons analysé ${row.nb_devis} devis contenant au moins une ligne du métier ${label}. Voici les fourchettes de prix, les postes qui varient le plus et les points à vérifier avant de signer.`,
      kpis: {
        nb_devis: row.nb_devis,
        nb_lignes: row.nb_lignes,
        prix_moyen: Number(row.prix_moyen),
        prix_median: Number(row.prix_median),
        prix_min: Number(row.prix_min),
        prix_max: Number(row.prix_max),
        prix_p25: Number(row.prix_p25),
        prix_p75: Number(row.prix_p75),
        panier_moyen: Number(row.panier_moyen),
        ratio_moyen_vs_marche: row.ratio_moyen_vs_marche
          ? Number(row.ratio_moyen_vs_marche)
          : null,
      },
      postesSurfactures: topPostes,
      conseils,
    };

    if (row.nb_lignes === 0) empty++;
    else generated++;

    writeFileSync(join(METIERS_DIR, `${slug}.json`), JSON.stringify(data, null, 2), "utf-8");
    console.log(
      `   ✓ ${slug}.json (${row.nb_devis} devis · ${row.nb_lignes} lignes · top ${topPostes.length} postes)`,
    );
  }

  return { generated, empty };
}

// ─────────────────────────────────────────────────────────────────────
// GÉNÉRATION 3 : 1 JSON par type de chantier
// ─────────────────────────────────────────────────────────────────────

async function generateChantierPages(): Promise<{ generated: number; empty: number }> {
  console.log("\n🏗️  Génération pages chantier depuis mv_observatoire_chantiers…");

  let rows: any[] = [];
  try {
    const { data, error } = await supabase.from("mv_observatoire_chantiers").select("*");
    if (error) throw error;
    rows = data ?? [];
  } catch (e) {
    console.warn(`   ⚠️  mv_observatoire_chantiers absente (${e instanceof Error ? e.message : String(e)}). Skip.`);
    return { generated: 0, empty: 0 };
  }

  let generated = 0;
  let empty = 0;

  for (const row of rows) {
    const meta = CHANTIER_META[row.chantier_type];
    if (!meta) {
      console.warn(`   ⚠️  Chantier '${row.chantier_type}' non dans le dictionnaire.`);
      continue;
    }
    const slug = row.chantier_type;
    const data = {
      slug,
      chantier_type: row.chantier_type,
      chantier_label: meta.label,
      ...applySeoOverride(
        slug,
        `Prix ${meta.label.toLowerCase()} 2026 : fourchette sur ${row.nb_devis} devis`,
        `${meta.label} : combien prévoir en 2026 ? Fourchette des devis analysés par VerifierMonDevis, postes qui varient le plus, erreurs à éviter avant de signer.`,
        row.nb_devis,
      ),
      lastGenerated: new Date().toISOString(),
      intro: `Nous avons analysé ${row.nb_devis} devis contenant des travaux de type ${meta.label.toLowerCase()}. Voici les fourchettes de prix, les postes qui varient le plus et les points à vérifier avant de signer.`,
      kpis: {
        nb_devis: row.nb_devis,
        nb_lignes: row.nb_lignes,
        ligne_moyenne: Number(row.ligne_moyenne),
        prix_moyen_unitaire: Number(row.prix_moyen_unitaire),
        prix_median: Number(row.prix_median),
        prix_p25: Number(row.prix_p25),
        prix_p75: Number(row.prix_p75),
        prix_min: Number(row.prix_min),
        prix_max: Number(row.prix_max),
      },
      pointsVigilance: meta.pointsVigilance,
      erreursFrequentes: meta.erreursFrequentes,
    };

    if (row.nb_lignes === 0) empty++;
    else generated++;

    writeFileSync(join(CHANTIERS_DIR, `${slug}.json`), JSON.stringify(data, null, 2), "utf-8");
    console.log(`   ✓ ${slug}.json (${row.nb_devis} devis · ${row.nb_lignes} lignes)`);
  }

  return { generated, empty };
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("🟢 Génération Observatoire V1\n");

  const metiers = await generateMetierPages();
  const chantiers = await generateChantierPages();

  console.log(`\n──── Résumé ────`);
  console.log(`  Métiers   : ${metiers.generated} générés · ${metiers.empty} vides`);
  console.log(`  Chantiers : ${chantiers.generated} générés · ${chantiers.empty} vides`);
  console.log(`\n✓ Commit les JSON pour déployer :`);
  console.log(`  git add src/data/observatoire/`);
  console.log(`  git commit -m 'data(observatoire): regen'`);
  console.log(`  git push origin main`);
}

main().catch((err) => {
  console.error("❌ Erreur :", err);
  process.exit(1);
});
