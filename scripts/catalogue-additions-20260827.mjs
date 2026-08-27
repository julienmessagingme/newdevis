// Application du RAPPORT-COUVERTURE-CATALOGUE (2026-08-27) — alias + nouvelles entrées.
// Décision Johan : application directe, fourchettes web-ancrées (désamiantage) — Julien ajuste a posteriori.
// Idempotent : skip si (job_type, label) existe déjà. Lancer depuis la racine :
//   node scripts/catalogue-additions-20260827.mjs
// puis : node scripts/seed_market_prices_embeddings.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(get("PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"));

const SOURCE = "mining stock 2026-08-27 — Claude (désamiantage ancré web travaux.com/desamianter.fr), à ajuster Julien";

// ── ALIAS : même job_type et mêmes prix qu'une entrée existante, libellé calqué
//    sur le phrasé réel des devis (l'embedding du libellé fait le matching). ──
const ALIASES = [
  { target: "enduit_lissage", label: "Enduit de ratissage mural (préparation avant peinture)" },
  { target: "ragreage", label: "Ragréage du sol (réagréage / réangréage)" },
  { target: "prise", label: "Prise de courant 2P+T (ajout ou remplacement)" },
  { target: "reprise_fissures", label: "Grattage et ouverture des fissures murs et plafonds, rebouchage" },
  { target: "pose_vmc_hygro_b_standard", label: "Fourniture et pose d'une VMC simple flux hygroréglable" },
  // ⚠️ cible EXPLICITE (la recherche dynamique avait accroché la nouvelle
  // entrée « Ponçage » 4-10 €/m² — corrigé à la main le 27/08).
  { target: "peinture_murs", label: "Travaux de préparation et application de deux couches de peinture sur murs et plafonds" },
];

// ── NOUVELLES ENTRÉES — refJob : entrée dont on copie domain/metier/zip_scope ──
const NEW_ENTRIES = [
  { job_type: "poncage_preparation_murs_plafonds", label: "Ponçage murs et plafonds (préparation peinture)", unit: "m2", min: 4, max: 10, refJob: "enduit_lissage" },
  { job_type: "coffrage_placo_ml", label: "Coffrage / habillage placo des gaines et réseaux", unit: "ml", min: 25, max: 60, refLike: "%placo%" },
  { job_type: "tirage_alimentation_point_eau", label: "Tirage alimentation EF/EC et évacuation par point d'eau", unit: "point", min: 150, max: 400, refJob: "creation_arrivee_eau" },
  { job_type: "pose_porte_fournie_client", label: "Pose de porte intérieure fournie par le client", unit: "unité", min: 80, max: 180, refLike: "%porte%" },
  { job_type: "placard_sur_mesure_ml", label: "Placard / dressing sur mesure (fourni+posé)", unit: "ml", min: 400, max: 900, refLike: "%placard%" },
  { job_type: "porte_placard_coulissante_m2", label: "Portes de placard coulissantes (fourni+posé)", unit: "m2", min: 150, max: 350, refLike: "%placard%" },
  { job_type: "pac_air_air_multisplit_ui", label: "PAC air/air multi-split — par unité intérieure (fourni+posé)", unit: "unité", min: 900, max: 1800, refJob: "pac_air_air" },
  { job_type: "tableau_electrique_mono", label: "Tableau électrique monophasé rénové (fourni+posé)", unit: "unité", min: 700, max: 1600, refJob: "prise" },
  { job_type: "refection_electrique_m2", label: "Réfection électrique complète du logement (norme NF C 15-100)", unit: "m2", min: 80, max: 140, refJob: "prise" },
  { job_type: "ouverture_mur_non_porteur", label: "Ouverture de passage dans un mur non porteur", unit: "forfait", fixedMin: 400, fixedMax: 1200, refLike: "%cloison%" },
  { job_type: "poteau_beton_arme_u", label: "Poteau béton armé (coffrage, ferraillage, coulage)", unit: "unité", min: 300, max: 700, refJob: "dalle_beton_interieure" },
  { job_type: "poutre_beton_arme_ml", label: "Poutre béton armé coulée en place", unit: "ml", min: 150, max: 350, refJob: "dalle_beton_interieure" },
  { job_type: "fenetre_bois_renovation", label: "Croisée bois 2 vantaux en rénovation (fourni+posé)", unit: "unité", min: 800, max: 1600, refLike: "%fen%tre%" },
  { job_type: "curage_piece_m2", label: "Curage / dépose complète d'une pièce (sol, murs, plafond)", unit: "m2", min: 30, max: 70, refLike: "%d%molition%" },
  { job_type: "ss4_mode_operatoire", label: "Amiante SS4 — mode opératoire et phases administratives (DUERP, Trackdéchets)", unit: "forfait", fixedMin: 1000, fixedMax: 3000, refLike: "%amiant%" },
  { job_type: "ss4_mesure_empoussierement", label: "Amiante — mesure d'empoussièrement (analyse META)", unit: "unité", min: 350, max: 600, refLike: "%amiant%" },
  { job_type: "ss4_evacuation_amiante_lie", label: "Amiante lié — transport et élimination en filière agréée (petit volume)", unit: "forfait", fixedMin: 600, fixedMax: 1500, refLike: "%amiant%" },
  { job_type: "echafaudage_maison_forfait", label: "Échafaudage de façades maison — location, montage et démontage (forfait)", unit: "forfait", fixedMin: 800, fixedMax: 2500, refLike: "%chafaudage%" },
  { job_type: "depose_cloture_forfait", label: "Dépose et évacuation de clôture existante (forfait chantier)", unit: "forfait", fixedMin: 150, fixedMax: 600, refLike: "%cl%ture%" },
];

async function findRef({ refJob, refLike, jobLike, labelLike, unit }) {
  if (refJob) {
    const { data } = await supa.from("market_prices").select("*").eq("job_type", refJob).limit(1);
    if (data?.length) return data[0];
  }
  const like = refLike ?? labelLike;
  if (like) {
    let q = supa.from("market_prices").select("*").ilike("label", like).limit(5);
    const { data } = await q;
    if (data?.length) {
      if (unit) {
        const exact = data.find((r) => r.unit === unit);
        if (exact) return exact;
      }
      return data[0];
    }
  }
  if (jobLike) {
    const { data } = await supa.from("market_prices").select("*").ilike("job_type", `%${jobLike}%`).limit(1);
    if (data?.length) return data[0];
  }
  return null;
}

async function exists(jobType, label) {
  const { data } = await supa.from("market_prices").select("id").eq("job_type", jobType).eq("label", label).limit(1);
  return Boolean(data?.length);
}

let inserted = 0, skipped = 0, failed = 0;

for (const a of ALIASES) {
  const ref = a.target
    ? await findRef({ refJob: a.target })
    : await findRef(a.targetSearch);
  if (!ref) { console.error(`✗ alias "${a.label}" — cible introuvable`); failed++; continue; }
  if (await exists(ref.job_type, a.label)) { skipped++; continue; }
  const row = { ...ref };
  delete row.id; delete row.created_at; delete row.embedding;
  // job_type UNIQUE en base → l'alias porte un job_type suffixé ; mêmes
  // fourchettes, generic_family = la cible (rattachement famille).
  row.job_type = `${ref.job_type}_alias`;
  row.generic_family = ref.generic_family ?? ref.job_type;
  row.label = a.label;
  row.source = SOURCE;
  row.notes = `Alias de "${ref.label}" (même fourchette) — libellé calqué sur le phrasé réel des devis.`;
  const { error } = await supa.from("market_prices").insert(row);
  if (error) { console.error(`✗ alias "${a.label}":`, error.message); failed++; }
  else { console.log(`✓ alias [${ref.job_type}] "${a.label}" (${ref.unit} ${ref.price_min_unit_ht || ref.fixed_min_ht}-${ref.price_max_unit_ht || ref.fixed_max_ht})`); inserted++; }
}

for (const e of NEW_ENTRIES) {
  if (await exists(e.job_type, e.label)) { skipped++; continue; }
  const ref = await findRef(e);
  const isForfait = e.fixedMin !== undefined;
  const row = {
    job_type: e.job_type,
    label: e.label,
    unit: e.unit,
    price_min_unit_ht: isForfait ? 0 : e.min,
    price_avg_unit_ht: isForfait ? 0 : Math.round((e.min + e.max) / 2),
    price_max_unit_ht: isForfait ? 0 : e.max,
    fixed_min_ht: isForfait ? e.fixedMin : 0,
    fixed_avg_ht: isForfait ? Math.round((e.fixedMin + e.fixedMax) / 2) : 0,
    fixed_max_ht: isForfait ? e.fixedMax : 0,
    domain: ref?.domain ?? null,
    metier: ref?.metier ?? null,
    zip_scope: ref?.zip_scope ?? null,
    confidence: "medium",
    source: SOURCE,
    notes: "Nouvelle entrée mining couverture 2026-08-27 — fourchette initiale à ajuster (Julien).",
  };
  const { error } = await supa.from("market_prices").insert(row);
  if (error) { console.error(`✗ ${e.job_type}:`, error.message); failed++; }
  else { console.log(`✓ new  [${e.job_type}] "${e.label}" (${e.unit} ${isForfait ? e.fixedMin + "-" + e.fixedMax + " forfait" : e.min + "-" + e.max})`); inserted++; }
}

console.log(`\n${inserted} insérées, ${skipped} déjà présentes, ${failed} échecs`);
console.log("→ Lancer maintenant : node scripts/seed_market_prices_embeddings.mjs");
