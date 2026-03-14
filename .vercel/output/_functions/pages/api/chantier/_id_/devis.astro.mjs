import { createClient } from '@supabase/supabase-js';
export { renderers } from '../../../../renderers.mjs';

const prerender = false;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json"
};
const supabaseUrl = "https://vhrhgsqxwvouswjaiczn.supabase.co";
const supabaseServiceKey = undefined                                         ;
const POST = async ({ request, params }) => {
  const chantierId = params.id;
  if (!chantierId) {
    return new Response(JSON.stringify({ error: "ID chantier manquant" }), { status: 400, headers: CORS });
  }
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  }
  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Token invalide" }), { status: 401, headers: CORS });
  }
  const { data: chantier, error: chantierError } = await supabase.from("chantiers").select("id").eq("id", chantierId).eq("user_id", user.id).single();
  if (chantierError || !chantier) {
    return new Response(JSON.stringify({ error: "Chantier introuvable" }), { status: 404, headers: CORS });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête invalide" }), { status: 400, headers: CORS });
  }
  if (body.devisId && typeof body.devisId === "string") {
    const { data: data2, error: error2 } = await supabase.from("devis_chantier").update({ chantier_id: chantierId }).eq("id", body.devisId).select("id, artisan_nom, type_travaux, montant_ttc, statut, score_analyse, analyse_id").single();
    if (error2) {
      console.error("[api/chantier/devis POST] rattachement error:", error2.message);
      return new Response(JSON.stringify({ error: "Erreur lors du rattachement du devis" }), { status: 500, headers: CORS });
    }
    return new Response(JSON.stringify({
      devis: {
        id: data2.id,
        nom: data2.artisan_nom,
        description: data2.type_travaux,
        montant: data2.montant_ttc,
        statut: data2.statut,
        analyseId: data2.analyse_id,
        scoreAnalyse: data2.score_analyse
      }
    }), { status: 200, headers: CORS });
  }
  const nom = typeof body.nom === "string" ? body.nom.trim() : "";
  if (!nom) {
    return new Response(JSON.stringify({ error: "Le nom de l'artisan est requis" }), { status: 400, headers: CORS });
  }
  const { data, error } = await supabase.from("devis_chantier").insert({
    chantier_id: chantierId,
    artisan_nom: nom,
    type_travaux: typeof body.description === "string" ? body.description : "Travaux",
    montant_ttc: typeof body.montant === "number" ? body.montant : null,
    statut: typeof body.statut === "string" ? body.statut : "recu",
    analyse_id: typeof body.analyseId === "string" ? body.analyseId : null
  }).select("id, artisan_nom, type_travaux, montant_ttc, statut, score_analyse, analyse_id").single();
  if (error) {
    console.error("[api/chantier/devis POST] création error:", error.message);
    return new Response(JSON.stringify({ error: "Erreur lors de la création du devis" }), { status: 500, headers: CORS });
  }
  return new Response(JSON.stringify({
    devis: {
      id: data.id,
      nom: data.artisan_nom,
      description: data.type_travaux,
      montant: data.montant_ttc,
      statut: data.statut,
      analyseId: data.analyse_id,
      scoreAnalyse: data.score_analyse
    }
  }), { status: 201, headers: CORS });
};
const OPTIONS = () => new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Methods": "POST,OPTIONS" } });

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  OPTIONS,
  POST,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
