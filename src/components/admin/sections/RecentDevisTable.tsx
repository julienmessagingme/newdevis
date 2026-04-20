import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { FolderOpen, Loader2, Download, ExternalLink } from "lucide-react";

interface DevisItem {
  id: string;
  file_name: string;
  file_path: string;
  created_at: string;
  score: string | null;
  status: string;
}

interface RecentDevisTableProps {
  devis: DevisItem[];
  loading: boolean;
  downloadingId: string | null;
  onDownload: (id: string, path: string) => void;
}

export default function RecentDevisTable({ devis, loading, downloadingId, onDownload }: RecentDevisTableProps) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
        <FolderOpen className="h-5 w-5 text-primary" />
        30 derniers devis téléchargés
      </h2>

      {loading ? (
        <Card>
          <CardContent className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Chargement...</span>
          </CardContent>
        </Card>
      ) : devis.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Fichier</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Score</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {devis.map((d) => (
                    <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-4 font-mono text-xs max-w-xs truncate">{d.file_name ?? "—"}</td>
                      <td className="py-2 px-4">
                        {d.score === "VERT" && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">✅ Vert</span>}
                        {d.score === "ORANGE" && <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">⚠️ Orange</span>}
                        {d.score === "ROUGE" && <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">🔴 Rouge</span>}
                        {!d.score && <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="py-2 px-4 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(d.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-2 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <a
                            href={`/analyse/${d.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Synthèse
                          </a>
                          {d.file_path ? (
                            <button
                              onClick={() => onDownload(d.id, d.file_path)}
                              disabled={downloadingId === d.id}
                              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors disabled:opacity-50"
                            >
                              {downloadingId === d.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Download className="h-3 w-3" />}
                              Télécharger
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Indisponible</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Aucun devis trouvé
          </CardContent>
        </Card>
      )}
    </section>
  );
}
