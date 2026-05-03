import { useState } from "react";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatRelativeDate } from "./helpers";
import type { MarketingStatus } from "@/types/marketing";

interface KillSwitchToggleProps {
  status: MarketingStatus | null;
  authToken: string | null;
  onChanged: () => void;
}

export default function KillSwitchToggle({ status, authToken, onChanged }: KillSwitchToggleProps) {
  const { toast } = useToast();
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const statusLoaded = status !== null;
  const isPaused = !!status?.kill_switch?.is_paused;

  async function callApi(paused: boolean, reasonValue?: string) {
    if (!authToken) {
      toast({ title: "Session expirée", description: "Reconnectez-vous.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/marketing/kill-switch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paused, reason: reasonValue ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

      toast({
        title: paused ? "Système marketing mis en pause" : "Système marketing relancé",
        description: paused ? `Raison : ${reasonValue}` : "Les agents peuvent à nouveau publier.",
      });
      setPauseDialogOpen(false);
      setReason("");
      onChanged();
    } catch (err) {
      toast({
        title: "Erreur kill switch",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
        {statusLoaded ? (
          <div className={`p-2 rounded-md ${isPaused ? "bg-red-100" : "bg-emerald-100"}`}>
            {isPaused ? (
              <ShieldAlert className="h-5 w-5 text-red-700" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-emerald-700" />
            )}
          </div>
        ) : (
          <div className="p-2 rounded-md bg-muted">
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">
            {!statusLoaded
              ? "Vérification de l'état…"
              : isPaused
                ? "Système EN PAUSE"
                : "Système actif"}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {!statusLoaded
              ? "—"
              : isPaused
                ? `${status?.kill_switch?.reason || "Raison non précisée"} · ${formatRelativeDate(status?.kill_switch?.paused_at)}`
                : "Les agents peuvent générer et publier"}
          </div>
        </div>
        {statusLoaded && (isPaused ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => callApi(false)}
            disabled={submitting || !authToken}
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Relancer
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setPauseDialogOpen(true)}
            disabled={submitting || !authToken}
          >
            Mettre en pause
          </Button>
        ))}
      </div>

      <Dialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mettre en pause les agents marketing</DialogTitle>
            <DialogDescription>
              Tous les nouveaux runs seront refusés. Les runs en cours s'arrêteront proprement
              à la prochaine vérification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="kill-reason">Raison (obligatoire)</Label>
            <Input
              id="kill-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: incident qualité détecté, audit en cours…"
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseDialogOpen(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => callApi(true, reason.trim())}
              disabled={submitting || !reason.trim()}
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirmer la pause
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
