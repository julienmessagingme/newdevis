import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import CharCountInput from "./CharCountInput";
import SlideFieldEditor from "./SlideFieldEditor";
import { MOOD_LABELS, ALL_MOODS, formatDate } from "./helpers";
import type { TemplateDetail, SlideData, UsageEntry } from "@/types/marketing";

interface Props {
  templateId: string | null;
  authToken: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function TemplateEditDialog({ templateId, authToken, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [usageHistory, setUsageHistory] = useState<UsageEntry[]>([]);
  const [draft, setDraft] = useState<{
    title: string;
    mood: string;
    caption: string;
    hashtags: string[];
    is_active: boolean;
    slides: Record<string, SlideData>;
  } | null>(null);

  useEffect(() => {
    if (!templateId || !authToken) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/admin/marketing/templates/${encodeURIComponent(templateId)}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
        const t = data.template as TemplateDetail;
        setTemplate(t);
        setUsageHistory((data.usage_history ?? []) as UsageEntry[]);
        setDraft({
          title: t.title ?? "",
          mood: t.mood ?? "",
          caption: t.caption ?? "",
          hashtags: t.hashtags ?? [],
          is_active: t.is_active,
          slides: t.slides ?? {},
        });
      } catch (err) {
        toast.error("Erreur de chargement", {
          description: err instanceof Error ? err.message : "Erreur",
        });
        onClose();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [templateId, authToken]);

  const handleSave = async () => {
    if (!draft || !templateId || !authToken) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/marketing/templates/${encodeURIComponent(templateId)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.detail;
        const msg = typeof detail === "object" && detail?.validation_errors
          ? (detail.validation_errors as string[]).join(", ")
          : data?.error ?? `HTTP ${res.status}`;
        throw new Error(msg);
      }
      toast.success("Script sauvegardé");
      onSaved();
      onClose();
    } catch (err) {
      toast.error("Erreur de sauvegarde", {
        description: err instanceof Error ? err.message : "Erreur",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateSlide = (key: string, updated: SlideData) => {
    if (!draft) return;
    setDraft({ ...draft, slides: { ...draft.slides, [key]: updated } });
  };

  return (
    <Dialog open={!!templateId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Éditer — {templateId}</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {draft && template && (
          <div className="space-y-6 py-2">
            {/* Metadata */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Métadonnées</h3>
              <CharCountInput
                label="Titre"
                value={draft.title}
                maxChars={100}
                onChange={(v) => setDraft({ ...draft, title: v })}
              />
              <div className="space-y-1">
                <label className="text-sm font-medium">Mood</label>
                <select
                  value={draft.mood}
                  onChange={(e) => setDraft({ ...draft, mood: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {ALL_MOODS.map((m) => (
                    <option key={m} value={m}>{MOOD_LABELS[m] ?? m}</option>
                  ))}
                </select>
              </div>
              <CharCountInput
                label="Caption"
                value={draft.caption}
                maxChars={500}
                onChange={(v) => setDraft({ ...draft, caption: v })}
                multiline
                rows={4}
              />
              <div className="space-y-1">
                <label className="text-sm font-medium">Hashtags</label>
                <input
                  value={draft.hashtags.join(", ")}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      hashtags: e.target.value
                        .split(",")
                        .map((h) => h.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="#Tag1, #Tag2"
                  className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                />
                Actif
              </label>
            </section>

            {/* Slides */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Slides ({Object.keys(draft.slides).length})
              </h3>
              {Object.entries(draft.slides)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, slide]) => (
                  <div key={key} className="border rounded-lg p-4 space-y-3 bg-muted/20">
                    <div className="text-xs font-medium text-muted-foreground">
                      {key} — <span className="font-mono">{slide.template}</span>
                    </div>
                    <SlideFieldEditor
                      templateName={slide.template}
                      fields={slide}
                      onChange={(updated) => updateSlide(key, updated)}
                    />
                  </div>
                ))}
            </section>

            {/* Usage history */}
            {usageHistory.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Historique ({usageHistory.length})
                </h3>
                <div className="text-xs space-y-1">
                  {usageHistory.map((u, i) => (
                    <div key={i} className="flex gap-3 text-muted-foreground">
                      <span>{formatDate(u.created_at)}</span>
                      <span>{u.platform}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="ghost" onClick={onClose}>Annuler</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Sauvegarder
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
