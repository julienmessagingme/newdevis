// Clé secrète serveur pour les edge functions (bypass RLS).
//
// Migration clés API Supabase (2026-07) : on quitte la `service_role` legacy (JWT HS256,
// non rotable, fuitée dans l'historique git) au profit des nouvelles secret keys `sb_secret_…`.
// Supabase injecte automatiquement `SUPABASE_SECRET_KEYS` (JSON { "<nom>": "sb_secret_…" })
// dans l'environnement des edge functions dès qu'une secret key existe.
//
// Ce helper est rétro-compatible : il prend la nouvelle secret key si disponible, sinon
// retombe sur `SUPABASE_SERVICE_ROLE_KEY` (legacy). Donc déployable AVANT de désactiver
// les clés legacy — zéro downtime pendant la migration.
export function serviceRoleKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, string>;
      const k = keys["default"] ?? Object.values(keys)[0];
      if (k) return k;
    } catch {
      // JSON invalide → on retombe sur la legacy ci-dessous
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
