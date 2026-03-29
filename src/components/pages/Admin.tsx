import { useState, useEffect } from "react";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { KPIs, UsersData } from "@/types/admin";
import AdminHeader from "@/components/admin/sections/AdminHeader";
import { AdminLoading, AdminAccessDenied, AdminKPIsError } from "@/components/admin/sections/AdminGuards";
import UsageKPIsSection from "@/components/admin/sections/UsageKPIsSection";
import ChartsSection from "@/components/admin/sections/ChartsSection";
import ScoringKPIsSection from "@/components/admin/sections/ScoringKPIsSection";
import DocumentsKPIsSection from "@/components/admin/sections/DocumentsKPIsSection";
import BusinessKPIsSection from "@/components/admin/sections/BusinessKPIsSection";
import RegisteredUsersTable from "@/components/admin/sections/RegisteredUsersTable";
import SubscribersTable from "@/components/admin/sections/SubscribersTable";
import RecentDevisTable from "@/components/admin/sections/RecentDevisTable";

const Admin = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usersData, setUsersData] = useState<UsersData | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [recentDevis, setRecentDevis] = useState<Array<{ id: string; file_name: string; file_path: string; created_at: string; score: string | null; status: string }>>([]);
  const [devisLoading, setDevisLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const checkAdminAndFetchKPIs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/connexion?redirect=/admin";
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        setError("Accès réservé aux administrateurs");
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);

      fetchUsers();
      fetchRecentDevis();
      const { data, error } = await supabase.functions.invoke("admin-kpis");

      if (error) throw error;
      setKpis(data);
    } catch (err) {
      console.error("Error:", err);
      setError("Erreur lors du chargement des KPIs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Erreur API");
      const data = await res.json();
      setUsersData(data);
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchRecentDevis = async () => {
    setDevisLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/devis", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Erreur API");
      const data = await res.json();
      setRecentDevis(data.devis ?? []);
    } catch (err) {
      console.error("Error fetching devis:", err);
    } finally {
      setDevisLoading(false);
    }
  };

  const downloadFile = async (fileId: string, filePath: string) => {
    setDownloadingId(fileId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/signed-url", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filePath }),
      });
      const data = await res.json();
      if (!res.ok || !data.signedUrl) {
        alert(data.error ?? "Impossible de générer le lien");
        return;
      }
      window.open(data.signedUrl, "_blank");
    } catch {
      alert("Erreur réseau");
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => { checkAdminAndFetchKPIs(); }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    checkAdminAndFetchKPIs();
  };

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (loading) return <AdminLoading />;
  if (!isAdmin) return <AdminAccessDenied />;
  if (!kpis) return <AdminKPIsError error={error} onRefresh={handleRefresh} refreshing={refreshing} />;

  // ── Main layout ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <AdminHeader onRefresh={handleRefresh} refreshing={refreshing} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">Tableau de bord administrateur</h1>

        <UsageKPIsSection kpis={kpis} />
        <ChartsSection kpis={kpis} />
        <ScoringKPIsSection kpis={kpis} />
        <DocumentsKPIsSection kpis={kpis} />
        <BusinessKPIsSection kpis={kpis} />

        <RegisteredUsersTable
          usersData={usersData}
          loading={usersLoading}
          search={userSearch}
          onSearchChange={setUserSearch}
        />

        <SubscribersTable
          usersData={usersData}
          loading={usersLoading}
          search={subscriberSearch}
          onSearchChange={setSubscriberSearch}
        />

        <RecentDevisTable
          devis={recentDevis}
          loading={devisLoading}
          downloadingId={downloadingId}
          onDownload={downloadFile}
        />

        {/* Conformité et anonymisation */}
        <section className="mb-8">
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Conformité et anonymisation
            </h3>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>• Toutes les données affichées sont <strong className="text-foreground">agrégées et anonymisées</strong></p>
              <p>• Aucun KPI ne permet d'identifier un artisan ou un client individuellement</p>
              <p>• Les statuts de travaux sont <strong className="text-foreground">déclaratifs</strong> et ne constituent pas un jugement</p>
              <p>• Ce tableau de bord est réservé à l'administrateur de la plateforme</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Admin;
