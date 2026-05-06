import { useCallback, useEffect, useRef, useState } from "react";
import { Image, RefreshCw, ArrowLeft, LayoutList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AdminLoading, AdminAccessDenied } from "@/components/admin/sections/AdminGuards";
import { toast } from "sonner";
import BackgroundGrid from "@/components/admin/marketing/BackgroundGrid";
import CarouselGallery from "@/components/admin/marketing/CarouselGallery";
import type { BackgroundItem, MarketingPostListItem } from "@/types/marketing";

type Tab = "backgrounds" | "carousels";

export default function AdminMarketingAssets() {
  const [authChecking, setAuthChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("carousels");
  const [backgrounds, setBackgrounds] = useState<BackgroundItem[]>([]);
  const [bgLoading, setBgLoading] = useState(false);
  const [posts, setPosts] = useState<MarketingPostListItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const reqIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.location.href = "/connexion?redirect=/admin/marketing/assets"; return; }
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session?.access_token) { window.location.href = "/connexion?redirect=/admin/marketing/assets"; return; }
        const { data: roleData } = await supabase
          .from("user_roles").select("role")
          .eq("user_id", user.id).eq("role", "admin").maybeSingle();
        if (cancelled) return;
        setIsAdmin(!!roleData);
        setAuthToken(session.access_token);
      } catch (err) {
        console.error("[Assets] auth error:", err);
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchBackgrounds = useCallback(async () => {
    if (!authToken) return;
    setBgLoading(true);
    try {
      const res = await fetch("/api/admin/marketing/backgrounds", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setBackgrounds((data?.backgrounds ?? []) as BackgroundItem[]);
    } catch (err) {
      toast.error("Erreur", { description: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setBgLoading(false);
    }
  }, [authToken]);

  const fetchPosts = useCallback(async () => {
    if (!authToken) return;
    const reqId = ++reqIdRef.current;
    setPostsLoading(true);
    try {
      const res = await fetch("/api/admin/marketing/posts?status=approved&limit=50", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (reqId !== reqIdRef.current) return;
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setPosts((data?.posts ?? []) as MarketingPostListItem[]);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      toast.error("Erreur", { description: err instanceof Error ? err.message : "Erreur" });
    } finally {
      if (reqId === reqIdRef.current) setPostsLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    if (isAdmin && authToken) {
      fetchBackgrounds();
      fetchPosts();
    }
  }, [isAdmin, authToken, fetchBackgrounds, fetchPosts]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchBackgrounds(), fetchPosts()]);
    setRefreshing(false);
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
              <Image className="h-5 w-5 text-primary shrink-0" />
              <h1 className="text-base sm:text-lg font-bold truncate">Assets</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/admin/marketing/templates">
              <Button variant="outline" size="sm">
                <LayoutList className="h-4 w-4 mr-2" />
                <span className="hidden lg:inline">Templates</span>
              </Button>
            </a>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex rounded-lg border overflow-hidden w-fit">
          <button
            onClick={() => setTab("carousels")}
            className={`px-4 py-2 text-sm font-medium transition ${
              tab === "carousels" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
            }`}
          >
            Carousels générés ({posts.length})
          </button>
          <button
            onClick={() => setTab("backgrounds")}
            className={`px-4 py-2 text-sm font-medium transition ${
              tab === "backgrounds" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
            }`}
          >
            Pool de fonds ({backgrounds.length})
          </button>
        </div>

        {tab === "carousels" && (
          <CarouselGallery
            posts={posts}
            loading={postsLoading}
            authToken={authToken}
            onChanged={fetchPosts}
          />
        )}

        {tab === "backgrounds" && (
          <BackgroundGrid backgrounds={backgrounds} loading={bgLoading} />
        )}
      </main>
    </div>
  );
}
