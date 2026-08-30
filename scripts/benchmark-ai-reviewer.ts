/**
 * Banc de test du relecteur IA contre le gold standard humain.
 *
 * Question à laquelle ce script répond : « peut-on lui faire confiance au
 * point de publier son avis sans relecture humaine, et sous quelle
 * condition ? » (Phase C de la refonte, maillon 4 « Apprendre »).
 *
 * Méthode — la seule honnête : pour chaque analyse déjà tranchée par un
 * humain, on rejoue l'agent sur le SNAPSHOT D'AVANT CORRECTION
 * (`analysis_corrections.original_conclusion`), c'est-à-dire exactement ce
 * qu'il voit en production, puis on compare sa recommandation à la décision
 * de l'expert. Rejouer sur la conclusion CORRIGÉE n'aurait aucun sens : on
 * lui montrerait la réponse.
 *
 * La métrique qui décide n'est PAS le taux d'accord global, c'est le taux de
 * FAUX OK : les cas où l'agent dit « publier tel quel » alors que l'humain a
 * corrigé. Chacun de ces cas est une analyse fausse envoyée à un client.
 *
 * Usage :
 *   npx tsx scripts/benchmark-ai-reviewer.ts             # tout le gold standard
 *   npx tsx scripts/benchmark-ai-reviewer.ts --limit 5   # échantillon
 *   npx tsx scripts/benchmark-ai-reviewer.ts --no-pdf    # sans le PDF (moins cher)
 *
 * Coût : ~0,85 € par analyse (Opus 5 + 2 recherches web).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildReviewInstruction } from "../supabase/functions/ai-review-agent/prompt";

const env = readFileSync(".env.local", "utf8");
const pick = (k: string) =>
  (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
const SB_URL = pick("PUBLIC_SUPABASE_URL") || pick("SUPABASE_URL")!;
const KEY = pick("SUPABASE_SERVICE_ROLE_KEY")!;
const AK = pick("ANTHROPIC_API_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const argv = process.argv.slice(2);
const LIMIT = Number(argv[argv.indexOf("--limit") + 1]) || 0;
const NO_PDF = argv.includes("--no-pdf");
const CONCURRENCE = 4;

/** Décision humaine → recommandation attendue de l'agent. */
const ATTENDU: Record<string, string> = {
  corrected: "corriger",
  validated: "valider",
  rejected: "rejeter_faux_positif",
};

interface Cas {
  analysisId: string;
  fileName: string;
  actionHumaine: string;
  verdictHumain: string | null;
  notesExpert: string | null;
  agent?: Record<string, any>;
  erreur?: string;
  dureeS?: number;
}

async function signedUrl(filePath: string): Promise<string | null> {
  const r = await fetch(`${SB_URL}/storage/v1/object/sign/devis/${filePath}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  if (!r.ok) return null;
  return `${SB_URL}/storage/v1${(await r.json()).signedURL}`;
}

async function rejouer(cas: Cas, snapshot: Record<string, any>): Promise<void> {
  const [a] = await (
    await fetch(`${SB_URL}/rest/v1/analyses?id=eq.${cas.analysisId}&select=file_path,raw_text`, { headers: H })
  ).json();
  if (!a) { cas.erreur = "analyse introuvable"; return; }

  let raw: Record<string, any> = {};
  try { raw = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : (a.raw_text ?? {}); } catch { /* vide */ }
  const priceData = Array.isArray(raw.n8n_price_data) ? raw.n8n_price_data : [];

  const url = !NO_PDF && a.file_path ? await signedUrl(a.file_path) : null;
  const instruction = buildReviewInstruction({
    conclusion: snapshot,
    scoring: (raw.scoring ?? {}) as Record<string, any>,
    priceData,
    hasPdf: Boolean(url),
  });

  const content: Array<Record<string, unknown>> = [];
  if (url) content.push({ type: "document", source: { type: "url", url } });
  content.push({ type: "text", text: instruction });

  const t0 = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": AK, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-opus-5",
      max_tokens: 5000,
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }],
      messages: [{ role: "user", content }],
    }),
  });
  cas.dureeS = Math.round((Date.now() - t0) / 1000);
  if (!res.ok) { cas.erreur = `HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`; return; }

  const j = await res.json();
  const text = (j.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  try {
    cas.agent = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    cas.erreur = "JSON illisible";
  }
}

(async () => {
  const corrections = await (
    await fetch(
      `${SB_URL}/rest/v1/analysis_corrections?select=analysis_id,action,corrected_verdict_decisionnel,original_conclusion,expert_notes,reviewed_at&order=reviewed_at.desc&limit=200`,
      { headers: H },
    )
  ).json();

  // Une analyse peut avoir été corrigée deux fois : on garde la décision la
  // plus récente, c'est elle qui fait foi.
  const parAnalyse = new Map<string, any>();
  for (const c of corrections) if (!parAnalyse.has(c.analysis_id)) parAnalyse.set(c.analysis_id, c);

  const noms = await (
    await fetch(`${SB_URL}/rest/v1/analyses?select=id,file_name&limit=500`, { headers: H })
  ).json();
  const nomPar = new Map(noms.map((n: any) => [n.id, n.file_name]));

  let entrees = [...parAnalyse.values()];
  if (LIMIT) entrees = entrees.slice(0, LIMIT);

  const cas: Cas[] = entrees.map((c) => ({
    analysisId: c.analysis_id,
    fileName: String(nomPar.get(c.analysis_id) ?? "?"),
    actionHumaine: c.action,
    verdictHumain: c.corrected_verdict_decisionnel ?? null,
    notesExpert: c.expert_notes ?? null,
  }));

  console.log(`${cas.length} analyses à rejouer · PDF ${NO_PDF ? "non joint" : "joint"} · coût estimé ~${(cas.length * 0.85).toFixed(0)} €\n`);

  let faits = 0;
  for (let i = 0; i < cas.length; i += CONCURRENCE) {
    const lot = cas.slice(i, i + CONCURRENCE);
    await Promise.all(lot.map(async (c) => {
      const snap = parAnalyse.get(c.analysisId).original_conclusion;
      try { await rejouer(c, snap ?? {}); } catch (e) {
        c.erreur = e instanceof Error ? e.message : String(e);
      }
      faits++;
      const reco = c.agent?.action_recommandee ?? c.erreur ?? "?";
      console.log(`  [${String(faits).padStart(2)}/${cas.length}] ${c.fileName.slice(0, 30).padEnd(31)} humain=${c.actionHumaine.padEnd(9)} agent=${String(reco).padEnd(20)} conf=${c.agent?.confiance ?? "—"} (${c.dureeS ?? "?"}s)`);
    }));
  }

  // ── Résultats ────────────────────────────────────────────────────────────
  const valides = cas.filter((c) => c.agent && !c.erreur);
  const accord = valides.filter((c) => c.agent!.action_recommandee === ATTENDU[c.actionHumaine]);
  // FAUX OK : l'humain a corrigé, l'agent aurait publié tel quel.
  const fauxOk = valides.filter(
    (c) => c.actionHumaine === "corrected" &&
      ["valider", "rejeter_faux_positif"].includes(c.agent!.action_recommandee),
  );
  // FAUSSE ALARME : l'humain a validé/rejeté, l'agent voulait réécrire.
  const fausseAlarme = valides.filter(
    (c) => c.actionHumaine !== "corrected" && c.agent!.action_recommandee === "corriger",
  );

  const pct = (n: number) => valides.length ? `${Math.round((100 * n) / valides.length)} %` : "—";
  console.log(`\n═══ RÉSULTATS (${valides.length} analyses exploitables sur ${cas.length}) ═══`);
  console.log(`  accord exact sur l'action : ${accord.length}/${valides.length} (${pct(accord.length)})`);
  console.log(`  FAUX OK (publierait une analyse fausse) : ${fauxOk.length} (${pct(fauxOk.length)})`);
  console.log(`  fausses alarmes (réécrirait une analyse juste) : ${fausseAlarme.length} (${pct(fausseAlarme.length)})`);

  // Le seuil de confiance est le garde-fou proposé : mesurons-le.
  console.log("\n  ── Publication automatique selon le seuil de confiance ──");
  for (const seuil of [0.7, 0.75, 0.8, 0.85, 0.9]) {
    const auto = valides.filter((c) => Number(c.agent!.confiance ?? 0) >= seuil);
    const rates = auto.filter(
      (c) => c.actionHumaine === "corrected" &&
        ["valider", "rejeter_faux_positif"].includes(c.agent!.action_recommandee),
    );
    console.log(`    seuil ${seuil} → ${auto.length}/${valides.length} publiables automatiquement, dont ${rates.length} erreur(s) publiée(s)`);
  }

  const rapport = [
    `# Banc de test du relecteur IA — ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `${valides.length} analyses du gold standard rejouées sur leur état d'avant correction.`,
    ``,
    `| Devis | Décision humaine | Reco agent | Confiance | Accord |`,
    `|---|---|---|---|---|`,
    ...valides.map((c) => {
      const ok = c.agent!.action_recommandee === ATTENDU[c.actionHumaine];
      return `| ${c.fileName.slice(0, 34)} | ${c.actionHumaine} | ${c.agent!.action_recommandee} | ${c.agent!.confiance} | ${ok ? "oui" : "**non**"} |`;
    }),
    ``,
    `## Désaccords`,
    ``,
    ...valides.filter((c) => c.agent!.action_recommandee !== ATTENDU[c.actionHumaine]).map((c) =>
      [
        `### ${c.fileName} — humain « ${c.actionHumaine} », agent « ${c.agent!.action_recommandee} » (confiance ${c.agent!.confiance})`,
        ``,
        `**Agent :** ${c.agent!.resume}`,
        ``,
        `**Expert :** ${(c.notesExpert ?? "(aucune note)").slice(0, 700)}`,
        ``,
      ].join("\n")),
    ...(cas.filter((c) => c.erreur).length
      ? [`## Échecs techniques`, ``, ...cas.filter((c) => c.erreur).map((c) => `- ${c.fileName} : ${c.erreur}`)]
      : []),
  ].join("\n");

  const out = "docs/refonte/RAPPORT-RELECTEUR-IA.md";
  writeFileSync(out, rapport);
  console.log(`\nrapport détaillé écrit dans ${out}`);
})();
