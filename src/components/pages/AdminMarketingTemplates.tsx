import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutList, RefreshCw, ArrowLeft, Settings, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AdminLoading, AdminAccessDenied } from "@/components/admin/sections/AdminGuards";
import { toast } from "sonner";
import TemplateFilters, {
  DEFAULT_TEMPLATE_FILTERS,
  type TemplateFiltersState,
} from "@/components/admin/marketing/TemplateFilters";
import TemplateTable from "@/components/admin/marketing/TemplateTable";
import TemplateEditDialog from "@/components/admin/marketing/TemplateEditDialog";
import GenerateDialog from "@/components/admin/marketing/GenerateDialog";
import type { TemplateListItem } from "@/types/marketing";

export default function AdminMarketingTemplates() {
  const [authChecking, setAuthChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<TemplateFiltersState>(DEFAULT_TEMPLATE_FILTERS);

  const [editId, setEditId] = useState<string | null>(null);
  const [generateTarget, setGenerateTarget] = useState<TemplateListItem | null>(null);

  const reqIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.location.href = "/connexion?redirect=/admin/marketing/templates"; return; }
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session?.access_token) { window.location.href = "/connexion?redirect=/admin/marketing/templates"; return; }
        const { data: roleData } = await supabase
          .from("user_roles").select("role")
          .eq("user_id", user.id).eq("role", "admin").maybeSingle();
        if (cancelled) return;
        setIsAdmin(!!roleData);
        setAuthToken(session.access_token);
      } catch (err) {
        console.error("[Templates] auth error:", err);
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchTemplates = useCallback(async () => {
    if (!authToken) return;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.product !== "all") params.set("product", filters.product);
    if (filters.narrative_type !== "all") params.set("narrative_type", filters.narrative_type);
    if (filters.macro_format !== "all") params.set("macro_format", filters.macro_format);
    if (filters.platform !== "all") params.set("platform", filters.platform);
    if (filters.mood !== "all") params.set("mood", filters.mood);
    if (filters.usage_status !== "all") params.set("usage_status", filters.usage_status);

    try {
      const res = await fetch(`/api/admin/marketing/templates?${params.toString()}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (reqId !== reqIdRef.current) return;
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setTemplates((data?.templates ?? []) as TemplateListItem[]);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      toast.error("Erreur", { description: err instanceof Error ? err.message : "Erreur" });
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [authToken, filters]);

  useEffect(() => {
    if (isAdmin && authToken) fetchTemplates();
  }, [isAdmin, authToken, fetchTemplates]);

  const handleToggleActive = async (t: TemplateListItem) => {
    if (!authToken) return;
    try {
      const res = await fetch(`/api/admin/marketing/templates/${encodeURIComponent(t.id)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !t.is_active }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(t.is_active ? "Script désactivé" : "Script réactivé");
      fetchTemplates();
    } catch (err) {
      toast.error("Erreur", { description: err instanceof Error ? err.message : "Erreur" });
    }
  };

  if (authChecking) return <AdminLoading />;
  if (!isAdmin) return <AdminAccessDenied />;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b">
        <div className="container flex h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <a href="/admin/marketing">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Dashboard</span>
              </Button>
            </a>
            <div className="flex items-center gap-2 min-w-0">
              <LayoutList className="h-5 w-5 text-primary shrink-0" />
              <h1 className="text-base sm:text-lg font-bold truncate">Templates</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/admin/marketing/assets">
              <Button variant="outline" size="sm">
                <Image className="h-4 w-4 mr-2" />
                <span className="hidden lg:inline">Assets</span>
              </Button>
            </a>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setRefreshing(true); fetchTemplates().finally(() => setRefreshing(false)); }}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <section className="bg-card rounded-xl border p-4">
          <TemplateFilters filters={filters} onChange={setFilters} />
        </section>

        <section className="text-xs text-muted-foreground">
          {templates.length} script{templates.length > 1 ? "s" : ""}
        </section>

        <section>
          <TemplateTable
            templates={templates}
            loading={loading}
            onEdit={(t) => setEditId(t.id)}
            onGenerate={(t) => setGenerateTarget(t)}
            onToggleActive={handleToggleActive}
          />
        </section>
      </main>

      <TemplateEditDialog
        templateId={editId}
        authToken={authToken}
        onClose={() => setEditId(null)}
        onSaved={fetchTemplates}
      />

      <GenerateDialog
        open={!!generateTarget}
        scriptId={generateTarget?.id}
        scriptTitle={generateTarget?.title}
        cooldownUntil={generateTarget?.cooldown_until}
        authToken={authToken}
        onClose={() => setGenerateTarget(null)}
        onGenerated={fetchTemplates}
      />
    </div>
  );
}
