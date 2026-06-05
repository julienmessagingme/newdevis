import { useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

/**
 * Importe un carrousel HTML autoportant (export Claude Code / Claude Design) et
 * le publie comme template. 2 chemins possibles :
 *
 * - **Petit fichier (≤ 4 Mo)** — passe par le proxy Vercel `/import/proxy`
 *   (le navigateur n'envoie qu'à verifiermondevis.fr). Contourne les blocages
 *   navigateur (ad-blocker, DNS sécurisé, antivirus) qui empêchent l'upload
 *   direct vers marketing-render.messagingme.app.
 * - **Gros fichier (> 4 Mo)** — flow direct historique : token signé via
 *   `/import/sign` puis upload XHR direct vers le VPS, qui rend chaque slide
 *   en mp4 (animé) ou PNG (statique), upload B2 et crée la ligne.
 *
 * La plupart des HTML standalone font 1-3 Mo donc passent par le proxy. Le flow
 * direct reste pour les exports lourds (images embed > 5 Mo).
 */
const PROXY_MAX_BYTES = 4_000_000;

interface Props {
  open: boolean;
  authToken: string | null;
  onClose: () => void;
  onImported: () => void;
}

type Mode = "auto" | "video" | "png";
type Phase = "idle" | "signing" | "uploading" | "rendering" | "retrying-png" | "done";

// Détecte les erreurs de timeout Playwright côté VPS — typiquement
// `page.waitForFunction: Timeout 30000ms exceeded` quand l'animation
// n'atteint jamais son état stable. Dans ce cas un retry mode PNG
// (screenshot statique à T+1s) passe presque toujours.
function isRenderTimeoutError(message: string): boolean {
  return /timeout|waitfor|exceeded/i.test(message);
}

export default function CarouselImportDialog({ open, authToken, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [product, setProduct] = useState<"gmc" | "vmd">("gmc");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<Mode>("auto");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);

  const busy = phase !== "idle" && phase !== "done";

  const reset = () => {
    setFile(null); setTitle(""); setProduct("gmc"); setMode("auto");
    setPhase("idle"); setProgress(0);
  };

  const close = () => { if (!busy) { reset(); onClose(); } };

  const onPickFile = (f: File | null) => {
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.html?$/i, "").slice(0, 120));
  };

  /**
   * Récupère un token Supabase frais. Le client supabase-js rafraîchit
   * automatiquement le token s'il est proche de l'expiration (1 h par
   * défaut côté Supabase). Évite les 401 "Non autorisé" quand le authToken
   * passé en prop a été capturé au mount du parent il y a > 1h.
   */
  const getFreshToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Session expirée — recharge la page (Ctrl+R).");
    }
    return session.access_token;
  };

  /**
   * Lance un upload + rendu. Retourne le résultat ou throw une Error.
   * Encapsule les 2 voies (proxy Vercel pour ≤ 4 Mo, direct VPS sinon).
   */
  const uploadAndRender = async (
    f: File,
    runMode: Mode,
  ): Promise<{ id: number; kind: string; slideCount: number }> => {
    // Fresh token à chaque tentative — supabase-js auto-refresh si proche expiration.
    const freshToken = await getFreshToken();

    const qs = new URLSearchParams({
      product,
      title: title.trim(),
      mode: runMode,
      platform: "instagram",
    });
    const useProxy = f.size <= PROXY_MAX_BYTES;

    if (useProxy) {
      // ── Petit fichier : proxy Vercel ──────────────────────────────────
      // Le navigateur n'envoie qu'à notre origin → bypass les bloqueurs
      // DNS/ad-blocker qui peuvent filtrer messagingme.app.
      setPhase("uploading");
      setProgress(0);
      return new Promise<{ id: number; kind: string; slideCount: number }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/admin/marketing/import/proxy?${qs.toString()}`);
        xhr.setRequestHeader("Authorization", `Bearer ${freshToken}`);
        xhr.setRequestHeader("Content-Type", "text/html");
        xhr.timeout = 6 * 60 * 1000;
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.upload.onload = () => setPhase("rendering");
        xhr.onload = () => {
          let body: unknown = null;
          try { body = JSON.parse(xhr.responseText); } catch { /* noop */ }
          if (xhr.status === 200) resolve(body as { id: number; kind: string; slideCount: number });
          else reject(new Error((body as { error?: string })?.error ?? `Rendu ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Connexion au serveur perdue (XHR network error)."));
        xhr.ontimeout = () => reject(new Error("Délai dépassé (rendu trop long)"));
        xhr.send(f);
      });
    }

    // ── Gros fichier : signed direct upload navigateur → VPS ────────────
    setPhase("signing");
    const signRes = await fetch("/api/admin/marketing/import/sign", {
      method: "POST",
      headers: { Authorization: `Bearer ${freshToken}` },
    });
    const signData = await signRes.json();
    if (!signRes.ok) throw new Error(signData?.error ?? `Sign ${signRes.status}`);
    const { uploadUrl, token } = signData as { uploadUrl: string; token: string };

    setPhase("uploading");
    setProgress(0);
    return new Promise<{ id: number; kind: string; slideCount: number }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${uploadUrl}?${qs.toString()}`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("Content-Type", "text/html");
      xhr.timeout = 5 * 60 * 1000;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.upload.onload = () => setPhase("rendering");
      xhr.onload = () => {
        let body: unknown = null;
        try { body = JSON.parse(xhr.responseText); } catch { /* noop */ }
        if (xhr.status === 200) resolve(body as { id: number; kind: string; slideCount: number });
        else reject(new Error((body as { error?: string })?.error ?? `Rendu ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error(
        "Service de rendu injoignable (probable blocage navigateur — extension, DNS, antivirus). Réessaie avec un fichier ≤ 4 Mo pour passer par le proxy.",
      ));
      xhr.ontimeout = () => reject(new Error("Délai dépassé (rendu trop long)"));
      xhr.send(f);
    });
  };

  const submit = async () => {
    // Note : on ne check plus !authToken ici — getFreshToken() refresh
    // automatiquement la session côté supabase-js. Si vraiment expirée,
    // getFreshToken throw avec un message clair (capté par le try/catch).
    if (!file) { toast.error("Choisis un fichier HTML."); return; }
    if (!title.trim()) { toast.error("Donne un titre."); return; }

    try {
      let result: { id: number; kind: string; slideCount: number };

      try {
        result = await uploadAndRender(file, mode);
      } catch (firstErr) {
        const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        const canRetryPng = mode !== "png" && isRenderTimeoutError(errMsg);

        if (!canRetryPng) throw firstErr;

        // Fallback automatique : le rendu animé a timeout côté VPS Playwright
        // (typique `page.waitForFunction: Timeout 30000ms exceeded`). Le mode PNG
        // fait un screenshot statique sans attendre la stabilisation des animations
        // → quasi-toujours OK même quand auto/video échoue.
        toast.info(
          "Rendu animé trop long — nouvelle tentative en mode Images statiques…",
          { duration: 6000 },
        );
        setPhase("retrying-png");
        setProgress(0);
        result = await uploadAndRender(file, "png");
      }

      setPhase("done");
      toast.success(
        `Carrousel importé (${result.kind === "video" ? "vidéos" : "images"}, ${result.slideCount} slides).`,
      );
      reset();
      onImported();
      onClose();
    } catch (err) {
      setPhase("idle");
      const message = err instanceof Error ? err.message : "Échec de l'import";
      // Si même le retry PNG a échoué, on enrichit le message pour orienter le debug.
      const finalMessage = isRenderTimeoutError(message)
        ? `${message} — vérifie que ton HTML ne contient pas d'animation infinie, de polices externes (Google Fonts) ou d'images bloquées par CSP.`
        : message;
      toast.error(finalMessage);
    }
  };

  const phaseLabel =
    phase === "signing" ? "Préparation…"
    : phase === "uploading" ? `Upload ${progress}%…`
    : phase === "rendering" ? "Rendu en cours (peut prendre ~1 min)…"
    : phase === "retrying-png" ? "Nouvelle tentative en mode Images…"
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importer un carrousel HTML</DialogTitle>
          <DialogDescription>
            Dépose l'export HTML (Claude Code / Claude Design). Chaque slide devient une
            image ou une vidéo, et le carrousel apparaît dans la liste.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="import-file">Fichier HTML</Label>
            <Input
              id="import-file"
              type="file"
              accept=".html,text/html"
              disabled={busy}
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} · {(file.size / 1_048_576).toFixed(1)} Mo
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="import-title">Titre</Label>
            <Input
              id="import-title"
              value={title}
              disabled={busy}
              maxLength={120}
              placeholder="Ex : 5 signes que ton chantier part en cacahuète"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Produit</Label>
              <Select value={product} disabled={busy} onValueChange={(v) => setProduct(v as "gmc" | "vmd")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gmc">GérerMonChantier</SelectItem>
                  <SelectItem value="vmd">VérifierMonDevis</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rendu</Label>
              <Select value={mode} disabled={busy} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="video">Vidéos</SelectItem>
                  <SelectItem value="png">Images</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Auto : vidéos si le HTML est animé, images sinon.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {phaseLabel && (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {phaseLabel}
              </span>
            )}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={close} disabled={busy}>Annuler</Button>
            <Button onClick={submit} disabled={busy || !file || !title.trim()}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-2" />}
              Importer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
