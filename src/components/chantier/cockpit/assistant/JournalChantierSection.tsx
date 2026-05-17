/**
 * JournalChantierSection — Journal de chantier.
 *
 * La journée est découpée en 2 blocs :
 *  1. Récit du jour    → le digest narratif rédigé par l'IA (chantier_journal.body)
 *  2. Timeline         → tous les événements horodatés de la journée (dépôts de
 *                        documents, changements de statut, décisions IA, alertes)
 *                        — endpoint /journal/timeline. PAS les messages WhatsApp.
 *
 * Export PDF + Excel (CSV), pour le jour affiché OU une plage de dates.
 */
import { useState, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, BookOpen, Loader2, Bot, FileText, FileSpreadsheet,
  AlertTriangle, RefreshCw, X, CalendarRange,
} from 'lucide-react';
import { useChantierJournal } from '@/hooks/useChantierJournal';
import { exportTimelinePDF, exportTimelineCSV, type TimelineEvent } from '@/lib/chantier/journalExport';

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
function formatDayShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}
function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function dayBoundsISO(dateStr: string): { from: string; to: string } {
  // Bornes à minuit LOCALE — le fuseau du client = celui de l'utilisateur.
  const start = new Date(dateStr + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500', warning: 'bg-amber-400', info: 'bg-green-400',
};
const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-400', warning: 'bg-amber-300', info: 'bg-green-300',
};

const CAT_META: Record<string, { Icon: typeof RefreshCw; cls: string; label: string }> = {
  status_change: { Icon: RefreshCw,    cls: 'bg-blue-50 text-blue-600',     label: 'Statut' },
  document:      { Icon: FileText,     cls: 'bg-slate-100 text-slate-600',  label: 'Document' },
  alert:         { Icon: AlertTriangle, cls: 'bg-amber-50 text-amber-600',  label: 'Alerte' },
  decision:      { Icon: Bot,          cls: 'bg-indigo-50 text-indigo-600', label: 'Décision IA' },
};
const ACTOR_LABEL: Record<string, string> = { user: 'Vous', agent: 'IA', system: 'Auto' };

function eventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function JournalChantierSection({ chantierId, token, onGoToAssistant }: Props) {
  const { entry, calendarDots, currentDate, loading, goToDate, goToPrev, goToNext } =
    useChantierJournal(chantierId, token);
  const today = formatDateISO(new Date());
  const isToday = currentDate === today;

  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // ── Timeline du jour affiché ────────────────────────────────────────────────
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [chantierNom, setChantierNom] = useState('Chantier');

  useEffect(() => {
    if (!chantierId || !token) { setTimelineLoading(false); return; }
    let cancelled = false;
    setTimelineLoading(true);
    const { from, to } = dayBoundsISO(currentDate);
    fetch(`/api/chantier/${chantierId}/journal/timeline?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers: authHeader })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => {
        if (cancelled) return;
        setTimeline(data.events ?? []);
        setChantierNom(data.chantier_nom ?? 'Chantier');
      })
      .catch(() => { if (!cancelled) setTimeline([]); })
      .finally(() => { if (!cancelled) setTimelineLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chantierId, token, currentDate]);

  // ── Export du jour affiché ──────────────────────────────────────────────────
  const exportDay = (format: 'pdf' | 'csv') => {
    const input = {
      chantierNom,
      periodLabel: formatDayShort(currentDate),
      digest: entry?.body ?? null,
      events: timeline,
    };
    if (format === 'pdf') exportTimelinePDF(input);
    else exportTimelineCSV(input);
  };

  // ── Export d'une plage de dates ─────────────────────────────────────────────
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return formatDateISO(d);
  });
  const [rangeTo, setRangeTo] = useState(today);
  const [rangeBusy, setRangeBusy] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const exportRange = async (format: 'pdf' | 'csv') => {
    if (!chantierId || !token) return;
    if (rangeFrom > rangeTo) { setRangeError('La date de début doit précéder la date de fin.'); return; }
    setRangeBusy(true);
    setRangeError(null);
    try {
      const from = new Date(rangeFrom + 'T00:00:00').toISOString();
      const endExclusive = new Date(rangeTo + 'T00:00:00');
      endExclusive.setDate(endExclusive.getDate() + 1);
      const to = endExclusive.toISOString();
      const res = await fetch(`/api/chantier/${chantierId}/journal/timeline?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers: authHeader });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const input = {
        chantierNom: data.chantier_nom ?? chantierNom,
        periodLabel: `du ${formatDayShort(rangeFrom)} au ${formatDayShort(rangeTo)}`,
        digest: null,
        events: (data.events ?? []) as TimelineEvent[],
      };
      if (format === 'pdf') exportTimelinePDF(input);
      else exportTimelineCSV(input);
      setRangeOpen(false);
    } catch {
      setRangeError('Échec de l\'export. Réessaie.');
    } finally {
      setRangeBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header + exports */}
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-gray-900">Journal de chantier</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => exportDay('pdf')}
            className="flex items-center gap-1.5 px-2.5 h-9 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            title="Exporter le jour affiché en PDF"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" /> PDF
          </button>
          <button
            onClick={() => exportDay('csv')}
            className="flex items-center gap-1.5 px-2.5 h-9 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            title="Exporter le jour affiché en Excel (CSV)"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" /> Excel
          </button>
          <button
            onClick={() => { setRangeError(null); setRangeOpen(true); }}
            className="flex items-center gap-1.5 px-2.5 h-9 rounded-lg bg-primary/10 text-[12px] font-medium text-primary hover:bg-primary/15 transition-colors"
            title="Exporter une période"
          >
            <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" /> Période…
          </button>
        </div>
      </div>

      {/* Navigation ← date → */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={goToPrev} className="p-2 rounded-xl hover:bg-gray-100 transition-colors" aria-label="Jour précédent">
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

      {/* ── Bloc 1 — Récit du jour ──────────────────────────────────────────── */}
      <section className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden mb-5">
        <div className={`h-1 ${SEVERITY_COLORS[entry?.max_severity ?? 'info'] ?? 'bg-green-400'}`} />
        <div className="px-6 py-5">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-800">Récit du jour</h3>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
            </div>
          ) : entry ? (
            <>
              {entry.alerts_count > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${SEVERITY_COLORS[entry.max_severity] ?? 'bg-green-400'}`} />
                  <span className="text-xs font-medium text-gray-500">
                    {entry.alerts_count} alerte{entry.alerts_count > 1 ? 's' : ''} ce jour
                  </span>
                </div>
              )}
              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                {entry.body.split('\n').map((line, i) => {
                  if (!line.trim()) return <br key={i} />;
                  if (line.startsWith('# ')) return <h3 key={i} className="text-base font-semibold text-gray-900 mt-4 mb-2">{line.slice(2)}</h3>;
                  if (line.startsWith('## ')) return <h4 key={i} className="text-sm font-semibold text-gray-800 mt-3 mb-1">{line.slice(3)}</h4>;
                  if (line.startsWith('### ')) return <h5 key={i} className="text-[13px] font-semibold text-gray-700 mt-2 mb-1">{line.slice(4)}</h5>;
                  if (line.startsWith('- ')) return <li key={i} className="ml-4 list-disc">{line.slice(2)}</li>;
                  if (line.startsWith('> ')) return <blockquote key={i} className="border-l-2 border-primary/30 pl-3 italic text-gray-500">{line.slice(2)}</blockquote>;
                  return <p key={i} className="mb-1">{line}</p>;
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
                <Bot className="h-3.5 w-3.5" />
                <span>Rédigé par le Pilote de Chantier IA — {new Date(entry.updated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 py-2">
              {isToday ? 'Le récit du jour sera rédigé ce soir à 19h.' : 'Aucun récit rédigé ce jour-là.'}
            </p>
          )}
        </div>
      </section>

      {/* ── Bloc 2 — Timeline horodatée ─────────────────────────────────────── */}
      <section className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarRange className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-800">Timeline de la journée</h3>
            {!timelineLoading && (
              <span className="text-[11px] text-gray-400">
                {timeline.length} événement{timeline.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {timelineLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
            </div>
          ) : timeline.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">Aucun événement enregistré ce jour-là.</p>
          ) : (
            <ol className="relative border-l border-gray-150 ml-2">
              {timeline.map((ev, i) => {
                const meta = CAT_META[ev.category] ?? CAT_META.document;
                const Icon = meta.Icon;
                return (
                  <li key={i} className="mb-4 ml-5 last:mb-0">
                    <span className={`absolute -left-[13px] flex items-center justify-center w-6 h-6 rounded-full ring-4 ring-white ${meta.cls}`}>
                      <Icon className="h-3 w-3" aria-hidden="true" />
                    </span>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <time className="text-[11px] font-bold tabular-nums text-gray-500">{eventTime(ev.occurred_at)}</time>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${meta.cls}`}>
                        {meta.label}
                      </span>
                      <span className="text-[9px] font-medium text-gray-400">· {ACTOR_LABEL[ev.actor] ?? ev.actor}</span>
                    </div>
                    <p className="text-[13px] text-gray-800 leading-snug mt-0.5">{ev.label}</p>
                    {ev.detail && (
                      <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{ev.detail}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>

      {/* Mini calendrier (14 derniers jours) */}
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
              className={`flex flex-col items-center gap-0.5 px-1 py-1 rounded-lg transition-colors ${isActive ? 'bg-primary/10' : 'hover:bg-gray-50'}`}
              title={formatDateFR(dateStr)}
            >
              <span className={`text-[9px] font-medium ${isActive ? 'text-primary' : 'text-gray-400'}`}>{d.getDate()}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${dot ? (SEVERITY_DOT[dot.max_severity] ?? 'bg-green-300') : 'bg-gray-200'}`} />
            </button>
          );
        })}
      </div>

      {onGoToAssistant && (
        <div className="mt-6 text-center">
          <button onClick={onGoToAssistant} className="text-xs text-primary hover:underline">
            Voir l'assistant chantier
          </button>
        </div>
      )}

      {/* ── Modale export période ───────────────────────────────────────────── */}
      {rangeOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => !rangeBusy && setRangeOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Exporter une période du journal"
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(92vw,420px)] bg-white rounded-2xl shadow-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900">Exporter une période</h3>
              <button
                onClick={() => !rangeBusy && setRangeOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <label className="text-[12px] font-medium text-gray-600">
                Du
                <input
                  type="date"
                  value={rangeFrom}
                  max={today}
                  onChange={e => setRangeFrom(e.target.value)}
                  className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="text-[12px] font-medium text-gray-600">
                Au
                <input
                  type="date"
                  value={rangeTo}
                  max={today}
                  onChange={e => setRangeTo(e.target.value)}
                  className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
            </div>

            {rangeError && (
              <p className="text-[12px] text-red-600 mb-3">{rangeError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => exportRange('pdf')}
                disabled={rangeBusy}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {rangeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
                PDF
              </button>
              <button
                onClick={() => exportRange('csv')}
                disabled={rangeBusy}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {rangeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
                Excel
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
              La timeline est précise depuis le 17/05/2026. Avant cette date : dépôts de documents, alertes et décisions IA uniquement (pas les changements de statut manuels).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
