import { Upload, TrendingDown, Clock, AlertTriangle, CheckCircle, Circle } from 'lucide-react';
import type { ChantierIAResult, EtapeRoadmap, LotChantier, ProjectMode, StatutArtisan } from '@/types/chantier-ia';
import { useState } from 'react';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtEuro(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)} k€`;
  return `${n} €`;
}

const MONTH_FR: Record<string, number> = {
  janvier: 0, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11,
};
const MONTH_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

function parseMois(mois: string): string | null {
  const parts = mois.toLowerCase().split(' ');
  if (parts.length !== 2) return null;
  const m = MONTH_FR[parts[0]] ?? -1;
  const y = parseInt(parts[1]);
  if (m < 0 || isNaN(y)) return null;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function formatMonthKey(key: string): string {
  const [year, mon] = key.split('-');
  return `${MONTH_SHORT[parseInt(mon) ?? 0]} ${year.slice(2)}`;
}

const PHASE_COLORS: Record<string, { bar: string; dot: string; text: string }> = {
  preparation:   { bar: 'bg-blue-400',   dot: 'bg-blue-400',   text: 'text-blue-700' },
  autorisations: { bar: 'bg-amber-400',  dot: 'bg-amber-400',  text: 'text-amber-700' },
  gros_oeuvre:   { bar: 'bg-orange-400', dot: 'bg-orange-400', text: 'text-orange-700' },
  second_oeuvre: { bar: 'bg-violet-400', dot: 'bg-violet-400', text: 'text-violet-700' },
  finitions:     { bar: 'bg-emerald-400',dot: 'bg-emerald-400',text: 'text-emerald-700' },
  reception:     { bar: 'bg-teal-400',   dot: 'bg-teal-400',   text: 'text-teal-700' },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  result: ChantierIAResult;
  chantierId: string | null;
  token?: string | null;
  onLotStatutChange?: (lotId: string, statut: StatutArtisan) => void;
  onProjectModeChange?: (mode: ProjectMode) => void;
}

// ── GANTT Component ───────────────────────────────────────────────────────────

function GanttChart({ roadmap }: { roadmap: EtapeRoadmap[] }) {
  // Construire la liste ordonnée des mois
  const monthSet = new Set<string>();
  for (const step of roadmap) {
    const key = parseMois(step.mois);
    if (key) monthSet.add(key);
  }
  const sortedMonths = Array.from(monthSet).sort();
  const total = sortedMonths.length || 1;

  if (roadmap.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        Aucune étape de planning disponible
      </div>
    );
  }

  // Grouper par phase pour les barres GANTT consolidées
  const phaseGroups: { phase: string; nom: string; steps: EtapeRoadmap[]; monthKeys: string[] }[] = [];
  const phaseSeen = new Map<string, number>();

  for (const step of roadmap) {
    const key = parseMois(step.mois);
    if (phaseSeen.has(step.phase)) {
      const idx = phaseSeen.get(step.phase)!;
      phaseGroups[idx].steps.push(step);
      if (key && !phaseGroups[idx].monthKeys.includes(key)) phaseGroups[idx].monthKeys.push(key);
    } else {
      phaseSeen.set(step.phase, phaseGroups.length);
      phaseGroups.push({
        phase: step.phase,
        nom: step.nom,
        steps: [step],
        monthKeys: key ? [key] : [],
      });
    }
  }

  return (
    <div className="overflow-x-auto">
      {/* Header: mois */}
      <div className="flex mb-3" style={{ minWidth: `${Math.max(total * 80, 320)}px` }}>
        <div className="w-40 shrink-0" />
        <div className="flex-1 flex">
          {sortedMonths.map(key => (
            <div key={key} className="flex-1 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              {formatMonthKey(key)}
            </div>
          ))}
        </div>
      </div>

      {/* Lignes phases */}
      <div className="space-y-2" style={{ minWidth: `${Math.max(total * 80, 320)}px` }}>
        {phaseGroups.map(group => {
          const colors = PHASE_COLORS[group.phase] ?? PHASE_COLORS.preparation;
          const isCurrent = group.steps.some(s => s.isCurrent);

          // Position du groupe dans le GANTT
          const monthIndices = group.monthKeys
            .map(k => sortedMonths.indexOf(k))
            .filter(i => i >= 0);
          const startIdx = monthIndices.length > 0 ? Math.min(...monthIndices) : 0;
          const endIdx   = monthIndices.length > 0 ? Math.max(...monthIndices) : 0;
          const leftPct  = (startIdx / total) * 100;
          const widthPct = ((endIdx - startIdx + 1) / total) * 100;

          return (
            <div key={group.phase} className="flex items-center">
              {/* Label */}
              <div className="w-40 shrink-0 pr-4">
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
                  <span className={`text-xs font-medium truncate ${isCurrent ? colors.text : 'text-gray-600'}`}>
                    {group.nom}
                  </span>
                </div>
                {group.steps.length > 1 && (
                  <p className="text-[10px] text-gray-400 pl-3 mt-0.5">{group.steps.length} étapes</p>
                )}
              </div>

              {/* Barre GANTT */}
              <div className="flex-1 h-7 relative">
                {/* Grille de fond */}
                <div className="absolute inset-0 flex">
                  {sortedMonths.map(key => (
                    <div key={key} className="flex-1 border-l border-gray-100 first:border-l-0" />
                  ))}
                </div>

                {/* Barre */}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-full ${colors.bar} ${
                    isCurrent ? 'ring-2 ring-offset-1 ring-blue-300 opacity-100' : 'opacity-70'
                  }`}
                  style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 8)}%` }}
                >
                  {isCurrent && (
                    <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow-sm" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function DashboardExpert({ result, onLotStatutChange, onProjectModeChange }: Props) {
  const [lots, setLots] = useState<LotChantier[]>(result.lots ?? []);

  const totalMin = lots.reduce((s, l) => s + (l.budget_min_ht ?? 0), 0);
  const totalMax = lots.reduce((s, l) => s + (l.budget_max_ht ?? 0), 0);
  const totalAvg = lots.reduce((s, l) => s + (l.budget_avg_ht ?? 0), 0);
  const rangeMin = totalMin > 0 ? totalMin : Math.round(result.budgetTotal * 0.85);
  const rangeMax = totalMax > 0 ? totalMax : Math.round(result.budgetTotal * 1.20);
  const budgetRef = totalAvg > 0 ? totalAvg : result.budgetTotal;

  const currentStep = result.roadmap.find(r => r.isCurrent);
  const lotsOk = lots.filter(l => l.statut === 'ok').length;
  const lotsAtrouve = lots.filter(l => l.statut === 'a_trouver').length;

  function handleStatutChange(lot: LotChantier, statut: StatutArtisan) {
    setLots(prev => prev.map(l => l.id === lot.id ? { ...l, statut } : l));
    if (!lot.id.startsWith('fallback-') && onLotStatutChange) {
      onLotStatutChange(lot.id, statut);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8fc] flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="text-2xl">{result.emoji}</span>
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 text-base leading-tight truncate">{result.nom}</h1>
              <p className="text-sm text-gray-400 mt-0.5">{fmtEuro(rangeMin)} – {fmtEuro(rangeMax)}</p>
            </div>
          </div>

          {/* KPIs header */}
          <div className="hidden sm:flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Durée</p>
              <p className="text-sm font-bold text-gray-900">{result.dureeEstimeeMois} mois</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Lots</p>
              <p className="text-sm font-bold text-gray-900">{lotsOk}/{lots.length} <span className="font-normal text-gray-400">artisans</span></p>
            </div>
            {lotsAtrouve > 0 && (
              <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                <AlertTriangle className="h-3.5 w-3.5" />
                {lotsAtrouve} lot{lotsAtrouve > 1 ? 's' : ''} sans artisan
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onProjectModeChange && (
              <button
                onClick={() => onProjectModeChange('flexible')}
                className="text-xs text-gray-400 hover:text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Changer de mode
              </button>
            )}
            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-colors">
              <Upload className="h-4 w-4" />
              Importer
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl w-full mx-auto px-6 py-8 space-y-6">

        {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              label: 'Budget total',
              value: fmtEuro(budgetRef),
              sub: `${fmtEuro(rangeMin)} – ${fmtEuro(rangeMax)}`,
              icon: <TrendingDown className="h-4 w-4 text-blue-500" />,
              bg: 'bg-blue-50',
            },
            {
              label: 'Durée estimée',
              value: `${result.dureeEstimeeMois} mois`,
              sub: currentStep ? currentStep.mois : '—',
              icon: <Clock className="h-4 w-4 text-violet-500" />,
              bg: 'bg-violet-50',
            },
            {
              label: 'Artisans OK',
              value: `${lotsOk}/${lots.length}`,
              sub: lotsAtrouve > 0 ? `${lotsAtrouve} à trouver` : 'Tous identifiés',
              icon: <CheckCircle className="h-4 w-4 text-emerald-500" />,
              bg: 'bg-emerald-50',
            },
            {
              label: 'Étapes restantes',
              value: `${result.roadmap.filter(r => !r.isCurrent).length}`,
              sub: currentStep ? `En cours : ${currentStep.nom}` : '—',
              icon: <Circle className="h-4 w-4 text-amber-500" />,
              bg: 'bg-amber-50',
            },
          ].map(({ label, value, sub, icon, bg }) => (
            <div key={label} className={`${bg} rounded-2xl p-4`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
                {icon}
              </div>
              <p className="text-xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{sub}</p>
            </div>
          ))}
        </div>

        {/* ── GANTT ─────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900 text-sm">Planning des travaux</h2>
          </div>
          <div className="px-5 py-5">
            <GanttChart roadmap={result.roadmap} />
          </div>
        </div>

        {/* ── Table des lots ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900 text-sm">Trésorerie par lot</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  {['Lot', 'Min', 'Moy.', 'Max', 'MO / Mat.', 'Statut'].map(h => (
                    <th key={h} className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-5 py-3 first:pl-5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lots.map((lot, i) => {
                  const hasPrice = lot.budget_min_ht || lot.budget_avg_ht || lot.budget_max_ht;
                  const moPct = lot.main_oeuvre_ht && lot.budget_avg_ht
                    ? Math.round((lot.main_oeuvre_ht / lot.budget_avg_ht) * 100)
                    : null;
                  return (
                    <tr key={lot.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors ${
                      i % 2 === 0 ? '' : 'bg-gray-50/30'
                    }`}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{lot.emoji ?? '🔧'}</span>
                          <span className="text-sm font-medium text-gray-800">{lot.nom}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">
                        {hasPrice ? fmtEuro(lot.budget_min_ht ?? 0) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900">
                        {hasPrice ? fmtEuro(lot.budget_avg_ht ?? 0) : <span className="font-normal text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">
                        {hasPrice ? fmtEuro(lot.budget_max_ht ?? 0) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {moPct != null ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden" style={{ width: '60px' }}>
                              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${moPct}%` }} />
                            </div>
                            <span className="text-xs text-gray-400">{moPct}% MO</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <select
                          value={lot.statut}
                          onChange={e => handleStatutChange(lot, e.target.value as StatutArtisan)}
                          disabled={lot.id.startsWith('fallback-')}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                        >
                          <option value="a_trouver">À trouver</option>
                          <option value="a_contacter">À contacter</option>
                          <option value="ok">OK</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}

                {/* Total row */}
                {lots.length > 0 && (
                  <tr className="bg-gray-50/60 border-t-2 border-gray-100">
                    <td className="px-5 py-3.5 text-sm font-bold text-gray-900">Total</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-gray-700">{fmtEuro(rangeMin)}</td>
                    <td className="px-5 py-3.5 text-sm font-bold text-gray-900">{fmtEuro(budgetRef)}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-gray-700">{fmtEuro(rangeMax)}</td>
                    <td className="px-5 py-3.5" />
                    <td className="px-5 py-3.5 text-xs text-gray-400">{lotsOk}/{lots.length} OK</td>
                  </tr>
                )}
              </tbody>
            </table>

            {lots.length === 0 && (
              <p className="py-10 text-center text-sm text-gray-400">Aucun lot défini pour ce chantier</p>
            )}
          </div>
        </div>

        {/* ── Prochaine action ──────────────────────────────────────────────── */}
        {result.prochaineAction.titre && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-3">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Prochaine action</p>
                  <p className="text-sm font-semibold text-gray-900">{result.prochaineAction.titre}</p>
                  <p className="text-xs text-gray-500 mt-1">{result.prochaineAction.detail}</p>
                </div>
                {result.prochaineAction.deadline && (
                  <span className="shrink-0 ml-auto text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                    {result.prochaineAction.deadline}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
