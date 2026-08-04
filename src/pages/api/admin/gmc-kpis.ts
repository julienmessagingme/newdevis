export const prerender = false;

/**
 * GET /api/admin/gmc-kpis
 *
 * KPIs GérerMonChantier pour le tableau de bord /admin (section dédiée GMC,
 * demandée 2026-08-04). Agrégats calculés côté serveur depuis
 * `gmc_subscriptions` + `chantiers` + auth admin (last_sign_in_at) :
 *
 *   - inscrits : total, 7j, 30j, par source (gmc / vmd / comp)
 *   - statuts : essais actifs, essais expirés, abonnés payants, past_due
 *   - connexions : actifs 7j / 30j (last_sign_in_at des inscrits GMC)
 *   - chantiers : total, créés 7j
 *   - derniers inscrits (10) avec dernière connexion + nb chantiers
 *
 * Réservé aux admins (check user_roles). Volumétrie actuelle faible
 * (< 1000 inscrits GMC) → listUsers paginé suffit, cap sécurité 10 pages.
 */

import type { APIRoute } from "astro";
import { jsonOk, jsonError, requireAuth, optionsResponse } from "@/lib/api/apiHelpers";

export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;
  const { user, supabase } = ctx;

  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleData) return jsonError("Accès refusé", 403);

  try {
    const now = Date.now();
    const d7 = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
    const d30 = new Date(now - 30 * 24 * 3600 * 1000).toISOString();

    const [subsRes, chantiersRes] = await Promise.all([
      supabase
        .from("gmc_subscriptions")
        .select("user_id, created_at, signup_source, status, plan, trial_ends_at, stripe_subscription_id")
        .order("created_at", { ascending: false }),
      supabase.from("chantiers").select("user_id, created_at"),
    ]);

    if (subsRes.error) return jsonError(`gmc_subscriptions: ${subsRes.error.message}`, 500);
    const subs = subsRes.data ?? [];
    const chantiers = chantiersRes.data ?? [];

    // Chantiers par user + globaux
    const chantiersByUser = new Map<string, number>();
    let chantiers7j = 0;
    for (const c of chantiers) {
      chantiersByUser.set(c.user_id, (chantiersByUser.get(c.user_id) ?? 0) + 1);
      if (c.created_at >= d7) chantiers7j++;
    }

    // Infos auth (email, dernière connexion) — un seul parcours paginé
    const authById = new Map<string, { email: string; last_sign_in_at: string | null }>();
    const gmcIds = new Set(subs.map((s) => s.user_id));
    let page = 1;
    while (page <= 10) {
      const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      for (const u of data?.users ?? []) {
        if (gmcIds.has(u.id)) {
          authById.set(u.id, { email: u.email ?? "(sans email)", last_sign_in_at: u.last_sign_in_at ?? null });
        }
      }
      if (!data?.users || data.users.length < 1000) break;
      page++;
    }

    // Agrégats
    const nowIso = new Date().toISOString();
    let trialActifs = 0, trialExpires = 0, payants = 0, pastDue = 0, comp = 0;
    let inscrits7j = 0, inscrits30j = 0;
    let viaGmc = 0, viaVmd = 0;
    let actifs7j = 0, actifs30j = 0;

    for (const s of subs) {
      if (s.created_at >= d7) inscrits7j++;
      if (s.created_at >= d30) inscrits30j++;

      const isComp = s.signup_source === "comp";
      if (isComp) comp++;
      else if (s.signup_source === "gerermonchantier") viaGmc++;
      else if (s.signup_source === "verifiermondevis") viaVmd++;

      // Les comptes offerts (comp) ne comptent ni en payants ni en essais —
      // sinon les 2 comptes fondateurs gonflent le KPI « Abonnés payants ».
      if (!isComp) {
        if (s.status === "active") payants++;
        else if (s.status === "past_due") pastDue++;
        else if (s.status === "expired") trialExpires++;
        else if (s.status === "trial") {
          if (s.trial_ends_at && s.trial_ends_at < nowIso) trialExpires++;
          else trialActifs++;
        }
      }

      const last = authById.get(s.user_id)?.last_sign_in_at;
      if (last) {
        if (last >= d7) actifs7j++;
        if (last >= d30) actifs30j++;
      }
    }

    // Derniers inscrits (subs déjà triés desc)
    const derniers = subs.slice(0, 10).map((s) => {
      const auth = authById.get(s.user_id);
      return {
        user_id: s.user_id,
        email: auth?.email ?? "(inconnu)",
        signup_source: s.signup_source ?? null,
        status: s.status,
        plan: s.plan ?? null,
        created_at: s.created_at,
        trial_ends_at: s.trial_ends_at ?? null,
        last_sign_in_at: auth?.last_sign_in_at ?? null,
        nb_chantiers: chantiersByUser.get(s.user_id) ?? 0,
      };
    });

    return jsonOk({
      inscrits: {
        total: subs.length,
        last_7d: inscrits7j,
        last_30d: inscrits30j,
        via_gmc: viaGmc,
        via_vmd: viaVmd,
        comp,
      },
      statuts: {
        trial_actifs: trialActifs,
        trial_expires: trialExpires,
        payants,
        past_due: pastDue,
      },
      connexions: {
        actifs_7d: actifs7j,
        actifs_30d: actifs30j,
      },
      chantiers: {
        total: chantiers.length,
        crees_7d: chantiers7j,
      },
      derniers_inscrits: derniers,
    });
  } catch (e) {
    return jsonError(`Erreur GMC KPIs: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse("GET,OPTIONS");
