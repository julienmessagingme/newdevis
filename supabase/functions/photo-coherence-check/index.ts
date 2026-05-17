/**
 * photo-coherence-check — vérifie qu'une photo est affectée à un lot cohérent.
 *
 * Input: { chantier_id, doc_id }
 * Compare la vision_description d'une photo au lot auquel elle est affectée, via
 * Gemini. Si le contenu de la photo ne correspond visiblement pas au lot →
 * crée un insight `risk_detected` (visible dans le panneau Alertes IA de l'onglet
 * Assistant chantier).
 *
 * Alerte SILENCIEUSE : aucun message WhatsApp, aucune notif dans la conversation.
 * Le seul canal de sortie est le panneau Alertes IA.
 *
 * Déclencheurs :
 *  - wa-photo-describe (à l'arrivée d'une photo WhatsApp, quand le lot vient du
 *    hint du numéro et non d'une confirmation Vision).
 *  - PATCH documents/[docId] (réaffectation manuelle d'une photo à un lot).
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

  // 1. Charge le document. Doit être une photo, affectée à un lot, déjà décrite.
  const { data: doc } = await supabase
    .from("documents_chantier")
    .select("id, chantier_id, document_type, lot_id, vision_description, nom")
    .eq("id", doc_id)
    .single();

  if (!doc || doc.chantier_id !== chantier_id) {
    return new Response(JSON.stringify({ ok: false, reason: "doc_not_found" }), { status: 200 });
  }
  if (doc.document_type !== "photo" || !doc.lot_id || !doc.vision_description) {
    // Rien à vérifier : pas une photo, pas affectée à un lot, ou pas encore décrite.
    return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
  }

  // 2. Charge le lot affecté.
  const { data: lot } = await supabase
    .from("lots_chantier")
    .select("id, nom")
    .eq("id", doc.lot_id)
    .single();
  if (!lot) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
  }

  // 3. Dismiss les alertes de cohérence précédentes sur ce document (évite
  //    l'empilement quand on réaffecte la photo plusieurs fois). Ce check est
  //    le seul propriétaire des insights `photo_lot_coherence`.
  await supabase.from("agent_insights")
    .update({ read_by_user: true })
    .eq("chantier_id", chantier_id)
    .eq("type", "risk_detected")
    .eq("source_event->>check", "photo_lot_coherence")
    .eq("source_event->>document_id", doc_id);

  // 4. Vérifie la cohérence via Gemini (tâche simple → gemini-2.0-flash).
  const prompt = `Tu es assistant de gestion de chantier. Une photo de chantier a été affectée à un lot de travaux.

Description de la photo (analyse Vision) : "${doc.vision_description}"
Lot de travaux auquel elle est affectée : "${lot.nom}"

La photo est-elle plausiblement liée à ce lot ? Sois TOLÉRANT : une photo générale de chantier, de matériel, de plan, ou ambiguë est considérée comme cohérente. Ne signale une incohérence QUE si la photo montre CLAIREMENT un type de travaux qui n'a rien à voir avec le lot (ex: photo d'une toiture affectée au lot "Plomberie").

Réponds en JSON strict, sans texte autour :
{ "coherent": true|false, "reason": "courte explication factuelle si incoherent, sinon null" }`;

  let coherent = true;
  let reason: string | null = null;
  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${geminiKey}` },
      body: JSON.stringify({
        model: "gemini-2.0-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 256,
        temperature: 0.1,
      }),
    });
    if (!res.ok) {
      console.error("[photo-coherence-check] Gemini HTTP", res.status);
      return new Response(JSON.stringify({ ok: false, error: "gemini_failed" }), { status: 200 });
    }
    const data = await res.json();
    const rawText = (data.choices?.[0]?.message?.content ?? "")
      .replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(rawText);
    coherent = parsed.coherent !== false;
    reason = typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : null;
  } catch (err) {
    console.error("[photo-coherence-check] error:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ ok: false, error: "parse_failed" }), { status: 200 });
  }

  if (coherent) {
    return new Response(JSON.stringify({ ok: true, coherent: true }), { status: 200 });
  }

  // 5. Incohérence → insight risk_detected (panneau Alertes IA — aucun WhatsApp).
  const { data: chantierRow } = await supabase
    .from("chantiers").select("user_id").eq("id", chantier_id).single();

  await supabase.from("agent_insights").insert({
    chantier_id,
    user_id: chantierRow?.user_id ?? null,
    type: "risk_detected",
    severity: "warning",
    title: `Photo possiblement mal affectée au lot « ${lot.nom} »`,
    body: `La photo « ${doc.nom} » est affectée au lot « ${lot.nom} », mais son contenu ne semble pas correspondre.\n\n` +
      `Ce que montre la photo : ${doc.vision_description}\n\n` +
      (reason ? `${reason}\n\n` : "") +
      `Vérifie l'affectation dans Documents.`,
    source_event: { check: "photo_lot_coherence", document_id: doc_id, lot_id: lot.id },
  });

  return new Response(JSON.stringify({ ok: true, coherent: false, reason }), { status: 200 });
});
