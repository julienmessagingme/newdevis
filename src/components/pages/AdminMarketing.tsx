import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Megaphone, RefreshCw, ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AdminLoading, AdminAccessDenied } from "@/components/admin/sections/AdminGuards";
import KillSwitchToggle from "@/components/admin/marketing/KillSwitchToggle";
import PostFilters, {
  DEFAULT_FILTERS,
  type PostFiltersState,
} from "@/components/admin/marketing/PostFilters";
import PostList from "@/components/admin/marketing/PostList";
import PostDetailDialog from "@/components/admin/marketing/PostDetailDialog";
import type {
  MarketingPostListItem,
  MarketingStatus,
} from "@/types/marketing";

export default function AdminMarketing() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [authChecking, setAuthChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // ── Data ────────────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<MarketingStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [posts, setPosts] = useState<MarketingPostListItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<PostFiltersState>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Anti-rollback réseau : seul le dernier reqId compte
  const reqIdRef = useRef(0);

  // ── Auth check ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          window.location.href = "/connexion?redirect=/admin/marketing";
          return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session?.access_token) {
          window.location.href = "/connexion?redirect=/admin/marketing";
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
        console.error("[AdminMarketing] auth error:", err);
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch status (kill switch + KPIs) ───────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    if (!authToken) return;
    setStatusError(null);
    try {
      const res = await fetch("/api/admin/marketing/status", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setStatus(data as MarketingStatus);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }, [authToken]);

  // ── Fetch posts ─────────────────────────────────────────────────────────────
  const fetchPosts = useCallback(async () => {
    if (!authToken) return;
    const reqId = ++reqIdRef.current;
    setPostsLoading(true);
    setPostsError(null);

    const params = new URLSearchParams();
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.persona !== "all") params.set("persona", filters.persona);
    if (filters.platform !== "all") params.set("platform", filters.platform);
    if (filters.dateFrom) params.set("date_from", filters.dateFrom);
    if (filters.dateTo) params.set("date_to", filters.dateTo);

    try {
      const res = await fetch(`/api/admin/marketing/posts?${params.toString()}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (reqId !== reqIdRef.current) return; // stale response
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setPosts((data?.posts ?? []) as MarketingPostListItem[]);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setPostsError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      if (reqId === reqIdRef.current) setPostsLoading(false);
    }
  }, [authToken, filters]);

  // Status : ne dépend pas des filtres → useEffect séparé pour éviter refetch inutile
  useEffect(() => {
    if (isAdmin && authToken) fetchStatus();
  }, [isAdmin, authToken, fetchStatus]);

  // Posts : refetch quand filters change (via fetchPosts useCallback deps)
  useEffect(() => {
    if (isAdmin && authToken) fetchPosts();
  }, [isAdmin, authToken, fetchPosts]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleRefreshAll = async () => {
    setRefreshing(true);
    await Promise.all([fetchStatus(), fetchPosts()]);
    setRefreshing(false);
  };

  const counts = useMemo(() => {
    const total = posts.length;
    const approved = posts.filter(p => p.status === "approved").length;
    const published = posts.filter(p => p.status === "published").length;
    const rejected = posts.filter(p => p.status === "rejected" || p.status === "failed").length;
    return { total, approved, published, rejected };
  }, [posts]);

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (authChecking) return <AdminLoading />;
  if (!isAdmin) return <AdminAccessDenied />;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b">
        <div className="container flex h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <a href="/admin" className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Retour admin
              </Button>
            </a>
            <div className="flex items-center gap-2 min-w-0">
              <Megaphone className="h-5 w-5 text-primary shrink-0" />
              <h1 className="text-base sm:text-lg font-bold truncate">Marketing — GérerMonChantier</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/admin/blog" className="hidden md:inline-flex">
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-2" />
                Blog
              </Button>
            </a>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshAll}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Status + KillSwitch */}
        <section>
          {statusError ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <strong>API marketing inaccessible :</strong> {statusError}
              <div className="text-xs mt-1 opacity-80">
                Le dashboard fonctionne, mais le kill switch est désactivé tant que l'API ne répond pas.
              </div>
            </div>
          ) : (
            <KillSwitchToggle status={status} authToken={authToken} onChanged={fetchStatus} />
          )}
        </section>

        {/* KPIs rapides */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Affichés" value={counts.total} />
          <KpiCard label="Approuvés" value={counts.approved} accent="emerald" />
          <KpiCard label="Publiés" value={counts.published} accent="green" />
          <KpiCard label="Rejetés / Failed" value={counts.rejected} accent="red" />
        </section>

        {/* Filtres */}
        <section className="bg-card rounded-xl border p-4">
          <PostFilters filters={filters} onChange={setFilters} />
        </section>

        {/* Erreur posts */}
        {postsError && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <strong>Erreur de chargement :</strong> {postsError}
          </div>
        )}

        {/* Liste posts */}
        <section>
          <PostList
            posts={posts}
            loading={postsLoading}
            selectedId={selectedId}
            onSelect={(p) => setSelectedId(p.id)}
          />
        </section>
      </main>

      <PostDetailDialog
        postId={selectedId}
        authToken={authToken}
        onClose={() => setSelectedId(null)}
        onChanged={() => { fetchPosts(); fetchStatus(); }}
      />
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: number;
  accent?: "emerald" | "green" | "red";
}

function KpiCard({ label, value, accent }: KpiCardProps) {
  const accentClass =
    accent === "emerald" ? "text-emerald-700"
    : accent === "green" ? "text-green-700"
    : accent === "red" ? "text-red-700"
    : "text-foreground";

  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accentClass}`}>{value}</div>
    </div>
  );
}
