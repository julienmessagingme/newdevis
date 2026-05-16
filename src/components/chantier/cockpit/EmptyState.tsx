/**
 * EmptyState — composant unifié pour les états "rien à afficher".
 *
 * Standardise le rendu des listes vides à travers le cockpit GMC.
 * Avant : chaque section avait son propre HTML, parfois sans guide d'action
 * → l'utilisateur ne sait pas quoi faire. Avec EmptyState, on impose :
 *   icone visuelle + titre clair + sous-titre explicatif + CTA optionnel.
 *
 * Pattern mobile-first : padding généreux, CTA pleine largeur tactile.
 *
 * Usage :
 *   <EmptyState
 *     icon="📋"
 *     title="Aucun mouvement enregistré"
 *     subtitle="Utilisez le bouton + pour ajouter une dépense ou un versement."
 *     cta={{ label: "+ Première dépense", onClick: () => setShowDepense(true) }}
 *   />
 */

interface EmptyStateProps {
  /** Emoji ou caractère unicode utilisé comme icône principale. */
  icon:       string;
  title:      string;
  subtitle?:  string;
  cta?: {
    label:    string;
    onClick:  () => void;
    variant?: "primary" | "secondary";
  };
  /** Taille du conteneur : compact (par défaut, ~250px) ou plein (h-full). */
  size?:      "compact" | "full";
  className?: string;
}

export default function EmptyState({
  icon, title, subtitle, cta, size = "compact", className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-6 ${
        size === "full" ? "h-full py-20" : "py-12 sm:py-16"
      } ${className}`}
    >
      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gray-50 flex items-center justify-center mb-4 shadow-sm">
        <span className="text-3xl sm:text-4xl select-none" aria-hidden="true">{icon}</span>
      </div>

      <p className="text-base sm:text-lg font-bold text-gray-800 mb-1.5 max-w-xs">{title}</p>

      {subtitle && (
        <p className="text-xs sm:text-sm text-gray-500 leading-relaxed max-w-sm mb-5">{subtitle}</p>
      )}

      {cta && (
        <button
          onClick={cta.onClick}
          className={`min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold touch-manipulation transition-colors active:scale-[0.98] ${
            cta.variant === "secondary"
              ? "border border-gray-200 text-gray-700 active:bg-gray-50"
              : "bg-indigo-600 text-white active:bg-indigo-700"
          }`}
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
