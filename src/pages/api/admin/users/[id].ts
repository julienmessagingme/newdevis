export const prerender = false;

/**
 * GET /api/admin/users/[id]
 *
 * Retourne la vue 360° d'un utilisateur pour la page admin.
 * Le paramètre `id` peut être un UUID (auth user_id) OU un email — plus
 * pratique pour naviguer depuis un mail reçu.
 *
 * Rassemble :
 *   - Profil auth (email, nom, tel, provider, dates, opt-in commercial)
 *   - Abonnement GMC (plan, statut, trial, Stripe)
 *   - Signup VMD (le cas échéant)
 *   - Chantiers créés + activité par chantier (lots, docs, contacts, tâches)
 *   - Analyses VMD réalisées
 *   - Emails GMC + VMD envoyés
 *   - Agent insights générés
 *   - Timeline d'activité (30 derniers événements horodatés)
 *
 * Réservé aux admins (check user_roles).
 */

import type { APIRoute } from "astro";
import { jsonOk, jsonError, requireAuth, optionsResponse } from "@/lib/api/apiHelpers";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async ({ request, params }) => {
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

  const rawParam = decodeURIComponent(params.id ?? "");
  if (!rawParam) return jsonError("Paramètre id manquant", 400);

  // Résout l'utilisateur — soit par UUID, soit par email (plus pratique)
  let targetUserId: string | null = null;
  let targetEmail: string | null = null;
  let targetUser: any = null;

  if (UUID_REGEX.test(rawParam)) {
    const { data: got } = await supabase.auth.admin.getUserById(rawParam);
    if (!got?.user) return jsonError("Utilisateur introuvable", 404);
    targetUser = got.user;
    targetUserId = got.user.id;
    targetEmail = got.user.email ?? null;
  } else if (rawParam.includes("@")) {
    // Pas d'API getUserByEmail — on parcourt jusqu'à trouver
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data } = await supabase.auth.admin.listUsers({ page, perPage });
      const found = data?.users?.find((u) => (u.email ?? "").toLowerCase() === rawParam.toLowerCase());
      if (found) {
        targetUser = found;
        targetUserId = found.id;
        targetEmail = found.email ?? null;
        break;
      }
      if (!data?.users || data.users.length < perPage) break;
      page++;
      if (page > 50) break; // safety cap
    }
    if (!targetUser) return jsonError("Utilisateur introuvable", 404);
  } else {
    return jsonError("Paramètre id invalide (UUID ou email attendu)", 400);
  }

  const uid = targetUserId!;

  // Requêtes parallèles pour rassembler la vue 360°
  const [
    gmcSub, vmdSignup, chantiers, analyses, gmcEmails, vmdEmails, agentInsights,
  ] = await Promise.all([
    supabase.from("gmc_subscriptions").select("*").eq("user_id", uid).maybeSingle(),
    supabase.from("vmd_signups").select("*").eq("user_id", uid).maybeSingle().then(r => r).catch(() => ({ data: null, error: null })),
    supabase.from("chantiers")
      .select("id, nom, created_at, updated_at, date_debut_chantier, date_fin_souhaitee, budget, statut, work_type")
      .eq("user_id", uid).order("created_at", { ascending: false }),
    supabase.from("analyses")
      .select("id, file_name, created_at, status, score, review_status, work_type")
      .eq("user_id", uid).order("created_at", { ascending: false }).limit(50),
    supabase.from("gmc_email_log").select("*").eq("user_id", uid).order("sent_at", { ascending: false }).limit(50)
      .then(r => r).catch(() => ({ data: null, error: null })),
    supabase.from("vmd_email_log").select("*").eq("user_id", uid).order("sent_at", { ascending: false }).limit(50)
      .then(r => r).catch(() => ({ data: null, error: null })),
    (async () => {
      // agent_insights est jointure via chantier_id, on récupère les chantiers d'abord
      const { data: cs } = await supabase.from("chantiers").select("id").eq("user_id", uid);
      const ids = (cs ?? []).map((c) => c.id);
      if (ids.length === 0) return { data: [], error: null };
      return supabase.from("agent_insights")
        .select("id, chantier_id, type, titre, body, created_at, read_by_user")
        .in("chantier_id", ids)
        .order("created_at", { ascending: false })
        .limit(30);
    })(),
  ]);

  // Pour chaque chantier, compteurs
  const chantiersEnriched = await Promise.all(
    (chantiers.data ?? []).map(async (c) => {
      const [lots, docs, contacts, taches] = await Promise.all([
        supabase.from("lots_chantier").select("id, nom, statut, duree_jours").eq("chantier_id", c.id),
        supabase.from("documents_chantier").select("id, document_type, nom, montant, created_at").eq("chantier_id", c.id).order("created_at", { ascending: false }),
        supabase.from("contacts_chantier").select("id, nom, role, entreprise, telephone, email").eq("chantier_id", c.id),
        supabase.from("taches_chantier").select("id, titre, statut, priorite").eq("chantier_id", c.id),
      ]);
      return {
        ...c,
        counters: {
          lots: (lots.data ?? []).length,
          documents: (docs.data ?? []).length,
          contacts: (contacts.data ?? []).length,
          taches: (taches.data ?? []).length,
        },
        lots: lots.data ?? [],
        documents: (docs.data ?? []).slice(0, 20),
        contacts: contacts.data ?? [],
        taches: taches.data ?? [],
      };
    }),
  );

  // Timeline unifiée : chantiers, docs, agent_insights, emails
  type TimelineEvent = { at: string; kind: string; label: string; chantier_id?: string };
  const events: TimelineEvent[] = [];
  for (const c of chantiersEnriched) {
    events.push({ at: c.created_at, kind: "chantier_created", label: `Chantier créé : ${c.nom}`, chantier_id: c.id });
    for (const d of c.documents.slice(0, 5)) {
      events.push({ at: d.created_at, kind: "doc_uploaded", label: `Document uploadé : ${d.document_type} ${d.nom ?? ""}`, chantier_id: c.id });
    }
  }
  for (const ins of (agentInsights.data ?? [])) {
    events.push({ at: ins.created_at, kind: "agent_insight", label: `Alerte IA : ${ins.titre ?? ins.type}`, chantier_id: ins.chantier_id });
  }
  for (const e of (gmcEmails.data ?? [])) {
    events.push({ at: e.sent_at, kind: "gmc_email", label: `Email GMC : ${e.email_type ?? "(type ?)"}` });
  }
  for (const e of (vmdEmails.data ?? [])) {
    events.push({ at: e.sent_at, kind: "vmd_email", label: `Email VMD : ${e.email_type ?? "(type ?)"}` });
  }
  events.sort((a, b) => (b.at || "").localeCompare(a.at || ""));

  return jsonOk({
    auth: {
      id: targetUser.id,
      email: targetEmail,
      created_at: targetUser.created_at,
      last_sign_in_at: targetUser.last_sign_in_at ?? null,
      email_confirmed_at: targetUser.email_confirmed_at ?? null,
      provider: targetUser.app_metadata?.provider ?? null,
      metadata: targetUser.user_metadata ?? {},
    },
    gmc_subscription: gmcSub.data ?? null,
    vmd_signup: vmdSignup.data ?? null,
    chantiers: chantiersEnriched,
    analyses: analyses.data ?? [],
    gmc_emails: gmcEmails.data ?? [],
    vmd_emails: vmdEmails.data ?? [],
    agent_insights: agentInsights.data ?? [],
    timeline: events.slice(0, 30),
  });
};

export const OPTIONS: APIRoute = () => optionsResponse("GET,OPTIONS");
