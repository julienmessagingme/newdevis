/**
 * POST /api/activate-chantier
 * Accorde l'accès au module GérerMonChantier à l'utilisateur authentifié.
 * Appelé depuis FeedbackModal après feedback positif.
 *
 * Auth : Bearer JWT (Supabase)
 * Body : aucun (userId déduit du token)
 */

import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });
  }

  const supabaseUrl     = import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey      = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Config serveur manquante" }), { status: 500 });
  }

  // Vérifier le token et extraire le user_id
  const supabaseAuth = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Session invalide" }), { status: 401 });
  }

  // Accorder l'accès GérerMonChantier via user_roles ou metadata
  // Ici on utilise un flag dans user_metadata pour éviter une table supplémentaire
  const { error: updateError } = await supabaseAuth.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...user.user_metadata,
      gerer_mon_chantier_access: true,
      gerer_mon_chantier_activated_at: new Date().toISOString(),
    },
  });

  if (updateError) {
    console.error("[activate-chantier] Update error:", updateError.message);
    return new Response(JSON.stringify({ error: "Erreur activation" }), { status: 500 });
  }

  console.log(`[activate-chantier] Access granted to user ${user.id}`);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
