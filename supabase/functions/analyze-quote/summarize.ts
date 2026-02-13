// ============================================================
// GEMINI SUMMARIZATION — Generate short summaries for work items
// ============================================================

import type { ExtractedData } from "./types.ts";

interface WorkItemSummary {
  description: string;
  category: string | null;
  amount_ht: number | null;
  quantity: number | null;
  unit: string | null;
}

export async function summarizeWorkItems(
  travaux: ExtractedData["travaux"],
  googleApiKey: string,
): Promise<WorkItemSummary[]> {
  if (!travaux || travaux.length === 0) {
    return [];
  }

  // Build the list of items to summarize
  const itemsList = travaux.map((t, i) =>
    `${i + 1}. ${t.libelle} (catégorie: ${t.categorie || "non précisée"}, montant: ${t.montant ?? "?"} € HT, quantité: ${t.quantite ?? "?"} ${t.unite || ""})`
  ).join("\n");

  const prompt = `Tu es un assistant spécialisé dans les devis de travaux.
Pour chaque poste de travaux ci-dessous, écris un résumé clair et concis en MOINS DE 50 MOTS.
Le résumé doit décrire la nature du travail de façon compréhensible pour un non-spécialiste.

Postes de travaux :
${itemsList}

Réponds UNIQUEMENT avec un tableau JSON (pas de markdown, pas de texte autour).
Format attendu :
[
  "Résumé du poste 1",
  "Résumé du poste 2",
  ...
]`;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${googleApiKey}`,
        },
        body: JSON.stringify({
          model: "gemini-2.0-flash",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 4096,
        }),
      },
    );

    if (!response.ok) {
      console.warn("[Summarize] Gemini API error:", response.status, response.statusText);
      return fallbackSummaries(travaux);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "";

    // Extract JSON array from response (strip markdown fences if present)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("[Summarize] Could not parse JSON array from Gemini response");
      return fallbackSummaries(travaux);
    }

    const summaries: string[] = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(summaries) || summaries.length !== travaux.length) {
      console.warn("[Summarize] Mismatch: got", summaries.length, "summaries for", travaux.length, "items");
      // Use what we can, fallback for the rest
      return travaux.map((t, i) => ({
        description: summaries[i] || t.libelle,
        category: t.categorie || null,
        amount_ht: t.montant,
        quantity: t.quantite,
        unit: t.unite || null,
      }));
    }

    return travaux.map((t, i) => ({
      description: summaries[i],
      category: t.categorie || null,
      amount_ht: t.montant,
      quantity: t.quantite,
      unit: t.unite || null,
    }));
  } catch (err) {
    console.warn("[Summarize] Error:", err instanceof Error ? err.message : String(err));
    return fallbackSummaries(travaux);
  }
}

/** Fallback: use raw labels as summaries */
function fallbackSummaries(travaux: ExtractedData["travaux"]): WorkItemSummary[] {
  return travaux.map((t) => ({
    description: t.libelle,
    category: t.categorie || null,
    amount_ht: t.montant,
    quantity: t.quantite,
    unit: t.unite || null,
  }));
}
