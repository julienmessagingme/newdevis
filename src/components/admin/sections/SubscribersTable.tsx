import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CreditCard, Loader2, Search } from "lucide-react";
import type { UsersData } from "@/types/admin";

interface SubscribersTableProps {
  usersData: UsersData | null;
  loading: boolean;
  search: string;
  onSearchChange: (s: string) => void;
}

export default function SubscribersTable({ usersData, loading, search, onSearchChange }: SubscribersTableProps) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        Abonnés Pass Sérénité
        {usersData && (
          <span className="text-sm font-normal text-muted-foreground ml-2">
            ({usersData.total_subscribers})
          </span>
        )}
      </h2>

      {loading ? (
        <Card>
          <CardContent className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Chargement...</span>
          </CardContent>
        </Card>
      ) : usersData && usersData.subscribers.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un abonné..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 max-w-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Email</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Nom</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Statut</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Analyses</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Souscription</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Fin période</th>
                  </tr>
                </thead>
                <tbody>
                  {usersData.subscribers
                    .filter(s => {
                      if (!search) return true;
                      const q = search.toLowerCase();
                      return (
                        s.email?.toLowerCase().includes(q) ||
                        s.first_name?.toLowerCase().includes(q) ||
                        s.last_name?.toLowerCase().includes(q)
                      );
                    })
                    .map(s => (
                      <tr key={s.user_id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 px-3 font-mono text-xs">{s.email}</td>
                        <td className="py-2 px-3">
                          {s.first_name || s.last_name
                            ? `${s.first_name} ${s.last_name}`.trim()
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            s.status === "active"
                              ? "bg-score-green/10 text-score-green"
                              : s.status === "trial"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-score-orange/10 text-score-orange"
                          }`}>
                            {s.status === "active" ? "Actif" : s.status === "trial" ? "Essai" : s.status === "inactive" ? "Inactif" : "Impayé"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center font-medium">{s.lifetime_analysis_count}</td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">
                          {new Date(s.subscribed_at).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">
                          {s.current_period_end
                            ? new Date(s.current_period_end).toLocaleDateString("fr-FR")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : usersData ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Aucun abonné Pass Sérénité pour le moment
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
