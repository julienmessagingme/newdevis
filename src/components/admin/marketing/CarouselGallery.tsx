import { useState } from "react";
import { Download, ChevronDown, ChevronUp, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { STATUS_LABELS, STATUS_BADGE_CLASS, PRODUCT_BADGE, formatDate } from "./helpers";
import { proxyImg } from "@/lib/marketing/proxyImg";
import type { MarketingPostListItem } from "@/types/marketing";

interface Props {
  posts: MarketingPostListItem[];
  loading: boolean;
  authToken: string | null;
  onChanged: () => void;
}

export default function CarouselGallery({ posts, loading, authToken, onChanged }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (posts.length === 0) {
    return <p className="text-center text-muted-foreground py-12">Aucun carousel généré.</p>;
  }

  const handleDownload = async (postId: string) => {
    if (!authToken) return;
    setDownloadingId(postId);
    try {
      const res = await fetch(`/api/admin/marketing/posts/${postId}/zip`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `carousel_${postId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Erreur", { description: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleMarkPublished = async (postId: string) => {
    if (!authToken) return;
    setMarkingId(postId);
    try {
      const res = await fetch(`/api/admin/marketing/posts/${postId}/publish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Marqué comme publié");
      onChanged();
    } catch (err) {
      toast.error("Erreur", { description: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {posts.map((p) => {
        const expanded = expandedId === p.id;
        const statusLabel = STATUS_LABELS[p.status];
        const statusClass = STATUS_BADGE_CLASS[p.status];

        return (
          <div key={p.id} className="border rounded-xl bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="text-muted-foreground text-xs">{formatDate(p.created_at)}</span>
                  <span className="text-xs">{p.platform}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] border ${statusClass}`}>
                    {statusLabel}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">{p.hook}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(p.id)}
                  disabled={downloadingId === p.id}
                  title="Télécharger ZIP"
                >
                  {downloadingId === p.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
                {p.status === "approved" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMarkPublished(p.id)}
                    disabled={markingId === p.id}
                    title="Marquer publié"
                  >
                    {markingId === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                >
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {expanded && (
              <div className="px-4 pb-4 border-t pt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {p.slide_count} slides · {p.persona_target}
                </p>
                {p.cover_url && (
                  <img
                    src={proxyImg(p.cover_url)}
                    alt="Cover"
                    referrerPolicy="no-referrer"
                    className="h-40 rounded border"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
