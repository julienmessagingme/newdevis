import { Pencil } from 'lucide-react';

function ProjectHeader({
  emoji, nom, hasAnyBudget, onAmeliorer,
}: {
  emoji: string; nom: string; hasAnyBudget: boolean; onAmeliorer?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 pb-1">
      <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center text-2xl shrink-0 shadow-sm">
        {emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-bold text-gray-900 text-xl leading-tight">{nom}</h2>
          {onAmeliorer && (
            <button
              onClick={onAmeliorer}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-full px-2.5 py-1 transition-all shrink-0"
              title="Modifier ou compléter la description du projet"
            >
              <Pencil className="h-3 w-3" />
              Modifier le projet
            </button>
          )}
        </div>
        <p className="text-sm text-gray-400 mt-0.5">
          {hasAnyBudget ? "Budget en cours d\u2019affinage" : "Budget en cours d\u2019estimation"}
        </p>
      </div>
    </div>
  );
}

export default ProjectHeader;
