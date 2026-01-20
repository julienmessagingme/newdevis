import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAPPERS_API_URL = "https://api.pappers.fr/v2";

// Admin email whitelist (fallback)
const ADMIN_EMAILS = [
  "admin@verifiermondevis.fr",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ============ AUTH CHECK ============
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Non autorisé - Token manquant" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Non autorisé - Token invalide" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin role via user_roles table or email whitelist
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    const isAdmin = roleData !== null || ADMIN_EMAILS.includes(user.email || "");

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Accès réservé aux administrateurs" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ STEP 1: CHECK API KEY ============
    const pappersApiKey = Deno.env.get("PAPPERS_API_KEY");
    const hasKey = !!pappersApiKey;
    const keyPrefix = pappersApiKey ? pappersApiKey.substring(0, 6) + "…" : null;

    // If no key, return early with diagnostic info
    if (!hasKey) {
      return new Response(
        JSON.stringify({
          has_key: false,
          key_prefix: null,
          message: "PAPPERS_API_KEY n'est pas configurée dans les secrets",
          called: false,
          http_status: null,
          latency_ms: null,
          response_has_company: false,
          error_message: "PAPPERS_API_KEY missing from environment",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ STEP 2: PARSE REQUEST ============
    let body: { id?: string } = {};
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          has_key: hasKey,
          key_prefix: keyPrefix,
          error: "Corps de requête invalide - attendu: { id: 'SIRET ou SIREN' }",
          called: false,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { id } = body;
    if (!id) {
      return new Response(
        JSON.stringify({
          has_key: hasKey,
          key_prefix: keyPrefix,
          error: "Paramètre 'id' requis (SIRET ou SIREN)",
          called: false,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean and validate ID
    const cleanedId = id.replace(/\s/g, "");
    const siren = cleanedId.length >= 9 ? cleanedId.substring(0, 9) : cleanedId;

    if (siren.length < 9 || !/^\d{9}$/.test(siren)) {
      return new Response(
        JSON.stringify({
          has_key: hasKey,
          key_prefix: keyPrefix,
          error: `Format SIREN invalide: ${siren} (doit être 9 chiffres)`,
          called: false,
          input: { raw: id, cleaned: cleanedId, siren },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ STEP 3: CALL PAPPERS (BYPASS CACHE) ============
    console.log(`[PAPPERS-HEALTH] Admin ${user.email} testing SIREN: ${siren}`);
    
    const startTime = Date.now();
    let httpStatus: number | null = null;
    let responseHasCompany = false;
    let errorMessage: string | null = null;
    let companyData: any = null;

    try {
      const response = await fetch(
        `${PAPPERS_API_URL}/entreprise?siren=${siren}&api_token=${pappersApiKey}`
      );
      
      httpStatus = response.status;
      const latencyMs = Date.now() - startTime;

      if (response.status === 404) {
        errorMessage = "Entreprise non trouvée (404)";
      } else if (!response.ok) {
        errorMessage = `Erreur API: HTTP ${response.status}`;
      } else {
        const data = await response.json();
        responseHasCompany = !!data.nom_entreprise;
        
        // Extract key info (never expose full response)
        companyData = {
          nom: data.nom_entreprise || null,
          siren: data.siren || null,
          siret_siege: data.siege?.siret || null,
          statut: data.statut || null,
          date_creation: data.date_creation || null,
          is_active: data.statut !== "Radiée" && data.statut !== "Fermé",
          ville: data.siege?.ville || null,
          bilans_count: data.comptes?.length || (data.derniers_comptes ? 1 : 0),
        };
      }

      return new Response(
        JSON.stringify({
          has_key: hasKey,
          key_prefix: keyPrefix,
          called: true,
          http_status: httpStatus,
          latency_ms: latencyMs,
          response_has_company: responseHasCompany,
          error_message: errorMessage,
          company: companyData,
          input: { siren },
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (fetchError) {
      const latencyMs = Date.now() - startTime;
      errorMessage = fetchError instanceof Error ? fetchError.message : "Erreur réseau inconnue";
      
      return new Response(
        JSON.stringify({
          has_key: hasKey,
          key_prefix: keyPrefix,
          called: true,
          http_status: null,
          latency_ms: latencyMs,
          response_has_company: false,
          error_message: errorMessage,
          input: { siren },
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    console.error("Pappers health check error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erreur interne",
        called: false,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
