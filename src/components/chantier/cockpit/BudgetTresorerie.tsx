/**
 * BudgetTresorerie — écran financier premium du cockpit chantier.
 * Données claires, zéro tableau dense, chaque bloc orienté décision.
 */
import { useMemo, useState, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, CircleDollarSign,
  FileText, Plus, Search, ChevronRight, ChevronLeft, Info, Zap, Layers, Wallet, X,
  SlidersHorizontal, Check, Pencil,
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

function LotBreakdown({ result, documents, rangeMin, rangeMax, onGoToLot, onAddDoc }: {
  result: ChantierIAResult;
  documents: DocumentChantier[];
  rangeMin: number;
  rangeMax: number;
  onGoToLot?: (lotId: string) => void;
  onAddDoc: () => void;
}) {
  const lots = result.lots ?? [];
  const totalMax = lots.reduce((s, l) => s + (l.budget_max_ht ?? 0), 0) || rangeMax || 1;
  const totalMin = lots.reduce((s, l) => s + (l.budget_min_ht ?? 0), 0);
  const hasTotalBudget = totalMax > 0 && totalMin > 0;

  const lotsWithData = useMemo(() => {
    return lots.map(lot => {
      const min = lot.budget_min_ht ?? 0;
      const max = lot.budget_max_ht ?? 0;
      const avg = (min + max) / 2;
      const pctMin = totalMax > 0 ? (min / totalMax) * 100 : 0;
      const pctMax = totalMax > 0 ? (max / totalMax) * 100 : 0;
      const devisCount  = documents.filter(d => d.lot_id === lot.id && d.document_type === 'devis').length;
      const docCount    = documents.filter(d => d.lot_id === lot.id).length;
      return { ...lot, min, max, avg, pctMin, pctMax, devisCount, docCount };
    }).sort((a, b) => b.avg - a.avg);
  }, [lots, documents, totalMax]);

  if (lots.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Intervenants nécessaires</h3>
        </div>
        <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">
          {lots.length} intervenant{lots.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="divide-y divide-gray-50">
        {lotsWithData.map(lot => {
          const statusCfg = lot.devisCount === 0
            ? { dot: 'bg-red-400',     badge: 'bg-red-50 text-red-600 border-red-100',     label: '0 devis'  }
            : lot.devisCount === 1
            ? { dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 border-amber-100', label: '1 devis' }
            : { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: `${lot.devisCount} devis` };

          return (
            <button key={lot.id}
              onClick={() => onGoToLot?.(lot.id)}
              className={`w-full flex items-center gap-3 py-3.5 text-left transition-all group ${
                onGoToLot ? 'hover:bg-gray-50 rounded-xl px-3 -mx-3 cursor-pointer' : 'cursor-default'
              }`}>
              {/* Emoji intervenant */}
              <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-lg shrink-0 group-hover:border-blue-100 group-hover:bg-blue-50 transition-colors">
                {lot.emoji ?? '🔧'}
              </div>

              {/* Nom + barre */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-gray-800 truncate group-hover:text-blue-700 transition-colors">{lot.nom}</span>
                  <span className="text-sm font-bold text-gray-700 shrink-0">
                    {lot.min > 0 ? `${fmtK(lot.min)} – ${fmtK(lot.max)}` : <span className="text-gray-300 font-normal text-xs">Non estimé</span>}
                  </span>
                </div>
                {/* Barre budget */}
                <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  {lot.pctMax > 0 && (
                    <>
                      <div className="absolute h-full bg-blue-100 rounded-full" style={{ left: 0, width: `${lot.pctMax}%` }} />
                      <div className="absolute h-full bg-blue-500 rounded-full" style={{ left: 0, width: `${lot.pctMin}%` }} />
                    </>
                  )}
                </div>
              </div>

              {/* Badge devis + chevron */}
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusCfg.badge}`}>
                  {statusCfg.label}
                </span>
                {onGoToLot && <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-blue-400 transition-colors" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer total */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
        {hasTotalBudget ? (
          <>
            <span className="text-xs text-gray-400">Total (somme des intervenants)</span>
            <span className="text-sm font-bold text-gray-800">
              {fmtK(totalMin)} – {fmtK(totalMax)}
            </span>
          </>
        ) : (
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-gray-400">Aucun devis ajouté pour le moment</span>
            <button onClick={onAddDoc}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              + Ajouter un devis
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Alertes IA ────────────────────────────────────────────────────────────────

// ── Alertes actionnables (calculées localement, toujours disponibles) ─────────

interface ActionAlert {
  type: 'alert' | 'warning' | 'tip' | 'ok';
  icon: string;
  text: string;
  btn?: string;
  onBtn?: () => void;
}

function computeActionAlerts(
  lots: import('@/types/chantier-ia').LotChantier[],
  documents: DocumentChantier[],
  onAddDoc: () => void,
  onGoToLot?: (id: string) => void,
): ActionAlert[] {
  const alerts: ActionAlert[] = [];

  // Trier par budget desc → les intervenants les plus coûteux d'abord
  const sorted = [...lots].sort((a, b) => (b.budget_max_ht ?? 0) - (a.budget_max_ht ?? 0));

  for (const lot of sorted) {
    const devisLot = documents.filter(d => d.lot_id === lot.id && d.document_type === 'devis');
    if (devisLot.length === 0) {
      alerts.push({
        type: 'alert', icon: '📋',
        text: `Aucun devis ${lot.nom.toLowerCase()} — demandez au moins 2 devis pour valider ce poste.`,
        btn: '+ Ajouter un devis', onBtn: onAddDoc,
      });
    } else if (devisLot.length === 1) {
      alerts.push({
        type: 'warning', icon: '⚖️',
        text: `1 seul devis ${lot.nom.toLowerCase()} — ajoutez un 2e devis pour comparer les prix (écart moyen : 20–30 %).`,
        btn: '+ Ajouter un devis', onBtn: onAddDoc,
      });
    }
  }

  // Pas de lots du tout
  if (lots.length === 0) {
    alerts.push({
      type: 'tip', icon: '💡',
      text: 'Commencez par créer vos intervenants pour suivre votre budget poste par poste.',
    });
  }

  // Tout est couvert
  if (alerts.length === 0 && lots.length > 0) {
    const multiDevis = lots.filter(l =>
      documents.filter(d => d.lot_id === l.id && d.document_type === 'devis').length >= 2
    ).length;
    alerts.push({
      type: 'ok', icon: '✅',
      text: `${multiDevis}/${lots.length} intervenant${lots.length > 1 ? 's' : ''} avec 2 devis ou plus — bonne progression !`,
    });
  }

  return alerts.slice(0, 4); // max 4 alertes
}

function AlertesIA({ lots, documents, onAddDoc, onGoToLot }: {
  lots: import('@/types/chantier-ia').LotChantier[];
  documents: DocumentChantier[];
  onAddDoc: () => void;
  onGoToLot?: (id: string) => void;
}) {
  const alerts = useMemo(
    () => computeActionAlerts(lots, documents, onAddDoc, onGoToLot),
    [lots, documents],
  );

  const STYLES: Record<ActionAlert['type'], { bg: string; border: string; text: string }> = {
    alert:   { bg: 'bg-red-50',     border: 'border-red-100',     text: 'text-red-800'     },
    warning: { bg: 'bg-amber-50',   border: 'border-amber-100',   text: 'text-amber-800'   },
    tip:     { bg: 'bg-blue-50',    border: 'border-blue-100',    text: 'text-blue-800'    },
    ok:      { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-800' },
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-4 w-4 text-violet-500" />
        <h3 className="font-semibold text-gray-900">Alertes actionnables</h3>
      </div>

      <div className="space-y-2">
        {alerts.map((alert, i) => {
          const s = STYLES[alert.type];
          return (
            <div key={i} className={`flex items-start gap-3 px-3.5 py-3 rounded-xl border ${s.bg} ${s.border}`}>
              <span className="text-base shrink-0 mt-0.5">{alert.icon}</span>
              <p className={`flex-1 text-sm font-medium ${s.text} leading-snug`}>{alert.text}</p>
              {alert.btn && alert.onBtn && (
                <button onClick={alert.onBtn}
                  className="shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-all whitespace-nowrap">
                  {alert.btn}
                </button>
              )}
            </div>
          );
        })}
      </div>
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

// ── Header projet ─────────────────────────────────────────────────────────────

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

// ── Types questionnaire affinage ──────────────────────────────────────────────

type TypeProjetAffinage = 'renovation_complete' | 'renovation_partielle' | 'extension' | 'exterieur';

// ── Éléments de projet détectables ────────────────────────────────────────────

interface ElemQuestion {
  id: string;
  label: string;
  /** Précision affichée sous le label */
  sub?: string;
  type: 'number' | 'choice' | 'yesno';
  unit?: string;
  placeholder?: string;
  choices?: string[];
  /** Impact budgétaire (€) quand la réponse est "oui" */
  addMin?: number;
  addAvg?: number;
  addMax?: number;
  /** Impact budgétaire selon le choix sélectionné */
  choiceImpact?: Record<string, { addMin: number; addAvg: number; addMax: number }>;
}

interface ProjectElementDef {
  id: string;
  label: string;
  emoji: string;
  keywords: string[];
  typeEquiv: TypeProjetAffinage;
  questions: ElemQuestion[];
  /** Élément ajouté manuellement par l'utilisateur */
  isCustom?: boolean;
  /** Budget personnalisé fourni par l'utilisateur (éléments "Autre") */
  customBudgetMin?: number;
  customBudgetMax?: number;
}

const ELEMENT_DEFS: ProjectElementDef[] = [
  {
    id: 'piscine', label: 'Piscine', emoji: '🏊', typeEquiv: 'exterieur',
    keywords: ['piscine', 'pool', 'bassin'],
    questions: [
      { id: 'type', label: 'Type de piscine', type: 'choice', sub: 'Le type détermine fortement le coût et la durée des travaux',
        choices: ['Béton coulé (sur mesure)', 'Coque polyester (kit)', 'Hors-sol'],
        choiceImpact: { 'Béton coulé (sur mesure)': { addMin: 10000, addAvg: 20000, addMax: 35000 }, 'Coque polyester (kit)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Hors-sol': { addMin: -8000, addAvg: -15000, addMax: -22000 } } },
      { id: 'surface', label: 'Surface du bassin', type: 'number', unit: 'm²', placeholder: '30', sub: 'La superficie est le principal facteur de coût (terrassement, liner, eau)' },
      { id: 'local_technique', label: 'Faut-il construire un local technique (filtration, pompe) ?', type: 'yesno', sub: 'Local béton ou préfabriqué pour les équipements de traitement de l\'eau', addMin: 4000, addAvg: 8000, addMax: 15000 },
      { id: 'chauffage', label: 'Souhaitez-vous chauffer la piscine ?', type: 'yesno', sub: 'Pompe à chaleur air-eau dédiée — prolonge la saison de 2 à 3 mois', addMin: 3000, addAvg: 5500, addMax: 9000 },
      { id: 'plage', label: 'Y a-t-il une plage béton / carrelage autour du bassin ?', type: 'yesno', sub: 'Dalle antidérapante sur le pourtour (béton lavé, carrelage ou pierre)', addMin: 3000, addAvg: 6000, addMax: 12000 },
      { id: 'eclairage', label: 'Souhaitez-vous un éclairage LED sous-marin ?', type: 'yesno', sub: 'Projecteurs LED subaquatiques + alimentation électrique étanche', addMin: 800, addAvg: 1800, addMax: 3500 },
      { id: 'couverture', label: 'Faut-il une couverture automatique de sécurité ?', type: 'yesno', sub: 'Volet immergé ou abri télescopique — protection anti-noyade + économies de chauffage', addMin: 3000, addAvg: 7000, addMax: 14000 },
    ],
  },
  {
    id: 'terrasse', label: 'Terrasse', emoji: '🪵', typeEquiv: 'exterieur',
    keywords: ['terrasse', 'deck', 'platelage', 'dallage', 'dalle extérieure', 'dalle béton'],
    questions: [
      { id: 'surface', label: 'Surface de la terrasse', type: 'number', unit: 'm²', placeholder: '25', sub: 'La surface est la base du calcul (fourniture + pose au m²)' },
      { id: 'materiau', label: 'Quel revêtement souhaitez-vous ?', type: 'choice', sub: 'Le matériau impacte à la fois le coût et la durée de vie',
        choices: ['Bois composite', 'Bois naturel (ipé, pin…)', 'Carrelage extérieur', 'Béton désactivé / dallage'],
        choiceImpact: { 'Bois composite': { addMin: 500, addAvg: 1500, addMax: 3000 }, 'Bois naturel (ipé, pin…)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Carrelage extérieur': { addMin: 800, addAvg: 2000, addMax: 4000 }, 'Béton désactivé / dallage': { addMin: 0, addAvg: 500, addMax: 1500 } } },
      { id: 'terrassement', label: 'Y a-t-il un dénivelé ou un terrassement préalable ?', type: 'yesno', sub: 'Décaissement du sol, évacuation des terres, mise en niveau', addMin: 1500, addAvg: 3500, addMax: 7000 },
      { id: 'eclairage', label: 'Souhaitez-vous des points lumineux sur la terrasse ?', type: 'yesno', sub: 'Spots encastrés au sol, appliques murales ou guirlandes + câblage', addMin: 600, addAvg: 1500, addMax: 3000 },
      { id: 'eau', label: 'Faut-il créer un point d\'eau extérieur (robinet, douche) ?', type: 'yesno', sub: 'Raccordement plomberie + robinet extérieur ou douche de jardin', addMin: 400, addAvg: 900, addMax: 2000 },
      { id: 'escaliers', label: 'Des escaliers d\'accès sont-ils à créer ?', type: 'yesno', sub: 'Marches en pierre, béton ou bois pour accéder à la terrasse surélevée', addMin: 500, addAvg: 1500, addMax: 3500 },
      { id: 'garde_corps', label: 'Un garde-corps ou une rambarde est-il nécessaire ?', type: 'yesno', sub: 'Obligatoire si la terrasse est surélevée de plus de 1 m', addMin: 800, addAvg: 2000, addMax: 4500 },
    ],
  },
  {
    id: 'pergola', label: 'Pergola', emoji: '⛺', typeEquiv: 'exterieur',
    keywords: ['pergola'],
    questions: [
      { id: 'surface', label: 'Surface couverte', type: 'number', unit: 'm²', placeholder: '15', sub: 'La surface détermine la quantité de matériaux et le temps de pose' },
      { id: 'type', label: 'Type de pergola', type: 'choice', sub: 'La bioclimatique est plus complexe à installer mais très polyvalente',
        choices: ['Bioclimatique (lames orientables)', 'Aluminium fixe', 'Bois classique'],
        choiceImpact: { 'Bioclimatique (lames orientables)': { addMin: 5000, addAvg: 9000, addMax: 15000 }, 'Aluminium fixe': { addMin: 1000, addAvg: 2500, addMax: 5000 }, 'Bois classique': { addMin: 0, addAvg: 0, addMax: 0 } } },
      { id: 'electricite', label: 'Faut-il amener l\'électricité jusqu\'à la pergola ?', type: 'yesno', sub: 'Tirage de câble depuis le tableau + gaine extérieure', addMin: 800, addAvg: 1800, addMax: 4000 },
      { id: 'eclairage', label: 'Souhaitez-vous un éclairage intégré dans la structure ?', type: 'yesno', sub: 'Spots LED ou guirlandes fixés dans les poutres de la pergola', addMin: 400, addAvg: 1000, addMax: 2200 },
      { id: 'stores', label: 'Faut-il prévoir des stores ou rideaux latéraux ?', type: 'yesno', sub: 'Protection solaire et intimité sur les côtés de la pergola', addMin: 800, addAvg: 1800, addMax: 3500 },
      { id: 'chauffage', label: 'Souhaitez-vous un chauffage infrarouge pour les soirées fraîches ?', type: 'yesno', sub: 'Radiateurs infrarouges fixés à la structure — prolonge l\'usage en automne', addMin: 500, addAvg: 1200, addMax: 2500 },
    ],
  },
  {
    id: 'pool_house', label: 'Pool house', emoji: '🏡', typeEquiv: 'exterieur',
    keywords: ['pool house', 'poolhouse', 'abri piscine', 'pool-house'],
    questions: [
      { id: 'surface', label: 'Surface du pool house', type: 'number', unit: 'm²', placeholder: '20', sub: 'La superficie définit la quantité de maçonnerie, toiture et charpente' },
      { id: 'type', label: 'Type de construction', type: 'choice', sub: 'La maçonnerie pierre est la plus chère, l\'ossature bois la plus rapide',
        choices: ['Parpaing / enduit', 'Ossature bois', 'Maçonnerie pierre'],
        choiceImpact: { 'Parpaing / enduit': { addMin: 0, addAvg: 0, addMax: 0 }, 'Ossature bois': { addMin: 1000, addAvg: 3000, addMax: 6000 }, 'Maçonnerie pierre': { addMin: 3000, addAvg: 8000, addMax: 15000 } } },
      { id: 'electricite', label: 'Faut-il tirer l\'électricité jusqu\'au pool house ?', type: 'yesno', sub: 'Câblage depuis le tableau principal de la maison + sous-tableau', addMin: 1200, addAvg: 2500, addMax: 5000 },
      { id: 'cuisine', label: 'Faut-il prévoir une cuisine ou kitchenette ?', type: 'yesno', sub: 'Évier + plan de travail + rangement + raccordement plomberie', addMin: 2500, addAvg: 5000, addMax: 10000 },
      { id: 'sanitaires', label: 'Y a-t-il des sanitaires à créer (WC, douche) ?', type: 'yesno', sub: 'Raccordement eau + évacuation + équipements sanitaires', addMin: 3000, addAvg: 5500, addMax: 9000 },
      { id: 'climatisation', label: 'Souhaitez-vous la climatisation / chauffage réversible ?', type: 'yesno', sub: 'Unité murale réversible (climatisation + chauffage en hiver)', addMin: 2000, addAvg: 3500, addMax: 6000 },
    ],
  },
  {
    id: 'extension', label: 'Extension', emoji: '🏗️', typeEquiv: 'extension',
    keywords: ['extension', 'agrandissement', 'annexe', 'surélévation', 'surelevation'],
    questions: [
      { id: 'surface', label: 'Surface à créer', type: 'number', unit: 'm²', placeholder: '30', sub: 'La surface neuve est la base du calcul au m² hors taxes' },
      { id: 'structure', label: 'Type de structure', type: 'choice', sub: 'La surélévation nécessite des travaux de charpente et de toiture supplémentaires',
        choices: ['Plain-pied (dalle béton)', 'Surélévation (niveau supplémentaire)'],
        choiceImpact: { 'Plain-pied (dalle béton)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Surélévation (niveau supplémentaire)': { addMin: 6000, addAvg: 14000, addMax: 28000 } } },
      { id: 'plomberie', label: 'Faut-il prévoir la plomberie dans l\'extension ?', type: 'yesno', sub: 'Raccordement eau chaude/froide + évacuations (si cuisine, bain ou WC)', addMin: 4000, addAvg: 8000, addMax: 15000 },
      { id: 'electricite', label: 'L\'électricité est-elle à réaliser entièrement ?', type: 'yesno', sub: 'Tableau divisionnaire, câblage neuf, prises, éclairage, VMC', addMin: 3000, addAvg: 6000, addMax: 12000 },
      { id: 'demolition', label: 'Y a-t-il une démolition ou une ouverture de mur à prévoir ?', type: 'yesno', sub: 'Dépose de murs porteurs ou non, ouverture de façade, évacuation gravats', addMin: 2000, addAvg: 5000, addMax: 10000 },
      { id: 'cuisine_sdb', label: 'L\'extension comprend-elle une cuisine ou une salle de bain ?', type: 'yesno', sub: 'Travaux de plomberie + carrelage + équipements sanitaires ou cuisine', addMin: 6000, addAvg: 14000, addMax: 25000 },
    ],
  },
  {
    id: 'renovation', label: 'Rénovation complète', emoji: '🔨', typeEquiv: 'renovation_complete',
    keywords: ['rénovation complète', 'renovation complete', 'rénover entièrement', 'réhabilitation'],
    questions: [
      { id: 'surface', label: 'Surface à rénover', type: 'number', unit: 'm²', placeholder: '100', sub: 'La surface est la base du calcul — plus elle est grande, plus la fourchette s\'élargit' },
      { id: 'etendue', label: 'Étendue des travaux', type: 'choice', sub: 'Une rénovation légère coûte 3 à 5× moins cher qu\'une rénovation lourde (gros œuvre)',
        choices: ['Lourde (gros œuvre + second œuvre + finitions)', 'Intermédiaire (second œuvre + finitions)', 'Légère (peinture, sols, finitions)'],
        choiceImpact: { 'Lourde (gros œuvre + second œuvre + finitions)': { addMin: 10000, addAvg: 25000, addMax: 50000 }, 'Intermédiaire (second œuvre + finitions)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Légère (peinture, sols, finitions)': { addMin: -8000, addAvg: -15000, addMax: -25000 } } },
      { id: 'demolition', label: 'Y a-t-il des démolitions ou un désamiantage à prévoir ?', type: 'yesno', sub: 'Abattage de cloisons, diagnostic amiante obligatoire avant 1997', addMin: 2000, addAvg: 5000, addMax: 12000 },
      { id: 'reseaux', label: 'Les réseaux (plomberie, électricité) sont-ils à entièrement refaire ?', type: 'yesno', sub: 'Mise aux normes complète — souvent obligatoire sur les biens anciens', addMin: 8000, addAvg: 18000, addMax: 35000 },
    ],
  },
  {
    id: 'salle_bain', label: 'Salle de bain', emoji: '🚿', typeEquiv: 'renovation_partielle',
    keywords: ['salle de bain', 'salle de bains', 'sdb', 'douche', 'baignoire'],
    questions: [
      { id: 'surface', label: 'Surface de la salle de bain', type: 'number', unit: 'm²', placeholder: '8', sub: 'Les SdB coûtent cher au m² car elles concentrent plomberie + carrelage + équipements' },
      { id: 'etendue', label: 'Étendue des travaux', type: 'choice', sub: 'Une réfection complète inclut tout : démolition, plomberie, carrelage, équipements',
        choices: ['Complète (démolition + plomberie + carrelage + équipements)', 'Équipements seuls (douche, WC, vasque)', 'Rafraîchissement (peinture + joints + accessoires)'],
        choiceImpact: { 'Complète (démolition + plomberie + carrelage + équipements)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Équipements seuls (douche, WC, vasque)': { addMin: -3000, addAvg: -6000, addMax: -10000 }, 'Rafraîchissement (peinture + joints + accessoires)': { addMin: -5000, addAvg: -9000, addMax: -15000 } } },
      { id: 'italienne', label: 'Souhaitez-vous une douche à l\'italienne (sans receveur) ?', type: 'yesno', sub: 'Chape en pente + étanchéité + carrelage — 1 à 2 jours de travail supplémentaire', addMin: 800, addAvg: 1800, addMax: 3500 },
      { id: 'seche_serviette', label: 'Faut-il installer un sèche-serviette électrique ?', type: 'yesno', sub: 'Radiateur sèche-serviette mural + point électrique dédié', addMin: 300, addAvg: 700, addMax: 1500 },
      { id: 'vmc', label: 'Y a-t-il une ventilation (VMC) à créer ou remplacer ?', type: 'yesno', sub: 'Obligatoire dans les salles de bain — évite les problèmes d\'humidité', addMin: 400, addAvg: 900, addMax: 2000 },
    ],
  },
  {
    id: 'cuisine', label: 'Cuisine', emoji: '🍳', typeEquiv: 'renovation_partielle',
    keywords: ['cuisine', 'plan de travail', 'meuble cuisine'],
    questions: [
      { id: 'surface', label: 'Surface de la cuisine', type: 'number', unit: 'm²', placeholder: '15', sub: 'Les cuisines ouvertes (25m²+) nécessitent plus de linéaire de meubles' },
      { id: 'etendue', label: 'Étendue des travaux', type: 'choice', sub: 'Le remplacement complet inclut la dépose de l\'ancienne cuisine + toute la plomberie',
        choices: ['Complète (plomberie + électricité + mobilier)', 'Remplacement des équipements uniquement', 'Façades + plan de travail uniquement'],
        choiceImpact: { 'Complète (plomberie + électricité + mobilier)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Remplacement des équipements uniquement': { addMin: -2000, addAvg: -5000, addMax: -9000 }, 'Façades + plan de travail uniquement': { addMin: -4000, addAvg: -8000, addMax: -14000 } } },
      { id: 'ilot', label: 'Souhaitez-vous un îlot central ?', type: 'yesno', sub: 'Plan de travail central avec rangements — mobilier + plomberie si évier déporté', addMin: 1500, addAvg: 3500, addMax: 7000 },
      { id: 'credence', label: 'Une crédence carrelage ou verre est-elle à poser ?', type: 'yesno', sub: 'Protection murale entre les meubles hauts et le plan de travail', addMin: 300, addAvg: 800, addMax: 2000 },
      { id: 'electricite', label: 'L\'électricité de la cuisine est-elle à refaire ?', type: 'yesno', sub: 'Circuits dédiés pour four, lave-vaisselle, réfrigérateur — mis aux normes', addMin: 800, addAvg: 2000, addMax: 4500 },
    ],
  },
  {
    id: 'cloture', label: 'Clôture / portail', emoji: '🚧', typeEquiv: 'exterieur',
    keywords: ['clôture', 'cloture', 'portail', 'grillage', 'palissade', 'mur de clôture'],
    questions: [
      { id: 'lineaire', label: 'Linéaire de clôture à créer', type: 'number', unit: 'm', placeholder: '30', sub: 'Le linéaire (en mètres) est la base du devis clôture' },
      { id: 'type', label: 'Type de clôture', type: 'choice', sub: 'Le bois est le moins cher à poser, le béton / pierre le plus pérenne',
        choices: ['Grillage rigide + poteaux', 'Palissade bois / lisses', 'Aluminium / PVC', 'Béton / mur maçonné'],
        choiceImpact: { 'Grillage rigide + poteaux': { addMin: 0, addAvg: 0, addMax: 0 }, 'Palissade bois / lisses': { addMin: 500, addAvg: 1500, addMax: 3000 }, 'Aluminium / PVC': { addMin: 1000, addAvg: 3000, addMax: 6000 }, 'Béton / mur maçonné': { addMin: 2000, addAvg: 6000, addMax: 12000 } } },
      { id: 'portail', label: 'Y a-t-il un portail motorisé à installer ?', type: 'yesno', sub: 'Portail coulissant ou battant + motorisation + télécommande + interphone', addMin: 1500, addAvg: 3500, addMax: 7000 },
      { id: 'fondations', label: 'Le terrain est-il en pente (fondations spéciales) ?', type: 'yesno', sub: 'Terrassement + béton armé si dénivelé important', addMin: 1000, addAvg: 3000, addMax: 6000 },
    ],
  },
  {
    id: 'carport', label: 'Carport / garage', emoji: '🚗', typeEquiv: 'exterieur',
    keywords: ['carport', 'abri voiture', 'garage', 'box'],
    questions: [
      { id: 'surface', label: 'Surface du carport / garage', type: 'number', unit: 'm²', placeholder: '20', sub: 'Environ 15 m² pour 1 voiture, 25 m² pour 2 voitures' },
      { id: 'type', label: 'Type de structure', type: 'choice', sub: 'Le garage maçonné est le plus solide mais le plus long à construire',
        choices: ['Carport bois (ouvert)', 'Carport aluminium (ouvert)', 'Garage maçonné (fermé)', 'Abri métal (semi-ouvert)'],
        choiceImpact: { 'Carport bois (ouvert)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Carport aluminium (ouvert)': { addMin: 500, addAvg: 1500, addMax: 3500 }, 'Garage maçonné (fermé)': { addMin: 5000, addAvg: 12000, addMax: 22000 }, 'Abri métal (semi-ouvert)': { addMin: 300, addAvg: 800, addMax: 2000 } } },
      { id: 'dalle', label: 'Faut-il créer une dalle béton au sol ?', type: 'yesno', sub: 'Dalle de 10 à 15 cm + ferraillage — indispensable si le sol n\'est pas préparé', addMin: 800, addAvg: 2000, addMax: 4500 },
      { id: 'electricite', label: 'Souhaitez-vous l\'électricité + éclairage dans le carport ?', type: 'yesno', sub: 'Prise 16A/32A + éclairage + câblage depuis le tableau de la maison', addMin: 800, addAvg: 1800, addMax: 4000 },
      { id: 'borne_recharge', label: 'Faut-il installer une borne de recharge voiture électrique ?', type: 'yesno', sub: 'Borne 7 kW (wallbox) + câble dédié — environ 1 journée d\'électricien', addMin: 1000, addAvg: 2000, addMax: 3500 },
    ],
  },
  {
    id: 'allee', label: 'Allée carrossable', emoji: '🛣️', typeEquiv: 'exterieur',
    keywords: ['allée', 'allee', 'carrossable', 'voie d\'accès', 'voie acces', 'entrée voiture', 'accès voiture'],
    questions: [
      { id: 'surface', label: 'Surface de l\'allée', type: 'number', unit: 'm²', placeholder: '40', sub: 'Exemple : une allée de 20 m × 3 m = 60 m²' },
      { id: 'materiau', label: 'Revêtement souhaité', type: 'choice', sub: 'Le béton désactivé est le plus qualitatif, le gravier stabilisé le moins cher',
        choices: ['Béton désactivé', 'Enrobé bitumineux', 'Gravier stabilisé', 'Pavés autobloquants béton'],
        choiceImpact: { 'Béton désactivé': { addMin: 1500, addAvg: 4000, addMax: 8000 }, 'Enrobé bitumineux': { addMin: 800, addAvg: 2500, addMax: 5000 }, 'Gravier stabilisé': { addMin: 0, addAvg: 0, addMax: 0 }, 'Pavés autobloquants béton': { addMin: 2000, addAvg: 5000, addMax: 10000 } } },
      { id: 'terrassement', label: 'Y a-t-il du terrassement ou décaissement à prévoir ?', type: 'yesno', sub: 'Décapage de la végétation, décaissement, évacuation des terres', addMin: 1500, addAvg: 3500, addMax: 7000 },
      { id: 'bordures', label: 'Faut-il poser des bordures ou caniveaux sur les côtés ?', type: 'yesno', sub: 'Bordures béton T2 ou caniveaux de drainage pour évacuer les eaux pluviales', addMin: 500, addAvg: 1500, addMax: 3000 },
      { id: 'eclairage', label: 'Souhaitez-vous un éclairage le long de l\'allée ?', type: 'yesno', sub: 'Bornes solaires ou câblées disposées le long de l\'allée', addMin: 800, addAvg: 2000, addMax: 4500 },
      { id: 'portail', label: 'Faut-il installer un portail motorisé à l\'entrée ?', type: 'yesno', sub: 'Portail coulissant ou battant + motorisation + télécommande', addMin: 1500, addAvg: 3500, addMax: 7000 },
    ],
  },
  {
    id: 'amenagement_jardin', label: 'Aménagement jardin', emoji: '🌳', typeEquiv: 'exterieur',
    keywords: ['jardin', 'paysager', 'gazon', 'pelouse', 'plantation', 'massif', 'engazonnement', 'arrosage automatique'],
    questions: [
      { id: 'surface', label: 'Surface du jardin à aménager', type: 'number', unit: 'm²', placeholder: '200', sub: 'La surface à travailler détermine le volume de terre végétale et de plantes' },
      { id: 'type', label: 'Type d\'aménagement principal', type: 'choice', sub: 'Un engazonnement simple coûte 5× moins cher qu\'un jardin paysager complet',
        choices: ['Engazonnement + quelques plantations', 'Jardin paysager complet (massifs, allées)', 'Terrain de sport / pelouse sportive'],
        choiceImpact: { 'Engazonnement + quelques plantations': { addMin: 0, addAvg: 0, addMax: 0 }, 'Jardin paysager complet (massifs, allées)': { addMin: 3000, addAvg: 8000, addMax: 18000 }, 'Terrain de sport / pelouse sportive': { addMin: 2000, addAvg: 6000, addMax: 12000 } } },
      { id: 'terrassement', label: 'Y a-t-il du terrassement ou nivellement à prévoir ?', type: 'yesno', sub: 'Décapage, apport de terre végétale, nivellement au tracteur', addMin: 1000, addAvg: 3000, addMax: 7000 },
      { id: 'arrosage', label: 'Souhaitez-vous un arrosage automatique enterré ?', type: 'yesno', sub: 'Système avec programmateur, tuyaux enterrés et têtes de rotation', addMin: 2500, addAvg: 5000, addMax: 10000 },
      { id: 'eclairage', label: 'Faut-il prévoir un éclairage extérieur dans le jardin ?', type: 'yesno', sub: 'Spots au sol, bornes ou projecteurs + câblage enterré', addMin: 1000, addAvg: 2500, addMax: 5000 },
      { id: 'cloture', label: 'Y a-t-il une clôture ou délimitation à créer ?', type: 'yesno', sub: 'Grillage, palissade ou haie pour délimiter la propriété', addMin: 1500, addAvg: 4000, addMax: 9000 },
    ],
  },
  {
    id: 'toiture', label: 'Toiture / charpente', emoji: '🏠', typeEquiv: 'renovation_partielle',
    keywords: ['toiture', 'charpente', 'couverture', 'toit', 'tuile', 'ardoise', 'zinguerie', 'gouttière'],
    questions: [
      { id: 'surface', label: 'Surface de la toiture', type: 'number', unit: 'm²', placeholder: '120', sub: 'La surface de toiture est généralement 1,2 à 1,5× la surface au sol' },
      { id: 'type', label: 'Type de couverture souhaitée', type: 'choice', sub: 'L\'ardoise naturelle est la plus durable mais 2× plus chère que les tuiles béton',
        choices: ['Tuiles béton', 'Tuiles terre cuite', 'Ardoise naturelle', 'Zinc / bac acier'],
        choiceImpact: { 'Tuiles béton': { addMin: 0, addAvg: 0, addMax: 0 }, 'Tuiles terre cuite': { addMin: 1000, addAvg: 3000, addMax: 6000 }, 'Ardoise naturelle': { addMin: 3000, addAvg: 8000, addMax: 15000 }, 'Zinc / bac acier': { addMin: 1000, addAvg: 3500, addMax: 7000 } } },
      { id: 'charpente', label: 'La charpente est-elle à remplacer ou renforcer ?', type: 'yesno', sub: 'Remplacement total ou partiel de la structure bois portant la couverture', addMin: 4000, addAvg: 10000, addMax: 20000 },
      { id: 'isolation', label: 'Souhaitez-vous isoler les combles en même temps ?', type: 'yesno', sub: 'Isolation thermique des combles — économies de chauffage immédiates', addMin: 2000, addAvg: 5000, addMax: 10000 },
      { id: 'velux', label: 'Faut-il poser ou remplacer des fenêtres de toit (Velux) ?', type: 'yesno', sub: 'Compter environ 1 500 € l\'unité en moyenne (fourniture + pose)', addMin: 1000, addAvg: 3000, addMax: 6000 },
      { id: 'zinguerie', label: 'Les gouttières et zingueries sont-elles à refaire ?', type: 'yesno', sub: 'Chéneaux, descentes, solins, noues — souvent oubliés dans les devis', addMin: 1500, addAvg: 3500, addMax: 7000 },
    ],
  },
  {
    id: 'isolation', label: 'Isolation', emoji: '🧱', typeEquiv: 'renovation_partielle',
    keywords: ['isolation', 'ite', 'iti', 'combles', 'plancher bas', 'pare-vapeur', 'laine de verre', 'laine de roche'],
    questions: [
      { id: 'surface', label: 'Surface à isoler', type: 'number', unit: 'm²', placeholder: '100', sub: 'La surface isolée est la base du calcul (€/m² selon la solution choisie)' },
      { id: 'type', label: 'Type d\'isolation', type: 'choice', sub: 'L\'ITE améliore aussi l\'esthétique de façade mais coûte 3 à 5× plus cher que les combles',
        choices: ['Combles perdus (soufflage)', 'Isolation par l\'extérieur — ITE', 'Isolation intérieure — ITI', 'Plancher bas / vide sanitaire'],
        choiceImpact: { 'Combles perdus (soufflage)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Isolation par l\'extérieur — ITE': { addMin: 3000, addAvg: 8000, addMax: 18000 }, 'Isolation intérieure — ITI': { addMin: 1000, addAvg: 3000, addMax: 7000 }, 'Plancher bas / vide sanitaire': { addMin: 500, addAvg: 2000, addMax: 5000 } } },
      { id: 'humidite', label: 'Y a-t-il des problèmes d\'humidité ou infiltrations à traiter avant ?', type: 'yesno', sub: 'Traitement hydrofuge, drainage ou cuvelage avant de poser l\'isolant', addMin: 1500, addAvg: 4000, addMax: 9000 },
      { id: 'menuiseries', label: 'Faut-il remplacer les fenêtres en même temps ?', type: 'yesno', sub: 'Cohérence thermique recommandée — double ou triple vitrage', addMin: 2000, addAvg: 5000, addMax: 12000 },
    ],
  },
  {
    id: 'electricite', label: 'Électricité', emoji: '⚡', typeEquiv: 'renovation_partielle',
    keywords: ['électricité', 'electricite', 'tableau électrique', 'mise aux normes', 'vmc', 'domotique', 'prises', 'câblage'],
    questions: [
      { id: 'surface', label: 'Surface du logement concernée', type: 'number', unit: 'm²', placeholder: '80', sub: 'Permet d\'estimer le nombre de circuits, de prises et de câbles nécessaires' },
      { id: 'type', label: 'Type de travaux électriques', type: 'choice', sub: 'Une rénovation complète comprend nouveau tableau + tous les circuits + prises + éclairage',
        choices: ['Rénovation complète (tableau + câblage + prises)', 'Mise aux normes partielle', 'Extension ou ajout de prises / circuits'],
        choiceImpact: { 'Rénovation complète (tableau + câblage + prises)': { addMin: 2000, addAvg: 5000, addMax: 10000 }, 'Mise aux normes partielle': { addMin: 0, addAvg: 0, addMax: 0 }, 'Extension ou ajout de prises / circuits': { addMin: -500, addAvg: -2000, addMax: -4000 } } },
      { id: 'vmc', label: 'Faut-il installer ou remplacer la VMC (ventilation) ?', type: 'yesno', sub: 'Obligatoire dans les logements construits après 1982', addMin: 800, addAvg: 2000, addMax: 5000 },
      { id: 'domotique', label: 'Souhaitez-vous intégrer de la domotique (éclairage intelligent, volets) ?', type: 'yesno', sub: 'Bus KNX ou protocole Z-Wave — câblage spécifique + programmation', addMin: 2000, addAvg: 5000, addMax: 12000 },
      { id: 'borne_recharge', label: 'Faut-il prévoir une borne de recharge pour véhicule électrique ?', type: 'yesno', sub: 'Wallbox 7 kW + circuit dédié depuis tableau — environ 1 journée d\'électricien', addMin: 1000, addAvg: 1800, addMax: 3500 },
    ],
  },
  {
    id: 'plomberie', label: 'Plomberie / chauffage', emoji: '🔧', typeEquiv: 'renovation_partielle',
    keywords: ['plomberie', 'chauffage', 'chaudière', 'radiateur', 'plancher chauffant', 'pompe à chaleur', 'pac', 'sanitaire'],
    questions: [
      { id: 'surface', label: 'Surface du logement', type: 'number', unit: 'm²', placeholder: '100', sub: 'La surface détermine la puissance de chauffage nécessaire (en kW)' },
      { id: 'type', label: 'Type de travaux de chauffage', type: 'choice', sub: 'La PAC air-eau est la solution la plus économique sur le long terme',
        choices: ['Remplacement chaudière gaz / fioul', 'Pompe à chaleur air-eau (PAC)', 'Plancher chauffant hydraulique', 'Radiateurs électriques uniquement'],
        choiceImpact: { 'Remplacement chaudière gaz / fioul': { addMin: 0, addAvg: 0, addMax: 0 }, 'Pompe à chaleur air-eau (PAC)': { addMin: 4000, addAvg: 8000, addMax: 15000 }, 'Plancher chauffant hydraulique': { addMin: 3000, addAvg: 7000, addMax: 14000 }, 'Radiateurs électriques uniquement': { addMin: -1000, addAvg: -3000, addMax: -5000 } } },
      { id: 'eau_chaude', label: 'Le chauffe-eau est-il à remplacer ?', type: 'yesno', sub: 'Durée de vie d\'un chauffe-eau : 10–15 ans — à remplacer si plus de 10 ans', addMin: 500, addAvg: 1200, addMax: 3000 },
      { id: 'reseaux', label: 'Les canalisations sont-elles à refaire (plomb ou acier galvanisé) ?', type: 'yesno', sub: 'Remplacement des tuyaux en plomb ou acier galvanisé — recommandé sur biens anciens', addMin: 3000, addAvg: 7000, addMax: 14000 },
    ],
  },
  {
    id: 'menuiseries', label: 'Menuiseries', emoji: '🪟', typeEquiv: 'renovation_partielle',
    keywords: ['menuiserie', 'fenêtre', 'fenetre', 'porte-fenêtre', 'porte fenetre', 'baie vitrée', 'baie vitree', 'volet', 'store'],
    questions: [
      { id: 'quantite', label: 'Nombre d\'ouvertures à remplacer', type: 'number', unit: 'fenêtres / portes', placeholder: '8', sub: 'Comptez chaque fenêtre, porte-fenêtre ou baie vitrée individuellement' },
      { id: 'materiau', label: 'Matériau choisi', type: 'choice', sub: 'L\'aluminium offre le meilleur rapport durabilité/entretien, le PVC le meilleur prix',
        choices: ['PVC (le moins cher)', 'Aluminium (le plus durable)', 'Bois (esthétique mais entretien régulier)', 'Mixte bois-alu'],
        choiceImpact: { 'PVC (le moins cher)': { addMin: 0, addAvg: 0, addMax: 0 }, 'Aluminium (le plus durable)': { addMin: 1000, addAvg: 2500, addMax: 5000 }, 'Bois (esthétique mais entretien régulier)': { addMin: 1500, addAvg: 3500, addMax: 7000 }, 'Mixte bois-alu': { addMin: 2000, addAvg: 4500, addMax: 9000 } } },
      { id: 'volets', label: 'Faut-il remplacer ou installer des volets ?', type: 'yesno', sub: 'Volets roulants électriques ou battants — à intégrer au devis menuiserie', addMin: 1500, addAvg: 3500, addMax: 7000 },
      { id: 'porte_entree', label: 'La porte d\'entrée est-elle à remplacer ?', type: 'yesno', sub: 'Porte blindée ou isolante — sécurité + économies d\'énergie', addMin: 800, addAvg: 2000, addMax: 4500 },
    ],
  },
  {
    id: 'ravalement', label: 'Ravalement façade', emoji: '🏛️', typeEquiv: 'renovation_partielle',
    keywords: ['ravalement', 'façade', 'facade', 'enduit', 'bardage'],
    questions: [
      { id: 'surface', label: 'Surface de façade à traiter', type: 'number', unit: 'm²', placeholder: '150', sub: 'Surface extérieure des murs hors ouvertures (fenêtres, portes)' },
      { id: 'type', label: 'Type de finition souhaitée', type: 'choice', sub: 'L\'enduit projeté est la solution la plus courante, l\'ITE la plus performante thermiquement',
        choices: ['Enduit projeté monocouche', 'Peinture façade (sur enduit sain)', 'Bardage bois ou composite', 'Isolation extérieure ITE + enduit'],
        choiceImpact: { 'Enduit projeté monocouche': { addMin: 0, addAvg: 0, addMax: 0 }, 'Peinture façade (sur enduit sain)': { addMin: -1000, addAvg: -2500, addMax: -5000 }, 'Bardage bois ou composite': { addMin: 2000, addAvg: 5000, addMax: 10000 }, 'Isolation extérieure ITE + enduit': { addMin: 5000, addAvg: 12000, addMax: 22000 } } },
      { id: 'echafaudage', label: 'La hauteur nécessite-t-elle un échafaudage au-delà du 1er étage ?', type: 'yesno', sub: 'Au-delà du 1er étage, un échafaudage tubulaire est obligatoire — coût fixe important', addMin: 1500, addAvg: 3500, addMax: 7000 },
      { id: 'fissures', label: 'Y a-t-il des fissures ou des infiltrations à traiter avant ?', type: 'yesno', sub: 'Rejointoiement, traitement hydrofuge, réparation des supports avant enduit', addMin: 1000, addAvg: 3000, addMax: 7000 },
    ],
  },
  {
    id: 'amenagement_interieur', label: 'Aménagement intérieur', emoji: '🛋️', typeEquiv: 'renovation_partielle',
    keywords: ['aménagement intérieur', 'amenagement interieur', 'cloison', 'parquet', 'carrelage intérieur', 'peinture', 'plâtrerie'],
    questions: [
      { id: 'surface', label: 'Surface à aménager', type: 'number', unit: 'm²', placeholder: '50', sub: 'La surface détermine la quantité de matériaux et le nombre d\'heures de main d\'œuvre' },
      { id: 'type', label: 'Type de travaux principaux', type: 'choice', sub: 'La création de cloisons implique aussi plâtrerie, électricité et peinture',
        choices: ['Peinture + revêtements de sol', 'Cloisons + plâtrerie + finitions', 'Parquet / carrelage + plinthes', 'Aménagement complet (tout corps d\'état)'],
        choiceImpact: { 'Peinture + revêtements de sol': { addMin: 0, addAvg: 0, addMax: 0 }, 'Cloisons + plâtrerie + finitions': { addMin: 1500, addAvg: 4000, addMax: 8000 }, 'Parquet / carrelage + plinthes': { addMin: 500, addAvg: 1500, addMax: 3000 }, 'Aménagement complet (tout corps d\'état)': { addMin: 3000, addAvg: 8000, addMax: 18000 } } },
      { id: 'demolition', label: 'Y a-t-il des cloisons ou revêtements à démolir / déposer ?', type: 'yesno', sub: 'Dépose de carrelage, parquet, abattage de cloisons — génère des gravats à évacuer', addMin: 800, addAvg: 2000, addMax: 5000 },
      { id: 'faux_plafond', label: 'Faut-il créer ou refaire des faux-plafonds ?', type: 'yesno', sub: 'Placo, BA13 ou dalles — intègre souvent l\'éclairage encastré', addMin: 1000, addAvg: 2500, addMax: 5500 },
    ],
  },
  {
    id: 'terrassement', label: 'Terrassement / VRD', emoji: '🚜', typeEquiv: 'exterieur',
    keywords: ['terrassement', 'vrd', 'voirie', 'assainissement', 'drainage', 'fouille', 'nivellement', 'remblai'],
    questions: [
      { id: 'surface', label: 'Surface concernée', type: 'number', unit: 'm²', placeholder: '300', sub: 'La surface et la profondeur à décaisser déterminent le volume de terres' },
      { id: 'type', label: 'Nature des travaux', type: 'choice', sub: 'L\'assainissement est souvent obligatoire lors d\'une construction neuve',
        choices: ['Terrassement / décaissement', 'Assainissement (fosse + épandage)', 'Drainage + remblai', 'VRD complet (réseaux + voirie)'],
        choiceImpact: { 'Terrassement / décaissement': { addMin: 0, addAvg: 0, addMax: 0 }, 'Assainissement (fosse + épandage)': { addMin: 5000, addAvg: 12000, addMax: 20000 }, 'Drainage + remblai': { addMin: 1000, addAvg: 4000, addMax: 8000 }, 'VRD complet (réseaux + voirie)': { addMin: 3000, addAvg: 10000, addMax: 20000 } } },
      { id: 'acces_engin', label: 'L\'accès chantier est-il difficile pour les engins ?', type: 'yesno', sub: 'Accès étroit, terrain en pente raide — nécessite des engins spéciaux ou mini-pelles', addMin: 1000, addAvg: 3000, addMax: 7000 },
    ],
  },
];

/** Convertit un nom de lot en slug simple */
function slugify(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Déduit l'emoji et les questions par défaut quand un lot ne correspond à aucun ELEMENT_DEF */
// ── Questions spécifiques par corps de métier ─────────────────────────────────
// 3 questions pertinentes à impact direct sur le prix, avec "Je ne sais pas encore"

interface TradeQuestionDef {
  emoji: string;
  keywords: string[];   // mots-clés dans le nom du lot (après normalisation)
  questions: ElemQuestion[];
}

const NSP = 'Je ne sais pas encore';
const NSP_IMPACT = { addMin: 0, addAvg: 0, addMax: 0 };

const TRADE_QUESTION_DEFS: TradeQuestionDef[] = [

  // ── Terrassier / Terrassement / VRD ─────────────────────────────────────────
  {
    emoji: '🚜',
    keywords: ['terrassier', 'terrassement', 'vrd', 'fouille', 'remblai', 'drainage'],
    questions: [
      { id: 'mini_pelle', label: 'Faut-il louer une mini-pelle pour les travaux ?',
        sub: 'Indispensable si la surface est > 50 m² ou si le sol est dur (argile, roche)',
        type: 'choice', choices: ['Oui', 'Non — travail manuel suffisant', NSP],
        choiceImpact: { 'Oui': { addMin: 600, addAvg: 1400, addMax: 2500 }, 'Non — travail manuel suffisant': NSP_IMPACT, [NSP]: NSP_IMPACT } },
      { id: 'evacuation', label: 'Y a-t-il des terres à évacuer hors du chantier ?',
        sub: 'Location de bennes + décharge agréée — coût variable selon le tonnage',
        type: 'yesno', addMin: 800, addAvg: 2000, addMax: 4500 },
      { id: 'acces_difficile', label: 'L\'accès au chantier est-il difficile pour les engins ?',
        sub: 'Chemin étroit, pas de camion possible = surcoût de manutention',
        type: 'yesno', addMin: 500, addAvg: 1500, addMax: 3500 },
    ],
  },

  // ── Paysagiste / Jardinier ───────────────────────────────────────────────────
  {
    emoji: '🌿',
    keywords: ['paysagiste', 'jardinier', 'espaces verts', 'plantations', 'gazon', 'pelouse'],
    questions: [
      { id: 'plantation', label: 'Prévoyez-vous la plantation d\'arbres ou d\'arbustes ?',
        sub: 'Arbres adultes, haies, massifs — le prix varie selon la taille et le nombre',
        type: 'choice', choices: ['Oui — quelques plants (< 10)', 'Oui — nombreux (10 plants et +)', 'Non', NSP],
        choiceImpact: {
          'Oui — quelques plants (< 10)': { addMin: 500, addAvg: 1500, addMax: 3500 },
          'Oui — nombreux (10 plants et +)': { addMin: 2000, addAvg: 5000, addMax: 10000 },
          'Non': NSP_IMPACT, [NSP]: NSP_IMPACT,
        } },
      { id: 'arrosage', label: 'Faut-il créer un point d\'eau ou un système d\'arrosage automatique ?',
        sub: 'Arrosage intégré au sol + programmateur — raccordement à l\'alimentation existante',
        type: 'yesno', addMin: 800, addAvg: 2500, addMax: 5500 },
      { id: 'engazonnement', label: 'Y a-t-il un engazonnement à réaliser (semis ou gazon en rouleau) ?',
        sub: 'Préparation du sol (fraisage, nivellement) + fourniture et pose du gazon',
        type: 'yesno', addMin: 500, addAvg: 1800, addMax: 4500 },
    ],
  },

  // ── Menuisier / Charpentier ──────────────────────────────────────────────────
  {
    emoji: '🪚',
    keywords: ['menuisier', 'charpentier', 'charpente', 'ossature', 'boiserie'],
    questions: [
      { id: 'type_bois', label: 'Quel type de bois est prévu pour la structure ou les ouvrages ?',
        sub: 'Le choix du bois est le 1er facteur de coût — le chêne coûte 3× le sapin',
        type: 'choice', choices: ['Sapin / épicéa (standard)', 'Douglas (mi-gamme, durable)', 'Chêne massif (haut de gamme)', NSP],
        choiceImpact: {
          'Sapin / épicéa (standard)': NSP_IMPACT,
          'Douglas (mi-gamme, durable)': { addMin: 1000, addAvg: 3000, addMax: 6000 },
          'Chêne massif (haut de gamme)': { addMin: 4000, addAvg: 9000, addMax: 18000 },
          [NSP]: NSP_IMPACT,
        } },
      { id: 'traitement', label: 'Le bois doit-il être traité (autoclave, lasure, peinture) ?',
        sub: 'Protection indispensable en extérieur contre l\'humidité et les insectes',
        type: 'yesno', addMin: 500, addAvg: 1500, addMax: 3500 },
      { id: 'poutres_apparentes', label: 'Y a-t-il des poutres apparentes à travailler ou à intégrer ?',
        sub: 'Dégraissage, rabotage, finition soignée — travail supplémentaire de qualité',
        type: 'yesno', addMin: 1500, addAvg: 4000, addMax: 8500 },
    ],
  },

  // ── Maçon / Maçonnerie ───────────────────────────────────────────────────────
  {
    emoji: '🧱',
    keywords: ['macon', 'maçon', 'maçonnerie', 'gros oeuvre', 'gros œuvre', 'beton', 'béton', 'parpaing'],
    questions: [
      { id: 'mur_porteur', label: 'Y a-t-il un mur porteur à démolir ou une ouverture à créer ?',
        sub: 'Démolition d\'un mur porteur = IPN + étude de structure obligatoire',
        type: 'yesno', addMin: 3000, addAvg: 7000, addMax: 16000 },
      { id: 'fondations', label: 'Des fondations sont-elles à créer (dalle, semelles) ?',
        sub: 'Indispensable pour une extension ou une construction neuve',
        type: 'yesno', addMin: 2500, addAvg: 6000, addMax: 12000 },
      { id: 'enduit', label: 'Les nouveaux murs doivent-ils être enduits ou coffragés ?',
        sub: 'Enduit de façade ou intérieur — finition nécessaire sur les parpaings bruts',
        type: 'yesno', addMin: 800, addAvg: 2500, addMax: 5500 },
    ],
  },

  // ── Électricien ──────────────────────────────────────────────────────────────
  {
    emoji: '⚡',
    keywords: ['electricien', 'électricien', 'electricite', 'électricité', 'tableau electrique', 'câblage', 'cablage', 'domotique', 'vmc'],
    questions: [
      { id: 'tableau', label: 'Le tableau électrique doit-il être remplacé ou mis aux normes ?',
        sub: 'Tableau NF C 15-100 obligatoire — coût variable selon la puissance souscrite',
        type: 'yesno', addMin: 1500, addAvg: 3500, addMax: 6000 },
      { id: 'exterieur', label: 'Y a-t-il des points électriques extérieurs à créer (éclairage, prises IP) ?',
        sub: 'Câblage sous gaine enterrée ou en façade + prises/spots étanches',
        type: 'yesno', addMin: 600, addAvg: 1800, addMax: 3500 },
      { id: 'domotique', label: 'Souhaitez-vous la domotique (prises connectées, alarme, volets motorisés) ?',
        sub: 'Box domotique + câblage spécifique + programmation — confort et sécurité',
        type: 'yesno', addMin: 1500, addAvg: 4000, addMax: 8000 },
    ],
  },

  // ── Plombier / Chauffagiste ──────────────────────────────────────────────────
  {
    emoji: '🔧',
    keywords: ['plombier', 'plomberie', 'chauffagiste', 'chauffage', 'chaudiere', 'chaudière', 'radiateur', 'sanitaire', 'pac'],
    questions: [
      { id: 'nouveau_raccordement', label: 'Y a-t-il un nouveau raccordement à l\'eau à créer ?',
        sub: 'Alimentation eau froide + évacuations — tranchée + raccordement réseau public',
        type: 'yesno', addMin: 1500, addAvg: 4000, addMax: 8000 },
      { id: 'chaudiere', label: 'Une chaudière, un chauffe-eau ou une pompe à chaleur est-il à installer ?',
        sub: 'Remplacement ou création — coût très variable selon la technologie choisie',
        type: 'choice', choices: ['Oui — chauffe-eau électrique', 'Oui — PAC ou chaudière', 'Non', NSP],
        choiceImpact: {
          'Oui — chauffe-eau électrique': { addMin: 500, addAvg: 1200, addMax: 2500 },
          'Oui — PAC ou chaudière': { addMin: 4000, addAvg: 9000, addMax: 18000 },
          'Non': NSP_IMPACT, [NSP]: NSP_IMPACT,
        } },
      { id: 'sanitaires', label: 'Des sanitaires complets (WC, douche, lavabo) sont-ils à installer ?',
        sub: 'Pose + raccordement + faïence éventuelle — prévoir aussi le carreleur',
        type: 'yesno', addMin: 1500, addAvg: 5000, addMax: 9000 },
    ],
  },

  // ── Carreleur ────────────────────────────────────────────────────────────────
  {
    emoji: '🪟',
    keywords: ['carreleur', 'carrelage', 'faience', 'faïence', 'dallage intérieur', 'pose de sol'],
    questions: [
      { id: 'surface', label: 'Quelle superficie de carrelage est prévue ?', type: 'number', unit: 'm²', placeholder: '40',
        sub: 'La surface est le principal facteur de coût (matière + pose au m²)' },
      { id: 'destination', label: 'Le carrelage est-il pour l\'intérieur ou l\'extérieur ?',
        sub: 'Le carrelage extérieur (antidérapant, gélifugé) coûte plus cher',
        type: 'choice', choices: ['Intérieur uniquement', 'Extérieur (terrasse, entrée)', 'Les deux', NSP],
        choiceImpact: {
          'Intérieur uniquement': NSP_IMPACT,
          'Extérieur (terrasse, entrée)': { addMin: 500, addAvg: 1500, addMax: 3500 },
          'Les deux': { addMin: 1000, addAvg: 2500, addMax: 5000 },
          [NSP]: NSP_IMPACT,
        } },
      { id: 'douche_italienne', label: 'Y a-t-il une douche à l\'italienne avec étanchéité (receveur à carreler) ?',
        sub: 'Complexe en chape spécifique + membrane d\'étanchéité — 2× plus cher que pose standard',
        type: 'yesno', addMin: 800, addAvg: 2500, addMax: 4500 },
    ],
  },

  // ── Peintre ──────────────────────────────────────────────────────────────────
  {
    emoji: '🎨',
    keywords: ['peintre', 'peinture', 'enduit', 'ravalement interieur', 'papier peint'],
    questions: [
      { id: 'surface', label: 'Quelle superficie est à peindre (murs + plafonds) ?', type: 'number', unit: 'm²', placeholder: '80',
        sub: 'Surface développée : compter largeur × hauteur de chaque mur' },
      { id: 'preparation', label: 'Y a-t-il des travaux de préparation importants (rebouchage, enduit lissé) ?',
        sub: 'Enduit de lissage sur supports dégradés = 30 à 50% du coût total peinture',
        type: 'yesno', addMin: 500, addAvg: 2000, addMax: 4500 },
      { id: 'plafonds', label: 'Les plafonds sont-ils à peindre ou à enduire également ?',
        sub: 'Plafond = travail en hauteur, plus contraignant — tarif majoré',
        type: 'yesno', addMin: 400, addAvg: 1500, addMax: 3000 },
    ],
  },

  // ── Serrurier / Métallerie ───────────────────────────────────────────────────
  {
    emoji: '🔩',
    keywords: ['serrurier', 'metallerie', 'métallerie', 'ferronnerie', 'serrurerie'],
    questions: [
      { id: 'type_ouvrage', label: 'Quel type d\'ouvrage métallique est prévu ?',
        sub: 'Le volume de travail varie fortement selon le type d\'ouvrage',
        type: 'choice', choices: ['Portail / clôture', 'Garde-corps / rambarde', 'Escalier métallique', 'Verrière / structure', NSP],
        choiceImpact: {
          'Portail / clôture': NSP_IMPACT,
          'Garde-corps / rambarde': { addMin: 500, addAvg: 2000, addMax: 5000 },
          'Escalier métallique': { addMin: 3000, addAvg: 8000, addMax: 18000 },
          'Verrière / structure': { addMin: 5000, addAvg: 15000, addMax: 35000 },
          [NSP]: NSP_IMPACT,
        } },
      { id: 'motorisation', label: 'Le portail ou le volet roulant sera-t-il motorisé ?',
        sub: 'Motorisation + télécommande + raccordement électrique',
        type: 'yesno', addMin: 1000, addAvg: 2500, addMax: 5000 },
      { id: 'thermolaquage', label: 'Faut-il un traitement de surface (thermolaquage, galvanisation) ?',
        sub: 'Protection longue durée contre la corrosion — obligatoire pour l\'extérieur',
        type: 'yesno', addMin: 400, addAvg: 1200, addMax: 2500 },
    ],
  },

  // ── Couvreur / Zingueur ──────────────────────────────────────────────────────
  {
    emoji: '🏠',
    keywords: ['couvreur', 'zingueur', 'gouttiere', 'gouttière', 'ardoise', 'tuile'],
    questions: [
      { id: 'type_couverture', label: 'Quel type de couverture est prévu ?',
        sub: 'L\'ardoise naturelle coûte 2 à 3× plus cher que la tuile béton',
        type: 'choice', choices: ['Tuile béton (standard)', 'Tuile terre cuite', 'Ardoise naturelle', 'Bac acier / zinc', NSP],
        choiceImpact: {
          'Tuile béton (standard)': NSP_IMPACT,
          'Tuile terre cuite': { addMin: 500, addAvg: 2000, addMax: 5000 },
          'Ardoise naturelle': { addMin: 3000, addAvg: 8000, addMax: 18000 },
          'Bac acier / zinc': { addMin: 1000, addAvg: 3000, addMax: 7000 },
          [NSP]: NSP_IMPACT,
        } },
      { id: 'charpente', label: 'La charpente doit-elle être réparée ou renforcée ?',
        sub: 'Remplacement de chevrons, pannes ou fermettes — souvent découvert en cours de chantier',
        type: 'yesno', addMin: 2000, addAvg: 5000, addMax: 12000 },
      { id: 'gouttières', label: 'Y a-t-il des gouttières et descentes d\'eau à remplacer ?',
        sub: 'Zinc, aluminium ou PVC — longueur totale de l\'habitation',
        type: 'yesno', addMin: 800, addAvg: 2000, addMax: 4500 },
    ],
  },

  // ── Isolant / Thermicien ─────────────────────────────────────────────────────
  {
    emoji: '🌡️',
    keywords: ['isolation', 'isolant', 'thermicien', 'combles', 'ite', 'iti', 'pare vapeur'],
    questions: [
      { id: 'type_isolation', label: 'Quel type d\'isolation est prévu ?',
        sub: 'ITE (extérieure) est 2× plus chère que l\'isolation par soufflage des combles',
        type: 'choice', choices: ['Combles soufflés (laine)', 'Isolation par l\'intérieur (ITI)', 'Isolation par l\'extérieur (ITE)', NSP],
        choiceImpact: {
          'Combles soufflés (laine)': NSP_IMPACT,
          'Isolation par l\'intérieur (ITI)': { addMin: 1000, addAvg: 4000, addMax: 9000 },
          'Isolation par l\'extérieur (ITE)': { addMin: 6000, addAvg: 15000, addMax: 30000 },
          [NSP]: NSP_IMPACT,
        } },
      { id: 'pare_vapeur', label: 'Un pare-vapeur ou frein vapeur est-il à poser ?',
        sub: 'Indispensable en zone humide ou sous chape béton — protection longue durée',
        type: 'yesno', addMin: 300, addAvg: 800, addMax: 2000 },
      { id: 'surface', label: 'Surface approximative à isoler', type: 'number', unit: 'm²', placeholder: '100',
        sub: 'La surface est la base du calcul au m² (pose + fourniture)' },
    ],
  },

  // ── Façadier / Ravaleur ──────────────────────────────────────────────────────
  {
    emoji: '🏛️',
    keywords: ['façadier', 'facadier', 'ravalement', 'bardage', 'enduit facade', 'crépi'],
    questions: [
      { id: 'type_finition', label: 'Quelle finition de façade est prévue ?',
        sub: 'Le bardage bois ou composite coûte plus cher mais dure plus longtemps',
        type: 'choice', choices: ['Enduit taloché (standard)', 'Enduit gratté / projeté', 'Bardage bois ou composite', 'Pierre reconstituée', NSP],
        choiceImpact: {
          'Enduit taloché (standard)': NSP_IMPACT,
          'Enduit gratté / projeté': { addMin: 0, addAvg: 500, addMax: 2000 },
          'Bardage bois ou composite': { addMin: 3000, addAvg: 8000, addMax: 18000 },
          'Pierre reconstituée': { addMin: 5000, addAvg: 12000, addMax: 25000 },
          [NSP]: NSP_IMPACT,
        } },
      { id: 'echafaudage', label: 'Un échafaudage de chantier est-il nécessaire ?',
        sub: 'Location d\'échafaudage pour R+1 et plus — obligatoire pour la sécurité',
        type: 'yesno', addMin: 800, addAvg: 2500, addMax: 6000 },
      { id: 'nettoyage', label: 'La façade existante nécessite-t-elle un nettoyage ou un décapage préalable ?',
        sub: 'Hydrogommage, sablage ou traitement hydrofuge avant application du nouveau revêtement',
        type: 'yesno', addMin: 500, addAvg: 1500, addMax: 3500 },
    ],
  },
];

/**
 * Retourne les questions spécifiques au corps de métier détecté,
 * ou des questions génériques en fallback.
 */
function inferGenericElement(lotNom: string): ProjectElementDef {
  const lower = lotNom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Chercher dans le dictionnaire des métiers
  for (const trade of TRADE_QUESTION_DEFS) {
    const keywordsNorm = trade.keywords.map(k =>
      k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    );
    if (keywordsNorm.some(kw => lower.includes(kw))) {
      return {
        id: slugify(lotNom),
        label: lotNom,
        emoji: trade.emoji,
        keywords: [lower],
        typeEquiv: 'exterieur',
        questions: trade.questions,
      };
    }
  }

  // Fallback générique (corps de métier non reconnu)
  return {
    id: slugify(lotNom),
    label: lotNom,
    emoji: '🔨',
    keywords: [lower],
    typeEquiv: 'exterieur',
    questions: [
      { id: 'complexite', label: 'Quel est le niveau de complexité des travaux ?',
        sub: 'Un chantier simple et accessible coûte moins cher qu\'un travail sur mesure',
        type: 'choice', choices: ['Simple (accès facile, standard)', 'Moyen (quelques contraintes)', 'Complexe (sur mesure ou accès difficile)', NSP],
        choiceImpact: {
          'Simple (accès facile, standard)': NSP_IMPACT,
          'Moyen (quelques contraintes)': { addMin: 500, addAvg: 1500, addMax: 3000 },
          'Complexe (sur mesure ou accès difficile)': { addMin: 2000, addAvg: 5000, addMax: 10000 },
          [NSP]: NSP_IMPACT,
        } },
      { id: 'acces', label: 'L\'accès au chantier est-il difficile (intérieur, étage, espace réduit) ?',
        sub: 'Contrainte d\'accès = surcoût de main d\'œuvre et de manutention',
        type: 'yesno', addMin: 400, addAvg: 1200, addMax: 2500 },
      { id: 'urgence', label: 'Les travaux sont-ils urgents (délai < 1 mois) ?',
        sub: 'Une intervention urgente peut majorer le tarif de 15 à 30%',
        type: 'yesno', addMin: 300, addAvg: 1000, addMax: 2000 },
    ],
  };
}

/**
 * Construit la liste des éléments détectables en utilisant les lots IA comme source primaire.
 * Pour chaque lot, cherche une définition correspondante dans ELEMENT_DEFS ;
 * si aucune correspondance, crée un élément générique avec des questions pertinentes.
 * Complète ensuite avec une analyse textuelle du prompt.
 */
function buildElementsFromLots(
  lots: { nom: string }[],
  promptText: string,
): ProjectElementDef[] {
  const result: ProjectElementDef[] = [];
  const addedIds = new Set<string>();

  // Priorité 1 : utiliser les lots déjà identifiés par l'IA
  for (const lot of lots) {
    const lower = lot.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let matched = false;

    for (const def of ELEMENT_DEFS) {
      if (!addedIds.has(def.id)) {
        const defKeywordsNorm = def.keywords.map(k =>
          k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
        );
        if (defKeywordsNorm.some(kw => lower.includes(kw))) {
          result.push(def);
          addedIds.add(def.id);
          matched = true;
          break;
        }
      }
    }

    // Lot non couvert par les définitions → créer un élément générique
    if (!matched) {
      const generic = inferGenericElement(lot.nom);
      if (!addedIds.has(generic.id)) {
        result.push(generic);
        addedIds.add(generic.id);
      }
    }
  }

  // Priorité 2 : compléter avec le texte du prompt (pour les éléments hors lots)
  const lowerPrompt = promptText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const def of ELEMENT_DEFS) {
    if (!addedIds.has(def.id)) {
      const defKeywordsNorm = def.keywords.map(k =>
        k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
      );
      if (defKeywordsNorm.some(kw => lowerPrompt.includes(kw))) {
        result.push(def);
        addedIds.add(def.id);
      }
    }
  }

  return result;
}

/** Ancienne fonction (utilisée quand resultLots est vide) */
function detectElements(text: string): ProjectElementDef[] {
  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const result: ProjectElementDef[] = [];
  for (const def of ELEMENT_DEFS) {
    const defKeywordsNorm = def.keywords.map(k =>
      k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    );
    if (defKeywordsNorm.some(kw => lower.includes(kw))) {
      result.push(def);
    }
  }
  return result;
}

interface BreakdownItem {
  id: string;
  label: string;
  emoji: string;
  min: number;
  max: number;
}

interface AffinageAnswers {
  confirmedElements: string[];
  elementAnswers: Record<string, Record<string, string | number>>;
}

const INITIAL_ANSWERS: AffinageAnswers = {
  confirmedElements: [],
  elementAnswers: {},
};

function computeRefinedRange(
  baseMin: number, baseMax: number, a: AffinageAnswers,
  detectedEls?: ProjectElementDef[],
  lots?: { nom: string; budget_min_ht?: number | null; budget_max_ht?: number | null }[],
): { min: number; max: number; breakdown: BreakdownItem[] } {
  if (baseMin === 0 && baseMax === 0) return { min: 0, max: 0, breakdown: [] };

  const confirmed = a.confirmedElements
    .map(id => detectedEls?.find(e => e.id === id))
    .filter((d): d is ProjectElementDef => !!d);

  if (confirmed.length === 0) return { min: baseMin, max: baseMax, breakdown: [] };

  // Match each element to its lot budget
  function findLot(elem: ProjectElementDef) {
    return lots?.find(l =>
      l.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(
        elem.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 6),
      ) ||
      elem.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(
        l.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 6),
      )
    );
  }

  // Split base budget proportionally across elements using lot budgets
  const matchedLots = confirmed.map(e => findLot(e));
  const totalMatchedMin = matchedLots.reduce((s, l) => s + (l?.budget_min_ht ?? 0), 0);
  const totalMatchedMax = matchedLots.reduce((s, l) => s + (l?.budget_max_ht ?? 0), 0);
  const unmatchedCount  = matchedLots.filter(l => !l || !(l.budget_min_ht ?? 0)).length;
  const remainingMin    = Math.max(0, baseMin - totalMatchedMin);
  const remainingMax    = Math.max(0, baseMax - totalMatchedMax);
  const splitMin        = unmatchedCount > 0 ? remainingMin / unmatchedCount : 0;
  const splitMax        = unmatchedCount > 0 ? remainingMax / unmatchedCount : 0;

  // Compute per-element impacts from question answers
  const breakdown: BreakdownItem[] = [];
  let addMin = 0; let addMax = 0;

  for (let i = 0; i < confirmed.length; i++) {
    const def = confirmed[i];
    const lot = matchedLots[i];
    const lotMin = (lot?.budget_min_ht ?? 0) > 0 ? (lot?.budget_min_ht ?? 0) : splitMin;
    const lotMax = (lot?.budget_max_ht ?? 0) > 0 ? (lot?.budget_max_ht ?? 0) : splitMax;

    let elemAddMin = 0; let elemAddMax = 0;
    if (def.isCustom) {
      elemAddMin = def.customBudgetMin ?? 0;
      elemAddMax = def.customBudgetMax ?? 0;
    } else {
      const ea = a.elementAnswers[def.id] ?? {};
      for (const q of def.questions) {
        if (q.type === 'yesno' && ea[q.id] === 'oui') {
          elemAddMin += q.addMin ?? 0; elemAddMax += q.addMax ?? 0;
        } else if (q.type === 'choice' && q.choiceImpact) {
          const impact = q.choiceImpact[ea[q.id] as string];
          if (impact) { elemAddMin += impact.addMin; elemAddMax += impact.addMax; }
        }
      }
    }

    const elemMin = def.isCustom ? elemAddMin : (lotMin + elemAddMin);
    const elemMax = def.isCustom ? elemAddMax : (lotMax + elemAddMax);
    addMin += def.isCustom ? elemAddMin : elemAddMin;
    addMax += def.isCustom ? elemAddMax : elemAddMax;

    breakdown.push({
      id: def.id, label: def.label, emoji: def.emoji,
      min: Math.round(elemMin / 100) * 100,
      max: Math.round(elemMax / 100) * 100,
    });
  }

  return {
    min:  Math.round((baseMin + addMin) / 100) * 100,
    max:  Math.round((baseMax + addMax) / 100) * 100,
    breakdown,
  };
}

function computeScore(a: AffinageAnswers, detectedEls?: ProjectElementDef[]): number {
  if (a.confirmedElements.length === 0) return 0;
  let answered = 0; let total = 0;
  for (const elemId of a.confirmedElements) {
    const def = detectedEls?.find(e => e.id === elemId);
    if (!def || def.isCustom) continue; // les éléments perso sont déjà "répondus"
    total += def.questions.length;
    const ea = a.elementAnswers[elemId] ?? {};
    for (const q of def.questions) {
      if (ea[q.id] !== undefined && ea[q.id] !== '') answered++;
    }
  }
  if (total === 0) return 1;
  const ratio = answered / total;
  if (ratio >= 0.8) return 5; if (ratio >= 0.5) return 4; if (ratio >= 0.3) return 3; return 2;
}

function ScoreBadge({ score }: { score: number }) {
  const cfg = score <= 1
    ? { label: '🟡 Fiabilité faible',   cls: 'bg-amber-50  text-amber-700  border-amber-200'  }
    : score <= 3
    ? { label: '🔵 Fiabilité moyenne',  cls: 'bg-blue-50   text-blue-700   border-blue-100'   }
    : { label: '🟢 Fiabilité élevée',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Modal affinage budget ─────────────────────────────────────────────────────

function BudgetAffinageModal({
  baseMin, baseMax, resultNom, isImmeuble, resultDescription, resultLots,
  onClose, onValidate,
}: {
  baseMin: number; baseMax: number; resultNom: string; isImmeuble: boolean;
  resultDescription?: string;
  resultLots?: { nom: string; budget_min_ht?: number | null; budget_max_ht?: number | null }[];
  onClose: () => void; onValidate: (min: number, max: number, breakdown: BreakdownItem[]) => void;
}) {
  // ── Détection éléments — lots IA comme source primaire ───────────────────
  // Les lots générés par l'IA contiennent déjà tous les types de travaux détectés.
  // On les utilise en priorité, puis on complète avec le texte du prompt.
  const promptText = useMemo(
    () => [resultNom, resultDescription ?? ''].join(' '),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [detectedElements, setDetectedElements] = useState<ProjectElementDef[]>(() =>
    buildElementsFromLots(resultLots ?? [], promptText),
  );

  const [step, setStep] = useState(1);
  const [diyAnswer, setDiyAnswer] = useState<'non' | 'oui' | 'nsp' | null>(null);
  const [diyDetail, setDiyDetail]  = useState('');
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customLabel, setCustomLabel]       = useState('');
  const [customBudMin, setCustomBudMin]     = useState('');
  const [customBudMax, setCustomBudMax]     = useState('');

  function handleAddCustom() {
    const label = customLabel.trim();
    if (!label) return;
    const min = customBudMin ? Math.max(0, Math.round(Number(customBudMin))) : 0;
    const max = customBudMax ? Math.max(0, Math.round(Number(customBudMax))) : 0;
    const id = `custom_${Date.now()}`;
    const def: ProjectElementDef = {
      id, label, emoji: '✏️', keywords: [], typeEquiv: 'renovation_partielle',
      questions: [], isCustom: true,
      customBudgetMin: min || undefined,
      customBudgetMax: max || undefined,
    };
    addCustomElement(def);
    setCustomLabel(''); setCustomBudMin(''); setCustomBudMax('');
    setShowCustomForm(false);
  }

  const [answers, setAnswers] = useState<AffinageAnswers>(() => ({
    ...INITIAL_ANSWERS,
    // Pré-sélectionner tous les éléments détectés depuis les lots IA
    confirmedElements: buildElementsFromLots(resultLots ?? [], promptText).map(e => e.id),
  }));

  // Séquence : confirm_elements → une étape par élément confirmé (toutes les questions sont contextuelles)
  const stepKeys = useMemo(() => {
    const keys: string[] = ['confirm_elements'];
    for (const elemId of answers.confirmedElements) {
      const def = detectedElements.find(e => e.id === elemId);
      // Les éléments personnalisés n'ont pas d'étape questions (budget renseigné à la création)
      if (def && def.questions.length > 0 && !def.isCustom) keys.push(`elem_${elemId}`);
    }
    keys.push('diy'); // Question DIY toujours en dernière position
    return keys;
  }, [answers.confirmedElements, detectedElements]);

  const TOTAL_STEPS = stepKeys.length;
  const currentKey  = stepKeys[step - 1] ?? 'confirm_elements';

  const refined = useMemo(
    () => computeRefinedRange(baseMin, baseMax, answers, detectedElements, resultLots ?? []),
    [baseMin, baseMax, answers, detectedElements, resultLots],
  );
  const score   = useMemo(() => computeScore(answers, detectedElements), [answers, detectedElements]);
  const hasBase = baseMin > 0 || baseMax > 0;

  const upd = useCallback(<K extends keyof AffinageAnswers>(key: K, val: AffinageAnswers[K]) => {
    setAnswers(prev => ({ ...prev, [key]: val }));
  }, []);

  function toggleElement(id: string) {
    setAnswers(prev => {
      const s = new Set(prev.confirmedElements);
      s.has(id) ? s.delete(id) : s.add(id);
      return { ...prev, confirmedElements: Array.from(s) };
    });
  }

  function addCustomElement(def: ProjectElementDef) {
    if (!detectedElements.find(e => e.id === def.id)) {
      setDetectedElements(prev => [...prev, def]);
    }
    setAnswers(prev => {
      if (prev.confirmedElements.includes(def.id)) return prev;
      return { ...prev, confirmedElements: [...prev.confirmedElements, def.id] };
    });
  }

  function updElemAnswer(elemId: string, qId: string, val: string | number) {
    setAnswers(prev => ({
      ...prev,
      elementAnswers: {
        ...prev.elementAnswers,
        [elemId]: { ...(prev.elementAnswers[elemId] ?? {}), [qId]: val },
      },
    }));
  }

  const safeNext = () => {
    const nextStep = step + 1;
    if (!stepKeys[nextStep - 1]) return;
    setStep(nextStep);
  };

  const canNext = (() => {
    if (currentKey === 'confirm_elements') return answers.confirmedElements.length > 0;
    return true; // Les étapes par élément sont toutes facultatives
  })();

  const CHOICE_BASE = 'flex flex-col items-start gap-1 px-4 py-3.5 rounded-2xl border-2 cursor-pointer transition-all text-left w-full';
  const CHOICE_ON   = 'border-blue-500 bg-blue-50 text-blue-900';
  const CHOICE_OFF  = 'border-gray-100 bg-white hover:border-blue-200 text-gray-700';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl flex flex-col max-h-[92vh] sm:max-h-[85vh] shadow-2xl overflow-hidden">

        {/* Header modal */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 text-lg">Affiner mon budget</h2>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Stepper */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i + 1 < step ? 'bg-blue-500' : i + 1 === step ? 'bg-blue-400' : 'bg-gray-100'
              }`} />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Étape {step} sur {TOTAL_STEPS}</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">

          {/* Estimation live */}
          {hasBase && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl px-5 py-3.5 flex items-center justify-between mb-4 border border-blue-100">
              <div>
                <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-0.5">Estimation actuelle</p>
                <p className="text-2xl font-extrabold text-blue-900 leading-none">
                  {refined.min > 0 ? `${fmtK(refined.min)} – ${fmtK(refined.max)}` : `${fmtK(baseMin)} – ${fmtK(baseMax)}`}
                </p>
              </div>
              <ScoreBadge score={score} />
            </div>
          )}

          {/* Étape 1 — Confirmation des éléments du projet */}
          {currentKey === 'confirm_elements' && (
            <div className="space-y-2">
              <p className="font-semibold text-gray-900 mb-1">Confirmez les éléments de votre projet</p>
              <p className="text-sm text-gray-400 mb-3">
                {detectedElements.length > 0
                  ? 'Nous avons identifié ces éléments — décochez ceux qui ne sont pas prévus'
                  : 'Sélectionnez les éléments de votre projet'}
              </p>

              {detectedElements.map(elem => {
                const active = answers.confirmedElements.includes(elem.id);
                return (
                  <button key={elem.id} onClick={() => toggleElement(elem.id)}
                    className={`${CHOICE_BASE} ${active ? CHOICE_ON : CHOICE_OFF}`}>
                    <div className="flex items-center gap-2 w-full">
                      <span className="text-lg">{elem.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-left">{elem.label}</p>
                        {elem.isCustom && (elem.customBudgetMin || elem.customBudgetMax) && (
                          <p className="text-[10px] text-blue-600 opacity-70 mt-0.5">
                            {elem.customBudgetMin ? fmtK(elem.customBudgetMin) : '?'}{' '}–{' '}
                            {elem.customBudgetMax ? fmtK(elem.customBudgetMax) : '?'}
                          </p>
                        )}
                        {elem.isCustom && !elem.customBudgetMin && !elem.customBudgetMax && (
                          <p className="text-[10px] text-blue-400 opacity-70 mt-0.5">Budget non estimé</p>
                        )}
                      </div>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                        active ? 'border-blue-500 bg-blue-500' : 'border-gray-200'
                      }`}>
                        {active && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Ajouter un élément manquant */}
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2">Un élément manque ?</p>
                <div className="flex flex-wrap gap-2">
                  {ELEMENT_DEFS.filter(d => !detectedElements.find(e => e.id === d.id)).map(d => (
                    <button key={d.id} onClick={() => addCustomElement(d)}
                      className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-full px-3 py-1.5 transition-all">
                      <span>{d.emoji}</span>+ {d.label}
                    </button>
                  ))}
                  {/* Chip "Autre..." */}
                  {!showCustomForm && (
                    <button onClick={() => setShowCustomForm(true)}
                      className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 border-dashed rounded-full px-3 py-1.5 transition-all">
                      ✏️ + Autre...
                    </button>
                  )}
                </div>

                {/* Formulaire inline "Autre" */}
                {showCustomForm && (
                  <div className="mt-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-4 space-y-3">
                    <p className="text-xs font-bold text-blue-900 uppercase tracking-wider">Ajouter un autre élément</p>
                    <input
                      type="text"
                      placeholder="Ex : Réfection toiture, Création bureau…"
                      value={customLabel}
                      onChange={e => setCustomLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && customLabel.trim()) handleAddCustom(); if (e.key === 'Escape') { setShowCustomForm(false); setCustomLabel(''); } }}
                      className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      autoFocus
                    />
                    <div>
                      <p className="text-[10px] font-semibold text-blue-700 mb-1.5">Estimation budgétaire (optionnel)</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <p className="text-[10px] text-blue-500 mb-1">Min €</p>
                          <input
                            type="number" min="0" placeholder="5 000"
                            value={customBudMin} onChange={e => setCustomBudMin(e.target.value)}
                            className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400"
                          />
                        </div>
                        <span className="text-gray-400 mt-4 shrink-0">–</span>
                        <div className="flex-1">
                          <p className="text-[10px] text-blue-500 mb-1">Max €</p>
                          <input
                            type="number" min="0" placeholder="15 000"
                            value={customBudMax} onChange={e => setCustomBudMax(e.target.value)}
                            className="w-full border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-blue-400 mt-1.5 leading-relaxed">
                        💡 Laissez vide si vous n'avez pas encore d'estimation — l'élément sera quand même ajouté à votre liste.
                      </p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { setShowCustomForm(false); setCustomLabel(''); setCustomBudMin(''); setCustomBudMax(''); }}
                        className="flex-1 py-2.5 text-sm text-gray-500 border border-gray-200 bg-white rounded-xl hover:bg-gray-50 transition-colors">
                        Annuler
                      </button>
                      <button
                        onClick={handleAddCustom}
                        disabled={!customLabel.trim()}
                        className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors">
                        + Ajouter
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {answers.confirmedElements.length === 0 && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-2.5 mt-1">
                  <span className="text-sm shrink-0">⚠️</span>
                  <p className="text-xs text-amber-700">Sélectionnez au moins un élément pour continuer</p>
                </div>
              )}
            </div>
          )}

          {/* Étapes par élément — questions contextuelles */}
          {currentKey.startsWith('elem_') && (() => {
            const elemId = currentKey.slice(5);
            const def = detectedElements.find(e => e.id === elemId);
            if (!def) return null;
            const ea = answers.elementAnswers[elemId] ?? {};
            return (
              <div className="space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{def.emoji}</span>
                  <p className="font-semibold text-gray-900">{def.label}</p>
                </div>
                <p className="text-sm text-gray-400 -mt-3">Répondez aux questions ci-dessous pour affiner votre estimation</p>
                {def.questions.map(q => (
                  <div key={q.id}>
                    <label className="text-sm font-semibold text-gray-800 mb-0.5 block">{q.label}</label>
                    {q.sub && <p className="text-xs text-gray-400 mb-2 leading-relaxed">{q.sub}</p>}
                    {q.type === 'number' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="0" placeholder={q.placeholder}
                          value={ea[q.id] ?? ''}
                          onChange={e => updElemAnswer(elemId, q.id, e.target.value ? Number(e.target.value) : '')}
                          className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                        {q.unit && <span className="text-sm font-medium text-gray-400 shrink-0">{q.unit}</span>}
                      </div>
                    ) : q.type === 'yesno' ? (
                      <div className="grid grid-cols-2 gap-2">
                        {(['oui', 'non'] as const).map(v => {
                          const active = ea[q.id] === v;
                          const isOui = v === 'oui';
                          return (
                            <button key={v} onClick={() => updElemAnswer(elemId, q.id, v)}
                              className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                                active
                                  ? isOui ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-400 bg-gray-100 text-gray-700'
                                  : 'border-gray-100 hover:border-gray-300 text-gray-600'
                              }`}>
                              {isOui ? '✓ Oui' : '✗ Non'}
                              {active && isOui && q.addMax && q.addMax > 0 && (
                                <span className="ml-1.5 text-[10px] opacity-70">+{fmtK(q.addMax)} max</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {q.choices?.map(choice => (
                          <button key={choice} onClick={() => updElemAnswer(elemId, q.id, choice)}
                            className={`${CHOICE_BASE} ${ea[q.id] === choice ? CHOICE_ON : CHOICE_OFF} w-full text-left`}>
                            <div className="flex items-center gap-2 w-full">
                              <div className="flex-1">
                                <p className="font-semibold text-sm">{choice}</p>
                                {q.choiceImpact?.[choice] && (() => {
                                  const imp = q.choiceImpact![choice];
                                  const delta = imp.addAvg;
                                  if (delta === 0) return <p className="text-[10px] text-gray-400">Prix de référence</p>;
                                  return (
                                    <p className={`text-[10px] font-medium ${delta > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                      {delta > 0 ? `+${fmtK(delta)} en moyenne` : `${fmtK(delta)} en moyenne`}
                                    </p>
                                  );
                                })()}
                              </div>
                              {ea[q.id] === choice && <Check className="h-4 w-4 text-blue-500 shrink-0" />}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Étape DIY — travaux réalisés soi-même */}
          {currentKey === 'diy' && (
            <div className="space-y-4">
              <div className="mb-1">
                <p className="font-semibold text-gray-900 mb-1">Pensez-vous réaliser certains travaux vous-même ?</p>
                <p className="text-sm text-gray-400 leading-relaxed">Peinture, petits aménagements, plantations… Indiquez ce que vous comptez faire pour que nous adaptions les conseils.</p>
              </div>

              {/* Non */}
              <button onClick={() => { setDiyAnswer('non'); setDiyDetail(''); }}
                className={`${CHOICE_BASE} ${diyAnswer === 'non' ? CHOICE_ON : CHOICE_OFF}`}>
                <div className="flex items-center gap-3 w-full">
                  <span className="text-lg shrink-0">🙅</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-left">Non — je délègue tout à des professionnels</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Le budget affiché correspond à une réalisation 100% artisans</p>
                  </div>
                  {diyAnswer === 'non' && <Check className="h-4 w-4 text-blue-500 shrink-0" />}
                </div>
              </button>

              {/* Oui */}
              <div className={`${CHOICE_BASE} ${diyAnswer === 'oui' ? CHOICE_ON : CHOICE_OFF} cursor-pointer`}
                onClick={() => setDiyAnswer('oui')}>
                <div className="flex items-start gap-3 w-full">
                  <span className="text-lg shrink-0 mt-0.5">🔨</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-left mb-1">Oui — je prévois de faire certains travaux moi-même</p>
                    {diyAnswer === 'oui' && (
                      <textarea
                        value={diyDetail}
                        onChange={e => setDiyDetail(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        placeholder="Lesquels ? Ex : peinture des murs, plantations, montage de meubles…"
                        className="w-full text-sm border border-blue-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none mt-1"
                        rows={2}
                        autoFocus
                      />
                    )}
                  </div>
                  {diyAnswer === 'oui' && <Check className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />}
                </div>
              </div>

              {/* Je ne sais pas encore */}
              <button onClick={() => { setDiyAnswer('nsp'); setDiyDetail(''); }}
                className={`${CHOICE_BASE} ${diyAnswer === 'nsp' ? CHOICE_ON : CHOICE_OFF}`}>
                <div className="flex items-center gap-3 w-full">
                  <span className="text-lg shrink-0">🤔</span>
                  <p className="flex-1 font-semibold text-sm text-left">Je ne sais pas encore</p>
                  {diyAnswer === 'nsp' && <Check className="h-4 w-4 text-blue-500 shrink-0" />}
                </div>
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          {step < TOTAL_STEPS ? (
            <div className="flex items-center gap-3">
              {step > 1 && (
                <button onClick={() => setStep(s => s - 1)}
                  className="w-11 h-11 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors shrink-0">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <button onClick={safeNext} disabled={!canNext}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm transition-all ${
                  canNext ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}>
                {currentKey === 'confirm_elements' && answers.confirmedElements.length === 0
                  ? 'Sélectionnez au moins un élément'
                  : 'Continuer'}
                {canNext && <ChevronRight className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <ScoreBadge score={score} />
                <span className="text-xs text-gray-400">{score} / 5 informations renseignées</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(s => s - 1)}
                  className="w-11 h-11 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors shrink-0">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onValidate(refined.min || baseMin, refined.max || baseMax, refined.breakdown)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all">
                  <Check className="h-4 w-4" /> Valider mon estimation
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
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

// ── Explication budget MO / Matériaux ─────────────────────────────────────────

function BudgetExplication({ lots }: { lots: import('@/types/chantier-ia').LotChantier[] }) {
  const lotsWithData = lots.filter(l => (l.main_oeuvre_ht ?? 0) > 0 || (l.materiaux_ht ?? 0) > 0);
  if (lotsWithData.length === 0) return null;

  const totalMO    = lotsWithData.reduce((s, l) => s + (l.main_oeuvre_ht ?? 0), 0);
  const totalMat   = lotsWithData.reduce((s, l) => s + (l.materiaux_ht   ?? 0), 0);
  const totalDivers= lotsWithData.reduce((s, l) => s + (l.divers_ht      ?? 0), 0);
  const total      = totalMO + totalMat + totalDivers || 1;

  const TAUX_HORAIRE = 55; // €/h moyen bâtiment TTC
  const totalHeures  = totalMO > 0 ? Math.round(totalMO / TAUX_HORAIRE) : 0;

  const pctMO    = Math.round((totalMO    / total) * 100);
  const pctMat   = Math.round((totalMat   / total) * 100);
  const pctDivers= 100 - pctMO - pctMat;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">

      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xl">🔍</span>
        <div>
          <h3 className="font-semibold text-gray-900">Comprendre votre budget</h3>
          <p className="text-xs text-gray-400">Main d'œuvre · Matériaux · Ce que vous payez vraiment</p>
        </div>
      </div>

      {/* Barre de répartition totale */}
      <div className="mb-5">
        <div className="flex h-4 rounded-full overflow-hidden gap-px">
          {pctMO   > 0 && <div className="bg-blue-500 transition-all duration-500"   style={{ width: `${pctMO}%`    }} />}
          {pctMat  > 0 && <div className="bg-amber-400 transition-all duration-500"  style={{ width: `${pctMat}%`   }} />}
          {pctDivers > 0 && <div className="bg-gray-200 transition-all duration-500" style={{ width: `${pctDivers}%` }} />}
        </div>
        <div className="flex items-center gap-4 mt-2.5 flex-wrap">
          {totalMO > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
              <span className="text-xs text-gray-500">Main d'œuvre</span>
              <span className="text-xs font-bold text-gray-800">{fmtK(totalMO)}</span>
              <span className="text-xs text-gray-400">({pctMO}%)</span>
            </div>
          )}
          {totalMat > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-xs text-gray-500">Matériaux</span>
              <span className="text-xs font-bold text-gray-800">{fmtK(totalMat)}</span>
              <span className="text-xs text-gray-400">({pctMat}%)</span>
            </div>
          )}
          {totalDivers > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-200 shrink-0" />
              <span className="text-xs text-gray-500">Divers</span>
              <span className="text-xs font-bold text-gray-800">{fmtK(totalDivers)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Encadré pédagogique */}
      <div className="bg-blue-50 rounded-xl px-4 py-3 mb-5 flex items-start gap-3">
        <span className="text-lg shrink-0">💡</span>
        <div>
          <p className="text-sm font-semibold text-blue-900 mb-1">Ce que cela signifie concrètement</p>
          <p className="text-xs text-blue-700 leading-relaxed">
            Sur votre budget estimé, environ <strong>{pctMO}%</strong> correspond au travail des artisans
            {totalHeures > 0 && <> — soit environ <strong>{totalHeures} heures de chantier</strong> au tarif moyen de {TAUX_HORAIRE} €/h</>}.
            Les <strong>{pctMat}%</strong> restants couvrent les matériaux
            (carrelage, plomberie, bois, peinture…) achetés pour votre projet.
            Cette répartition est tout à fait normale dans le bâtiment.
          </p>
        </div>
      </div>

      {/* Détail par intervenant */}
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Détail par intervenant</p>
      <div className="space-y-3">
        {lotsWithData.map(lot => {
          const mo      = lot.main_oeuvre_ht ?? 0;
          const mat     = lot.materiaux_ht   ?? 0;
          const div     = lot.divers_ht      ?? 0;
          const lotTot  = mo + mat + div || 1;
          const heures  = mo > 0 ? Math.round(mo / TAUX_HORAIRE) : 0;
          const pctMoL  = Math.round((mo  / lotTot) * 100);
          const pctMatL = Math.round((mat / lotTot) * 100);
          if (mo + mat + div === 0) return null;
          return (
            <div key={lot.id} className="bg-gray-50 rounded-xl p-4">
              {/* Ligne titre */}
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">{lot.emoji ?? '🔧'}</span>
                  <span className="text-sm font-semibold text-gray-800">{lot.nom}</span>
                </div>
                <span className="text-sm font-bold text-gray-700">{fmtK(mo + mat + div)}</span>
              </div>

              {/* Mini barre */}
              <div className="flex h-1.5 rounded-full overflow-hidden mb-3 gap-px">
                {pctMoL  > 0 && <div className="bg-blue-400"  style={{ width: `${pctMoL}%`  }} />}
                {pctMatL > 0 && <div className="bg-amber-300" style={{ width: `${pctMatL}%` }} />}
              </div>

              {/* Deux colonnes MO / Matériaux */}
              <div className="grid grid-cols-2 gap-2">
                {mo > 0 && (
                  <div className="bg-white rounded-lg px-3 py-2.5 border border-blue-50">
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1">
                      🛠 Main d'œuvre
                    </p>
                    <p className="text-sm font-extrabold text-gray-900">{fmtK(mo)}</p>
                    {heures > 0 && (
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">
                        ≈ {heures} heure{heures > 1 ? 's' : ''} de travail
                        <span className="text-gray-300"> · {TAUX_HORAIRE} €/h moy.</span>
                      </p>
                    )}
                  </div>
                )}
                {mat > 0 && (
                  <div className="bg-white rounded-lg px-3 py-2.5 border border-amber-50">
                    <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1">
                      🪵 Matériaux
                    </p>
                    <p className="text-sm font-extrabold text-gray-900">{fmtK(mat)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">
                      fournitures &amp; équipements
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-300 mt-4 text-center">
        Estimations indicatives · taux horaire moyen bâtiment : {TAUX_HORAIRE} €/h · hors TVA
      </p>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

interface Props {
  result: ChantierIAResult;
  documents: DocumentChantier[];
  insights: InsightsData | null;
  insightsLoading: boolean;
  baseRangeMin: number;
  baseRangeMax: number;
  onAddDoc: () => void;
  onGoToAnalyse: () => void;
  onGoToLots: () => void;
  onGoToLot?: (lotId: string) => void;
  onRangeRefined?: (min: number, max: number) => void;
  onAmeliorer?: () => void;
  autoOpenModal?: boolean;
  onModalClose?: () => void;
}

export default function BudgetTresorerie({ result, documents, insights, insightsLoading, baseRangeMin, baseRangeMax, onAddDoc, onGoToAnalyse, onGoToLots, onGoToLot, onRangeRefined, onAmeliorer, autoOpenModal, onModalClose }: Props) {
  const lots = result.lots ?? [];

  // ── État modal affinage ────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]       = useState(autoOpenModal ?? false);
  const [refinedMin, setRefinedMin]         = useState<number | null>(null);
  const [refinedMax, setRefinedMax]         = useState<number | null>(null);
  const [affinageScore, setAffinageScore]   = useState(0);
  const [refinedBreakdown, setRefinedBreakdown] = useState<BreakdownItem[]>([]);
  const isImmeuble = (result.nom + ' ' + result.description).toLowerCase().includes('immeuble');

  // ── Budget — utilise la source unique passée en props ─────────────────────
  const hasLotBudget   = lots.some(l => (l.budget_min_ht ?? 0) > 0 || (l.budget_max_ht ?? 0) > 0);
  const hasBudgetTotal = (result.budgetTotal ?? 0) > 5000;
  const hasAnyBudget   = hasLotBudget || hasBudgetTotal || baseRangeMin > 0;
  const hasDevis       = documents.some(d => d.document_type === 'devis');
  const hasFactures    = documents.some(d => d.document_type === 'facture');

  // Fourchette affichée : affinée après questionnaire, sinon base (source unique depuis parent)
  const rangeMin  = refinedMin ?? baseRangeMin;
  const rangeMax  = refinedMax ?? baseRangeMax;
  const hasRange  = rangeMin > 0 || rangeMax > 0;
  const isRefined = refinedMin !== null;

  const devisCount    = documents.filter(d => d.document_type === 'devis').length;
  const factureCount  = documents.filter(d => d.document_type === 'facture').length;
  const lotsAvecDevis = lots.filter(l => documents.some(d => d.lot_id === l.id && d.document_type === 'devis')).length;
  const lotsManquants = lots.length - lotsAvecDevis;
  const alertsCount   = insights?.global.filter(i => i.type === 'alert' || i.type === 'warning').length ?? 0;

  function handleValidate(min: number, max: number, breakdown: BreakdownItem[]) {
    setRefinedMin(min); setRefinedMax(max); setAffinageScore(6); setModalOpen(false);
    setRefinedBreakdown(breakdown);
    onRangeRefined?.(min, max);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-7 space-y-5">

      {/* ── Header projet ─────────────────────────────────────────────────── */}
      <ProjectHeader emoji={result.emoji} nom={result.nom} hasAnyBudget={hasAnyBudget} onAmeliorer={onAmeliorer} />

      {/* ── 🎯 Prochaine action recommandée ──────────────────────────────── */}
      {(() => {
        const sortedLots  = [...lots].sort((a, b) => (b.budget_max_ht ?? 0) - (a.budget_max_ht ?? 0));
        const lotsNoDocs  = sortedLots.filter(l => !documents.some(d => d.lot_id === l.id && d.document_type === 'devis'));
        const lotsOneDevis = sortedLots.filter(l => documents.filter(d => d.lot_id === l.id && d.document_type === 'devis').length === 1);
        const allCovered  = lots.length > 0 && lotsNoDocs.length === 0;

        type Action = { icon: string; label: string; message: string; btn: string; btnColor: string; onClick: () => void };
        let action: Action;

        if (!hasAnyBudget) {
          action = {
            icon: '📐', label: 'Prochaine action recommandée',
            message: 'Affinez votre estimation pour débloquer le suivi budgétaire par intervenant.',
            btn: 'Affiner mon budget', btnColor: 'bg-blue-600 hover:bg-blue-700 text-white',
            onClick: () => setModalOpen(true),
          };
        } else if (devisCount === 0 && lotsNoDocs[0]) {
          const top = lotsNoDocs[0];
          action = {
            icon: '📋', label: 'Prochaine action recommandée',
            message: `Demandez un devis à votre ${top.nom.toLowerCase()} pour valider ce poste budgétaire.`,
            btn: '+ Ajouter un devis', btnColor: 'bg-blue-600 hover:bg-blue-700 text-white',
            onClick: onAddDoc,
          };
        } else if (lotsOneDevis[0]) {
          const lot = lotsOneDevis[0];
          action = {
            icon: '⚖️', label: 'Prochaine action recommandée',
            message: `Comparez votre ${lot.nom.toLowerCase()} avec un 2e devis — les prix peuvent varier de 30 %.`,
            btn: '+ Ajouter un devis', btnColor: 'bg-blue-600 hover:bg-blue-700 text-white',
            onClick: onAddDoc,
          };
        } else if (lotsNoDocs[0]) {
          const lot = lotsNoDocs[0];
          action = {
            icon: '📋', label: 'Prochaine action recommandée',
            message: `Il manque un devis pour votre ${lot.nom.toLowerCase()}.`,
            btn: '+ Ajouter un devis', btnColor: 'bg-blue-600 hover:bg-blue-700 text-white',
            onClick: onAddDoc,
          };
        } else if (allCovered) {
          action = {
            icon: '🎉', label: 'Dossier complet',
            message: 'Tous vos intervenants ont au moins 2 devis. Vous pouvez analyser et comparer les offres.',
            btn: 'Voir l\u2019analyse', btnColor: 'bg-emerald-600 hover:bg-emerald-700 text-white',
            onClick: onGoToAnalyse,
          };
        } else {
          return null;
        }

        return (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3.5">
            <span className="text-xl shrink-0 mt-0.5">{action.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-blue-500 uppercase tracking-wider mb-1">{action.label}</p>
              <p className="text-sm font-medium text-blue-900 leading-snug">{action.message}</p>
            </div>
            <button onClick={action.onClick}
              className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap ${action.btnColor}`}>
              {action.btn}
            </button>
          </div>
        );
      })()}

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

      {/* ── État 2+ : fourchette cliquable ───────────────────────────────── */}
      {hasAnyBudget && hasRange && (
        <button onClick={() => setModalOpen(true)}
          className="w-full bg-white rounded-2xl border border-gray-100 p-5 text-left hover:shadow-md hover:scale-[1.01] transition-all duration-200 cursor-pointer group">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                {isRefined ? '✅ Budget affiné' : 'Fourchette estimée'}
              </p>
              <p className="text-3xl font-extrabold text-gray-900 leading-none">
                {fmtK(rangeMin)} – {fmtK(rangeMax)}
              </p>
            </div>
            {isRefined
              ? <ScoreBadge score={affinageScore} />
              : <ReliabilityBadge signaux={result.estimationSignaux} />}
          </div>
          <p className="text-xs text-gray-400">
            Basé sur les prix du marché réels. Affinez pour plus de précision.
          </p>
          <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-2 text-blue-600 group-hover:text-blue-700 transition-colors">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">Affiner mon estimation</span>
            <ChevronRight className="h-3.5 w-3.5 ml-auto" />
          </div>
        </button>
      )}

      {/* ── Modal affinage budget ─────────────────────────────────────────── */}
      {modalOpen && (
        <BudgetAffinageModal
          baseMin={baseRangeMin} baseMax={baseRangeMax}
          resultNom={result.nom} isImmeuble={isImmeuble}
          resultDescription={result.description ?? ''}
          resultLots={lots}
          onClose={() => { setModalOpen(false); onModalClose?.(); }}
          onValidate={handleValidate}
        />
      )}

      {/* ── Détail par poste (affiché après affinage) ─────────────────────── */}
      {isRefined && refinedBreakdown.length > 0 && (
        <div className="bg-white rounded-2xl border border-emerald-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Détail par intervenant</p>
          </div>
          <div className="divide-y divide-gray-50 px-5">
            {refinedBreakdown.map(item => (
              <div key={item.id} className="flex items-center gap-3 py-3">
                <span className="text-base w-8 text-center shrink-0">{item.emoji}</span>
                <span className="flex-1 text-sm font-medium text-gray-700 truncate">{item.label}</span>
                <span className="text-sm font-bold text-gray-900 shrink-0 tabular-nums">
                  {fmtK(item.min)} – {fmtK(item.max)}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-emerald-100 bg-emerald-50 flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Total estimé</span>
            <span className="text-base font-extrabold text-emerald-800">
              {fmtK(rangeMin)} – {fmtK(rangeMax)}
            </span>
          </div>
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
          <div className="lg:col-span-3"><LotBreakdown result={result} documents={documents} rangeMin={rangeMin} rangeMax={rangeMax} onGoToLot={onGoToLot} onAddDoc={onAddDoc} /></div>
          <div className="lg:col-span-2"><AlertesIA lots={lots} documents={documents} onAddDoc={onAddDoc} onGoToLot={onGoToLot} /></div>
        </div>
      )}

      {/* ── Explication MO / Matériaux ───────────────────────────────────── */}
      {hasAnyBudget && <BudgetExplication lots={lots} />}

      {/* ── Trésorerie par phase ──────────────────────────────────────────── */}
      {hasAnyBudget && <TresoreriePhases result={result} />}

      {/* ── Factures & paiements ──────────────────────────────────────────── */}
      <FacturesPaiements documents={documents} onAddFacture={onAddDoc} />

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <QuickActions onAddDoc={onAddDoc} onGoToAnalyse={onGoToAnalyse} onGoToLots={onGoToLots} />
    </div>
  );
}
