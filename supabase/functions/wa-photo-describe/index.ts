/**
 * wa-photo-describe — Gemini Vision auto-description de photos WhatsApp.
 *
 * Input: { chantier_id, doc_id, storage_path, lot_hint_nom, lots }
 * - Télécharge l'image depuis chantier-documents (service_role)
 * - Envoie à Gemini Vision (gemini-2.5-flash) avec la liste des lots
 * - Update documents_chantier : vision_description, nom, lot_id éventuel, lot_override_reason
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const geminiKey  = Deno.env.get("GOOGLE_AI_API_KEY") ?? "";

interface PhotoDescribePayload {
  chantier_id: string;
  doc_id: string;
  storage_path: string;        // path in chantier-documents bucket
  mime_type?: string;          // e.g. 'image/jpeg', 'image/png', 'image/webp'
  lot_hint_nom: string | null; // lot déduit du sender phone
  lots: Array<{ id: string; nom: string }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const body: PhotoDescribePayload = await req.json().catch(() => ({})) as PhotoDescribePayload;
  const { chantier_id, doc_id, storage_path, mime_type = "image/jpeg", lot_hint_nom, lots = [] } = body;

  if (!chantier_id || !doc_id || !storage_path) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Download image from Storage (service_role bypasses RLS)
  const { data: fileData, error: downloadErr } = await supabase.storage
    .from("chantier-documents")
    .download(storage_path);

  if (downloadErr || !fileData) {
    console.error("[wa-photo-describe] download error:", downloadErr?.message);
    return new Response(JSON.stringify({ error: "Failed to download image" }), { status: 500 });
  }

  // 2. Convert to base64 (chunked to avoid O(n²) string concat + call stack limits)
  const arrayBuffer = await fileData.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < uint8.length; i += CHUNK) {
    binary += String.fromCharCode(...uint8.subarray(i, i + CHUNK));
  }
  const base64Image = btoa(binary);

  // 3. Build prompt
  const lotsListStr = lots.map(l => `"${l.nom}"`).join(", ");
  const hintPhrase = lot_hint_nom
    ? `D'après le numéro d'envoi, la photo proviendrait probablement du lot "${lot_hint_nom}".`
    : "Aucun lot n'est connu pour le numéro d'envoi.";

  const userPrompt = `Tu es assistant IA pour la gestion de chantier.

${hintPhrase}

Liste des lots du chantier : ${lotsListStr || "(aucun lot défini)"}

Analyse cette photo de chantier et réponds en JSON strict :
{
  "description": "Description en 1-2 phrases : type de travaux visibles, état/avancement, anomalie éventuelle. Sois factuel et précis.",
  "short_title": "Titre court 4-6 mots maximum (ex: 'Pose carrelage cuisine terminée', 'Fissure mur porteur détectée')",
  "confirmed_lot_nom": "nom exact du lot si la photo correspond clairement, sinon null",
  "override_reason": "Explication si tu contredis l'heuristique du sender (sinon null)"
}

RÈGLE : confirmed_lot_nom doit être null ou correspondre EXACTEMENT à l'un des noms de la liste.`;

  // 4. Call Gemini Vision
  let visionResponse: any;
  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${geminiKey}`,
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: { url: `data:${mime_type};base64,${base64Image}` },
              },
            ],
          },
        ],
        max_tokens: 512,
        temperature: 0.1,
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      console.error("[wa-photo-describe] Gemini error:", geminiRes.status, errText.slice(0, 200));
      throw new Error(`Gemini ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.choices?.[0]?.message?.content ?? "";
    const cleaned = rawText.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
    visionResponse = JSON.parse(cleaned);
  } catch (err) {
    console.error("[wa-photo-describe] Vision processing error:", err instanceof Error ? err.message : err);
    // Fallback: update with minimal info
    await supabase.from("documents_chantier").update({
      vision_description: "Photo WhatsApp (description automatique indisponible)",
    }).eq("id", doc_id);
    return new Response(JSON.stringify({ ok: false, error: "Vision failed" }), { status: 200 });
  }

  const description: string = visionResponse.description ?? "";
  const shortTitle: string = visionResponse.short_title ?? "Photo WhatsApp";
  const confirmedLotNom: string | null = visionResponse.confirmed_lot_nom ?? null;
  const overrideReason: string | null = visionResponse.override_reason ?? null;

  // 5. Resolve lot_id if Vision confirmed a lot (or contradicted the hint)
  let resolvedLotId: string | null = null;
  let resolvedOverrideReason: string | null = null;

  if (confirmedLotNom) {
    const matchedLot = lots.find(l =>
      l.nom.trim().toLowerCase() === confirmedLotNom.trim().toLowerCase()
    );
    if (matchedLot) {
      resolvedLotId = matchedLot.id;
      // Only record override reason if Vision contradicts the hint
      if (lot_hint_nom && confirmedLotNom.toLowerCase() !== lot_hint_nom.toLowerCase() && overrideReason) {
        resolvedOverrideReason = overrideReason;
      }
    }
  }

  // 6. Update documents_chantier
  const updatePayload: Record<string, unknown> = {
    vision_description: description,
    nom: shortTitle,
  };
  if (resolvedLotId) {
    updatePayload.lot_id = resolvedLotId;
  }
  if (resolvedOverrideReason) {
    updatePayload.lot_override_reason = resolvedOverrideReason;
  }

  const { error: updateErr } = await supabase
    .from("documents_chantier")
    .update(updatePayload)
    .eq("id", doc_id);

  if (updateErr) {
    console.error("[wa-photo-describe] update error:", updateErr.message);
    return new Response(JSON.stringify({ ok: false, error: updateErr.message }), { status: 500 });
  }

  return new Response(JSON.stringify({
    ok: true,
    doc_id,
    description,
    short_title: shortTitle,
    confirmed_lot_nom: confirmedLotNom,
    override_reason: resolvedOverrideReason,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
