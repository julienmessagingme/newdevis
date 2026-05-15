import { useEffect, useState } from "react";

/**
 * useIsMobile — Hook responsive simple pour router entre composants mobile / desktop.
 *
 * Pattern utilisé dans le cockpit GMC pour les écrans complexes (Budget / Trésorerie
 * / Échéancier) où la responsive Tailwind ne suffit pas. Permet d'écrire deux UX
 * indépendantes plutôt qu'un design desktop écrasé sur mobile.
 *
 * Usage :
 *   const isMobile = useIsMobile();
 *   if (isMobile) return <TresorerieMobile {...props} />;
 *   return <TresorerieDesktop {...props} />;
 *
 * Seuil par défaut : 768px (Tailwind `md` breakpoint). Surchargeable.
 *
 * Note SSR : retourne `false` au premier render (avant useEffect). Ne pose pas de
 * problème dans le cockpit qui est `client:only="react"` (aucun render SSR).
 */
export function useIsMobile(maxWidth = 767): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    // Compat anciens navigateurs : addListener / removeListener (Safari < 14)
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    const legacy = mq as MediaQueryList & {
      addListener?: (h: (e: MediaQueryListEvent) => void) => void;
      removeListener?: (h: (e: MediaQueryListEvent) => void) => void;
    };
    legacy.addListener?.(handler);
    return () => legacy.removeListener?.(handler);
  }, [maxWidth]);

  return isMobile;
}
