export const prerender = false;

/**
 * GET /api/analyse/[id]/devis-apparente
 *
 * 2026-09-08 (demande Johan) — « quand on voit deux devis pour la même
 * prestation, l'outil devrait proposer de les comparer ».
 *
 * Renvoie AU PLUS UN devis concurrent du même projet, ou `null` — et `null` est
 * le cas normal : mesuré sur le stock, la règle propose sur 3 % des paires.
 *
 * La décision vit dans `src/lib/analyse/devisApparentes.ts` (13 tests), pas
 * ici : cette route ne fait que réunir les candidats et répondre.
 */

import type { APIRoute } from "astro";
import { jsonOk, jsonError, requireAuth, optionsResponse } from "@/lib/api/apiHelpers";
import { trouverDevisApparente, FENETRE_JOURS, type DevisCandidat } from "@/lib/analyse/devisApparentes";

/** Les libellés de travaux d'une analyse, quelle que soit la forme stockée. */
function libellesDe(analyse: Record<string, unknown>): string[] {
  const lignes = analyse.types_travaux;
  if (!Array.isArray(lignes)) return [];
  return lignes
    .map((l) => String((l as Record<string, unknown>)?.libelle ?? ""))
    .filter((s) => s.length > 0);
}

function montantDe(analyse: Record<string, unknown>): number | null {
  const lignes = analyse.types_travaux;
  if (!Array.isArray(lignes)) return null;
  const total = lignes.reduce(
    (s, l) => s + (Number((l as Record<string, unknown>)?.montant_ht) || 0),
    0,
  );
  return total > 0 ? total : null;
}

function entrepriseDe(analyse: Record<string, unknown>): string | null {
  try {
    const brut = analyse.raw_text;
    const r = typeof brut === "string" ? JSON.parse(brut) : brut;
    const nom =
      (r as any)?.extracted?.entreprise?.nom ?? (r as any)?.extracted_data?.entreprise?.nom;
    return nom ? String(nom) : null;
  } catch {
    return null;
  }
}

export const GET: APIRoute = async ({ request, params }) => {
  const ctx = await requireAuth(request);
  if (ctx instanceof Response) return ctx;

  const id = params.id;
  if (!id) return jsonError("Analyse inconnue", 400);

  // La requête est scopée `user_id` EN PLUS de la RLS : on ne propose jamais à
  // quelqu'un le devis d'un autre.
  const depuis = new Date(Date.now() - FENETRE_JOURS * 86_400_000).toISOString();
  const { data, error } = await ctx.supabase
    .from("analyses")
    .select("id, file_name, created_at, types_travaux, raw_text, status")
    .eq("user_id", ctx.user.id)
    .eq("status", "completed")
    .gte("created_at", depuis)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) return jsonError(`Lecture impossible : ${error.message}`, 500);

  const lignes = (data ?? []) as Record<string, unknown>[];
  const courantBrut = lignes.find((a) => a.id === id);
  if (!courantBrut) return jsonOk({ apparente: null });

  const enCandidat = (a: Record<string, unknown>): DevisCandidat => ({
    id: String(a.id),
    libelles: libellesDe(a),
    entreprise: entrepriseDe(a),
    createdAt: String(a.created_at),
    montantHt: montantDe(a),
    fileName: a.file_name ? String(a.file_name) : null,
  });

  const apparente = trouverDevisApparente(
    enCandidat(courantBrut),
    lignes.map(enCandidat),
  );

  return jsonOk({ apparente });
};

export const OPTIONS: APIRoute = () => optionsResponse("GET,OPTIONS");
