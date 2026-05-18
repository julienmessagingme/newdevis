import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Trash2, RotateCw, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { proxyImg } from "@/lib/marketing/proxyImg";
import type { DecorElement, SlideData } from "@/types/marketing";

/**
 * DecorCanvas — éditeur de décor sur canvas.
 *
 * Affiche l'aperçu PNG de la slide SANS décor (rendu avec decor_elements: [])
 * comme fond, et superpose les DecorElement en DOM, manipulables :
 *   - glisser le corps → déplace (xPct/yPct)
 *   - poignée ↻ → rotation
 *   - poignée ⤡ → redimensionnement (scale)
 *   - double-clic post-it → édition du texte
 * Tout est client-side ; le vrai rendu se fait au commit (sauvegarde).
 */

interface DecorAsset {
  type: string;
  variant: string;
  file: string;
  url: string;
}

interface Props {
  templateId: string;
  authToken: string;
  slideKey: string;
  slide: SlideData;
  product: string;
  decorAssets: DecorAsset[];
  onChange: (elements: DecorElement[]) => void;
}

// Largeur de rendu réelle d'une slide + tailles de base des décors à scale 1.
// postit/stamp/arrow DOIVENT matcher DECOR_BASE_PX de render_carousels_v3.mjs.
// `seal` est une APPROXIMATION : au rendu, le sceau est dimensionné par son CSS
// (.brand-seal) ; ici 300px est juste une taille d'aperçu plausible.
const RENDER_W = 1080;
const BASE_PX: Record<string, number> = { postit: 188, stamp: 360, arrow: 122, seal: 300 };
const CANVAS_W = 360; // largeur fixe du canvas éditeur (px)
const FACTOR = CANVAS_W / RENDER_W;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const PALETTE: { type: DecorElement["type"]; label: string }[] = [
  { type: "postit", label: "Post-it" },
  { type: "stamp", label: "Tampon" },
  { type: "arrow", label: "Flèche" },
  { type: "seal", label: "Sceau" },
];

type DragMode = "move" | "rotate" | "resize";
interface DragState {
  mode: DragMode;
  index: number;
  rect: DOMRect;
  cx: number;
  cy: number;
  startClientX: number;
  startClientY: number;
  startXPct: number;
  startYPct: number;
  startRotation: number;
  startScale: number;
  startDist: number;
}

export default function DecorCanvas({
  templateId,
  authToken,
  slideKey,
  slide,
  product,
  decorAssets,
  onChange,
}: Props) {
  const elements = slide.decor_elements ?? [];
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgLoading, setBgLoading] = useState(true);
  // Sélection par id stable (pas par index : un index devient faux après
  // suppression / réordonnancement d'un élément).
  const [selected, setSelected] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // Refs synchronisés → les handlers pointer gardent une identité stable.
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // ── Fond : aperçu PNG SANS décor (decor_elements forcé à []) ──────────────
  // Re-fetch quand le texte / la photo change, pas quand le décor change.
  const slideSansDecor = JSON.stringify({ ...slide, decor_elements: undefined });
  useEffect(() => {
    let cancelled = false;
    setBgLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/marketing/templates/${encodeURIComponent(templateId)}/preview`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              slideKey,
              platform: "instagram",
              slide: { ...JSON.parse(slideSansDecor), decor_elements: [] },
            }),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const url = URL.createObjectURL(await res.blob());
        if (cancelled) { URL.revokeObjectURL(url); return; }
        setBgUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
      } catch {
        if (!cancelled) toast.error("Aperçu du décor indisponible");
      } finally {
        if (!cancelled) setBgLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [templateId, authToken, slideKey, slideSansDecor]);

  // Révoque le blob du fond au démontage.
  useEffect(() => () => { if (bgUrl) URL.revokeObjectURL(bgUrl); }, [bgUrl]);

  // ── Pointer (move / rotate / resize) ──────────────────────────────────────
  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const next = [...elementsRef.current];
    const el = { ...next[d.index] };
    if (d.mode === "move") {
      el.xPct = clamp(d.startXPct + ((e.clientX - d.startClientX) / d.rect.width) * 100, 0, 100);
      el.yPct = clamp(d.startYPct + ((e.clientY - d.startClientY) / d.rect.height) * 100, 0, 100);
    } else if (d.mode === "rotate") {
      const ang = (Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180) / Math.PI;
      el.rotation = Math.round(ang + 90); // poignée au-dessus → 0° quand droit
    } else {
      const dist = Math.hypot(e.clientX - d.cx, e.clientY - d.cy);
      el.scale = Math.round(clamp(d.startScale * (dist / (d.startDist || 1)), 0.3, 3) * 100) / 100;
    }
    next[d.index] = el;
    onChangeRef.current(next);
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  useEffect(() => () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove, onPointerUp]);

  const beginDrag = (e: React.PointerEvent, id: string, mode: DragMode) => {
    if (dragRef.current) return; // déjà un drag en cours
    e.stopPropagation();
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const index = elementsRef.current.findIndex((x) => x.id === id);
    if (index < 0) return;
    const rect = canvas.getBoundingClientRect();
    const el = elementsRef.current[index];
    const cx = rect.left + (el.xPct / 100) * rect.width;
    const cy = rect.top + (el.yPct / 100) * rect.height;
    dragRef.current = {
      mode, index, rect, cx, cy,
      startClientX: e.clientX, startClientY: e.clientY,
      startXPct: el.xPct, startYPct: el.yPct,
      startRotation: el.rotation, startScale: el.scale,
      startDist: Math.hypot(e.clientX - cx, e.clientY - cy),
    };
    setSelected(id);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // ── Palette / suppression / texte ─────────────────────────────────────────
  const assetFor = (type: string, variant?: string) =>
    decorAssets.find((a) => a.type === type && (!variant || a.variant === variant));

  // Toutes les actions palette/toolbar lisent elementsRef.current (et pas la
  // closure `elements`, périmée si 2 actions s'enchaînent avant le re-render).
  const addElement = (type: DecorElement["type"]) => {
    const current = elementsRef.current;
    const variant = type === "seal" ? undefined : assetFor(type)?.variant;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const el: DecorElement = {
      id, type, variant, xPct: 50, yPct: 45, rotation: 0, scale: 1,
      text: type === "postit" ? "Note" : undefined,
    };
    onChange([...current, el]);
    setSelected(id);
  };

  const removeSelected = () => {
    if (selected == null) return;
    onChange(elementsRef.current.filter((e) => e.id !== selected));
    setSelected(null);
  };

  const editText = (id: string) => {
    const els = elementsRef.current;
    const el = els.find((x) => x.id === id);
    if (!el || el.type !== "postit") return;
    const next = window.prompt("Texte du post-it :", el.text ?? "");
    if (next == null) return;
    onChange(els.map((x) => (x.id === id ? { ...x, text: next.slice(0, 60) } : x)));
  };

  const cycleVariant = (id: string) => {
    const els = elementsRef.current;
    const el = els.find((x) => x.id === id);
    if (!el || el.type === "seal") return;
    const variants = decorAssets.filter((a) => a.type === el.type).map((a) => a.variant);
    if (variants.length < 2) return;
    const cur = variants.indexOf(el.variant ?? variants[0]);
    const nextVariant = variants[(cur + 1) % variants.length];
    onChange(els.map((x) => (x.id === id ? { ...x, variant: nextVariant } : x)));
  };

  // ── Rendu visuel d'un élément ─────────────────────────────────────────────
  const renderElementContent = (el: DecorElement) => {
    const w = (BASE_PX[el.type] ?? 188) * FACTOR;
    if (el.type === "seal") {
      const color = product === "gmc" ? "#1A4A7F" : "#3A8A65";
      const word = product === "gmc" ? "SOUS CONTRÔLE" : "VÉRIFIÉ";
      const letter = product === "gmc" ? "G" : "V";
      return (
        <div
          style={{ borderColor: color }}
          className="flex items-center gap-1.5 bg-white border-2 rounded-md px-2 py-1 shadow"
        >
          <span style={{ background: color }} className="text-white font-black rounded text-[10px] w-5 h-5 flex items-center justify-center">
            {letter}
          </span>
          <span style={{ color }} className="font-black text-[11px] leading-none">{word}</span>
        </div>
      );
    }
    const asset = assetFor(el.type, el.variant);
    if (!asset) return <div className="bg-muted text-[8px] p-1">{el.type}?</div>;
    if (el.type === "postit") {
      return (
        <div
          style={{ width: w, height: w, backgroundImage: `url(${asset.url})` }}
          className="bg-contain bg-no-repeat bg-center flex items-center justify-center"
        >
          <span className="font-extrabold text-center text-[#2A2A2A] leading-tight px-2"
            style={{ fontSize: 7 * FACTOR * 10, maxWidth: "74%" }}>
            {el.text}
          </span>
        </div>
      );
    }
    return <img src={proxyImg(asset.url)} alt={el.type} style={{ width: w }} draggable={false} />;
  };

  return (
    <div className="space-y-2">
      {/* Palette */}
      <div className="flex flex-wrap gap-1.5">
        {PALETTE.map((p) => (
          <button
            key={p.type}
            type="button"
            onClick={() => addElement(p.type)}
            className="text-xs px-2 py-1 rounded border bg-background hover:bg-muted"
          >
            + {p.label}
          </button>
        ))}
        {selected != null && (
          <>
            <button
              type="button"
              onClick={() => cycleVariant(selected)}
              className="text-xs px-2 py-1 rounded border bg-background hover:bg-muted"
            >
              Variante
            </button>
            <button
              type="button"
              onClick={removeSelected}
              className="text-xs px-2 py-1 rounded border bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" /> Supprimer
            </button>
          </>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        onPointerDown={() => setSelected(null)}
        style={{ width: CANVAS_W }}
        className="relative aspect-[4/5] rounded-md border bg-muted/40 overflow-hidden select-none touch-none"
      >
        {bgUrl && <img src={proxyImg(bgUrl)} alt="" className="absolute inset-0 w-full h-full" draggable={false} />}
        {bgLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}
        {!bgLoading && elements.length === 0 && (
          <div className="absolute inset-x-2 bottom-2 text-center text-[11px] text-white bg-black/50 rounded py-1.5 px-2">
            Aucun décor sur cette slide. Ajoute un élément avec la palette
            ci-dessus (post-it, tampon, flèche, sceau).
          </div>
        )}

        {elements.map((el) => {
          const id = el.id ?? "";
          return (
            <div
              key={id}
              onPointerDown={(e) => beginDrag(e, id, "move")}
              onDoubleClick={() => editText(id)}
              style={{
                position: "absolute",
                left: `${el.xPct}%`,
                top: `${el.yPct}%`,
                transform: `translate(-50%, -50%) rotate(${el.rotation}deg) scale(${el.scale})`,
                cursor: "move",
              }}
              className={selected === id ? "outline outline-2 outline-primary outline-offset-2" : ""}
            >
              {renderElementContent(el)}
              {selected === id && (
                <>
                  {/* poignée rotation */}
                  <div
                    onPointerDown={(e) => beginDrag(e, id, "rotate")}
                    className="absolute left-1/2 -top-6 -translate-x-1/2 w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center cursor-grab"
                  >
                    <RotateCw className="h-2.5 w-2.5" />
                  </div>
                  {/* poignée resize */}
                  <div
                    onPointerDown={(e) => beginDrag(e, id, "resize")}
                    className="absolute -right-2 -bottom-2 w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center cursor-nwse-resize"
                  >
                    <Maximize2 className="h-2.5 w-2.5" />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Glisser pour déplacer · poignée ↻ rotation · poignée ⤡ taille ·
        double-clic post-it pour le texte · {elements.length} élément(s)
      </p>
    </div>
  );
}
