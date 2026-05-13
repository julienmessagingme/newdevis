import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, ImageOff, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PRODUCT_BADGE } from "./helpers";
import type { TemplateListItem, PreviewUrls } from "@/types/marketing";

interface Props {
  template: TemplateListItem | null;
  onClose: () => void;
}

type Platform = "instagram" | "facebook" | "tiktok";

const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram (4:5)",
  facebook: "Facebook (1:1)",
  tiktok: "TikTok (9:16)",
};

const PLATFORM_RATIO_CLASS: Record<Platform, string> = {
  instagram: "aspect-[4/5]",
  facebook: "aspect-square",
  tiktok: "aspect-[9/16]",
};

/**
 * Trie les slide_keys naturellement (slide_1, slide_2, ..., slide_10).
 */
function sortedSlideKeys(obj: Record<string, string> | undefined): string[] {
  if (!obj) return [];
  return Object.keys(obj).sort((a, b) => {
    const an = parseInt(a.replace("slide_", ""), 10);
    const bn = parseInt(b.replace("slide_", ""), 10);
    return an - bn;
  });
}

/**
 * Liste des plateformes disponibles dans preview_urls (ignore les manquantes).
 */
function availablePlatforms(previews: PreviewUrls): Platform[] {
  if (!previews) return [];
  const order: Platform[] = ["instagram", "facebook", "tiktok"];
  return order.filter((p) => previews[p] && Object.keys(previews[p] ?? {}).length > 0);
}

interface CarouselPanelProps {
  platform: Platform;
  urls: Record<string, string>;
}

function CarouselPanel({ platform, urls }: CarouselPanelProps) {
  const slides = useMemo(() => sortedSlideKeys(urls), [urls]);
  const [active, setActive] = useState(0);

  if (slides.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <ImageOff className="mr-2 h-5 w-5" />
        Aucune slide rendue pour {PLATFORM_LABEL[platform]}.
      </div>
    );
  }

  const prev = () => setActive((i) => (i - 1 + slides.length) % slides.length);
  const next = () => setActive((i) => (i + 1) % slides.length);

  return (
    <div className="space-y-4">
      {/* Image principale en grand format */}
      <div className="flex items-center justify-center gap-3">
        <Button variant="ghost" size="icon" onClick={prev} disabled={slides.length <= 1}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div
          className={`relative max-h-[70vh] w-auto overflow-hidden rounded-lg border bg-muted ${PLATFORM_RATIO_CLASS[platform]}`}
          style={{ height: "min(70vh, 720px)" }}
        >
          <img
            src={urls[slides[active]]}
            alt={`${platform} · ${slides[active]}`}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        </div>
        <Button variant="ghost" size="icon" onClick={next} disabled={slides.length <= 1}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Pagination + slide label */}
      <div className="flex flex-col items-center gap-2">
        <div className="text-sm text-muted-foreground">
          Slide {active + 1} / {slides.length}
        </div>
        <div className="flex gap-1">
          {slides.map((sk, i) => (
            <button
              key={sk}
              onClick={() => setActive(i)}
              className={`h-1.5 w-6 rounded-full transition ${
                i === active ? "bg-primary" : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
              }`}
              aria-label={`Aller à la slide ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Vignettes thumbnails (sticky) */}
      <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-2">
        {slides.map((sk, i) => (
          <button
            key={sk}
            onClick={() => setActive(i)}
            className={`overflow-hidden rounded border-2 transition ${
              i === active ? "border-primary" : "border-transparent hover:border-muted-foreground/40"
            }`}
          >
            <img
              src={urls[sk]}
              alt={sk}
              className="aspect-square h-full w-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TemplatePreviewDialog({ template, onClose }: Props) {
  const previews = template?.preview_urls ?? null;
  const platforms = useMemo(() => availablePlatforms(previews), [previews]);
  const [active, setActive] = useState<Platform>(platforms[0] ?? "instagram");

  // Re-sync active platform si le template change
  useMemo(() => {
    if (platforms.length > 0 && !platforms.includes(active)) {
      setActive(platforms[0]);
    }
  }, [platforms, active]);

  if (!template) return null;

  const badge = PRODUCT_BADGE[template.product];

  return (
    <Dialog open={!!template} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-base font-semibold">
            <span className="font-mono text-xs text-muted-foreground">#{template.id}</span>
            {badge && (
              <span className={`inline-block px-2 py-0.5 rounded text-xs border font-medium ${badge.class}`}>
                {badge.label}
              </span>
            )}
            <span className="flex-1 truncate">{template.title}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {template.macro_format && (
              <span className="font-mono mr-2">{template.macro_format}</span>
            )}
            {template.format_size} slides · mood: {template.mood}
            {previews === null && (
              <span className="ml-3 text-amber-600 font-medium">
                ⚠ Aucune preview rendue pour ce script
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {previews === null ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
            <ImageOff className="h-10 w-10" />
            <p className="text-sm">
              Ce script n'a pas encore été rendu en aperçu.
            </p>
            <p className="text-xs">
              Lance <code className="bg-muted px-1.5 py-0.5 rounded">node scripts/render_carousels_v3.mjs --product {template.product}</code>{" "}
              puis <code className="bg-muted px-1.5 py-0.5 rounded">python scripts/upload_previews_to_b2.py --product {template.product}</code>
            </p>
          </div>
        ) : platforms.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            preview_urls renseigné mais aucune plateforme valide.
          </div>
        ) : (
          <Tabs value={active} onValueChange={(v) => setActive(v as Platform)} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              {(["instagram", "facebook", "tiktok"] as Platform[]).map((p) => (
                <TabsTrigger
                  key={p}
                  value={p}
                  disabled={!platforms.includes(p)}
                  className="text-xs"
                >
                  {PLATFORM_LABEL[p]}
                  {!platforms.includes(p) && (
                    <span className="ml-1 text-muted-foreground">·</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            {platforms.map((p) => (
              <TabsContent key={p} value={p} className="mt-4">
                <CarouselPanel platform={p} urls={previews?.[p] ?? {}} />
              </TabsContent>
            ))}
          </Tabs>
        )}

        {/* Footer lien direct B2 (pour debug rapide) */}
        {previews && platforms.includes(active) && (
          <div className="mt-2 flex items-center justify-end gap-2 pt-3 border-t text-xs text-muted-foreground">
            <a
              href={previews[active]?.slide_1 ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground transition"
            >
              <ExternalLink className="h-3 w-3" />
              Ouvrir slide 1 ({active}) dans un onglet
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
