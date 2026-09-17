/**
 * scripts/controle-postes-juges.mjs
 *
 * 🔴 2026-09-17 — LE BANC COMPARE DES MONTANTS ; L'EXPERT A JUGÉ DES POSTES.
 *
 * `banc-rejeu-decisions-expert.mjs` conclut « le moteur accuse encore ce que
 * l'expert avait annulé » en comparant deux NOMBRES. C'est vrai si le moteur
 * réaccuse LES MÊMES postes. Ça ne l'est pas s'il en accuse d'AUTRES, que
 * l'expert n'a jamais eus sous les yeux — et le diagnostic du 17/09 fait
 * soupçonner ce second cas : sur le devis 25030 l'expert parle de « 2 anomalies
 * invalidées » (la charpente au forfait, aujourd'hui correctement écartée),
 * alors que le moteur en produit onze AUTRES.
 *
 * Ce contrôle confronte, devis par devis :
 *   · les postes que l'expert a eus devant lui (`original_conclusion.anomalies`)
 *   · les postes que le moteur d'aujourd'hui accuse
 *
 * ⚠️ IL NE PROUVE PAS QUI A RAISON. Il dit seulement si le désaccord porte sur
 * les mêmes objets — ce qui décide si « 11 défauts vivants » est un compteur de
 * régression ou un compteur de dérive.
 *
 * Usage : npx tsx scripts/controle-postes-juges.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { computeServerSurcout } from "../src/lib/analyse/surcoutServeur.ts";

const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(lire("PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const PLANCHER = 300;
const eur = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;

/** Deux libellés désignent le même poste s'ils se contiennent une fois normalisés. */
const norm = (s) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

function memePoste(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Recouvrement des mots significatifs : deux tiers suffisent à désigner le
  // même ouvrage (« Pose faïence murale » ⟷ « Faïence murale salle de bain »).
  const ma = new Set(na.split(" ").filter((w) => w.length > 3));
  const mb = new Set(nb.split(" ").filter((w) => w.length > 3));
  if (ma.size === 0 || mb.size === 0) return false;
  const communs = [...ma].filter((w) => mb.has(w)).length;
  return communs / Math.min(ma.size, mb.size) >= 0.67;
}

const { data: corrections, error } = await supa
  .from("analysis_corrections")
  .select("analysis_id, action, corrected_surcout_max, original_conclusion")
  .order("reviewed_at", { ascending: false });
if (error) throw new Error(error.message);

const ids = [...new Set(corrections.map((c) => c.analysis_id))];
const { data: analyses } = await supa.from("analyses").select("id, file_name, raw_text").in("id", ids);
const parId = new Map((analyses ?? []).map((a) => [a.id, a]));

let memes = 0, nouveaux = 0;
let montantMemes = 0, montantNouveaux = 0;
const vus = new Set();
const lignes = [];

for (const c of corrections) {
  const a = parId.get(c.analysis_id);
  let r = {};
  try { r = JSON.parse(a?.raw_text ?? "{}"); } catch { /* illisible */ }
  const groupes = Array.isArray(r.n8n_price_data) ? r.n8n_price_data : [];
  if (groupes.length === 0 || vus.has(c.analysis_id)) continue;

  const totalHT = Number(r.extracted_data?.totaux?.ht ?? r.extracted?.totaux?.ht ?? 0) || null;
  const s = computeServerSurcout(groupes, totalHT);
  const original = Number(c.original_conclusion?.surcout_global?.max ?? 0) || 0;
  const expert = c.action === "corrected" ? (Number(c.corrected_surcout_max ?? 0) || 0) : original;
  if (!(expert === 0 && s.max > PLANCHER)) continue;
  vus.add(c.analysis_id);

  // Ce que l'expert avait sous les yeux quand il a tranché.
  const anomaliesAlors = Array.isArray(c.original_conclusion?.anomalies)
    ? c.original_conclusion.anomalies.map((x) => x?.poste ?? x?.libelle ?? x?.label ?? "").filter(Boolean)
    : [];

  const details = [];
  for (const p of s.postes) {
    const dejaJuge = anomaliesAlors.some((n) => memePoste(n, p.label));
    if (dejaJuge) { memes++; montantMemes += p.ecart; }
    else { nouveaux++; montantNouveaux += p.ecart; }
    details.push({ label: p.label, ecart: p.ecart, dejaJuge });
  }

  lignes.push({
    etiquette: a?.file_name ?? c.analysis_id.slice(0, 8),
    total: s.max,
    anomaliesAlors,
    details,
  });
}

console.log(`\n══ LES POSTES ACCUSÉS AUJOURD'HUI SONT-ILS CEUX QUE L'EXPERT A ANNULÉS ? ══\n`);

for (const l of lignes) {
  console.log(`${"─".repeat(76)}`);
  console.log(`📄 ${l.etiquette} — moteur ${eur(l.total)}`);
  console.log(`   l'expert avait devant lui : ${l.anomaliesAlors.length > 0 ? l.anomaliesAlors.map((x) => `« ${x} »`).join(", ") : "(aucune anomalie nommée)"}`);
  for (const d of l.details) {
    console.log(`   ${d.dejaJuge ? "🔴 DÉJÀ JUGÉ" : "🟡 jamais vu "}  ${eur(d.ecart).padStart(9)}  ${d.label}`);
  }
}

// ── TÉMOIN — la ventilation doit totaliser les postes classés ────────────────
const totalPostes = lignes.reduce((n, l) => n + l.details.length, 0);
console.log(`\n══ TÉMOIN ══`);
console.log(`   ${memes + nouveaux === totalPostes ? "✓" : "✗ INCOHÉRENT"} ${totalPostes} postes accusés · ${memes + nouveaux} classés`);
if (memes + nouveaux !== totalPostes) process.exit(1);

console.log(`\n══ RÉSULTAT ══\n`);
console.log(`   🔴 postes que l'expert avait ANNULÉS et que le moteur réaccuse : ${memes}  (${eur(montantMemes)})`);
console.log(`   🟡 postes que l'expert n'a JAMAIS jugés                        : ${nouveaux}  (${eur(montantNouveaux)})`);
