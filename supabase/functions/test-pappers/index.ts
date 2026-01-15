import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAPPERS_API_URL = "https://api.pappers.fr/v2";

// Admin email whitelist
const ADMIN_EMAILS = [
  "admin@verifiermondevis.fr",
  // Add more admin emails as needed
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Non autorisé" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Non autorisé" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin (via roles table or email whitelist)
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

    // Parse request
    const { siret } = await req.json();

    if (!siret) {
      return new Response(
        JSON.stringify({ error: "SIRET requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanedSiret = siret.replace(/\s/g, "");
    const siren = cleanedSiret.substring(0, 9);

    if (siren.length < 9 || !/^\d{9}$/.test(siren)) {
      return new Response(
        JSON.stringify({ 
          error: "Format SIREN invalide",
          debug: { siret: cleanedSiret, siren, valid: false }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check PAPPERS_API_KEY
    const pappersApiKey = Deno.env.get("PAPPERS_API_KEY");
    if (!pappersApiKey) {
      return new Response(
        JSON.stringify({ 
          error: "PAPPERS_API_KEY non configurée",
          debug: {
            pappers: {
              attempted: false,
              cached: false,
              status: null,
              error: "PAPPERS_API_KEY missing",
              fetched_at: null,
              expires_at: null,
            }
          }
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check cache first
    const { data: cachedData, error: cacheError } = await supabase
      .from("company_cache")
      .select("*")
      .eq("siret", cleanedSiret)
      .maybeSingle();

    const now = new Date();
    const cacheValid = cachedData && new Date(cachedData.expires_at) > now;

    // Always call API for test (bypass cache) to verify consumption
    console.log(`[TEST-PAPPERS] Calling Pappers API for SIREN: ${siren}`);
    
    const response = await fetch(`${PAPPERS_API_URL}/entreprise?siren=${siren}&api_token=${pappersApiKey}`);
    
    const result: any = {
      siret: cleanedSiret,
      siren,
      debug: {
        pappers: {
          attempted: true,
          cached: false,
          status: response.status,
          error: null,
          fetched_at: now.toISOString(),
          expires_at: null,
        },
        cache_state: {
          had_cache: !!cachedData,
          cache_valid: cacheValid,
          cache_expires_at: cachedData?.expires_at || null,
        }
      }
    };

    if (response.status === 404) {
      result.status = "not_found";
      result.message = "Entreprise non trouvée dans les registres";
      result.debug.pappers.error = "Not found";
    } else if (!response.ok) {
      result.status = "error";
      result.message = `Erreur API Pappers: ${response.status}`;
      result.debug.pappers.error = `HTTP ${response.status}`;
    } else {
      const data = await response.json();
      
      // Calculate age
      let ageYears: number | null = null;
      if (data.date_creation) {
        const creationDate = new Date(data.date_creation);
        ageYears = Math.floor((now.getTime() - creationDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      }

      // Extract bilans info
      let bilansCount = 0;
      let capitauxPropres: number | null = null;
      if (data.comptes && Array.isArray(data.comptes)) {
        bilansCount = data.comptes.length;
        if (data.comptes.length > 0 && data.comptes[0].capitaux_propres !== undefined) {
          capitauxPropres = data.comptes[0].capitaux_propres;
        }
      } else if (data.derniers_comptes) {
        bilansCount = 1;
        if (data.derniers_comptes.capitaux_propres !== undefined) {
          capitauxPropres = data.derniers_comptes.capitaux_propres;
        }
      }

      result.status = "ok";
      result.message = "Appel Pappers réussi";
      result.company = {
        nom: data.nom_entreprise,
        date_creation: data.date_creation,
        age_years: ageYears,
        is_active: data.statut !== "Radiée" && data.statut !== "Fermé",
        statut: data.statut,
        bilans_count: bilansCount,
        has_3_bilans: bilansCount >= 3,
        last_bilan_capitaux_propres: capitauxPropres,
        procedure_collective: Boolean(data.procedure_collective),
        adresse: data.siege?.adresse_ligne_1,
        ville: data.siege?.ville,
        code_postal: data.siege?.code_postal,
      };

      // Update cache
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      result.debug.pappers.expires_at = expiresAt.toISOString();

      await supabase.from("company_cache").upsert({
        siret: cleanedSiret,
        siren: siren,
        provider: "pappers",
        fetched_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        payload: {
          date_creation: data.date_creation || null,
          age_years: ageYears,
          is_active: data.statut !== "Radiée" && data.statut !== "Fermé",
          bilans_count: bilansCount,
          has_3_bilans: bilansCount >= 3,
          last_bilan_capitaux_propres: capitauxPropres,
          nom: data.nom_entreprise || null,
          adresse: data.siege?.adresse_ligne_1 || null,
          ville: data.siege?.ville || null,
          procedure_collective: Boolean(data.procedure_collective),
        },
        status: "ok",
        error_code: null,
        error_message: null,
      }, { onConflict: "siret" });
    }

    // NEVER return the API key
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Test Pappers error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Erreur inconnue",
        debug: {
          pappers: {
            attempted: true,
            cached: false,
            status: null,
            error: error instanceof Error ? error.message : "Unknown",
            fetched_at: new Date().toISOString(),
            expires_at: null,
          }
        }
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
