import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UserPlus, Loader2, Search } from "lucide-react";
import type { UsersData } from "@/types/admin";

interface RegisteredUsersTableProps {
  usersData: UsersData | null;
  loading: boolean;
  search: string;
  onSearchChange: (s: string) => void;
}

export default function RegisteredUsersTable({ usersData, loading, search, onSearchChange }: RegisteredUsersTableProps) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-primary" />
        Utilisateurs inscrits
        {usersData && (
          <span className="text-sm font-normal text-muted-foreground ml-2">
            ({usersData.total_registered})
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
      ) : usersData ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par email ou nom..."
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
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Téléphone</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Inscription</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Dernière connexion</th>
                  </tr>
                </thead>
                <tbody>
                  {usersData.registered_users
                    .filter(u => {
                      if (!search) return true;
                      const s = search.toLowerCase();
                      return (
                        u.email?.toLowerCase().includes(s) ||
                        u.first_name?.toLowerCase().includes(s) ||
                        u.last_name?.toLowerCase().includes(s)
                      );
                    })
                    .slice(0, 50)
                    .map(u => (
                      <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 px-3 font-mono text-xs">{u.email}</td>
                        <td className="py-2 px-3">
                          {u.first_name || u.last_name
                            ? `${u.first_name} ${u.last_name}`.trim()
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2 px-3 text-xs">
                          {u.phone || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">
                          {u.last_sign_in_at
                            ? new Date(u.last_sign_in_at).toLocaleDateString("fr-FR")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {usersData.registered_users.filter(u => {
                if (!search) return true;
                const s = search.toLowerCase();
                return u.email?.toLowerCase().includes(s) || u.first_name?.toLowerCase().includes(s) || u.last_name?.toLowerCase().includes(s);
              }).length > 50 && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  50 premiers résultats affichés — affiner la recherche pour voir plus
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
