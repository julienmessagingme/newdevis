export const prerender = false;

/**
 * GET /api/admin/diagnostic-email
 *
 * 2026-09-09 — RÉPONDRE À « EST-CE QUE LA CLÉ EST LÀ ? » SANS ENVOYER D'EMAIL.
 *
 * Johan a corrigé une analyse le 09/09 à 05h25 et n'a rien reçu. La décision
 * était bien enregistrée, mais **rien ne permettait de savoir** si l'envoi avait
 * seulement été tenté : le résultat n'était retourné que dans la réponse HTTP,
 * et l'écran de revue le perdait aussitôt (cf. `AdminReviews`).
 *
 * Cette route lit l'environnement d'exécution Vercel et dit ce qui s'y trouve.
 * Elle **n'envoie rien** — c'est un constat, pas un test d'acheminement.
 *
 * ⚠️ Ne renvoie JAMAIS la valeur d'une clé : seulement sa présence, sa longueur
 * et son préfixe (`re_`), de quoi distinguer « absente » de « présente mais
 * manifestement invalide » sans jamais exposer le secret.
 */

import type { APIRoute } from "astro";
import { jsonOk, jsonError, requireAuth, optionsResponse } from "@/lib/api/apiHelpers";

/** Présence et forme d'un secret, jamais sa valeur. */
function empreinte(nom: string): {
  nom: string;
  presente: boolean;
  longueur: number;
  prefixeAttendu: boolean;
} {
  const v = (process.env[nom] ?? "").trim();
  return {
    nom,
    presente: v.length > 0,
    longueur: v.length,
    // Toutes les clés Resend commencent par « re_ ». Une clé qui ne commence
    // pas ainsi est probablement une valeur collée par erreur.
    prefixeAttendu: v.startsWith("re_"),
  };
}

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

  const vmd = empreinte("RESEND_API_KEY_VMD");
  const std = empreinte("RESEND_API_KEY");
  const utilisee = vmd.presente ? vmd : std.presente ? std : null;

  return jsonOk({
    cles: [vmd, std],
    // Celle que `resendApiKey()` retiendra réellement : VMD d'abord, sinon
    // la clé par défaut.
    cle_utilisee: utilisee?.nom ?? null,
    peut_envoyer: Boolean(utilisee),
    expediteur: "VerifierMonDevis <contact@verifiermondevis.fr>",
    diagnostic: utilisee
      ? `Une clé est présente (${utilisee.nom}). Si un email n'arrive pas, la cause est en aval : refus de Resend (domaine non vérifié, clé révoquée) ou message classé en indésirables. Le journal Resend tranche.`
      : "AUCUNE clé Resend dans l'environnement Vercel — aucun email de notification ne peut partir. Ajouter RESEND_API_KEY (ou RESEND_API_KEY_VMD) dans Vercel → Settings → Environment Variables, puis redéployer.",
  });
};

export const OPTIONS: APIRoute = () => optionsResponse("GET,OPTIONS");
