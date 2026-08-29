/**
 * Reconstruit les leviers + la ligne de verdict d'UNE analyse déjà corrigée,
 * sans repasser par le pipeline.
 *
 * Pourquoi ce script existe (2026-08-29) : une conclusion corrigée par un
 * expert ne peut PAS être régénérée par le pipeline — la régénération
 * rejouerait le matching catalogue et ferait revenir les anomalies que
 * l'expert vient d'invalider. Quand un correctif touche uniquement la couche
 * Phase 4 (leviers déterministes), on rejoue donc cette seule couche sur la
 * conclusion stockée.
 *
 * Usage :
 *   npx tsx scripts/rebuild-leviers-analyse.ts <analysisId>          (simulation)
 *   npx tsx scripts/rebuild-leviers-analyse.ts <analysisId> --apply
 */
import { readFileSync } from "node:fs";
import { buildLeviers, buildVerdictLigne, type LevierSignals } from "../src/lib/analyse/leviersBuilder";

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

(async () => {
  const [a] = await (
    await fetch(`${SB_URL}/rest/v1/analyses?id=eq.${ID}&select=file_name,raw_text,conclusion_ia`, { headers: H })
  ).json();
  if (!a) throw new Error("analyse introuvable");

  const raw = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : (a.raw_text ?? {});
  const ed = raw.extracted_data ?? raw.extracted ?? {};
  const c = typeof a.conclusion_ia === "string" ? JSON.parse(a.conclusion_ia) : a.conclusion_ia;
  const travaux: Array<Record<string, unknown>> = Array.isArray(ed.travaux) ? ed.travaux : [];

  const doMontant = travaux.reduce((acc, t) => {
    const label = `${t?.description ?? ""} ${t?.libelle ?? ""}`;
    if (!DO_RE.test(label)) return acc;
    const m = Number(t?.montant_ht ?? t?.montant ?? 0);
    return Number.isFinite(m) && m > 0 ? acc + m : acc;
  }, 0);

  // On repart de la conclusion CORRIGÉE : surcoût et anomalies sont ceux que
  // l'expert a validés, jamais ceux du pipeline.
  const signals: LevierSignals = {
    verdict_decisionnel: c.verdict_decisionnel,
    total_ht: Number(ed?.totaux?.ht ?? 0) || null,
    surcout: { min: Number(c.surcout_global?.min ?? 0) || 0, max: Number(c.surcout_global?.max ?? 0) || 0 },
    anomalies_postes: (c.anomalies ?? []).map((x: Record<string, unknown>) => String(x?.poste ?? "")),
    quantites_manquantes: false,
    clauses_litigieuses: [],
    acompte_cumule_pct: null,
    paiement_especes_seul: false,
    entreprise_risque: null,
    assurance_absente: false,
    // La date vit dans extracted.dates.date_devis (même source que conclusion.ts)
    date_devis: typeof (ed?.dates as Record<string, unknown>)?.date_devis === "string"
      ? ((ed.dates as Record<string, string>).date_devis)
      : null,
    travaux_gros_oeuvre: true,
    retenue_garantie_prevue: /retenue\s+de\s+garantie/i.test(JSON.stringify(ed?.paiement ?? {})),
    assurance_do_montant: doMontant > 0 ? doMontant : null,
  };

  const leviers = buildLeviers(signals);
  const verdictLigne = buildVerdictLigne(signals, leviers);

  console.log(`${a.file_name} — DO facturée : ${doMontant || "aucune"} € · devis du ${signals.date_devis ?? "?"}`);
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
