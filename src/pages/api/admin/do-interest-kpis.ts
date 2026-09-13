export const prerender = false;

/**
 * GET /api/admin/do-interest-kpis
 *
 * Suivi des TESTS D'INTÉRÊT (dommages-ouvrage ouvert le 2026-08-27, crédit
 * travaux ouvert le 2026-08-29 — verdict à 3 mois chacun, règle Johan :
 * aucun clic au bout de 3 mois = piste abandonnée).
 *
 * Le chiffre qui décide n'est pas le nombre de clics brut mais le TAUX DE CLIC
 * = clics / affichages RÉELS. Les dénominateurs sont donc calculés :
 *   - dommages-ouvrage : analyses dont la conclusion porte le levier
 *     `dommages_ouvrage` (~25 % des devis, gros œuvre) ;
 *   - crédit : analyses ≥ 5 000 € HT portant des leviers (le bloc n'apparaît
 *     que si la section Phase 4 est rendue).
 *
 * Réservé aux admins (check user_roles).
 */

import type { APIRoute } from "astro";
import { jsonOk, jsonError, requireAuth, optionsResponse, createServiceClient } from "@/lib/api/apiHelpers";

const TESTS = {
  dommages_ouvrage: { label: "Dommages-ouvrage", start: "2026-08-27T00:00:00.000Z" },
  credit: { label: "Financement travaux", start: "2026-08-29T00:00:00.000Z" },
} as const;
const TEST_DAYS = 90;
const CREDIT_MIN_HT = 5000;

type Topic = keyof typeof TESTS;

export const GET: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;

  const { data: roleData } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleData) return jsonError("Accès refusé", 403);

  const supabase = createServiceClient();
  const oldestStart = TESTS.dommages_ouvrage.start;

  const [clicksRes, analysesRes] = await Promise.all([
    supabase.from("lead_interest").select("topic, analysis_id, user_id, montant_ht, reponse, created_at").order("created_at", { ascending: false }),
    supabase
      .from("analyses")
      .select("id, created_at, user_id, conclusion_ia, raw_text")
      .eq("status", "completed")
      .gte("created_at", oldestStart),
  ]);
  if (clicksRes.error) return jsonError(`lead_interest: ${clicksRes.error.message}`, 500);
  const clicks = clicksRes.data ?? [];

  // Dénominateurs : ce qui a RÉELLEMENT été affiché, par sujet.
  const eligibles: Record<Topic, number> = { dommages_ouvrage: 0, credit: 0 };
  const exposes: Record<Topic, Set<string>> = { dommages_ouvrage: new Set(), credit: new Set() };

  for (const a of analysesRes.data ?? []) {
    let leviers: Array<Record<string, unknown>> = [];
    try {
      const ci = typeof a.conclusion_ia === "string" ? JSON.parse(a.conclusion_ia) : a.conclusion_ia;
      leviers = Array.isArray(ci?.leviers) ? ci.leviers : [];
    } catch { /* conclusion illisible → non éligible */ }
    if (leviers.length === 0) continue;

    // 2026-09-13 — la question DO est désormais posée à toute la population
    // concernée (devis touchant au gros œuvre), et plus seulement là où le
    // CONSEIL se déclenche. ⚠️ Sauf quand une DO est DÉJÀ facturée au devis :
    // on ne demande pas à quelqu'un s'il envisage ce qu'il paie déjà.
    let grosOeuvre = false;
    try {
      const ci = typeof a.conclusion_ia === "string" ? JSON.parse(a.conclusion_ia) : a.conclusion_ia;
      grosOeuvre = ci?.travaux_gros_oeuvre === true;
    } catch { /* conclusion illisible */ }
    const conseilDo = leviers.some((l) => l?.type === "dommages_ouvrage");
    const dejaAuDevis = leviers.some((l) => l?.type === "dommages_ouvrage_verification");
    if ((conseilDo || grosOeuvre) && !dejaAuDevis) {
      eligibles.dommages_ouvrage++;
      if (a.user_id) exposes.dommages_ouvrage.add(a.user_id);
    }
    if (a.created_at >= TESTS.credit.start) {
      let ht = 0;
      try {
        const raw = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text;
        ht = Number(raw?.extracted?.totaux?.ht ?? raw?.extracted_data?.totaux?.ht ?? 0);
      } catch { /* montant inconnu → non éligible */ }
      if (ht >= CREDIT_MIN_HT) {
        eligibles.credit++;
        if (a.user_id) exposes.credit.add(a.user_id);
      }
    }
  }

  // 2026-09-13 — LE DÉNOMINATEUR RÉEL, enfin mesuré au lieu d'être reconstitué.
  // `eligibles` ci-dessus rejoue les conditions d'affichage : il dit combien de
  // pages AURAIENT dû montrer la question, pas combien l'ont montrée. Les deux
  // divergent dès qu'un utilisateur n'ouvre jamais son analyse ou ne descend
  // pas jusqu'au bloc. Les affichages réels sont désormais journalisés.
  const EVENEMENT: Record<Topic, string> = {
    dommages_ouvrage: "sondage_do_vu",
    credit: "sondage_credit_vu",
  };
  const affichages: Record<Topic, number> = { dommages_ouvrage: 0, credit: 0 };
  const vuesRes = await supabase
    .from("site_events")
    .select("event")
    .in("event", Object.values(EVENEMENT));
  for (const v of vuesRes.data ?? []) {
    const t = (Object.keys(EVENEMENT) as Topic[]).find((k) => EVENEMENT[k] === v.event);
    if (t) affichages[t]++;
  }

  const tests = (Object.keys(TESTS) as Topic[]).map((topic) => {
    const mine = clicks.filter((c) => c.topic === topic);
    // Chaque réponse est une donnée, y compris les négatives — c'est tout
    // l'objet du passage au sondage. `reponse` est NULL sur les lignes
    // antérieures au 13/09, où seul le clic positif existait.
    const reponses = {
      interesse: mine.filter((c) => (c.reponse ?? "interesse") === "interesse").length,
      deja_equipe: mine.filter((c) => c.reponse === "deja_equipe").length,
      non: mine.filter((c) => c.reponse === "non").length,
    };
    const start = TESTS[topic].start;
    const joursEcoules = Math.floor((Date.now() - new Date(start).getTime()) / 86_400_000);
    return {
      topic,
      label: TESTS[topic].label,
      test_start: start,
      jours_ecoules: joursEcoules,
      jours_restants: Math.max(0, TEST_DAYS - joursEcoules),
      clics: mine.length,
      reponses,
      eligibles: eligibles[topic],
      affichages: affichages[topic],
      utilisateurs_exposes: exposes[topic].size,
      taux_clic: eligibles[topic] > 0 ? Math.round((mine.length / eligibles[topic]) * 1000) / 10 : null,
      // Le seul taux qui ait un sens : réponses rapportées aux affichages
      // RÉELLEMENT comptés. `null` tant qu'aucun affichage n'a été journalisé
      // — un taux sans dénominateur n'est pas un taux.
      taux_reponse: affichages[topic] > 0
        ? Math.round((mine.length / affichages[topic]) * 1000) / 10
        : null,
      part_interesses: mine.length > 0
        ? Math.round((reponses.interesse / mine.length) * 1000) / 10
        : null,
      montant_chantiers_cumule: Math.round(mine.reduce((s, c) => s + (Number(c.montant_ht) || 0), 0)),
      derniers_clics: mine.slice(0, 5).map((c) => ({
        analysis_id: c.analysis_id,
        montant_ht: c.montant_ht,
        created_at: c.created_at,
      })),
    };
  });

  return jsonOk({ tests });
};

export const OPTIONS: APIRoute = () => optionsResponse("GET,OPTIONS");
