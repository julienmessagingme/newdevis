import { useState } from "react";
import { Loader2, Download } from "lucide-react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { proxyImg } from "@/lib/marketing/proxyImg";
import type { TemplateListItem } from "@/types/marketing";

/**
 * Dialogue de TÉLÉCHARGEMENT d'un carrousel pour publication.
 *
 * Les 101 carrousels sont déjà rendus (2637 PNG sur B2, indexés dans
 * `preview_urls`). Publier = télécharger les PNG du format voulu. Ce dialogue
 * zippe les PNG côté navigateur (via le proxy CDN, sans taper B2 en direct) et
 * déclenche le download. Julien dézippe et poste manuellement.
 *
 * (L'ancien flux "Générer" appelait l'API CrewAI FastAPI — non déployée en
 * prod, Phase E — d'où l'erreur 5xx. On ne dépend plus de ce service.)
 */

interface GenerateDialogProps {
  open: boolean;
  template: TemplateListItem | null;
  onClose: () => void;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram (4:5)",
  facebook: "Facebook (1:1)",
  tiktok: "TikTok (9:16)",
};

/** Tri naturel des clés slide_N. */
const slideNum = (k: string) => parseInt(k.replace(/\D/g, ""), 10) || 0;

export default function GenerateDialog({ open, template, onClose }: GenerateDialogProps) {
  const [platform, setPlatform] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Plateformes réellement disponibles = celles qui ont des PNG rendus.
  const previewUrls = template?.preview_urls ?? null;
  const availablePlatforms = previewUrls
    ? (["instagram", "facebook", "tiktok"] as const).filter(
        (p) => previewUrls[p] && Object.keys(previewUrls[p]!).length > 0,
      )
    : [];

  const handleClose = () => {
    setPlatform(null);
    setDownloading(false);
    onClose();
  };

  const handleDownload = async () => {
    if (!template || !platform || !previewUrls) return;
    const slides = previewUrls[platform as "instagram" | "facebook" | "tiktok"];
    if (!slides || Object.keys(slides).length === 0) {
      toast.error("Aucune image pour cette plateforme");
      return;
    }
    setDownloading(true);
    try {
      const zip = new JSZip();
      // Tri par numéro de slide → noms de fichier zero-paddés pour garder
      // l'ordre dans l'explorateur de fichiers.
      const ordered = Object.entries(slides).sort(
        ([a], [b]) => slideNum(a) - slideNum(b),
      );
      let idx = 0;
      for (const [, url] of ordered) {
        idx++;
        // Via le proxy CDN : pas d'appel B2 direct (quota préservé).
        const res = await fetch(proxyImg(url));
        if (!res.ok) throw new Error(`Image ${idx} indisponible (HTTP ${res.status})`);
        zip.file(`${String(idx).padStart(2, "0")}.png`, await res.blob());
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `carrousel_${template.id}_${platform}.zip`;
      a.click();
      URL.revokeObjectURL(href);
      toast.success(`ZIP téléchargé — ${ordered.length} slides`);
    } catch (err) {
      toast.error("Échec du téléchargement", {
        description: err instanceof Error ? err.message : "Erreur",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Télécharger pour publier — {template?.title ?? template?.id}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {availablePlatforms.length === 0 ? (
            <p className="text-sm text-amber-600">
              Ce carrousel n'a pas encore d'aperçu rendu. Ouvre-le (œil),
              sauvegarde-le, et attends la régénération avant de le télécharger.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Choisis le format, télécharge le ZIP des slides (PNG), dézippe-le
                et poste les images manuellement sur le réseau.
              </p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Format</label>
                <div className="flex flex-wrap gap-2">
                  {availablePlatforms.map((p) => {
                    const count = Object.keys(previewUrls![p]!).length;
                    return (
                      <Button
                        key={p}
                        variant={platform === p ? "default" : "outline"}
                        onClick={() => setPlatform(p)}
                        className="flex-1 min-w-[140px] flex-col h-auto py-2"
                      >
                        <span>{PLATFORM_LABELS[p]}</span>
                        <span className="text-[10px] opacity-70">{count} slides</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={handleClose}>
              Fermer
            </Button>
            <Button
              onClick={handleDownload}
              disabled={!platform || downloading || availablePlatforms.length === 0}
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Télécharger le ZIP
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
