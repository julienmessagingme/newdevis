import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  webp: "image/webp",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { file_path } = await req.json();

    if (!file_path || typeof file_path !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "file_path requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "GEMINI_API_KEY non configuré" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Télécharger le fichier depuis Supabase Storage
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("devis")
      .download(file_path);

    if (downloadError || !fileBlob) {
      console.error("Download error:", downloadError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Fichier introuvable dans le storage" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convertir en base64
    const buffer = await fileBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    // Détecter le type MIME depuis l'extension
    const ext = file_path.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = MIME_MAP[ext] ?? "image/jpeg";

    // Appel Gemini 2.0 Flash via l'API native (supporte PDF + images)
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64,
                  },
                },
                {
                  text: `Analyse cette facture de travaux.
Extrait uniquement ces 4 informations :
- Nom de l'entreprise émettrice
- Montant total TTC (nombre seul, sans € ni espace)
- Date de la facture (format JJ/MM/AAAA)
- Objet des travaux (5 mots maximum)

Réponds UNIQUEMENT avec ce JSON valide, sans texte avant ni après :
{"entreprise":"string","montant_ttc":number,"date":"string","objet":"string"}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 500,
            temperature: 0,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("Gemini error:", geminiResponse.status, errText.substring(0, 300));
      return new Response(
        JSON.stringify({ success: false, error: "Lecture IA échouée" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResponse.json();
    const text: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    if (!text) {
      return new Response(
        JSON.stringify({ success: false, error: "Réponse IA vide" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const donnees = JSON.parse(text);

    return new Response(
      JSON.stringify({ success: true, donnees }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("read-invoice error:", err instanceof Error ? err.message : "unknown");
    return new Response(
      JSON.stringify({ success: false, error: "Erreur serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
