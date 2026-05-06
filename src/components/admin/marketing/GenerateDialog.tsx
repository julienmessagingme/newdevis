import { useState } from "react";
import { Loader2, Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { GenerateResponse } from "@/types/marketing";

interface GenerateDialogProps {
  open: boolean;
  scriptId?: string | null;
  scriptTitle?: string;
  cooldownUntil?: Record<string, string | null>;
  authToken: string | null;
  onClose: () => void;
  onGenerated: () => void;
}

type Stage = "platform" | "generating" | "preview";

export default function GenerateDialog({
  open,
  scriptId,
  scriptTitle,
  cooldownUntil,
  authToken,
  onClose,
  onGenerated,
}: GenerateDialogProps) {
  const [stage, setStage] = useState<Stage>("platform");
  const [platform, setPlatform] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [downloading, setDownloading] = useState(false);

  const platforms = [
    { key: "instagram", label: "Instagram (1080×1350)" },
    { key: "facebook", label: "Facebook (1080×1080)" },
  ];

  const availablePlatforms = platforms.filter((p) => {
    if (!cooldownUntil) return true;
    const cd = cooldownUntil[p.key];
    return !cd || new Date(cd) < new Date();
  });

  const handleGenerate = async () => {
    if (!platform || !authToken) return;
    setStage("generating");
    try {
      const res = await fetch("/api/admin/marketing/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform,
          ...(scriptId ? { script_id: scriptId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? data?.detail ?? `HTTP ${res.status}`);
      setResult(data as GenerateResponse);
      setStage("preview");
      toast.success("Carousel généré !");
      onGenerated();
    } catch (err) {
      toast.error("Échec de la génération", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      });
      setStage("platform");
    }
  };

  const handleDownload = async () => {
    if (!result || !authToken) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/admin/marketing/posts/${result.post_id}/zip`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `carousel_${result.script_id}_${platform}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("ZIP téléchargé");
    } catch (err) {
      toast.error("Échec du téléchargement", {
        description: err instanceof Error ? err.message : "Erreur",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleClose = () => {
    setStage("platform");
    setPlatform(null);
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {scriptId
              ? `Générer — ${scriptTitle ?? scriptId}`
              : "Générer le prochain carousel"}
          </DialogTitle>
        </DialogHeader>

        {stage === "platform" && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              {scriptId
                ? "Choisis la plateforme pour ce script :"
                : "Le système va piocher le meilleur script disponible. Choisis la plateforme :"}
            </p>
            <div className="flex gap-3">
              {availablePlatforms.map((p) => (
                <Button
                  key={p.key}
                  variant={platform === p.key ? "default" : "outline"}
                  onClick={() => setPlatform(p.key)}
                  className="flex-1"
                >
                  {p.label}
                </Button>
              ))}
            </div>
            {availablePlatforms.length === 0 && (
              <p className="text-sm text-amber-600">
                Toutes les plateformes sont en cooldown pour ce script.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={handleClose}>
                Annuler
              </Button>
              <Button onClick={handleGenerate} disabled={!platform}>
                <Check className="h-4 w-4 mr-2" />
                Générer
              </Button>
            </div>
          </div>
        )}

        {stage === "generating" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Génération en cours (render Playwright + upload B2)…
            </p>
          </div>
        )}

        {stage === "preview" && result && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Script <span className="font-mono font-medium">{result.script_id}</span> ·{" "}
              {result.slides.length} slides
            </p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {result.slides.map((s) => (
                <img
                  key={s.index}
                  src={s.url}
                  alt={`Slide ${s.index}`}
                  referrerPolicy="no-referrer"
                  className="h-48 rounded-lg border shadow-sm shrink-0"
                />
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleClose}>
                Fermer
              </Button>
              <Button onClick={handleDownload} disabled={downloading}>
                {downloading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Télécharger ZIP
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
