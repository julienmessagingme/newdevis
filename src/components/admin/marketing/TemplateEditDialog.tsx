import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Image as ImageIcon, Sparkles, RefreshCw } from "lucide-react";
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
import DecorCanvas from "./DecorCanvas";
import { MOOD_LABELS, ALL_MOODS, formatDate } from "./helpers";
import { proxyImg } from "@/lib/marketing/proxyImg";
import type { TemplateDetail, SlideData, DecorElement, UsageEntry } from "@/types/marketing";

/** Tri NATUREL des clés slide_N — localeCompare mettrait slide_10 avant slide_2. */
const slideNum = (k: string) => parseInt(String(k).replace(/\D/g, ""), 10) || 0;

interface BgPhoto {
  product: string;
  kind: string;
  file: string;
  url: string;
}

interface DecorAsset {
  type: string;
  variant: string;
  file: string;
  url: string;
}

/** URL du PNG réel d'une slide (preview_urls B2), 1er ratio dispo. */
function slidePngUrl(
  previewUrls: TemplateDetail["preview_urls"] | undefined,
  key: string,
): string | null {
  if (!previewUrls) return null;
  const pu = previewUrls as Record<string, Record<string, string> | undefined>;
  return pu.instagram?.[key] ?? pu.facebook?.[key] ?? pu.tiktok?.[key] ?? null;
}

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

  // ── Aperçu live ───────────────────────────────────────────────────────────
  // À chaque édition d'une slide, on rend un aperçu PNG réel via le service de
  // rendu (proxy /preview), debouncé. Remplace l'image B2 sauvegardée tant que
  // la slide est en cours d'édition.
  const [livePreviews, setLivePreviews] = useState<
    Record<string, { url: string; loading: boolean }>
  >({});
  const previewTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Un AbortController par slide : annule le fetch précédent encore en vol
  // → évite qu'une réponse lente écrase un aperçu plus récent.
  const previewAborts = useRef<Record<string, AbortController>>({});

  // Galerie photos de fond + assets décor — via la route proxy serveur
  // (B2 ne renvoie pas de CORS, un fetch direct depuis le navigateur échoue).
  const [bgPhotos, setBgPhotos] = useState<BgPhoto[]>([]);
  const [decorAssets, setDecorAssets] = useState<DecorAsset[]>([]);
  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    fetch("/api/admin/marketing/assets", {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setBgPhotos((d.photos ?? []) as BgPhoto[]);
        setDecorAssets((d.decor ?? []) as DecorAsset[]);
      })
      .catch(() => { /* galeries indisponibles — non bloquant */ });
    return () => { cancelled = true; };
  }, [authToken]);

  // Slide dont l'éditeur de décor est ouvert.
  const [decorEditFor, setDecorEditFor] = useState<string | null>(null);

  // MAJ du décor d'une slide. Déclenche le re-render debouncé de la vignette
  // d'aperçu → le décor posé apparaît baké sur la vignette (~1s après). Le
  // DecorCanvas, lui, garde son fond propre (manipulation en DOM).
  const updateSlideDecor = (key: string, els: DecorElement[]) => {
    if (!draft) return;
    const updated = { ...draft.slides[key], decor_elements: els };
    setDraft({ ...draft, slides: { ...draft.slides, [key]: updated } });
    schedulePreview(key, updated);
  };

  // Repasse une slide en décor automatique. null explicite (pas suppression de
  // clé) → survit à JSON.stringify ; le render traite null comme "auto"
  // (Array.isArray(null) === false).
  const resetSlideDecorAuto = (key: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      slides: { ...draft.slides, [key]: { ...draft.slides[key], decor_elements: null } },
    });
    setDecorEditFor(null);
  };

  // Annule timers + fetchs + révoque les blob URLs à la fermeture.
  useEffect(() => {
    if (templateId) return;
    setLivePreviews((prev) => {
      for (const p of Object.values(prev)) {
        if (p.url.startsWith("blob:")) URL.revokeObjectURL(p.url);
      }
      return {};
    });
    for (const t of Object.values(previewTimers.current)) clearTimeout(t);
    for (const a of Object.values(previewAborts.current)) a.abort();
    previewTimers.current = {};
    previewAborts.current = {};
  }, [templateId]);

  // Rendu IMMÉDIAT de l'aperçu d'1 slide (texte + photo + décor bakés) via le
  // proxy /preview. Appelé par le bouton "Voir le rendu" et par le debounce.
  const runPreview = async (key: string, slide: SlideData) => {
    if (!templateId || !authToken) return;
    clearTimeout(previewTimers.current[key]);
    setLivePreviews((p) => ({ ...p, [key]: { url: p[key]?.url ?? "", loading: true } }));
    previewAborts.current[key]?.abort();
    const ctrl = new AbortController();
    previewAborts.current[key] = ctrl;
    try {
      const res = await fetch(
        `/api/admin/marketing/templates/${encodeURIComponent(templateId)}/preview`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ slideKey: key, platform: "instagram", slide }),
          signal: ctrl.signal,
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      const url = URL.createObjectURL(await res.blob());
      setLivePreviews((p) => {
        const old = p[key]?.url;
        if (old && old.startsWith("blob:")) URL.revokeObjectURL(old);
        return { ...p, [key]: { url, loading: false } };
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return; // périmé, ignoré
      setLivePreviews((p) => ({ ...p, [key]: { url: p[key]?.url ?? "", loading: false } }));
      toast.error("Aperçu indisponible", {
        description: err instanceof Error ? err.message : "Erreur",
      });
    }
  };

  // Rendu DEBOUNCÉ (auto, 800ms après la dernière modif).
  const schedulePreview = (key: string, slide: SlideData) => {
    if (!templateId || !authToken) return;
    clearTimeout(previewTimers.current[key]);
    setLivePreviews((p) => ({ ...p, [key]: { url: p[key]?.url ?? "", loading: true } }));
    previewTimers.current[key] = setTimeout(() => runPreview(key, slide), 800);
  };

  const updateSlide = (key: string, updated: SlideData) => {
    if (!draft) return;
    setDraft({ ...draft, slides: { ...draft.slides, [key]: updated } });
    schedulePreview(key, updated);
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

            {/* Aperçu carrousel */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Aperçu carrousel
              </h3>
              <SlideCarouselPreview slides={draft.slides} previewUrls={template.preview_urls} />
            </section>

            {/* Slides — vrai PNG + édition côte à côte */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Slides ({Object.keys(draft.slides).length})
              </h3>
              {Object.entries(draft.slides)
                .sort(([a], [b]) => slideNum(a) - slideNum(b))
                .map(([key, slide]) => {
                  const live = livePreviews[key];
                  const displayUrl = live?.url || slidePngUrl(template.preview_urls, key);
                  return (
                    <div key={key} className="border rounded-lg p-4 bg-muted/20">
                      <div className="text-xs font-medium text-muted-foreground mb-3">
                        {key} — <span className="font-mono">{slide.template}</span>
                        {live?.url && (
                          <span className="ml-2 text-emerald-600">· aperçu live</span>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="w-full sm:w-56 shrink-0 self-start space-y-2">
                          <div className="relative">
                            {displayUrl ? (
                              <img
                                src={proxyImg(displayUrl)}
                                alt={key}
                                className="w-full rounded-md border"
                              />
                            ) : (
                              <div className="aspect-[4/5] rounded-md border bg-muted/40 flex items-center justify-center text-[11px] text-muted-foreground text-center p-2">
                                aperçu pas encore généré — clique « Voir le rendu »
                              </div>
                            )}
                            {live?.loading && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/40 rounded-md">
                                <Loader2 className="h-5 w-5 animate-spin text-white" />
                                <span className="text-[10px] text-white">rendu en cours…</span>
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => runPreview(key, slide)}
                            disabled={live?.loading}
                            className="w-full text-xs font-medium px-2 py-1.5 rounded border bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${live?.loading ? "animate-spin" : ""}`} />
                            Voir le rendu
                          </button>
                          <p className="text-[10px] text-muted-foreground text-center">
                            Rendu réel (texte + photo + décor). Maj auto après chaque modif.
                          </p>
                        </div>
                        <div className="flex-1 space-y-3 min-w-0">
                          <SlideFieldEditor
                            templateName={slide.template}
                            fields={slide}
                            onChange={(updated) => updateSlide(key, updated)}
                          />
                          <SlidePhotoPicker
                            product={template.product}
                            current={slide.bg_photo}
                            photos={bgPhotos}
                            onPick={(file) =>
                              updateSlide(key, { ...slide, bg_photo: file ?? null })
                            }
                          />
                          {/* Décor — éditeur canvas */}
                          <div className="space-y-2 border-t pt-3">
                            <div className="flex items-center gap-3 flex-wrap">
                              <button
                                type="button"
                                onClick={() =>
                                  setDecorEditFor(decorEditFor === key ? null : key)
                                }
                                className="text-sm font-medium flex items-center gap-1.5 text-primary hover:underline"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                Décor —{" "}
                                {slide.decor_elements
                                  ? `${slide.decor_elements.length} élément(s)`
                                  : "auto"}
                              </button>
                              {slide.decor_elements && (
                                <button
                                  type="button"
                                  onClick={() => resetSlideDecorAuto(key)}
                                  className="text-xs text-muted-foreground hover:underline"
                                >
                                  revenir au décor auto
                                </button>
                              )}
                            </div>
                            {decorEditFor === key && templateId && authToken && (
                              <DecorCanvas
                                templateId={templateId}
                                authToken={authToken}
                                slideKey={key}
                                slide={slide}
                                product={template.product}
                                decorAssets={decorAssets}
                                onChange={(els) => updateSlideDecor(key, els)}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
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

function SlideCarouselPreview({
  slides,
  previewUrls,
}: {
  slides: Record<string, SlideData>;
  previewUrls: TemplateDetail["preview_urls"] | undefined;
}) {
  const entries = Object.entries(slides).sort(([a], [b]) => slideNum(a) - slideNum(b));
  const [current, setCurrent] = useState(0);

  if (entries.length === 0) return null;

  const safeIdx = Math.min(Math.max(current, 0), entries.length - 1);
  const [key, slide] = entries[safeIdx];
  const pngUrl = slidePngUrl(previewUrls, key);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-full max-w-[280px]">
        {pngUrl ? (
          <img src={proxyImg(pngUrl)} alt={key} className="w-full rounded-lg border" />
        ) : (
          <div className="aspect-[4/5] w-full rounded-lg border bg-muted/40 flex items-center justify-center text-xs text-muted-foreground text-center p-4">
            aperçu pas encore généré
          </div>
        )}
        {entries.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setCurrent(c => c <= 0 ? entries.length - 1 : c - 1)}
              className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrent(c => c >= entries.length - 1 ? 0 : c + 1)}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
      <div className="flex gap-1.5">
        {entries.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setCurrent(i)}
            className={`w-2 h-2 rounded-full transition-all ${
              i === safeIdx ? "bg-primary w-5" : "bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {safeIdx + 1}/{entries.length} · <span className="font-mono">{slide.template}</span> · {key}
      </p>
    </div>
  );
}

/** Sélecteur de photo de fond d'une slide — galerie repliable. */
function SlidePhotoPicker({
  product,
  current,
  photos,
  onPick,
}: {
  product: string;
  current: string | null | undefined;
  photos: BgPhoto[];
  onPick: (file: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const list = photos.filter((p) => p.product === product);
  if (list.length === 0) return null;

  return (
    <div className="space-y-2 border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium flex items-center gap-1.5 text-primary hover:underline"
      >
        <ImageIcon className="h-3.5 w-3.5" />
        Photo de fond — <span className="font-mono text-xs">{current ?? "auto"}</span>
      </button>
      {open && (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-52 overflow-y-auto p-1.5 border rounded-md bg-background">
          <button
            type="button"
            onClick={() => { onPick(undefined); setOpen(false); }}
            className={`aspect-[4/5] rounded border text-[9px] text-muted-foreground flex items-center justify-center ${
              !current ? "ring-2 ring-primary" : ""
            }`}
          >
            auto
          </button>
          {list.map((p) => (
            <button
              key={`${p.kind}/${p.file}`}
              type="button"
              title={`${p.kind} · ${p.file}`}
              onClick={() => { onPick(p.file); setOpen(false); }}
              className={`relative aspect-[4/5] rounded border overflow-hidden ${
                current === p.file ? "ring-2 ring-primary" : ""
              }`}
            >
              <img
                src={proxyImg(p.url)}
                alt={p.file}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {/* hero = plein cadre / bg = fond flouté en layout split */}
              <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[8px] text-center leading-tight">
                {p.kind}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
