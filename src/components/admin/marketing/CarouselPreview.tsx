import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import type { MarketingAsset, MarketingSlide } from "@/types/marketing";

interface CarouselPreviewProps {
  slides: MarketingSlide[] | null | undefined;
  assets: MarketingAsset[];
}

interface MergedSlide {
  slide_n: number;
  text: string;
  visual_brief: string;
  imageUrl: string | null;
}

function mergeSlidesAndAssets(
  slides: MarketingSlide[] | null | undefined,
  assets: MarketingAsset[],
): MergedSlide[] {
  const slideAssets = assets.filter(a => a.asset_type === "carousel_slide" && a.public_url);
  const cover = assets.find(a => a.asset_type === "carousel_cover" && a.public_url);

  const slidesArr = Array.isArray(slides) ? slides : [];

  // Index assets par slide_index
  const assetByIndex = new Map<number, MarketingAsset>();
  for (const a of slideAssets) {
    if (typeof a.slide_index === "number") assetByIndex.set(a.slide_index, a);
  }

  // Construit liste fusionnée. La cover est ajoutée en premier si présente.
  const merged: MergedSlide[] = [];
  if (cover) {
    merged.push({
      slide_n: 0,
      text: "Cover",
      visual_brief: "",
      imageUrl: cover.public_url,
    });
  }

  slidesArr.forEach((s, i) => {
    const slideN = typeof s.slide_n === "number" ? s.slide_n : i + 1;
    const asset = assetByIndex.get(slideN) ?? assetByIndex.get(i + 1);
    merged.push({
      slide_n: slideN,
      text: typeof s.text === "string" ? s.text : "",
      visual_brief: typeof s.visual_brief === "string" ? s.visual_brief : "",
      imageUrl: asset?.public_url ?? null,
    });
  });

  // Si on a des assets sans slide JSON correspondant, on les ajoute en queue
  const seenIndexes = new Set(merged.map(m => m.slide_n));
  for (const a of slideAssets) {
    const idx = a.slide_index ?? 0;
    if (!seenIndexes.has(idx)) {
      merged.push({
        slide_n: idx,
        text: "",
        visual_brief: "",
        imageUrl: a.public_url,
      });
    }
  }

  return merged;
}

export default function CarouselPreview({ slides, assets }: CarouselPreviewProps) {
  const merged = useMemo(() => mergeSlidesAndAssets(slides, assets), [slides, assets]);
  const [current, setCurrent] = useState(0);

  if (merged.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center bg-muted/30 rounded-lg p-12 text-muted-foreground">
        <ImageOff className="h-12 w-12 mb-2" />
        <p className="text-sm">Aucune slide à prévisualiser</p>
      </div>
    );
  }

  const safeIndex = Math.min(Math.max(current, 0), merged.length - 1);
  const slide = merged[safeIndex];

  return (
    <div className="space-y-3">
      <div className="relative bg-slate-900 rounded-lg overflow-hidden aspect-square max-h-[480px] mx-auto">
        {slide.imageUrl ? (
          <img
            src={slide.imageUrl}
            alt={`Slide ${slide.slide_n}`}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 p-6 text-center">
            <ImageOff className="h-10 w-10 mb-2" />
            <p className="text-sm">Image manquante pour cette slide</p>
            {slide.text ? (
              <p className="mt-3 text-xs italic max-w-xs">{slide.text}</p>
            ) : null}
          </div>
        )}

        {merged.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setCurrent((c) => (c <= 0 ? merged.length - 1 : c - 1))}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white touch-manipulation"
              aria-label="Slide précédente"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setCurrent((c) => (c >= merged.length - 1 ? 0 : c + 1))}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white touch-manipulation"
              aria-label="Slide suivante"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {merged.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrent(i)}
                  className={`w-2 h-2 rounded-full transition-all touch-manipulation ${
                    i === safeIndex ? "bg-white w-6" : "bg-white/50"
                  }`}
                  aria-label={`Aller à la slide ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="text-xs text-center text-muted-foreground">
        Slide {safeIndex + 1} / {merged.length}
        {slide.text ? <> · <span className="text-foreground">{slide.text}</span></> : null}
      </div>
    </div>
  );
}
