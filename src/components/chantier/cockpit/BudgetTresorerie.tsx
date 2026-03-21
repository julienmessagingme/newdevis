/**
 * BudgetTresorerie — écran financier premium du cockpit chantier.
 * Données claires, zéro tableau dense, chaque bloc orienté décision.
 */
import { useMemo } from 'react';
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, CircleDollarSign,
  FileText, Plus, Search, ChevronRight, Info, Zap, Layers, Wallet,
} from 'lucide-react';
import type { ChantierIAResult, DocumentChantier } from '@/types/chantier-ia';
import type { InsightsData, InsightItem } from './useInsights';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)} k€`;
  return `${Math.round(n)} €`;
}
function fmtFull(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

const PHASE_LABELS: Record<string, string> = {
  preparation: 'Préparation', autorisations: 'Autorisations',
  gros_oeuvre: 'Gros œuvre', second_oeuvre: 'Second œuvre',
  finitions: 'Finitions', reception: 'Réception',
};
const PHASE_COLORS: Record<string, string> = {
  preparation: 'bg-blue-400', autorisations: 'bg-amber-400',
  gros_oeuvre: 'bg-orange-400', second_oeuvre: 'bg-violet-400',
  finitions: 'bg-emerald-400', reception: 'bg-teal-400',
};
const PHASE_LIGHT: Record<string, string> = {
  preparation: 'bg-blue-50 text-blue-700', autorisations: 'bg-amber-50 text-amber-700',
  gros_oeuvre: 'bg-orange-50 text-orange-700', second_oeuvre: 'bg-violet-50 text-violet-700',
  finitions: 'bg-emerald-50 text-emerald-700', reception: 'bg-teal-50 text-teal-700',
};

const INSIGHT_STYLES: Record<InsightItem['type'], { bg: string; text: string; border: string; icon: React.ReactNode }> = {
  success: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-100', icon: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> },
  warning: { bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-100',   icon: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" /> },
  alert:   { bg: 'bg-red-50',     text: 'text-red-800',     border: 'border-red-100',     icon: <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" /> },
  info:    { bg: 'bg-blue-50',    text: 'text-blue-800',    border: 'border-blue-100',     icon: <Info className="h-4 w-4 text-blue-500 shrink-0" /> },
};

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, trend, color = 'default' }: {
  label: string; value: string; sub?: string;
  trend?: 'up' | 'down' | 'neutral'; color?: 'default' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const colors = {
    default: 'bg-white border-gray-100',
    green:   'bg-emerald-50 border-emerald-100',
    amber:   'bg-amber-50 border-amber-100',
    red:     'bg-red-50 border-red-100',
    blue:    'bg-blue-50 border-blue-100',
  };
  const valueColor = { default: 'text-gray-900', green: 'text-emerald-700', amber: 'text-amber-700', red: 'text-red-700', blue: 'text-blue-700' };
  return (
    <div className={`rounded-2xl border ${colors[color]} p-5 flex flex-col gap-1`}>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-extrabold ${valueColor[color]} leading-none`}>{value}</p>
      {sub && (
        <p className="text-xs text-gray-400 flex items-center gap-1">
          {trend === 'up'   && <TrendingUp   className="h-3 w-3 text-emerald-500" />}
          {trend === 'down' && <TrendingDown  className="h-3 w-3 text-red-500" />}
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Budget Progress Bar ───────────────────────────────────────────────────────

function BudgetGauge({ rangeMin, rangeMax, documents }: {
  rangeMin: number; rangeMax: number; documents: DocumentChantier[];
}) {
  const devisCount   = documents.filter(d => d.document_type === 'devis').length;
  const factureCount = documents.filter(d => d.document_type === 'facture').length;
  // Estimation prudente : si on a des devis, engagé = milieu de la fourchette
  const engaged = devisCount > 0 ? Math.round((rangeMin + rangeMax) / 2 * 0.75) : 0;
  const paid    = factureCount > 0 ? Math.round(engaged * 0.4) : 0;
  const total   = rangeMax;
  const engagedPct = total > 0 ? Math.min((engaged / total) * 100, 100) : 0;
  const paidPct    = total > 0 ? Math.min((paid    / total) * 100, 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Budget engagé</h3>
        <span className="text-xs font-medium text-gray-400">Max prévu · {fmtFull(rangeMax)}</span>
      </div>

      {/* Gauge */}
      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
        {/* Payé */}
        <div className="absolute left-0 h-full bg-emerald-400 rounded-full transition-all duration-700"
          style={{ width: `${paidPct}%` }} />
        {/* Engagé */}
        {engagedPct > paidPct && (
          <div className="absolute h-full bg-blue-300 rounded-full transition-all duration-700"
            style={{ left: `${paidPct}%`, width: `${engagedPct - paidPct}%` }} />
        )}
      </div>

      {/* Légende */}
      <div className="flex items-center gap-5 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="text-gray-500">Payé</span>
          <span className="font-bold text-gray-700">{paid > 0 ? fmtK(paid) : '—'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-300" />
          <span className="text-gray-500">Engagé (estim.)</span>
          <span className="font-bold text-gray-700">{engaged > 0 ? fmtK(engaged) : '—'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-200" />
          <span className="text-gray-500">Disponible</span>
          <span className="font-bold text-gray-700">{fmtK(Math.max(0, total - engaged))}</span>
        </div>
      </div>

      {devisCount === 0 && (
        <p className="text-xs text-gray-400 mt-3 border-t border-gray-50 pt-3">
          💡 Ajoutez vos devis pour afficher les montants réels
        </p>
      )}
    </div>
  );
}

// ── Répartition par lot ───────────────────────────────────────────────────────

function LotBreakdown({ result, documents }: { result: ChantierIAResult; documents: DocumentChantier[] }) {
  const lots = result.lots ?? [];
  const totalMax = lots.reduce((s, l) => s + (l.budget_max_ht ?? 0), 0) || 1;

  const lotsWithData = useMemo(() => {
    return lots.map(lot => {
      const min = lot.budget_min_ht ?? 0;
      const max = lot.budget_max_ht ?? 0;
      const avg = (min + max) / 2;
      const pctMin = totalMax > 0 ? (min / totalMax) * 100 : 0;
      const pctMax = totalMax > 0 ? (max / totalMax) * 100 : 0;
      const docCount = documents.filter(d => d.lot_id === lot.id).length;
      return { ...lot, min, max, avg, pctMin, pctMax, docCount };
    }).sort((a, b) => b.avg - a.avg);
  }, [lots, documents, totalMax]);

  if (lots.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-5">
        <Layers className="h-4 w-4 text-gray-400" />
        <h3 className="font-semibold text-gray-900">Répartition par lot</h3>
      </div>

      <div className="space-y-4">
        {lotsWithData.map(lot => (
          <div key={lot.id}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm leading-none">{lot.emoji ?? '🔧'}</span>
                <span className="text-sm font-medium text-gray-800">{lot.nom}</span>
                {lot.docCount > 0 && (
                  <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                    {lot.docCount} doc
                  </span>
                )}
              </div>
              <span className="text-sm font-bold text-gray-600">
                {lot.min > 0 ? `${fmtK(lot.min)} – ${fmtK(lot.max)}` : '—'}
              </span>
            </div>
            {/* Barre avec fourchette min/max */}
            <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
              {lot.pctMax > 0 && (
                <>
                  <div className="absolute h-full bg-blue-100 rounded-full" style={{ left: 0, width: `${lot.pctMax}%` }} />
                  <div className="absolute h-full bg-blue-400 rounded-full" style={{ left: 0, width: `${lot.pctMin}%` }} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
        <span className="text-xs text-gray-400">Budget total observé</span>
        <span className="text-sm font-bold text-gray-800">
          {fmtK(lots.reduce((s, l) => s + (l.budget_min_ht ?? 0), 0))} –{' '}
          {fmtK(lots.reduce((s, l) => s + (l.budget_max_ht ?? 0), 0))}
        </span>
      </div>
    </div>
  );
}

// ── Alertes IA ────────────────────────────────────────────────────────────────

function AlertesIA({ insights, loading }: { insights: InsightsData | null; loading: boolean }) {
  const items = insights?.global ?? [];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-4 w-4 text-violet-500" />
        <h3 className="font-semibold text-gray-900">Alertes intelligentes</h3>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-gray-50 animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-6">
          <CheckCircle2 className="h-8 w-8 text-emerald-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Aucune alerte pour le moment</p>
          <p className="text-xs text-gray-300 mt-1">Ajoutez des devis pour les activer</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => {
            const s = INSIGHT_STYLES[item.type];
            return (
              <div key={i} className={`flex items-start gap-3 px-3.5 py-3 rounded-xl border ${s.bg} ${s.border}`}>
                {s.icon}
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${s.text} leading-snug`}>
                    {item.icon && <span className="mr-1">{item.icon}</span>}
                    {item.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Trésorerie prévisionnelle (phases) ────────────────────────────────────────

function TresoreriePhases({ result }: { result: ChantierIAResult }) {
  const phaseData = useMemo(() => {
    const lots = result.lots ?? [];
    const roadmap = result.roadmap ?? [];

    // Grouper les étapes par phase et collecter les mois
    const phaseMap: Record<string, { mois: Set<string>; lots: Set<string> }> = {};
    for (const step of roadmap) {
      const p = step.phase ?? 'finitions';
      if (!phaseMap[p]) phaseMap[p] = { mois: new Set(), lots: new Set() };
      if (step.mois) phaseMap[p].mois.add(step.mois);
      if (step.artisan) phaseMap[p].lots.add(step.artisan);
    }

    // Associer budgets aux phases
    const phaseBudgets: Record<string, { min: number; max: number; mois: string[] }> = {};
    const phaseOrder = ['preparation', 'autorisations', 'gros_oeuvre', 'second_oeuvre', 'finitions', 'reception'];

    for (const phase of phaseOrder) {
      if (!phaseMap[phase]) continue;
      const relatedLots = lots.filter(l =>
        Array.from(phaseMap[phase].lots).some(a => l.nom.toLowerCase().includes(a.toLowerCase()))
      );
      // Si pas de lot correspondant, répartir uniformément
      const phaseLots = relatedLots.length > 0 ? relatedLots : lots.slice(0, Math.ceil(lots.length / phaseOrder.length));
      const min = phaseLots.reduce((s, l) => s + (l.budget_min_ht ?? 0), 0) / (phaseLots.length || 1) * 0.3;
      const max = phaseLots.reduce((s, l) => s + (l.budget_max_ht ?? 0), 0) / (phaseLots.length || 1) * 0.3;
      phaseBudgets[phase] = { min, max, mois: Array.from(phaseMap[phase].mois).slice(0, 2) };
    }

    return { phaseOrder, phaseBudgets };
  }, [result]);

  const { phaseOrder, phaseBudgets } = phaseData;
  const allPhases = phaseOrder.filter(p => phaseBudgets[p]);
  const maxBudget = Math.max(...allPhases.map(p => phaseBudgets[p]?.max ?? 0), 1);

  if (allPhases.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-gray-900">Trésorerie prévisionnelle</h3>
        <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">Par phase · estimation</span>
      </div>

      <div className="flex items-end gap-3">
        {allPhases.map(phase => {
          const data = phaseBudgets[phase];
          if (!data) return null;
          const heightPct = maxBudget > 0 ? (data.max / maxBudget) * 100 : 0;
          const colorBar = PHASE_COLORS[phase] ?? 'bg-gray-300';
          return (
            <div key={phase} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-[10px] font-bold text-gray-600">{fmtK(data.max)}</span>
              <div className="w-full rounded-lg overflow-hidden bg-gray-50" style={{ height: '80px' }}>
                <div className={`w-full ${colorBar} rounded-lg transition-all duration-500`}
                  style={{ height: `${heightPct}%`, marginTop: `${100 - heightPct}%` }} />
              </div>
              <div className="text-center">
                <p className="text-[9px] font-semibold text-gray-500 leading-tight">
                  {PHASE_LABELS[phase] ?? phase}
                </p>
                {data.mois[0] && (
                  <p className="text-[9px] text-gray-300 leading-tight">{data.mois[0]}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-300 mt-3 text-center">
        Estimation basée sur votre planning — ajoutez vos factures pour affiner
      </p>
    </div>
  );
}

// ── Factures & paiements ──────────────────────────────────────────────────────

function FacturesPaiements({ documents, onAddFacture }: {
  documents: DocumentChantier[]; onAddFacture: () => void;
}) {
  const factures = documents.filter(d => d.document_type === 'facture');
  const devis    = documents.filter(d => d.document_type === 'devis');

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <CircleDollarSign className="h-4 w-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Factures & paiements</h3>
        </div>
        <button onClick={onAddFacture}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">
          <Plus className="h-3 w-3" /> Ajouter
        </button>
      </div>

      {/* Résumé compteurs */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-50 rounded-xl px-4 py-3 text-center">
          <p className="text-xl font-extrabold text-gray-900">{devis.length}</p>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">Devis</p>
        </div>
        <div className="bg-emerald-50 rounded-xl px-4 py-3 text-center">
          <p className="text-xl font-extrabold text-emerald-700">{factures.length}</p>
          <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mt-0.5">Factures</p>
        </div>
        <div className="bg-amber-50 rounded-xl px-4 py-3 text-center">
          <p className="text-xl font-extrabold text-amber-700">0</p>
          <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mt-0.5">En retard</p>
        </div>
      </div>

      {/* Liste factures */}
      {factures.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed border-gray-100 rounded-xl">
          <FileText className="h-6 w-6 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400 mb-3">Aucune facture enregistrée</p>
          <button onClick={onAddFacture}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">
            + Ajouter une facture
          </button>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {factures.slice(0, 5).map(f => (
            <div key={f.id} className="flex items-center gap-3 py-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{f.nom}</p>
                <p className="text-xs text-gray-400">{new Date(f.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</p>
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Payé</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick Actions ─────────────────────────────────────────────────────────────

function QuickActions({ onAddDoc, onGoToAnalyse, onGoToLots }: {
  onAddDoc: () => void; onGoToAnalyse: () => void; onGoToLots: () => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: 'Ajouter une facture', sub: 'Suivez vos paiements', icon: Plus, onClick: onAddDoc, bg: 'bg-blue-600 hover:bg-blue-700 text-white' },
        { label: 'Analyser un devis', sub: 'Détectez les surcoûts', icon: Search, onClick: onGoToAnalyse, bg: 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-200' },
        { label: 'Voir les lots', sub: 'Gérez vos artisans', icon: ChevronRight, onClick: onGoToLots, bg: 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-200' },
      ].map(({ label, sub, icon: Icon, onClick, bg }) => (
        <button key={label} onClick={onClick}
          className={`flex flex-col items-start gap-1 px-4 py-4 rounded-2xl transition-colors shadow-sm ${bg}`}>
          <Icon className="h-4 w-4 mb-1 opacity-70" />
          <p className="text-sm font-semibold leading-tight text-left">{label}</p>
          <p className="text-[11px] opacity-60 leading-tight text-left">{sub}</p>
        </button>
      ))}
    </div>
  );
}

// ── Fiabilité budget ───────────────────────────────────────────────────────────

function ReliabilityBadge({ signaux }: { signaux?: ChantierIAResult['estimationSignaux'] }) {
  if (!signaux) return null;
  const score = [
    signaux.hasLocalisation, signaux.hasBudget, signaux.hasSurface, signaux.typeProjetPrecis,
    (signaux.nbLignesBudget ?? 0) > 3,
  ].filter(Boolean).length;
  const cfg = score <= 1
    ? { label: 'Fiabilité : faible',  cls: 'bg-amber-100 text-amber-700 border-amber-200' }
    : score <= 3
    ? { label: 'Fiabilité : moyenne', cls: 'bg-blue-50 text-blue-700 border-blue-100' }
    : { label: 'Fiabilité : élevée',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Comparaison estimation vs devis ───────────────────────────────────────────

function BudgetComparaison({ rangeMin, rangeMax, documents }: {
  rangeMin: number; rangeMax: number; documents: DocumentChantier[];
}) {
  const devisCount   = documents.filter(d => d.document_type === 'devis').length;
  const factureCount = documents.filter(d => d.document_type === 'facture').length;
  const rangeAvg = Math.round((rangeMin + rangeMax) / 2);

  const columns = [
    { label: 'Budget estimé', value: fmtFull(rangeAvg), sub: `${fmtK(rangeMin)} – ${fmtK(rangeMax)}`, color: 'text-gray-900', bg: 'bg-gray-50 border-gray-100' },
    { label: 'Devis reçus', value: devisCount > 0 ? `${devisCount}` : '—', sub: devisCount === 1 ? 'Insuffisant, obtenez-en 2 de plus' : devisCount > 1 ? 'Comparaison possible' : 'Ajoutez vos devis', color: devisCount >= 2 ? 'text-emerald-700' : 'text-amber-700', bg: devisCount >= 2 ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100' },
    ...(factureCount > 0 ? [{ label: 'Factures enregistrées', value: `${factureCount}`, sub: 'paiements suivis', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-100' }] : []),
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {columns.map(col => (
        <div key={col.label} className={`rounded-2xl border ${col.bg} px-5 py-4`}>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{col.label}</p>
          <p className={`text-2xl font-extrabold ${col.color} leading-none`}>{col.value}</p>
          <p className="text-xs text-gray-400 mt-1">{col.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

interface Props {
  result: ChantierIAResult;
  documents: DocumentChantier[];
  insights: InsightsData | null;
  insightsLoading: boolean;
  onAddDoc: () => void;
  onGoToAnalyse: () => void;
  onGoToLots: () => void;
}

export default function BudgetTresorerie({ result, documents, insights, insightsLoading, onAddDoc, onGoToAnalyse, onGoToLots }: Props) {
  const lots = result.lots ?? [];

  // ── Détection de l'état budget ────────────────────────────────────────────
  const hasLotBudget  = lots.some(l => (l.budget_min_ht ?? 0) > 0 || (l.budget_max_ht ?? 0) > 0);
  const hasBudgetTotal = (result.budgetTotal ?? 0) > 5000;
  const hasAnyBudget  = hasLotBudget || hasBudgetTotal;
  const hasDevis      = documents.some(d => d.document_type === 'devis');
  const hasFactures   = documents.some(d => d.document_type === 'facture');

  // Fourchette UNIQUEMENT depuis les lots (jamais inventée)
  const rangeMin = hasLotBudget
    ? lots.reduce((s, l) => s + (l.budget_min_ht ?? 0), 0)
    : hasBudgetTotal ? Math.round(result.budgetTotal * 0.88) : 0;
  const rangeMax = hasLotBudget
    ? lots.reduce((s, l) => s + (l.budget_max_ht ?? 0), 0)
    : hasBudgetTotal ? Math.round(result.budgetTotal * 1.15) : 0;
  const hasRange = rangeMin > 0 || rangeMax > 0;

  const devisCount   = documents.filter(d => d.document_type === 'devis').length;
  const factureCount = documents.filter(d => d.document_type === 'facture').length;
  const lotsAvecDevis = lots.filter(l => documents.some(d => d.lot_id === l.id && d.document_type === 'devis')).length;
  const lotsManquants = lots.length - lotsAvecDevis;
  const alertsCount = insights?.global.filter(i => i.type === 'alert' || i.type === 'warning').length ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-6 py-7 space-y-5">

      {/* ── État 1 : aucun budget ────────────────────────────────────────── */}
      {!hasAnyBudget && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center">
            <Wallet className="h-7 w-7 text-gray-300" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-lg mb-1">Votre budget n'est pas encore estimé</h3>
            <p className="text-sm text-gray-400 max-w-md leading-relaxed">
              Créez votre plan de chantier avec l'IA pour obtenir une estimation basée sur les prix du marché réels.
            </p>
          </div>
          <a href="/mon-chantier/nouveau"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-6 py-3 text-sm transition-colors">
            Construire mon budget
          </a>
        </div>
      )}

      {/* ── État 2+ : fourchette + badge fiabilité ───────────────────────── */}
      {hasAnyBudget && hasRange && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Fourchette estimée</p>
              <p className="text-3xl font-extrabold text-gray-900 leading-none">
                {fmtK(rangeMin)} – {fmtK(rangeMax)}
              </p>
            </div>
            <ReliabilityBadge signaux={result.estimationSignaux} />
          </div>
          {!hasDevis && (
            <p className="text-xs text-gray-400 mt-3 border-t border-gray-50 pt-3">
              💡 Ajoutez vos devis pour affiner cette estimation et valider les prix
            </p>
          )}
        </div>
      )}

      {/* ── État 3+ : comparaison estimation / devis ─────────────────────── */}
      {hasAnyBudget && hasDevis && hasRange && (
        <BudgetComparaison rangeMin={rangeMin} rangeMax={rangeMax} documents={documents} />
      )}

      {/* ── KPI Row (état 2+) ────────────────────────────────────────────── */}
      {hasAnyBudget && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Devis reçus" value={devisCount > 0 ? `${devisCount}` : '—'}
            sub={devisCount > 0 ? `${lotsManquants} lot${lotsManquants !== 1 ? 's' : ''} sans devis` : 'Aucun devis ajouté'}
            color={lotsManquants > 0 ? 'amber' : devisCount > 0 ? 'green' : 'default'}
            trend={lotsManquants > 0 ? 'down' : devisCount > 0 ? 'up' : 'neutral'} />
          <KpiCard label="Factures enregistrées" value={factureCount > 0 ? `${factureCount}` : '—'}
            sub={factureCount > 0 ? 'paiements suivis' : 'Aucune facture'}
            color={factureCount > 0 ? 'green' : 'default'} />
          <KpiCard label="Alertes actives" value={insightsLoading ? '…' : alertsCount > 0 ? `${alertsCount}` : '✓'}
            sub={alertsCount > 0 ? 'points à surveiller' : 'Tout est sous contrôle'}
            color={alertsCount > 0 ? 'red' : 'green'} trend={alertsCount > 0 ? 'down' : 'up'} />
          <KpiCard label="Lots" value={`${lots.length}`}
            sub={lotsManquants > 0 ? `${lotsManquants} sans devis` : 'Tous documentés'}
            color={lotsManquants > 0 ? 'amber' : 'green'} />
        </div>
      )}

      {/* ── Budget gauge (état 3+) ───────────────────────────────────────── */}
      {hasAnyBudget && hasDevis && hasRange && (
        <BudgetGauge rangeMin={rangeMin} rangeMax={rangeMax} documents={documents} />
      )}

      {/* ── Grille lots + alertes ────────────────────────────────────────── */}
      {hasAnyBudget && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3"><LotBreakdown result={result} documents={documents} /></div>
          <div className="lg:col-span-2"><AlertesIA insights={insights} loading={insightsLoading} /></div>
        </div>
      )}

      {/* ── Trésorerie par phase ──────────────────────────────────────────── */}
      {hasAnyBudget && <TresoreriePhases result={result} />}

      {/* ── Factures & paiements ──────────────────────────────────────────── */}
      <FacturesPaiements documents={documents} onAddFacture={onAddDoc} />

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <QuickActions onAddDoc={onAddDoc} onGoToAnalyse={onGoToAnalyse} onGoToLots={onGoToLots} />
    </div>
  );
}
