import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://verifiermondevis.fr",
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

    // === PARALLEL FETCH FROM SQL VIEWS (no full table scans) ===
    const [
      usageResult,
      scoringResult,
      trackingResult,
      timeResult,
      dailyResult,
      weeklyResult,
      alertsResult,
      documentsResult,
    ] = await Promise.all([
      adminClient.from("admin_kpis_usage").select("*").single(),
      adminClient.from("admin_kpis_scoring").select("*").single(),
      adminClient.from("admin_kpis_tracking").select("*").single(),
      adminClient.from("admin_kpis_time_analytics").select("*").single(),
      adminClient.from("admin_kpis_daily_evolution").select("*"),
      adminClient.from("admin_kpis_weekly_evolution").select("*"),
      adminClient.from("admin_kpis_alerts").select("*"),
      adminClient.from("admin_kpis_documents").select("*").single(),
    ]);

    // === BUILD RESPONSE FROM VIEW DATA ===
    const usageData = usageResult.data;
    const usage = {
      total_users: Number(usageData?.total_users ?? 0),
      total_analyses: Number(usageData?.total_analyses ?? 0),
      completed_analyses: Number(usageData?.completed_analyses ?? 0),
      pending_analyses: Number(usageData?.pending_analyses ?? 0),
      error_analyses: Number(usageData?.error_analyses ?? 0),
      completion_rate: Number(usageData?.completion_rate ?? 0),
      avg_analyses_per_user: Number(usageData?.avg_analyses_per_user ?? 0),
    };

    const scoringData = scoringResult.data;
    const scoring = {
      score_vert: Number(scoringData?.score_vert ?? 0),
      score_orange: Number(scoringData?.score_orange ?? 0),
      score_rouge: Number(scoringData?.score_rouge ?? 0),
      pct_vert: Number(scoringData?.pct_vert ?? 0),
      pct_orange: Number(scoringData?.pct_orange ?? 0),
      pct_rouge: Number(scoringData?.pct_rouge ?? 0),
    };

    const trackingData = trackingResult.data;
    const tracking = {
      total_entries: Number(trackingData?.total_tracking_entries ?? 0),
      consent_given: Number(trackingData?.consent_given ?? 0),
      consent_rate: Number(trackingData?.consent_rate ?? 0),
      whatsapp_enabled: Number(trackingData?.whatsapp_enabled ?? 0),
      whatsapp_rate: Number(trackingData?.whatsapp_rate ?? 0),
      signed_quotes: Number(trackingData?.signed_quotes ?? 0),
      responses_received: Number(trackingData?.responses_received ?? 0),
      status_completed: Number(trackingData?.status_completed ?? 0),
      status_in_progress: Number(trackingData?.status_in_progress ?? 0),
      status_delayed: Number(trackingData?.status_delayed ?? 0),
    };

    const timeData = timeResult.data;
    const timeAnalytics = {
      today: Number(timeData?.today ?? 0),
      this_week: Number(timeData?.this_week ?? 0),
      this_month: Number(timeData?.this_month ?? 0),
    };

    // Daily evolution — format labels for frontend charts
    const evolutionDaily = (dailyResult.data || []).map((d: Record<string, unknown>) => ({
      date: d.date,
      label: new Date(String(d.date)).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      analyses: Number(d.analyses ?? 0),
      vert: Number(d.vert ?? 0),
      orange: Number(d.orange ?? 0),
      rouge: Number(d.rouge ?? 0),
      users: Number(d.users ?? 0),
    }));

    // Weekly evolution
    const evolutionWeekly = (weeklyResult.data || []).map((d: Record<string, unknown>) => ({
      week: d.week,
      label: d.label,
      analyses: Number(d.analyses ?? 0),
      vert: Number(d.vert ?? 0),
      orange: Number(d.orange ?? 0),
      rouge: Number(d.rouge ?? 0),
      users: Number(d.users ?? 0),
    }));

    // Alerts — build from view rows
    const alertRows = alertsResult.data || [];
    const totalAlerts = alertRows.length > 0 ? Number(alertRows[0]?.total_alerts ?? 0) : 0;
    const avgAlertsPerAnalysis = alertRows.length > 0 ? Number(alertRows[0]?.avg_alerts_per_analysis ?? 0) : 0;
    const topAlerts = alertRows.slice(0, 10).map((r: Record<string, unknown>) => ({
      category: r.category,
      count: Number(r.count ?? 0),
      percentage: Number(r.percentage ?? 0),
    }));

    // Compute analyses_without_critical from scoring data
    const scoredTotal = scoring.score_vert + scoring.score_orange + scoring.score_rouge;
    const analysesWithoutCritical = scoredTotal - scoring.score_rouge;

    const alerts = {
      total_alerts: totalAlerts,
      avg_alerts_per_analysis: avgAlertsPerAnalysis,
      top_alerts: topAlerts,
      analyses_without_critical: analysesWithoutCritical,
      pct_without_critical: scoredTotal > 0
        ? Math.round((analysesWithoutCritical / scoredTotal) * 1000) / 10
        : 0,
    };

    // Documents
    const docsData = documentsResult.data;
    const documents = {
      devis_travaux: Number(docsData?.devis_travaux ?? 0),
      devis_diagnostic: Number(docsData?.devis_diagnostic ?? 0),
      devis_prestation_technique: Number(docsData?.devis_prestation_technique ?? 0),
      documents_refuses: Number(docsData?.documents_refuses ?? 0),
      total: Number(docsData?.total ?? 0),
    };

    // Score distribution for pie chart
    const scoreDistribution = [
      { name: "FEU VERT", value: scoring.score_vert, color: "hsl(var(--score-green))" },
      { name: "FEU ORANGE", value: scoring.score_orange, color: "hsl(var(--score-orange))" },
      { name: "FEU ROUGE", value: scoring.score_rouge, color: "hsl(var(--score-red))" },
    ].filter(s => s.value > 0);

    return new Response(
      JSON.stringify({
        usage,
        scoring,
        tracking,
        documents,
        alerts,
        time_analytics: timeAnalytics,
        charts: {
          evolution_daily: evolutionDaily,
          evolution_weekly: evolutionWeekly,
          score_distribution: scoreDistribution,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    console.error("Error fetching admin KPIs:", error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: "Erreur lors de la récupération des KPIs" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
