/**
 * Fournisseurs du relecteur IA — Gemini (défaut) ou Claude.
 *
 * 2026-08-30 — bascule sur Gemini demandée par Johan après l'épuisement du
 * solde Anthropic. Deux raisons de fond, au-delà du dépannage :
 *   · le coût par relecture tombe d'environ 0,85 € à quelques centimes ;
 *   · le grounding Google est GRATUIT jusqu'à 1 500 requêtes/jour, là où la
 *     recherche web Anthropic est facturée à l'usage.
 *
 * L'indépendance vis-à-vis du pipeline — la raison d'être du relecteur — ne
 * vient plus du fournisseur mais du MODÈLE (2.5-pro contre les 2.0/2.5-flash
 * du pipeline), du prompt, et surtout des SOURCES : PDF d'origine + recherche
 * web, que le pipeline n'a jamais vus. Le banc de test
 * (`scripts/benchmark-ai-reviewer.ts`) mesure ce que cette bascule coûte en
 * qualité — c'est lui qui tranche, pas l'intuition.
 *
 * Les deux implémentations renvoient la même forme, pour que le reste du code
 * et le banc de test soient aveugles au fournisseur.
 */

export type Provider = "gemini" | "claude";

export interface ProviderResult {
  ok: boolean;
  /** Texte brut de la réponse (le JSON de l'avis y est encapsulé). */
  text?: string;
  /** Tokens consommés — sert au suivi de coût. */
  usage?: { input: number; output: number };
  status?: number;
  errorText?: string;
}

const GEMINI_MODEL = "gemini-2.5-pro";
const CLAUDE_MODEL = "claude-opus-5";

/**
 * Gemini lit le PDF depuis une URL SIGNÉE (`file_data.file_uri`) : aucun
 * téléchargement ni encodage base64 dans le worker, donc pas de dépassement
 * CPU — c'est ce qui avait tué le run côté Claude avant qu'on passe aux URL
 * signées là aussi.
 */
/**
 * Type MIME déduit du chemin. Tous les devis ne sont pas des PDF : les photos
 * de devis (JPG/PNG) ont produit 2 échecs sur 37 au banc de test du
 * 2026-08-30 (« The document has no pages »), parce que le type était codé en
 * dur à application/pdf.
 */
export function mimeDepuisChemin(chemin: string): string {
  const ext = chemin.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "application/pdf";
}

export async function callGemini(
  apiKey: string,
  instruction: string,
  pdfUrl: string | null,
  mime = "application/pdf",
): Promise<ProviderResult> {
  const parts: Array<Record<string, unknown>> = [];
  if (pdfUrl) {
    parts.push({ file_data: { mime_type: mime, file_uri: pdfUrl } });
  }
  parts.push({ text: instruction });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.2,
          // ⚠️ Piège Gemini connu (cf. CLAUDE.md) : le modèle consomme une
          // partie du budget de sortie en raisonnement interne. Avec une
          // limite serrée, le JSON est tronqué et le parsing échoue
          // silencieusement — d'où une marge large.
          maxOutputTokens: 16384,
        },
      }),
    },
  );

  if (!res.ok) {
    return { ok: false, status: res.status, errorText: (await res.text()).slice(0, 300) };
  }
  const j = await res.json();
  const text = (j?.candidates?.[0]?.content?.parts ?? [])
    .map((p: Record<string, unknown>) => p?.text ?? "")
    .join("\n");
  return {
    ok: true,
    text,
    usage: {
      input: Number(j?.usageMetadata?.promptTokenCount ?? 0),
      output: Number(j?.usageMetadata?.candidatesTokenCount ?? 0),
    },
  };
}

export async function callClaude(
  apiKey: string,
  instruction: string,
  pdfUrl: string | null,
  mime = "application/pdf",
): Promise<ProviderResult> {
  const content: Array<Record<string, unknown>> = [];
  // Claude distingue « document » (PDF) et « image » : envoyer une photo de
  // devis en document échoue.
  if (pdfUrl) {
    content.push(mime.startsWith("image/")
      ? { type: "image", source: { type: "url", url: pdfUrl } }
      : { type: "document", source: { type: "url", url: pdfUrl } });
  }
  content.push({ type: "text", text: instruction });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 5000,
      // ⚠️ NE PAS ajouter `speed: "fast"` : le mode rapide n'est pas ouvert sur
      // notre organisation (« rate limit of 0 fast mode input tokens per
      // minute ») → 429 immédiat sur CHAQUE appel.
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }],
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    return { ok: false, status: res.status, errorText: (await res.text()).slice(0, 300) };
  }
  const j = await res.json();
  const text = (j.content ?? [])
    .filter((b: Record<string, unknown>) => b?.type === "text")
    .map((b: Record<string, unknown>) => b.text)
    .join("\n");
  return {
    ok: true,
    text,
    usage: {
      input: Number(j?.usage?.input_tokens ?? 0),
      output: Number(j?.usage?.output_tokens ?? 0),
    },
  };
}

export function callProvider(
  provider: Provider,
  keys: { gemini: string; claude: string },
  instruction: string,
  pdfUrl: string | null,
  mime = "application/pdf",
): Promise<ProviderResult> {
  return provider === "claude"
    ? callClaude(keys.claude, instruction, pdfUrl, mime)
    : callGemini(keys.gemini, instruction, pdfUrl, mime);
}
