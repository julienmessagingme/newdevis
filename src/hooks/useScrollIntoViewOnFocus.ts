import { useEffect, useRef } from "react";

/**
 * useScrollIntoViewOnFocus — scroll un input/textarea dans la zone visible
 * quand il prend le focus sur mobile.
 *
 * Sur iOS et Android, l'apparition du clavier virtuel peut masquer l'input
 * actif s'il est en bas d'écran. Le navigateur ne corrige pas toujours.
 * Ce hook attache un listener focus qui call `scrollIntoView({ block: "center" })`
 * avec un petit délai (le temps que le clavier ait commencé à apparaître).
 *
 * Usage :
 *   const inputRef = useScrollIntoViewOnFocus<HTMLInputElement>();
 *   return <input ref={inputRef} ... />
 *
 * Désactivé sur desktop (> 1024px) où le clavier n'apparaît pas.
 */
export function useScrollIntoViewOnFocus<T extends HTMLElement = HTMLInputElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === "undefined") return;
    // Mobile only (< 1024 = avant lg Tailwind)
    if (window.innerWidth >= 1024) return;

    const handler = () => {
      // Petit délai : le clavier mobile met ~200-300ms à apparaître sur iOS,
      // et le viewport-relative-units viewport-resize event suit. On scroll
      // après pour que le navigateur ait calculé la nouvelle viewport.
      setTimeout(() => {
        try {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch { /* no-op */ }
      }, 350);
    };

    el.addEventListener("focus", handler);
    return () => el.removeEventListener("focus", handler);
  }, []);

  return ref;
}
