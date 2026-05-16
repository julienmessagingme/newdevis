/**
 * PullToRefresh — geste mobile natif pour rafraîchir une liste.
 *
 * À utiliser autour du contenu scrollable de l'écran. L'utilisateur tire
 * verticalement depuis le haut → un indicateur apparaît → si le geste atteint
 * le seuil (60px) et est relâché, `onRefresh()` est appelé + spinner pendant
 * la promesse.
 *
 * Comportement :
 *  - Désactivé si le scroll vertical du contenu n'est pas à 0 (sinon conflit
 *    avec le scroll natif).
 *  - Pas de pull si la promesse est en cours (évite double-refresh).
 *  - Indicateur : flèche qui rote selon la distance, puis spinner en cours
 *    de refresh.
 *  - PointerEvents (touch + mouse + stylet — utile pour debug DevTools).
 *
 * Usage :
 *   <PullToRefresh onRefresh={refetch}>
 *     <div className="overflow-y-auto">…liste…</div>
 *   </PullToRefresh>
 *
 * NB : ne marche que sur mobile (lg:hidden). Sur desktop, no-op transparent.
 */
import { useRef, useState, useCallback } from "react";
import { Loader2, ArrowDown } from "lucide-react";

const PULL_THRESHOLD     = 60;   // px à atteindre pour déclencher
const PULL_MAX           = 120;  // px max d'étirement (résistance au-delà)
const RESISTANCE         = 0.45; // facteur d'étirement (0 = bloqué, 1 = libre)

interface PullToRefreshProps {
  onRefresh:  () => Promise<unknown> | unknown;
  children:   React.ReactNode;
  /** Désactive le geste (ex: en mode édition d'un input). */
  disabled?:  boolean;
  className?: string;
}

export default function PullToRefresh({ onRefresh, children, disabled = false, className = "" }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef    = useRef<number | null>(null);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || refreshing) return;
    // Désactiver si on n'est pas en haut du scroll
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    // Pointer touch uniquement (pas mouse, sauf si on veut debug DevTools)
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    startYRef.current = e.clientY;
  }, [disabled, refreshing]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (startYRef.current === null) return;
    const dy = e.clientY - startYRef.current;
    if (dy < 0) {
      // L'utilisateur remonte → annule le pull
      setPullY(0);
      return;
    }
    const resistedDy = Math.min(PULL_MAX, dy * RESISTANCE);
    setPullY(resistedDy);
  }, []);

  const onPointerUp = useCallback(async () => {
    const finalDy = pullY;
    startYRef.current = null;

    if (finalDy >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullY(PULL_THRESHOLD); // garde le spinner visible
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullY(0);
      }
    } else {
      setPullY(0);
    }
  }, [pullY, refreshing, onRefresh]);

  const progress = Math.min(1, pullY / PULL_THRESHOLD);
  const arrowRotate = progress * 180;

  return (
    <div
      ref={containerRef}
      className={`lg:contents relative ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: pullY > 0 ? "none" : "pan-y" }}
    >
      {/* Indicateur — visible uniquement sur mobile (lg:hidden) */}
      {(pullY > 0 || refreshing) && (
        <div
          className="lg:hidden absolute top-0 left-0 right-0 flex items-center justify-center pointer-events-none z-10"
          style={{
            height: `${pullY}px`,
            transition: refreshing ? "height 0.2s ease-out" : "none",
          }}
        >
          <div
            className="bg-white rounded-full shadow-md w-10 h-10 flex items-center justify-center border border-gray-100"
            style={{
              opacity: progress,
              transform: `scale(${0.6 + progress * 0.4})`,
              transition: refreshing ? "opacity 0.2s, transform 0.2s" : "none",
            }}
          >
            {refreshing ? (
              <Loader2 className="h-5 w-5 text-indigo-600 animate-spin" />
            ) : (
              <ArrowDown
                className={`h-5 w-5 transition-colors ${progress >= 1 ? "text-indigo-600" : "text-gray-400"}`}
                style={{ transform: `rotate(${arrowRotate}deg)`, transition: "transform 0.1s" }}
              />
            )}
          </div>
        </div>
      )}

      {/* Contenu — translation vers le bas selon le pull */}
      <div
        style={{
          transform: pullY > 0 || refreshing ? `translateY(${pullY}px)` : undefined,
          transition: refreshing || pullY === 0 ? "transform 0.2s ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
