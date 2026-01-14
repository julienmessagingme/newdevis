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

    // Fetch all analyses
    const { data: analysesData } = await adminClient
      .from("analyses")
      .select("id, user_id, status, score, alertes, raw_text, created_at");

    const analyses = analysesData || [];
    
    // === USAGE KPIs ===
    const usage = {
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

    // === SCORING KPIs ===
    const completedAnalyses = analyses.filter(a => a.status === "completed");
    const scoredAnalyses = completedAnalyses.filter(a => a.score);
    
    const scoring = {
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

    // === ALERTS KPIs ===
    const alertsCount: Record<string, number> = {};
    let totalAlerts = 0;
    
    for (const analysis of completedAnalyses) {
      if (analysis.alertes && Array.isArray(analysis.alertes)) {
        for (const alerte of analysis.alertes) {
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

    const topAlerts = Object.entries(alertsCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([category, count]) => ({ category, count, percentage: Math.round((count / totalAlerts) * 100) }));

    const alerts = {
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

    // === DOCUMENT TYPE KPIs ===
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
          else devisTravaux++;
        } catch {
          devisTravaux++;
        }
      } else {
        devisTravaux++;
      }
    }

    const documents = {
      devis_travaux: devisTravaux,
      devis_diagnostic: devisDiagnostic,
      devis_prestation_technique: devisPrestationTechnique,
      documents_refuses: documentsRefuses,
      total: analyses.length,
    };

    // === TRACKING KPIs ===
    const { data: trackingData } = await adminClient
      .from("post_signature_tracking")
      .select("*");

    const trackings = trackingData || [];
    
    const tracking = {
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

    // === TIME-BASED ANALYTICS ===
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

    // === TEMPORAL EVOLUTION DATA (last 30 days) ===
    const dailyData: Record<string, { date: string; analyses: number; vert: number; orange: number; rouge: number; users: Set<string> }> = {};
    
    // Initialize last 30 days
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyData[dateStr] = { date: dateStr, analyses: 0, vert: 0, orange: 0, rouge: 0, users: new Set() };
    }

    // Fill with actual data
    for (const analysis of analyses) {
      const dateStr = new Date(analysis.created_at).toISOString().split('T')[0];
      if (dailyData[dateStr]) {
        dailyData[dateStr].analyses++;
        dailyData[dateStr].users.add(analysis.user_id);
        
        if (analysis.score === "VERT") dailyData[dateStr].vert++;
        else if (analysis.score === "ORANGE") dailyData[dateStr].orange++;
        else if (analysis.score === "ROUGE") dailyData[dateStr].rouge++;
      }
    }

    // Convert to array format for charts
    const evolutionDaily = Object.values(dailyData).map(d => ({
      date: d.date,
      label: new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      analyses: d.analyses,
      vert: d.vert,
      orange: d.orange,
      rouge: d.rouge,
      users: d.users.size,
    }));

    // === WEEKLY EVOLUTION (last 12 weeks) ===
    const weeklyData: Record<string, { week: string; analyses: number; vert: number; orange: number; rouge: number; users: Set<string> }> = {};
    
    // Get week number function
    const getWeekKey = (date: Date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
      const week1 = new Date(d.getFullYear(), 0, 4);
      const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
      return `${d.getFullYear()}-S${weekNum.toString().padStart(2, '0')}`;
    };

    // Initialize last 12 weeks
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - (i * 7));
      const weekKey = getWeekKey(date);
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = { week: weekKey, analyses: 0, vert: 0, orange: 0, rouge: 0, users: new Set() };
      }
    }

    // Fill with actual data
    for (const analysis of analyses) {
      const weekKey = getWeekKey(new Date(analysis.created_at));
      if (weeklyData[weekKey]) {
        weeklyData[weekKey].analyses++;
        weeklyData[weekKey].users.add(analysis.user_id);
        
        if (analysis.score === "VERT") weeklyData[weekKey].vert++;
        else if (analysis.score === "ORANGE") weeklyData[weekKey].orange++;
        else if (analysis.score === "ROUGE") weeklyData[weekKey].rouge++;
      }
    }

    const evolutionWeekly = Object.values(weeklyData)
      .sort((a, b) => a.week.localeCompare(b.week))
      .map(d => ({
        week: d.week,
        label: d.week.split('-')[1],
        analyses: d.analyses,
        vert: d.vert,
        orange: d.orange,
        rouge: d.rouge,
        users: d.users.size,
      }));

    // === SCORE DISTRIBUTION PIE DATA ===
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
    console.error("Error fetching admin KPIs:", error);
    return new Response(
      JSON.stringify({ error: "Erreur lors de la récupération des KPIs" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
