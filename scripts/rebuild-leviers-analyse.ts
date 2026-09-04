/**
 * Reconstruit les leviers + la ligne de verdict d'UNE analyse, sans repasser
 * par le pipeline.
 *
 * Pourquoi ce script existe (2026-08-29) : une conclusion corrigée par un
 * expert ne peut PAS être régénérée par le pipeline — la régénération
 * rejouerait le matching catalogue et ferait revenir les anomalies que
 * l'expert vient d'invalider. Quand un correctif touche uniquement la couche
 * Phase 4 (leviers déterministes), on rejoue donc cette seule couche sur la
 * conclusion stockée.
 *
 * ⚠️ 2026-09-03 — la première version forçait `travaux_gros_oeuvre: true` et
 * ignorait les clauses et l'acompte : elle REJOUAIT donc le conseil
 * dommages-ouvrage même là où il était hors sujet. Les signaux sont désormais
 * dérivés des données réelles du devis, avec les mêmes fonctions que le
 * moteur (`grosOeuvre.ts`), pour que le rejeu dise exactement ce que dirait
 * une analyse fraîche.
 *
 * Usage :
 *   npx tsx scripts/rebuild-leviers-analyse.ts <analysisId>          (simulation)
 *   npx tsx scripts/rebuild-leviers-analyse.ts <analysisId> --apply
 */
import { readFileSync } from "node:fs";
import { buildLeviers, buildVerdictLigne, type LevierSignals } from "../src/lib/analyse/leviersBuilder";
import { estGrosOeuvre, motifGrosOeuvre, type LigneTravaux } from "../src/lib/analyse/grosOeuvre";

const env = readFileSync(".env.local", "utf8");
const pick = (k: string) =>
  (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
const SB_URL = pick("PUBLIC_SUPABASE_URL") || pick("SUPABASE_URL");
const KEY = pick("SUPABASE_SERVICE_ROLE_KEY");
const H = { apikey: KEY!, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const ID = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!ID) throw new Error("usage: rebuild-leviers-analyse.ts <analysisId> [--apply]");

const DO_RE = /dommages?[-\s]ouvrage|\bassurance\s+d\.?o\.?\b/i;
const METRIQUE_RE = /^(m2|m²|m3|m³|ml|mètre|metre)/i;

/** Même règle que `hasIncomparableUnit` du moteur : un prix au m² face à une
 *  ligne sans quantité métrique n'est pas comparable. */
function uniteIncomparable(g: Record<string, any>): boolean {
  const prices: Array<Record<string, any>> = Array.isArray(g?.prices) ? g.prices : [];
  if (prices.length === 0) return false;
  const metrique = prices.some(
    (p) => Number(p?.price_max_unit_ht) > 0 && METRIQUE_RE.test(String(p?.unit ?? "").trim()),
  );
  if (!metrique) return false;
  return !(METRIQUE_RE.test(String(g?.main_unit ?? "").trim()) && Number(g?.main_quantity ?? 0) > 0);
}

(async () => {
  const [a] = await (
    await fetch(`${SB_URL}/rest/v1/analyses?id=eq.${ID}&select=file_name,raw_text,conclusion_ia`, { headers: H })
  ).json();
  if (!a) throw new Error("analyse introuvable");

  const raw = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : (a.raw_text ?? {});
  const ed = raw.extracted_data ?? raw.extracted ?? {};
  const c = typeof a.conclusion_ia === "string" ? JSON.parse(a.conclusion_ia) : a.conclusion_ia;
  const travaux: Array<Record<string, any>> = Array.isArray(ed.travaux) ? ed.travaux : [];
  const priceData: Array<Record<string, any>> = Array.isArray(raw.n8n_price_data) ? raw.n8n_price_data : [];
  const totalHt = Number(ed?.totaux?.ht ?? 0) || null;

  const texte = (t: Record<string, any>) => `${t?.description ?? ""} ${t?.libelle ?? ""}`;
  const doMontant = travaux.reduce(
    (acc, t) => (DO_RE.test(texte(t)) && Number(t?.montant_ht ?? t?.montant ?? 0) > 0
      ? acc + Number(t?.montant_ht ?? t?.montant ?? 0)
      : acc),
    0,
  );

  const modalites: Array<Record<string, any>> = Array.isArray(ed?.paiement?.modalites_paiement)
    ? ed.paiement.modalites_paiement
    : [];
  const pctLivraison = modalites
    .filter((m) => String(m?.etape ?? "") === "livraison_materiaux")
    .reduce((s, m) => s + (Number(m?.pct ?? 0) || 0), 0);
  const PRE_PRESTATION = new Set(["signature", "demarrage", "livraison_materiaux"]);
  const acompteCumule = modalites
    .filter((m) => PRE_PRESTATION.has(String(m?.etape ?? "")))
    .reduce((s, m) => s + (Number(m?.pct ?? 0) || 0), 0);

  // La demande de quantités n'a de sens que si leur absence bloque vraiment.
  const montantBloque = priceData.reduce(
    (s, g) => (Number(g?.devis_total_ht ?? 0) > 0 && uniteIncomparable(g)
      ? s + Number(g.devis_total_ht)
      : s),
    0,
  );
  const quantitesBloquantes = totalHt ? montantBloque / totalHt >= 0.25 : false;

  const signals: LevierSignals = {
    verdict_decisionnel: c.verdict_decisionnel,
    total_ht: totalHt,
    surcout: { min: Number(c.surcout_global?.min ?? 0) || 0, max: Number(c.surcout_global?.max ?? 0) || 0 },
    anomalies_postes: (c.anomalies ?? []).map((x: Record<string, unknown>) => String(x?.poste ?? "")),
    surcout_nomme: (c.anomalies ?? []).reduce(
      (s: number, x: Record<string, any>) => s + (Number(x?.surcout_estime ?? 0) > 0 ? Number(x.surcout_estime) : 0),
      0,
    ) || null,
    quantites_manquantes: quantitesBloquantes,
    clauses_litigieuses: Array.isArray(ed?.clauses_litigieuses) ? ed.clauses_litigieuses : [],
    acompte_cumule_pct: acompteCumule > 0 ? acompteCumule : null,
    acompte_livraison_pct: pctLivraison > 0 ? pctLivraison : null,
    paiement_especes_seul: false,
    entreprise_risque: null,
    assurance_absente: false,
    date_devis: typeof ed?.dates?.date_devis === "string" ? ed.dates.date_devis : null,
    travaux_gros_oeuvre: estGrosOeuvre(travaux as LigneTravaux[]),
    gros_oeuvre_motif: motifGrosOeuvre(travaux as LigneTravaux[]),
    retenue_garantie_prevue: /retenue\s+de\s+garantie/i.test(JSON.stringify(ed?.paiement ?? {})),
    assurance_do_montant: doMontant > 0 ? doMontant : null,
  };

  const leviers = buildLeviers(signals);
  const verdictLigne = buildVerdictLigne(signals, leviers);

  console.log(`${a.file_name} — ${totalHt ?? "?"} € HT`);
  console.log(`  acompte cumulé ${signals.acompte_cumule_pct ?? "—"} % (dont ${pctLivraison || 0} % à la livraison)`);
  console.log(`  gros œuvre : ${signals.travaux_gros_oeuvre ? `oui — ${signals.gros_oeuvre_motif}` : "non"}`);
  console.log(`  quantités bloquantes : ${quantitesBloquantes ? "oui" : "non"} (${Math.round((totalHt ? montantBloque / totalHt : 0) * 100)} % du montant)`);
  console.log("\nAVANT :", (c.leviers ?? []).map((l: Record<string, unknown>) => l.type).join(", "));
  console.log("APRÈS :", leviers.map((l) => l.type).join(", "));
  for (const l of leviers) console.log(`  · [${l.type}] ${l.titre}`);
  console.log("\nhero :", verdictLigne.resume);

  if (!APPLY) {
    console.log("\n(simulation — relancer avec --apply)");
    return;
  }
  c.leviers = leviers;
  c.verdict_ligne = verdictLigne;
  const r = await fetch(`${SB_URL}/rest/v1/analyses?id=eq.${ID}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ conclusion_ia: JSON.stringify(c) }),
  });
  console.log(r.ok ? "\nconclusion mise à jour" : `\nECHEC HTTP ${r.status}`);
})();
