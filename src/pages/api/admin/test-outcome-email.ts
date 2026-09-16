export const prerender = false;

/**
 * POST /api/admin/test-outcome-email
 *
 * 2026-09-16 (demande Johan) — LA BOUCLE « ALORS CE DEVIS ? » REMONTE-T-ELLE ?
 *
 * Constat : **25 relances envoyées entre le 30/08 et le 15/09, zéro ligne dans
 * `analysis_outcomes`.** Impossible de trancher de l'extérieur entre deux
 * explications qui appellent des actions opposées :
 *   · personne ne clique — alors c'est le message ou le moment qu'il faut revoir ;
 *   · le lien ne marche pas — alors on n'a jamais rien mesuré du tout.
 *
 * Le jeton est un HMAC-SHA256(analysisId, AGENT_SECRET_KEY) calculé dans
 * l'edge function (secret SUPABASE) et vérifié dans `/api/analyse/outcome-click`
 * (secret VERCEL). **Si les deux valeurs diffèrent, chaque clic échoue en
 * silence** — c'est la panne de septembre à l'identique : « le problème n'était
 * pas la clé, c'était l'endroit ».
 *
 * Cette route déclenche une vraie relance, par le même chemin de code que le
 * cron, sur une analyse de l'admin connecté. Il clique, et la ligne apparaît —
 * ou pas, et on saura enfin laquelle des deux explications est la bonne.
 *
 * ⚠️ Le destinataire n'est JAMAIS choisi par l'appelant : c'est le
 * PROPRIÉTAIRE de l'analyse, et on ne retient que les analyses de l'admin
 * lui-même. Sinon la route deviendrait un moyen d'écrire à n'importe qui.
 *
 * ⚠️ Elle ne stampe PAS `outcome_request_sent_at` (côté edge function) : le
 * test ne doit pas retirer l'analyse de la vraie boucle.
 */

import type { APIRoute } from "astro";
import { jsonOk, jsonError, requireAuth, optionsResponse } from "@/lib/api/apiHelpers";

export const OPTIONS: APIRoute = () => optionsResponse();

export const POST: APIRoute = async ({ request }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;

  const { data: roleData } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleData) return jsonError("Accès refusé", 403);

  const secret = process.env.AGENT_SECRET_KEY;
  if (!secret) {
    return jsonOk({
      ok: false,
      raison:
        "AGENT_SECRET_KEY absente de l'environnement Vercel — c'est déjà la réponse : " +
        "aucun clic ne peut être validé, le jeton n'est pas vérifiable de ce côté.",
    });
  }

  // Une analyse de l'admin lui-même, la plus récente.
  const { data: analyse } = await ctx.supabase
    .from("analyses")
    .select("id, file_name")
    .eq("user_id", ctx.user.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!analyse) return jsonOk({ ok: false, raison: "aucune analyse terminée sur votre compte" });

  const url = process.env.PUBLIC_SUPABASE_URL ?? import.meta.env.PUBLIC_SUPABASE_URL;
  const r = await fetch(`${url}/functions/v1/vmd-outcome-scheduler`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "test", secret, analysis_id: analyse.id }),
  });

  let corps: unknown = null;
  try {
    corps = await r.json();
  } catch {
    /* la fonction peut répondre vide sur une panne */
  }

  return jsonOk({
    ok: r.ok,
    statut: r.status,
    fichier: analyse.file_name,
    // ⚠️ `secret invalide` ici NE SIGNIFIE PAS « mauvais appel » : cela veut dire
    // que la clé de Vercel diffère de celle de Supabase — donc que tous les
    // liens envoyés depuis août sont morts. C'est le diagnostic recherché.
    resultat: corps,
  });
};
