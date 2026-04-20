import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { RepeatIcon, ChevronDown, ChevronUp } from "lucide-react";
import type { ReturningUser } from "@/types/admin";

interface ReturningUsersSectionProps {
  users: ReturningUser[];
}

export default function ReturningUsersSection({ users }: ReturningUsersSectionProps) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);

  const filtered = users.filter(
    (u) => !search || u.email.toLowerCase().includes(search.toLowerCase())
  );
  const displayed = expanded ? filtered : filtered.slice(0, 10);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
        <RepeatIcon className="h-5 w-5 text-primary" />
        Utilisateurs récurrents
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({users.length} utilisateurs avec plusieurs analyses)
        </span>
      </h2>

      {users.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Aucun utilisateur récurrent pour l'instant
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b border-border">
              <input
                type="text"
                placeholder="Rechercher par email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full max-w-sm px-3 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Email</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Analyses</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Complétées</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">1ère analyse</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Dernière analyse</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((u) => (
                    <tr key={u.user_id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-4 text-xs font-mono max-w-[220px] truncate">
                        {u.email || <span className="text-muted-foreground italic">anonyme</span>}
                      </td>
                      <td className="py-2 px-4 text-center">
                        <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                          {u.analysis_count}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-center text-xs text-muted-foreground">
                        {u.completed_count}
                      </td>
                      <td className="py-2 px-4 text-xs text-muted-foreground whitespace-nowrap">
                        {fmt(u.first_analysis_at)}
                      </td>
                      <td className="py-2 px-4 text-xs text-muted-foreground whitespace-nowrap">
                        {fmt(u.last_analysis_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filtered.length > 10 && (
              <div className="p-4 border-t border-border flex justify-center">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  {expanded ? (
                    <><ChevronUp className="h-3.5 w-3.5" />Voir moins</>
                  ) : (
                    <><ChevronDown className="h-3.5 w-3.5" />Voir les {filtered.length - 10} autres</>
                  )}
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
