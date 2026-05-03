import { useCallback, useEffect, useState } from "react";
import { Settings, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AdminLoading, AdminAccessDenied } from "@/components/admin/sections/AdminGuards";
import SettingsForm from "@/components/admin/marketing/SettingsForm";
import type { MarketingSettings } from "@/types/marketing";

/**
 * Page d'admin pour piloter les réglages dynamiques des agents marketing.
 * Auth : user authentifié + role admin (re-check côté serveur via requireAdmin sur les routes API).
 */
export default function AdminMarketingSettings() {
  // Auth
  const [authChecking, setAuthChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Data
  const [settings, setSettings] = useState<MarketingSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth check (pattern aligné AdminMarketing.tsx)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          window.location.href = "/connexion?redirect=/admin/marketing/settings";
          return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session?.access_token) {
          window.location.href = "/connexion?redirect=/admin/marketing/settings";
          return;
        }
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (cancelled) return;
        setIsAdmin(!!roleData);
        setAuthToken(session.access_token);
      } catch (err) {
        console.error("[AdminMarketingSettings] auth error:", err);
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/marketing/settings", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.error || `HTTP ${res.status}`;
        setError(msg);
        return;
      }
      const data = (await res.json()) as MarketingSettings;
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    if (authToken && isAdmin) void fetchSettings();
  }, [authToken, isAdmin, fetchSettings]);

  // Render
  if (authChecking) return <AdminLoading />;
  if (!isAdmin) return <AdminAccessDenied />;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <a href="/admin/marketing">
              <Button variant="ghost" size="icon" className="shrink-0" aria-label="Retour">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </a>
            <div className="flex items-center gap-2 min-w-0">
              <Settings className="h-5 w-5 text-primary shrink-0" />
              <h1 className="text-base sm:text-lg font-bold truncate">Réglages Marketing</h1>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchSettings} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Recharger
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Intro */}
        <section className="rounded-xl border bg-muted/30 p-4 text-sm space-y-1">
          <h2 className="font-semibold">Niveau 1 — Réglages dynamiques</h2>
          <p className="text-muted-foreground">
            Pilote les paramètres clés des agents IA marketing sans rebuild Docker. Ratio CTA cible,
            seuil qualité, cap budget, horaire scheduler, mode test. Les changements sont pris en
            compte au prochain flow (cache TTL 60s).
          </p>
        </section>

        {/* Erreur */}
        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <strong>Erreur :</strong> {error}
            <div className="text-xs mt-1 opacity-80">
              Si l'API marketing est inaccessible, les réglages utilisent les defaults env (cf.
              .env du VPS).
            </div>
          </div>
        )}

        {/* Form ou loading */}
        {loading && !settings ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : settings && authToken ? (
          <SettingsForm
            initial={settings}
            authToken={authToken}
            onSaved={(next) => setSettings(next)}
          />
        ) : null}
      </main>
    </div>
  );
}
