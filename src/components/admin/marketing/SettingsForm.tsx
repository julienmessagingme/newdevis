import { useEffect, useMemo, useState } from "react";
import { Save, AlertTriangle, RotateCcw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type {
  MarketingSettings,
  MarketingSettingsClientPayload,
  MarketingSettingsUpdateResponse,
} from "@/types/marketing";

interface SettingsFormProps {
  initial: MarketingSettings;
  authToken: string;
  onSaved: (next: MarketingSettings) => void;
}

/**
 * Form d'édition de marketing.settings (Niveau 1).
 *
 * - Affiche/édite les 6 réglages exposés
 * - Validation client (avant POST) — défense en profondeur (le serveur valide aussi)
 * - Confirm modal si on désactive DRY_RUN (= passe en publi réelle)
 * - Affiche un warning si scheduler_hour/minute changent (restart requis)
 * - Bouton Save disabled tant que pas de changement
 * - Bouton Reset pour revenir aux valeurs DB
 */
export default function SettingsForm({ initial, authToken, onSaved }: SettingsFormProps) {
  const [form, setForm] = useState<MarketingSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Sync si parent reload après save (ex: refresh manuel)
  useEffect(() => {
    setForm(initial);
  }, [initial]);

  // Détection des changements field-by-field pour le bouton Save + payload optimal
  const dirtyFields = useMemo(() => {
    const d: (keyof MarketingSettings)[] = [];
    if (form.gmc_ratio_pct !== initial.gmc_ratio_pct) d.push("gmc_ratio_pct");
    if (form.quality_threshold !== initial.quality_threshold) d.push("quality_threshold");
    if (form.max_flow_cost_usd !== initial.max_flow_cost_usd) d.push("max_flow_cost_usd");
    if (form.scheduler_hour !== initial.scheduler_hour) d.push("scheduler_hour");
    if (form.scheduler_minute !== initial.scheduler_minute) d.push("scheduler_minute");
    if (form.dry_run !== initial.dry_run) d.push("dry_run");
    return d;
  }, [form, initial]);

  const isDirty = dirtyFields.length > 0;
  const willGoLive = initial.dry_run === true && form.dry_run === false;
  const schedulerChanged =
    dirtyFields.includes("scheduler_hour") || dirtyFields.includes("scheduler_minute");

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!isDirty) return;

    // Confirm modal si on passe DRY_RUN à false (= publi réelle)
    if (willGoLive) {
      setConfirmOpen(true);
      return;
    }
    await doSave();
  };

  const doSave = async () => {
    setSaving(true);
    try {
      // Build payload : ne send que les champs modifiés (PATCH semantic).
      // `updated_by` n'est PAS dans MarketingSettingsClientPayload — la route Astro
      // injecte l'email de l'admin authentifié avant de relayer à FastAPI.
      const payload: MarketingSettingsClientPayload = {};
      if (dirtyFields.includes("gmc_ratio_pct")) payload.gmc_ratio_pct = form.gmc_ratio_pct;
      if (dirtyFields.includes("quality_threshold")) payload.quality_threshold = form.quality_threshold;
      if (dirtyFields.includes("max_flow_cost_usd")) payload.max_flow_cost_usd = form.max_flow_cost_usd;
      if (dirtyFields.includes("scheduler_hour")) payload.scheduler_hour = form.scheduler_hour;
      if (dirtyFields.includes("scheduler_minute")) payload.scheduler_minute = form.scheduler_minute;
      if (dirtyFields.includes("dry_run")) payload.dry_run = form.dry_run;

      const res = await fetch("/api/admin/marketing/settings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as MarketingSettingsUpdateResponse | { error: string };
      if (!res.ok) {
        const msg = "error" in data ? data.error : `Erreur ${res.status}`;
        toast.error("Échec de la sauvegarde", { description: msg });
        return;
      }

      const next = data as MarketingSettingsUpdateResponse;
      toast.success("Réglages enregistrés", {
        description: next.scheduler_restart_required
          ? "⚠️ Pense à redémarrer le container pour prendre en compte le nouvel horaire scheduler."
          : "Les agents utiliseront les nouvelles valeurs au prochain flow.",
        duration: next.scheduler_restart_required ? 10_000 : 4_000,
      });
      onSaved(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur réseau";
      toast.error("Échec de la sauvegarde", { description: msg });
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  const handleReset = () => setForm(initial);

  // ── UI ────────────────────────────────────────────────────────────────────
  const vmdRatio = 100 - form.gmc_ratio_pct;
  const updatedAt = initial.updated_at
    ? new Date(initial.updated_at).toLocaleString("fr-FR")
    : "—";

  return (
    <div className="space-y-6">
      {/* Audit info */}
      <div className="flex items-start gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="text-muted-foreground">
          Dernière modification :{" "}
          <span className="font-medium text-foreground">{initial.updated_by}</span> — {updatedAt}
        </div>
      </div>

      {/* gmc_ratio_pct */}
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="gmc-ratio" className="text-base font-semibold">
            Ratio CTA cible GMC vs VMD
          </Label>
          <span className="text-sm font-mono">
            <span className="text-emerald-700 font-bold">{form.gmc_ratio_pct}% GMC</span>
            <span className="text-muted-foreground mx-2">·</span>
            <span className="text-blue-700 font-bold">{vmdRatio}% VMD</span>
          </span>
        </div>
        <input
          id="gmc-ratio"
          type="range"
          min={0}
          max={100}
          step={1}
          value={form.gmc_ratio_pct}
          onChange={(e) => setForm({ ...form, gmc_ratio_pct: Number(e.target.value) })}
          className="w-full accent-primary"
        />
        <p className="text-xs text-muted-foreground">
          Le Strategist équilibre la semaine pour respecter cette cible. Sur 7 derniers posts :
          ~{Math.round((form.gmc_ratio_pct * 7) / 100)} GMC + ~{Math.round((vmdRatio * 7) / 100)} VMD.
        </p>
      </div>

      {/* quality_threshold */}
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <Label htmlFor="quality" className="text-base font-semibold">
          Seuil Quality Gate (sur 12)
        </Label>
        <Input
          id="quality"
          type="number"
          min={1}
          max={12}
          step={1}
          value={form.quality_threshold}
          onChange={(e) =>
            setForm({ ...form, quality_threshold: Math.max(1, Math.min(12, Number(e.target.value))) })
          }
          className="max-w-[120px]"
        />
        <p className="text-xs text-muted-foreground">
          Score minimum pour qu'un post soit APPROVED automatiquement. En dessous : REJECTED + retry
          (1 max). Recommandé : <span className="font-mono">10</span> (~83%).
        </p>
      </div>

      {/* max_flow_cost_usd */}
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <Label htmlFor="max-cost" className="text-base font-semibold">
          Coût max par flow ($)
        </Label>
        <Input
          id="max-cost"
          type="number"
          min={0.1}
          max={50}
          step={0.5}
          value={form.max_flow_cost_usd}
          onChange={(e) =>
            setForm({ ...form, max_flow_cost_usd: Math.max(0.1, Math.min(50, Number(e.target.value))) })
          }
          className="max-w-[120px]"
        />
        <p className="text-xs text-muted-foreground">
          Cap dur. Si un flow dépasse, il est arrêté (status=aborted, post pas publié).
          Coût observé typique : $0.80-$1.20 par carrousel.
        </p>
      </div>

      {/* scheduler_hour + scheduler_minute */}
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <Label className="text-base font-semibold">Horaire tick quotidien (Europe/Paris)</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={23}
            step={1}
            value={form.scheduler_hour}
            onChange={(e) =>
              setForm({ ...form, scheduler_hour: Math.max(0, Math.min(23, Number(e.target.value))) })
            }
            className="max-w-[80px]"
            aria-label="Heure"
          />
          <span className="text-lg font-mono">:</span>
          <Input
            type="number"
            min={0}
            max={59}
            step={1}
            value={form.scheduler_minute}
            onChange={(e) =>
              setForm({ ...form, scheduler_minute: Math.max(0, Math.min(59, Number(e.target.value))) })
            }
            className="max-w-[80px]"
            aria-label="Minute"
          />
        </div>
        {schedulerChanged && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Changer l'horaire nécessite un redémarrage du container marketing-agents pour prise en
              compte (APScheduler tient un trigger statique au boot).
            </span>
          </div>
        )}
      </div>

      {/* dry_run */}
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="dry-run"
            checked={form.dry_run}
            onCheckedChange={(checked) => setForm({ ...form, dry_run: checked === true })}
            className="mt-1"
          />
          <div className="space-y-1">
            <Label htmlFor="dry-run" className="text-base font-semibold cursor-pointer">
              Mode test (DRY_RUN)
            </Label>
            <p className="text-xs text-muted-foreground">
              {form.dry_run
                ? "✅ Les agents tournent mais ne publient pas réellement. Sécurisé pour les tests."
                : "⚠️ Mode production : les agents publient pour de vrai dès que c'est implémenté (V2 Meta API)."}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button variant="outline" onClick={handleReset} disabled={!isDirty || saving}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Annuler
        </Button>
        <Button onClick={handleSave} disabled={!isDirty || saving}>
          <Save className={`h-4 w-4 mr-2 ${saving ? "animate-spin" : ""}`} />
          {saving ? "Enregistrement..." : `Enregistrer ${dirtyFields.length > 0 ? `(${dirtyFields.length})` : ""}`}
        </Button>
      </div>

      {/* Confirm modal pour DRY_RUN false */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Désactiver le mode test ?
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-2">
              <span className="block">
                Tu t'apprêtes à désactiver <strong>DRY_RUN</strong>. Les agents ne tournent plus en
                mode test.
              </span>
              <span className="block text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-3 text-sm">
                ⚠️ En V1 (mode manuel), DRY_RUN ne change pas grand-chose côté visible : les
                carrousels apparaissent toujours dans le dashboard à valider à la main. Mais quand
                la V2 (Meta API) sera live, désactiver DRY_RUN = publication automatique sur tes
                comptes FB/IG. À garder à l'esprit.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={doSave} disabled={saving}>
              {saving ? "Confirmation..." : "Oui, désactiver DRY_RUN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
