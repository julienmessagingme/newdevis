import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { HardHat, Loader2 } from "lucide-react";

export interface GmcKpis {
  inscrits: {
    total: number;
    last_7d: number;
    last_30d: number;
    via_gmc: number;
    via_vmd: number;
    comp: number;
  };
  statuts: {
    trial_actifs: number;
    trial_expires: number;
    payants: number;
    past_due: number;
  };
  connexions: {
    actifs_7d: number;
    actifs_30d: number;
  };
  chantiers: {
    total: number;
    crees_7d: number;
  };
  derniers_inscrits: Array<{
    user_id: string;
    email: string;
    signup_source: string | null;
    status: string;
    plan: string | null;
    created_at: string;
    trial_ends_at: string | null;
    last_sign_in_at: string | null;
    nb_chantiers: number;
  }>;
}

interface GmcKPIsSectionProps {
  kpis: GmcKpis | null;
  loading: boolean;
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  trial: { label: "Essai", cls: "bg-blue-100 text-blue-800" },
  active: { label: "Payant", cls: "bg-emerald-100 text-emerald-800" },
  expired: { label: "Essai expiré", cls: "bg-gray-100 text-gray-600" },
  past_due: { label: "Impayé", cls: "bg-red-100 text-red-800" },
};

const SOURCE_LABELS: Record<string, string> = {
  gerermonchantier: "GMC",
  verifiermondevis: "VMD",
  comp: "Offert",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtLastSeen(iso: string | null): string {
  if (!iso) return "jamais";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} j`;
}

export default function GmcKPIsSection({ kpis, loading }: GmcKPIsSectionProps) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
        <HardHat className="h-5 w-5 text-primary" />
        GérerMonChantier
      </h2>

      {loading && !kpis ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Chargement des KPIs GMC…
        </div>
      ) : !kpis ? (
        <p className="text-sm text-muted-foreground py-4">KPIs GMC indisponibles.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Inscrits GMC</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{kpis.inscrits.total}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  +{kpis.inscrits.last_7d} sur 7 j · +{kpis.inscrits.last_30d} sur 30 j
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Essais en cours</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{kpis.statuts.trial_actifs}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Abonnés payants</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-score-green">{kpis.statuts.payants}</p>
                {kpis.statuts.past_due > 0 && (
                  <p className="text-xs text-score-red mt-1">{kpis.statuts.past_due} impayé(s)</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Essais expirés</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-muted-foreground">{kpis.statuts.trial_expires}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Actifs 7 j (connexion)</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{kpis.connexions.actifs_7d}</p>
                <p className="text-xs text-muted-foreground mt-1">{kpis.connexions.actifs_30d} sur 30 j</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Chantiers créés</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{kpis.chantiers.total}</p>
                <p className="text-xs text-muted-foreground mt-1">+{kpis.chantiers.crees_7d} sur 7 j</p>
              </CardContent>
            </Card>
          </div>

          {/* Répartition par source d'inscription */}
          <div className="flex flex-wrap gap-2 mt-3 text-xs text-muted-foreground">
            <span className="px-2 py-1 rounded bg-muted">Via GMC : <strong className="text-foreground">{kpis.inscrits.via_gmc}</strong></span>
            <span className="px-2 py-1 rounded bg-muted">Via VMD : <strong className="text-foreground">{kpis.inscrits.via_vmd}</strong></span>
            <span className="px-2 py-1 rounded bg-muted">Comptes offerts : <strong className="text-foreground">{kpis.inscrits.comp}</strong></span>
          </div>

          {/* Derniers inscrits */}
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardDescription>Derniers inscrits</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto overscroll-x-contain">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3 font-medium">Email</th>
                      <th className="py-2 pr-3 font-medium">Source</th>
                      <th className="py-2 pr-3 font-medium">Statut</th>
                      <th className="py-2 pr-3 font-medium">Inscrit le</th>
                      <th className="py-2 pr-3 font-medium">Dernière connexion</th>
                      <th className="py-2 font-medium">Chantiers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.derniers_inscrits.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-muted-foreground">
                          Aucun inscrit GMC pour l'instant.
                        </td>
                      </tr>
                    )}
                    {kpis.derniers_inscrits.map((u) => {
                      const st = STATUS_LABELS[u.status] ?? { label: u.status, cls: "bg-muted text-foreground" };
                      return (
                        <tr key={u.user_id} className="border-b border-border/50 last:border-0">
                          <td className="py-2 pr-3">
                            <a
                              href={`/admin/users/${encodeURIComponent(u.email)}`}
                              className="text-primary hover:underline"
                            >
                              {u.email}
                            </a>
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {SOURCE_LABELS[u.signup_source ?? ""] ?? u.signup_source ?? "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>
                              {st.label}{u.plan ? ` · ${u.plan}` : ""}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">{fmtDate(u.created_at)}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{fmtLastSeen(u.last_sign_in_at)}</td>
                          <td className="py-2 text-foreground font-medium">{u.nb_chantiers}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
