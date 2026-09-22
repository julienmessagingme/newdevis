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

/**
 * 🔴 2026-09-22 (décision Johan) — `start` N'EST PAS LA DATE DE MESURE.
 *
 * `start` date l'ouverture du test. `mesureDepuis` date le moment où la
 * question a été posée **dans sa forme actuelle et à sa place actuelle** : un
 * taux calculé sur les deux périodes mélangées ne mesure rien.
 *
 * Le cas qui l'a imposé : sur les 43 affichages du sondage financement, **32
 * (74 %) datent des 14 et 15 septembre**, quand il vivait encore au 2ᵉ bloc de
 * la page d'analyse — le lecteur venait d'apprendre s'il devait signer et on
 * l'interrompait avec une question de financement. Il a déménagé dans la
 * modale de fin de lecture le 16/09.
 *
 *   toutes périodes confondues : 43 affichages · 1 réponse → 2,3 %
 *   depuis le déménagement     : 11 affichages · 1 réponse → 9,1 %
 *
 * Le premier chiffre aurait fait conclure « la piste ne prend pas ». Le second
 * dit qu'on n'a simplement pas encore assez d'observations. **Même famille que
 * la file de revue du 16/09 : un compteur sans son origine ne veut rien dire.**
 *
 * ⚠️ Les affichages antérieurs ne sont PAS effacés : ils restent exposés sous
 * `affichages_hors_periode`. Hors de la décision ne veut pas dire hors de la
 * mémoire.
 */
const TESTS = {
  dommages_ouvrage: {
    label: "Dommages-ouvrage",
    start: "2026-08-27T00:00:00.000Z",
    mesureDepuis: "2026-09-14T00:00:00.000Z",
    mesureMotif: "question reformulée — le « pourquoi » ajouté et le stade du lecteur corrigé",
  },
  credit: {
    label: "Financement travaux",
    start: "2026-08-29T00:00:00.000Z",
    mesureDepuis: "2026-09-16T00:00:00.000Z",
    mesureMotif: "déplacé du 2ᵉ bloc de la page vers la modale de fin de lecture",
  },
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
  //
  // ⚠️ 2026-09-22 — LE COMPTE EST BORNÉ À `mesureDepuis`, PAR SUJET. Les
  // affichages antérieurs sont comptés à part (`affichages_hors_periode`) : ils
  // ont existé, ils ne décident de rien.
  const affichages: Record<Topic, number> = { dommages_ouvrage: 0, credit: 0 };
  const affichagesAvant: Record<Topic, number> = { dommages_ouvrage: 0, credit: 0 };
  const vuesRes = await supabase
    .from("site_events")
    .select("event, created_at")
    .in("event", Object.values(EVENEMENT));
  for (const v of vuesRes.data ?? []) {
    const t = (Object.keys(EVENEMENT) as Topic[]).find((k) => EVENEMENT[k] === v.event);
    if (!t) continue;
    if (String(v.created_at) >= TESTS[t].mesureDepuis) affichages[t]++;
    else affichagesAvant[t]++;
  }

  const tests = (Object.keys(TESTS) as Topic[]).map((topic) => {
    const toutes = clicks.filter((c) => c.topic === topic);
    // ⚠️ Le NUMÉRATEUR est borné comme le DÉNOMINATEUR — sinon le taux
    // rapporterait des réponses de l'ancien emplacement aux affichages du
    // nouveau, et il serait faux dans le sens flatteur.
    const mine = toutes.filter((c) => String(c.created_at) >= TESTS[topic].mesureDepuis);
    // Chaque réponse est une donnée, y compris les négatives — c'est tout
    // l'objet du passage au sondage. `reponse` est NULL sur les lignes
    // antérieures au 13/09, où seul le clic positif existait.
    const reponses = {
      interesse: mine.filter((c) => (c.reponse ?? "interesse") === "interesse").length,
      deja_equipe: mine.filter((c) => c.reponse === "deja_equipe").length,
      non: mine.filter((c) => c.reponse === "non").length,
    };
    // Le compte à rebours part de la MESURE, pas de l'ouverture du test :
    // trois mois pleins de la question dans sa forme actuelle.
    const depuis = TESTS[topic].mesureDepuis;
    const joursEcoules = Math.floor((Date.now() - new Date(depuis).getTime()) / 86_400_000);
    const echeance = new Date(new Date(depuis).getTime() + TEST_DAYS * 86_400_000);
    return {
      topic,
      label: TESTS[topic].label,
      test_start: TESTS[topic].start,
      mesure_depuis: depuis,
      mesure_motif: TESTS[topic].mesureMotif,
      echeance: echeance.toISOString(),
      jours_ecoules: joursEcoules,
      jours_restants: Math.max(0, TEST_DAYS - joursEcoules),
      clics: mine.length,
      clics_hors_periode: toutes.length - mine.length,
      reponses,
      eligibles: eligibles[topic],
      affichages: affichages[topic],
      affichages_hors_periode: affichagesAvant[topic],
      utilisateurs_exposes: exposes[topic].size,
      taux_clic: eligibles[topic] > 0 ? Math.round((mine.length / eligibles[topic]) * 1000) / 10 : null,
      // Le seul taux qui ait un sens : réponses rapportées aux affichages
      // RÉELLEMENT comptés, sur la période où la question est posée dans sa
      // forme actuelle. `null` tant qu'aucun affichage n'a été journalisé —
      // un taux sans dénominateur n'est pas un taux.
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
