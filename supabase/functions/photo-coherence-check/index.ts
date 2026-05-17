/**
 * photo-coherence-check — vérifie qu'une photo est affectée à un lot cohérent.
 *
 * Input: { chantier_id, doc_id }
 * Analyse l'IMAGE de la photo via Gemini Vision et la compare au lot auquel
 * elle est affectée. Si le contenu ne correspond visiblement pas au lot →
 * insight `risk_detected` dans le panneau Alertes IA.
 *
 * On ré-analyse TOUJOURS l'image (jamais la `vision_description` stockée) :
 * celle-ci peut être absente, ou être le placeholder d'échec
 * "Photo WhatsApp (description automatique indisponible)". La description
 * fraîche est au passage ré-enregistrée dans documents_chantier (heal).
 *
 * Alerte SILENCIEUSE : aucun WhatsApp, aucun message conversation. Seule sortie =
 * le panneau Alertes IA.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const geminiKey = Deno.env.get("GOOGLE_AI_API_KEY") ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const { chantier_id, doc_id } = await req.json().catch(() => ({})) as {
    chantier_id?: string;
    doc_id?: string;
  };
  if (!chantier_id || !doc_id) {
    return new Response(JSON.stringify({ error: "chantier_id et doc_id requis" }), { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Charge le document — doit être une photo affectée à un lot.
  const { data: doc } = await supabase
    .from("documents_chantier")
    .select("id, chantier_id, document_type, lot_id, bucket_path, mime_type, nom")
    .eq("id", doc_id)
    .single();

  if (!doc || doc.chantier_id !== chantier_id) {
    return new Response(JSON.stringify({ ok: false, reason: "doc_not_found" }), { status: 200 });
  }
  if (doc.document_type !== "photo" || !doc.lot_id || !doc.bucket_path) {
    // Rien à vérifier : pas une photo, pas affectée, ou pas de fichier.
    return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
  }

  // 2. Charge le lot affecté.
  const { data: lot } = await supabase
    .from("lots_chantier").select("id, nom").eq("id", doc.lot_id).single();
  if (!lot) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
  }

  // 3. Télécharge l'image depuis le Storage (service_role bypasse RLS).
  const { data: fileData, error: dlErr } = await supabase.storage
    .from("chantier-documents").download(doc.bucket_path);
  if (dlErr || !fileData) {
    console.error("[photo-coherence-check] download error:", dlErr?.message);
    return new Response(JSON.stringify({ ok: false, error: "download_failed" }), { status: 200 });
  }
  const uint8 = new Uint8Array(await fileData.arrayBuffer());
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < uint8.length; i += CHUNK) {
    binary += String.fromCharCode(...uint8.subarray(i, i + CHUNK));
  }
  const base64Image = btoa(binary);
  const mimeType = doc.mime_type || "image/jpeg";

  // 4. Gemini Vision : décrit la photo + juge la cohérence avec le lot.
  const prompt = `Tu es assistant de gestion de chantier. Cette photo de chantier est actuellement affectée au lot de travaux « ${lot.nom} ».

Analyse la photo et réponds en JSON strict, sans texte autour :
{
  "description": "Description factuelle en 1-2 phrases : type de travaux visible, état/avancement.",
  "coherent": true|false,
  "reason": "Si coherent=false : courte explication de l'incohérence (ex: 'La photo montre une installation électrique, sans rapport avec le lot Plombier'). Sinon null."
}

RÈGLE : sois TOLÉRANT. Une photo générale de chantier, de matériel, de plan, floue ou ambiguë → coherent=true. Ne mets coherent=false QUE si la photo montre CLAIREMENT un type de travaux sans aucun rapport avec le lot « ${lot.nom} ».`;

  let description = "";
  let coherent = true;
  let reason: string | null = null;
  let rawContent = "";
  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${geminiKey}` },
      body: JSON.stringify({
        // gemini-2.0-flash : multimodal, sans "thinking budget" — gemini-2.5-flash
        // consommait le budget tokens en raisonnement interne et tronquait le JSON
        // de sortie → parse_failed. La cohérence photo↔lot est une tâche simple.
        model: "gemini-2.0-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
          ],
        }],
        max_tokens: 1024,
        temperature: 0.1,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[photo-coherence-check] Gemini HTTP", res.status, errBody.slice(0, 200));
      return new Response(JSON.stringify({ ok: false, error: "gemini_failed" }), { status: 200 });
    }
    const data = await res.json();
    rawContent = data.choices?.[0]?.message?.content ?? "";
    const cleaned = rawContent.replace(/^```json\n?/, "").replace(/\n?```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);
    description = typeof parsed.description === "string" ? parsed.description.trim() : "";
    coherent = parsed.coherent !== false;
    reason = typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : null;
  } catch (err) {
    console.error("[photo-coherence-check] parse error:", err instanceof Error ? err.message : err,
      "| raw:", rawContent.slice(0, 300));
    return new Response(JSON.stringify({ ok: false, error: "parse_failed" }), { status: 200 });
  }

  // 5. Heal : ré-enregistre une description fraîche (corrige les anciens
  //    placeholders "(description automatique indisponible)").
  if (description) {
    await supabase.from("documents_chantier")
      .update({ vision_description: description }).eq("id", doc_id);
  }

  // 6. Dismiss les alertes de cohérence précédentes sur ce document (évite
  //    l'empilement quand on réaffecte la photo plusieurs fois). Ce check est
  //    le seul propriétaire des insights `photo_lot_coherence`.
  await supabase.from("agent_insights")
    .update({ read_by_user: true })
    .eq("chantier_id", chantier_id)
    .eq("type", "risk_detected")
    .eq("source_event->>check", "photo_lot_coherence")
    .eq("source_event->>document_id", doc_id);

  if (coherent) {
    return new Response(JSON.stringify({ ok: true, coherent: true }), { status: 200 });
  }

  // 7. Incohérence → insight risk_detected (panneau Alertes IA — aucun WhatsApp).
  const { data: chantierRow } = await supabase
    .from("chantiers").select("user_id").eq("id", chantier_id).single();

  await supabase.from("agent_insights").insert({
    chantier_id,
    user_id: chantierRow?.user_id ?? null,
    type: "risk_detected",
    severity: "warning",
    title: `Photo possiblement mal affectée au lot « ${lot.nom} »`,
    body: `La photo « ${doc.nom} » est affectée au lot « ${lot.nom} », mais son contenu ne semble pas correspondre.\n\n` +
      (description ? `Ce que montre la photo : ${description}\n\n` : "") +
      (reason ? `${reason}\n\n` : "") +
      `Vérifie l'affectation dans Documents.`,
    source_event: { check: "photo_lot_coherence", document_id: doc_id, lot_id: lot.id },
  });

  return new Response(JSON.stringify({ ok: true, coherent: false, reason }), { status: 200 });
});
