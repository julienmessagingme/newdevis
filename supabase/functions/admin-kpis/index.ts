import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get the JWT from the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Non autorisé" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create client with user's JWT to verify identity
    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Non autorisé" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create admin client for checking role and fetching data
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is admin
    const { data: roleData, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: "Accès réservé aux administrateurs" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch all KPIs using admin client
    const [usageResult, scoringResult, trackingResult, documentsResult, alertsResult] = await Promise.all([
      // Usage KPIs
      adminClient.rpc("get_admin_usage_kpis"),
      // Scoring KPIs
      adminClient.rpc("get_admin_scoring_kpis"),
      // Tracking KPIs
      adminClient.rpc("get_admin_tracking_kpis"),
      // Document type distribution
      adminClient.rpc("get_admin_document_kpis"),
      // Alert frequency
      adminClient.rpc("get_admin_alerts_kpis"),
    ]);

    // If RPC functions don't exist, query directly
    let usage, scoring, tracking, documents, alerts;

    // Fetch usage KPIs directly
    const { data: analysesData } = await adminClient
      .from("analyses")
      .select("id, user_id, status, score, alertes, raw_text, created_at");

    const analyses = analysesData || [];
    
    usage = {
      total_users: new Set(analyses.map(a => a.user_id)).size,
      total_analyses: analyses.length,
      completed_analyses: analyses.filter(a => a.status === "completed").length,
      pending_analyses: analyses.filter(a => a.status === "pending").length,
      error_analyses: analyses.filter(a => a.status === "error").length,
      completion_rate: analyses.length > 0 
        ? Math.round((analyses.filter(a => a.status === "completed").length / analyses.length) * 1000) / 10
        : 0,
      avg_analyses_per_user: new Set(analyses.map(a => a.user_id)).size > 0
        ? Math.round((analyses.length / new Set(analyses.map(a => a.user_id)).size) * 10) / 10
        : 0,
    };

    // Scoring KPIs
    const completedAnalyses = analyses.filter(a => a.status === "completed");
    const scoredAnalyses = completedAnalyses.filter(a => a.score);
    
    scoring = {
      score_vert: scoredAnalyses.filter(a => a.score === "VERT").length,
      score_orange: scoredAnalyses.filter(a => a.score === "ORANGE").length,
      score_rouge: scoredAnalyses.filter(a => a.score === "ROUGE").length,
      pct_vert: scoredAnalyses.length > 0 
        ? Math.round((scoredAnalyses.filter(a => a.score === "VERT").length / scoredAnalyses.length) * 1000) / 10
        : 0,
      pct_orange: scoredAnalyses.length > 0
        ? Math.round((scoredAnalyses.filter(a => a.score === "ORANGE").length / scoredAnalyses.length) * 1000) / 10
        : 0,
      pct_rouge: scoredAnalyses.length > 0
        ? Math.round((scoredAnalyses.filter(a => a.score === "ROUGE").length / scoredAnalyses.length) * 1000) / 10
        : 0,
    };

    // Calculate alerts frequency
    const alertsCount: Record<string, number> = {};
    let totalAlerts = 0;
    
    for (const analysis of completedAnalyses) {
      if (analysis.alertes && Array.isArray(analysis.alertes)) {
        for (const alerte of analysis.alertes) {
          // Extract main category from alert text
          const alertText = String(alerte).toLowerCase();
          let category = "Autre";
          
          if (alertText.includes("siret") || alertText.includes("siren")) {
            category = "SIRET/SIREN";
          } else if (alertText.includes("assurance") || alertText.includes("décennale")) {
            category = "Assurance";
          } else if (alertText.includes("prix") || alertText.includes("tarif") || alertText.includes("cher")) {
            category = "Prix";
          } else if (alertText.includes("acompte") || alertText.includes("paiement")) {
            category = "Paiement";
          } else if (alertText.includes("tva")) {
            category = "TVA";
          } else if (alertText.includes("mention") || alertText.includes("légal")) {
            category = "Mentions légales";
          } else if (alertText.includes("rge") || alertText.includes("qualibat")) {
            category = "Certifications";
          }
          
          alertsCount[category] = (alertsCount[category] || 0) + 1;
          totalAlerts++;
        }
      }
    }

    // Sort alerts by frequency
    const topAlerts = Object.entries(alertsCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([category, count]) => ({ category, count, percentage: Math.round((count / totalAlerts) * 100) }));

    alerts = {
      total_alerts: totalAlerts,
      avg_alerts_per_analysis: completedAnalyses.length > 0 
        ? Math.round((totalAlerts / completedAnalyses.length) * 10) / 10
        : 0,
      top_alerts: topAlerts,
      analyses_without_critical: scoredAnalyses.filter(a => a.score !== "ROUGE").length,
      pct_without_critical: scoredAnalyses.length > 0
        ? Math.round((scoredAnalyses.filter(a => a.score !== "ROUGE").length / scoredAnalyses.length) * 1000) / 10
        : 0,
    };

    // Document type distribution
    let devisTravaux = 0;
    let devisDiagnostic = 0;
    let devisPrestationTechnique = 0;
    let documentsRefuses = 0;

    for (const analysis of analyses) {
      if (analysis.raw_text) {
        try {
          const parsed = JSON.parse(analysis.raw_text);
          const docType = parsed?.document_detection?.type;
          
          if (docType === "devis_travaux") devisTravaux++;
          else if (docType === "devis_diagnostic_immobilier") devisDiagnostic++;
          else if (docType === "devis_prestation_technique") devisPrestationTechnique++;
          else if (docType === "facture" || docType === "autre") documentsRefuses++;
          else devisTravaux++; // Default to devis travaux if no detection
        } catch {
          devisTravaux++; // Default if not JSON
        }
      } else {
        devisTravaux++;
      }
    }

    documents = {
      devis_travaux: devisTravaux,
      devis_diagnostic: devisDiagnostic,
      devis_prestation_technique: devisPrestationTechnique,
      documents_refuses: documentsRefuses,
      total: analyses.length,
    };

    // Tracking KPIs
    const { data: trackingData } = await adminClient
      .from("post_signature_tracking")
      .select("*");

    const trackings = trackingData || [];
    
    tracking = {
      total_entries: trackings.length,
      consent_given: trackings.filter(t => t.tracking_consent).length,
      consent_rate: trackings.length > 0
        ? Math.round((trackings.filter(t => t.tracking_consent).length / trackings.length) * 1000) / 10
        : 0,
      whatsapp_enabled: trackings.filter(t => t.phone_number && t.tracking_consent).length,
      whatsapp_rate: trackings.filter(t => t.tracking_consent).length > 0
        ? Math.round((trackings.filter(t => t.phone_number && t.tracking_consent).length / trackings.filter(t => t.tracking_consent).length) * 1000) / 10
        : 0,
      signed_quotes: trackings.filter(t => t.is_signed).length,
      responses_received: trackings.filter(t => t.work_completion_status).length,
      status_completed: trackings.filter(t => t.work_completion_status === "oui").length,
      status_in_progress: trackings.filter(t => t.work_completion_status === "en_cours").length,
      status_delayed: trackings.filter(t => t.work_completion_status === "non_retard").length,
    };

    // Time-based analytics
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - today.getDay());
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const timeAnalytics = {
      today: analyses.filter(a => new Date(a.created_at) >= today).length,
      this_week: analyses.filter(a => new Date(a.created_at) >= thisWeekStart).length,
      this_month: analyses.filter(a => new Date(a.created_at) >= thisMonthStart).length,
    };

    return new Response(
      JSON.stringify({
        usage,
        scoring,
        tracking,
        documents,
        alerts,
        time_analytics: timeAnalytics,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    console.error("Error fetching admin KPIs:", error);
    return new Response(
      JSON.stringify({ error: "Erreur lors de la récupération des KPIs" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
