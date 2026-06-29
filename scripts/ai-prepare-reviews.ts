#!/usr/bin/env tsx
/**
 * scripts/ai-prepare-reviews.ts
 *
 * 🟢 Phase B — Assistant pré-révision (IA prépare le terrain, humain valide)
 *
 * Pour chaque analyse review_status='pending_review' :
 *  1. Fetch conclusion_ia + extraction + déclencheurs Piste C
 *  2. Télécharge le PDF depuis Supabase Storage
 *  3. Appelle Claude Sonnet 4.6 avec le PDF + le contexte VMD
 *  4. Parse la recommandation structurée (action / verdict / note)
 *  5. Écrit un fichier markdown récapitulatif `docs/refonte/pending-reviews-ai-prep.md`
 *  6. Affiche un résumé console avec un lien direct par analyse
 *
 * AUCUNE mutation DB. Juste de la préparation. L'humain décide.
 *
 * USAGE :
 *   npx tsx scripts/ai-prepare-reviews.ts                # toutes les pending
 *   npx tsx scripts/ai-prepare-reviews.ts --id <uuid>    # une seule
 *   npx tsx scripts/ai-prepare-reviews.ts --no-pdf       # skip PDF (fallback texte)
 *
 * Requiert :
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (déjà dans .env.local)
 *   - ANTHROPIC_API_KEY (à ajouter dans .env.local — même clé que côté Supabase)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnvFile(name: string): boolean {
  const p = join(ROOT, name);
  if (!existsSync(p)) return false;
  const content = readFileSync(p, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
  return true;
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Env vars manquantes (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY manquante dans .env.local");
  console.error("   Récupère-la dans https://console.anthropic.com/settings/keys");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const args = process.argv.slice(2);
const onlyId = args.includes("--id") ? args[args.indexOf("--id") + 1] : null;
const skipPdf = args.includes("--no-pdf");

const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

interface Recommendation {
  recommended_action: "validated" | "corrected" | "rejected";
  confidence: "high" | "medium" | "low";
  recommended_verdict_global: "dans_la_norme" | "eleve_justifie" | "a_negocier" | "a_risque";
  recommended_verdict_decisionnel: "signer" | "signer_avec_negociation" | "ne_pas_signer";
  recommended_surcout_min: number;
  recommended_surcout_max: number;
  clear_anomalies: boolean;
  key_findings: string[];
  expert_note_for_admin: string;
  reasoning: string;
}

interface PendingAnalysis {
  id: string;
  file_name: string | null;
  file_path: string | null;
  created_at: string;
  user_id: string | null;
  conclusion_ia: string | null;
  raw_text: string | null;
}

// ──────────────────────────────────────────────────────────────────────
// Helpers fetch + extraction (recopie minimale depuis admin-fetch-pending-reviews)
// ──────────────────────────────────────────────────────────────────────

function safeParse(s: unknown): any {
  if (!s || typeof s !== "string") return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function computeTriggers(conclusion: any, raw: any): string[] {
  const triggers: string[] = [];
  if (!conclusion) return triggers;
  const verdictG = conclusion.verdict_global;
  if (verdictG === "a_risque" || verdictG === "refuser") triggers.push(`verdict=${verdictG}`);
  const surcoutMax = conclusion.surcout_global?.max ?? 0;
  if (surcoutMax > 2000) triggers.push(`surcout_max=${Math.round(surcoutMax)}€`);
  const nbAnomalies = Array.isArray(conclusion.anomalies) ? conclusion.anomalies.length : 0;
  if (nbAnomalies >= 2) triggers.push(`anomalies=${nbAnomalies}`);
  if (conclusion.is_foreign_quote) triggers.push("bypass=foreign");
  if (conclusion.is_incomplete_quote) triggers.push("bypass=incomplete");
  if (conclusion.hors_scope) triggers.push("bypass=hors_scope");
  if (conclusion.estimation_courtier) triggers.push("bypass=courtier");
  if (Array.isArray(raw?.n8n_price_data)) {
    let worstRatio = 0;
    let worstLabel = "";
    for (const g of raw.n8n_price_data) {
      if (!g || typeof g !== "object") continue;
      const devisTotal = typeof g.devis_total_ht === "number" ? g.devis_total_ht : 0;
      if (devisTotal <= 0) continue;
      const prices = Array.isArray(g.prices) ? g.prices : [];
      const qty =
        typeof g.main_quantity === "number" && g.main_quantity > 0 ? g.main_quantity : 1;
      let theoMax = 0;
      for (const p of prices) {
        theoMax += (typeof p.price_max_unit_ht === "number" ? p.price_max_unit_ht : 0) * qty;
        theoMax += typeof p.fixed_max_ht === "number" ? p.fixed_max_ht : 0;
      }
      if (theoMax <= 0) continue;
      const ratio = devisTotal / theoMax;
      if (ratio > worstRatio) {
        worstRatio = ratio;
        worstLabel = String(g.job_type_label ?? g.job_type ?? "?");
      }
    }
    if (worstRatio > 5) triggers.push(`ratio_aberrant=${worstRatio.toFixed(1)}× ("${worstLabel}")`);
  }
  return triggers;
}

async function downloadPdfAsBase64(filePath: string): Promise<string | null> {
  const candidates = ["documents", "analyses", "uploads", "devis"];
  for (const bucket of candidates) {
    const { data, error } = await supabase.storage.from(bucket).download(filePath);
    if (error || !data) continue;
    const buf = Buffer.from(await data.arrayBuffer());
    return buf.toString("base64");
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// Prompt Claude — système (rôle expert VMD)
// ──────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es l'expert qui valide les analyses VerifierMonDevis.fr.

CONTEXTE : VMD est un outil qui analyse des devis d'artisans français (BTP, rénovation, plomberie, etc.). Le moteur d'analyse (Gemini 2.5-flash + scoring custom) produit un verdict par devis : "dans_la_norme" (vert), "eleve_justifie" / "a_negocier" (orange), ou "a_risque" (rouge). Quand le moteur a un doute (déclencheurs "Piste C" : verdict ROUGE, surcout > 2000€, anomalies ≥ 2, ratio aberrant > 5×, bypass actif), l'analyse passe en "pending_review" pour qu'un humain tranche.

TON RÔLE : tu prépares la décision pour l'admin. Pour chaque analyse pending_review, tu recommandes UNE action (validated / corrected / rejected) avec confidence (high / medium / low). L'admin VALIDE ta reco en un clic OU la corrige.

BIAIS CONNUS du moteur VMD à reconnaître :
1. **Forfait vs prix unitaire catalogue** : si une ligne devis est en forfait (qty=1) et le catalogue marché est en prix unitaire (ml/m²/U), le ratio peut être >5× sans que ce soit anormal. Quasi systématique sur "échafaudage location + montage/démontage" et "évacuation gravats".
2. **Bug extraction tableau ALES Rénovation** : Gemini décale les colonnes → montants attribués à la mauvaise ligne (ex: "WC 8950€" alors qu'aucun WC n'existe dans le devis). Suspect si une ligne improbable a un montant aberrant et que le total HT du devis reste cohérent.
3. **Catalogue marché qui SOUS-COUVRE** : pour des prestations techniques (ANC réhabilitation, géothermie, sécurisation structurelle), le catalogue agrégé peut donner une fourchette trop basse → fausse "anomalie" surcout. Si overprice > +50% global SANS anomalie poste par poste = catalogue sous-couvre, pas devis cher.
4. **Devis étranger** (IBAN BE/LU/CH, TVA 6%/21%) : comparaison catalogue FR non applicable.

VRAIS SIGNAUX ROUGE qui méritent verdict "a_risque" :
- Clauses litigieuses (modification unilatérale prix, pas de rétractation > illégal en France)
- Entreprise en cessation/liquidation/radiée
- Acompte cumulé > 50% avant démarrage effectif
- Absence d'assurance RC Pro / décennale
- SIRET invalide / nom entreprise = blabla légal

INDICATEURS PRIX BTP français (2025-2026, fourchettes approximatives) :
- Toiture ardoise neuve : 100-160€/m²
- Rénovation salle de bain complète : 800-1500€/m² ou 8-15k€ forfait
- Rénovation maison clé en main : 800-2000€/m² ou 60-150k€ pour maison 100m²
- Réfection de zinguerie/gouttières : 60-90€/ml
- Dépose mur porteur + pose IPN : 3-6k€
- Maçonnerie petite reprise (fissures, scellements) : 500-2000€ forfait

FORMAT DE RÉPONSE OBLIGATOIRE : tu réponds EXCLUSIVEMENT avec un bloc JSON encadré par <recommandation>...</recommandation>. Aucun texte avant ou après. Structure :

<recommandation>
{
  "recommended_action": "validated" | "corrected" | "rejected",
  "confidence": "high" | "medium" | "low",
  "recommended_verdict_global": "dans_la_norme" | "eleve_justifie" | "a_negocier" | "a_risque",
  "recommended_verdict_decisionnel": "signer" | "signer_avec_negociation" | "ne_pas_signer",
  "recommended_surcout_min": <nombre>,
  "recommended_surcout_max": <nombre>,
  "clear_anomalies": <true si tu veux effacer les anomalies levées par l'IA, false sinon>,
  "key_findings": ["constat 1 court", "constat 2 court", "constat 3 court"],
  "expert_note_for_admin": "Note destinée à l'admin (interne, jamais montrée au user). 3-5 phrases. Explique le pourquoi de la reco.",
  "reasoning": "Raisonnement complet pour audit gold standard. Détaille pourquoi tu écartes/confirmes les déclencheurs Piste C, ce que tu vois dans le PDF, et ta décision finale."
}
</recommandation>

Conventions :
- "validated" = le verdict IA est juste, l'admin clique "Valider (IA juste)" → email "confirmée" au user
- "corrected" = le verdict IA est faux, l'admin clique "Corriger" → l'admin override avec ton verdict suggéré → email "ajustée" au user
- "rejected" = la Piste C s'est déclenchée à tort, l'analyse n'aurait pas dû être flagée → email "confirmée" au user (faux positif)`;

// ──────────────────────────────────────────────────────────────────────
// Appel Claude
// ──────────────────────────────────────────────────────────────────────

async function callClaude(
  pdfBase64: string | null,
  contextText: string,
): Promise<Recommendation | null> {
  const content: any[] = [];
  if (pdfBase64) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
    });
  }
  content.push({ type: "text", text: contextText });

  const body = {
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`  ❌ Claude API ${res.status}: ${await res.text()}`);
    return null;
  }
  const json = await res.json();
  const text =
    json?.content?.find?.((b: any) => b.type === "text")?.text ??
    json?.content?.[0]?.text ??
    "";
  const match = /<recommandation>([\s\S]*?)<\/recommandation>/.exec(text);
  if (!match) {
    console.error("  ❌ Réponse Claude sans bloc <recommandation>:", text.slice(0, 200));
    return null;
  }
  try {
    return JSON.parse(match[1].trim()) as Recommendation;
  } catch (e) {
    console.error(
      "  ❌ JSON invalide dans <recommandation>:",
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Construction du contexte texte à passer à Claude
// ──────────────────────────────────────────────────────────────────────

function buildContextText(
  analysis: PendingAnalysis,
  conclusion: any,
  raw: any,
  triggers: string[],
): string {
  const ext = raw?.extracted ?? raw?.extracted_data ?? raw ?? {};
  const lines: string[] = [];
  lines.push(`# Analyse VMD à pré-valider`);
  lines.push(`\n**file_name** : ${analysis.file_name}`);
  lines.push(`**id** : ${analysis.id}`);
  lines.push(`**déclencheurs Piste C** : ${triggers.join(" · ") || "(aucun)"}`);

  lines.push(`\n## Verdict actuel du moteur VMD`);
  lines.push(`- verdict_global       = ${conclusion?.verdict_global ?? "—"}`);
  lines.push(`- verdict_decisionnel  = ${conclusion?.verdict_decisionnel ?? "—"}`);
  lines.push(
    `- surcout              = ${Math.round(conclusion?.surcout_global?.min ?? 0)}€ – ${Math.round(conclusion?.surcout_global?.max ?? 0)}€`,
  );
  const nbAnom = Array.isArray(conclusion?.anomalies) ? conclusion.anomalies.length : 0;
  lines.push(`- anomalies            = ${nbAnom}`);
  if (conclusion?.phrase_intro) lines.push(`- intro                = ${conclusion.phrase_intro}`);
  if (Array.isArray(conclusion?.anomalies)) {
    for (const a of conclusion.anomalies.slice(0, 5)) {
      lines.push(`  🔴 ${String(a?.titre ?? a?.title ?? "?")}: ${String(a?.explication ?? "").slice(0, 200)}`);
    }
  }

  lines.push(`\n## Extraction (ce que Gemini a lu dans le PDF)`);
  lines.push(`- type_document   : ${ext.type_document ?? "—"}`);
  lines.push(`- entreprise      : ${ext.entreprise?.nom ?? "—"}`);
  lines.push(`- siret           : ${ext.entreprise?.siret ?? "—"}`);
  lines.push(`- iban            : ${ext.entreprise?.iban ?? "—"}`);
  lines.push(`- total HT / TTC  : ${ext.totaux?.ht ?? "?"}€ / ${ext.totaux?.ttc ?? "?"}€`);
  if (ext.country_code && ext.country_code !== "FR")
    lines.push(`- ⚠️ country_code : ${ext.country_code}`);
  if (Array.isArray(ext.echeancier) && ext.echeancier.length) {
    lines.push(`- échéancier :`);
    for (const e of ext.echeancier)
      lines.push(`    · ${e.etape ?? "?"} = ${e.pourcentage ?? "?"}% (${e.montant ?? "?"}€)`);
  }
  if (Array.isArray(ext.travaux) && ext.travaux.length) {
    lines.push(`- travaux (${ext.travaux.length} lignes) :`);
    for (const t of ext.travaux.slice(0, 20))
      lines.push(
        `    · ${t.quantite ?? "?"} ${t.unite ?? "?"} | ${t.montant ?? "?"}€ | ${String(t.libelle ?? "—").slice(0, 100)}`,
      );
    if (ext.travaux.length > 20) lines.push(`    ... +${ext.travaux.length - 20} lignes`);
  }
  if (Array.isArray(ext.clauses_litigieuses) && ext.clauses_litigieuses.length) {
    lines.push(`- clauses_litigieuses :`);
    for (const c of ext.clauses_litigieuses)
      lines.push(
        `    ⚠️ ${String(c.type ?? "?")}: "${String(c.citation ?? "").slice(0, 200)}"`,
      );
  }

  lines.push(`\n## Matching catalogue (poste par poste, sortie du moteur)`);
  const groups = Array.isArray(raw?.n8n_price_data) ? raw.n8n_price_data : [];
  for (const g of groups.slice(0, 30)) {
    const devis = g.devis_total_ht ?? 0;
    const prices = Array.isArray(g.prices) ? g.prices : [];
    const qty = typeof g.main_quantity === "number" && g.main_quantity > 0 ? g.main_quantity : 1;
    let theoMin = 0;
    let theoMax = 0;
    for (const p of prices) {
      theoMin += (typeof p.price_min_unit_ht === "number" ? p.price_min_unit_ht : 0) * qty;
      theoMin += typeof p.fixed_min_ht === "number" ? p.fixed_min_ht : 0;
      theoMax += (typeof p.price_max_unit_ht === "number" ? p.price_max_unit_ht : 0) * qty;
      theoMax += typeof p.fixed_max_ht === "number" ? p.fixed_max_ht : 0;
    }
    const range = theoMin > 0 || theoMax > 0 ? `[${theoMin}-${theoMax}€]` : "(non comparable)";
    lines.push(`- ${g.job_type_label ?? g.job_type ?? "?"} → devis ${devis}€ vs marché ${range}`);
  }

  lines.push(`\n## Ta mission`);
  lines.push(
    `Le PDF du devis est attaché. Lis-le pour vérifier l'extraction Gemini ci-dessus, juger la cohérence du verdict, puis renvoie ta recommandation au format <recommandation>{...}</recommandation>.`,
  );
  return lines.join("\n");
}

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("🟢 Phase B — Pré-révision IA des analyses pending_review\n");

  let query = supabase
    .from("analyses")
    .select("id, file_name, file_path, created_at, user_id, conclusion_ia, raw_text")
    .eq("review_status", "pending_review")
    .order("created_at", { ascending: false });
  if (onlyId)
    query = supabase
      .from("analyses")
      .select("id, file_name, file_path, created_at, user_id, conclusion_ia, raw_text")
      .eq("id", onlyId);

  const { data, error } = await query;
  if (error) {
    console.error("❌ Erreur fetch :", error.message);
    process.exit(1);
  }
  const rows = (data ?? []) as PendingAnalysis[];

  if (!rows.length) {
    console.log("⏸️  Aucune analyse pending_review.");
    return; // pas de process.exit() : Node ferme proprement les handles Supabase (évite l'Assertion Windows libuv)
  }

  console.log(`✓ ${rows.length} analyse(s) à pré-réviser\n`);

  const recos: { analysis: PendingAnalysis; reco: Recommendation | null; triggers: string[] }[] = [];

  for (const a of rows) {
    console.log(`📄 ${a.file_name ?? "(sans nom)"} — id ${a.id.slice(0, 8)}`);
    const conclusion = safeParse(a.conclusion_ia);
    const raw = safeParse(a.raw_text);
    const triggers = computeTriggers(conclusion, raw);
    console.log(`   triggers : ${triggers.join(" · ") || "(aucun)"}`);

    let pdfBase64: string | null = null;
    if (!skipPdf && a.file_path) {
      console.log(`   ⏳ téléchargement PDF…`);
      pdfBase64 = await downloadPdfAsBase64(a.file_path);
      if (pdfBase64) console.log(`   ✓ PDF récupéré (${Math.round(pdfBase64.length / 1024)} KB base64)`);
      else console.log(`   ⚠️  PDF introuvable, fallback texte`);
    }

    console.log(`   ⏳ appel Claude…`);
    const ctx = buildContextText(a, conclusion, raw, triggers);
    const reco = await callClaude(pdfBase64, ctx);
    if (reco) {
      console.log(
        `   ✓ Reco : action=${reco.recommended_action} · confidence=${reco.confidence} · verdict=${reco.recommended_verdict_decisionnel}`,
      );
    } else {
      console.log(`   ⚠️  Pas de reco extraite`);
    }
    recos.push({ analysis: a, reco, triggers });
    console.log("");
  }

  // ─── Écriture du rapport markdown ───
  const out = join(ROOT, "docs", "refonte", "pending-reviews-ai-prep.md");
  if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });

  const md: string[] = [];
  md.push(`# Pré-révision IA — ${new Date().toISOString().slice(0, 16).replace("T", " ")}\n`);
  md.push(
    `${recos.length} analyse(s) pending_review. Pour chacune, recommandation Claude Sonnet 4.6 (PDF lu + contexte VMD). À toi de valider en un clic dans \`/admin/reviews\` ou \`scripts/admin-correct-review.ts\`.\n`,
  );

  for (const { analysis: a, reco, triggers } of recos) {
    md.push(`---\n`);
    md.push(`## ${a.file_name ?? "(sans nom)"}\n`);
    md.push(`- **id** : \`${a.id}\``);
    md.push(`- **créée le** : ${a.created_at.slice(0, 19).replace("T", " ")}`);
    md.push(`- **déclencheurs Piste C** : ${triggers.join(" · ") || "(aucun)"}`);
    md.push(`- **admin direct** : https://www.verifiermondevis.fr/admin/reviews?id=${a.id}\n`);

    if (!reco) {
      md.push(`> ⚠️ Pas de recommandation IA — voir logs console.\n`);
      continue;
    }

    const confidenceBadge =
      reco.confidence === "high" ? "🟢 HIGH" : reco.confidence === "medium" ? "🟡 MED" : "🔴 LOW";
    md.push(`### 🤖 Recommandation Claude (${confidenceBadge})\n`);
    md.push(`- **Action** : \`${reco.recommended_action}\``);
    md.push(`- **Verdict global** : \`${reco.recommended_verdict_global}\``);
    md.push(`- **Verdict décisionnel** : \`${reco.recommended_verdict_decisionnel}\``);
    md.push(
      `- **Surcout** : ${reco.recommended_surcout_min}€ – ${reco.recommended_surcout_max}€`,
    );
    md.push(`- **Anomalies à effacer** : ${reco.clear_anomalies ? "oui" : "non"}\n`);

    if (reco.key_findings.length) {
      md.push(`**Constats clés** :`);
      for (const f of reco.key_findings) md.push(`- ${f}`);
      md.push("");
    }

    md.push(`**Note expert proposée** :`);
    md.push(`> ${reco.expert_note_for_admin.replace(/\n/g, "\n> ")}\n`);

    md.push(`**Raisonnement Claude** (pour audit) :`);
    md.push(`> ${reco.reasoning.replace(/\n/g, "\n> ")}\n`);

    // Commande prête à copier-coller
    if (reco.recommended_action === "corrected") {
      const cmd = [
        `npx tsx scripts/admin-correct-review.ts`,
        `--id ${a.id}`,
        `--verdict-global ${reco.recommended_verdict_global}`,
        `--verdict-decisionnel ${reco.recommended_verdict_decisionnel}`,
        `--surcout-min ${reco.recommended_surcout_min}`,
        `--surcout-max ${reco.recommended_surcout_max}`,
        reco.clear_anomalies ? `--clear-anomalies` : "",
        `--notes "${reco.expert_note_for_admin.replace(/"/g, "'")}"`,
      ]
        .filter(Boolean)
        .join(" \\\n  ");
      md.push(`**Commande prête à exécuter (si tu valides la reco)** :\n`);
      md.push("```bash\n" + cmd + "\n```\n");
    }
  }

  writeFileSync(out, md.join("\n"), "utf-8");
  console.log(`\n📁 Rapport écrit : ${out}`);
  console.log(`\n👉 Ouvre ce fichier dans ton éditeur préféré pour parcourir les recos.`);
}

main().catch((err) => {
  console.error("❌ Erreur :", err);
  process.exit(1);
});
