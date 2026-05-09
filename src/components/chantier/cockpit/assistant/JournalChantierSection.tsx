import { ChevronLeft, ChevronRight, BookOpen, Loader2, Bot } from 'lucide-react';
import { useChantierJournal, type CalendarDot } from '@/hooks/useChantierJournal';

interface Props {
  chantierId: string | null;
  token: string | null | undefined;
  onGoToAssistant?: () => void;
}

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function formatDateFR(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-400',
  info: 'bg-green-400',
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-400',
  warning: 'bg-amber-300',
  info: 'bg-green-300',
};

export default function JournalChantierSection({ chantierId, token, onGoToAssistant }: Props) {
  const { entry, calendarDots, currentDate, loading, goToDate, goToPrev, goToNext } = useChantierJournal(chantierId, token);
  const today = formatDateISO(new Date());
  const isToday = currentDate === today;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <BookOpen className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-gray-900">Journal de chantier</h2>
      </div>

      {/* Navigation ← date → */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={goToPrev}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
          aria-label="Jour précédent"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>

        <div className="text-center">
          <p className="text-base font-semibold text-gray-900">{formatDateFR(currentDate)}</p>
          {isToday && <p className="text-xs text-primary font-medium">Aujourd'hui</p>}
        </div>

        <button
          onClick={goToNext}
          disabled={isToday}
          className={`p-2 rounded-xl transition-colors ${isToday ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-100'}`}
          aria-label="Jour suivant"
        >
          <ChevronRight className="h-5 w-5 text-gray-600" />
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
        </div>
      ) : entry ? (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          {/* Severity bar */}
          <div className={`h-1 ${SEVERITY_COLORS[entry.max_severity] ?? 'bg-green-400'}`} />

          {/* Body */}
          <div className="px-6 py-5">
            {/* Alerts count */}
            {entry.alerts_count > 0 && (
              <div className="flex items-center gap-2 mb-4">
                <span className={`w-2.5 h-2.5 rounded-full ${SEVERITY_COLORS[entry.max_severity] ?? 'bg-green-400'}`} />
                <span className="text-xs font-medium text-gray-500">
                  {entry.alerts_count} alerte{entry.alerts_count > 1 ? 's' : ''} ce jour
                </span>
              </div>
            )}

            {/* Markdown body rendered as simple text */}
            <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
              {entry.body.split('\n').map((line, i) => {
                if (!line.trim()) return <br key={i} />;
                if (line.startsWith('# ')) return <h3 key={i} className="text-base font-semibold text-gray-900 mt-4 mb-2">{line.slice(2)}</h3>;
                if (line.startsWith('## ')) return <h4 key={i} className="text-sm font-semibold text-gray-800 mt-3 mb-1">{line.slice(3)}</h4>;
                if (line.startsWith('- ')) return <li key={i} className="ml-4 list-disc">{line.slice(2)}</li>;
                if (line.startsWith('> ')) return <blockquote key={i} className="border-l-2 border-primary/30 pl-3 italic text-gray-500">{line.slice(2)}</blockquote>;
                return <p key={i} className="mb-1">{line}</p>;
              })}
            </div>

            {/* AI attribution */}
            <div className="mt-5 pt-4 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
              <Bot className="h-3.5 w-3.5" />
              <span>Rédigé par le Pilote de Chantier IA — {new Date(entry.updated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        </div>
      ) : (
        /* No entry for this date */
        <div className="text-center py-16">
          <BookOpen className="h-10 w-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Rien à signaler ce jour-là</p>
          {isToday && (
            <p className="text-gray-300 text-xs mt-1">Le journal du jour sera rédigé ce soir à 19h</p>
          )}
        </div>
      )}

      {/* Mini calendar strip (last 14 days) */}
      <div className="mt-6 flex items-center justify-center gap-1.5">
        {Array.from({ length: 14 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (13 - i));
          const dateStr = formatDateISO(d);
          const dot = calendarDots.find(cd => cd.journal_date === dateStr);
          const isActive = dateStr === currentDate;

          return (
            <button
              key={dateStr}
              onClick={() => goToDate(dateStr)}
              className={`flex flex-col items-center gap-0.5 px-1 py-1 rounded-lg transition-colors ${
                isActive ? 'bg-primary/10' : 'hover:bg-gray-50'
              }`}
              title={formatDateFR(dateStr)}
            >
              <span className={`text-[9px] font-medium ${isActive ? 'text-primary' : 'text-gray-400'}`}>
                {d.getDate()}
              </span>
              <span className={`w-1.5 h-1.5 rounded-full ${
                dot ? (SEVERITY_DOT[dot.max_severity] ?? 'bg-green-300') : 'bg-gray-200'
              }`} />
            </button>
          );
        })}
      </div>

      {/* Link to assistant */}
      {onGoToAssistant && (
        <div className="mt-6 text-center">
          <button onClick={onGoToAssistant} className="text-xs text-primary hover:underline">
            Voir l'assistant chantier
          </button>
        </div>
      )}
    </div>
  );
}
