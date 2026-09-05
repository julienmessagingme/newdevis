/**
 * supabase/functions/catalog-review-alert/index.ts
 *
 * 2026-09-05 (demande Johan) — RELECTURE SEMESTRIELLE DES FOURCHETTES.
 *
 * « Les prix des travaux et des matériaux changent régulièrement, il faudrait
 * prévoir une actualisation 2 fois par an. »
 *
 * Le catalogue porte déjà `last_reviewed_at` et `source` : ce qui manquait,
 * c'est la CADENCE. Rien ne signalait qu'une fourchette avait vieilli — à ce
 * jour 916 entrées sur 919 n'ont jamais été relues.
 *
 * Cette fonction n'actualise RIEN toute seule, et c'est délibéré : une
 * fourchette se source (relevé web, barème, retour d'un artisan), jamais
 * depuis nos propres devis — ce serait circulaire. Elle prépare le travail
 * humain en envoyant la liste des entrées à relire EN PRIORITÉ, classées par
 * montant réellement rapproché sur les 6 derniers mois.
 *
 * Déclenchée par pg_cron deux fois par an (1er février et 1er août).
 * Peut aussi être appelée à la main pour un point d'étape.
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const RECIPIENTS = ["bridey.johan@gmail.com", "julien@messagingme.fr"];

interface Ligne {
  job_type: string;
  label: string;
  unit: string | null;
  metier: string | null;
  price_min_unit_ht: number | null;
  price_max_unit_ht: number | null;
  fixed_min_ht: number | null;
  fixed_max_ht: number | null;
  source: string | null;
  last_reviewed_at: string | null;
  mois_depuis_revue: number | null;
  nb_matchs: number;
  montant_cumule: number;
}

const eur = (n: number | null) =>
  n === null || n === undefined ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`;

function fourchette(l: Ligne): string {
  if (l.price_min_unit_ht !== null && l.price_max_unit_ht !== null) {
    return `${eur(l.price_min_unit_ht)} – ${eur(l.price_max_unit_ht)} / ${l.unit ?? "u"}`;
  }
  if (l.fixed_min_ht !== null && l.fixed_max_ht !== null) {
    return `${eur(l.fixed_min_ht)} – ${eur(l.fixed_max_ht)} (forfait)`;
  }
  return "—";
}

function buildHtml(lignes: Ligne[], mois: number): string {
  const rows = lignes.map((l, i) => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:8px 6px;color:#6b7280">${i + 1}</td>
      <td style="padding:8px 6px">
        <strong>${l.label}</strong><br>
        <span style="color:#6b7280;font-size:12px">${l.job_type}${l.metier ? ` · ${l.metier}` : ""}</span>
      </td>
      <td style="padding:8px 6px;white-space:nowrap">${fourchette(l)}</td>
      <td style="padding:8px 6px;text-align:right;white-space:nowrap">${eur(l.montant_cumule)}</td>
      <td style="padding:8px 6px;text-align:right">${l.nb_matchs}</td>
      <td style="padding:8px 6px;color:#6b7280;white-space:nowrap">
        ${l.last_reviewed_at ? `il y a ${l.mois_depuis_revue} mois` : "<em>jamais relue</em>"}
      </td>
    </tr>`).join("");

  return `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:820px;margin:0 auto;color:#111827">
    <h2 style="margin:0 0 4px">Relecture semestrielle des fourchettes</h2>
    <p style="color:#6b7280;margin:0 0 20px">
      Les ${lignes.length} entrées du catalogue qui portent le plus de comparaisons
      et dont la fourchette n'a pas été relue depuis ${mois} mois.
    </p>

    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="text-align:left;border-bottom:2px solid #111827">
          <th style="padding:8px 6px">#</th>
          <th style="padding:8px 6px">Entrée catalogue</th>
          <th style="padding:8px 6px">Fourchette actuelle</th>
          <th style="padding:8px 6px;text-align:right">Montant rapproché</th>
          <th style="padding:8px 6px;text-align:right">Matchs</th>
          <th style="padding:8px 6px">Dernière revue</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="margin-top:24px;padding:14px 16px;background:#f9fafb;border-left:3px solid #111827">
      <p style="margin:0 0 8px;font-weight:600">Comment procéder</p>
      <p style="margin:0 0 8px;color:#374151;line-height:1.55">
        Le classement est fait par <strong>montant réellement rapproché</strong> sur la période :
        les premières lignes sont celles où une fourchette fausse coûte le plus cher en verdicts.
        Il n'est pas nécessaire de tout traiter — les cinq ou dix premières font l'essentiel du travail.
      </p>
      <p style="margin:0 0 8px;color:#374151;line-height:1.55">
        Une fourchette se <strong>source</strong> : relevé de prix public, barème de fédération,
        devis d'un artisan de confiance. <strong>Jamais depuis nos propres analyses</strong> — nous
        comparerions nos devis à eux-mêmes.
      </p>
      <p style="margin:0;color:#374151;line-height:1.55">
        Après correction, renseigner <code>last_reviewed_at = now()</code> et <code>source</code> sur
        l'entrée : elle sortira de cette liste au prochain envoi. Si la fourchette change,
        relancer <code>node scripts/seed_market_prices_embeddings.mjs</code> uniquement si le
        <em>libellé</em> a bougé — un changement de prix seul ne touche pas l'embedding.
      </p>
    </div>

    <p style="color:#9ca3af;font-size:12px;margin-top:20px">
      Envoi automatique — 1er février et 1er août. Fonction <code>catalog-review-alert</code>.
    </p>
  </div>`;
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY_VMD") ?? Deno.env.get("RESEND_API_KEY");

    const url = new URL(req.url);
    const mois = Number(url.searchParams.get("mois") ?? 6) || 6;
    const limite = Number(url.searchParams.get("limit") ?? 25) || 25;
    const dryRun = url.searchParams.get("dry_run") === "1";

    const rpc = await fetch(`${supabaseUrl}/rest/v1/rpc/catalog_review_queue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ p_mois: mois, p_limit: limite }),
    });

    if (!rpc.ok) {
      const detail = await rpc.text();
      console.error("[catalog-review] RPC échouée:", rpc.status, detail.slice(0, 300));
      return new Response(JSON.stringify({ error: "rpc_failed", status: rpc.status }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const lignes = (await rpc.json()) as Ligne[];

    // Rien à relire : on n'envoie PAS d'email. Un rituel semestriel qui écrit
    // « rien à faire » finit par être filtré, et l'envoi suivant avec lui.
    if (!Array.isArray(lignes) || lignes.length === 0) {
      console.log("[catalog-review] aucune entrée à relire — pas d'envoi.");
      return new Response(JSON.stringify({ ok: true, lignes: 0, envoye: false }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (dryRun || !resendKey) {
      if (!resendKey) console.warn("[catalog-review] RESEND absent — sortie sans envoi.");
      return new Response(
        JSON.stringify({ ok: true, lignes: lignes.length, envoye: false, apercu: lignes.slice(0, 5) }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const envoi = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: "VerifierMonDevis <bonjour@verifiermondevis.fr>",
        to: RECIPIENTS,
        subject: `Catalogue — ${lignes.length} fourchettes à relire`,
        html: buildHtml(lignes, mois),
      }),
    });

    if (!envoi.ok) {
      const detail = await envoi.text();
      console.error("[catalog-review] envoi échoué:", envoi.status, detail.slice(0, 300));
      return new Response(JSON.stringify({ error: "email_failed", status: envoi.status }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[catalog-review] ${lignes.length} entrées signalées à ${RECIPIENTS.join(", ")}`);
    return new Response(JSON.stringify({ ok: true, lignes: lignes.length, envoye: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[catalog-review] erreur:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
