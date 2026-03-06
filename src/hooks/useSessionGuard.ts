import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Durée d'inactivité avant déconnexion automatique : 10 minutes */
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

/** Clé sessionStorage qui marque une session active dans cet onglet */
export const SESSION_ACTIVE_KEY = "vmd_session_active";

/**
 * Hook de protection de session :
 * 1. Vérifie le marqueur sessionStorage — si absent (nouvel onglet / nouveau navigateur), déconnecte
 * 2. Lance un timer d'inactivité de 10 min — réinitialisé par toute interaction utilisateur
 *
 * À appeler dans tous les composants de pages protégées (Dashboard, MonChantier, etc.)
 */
export function useSessionGuard(redirectPath = "/connexion") {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signOut = useCallback(async () => {
    sessionStorage.removeItem(SESSION_ACTIVE_KEY);
    await supabase.auth.signOut();
    const target = `${redirectPath}?redirect=${encodeURIComponent(window.location.pathname)}`;
    window.location.href = target;
  }, [redirectPath]);

  useEffect(() => {
    // 1. Vérifier le marqueur sessionStorage
    // sessionStorage est propre à chaque onglet et effacé à la fermeture du navigateur.
    // S'il est absent alors qu'une session Supabase existe dans localStorage →
    // c'est une session "résiduelle" d'un onglet/navigateur précédent → déconnexion.
    const sessionActive = sessionStorage.getItem(SESSION_ACTIVE_KEY);
    if (!sessionActive) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          // Session Supabase en localStorage mais pas de marqueur sessionStorage → déconnexion
          signOut();
        }
        // Pas de session du tout → les guards existants gèrent la redirection
      });
      return;
    }

    // 2. Timer d'inactivité : 10 min sans interaction → déconnexion
    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(signOut, INACTIVITY_TIMEOUT_MS);
    };

    const events = ["mousemove", "mousedown", "keypress", "touchstart", "scroll", "click"];
    events.forEach((e) => document.addEventListener(e, resetTimer, { passive: true }));
    resetTimer(); // Démarrer le timer dès le mount

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => document.removeEventListener(e, resetTimer));
    };
  }, [signOut]);
}
