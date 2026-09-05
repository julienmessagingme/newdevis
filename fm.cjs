// ai-review-agent : mode rapide Opus 5 + allègement des gros devis
const fs = require("fs");
const p = "supabase/functions/ai-review-agent/index.ts";
const orig = fs.readFileSync(p, "utf8");
const crlf = orig.includes("\r\n");
let s = crlf ? orig.replace(/\r\n/g, "\n") : orig;

const subs = [
  // 1. Seuil « gros devis » : au-delà, on saute le PDF (les pages coûtent cher
  //    en temps de vision) et on s'appuie sur l'extraction déjà en prompt.
  [
    `const MODEL = "claude-opus-5";
const PDF_MAX_BYTES = 8 * 1024 * 1024; // marge sous la limite requête API`,
    `const MODEL = "claude-opus-5";
const PDF_MAX_BYTES = 8 * 1024 * 1024; // marge sous la limite requête API
// 2026-08-29 — au-delà de ce nombre de lignes, on renonce au PDF : sur le
// devis 25030 (82 lignes, 219 k€) la lecture des pages faisait dépasser le
// plafond de temps des fonctions edge, même en effort low. L'extraction du
// pipeline (déjà dans le prompt) prend le relais ; la recherche web est
// conservée, c'est elle qui casse la circularité.
const BIG_QUOTE_LINES = 55;`,
  ],
  // 2. Condition de chargement du PDF
  [
    `  let pdfBlock: Record<string, unknown> | null = null;
  if (a.file_path) {`,
    `  let pdfBlock: Record<string, unknown> | null = null;
  const isBigQuote = priceData.length > BIG_QUOTE_LINES;
  if (isBigQuote) {
    console.log("[ai-review] gros devis (" + priceData.length + " lignes) — relecture sans PDF (budget edge)");
  }
  if (a.file_path && !isBigQuote) {`,
  ],
  // 3. Mode rapide Opus 5 (research preview) : ~2,5× plus rapide en sortie
  [
    `      "anthropic-version": "2023-06-01",
    },`,
    `      "anthropic-version": "2023-06-01",
      // Mode rapide Opus 5 (research preview) : même modèle, sortie jusqu'à
      // 2,5× plus rapide — décisif pour tenir dans le budget des edge functions.
      "anthropic-beta": "fast-mode-2026-02-01",
    },`,
  ],
  [
    `      model: MODEL,
      max_tokens: 5000,`,
    `      model: MODEL,
      speed: "fast",
      max_tokens: 5000,`,
  ],
  // 4. Prompt : ne pas promettre un PDF absent
  [
    `TA MISSION :
1. Lis le devis PDF joint (source de vérité — pas l'extraction).`,
    `TA MISSION :
1. ${pdfSourceLine}`,
  ],
  // 5. Variable de la ligne 1 du prompt
  [
    `  const instruction = \`Tu es un expert en chiffrage de travaux BTP en France, relecteur indépendant chez VerifierMonDevis.`,
    `  const pdfSourceLine = pdfBlock
    ? "Lis le devis PDF joint (source de vérité — pas l'extraction)."
    : "Le PDF n'a pas pu être joint (devis volumineux) : appuie-toi sur les lignes extraites ci-dessus, en signalant explicitement dans ton résumé que tu n'as pas relu le document original.";

  const instruction = \`Tu es un expert en chiffrage de travaux BTP en France, relecteur indépendant chez VerifierMonDevis.`,
  ],
];

let missing = 0;
for (const [a, b] of subs) {
  if (!s.includes(a)) { console.error("NOT FOUND:", JSON.stringify(a.slice(0, 60))); missing++; continue; }
  s = s.replace(a, b);
}
fs.writeFileSync(p, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log(missing === 0 ? "mode rapide + allègement gros devis câblés" : missing + " modification(s) manquée(s)");
