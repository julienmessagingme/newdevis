import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import CarouselPreview from "./CarouselPreview";
import {
  PERSONA_LABELS,
  PLATFORM_LABELS,
  STATUS_BADGE_CLASS,
  STATUS_LABELS,
  formatDate,
} from "./helpers";
import type { MarketingPostDetail } from "@/types/marketing";

interface PostDetailDialogProps {
  postId: string | null;
  authToken: string | null;
  onClose: () => void;
  onChanged: () => void;
}

const PUBLISHABLE_STATUSES = new Set(["approved", "published"]);

export default function PostDetailDialog({
  postId,
  authToken,
  onClose,
  onChanged,
}: PostDetailDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<MarketingPostDetail | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [externalUrl, setExternalUrl] = useState("");

  useEffect(() => {
    if (!postId) {
      setPost(null);
      setError(null);
      setExternalUrl("");
      return;
    }
    let cancelled = false;
    (async () => {
      if (!authToken) {
        setError("Session expirée. Reconnectez-vous.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/marketing/posts/${postId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
        if (cancelled) return;
        setPost(data as MarketingPostDetail);
        setExternalUrl((data as MarketingPostDetail).external_url ?? "");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erreur inconnue");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [postId, authToken]);

  async function handleDownloadZip() {
    if (!post || !authToken) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/admin/marketing/posts/${post.id}/zip`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          msg = data?.error ?? msg;
        } catch { /* binary or empty */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const filename = extractFilename(res.headers.get("content-disposition")) || `post-${post.id}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "ZIP téléchargé", description: filename });
    } catch (err) {
      toast({
        title: "Échec du téléchargement",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  }

  async function handleMarkPublished() {
    if (!post || !authToken) return;
    if (!PUBLISHABLE_STATUSES.has(post.status)) {
      toast({
        title: "Action impossible",
        description: `Statut actuel : ${STATUS_LABELS[post.status]}. Le post doit être approuvé.`,
        variant: "destructive",
      });
      return;
    }
    if (externalUrl && !/^https?:\/\//i.test(externalUrl)) {
      toast({
        title: "URL invalide",
        description: "L'URL doit commencer par http:// ou https://",
        variant: "destructive",
      });
      return;
    }
    setMarking(true);
    try {
      const res = await fetch(`/api/admin/marketing/posts/${post.id}/publish`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(externalUrl ? { external_url: externalUrl.trim() } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast({ title: "Post marqué publié", description: "Le statut est mis à jour." });
      onChanged();
      onClose();
    } catch (err) {
      toast({
        title: "Échec mark-published",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setMarking(false);
    }
  }

  return (
    <Dialog open={!!postId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Détail du post marketing</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-md text-red-800">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {post && !loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <CarouselPreview slides={post.slides} assets={post.assets} />
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${STATUS_BADGE_CLASS[post.status]}`}
                  >
                    {STATUS_LABELS[post.status]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {PLATFORM_LABELS[post.platform]} · {PERSONA_LABELS[post.persona_target]}
                  </span>
                </div>
                <h3 className="font-semibold text-base leading-snug">{post.hook}</h3>
              </div>

              <div className="text-sm space-y-1">
                <div><span className="font-medium">Créé :</span> <span className="text-muted-foreground">{formatDate(post.created_at)}</span></div>
                {post.published_at && (
                  <div><span className="font-medium">Publié :</span> <span className="text-muted-foreground">{formatDate(post.published_at)}</span></div>
                )}
                {typeof post.quality_score === "number" && (
                  <div><span className="font-medium">Score qualité :</span> <span className="text-muted-foreground">{post.quality_score.toFixed(2)}</span></div>
                )}
                {post.quality_notes && (
                  <div className="text-xs text-muted-foreground italic mt-2 p-2 bg-muted/40 rounded">
                    {post.quality_notes}
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Caption</Label>
                <div className="text-sm whitespace-pre-wrap p-2 bg-muted/40 rounded max-h-40 overflow-y-auto">
                  {post.caption}
                </div>
              </div>

              {post.hashtags && post.hashtags.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Hashtags</Label>
                  <div className="text-sm text-blue-600">{post.hashtags.map(h => h.startsWith("#") ? h : `#${h}`).join(" ")}</div>
                </div>
              )}

              {post.cta_url && (
                <div>
                  <Label className="text-xs text-muted-foreground">CTA</Label>
                  <a
                    href={post.cta_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {post.cta} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              <div className="border-t pt-4 space-y-3">
                <Button
                  onClick={handleDownloadZip}
                  disabled={downloading || !authToken}
                  className="w-full"
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Télécharger le ZIP (slides + caption)
                </Button>

                {PUBLISHABLE_STATUSES.has(post.status) && (
                  <div className="space-y-2">
                    <Label htmlFor="external-url" className="text-xs">URL publique du post (optionnel)</Label>
                    <Input
                      id="external-url"
                      type="url"
                      placeholder="https://www.instagram.com/p/..."
                      value={externalUrl}
                      onChange={(e) => setExternalUrl(e.target.value)}
                    />
                    <Button
                      onClick={handleMarkPublished}
                      disabled={marking || !authToken}
                      variant="default"
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                    >
                      {marking ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}
                      {post.status === "published" ? "Mettre à jour l'URL publique" : "Marquer comme publié"}
                    </Button>
                  </div>
                )}

                {post.publish_error && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    <span className="font-medium">Erreur de publication précédente :</span> {post.publish_error}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function extractFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  // Match filename="xxx" or filename*=UTF-8''xxx
  const m1 = contentDisposition.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (m1) {
    try { return decodeURIComponent(m1[1].trim().replace(/^"|"$/g, "")); }
    catch { return m1[1].trim().replace(/^"|"$/g, ""); }
  }
  const m2 = contentDisposition.match(/filename="?([^";]+)"?/i);
  return m2 ? m2[1].trim() : null;
}
