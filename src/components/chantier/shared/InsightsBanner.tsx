import { Sparkles, AlertTriangle, ArrowRight } from 'lucide-react';

// Bandeau persistant d'alertes IA (agent_insights non lues). Monté au niveau du cockpit,
// au-dessus du contenu, donc visible sur TOUTES les pages : un utilisateur qui n'ouvre
// jamais l'onglet Assistant voit quand même ses alertes. Rouge si une alerte critique
// est en attente, ambre sinon. Disparaît tout seul une fois les alertes lues.
//
// Desktop uniquement à l'usage (lg:) : sur mobile, la bannière basse au-dessus du
// BottomNav joue déjà ce rôle.
export default function InsightsBanner({
  unreadCount,
  hasCritical,
  onOpen,
}: {
  unreadCount: number;
  hasCritical: boolean;
  onOpen: () => void;
}) {
  if (unreadCount <= 0) return null;
  return (
    <button
      onClick={onOpen}
      className={`w-full flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors touch-manipulation ${
        hasCritical
          ? 'bg-red-50 border-red-200 hover:bg-red-100/70'
          : 'bg-amber-50 border-amber-200 hover:bg-amber-100/70'
      }`}
    >
      {hasCritical
        ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
        : <Sparkles className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />}
      <span className={`text-sm flex-1 min-w-0 ${hasCritical ? 'text-red-800' : 'text-amber-800'}`}>
        <span className="font-bold">{unreadCount} alerte{unreadCount > 1 ? 's' : ''}</span>
        {' '}de votre assistant IA {unreadCount > 1 ? 'sont' : 'est'} en attente.
      </span>
      <span className={`inline-flex items-center gap-1 text-xs font-bold shrink-0 ${hasCritical ? 'text-red-700' : 'text-amber-700'}`}>
        Voir <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
