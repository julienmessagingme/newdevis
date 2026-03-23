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
type ExtensionStructure = 'plain_pied' | 'surelevation';
type Gamme = 'entree' | 'standard' | 'haut_de_gamme';
type Participation = 'tout_delegue' | 'partiellement' | 'beaucoup';
type NatureTravaux = 'gros_oeuvre' | 'electricite' | 'plomberie' | 'isolation' | 'menuiserie' | 'finitions';

// ── Éléments de projet détectables ────────────────────────────────────────────

interface ElemQuestion {
  id: string;
  label: string;
  type: 'number' | 'choice';
  unit?: string;
  placeholder?: string;
  choices?: string[];
}

interface ProjectElementDef {
  id: string;
  label: string;
  emoji: string;
  keywords: string[];
  typeEquiv: TypeProjetAffinage;
  questions: ElemQuestion[];
}

const ELEMENT_DEFS: ProjectElementDef[] = [
  {
    id: 'piscine', label: 'Piscine', emoji: '🏊', typeEquiv: 'exterieur',
    keywords: ['piscine', 'pool', 'bassin'],
    questions: [
      { id: 'type', label: 'Type de piscine', type: 'choice',
        choices: ['Béton coulé (sur mesure)', 'Coque polyester', 'Hors-sol'] },
      { id: 'surface', label: 'Surface du bassin', type: 'number', unit: 'm²', placeholder: '30' },
    ],
  },
  {
    id: 'terrasse', label: 'Terrasse', emoji: '🪵', typeEquiv: 'exterieur',
    keywords: ['terrasse', 'deck', 'platelage', 'dallage', 'dalle extérieure', 'dalle béton'],
    questions: [
      { id: 'surface', label: 'Surface de la terrasse', type: 'number', unit: 'm²', placeholder: '25' },
      { id: 'materiau', label: 'Matériau', type: 'choice',
        choices: ['Bois composite', 'Bois naturel (ipé, pin…)', 'Carrelage extérieur', 'Béton / dallage'] },
    ],
  },
  {
    id: 'pergola', label: 'Pergola', emoji: '⛺', typeEquiv: 'exterieur',
    keywords: ['pergola'],
    questions: [
      { id: 'surface', label: 'Surface couverte', type: 'number', unit: 'm²', placeholder: '15' },
      { id: 'type', label: 'Type', type: 'choice',
        choices: ['Bioclimatique (lames orientables)', 'Classique bois', 'Aluminium fixe'] },
    ],
  },
  {
    id: 'pool_house', label: 'Pool house', emoji: '🏡', typeEquiv: 'exterieur',
    keywords: ['pool house', 'poolhouse', 'abri piscine', 'pool-house'],
    questions: [
      { id: 'surface', label: 'Surface du pool house', type: 'number', unit: 'm²', placeholder: '20' },
      { id: 'type', label: 'Construction', type: 'choice',
        choices: ['Parpaing / enduit', 'Ossature bois', 'Maçonnerie pierre'] },
    ],
  },
  {
    id: 'extension', label: 'Extension', emoji: '🏗️', typeEquiv: 'extension',
    keywords: ['extension', 'agrandissement', 'annexe', 'surélévation', 'surelevation'],
    questions: [
      { id: 'surface', label: 'Surface à créer', type: 'number', unit: 'm²', placeholder: '30' },
      { id: 'structure', label: 'Type de structure', type: 'choice',
        choices: ['Plain-pied (dalle béton)', 'Surélévation (niveau supplémentaire)'] },
    ],
  },
  {
    id: 'renovation', label: 'Rénovation complète', emoji: '🔨', typeEquiv: 'renovation_complete',
    keywords: ['rénovation complète', 'renovation complete', 'rénover entièrement', 'réhabilitation'],
    questions: [
      { id: 'surface', label: 'Surface à rénover', type: 'number', unit: 'm²', placeholder: '100' },
      { id: 'type', label: 'Étendue des travaux', type: 'choice',
        choices: ['Complète (gros œuvre + second œuvre)', 'Partielle (finitions et aménagements)', 'Rafraîchissement léger'] },
    ],
  },
  {
    id: 'salle_bain', label: 'Salle de bain', emoji: '🚿', typeEquiv: 'renovation_partielle',
    keywords: ['salle de bain', 'salle de bains', 'sdb', 'douche', 'baignoire'],
    questions: [
      { id: 'surface', label: 'Surface de la salle de bain', type: 'number', unit: 'm²', placeholder: '8' },
      { id: 'type', label: 'Type de rénovation', type: 'choice',
        choices: ['Complète (plomberie + carrelage + équipements)', 'Équipements uniquement', 'Rafraîchissement'] },
    ],
  },
  {
    id: 'cuisine', label: 'Cuisine', emoji: '🍳', typeEquiv: 'renovation_partielle',
    keywords: ['cuisine', 'plan de travail', 'meuble cuisine'],
    questions: [
      { id: 'surface', label: 'Surface de la cuisine', type: 'number', unit: 'm²', placeholder: '15' },
      { id: 'type', label: 'Type de rénovation', type: 'choice',
        choices: ['Complète (plomberie + électricité + mobilier)', 'Remplacement des équipements', 'Façades et plan de travail'] },
    ],
  },
  {
    id: 'cloture', label: 'Clôture / portail', emoji: '🚧', typeEquiv: 'exterieur',
    keywords: ['clôture', 'cloture', 'portail', 'grillage', 'palissade', 'mur de clôture'],
    questions: [
      { id: 'lineaire', label: 'Linéaire de clôture', type: 'number', unit: 'ml', placeholder: '30' },
      { id: 'type', label: 'Type', type: 'choice',
        choices: ['Bois (palissade / lisses)', 'Aluminium / PVC', 'Béton / pierre', 'Grillage rigide'] },
    ],
  },
  {
    id: 'carport', label: 'Carport / garage', emoji: '🚗', typeEquiv: 'exterieur',
    keywords: ['carport', 'abri voiture', 'garage', 'box'],
    questions: [
      { id: 'surface', label: 'Surface du carport', type: 'number', unit: 'm²', placeholder: '20' },
      { id: 'type', label: 'Type', type: 'choice',
        choices: ['Bois', 'Aluminium', 'Métal', 'Maçonnerie'] },
    ],
  },
  // ── Nouveaux éléments ──────────────────────────────────────────────────────
  {
    id: 'allee', label: 'Allée carrossable', emoji: '🛣️', typeEquiv: 'exterieur',
    keywords: ['allée', 'allee', 'carrossable', 'voie d\'accès', 'voie acces', 'entrée voiture', 'accès voiture'],
    questions: [
      { id: 'surface', label: 'Surface de l\'allée', type: 'number', unit: 'm²', placeholder: '40' },
      { id: 'materiau', label: 'Revêtement', type: 'choice',
        choices: ['Béton désactivé', 'Enrobé / bitume', 'Gravier / stabilisé', 'Pavés autobloquants', 'Dalles béton'] },
    ],
  },
  {
    id: 'amenagement_jardin', label: 'Aménagement jardin', emoji: '🌳', typeEquiv: 'exterieur',
    keywords: ['jardin', 'paysager', 'gazon', 'pelouse', 'plantation', 'massif', 'engazonnement', 'arrosage automatique'],
    questions: [
      { id: 'surface', label: 'Surface du jardin', type: 'number', unit: 'm²', placeholder: '200' },
      { id: 'type', label: 'Type d\'aménagement', type: 'choice',
        choices: ['Gazon + plantations', 'Terrain sportif / pelouse', 'Jardin paysager complet', 'Arrosage automatique inclus'] },
    ],
  },
  {
    id: 'toiture', label: 'Toiture / charpente', emoji: '🏠', typeEquiv: 'renovation_partielle',
    keywords: ['toiture', 'charpente', 'couverture', 'toit', 'tuile', 'ardoise', 'zinguerie', 'gouttière'],
    questions: [
      { id: 'surface', label: 'Surface de toiture', type: 'number', unit: 'm²', placeholder: '120' },
      { id: 'type', label: 'Type de toiture', type: 'choice',
        choices: ['Tuiles (terre cuite / béton)', 'Ardoise naturelle', 'Zinc / bac acier', 'Réfection partielle'] },
    ],
  },
  {
    id: 'isolation', label: 'Isolation', emoji: '🧱', typeEquiv: 'renovation_partielle',
    keywords: ['isolation', 'ite', 'iti', 'combles', 'plancher bas', 'pare-vapeur', 'laine de verre', 'laine de roche'],
    questions: [
      { id: 'surface', label: 'Surface à isoler', type: 'number', unit: 'm²', placeholder: '100' },
      { id: 'type', label: 'Type d\'isolation', type: 'choice',
        choices: ['Combles perdus', 'Isolation par l\'extérieur (ITE)', 'Isolation intérieure (ITI)', 'Plancher bas / vide sanitaire'] },
    ],
  },
  {
    id: 'electricite', label: 'Électricité', emoji: '⚡', typeEquiv: 'renovation_partielle',
    keywords: ['électricité', 'electricite', 'tableau électrique', 'mise aux normes', 'vmc', 'domotique', 'prises', 'câblage'],
    questions: [
      { id: 'surface', label: 'Surface concernée', type: 'number', unit: 'm²', placeholder: '80' },
      { id: 'type', label: 'Type de travaux', type: 'choice',
        choices: ['Rénovation complète (tableau + câblage)', 'Mise aux normes partielle', 'VMC / ventilation', 'Domotique / home automation'] },
    ],
  },
  {
    id: 'plomberie', label: 'Plomberie / chauffage', emoji: '🔧', typeEquiv: 'renovation_partielle',
    keywords: ['plomberie', 'chauffage', 'chaudière', 'radiateur', 'plancher chauffant', 'pompe à chaleur', 'pac', 'sanitaire'],
    questions: [
      { id: 'surface', label: 'Surface du logement', type: 'number', unit: 'm²', placeholder: '100' },
      { id: 'type', label: 'Type de travaux', type: 'choice',
        choices: ['Plomberie neuve + sanitaires', 'Remplacement chaudière / PAC', 'Plancher chauffant', 'Radiateurs + distribution'] },
    ],
  },
  {
    id: 'menuiseries', label: 'Menuiseries', emoji: '🪟', typeEquiv: 'renovation_partielle',
    keywords: ['menuiserie', 'fenêtre', 'fenetre', 'porte-fenêtre', 'porte fenetre', 'baie vitrée', 'baie vitree', 'volet', 'store'],
    questions: [
      { id: 'quantite', label: 'Nombre d\'ouvertures', type: 'number', unit: 'unités', placeholder: '8' },
      { id: 'type', label: 'Matériau', type: 'choice',
        choices: ['PVC', 'Aluminium', 'Bois', 'Mixte bois-alu'] },
    ],
  },
  {
    id: 'ravalement', label: 'Ravalement façade', emoji: '🏛️', typeEquiv: 'renovation_partielle',
    keywords: ['ravalement', 'façade', 'facade', 'enduit', 'bardage', 'isolation extérieure'],
    questions: [
      { id: 'surface', label: 'Surface de façade', type: 'number', unit: 'm²', placeholder: '150' },
      { id: 'type', label: 'Type de finition', type: 'choice',
        choices: ['Enduit projeté', 'Peinture façade', 'Bardage bois / composite', 'Pierre / briquettes'] },
    ],
  },
  {
    id: 'amenagement_interieur', label: 'Aménagement intérieur', emoji: '🛋️', typeEquiv: 'renovation_partielle',
    keywords: ['aménagement intérieur', 'amenagement interieur', 'cloison', 'parquet', 'carrelage intérieur', 'peinture', 'plâtrerie'],
    questions: [
      { id: 'surface', label: 'Surface à aménager', type: 'number', unit: 'm²', placeholder: '50' },
      { id: 'type', label: 'Type de travaux', type: 'choice',
        choices: ['Peinture + sols', 'Cloisons + plâtrerie', 'Parquet / carrelage', 'Aménagement complet'] },
    ],
  },
  {
    id: 'terrassement', label: 'Terrassement / VRD', emoji: '🚜', typeEquiv: 'exterieur',
    keywords: ['terrassement', 'vrd', 'voirie', 'assainissement', 'drainage', 'fouille', 'nivellement', 'remblai'],
    questions: [
      { id: 'surface', label: 'Surface concernée', type: 'number', unit: 'm²', placeholder: '300' },
      { id: 'type', label: 'Type de travaux', type: 'choice',
        choices: ['Terrassement / décaissement', 'VRD (voirie + réseaux)', 'Assainissement', 'Drainage + remblai'] },
    ],
  },
  {
    id: 'piscine_amenagements', label: 'Aménagements piscine', emoji: '💦', typeEquiv: 'exterieur',
    keywords: ['plage piscine', 'local technique', 'équipements piscine', 'filtration', 'chauffage piscine', 'robot piscine'],
    questions: [
      { id: 'type', label: 'Équipements souhaités', type: 'choice',
        choices: ['Plage béton / carrelage', 'Local technique + filtration', 'Chauffage (PAC ou solaire)', 'Couverture automatique'] },
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
function inferGenericElement(lotNom: string): ProjectElementDef {
  const lower = lotNom.toLowerCase();
  let emoji = '🔨';
  let unit: string = 'm²';
  let choices: string[] = ['Économique', 'Standard', 'Premium'];

  if (/\b(électric|electri|tableau|câblag|domotiq|vmc)\b/.test(lower)) { emoji = '⚡'; unit = 'm²'; }
  else if (/\b(plomber|chaudièr|chauffag|radiateur|sanitaire|pac)\b/.test(lower)) { emoji = '🔧'; unit = 'm²'; }
  else if (/\b(allée|carrossable|voie|accès|bitume|enrobé|gravier|pavé)\b/.test(lower)) { emoji = '🛣️'; unit = 'm²'; choices = ['Béton désactivé', 'Enrobé', 'Gravier stabilisé', 'Pavés']; }
  else if (/\b(jardin|gazon|pelouse|paysag|plantat)\b/.test(lower)) { emoji = '🌳'; unit = 'm²'; }
  else if (/\b(toiture|charpente|couverture|tuile|ardoise|gouttière)\b/.test(lower)) { emoji = '🏠'; unit = 'm²'; }
  else if (/\b(isol|comble|ite|iti)\b/.test(lower)) { emoji = '🧱'; unit = 'm²'; }
  else if (/\b(façade|facade|ravale|bardage|enduit)\b/.test(lower)) { emoji = '🏛️'; unit = 'm²'; }
  else if (/\b(terrassement|vrd|fouille|remblai|drainage)\b/.test(lower)) { emoji = '🚜'; unit = 'm²'; }
  else if (/\b(clôture|cloture|portail|grillage|palissade)\b/.test(lower)) { emoji = '🚧'; unit = 'ml'; choices = ['Bois', 'Aluminium / PVC', 'Béton / pierre', 'Grillage']; }

  return {
    id: slugify(lotNom),
    label: lotNom,
    emoji,
    keywords: [lower],
    typeEquiv: 'exterieur',
    questions: [
      { id: 'surface', label: `Surface / quantité prévue`, type: 'number', unit, placeholder: '50' },
      { id: 'qualite', label: 'Niveau de qualité', type: 'choice', choices },
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

interface AffinageAnswers {
  // Nouveau : éléments confirmés + réponses par élément
  confirmedElements: string[];
  elementAnswers: Record<string, Record<string, string | number>>;
  // Gardé pour backward compat (computeScore, détails immeuble)
  typesProjet: TypeProjetAffinage[];
  surface?: number;
  surfaceTravaux?: number;
  extensionSurface?: number;
  extensionStructure?: ExtensionStructure;
  nbAppartements?: number;
  partiesCommunes?: boolean;
  ascenseur?: boolean;
  nbPieces?: number;
  nbNiveaux?: number;
  natureTravaux: NatureTravaux[];
  gamme?: Gamme;
  participation?: Participation;
}

const INITIAL_ANSWERS: AffinageAnswers = {
  confirmedElements: [],
  elementAnswers: {},
  typesProjet: [],
  natureTravaux: [],
};

// Coefficients de base — toujours appliqués SUR les prix marché existants
const TYPE_COEFF: Record<TypeProjetAffinage, number> = {
  renovation_complete:  1.00,
  renovation_partielle: 0.55,
  extension:            0.30, // portion additive par rapport à la base intérieure
  exterieur:            0.40, // portion additive
};
const GAMME_COEFF: Record<Gamme, number> = {
  entree: 0.72, standard: 1.0, haut_de_gamme: 1.45,
};
const PARTICIPATION_COEFF: Record<Participation, number> = {
  tout_delegue: 1.0, partiellement: 0.85, beaucoup: 0.65,
};

/** Agrège les types sélectionnés de façon cohérente (sans double-comptage) */
function computeMultiTypeCoeff(types: TypeProjetAffinage[]): number {
  if (types.length === 0) return 1;
  // Portion intérieure : prendre le max entre complete/partielle (elles s'excluent)
  const interiorTypes = types.filter(t => t === 'renovation_complete' || t === 'renovation_partielle');
  const hasExtension  = types.includes('extension');
  const hasExterieur  = types.includes('exterieur');

  let coeff = 0;
  if (interiorTypes.length > 0) {
    coeff = Math.max(...interiorTypes.map(t => TYPE_COEFF[t])); // max évite double-comptage
  }
  // Extension : additive (30% du budget de base) — standalone = 1.30
  if (hasExtension) {
    coeff = coeff > 0 ? coeff + TYPE_COEFF.extension : 1.30;
  }
  // Extérieur : additive (40% du budget de base) — standalone = 0.40
  if (hasExterieur) {
    coeff = coeff > 0 ? coeff + TYPE_COEFF.exterieur : TYPE_COEFF.exterieur;
  }
  return coeff > 0 ? coeff : 1;
}

function computeRefinedRange(
  baseMin: number, baseMax: number, a: AffinageAnswers, detectedEls?: ProjectElementDef[],
): { min: number; max: number } {
  if (baseMin === 0 && baseMax === 0) return { min: 0, max: 0 };
  // Dériver typesProjet depuis les éléments confirmés (si disponibles)
  let typesProjet = a.typesProjet;
  if (detectedEls && a.confirmedElements.length > 0) {
    typesProjet = a.confirmedElements
      .map(id => detectedEls.find(e => e.id === id)?.typeEquiv)
      .filter(Boolean) as TypeProjetAffinage[];
  }
  const tc = computeMultiTypeCoeff(typesProjet.length > 0 ? typesProjet : ['renovation_complete']);
  const gc = a.gamme ? GAMME_COEFF[a.gamme] : 1;
  const pc = a.participation ? PARTICIPATION_COEFF[a.participation] : 1;
  const mult = tc * gc * pc;
  return {
    min: Math.round(baseMin * mult / 100) * 100,
    max: Math.round(baseMax * mult / 100) * 100,
  };
}

function computeScore(a: AffinageAnswers): number {
  let s = 0;
  if (a.confirmedElements.length > 0) s++;
  const hasSurface = Object.values(a.elementAnswers).some(ea =>
    (Number(ea.surface) > 0) || (Number(ea.lineaire) > 0)
  );
  if (hasSurface) s++;
  if (a.natureTravaux.length > 0) s++;
  if (a.gamme) s++;
  if (a.participation) s++;
  return s; // max 5
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
  resultDescription?: string; resultLots?: { nom: string }[];
  onClose: () => void; onValidate: (min: number, max: number) => void;
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
  const [answers, setAnswers] = useState<AffinageAnswers>(() => ({
    ...INITIAL_ANSWERS,
    // Pré-sélectionner tous les éléments détectés depuis les lots IA
    confirmedElements: buildElementsFromLots(resultLots ?? [], promptText).map(e => e.id),
  }));

  // Séquence de steps : confirm_elements → une étape par élément confirmé → nature → gamme → participation
  const stepKeys = useMemo(() => {
    const keys: string[] = ['confirm_elements'];
    for (const elemId of answers.confirmedElements) {
      const def = detectedElements.find(e => e.id === elemId);
      if (def && def.questions.length > 0) keys.push(`elem_${elemId}`);
    }
    keys.push('nature', 'gamme', 'participation');
    return keys;
  }, [answers.confirmedElements, detectedElements]);

  const TOTAL_STEPS = stepKeys.length;
  const currentKey  = stepKeys[step - 1] ?? 'confirm_elements';

  const refined = useMemo(
    () => computeRefinedRange(baseMin, baseMax, answers, detectedElements),
    [baseMin, baseMax, answers, detectedElements],
  );
  const score   = useMemo(() => computeScore(answers), [answers]);
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

  function toggleNature(n: NatureTravaux) {
    setAnswers(prev => {
      const set = new Set(prev.natureTravaux);
      set.has(n) ? set.delete(n) : set.add(n);
      return { ...prev, natureTravaux: Array.from(set) };
    });
  }

  const safeNext = () => {
    const nextStep = step + 1;
    if (!stepKeys[nextStep - 1]) return;
    setStep(nextStep);
  };

  const canNext = (() => {
    if (currentKey === 'confirm_elements') return answers.confirmedElements.length > 0;
    if (currentKey === 'gamme')            return !!answers.gamme;
    if (currentKey === 'participation')    return !!answers.participation;
    return true;
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
                      <p className="flex-1 font-semibold text-sm text-left">{elem.label}</p>
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
              {ELEMENT_DEFS.filter(d => !detectedElements.find(e => e.id === d.id)).length > 0 && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-2">Un élément manque ?</p>
                  <div className="flex flex-wrap gap-2">
                    {ELEMENT_DEFS.filter(d => !detectedElements.find(e => e.id === d.id)).map(d => (
                      <button key={d.id} onClick={() => addCustomElement(d)}
                        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-full px-3 py-1.5 transition-all">
                        <span>{d.emoji}</span>+ {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {answers.confirmedElements.length === 0 && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-2.5 mt-1">
                  <span className="text-sm shrink-0">⚠️</span>
                  <p className="text-xs text-amber-700">Sélectionnez au moins un élément pour continuer</p>
                </div>
              )}
            </div>
          )}

          {/* Étapes par élément — questions spécifiques */}
          {currentKey.startsWith('elem_') && (() => {
            const elemId = currentKey.slice(5);
            const def = detectedElements.find(e => e.id === elemId);
            if (!def) return null;
            const ea = answers.elementAnswers[elemId] ?? {};
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{def.emoji}</span>
                  <p className="font-semibold text-gray-900">{def.label}</p>
                </div>
                <p className="text-sm text-gray-400 -mt-2">Quelques précisions pour affiner l&rsquo;estimation</p>
                {def.questions.map(q => (
                  <div key={q.id}>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">{q.label}</label>
                    {q.type === 'number' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="0" placeholder={q.placeholder}
                          value={ea[q.id] ?? ''}
                          onChange={e => updElemAnswer(elemId, q.id, e.target.value ? Number(e.target.value) : '')}
                          className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                        {q.unit && <span className="text-sm font-medium text-gray-400">{q.unit}</span>}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {q.choices?.map(choice => (
                          <button key={choice} onClick={() => updElemAnswer(elemId, q.id, choice)}
                            className={`${CHOICE_BASE} ${ea[q.id] === choice ? CHOICE_ON : CHOICE_OFF} w-full text-left`}>
                            <div className="flex items-center gap-2 w-full">
                              <p className="flex-1 font-semibold text-sm">{choice}</p>
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

          {/* Step surface */}
          {currentKey === 'surface' && (
            <div className="space-y-4">
              <p className="font-semibold text-gray-900">Quelle est la surface concernée ?</p>
              <p className="text-sm text-gray-400 -mt-2">Facultatif — permet d'affiner l'estimation</p>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Surface totale du bien (m²)</label>
                <input type="number" min="0" placeholder="ex : 120"
                  value={answers.surface ?? ''}
                  onChange={e => upd('surface', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Surface concernée par les travaux (m²)</label>
                <input type="number" min="0" placeholder="ex : 80"
                  value={answers.surfaceTravaux ?? ''}
                  onChange={e => upd('surfaceTravaux', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
          )}

          {/* Step extension_details (bonus — uniquement si extension sélectionnée) */}
          {currentKey === 'extension_details' && (
            <div className="space-y-4">
              <p className="font-semibold text-gray-900">Détails de l'extension</p>
              <p className="text-sm text-gray-400 -mt-2">Ces informations affinent le calcul du surcoût</p>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Surface de l'extension (m²)</label>
                <input type="number" min="0" placeholder="ex : 30"
                  value={answers.extensionSurface ?? ''}
                  onChange={e => upd('extensionSurface', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Type de structure</label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ['plain_pied',   '🏡', 'Plain pied',     'Extension de plain-pied (dalle)'],
                    ['surelevation', '🏗️', 'Surélévation',   'Ajout d\u2019un niveau supplémentaire'],
                  ] as const).map(([val, emoji, label, sub]) => {
                    const active = answers.extensionStructure === val;
                    return (
                      <button key={val} onClick={() => upd('extensionStructure', val as ExtensionStructure)}
                        className={`${CHOICE_BASE} ${active ? CHOICE_ON : CHOICE_OFF}`}>
                        <span className="text-2xl mb-0.5">{emoji}</span>
                        <p className="font-semibold text-sm">{label}</p>
                        <p className="text-[11px] text-gray-400 leading-tight">{sub}</p>
                        {active && <Check className="h-3.5 w-3.5 text-blue-500 mt-1" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step details — Détails adaptatifs */}
          {currentKey === 'details' && isImmeuble && (
            <div className="space-y-4">
              <p className="font-semibold text-gray-900">Détails de l'immeuble</p>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Nombre d'appartements</label>
                <div className="grid grid-cols-4 gap-2">
                  {[2,3,4,5,6,7,8,10].map(n => (
                    <button key={n} onClick={() => upd('nbAppartements', n)}
                      className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${answers.nbAppartements === n ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 hover:border-blue-200 text-gray-700'}`}>
                      {n === 10 ? '10+' : n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Parties communes à rénover ?</label>
                <div className="flex gap-3">
                  {(['Oui', 'Non'] as const).map(v => (
                    <button key={v} onClick={() => upd('partiesCommunes', v === 'Oui')}
                      className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${answers.partiesCommunes === (v === 'Oui') && answers.partiesCommunes !== undefined ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 hover:border-blue-200 text-gray-700'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Présence d'un ascenseur ?</label>
                <div className="flex gap-3">
                  {(['Oui', 'Non'] as const).map(v => (
                    <button key={v} onClick={() => upd('ascenseur', v === 'Oui')}
                      className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${answers.ascenseur === (v === 'Oui') && answers.ascenseur !== undefined ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 hover:border-blue-200 text-gray-700'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {currentKey === 'details' && !isImmeuble && (
            <div className="space-y-4">
              <p className="font-semibold text-gray-900">Détails du projet</p>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Nombre de pièces concernées</label>
                <div className="grid grid-cols-5 gap-2">
                  {[1,2,3,4,5,6,7,8,9].map(n => (
                    <button key={n} onClick={() => upd('nbPieces', n)}
                      className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${answers.nbPieces === n ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 hover:border-blue-200 text-gray-700'}`}>
                      {n === 9 ? '9+' : n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Nombre de niveaux</label>
                <div className="flex gap-3">
                  {[1,2,3,4].map(n => (
                    <button key={n} onClick={() => upd('nbNiveaux', n)}
                      className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${answers.nbNiveaux === n ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 hover:border-blue-200 text-gray-700'}`}>
                      {n === 4 ? '4+' : n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step nature — Nature des travaux */}
          {currentKey === 'nature' && (
            <div className="space-y-2">
              <p className="font-semibold text-gray-900 mb-1">Quels types de travaux ?</p>
              <p className="text-sm text-gray-400 -mt-1 mb-3">Sélectionnez tout ce qui s'applique</p>
              {([
                ['gros_oeuvre',  '🏗️', 'Gros œuvre',   'Murs, planchers, charpente, toiture'],
                ['electricite', '⚡', 'Électricité',   'Tableau, prises, éclairage'],
                ['plomberie',   '🚿', 'Plomberie',     'Sanitaires, chauffage, eau'],
                ['isolation',   '🌡️', 'Isolation',     'Murs, combles, fenêtres'],
                ['menuiserie',  '🚪', 'Menuiserie',    'Portes, fenêtres, parquet'],
                ['finitions',   '🎨', 'Finitions',     'Peinture, carrelage, revêtements'],
              ] as [NatureTravaux, string, string, string][]).map(([val, emoji, label, sub]) => {
                const active = answers.natureTravaux.includes(val);
                return (
                  <button key={val} onClick={() => toggleNature(val)}
                    className={`${CHOICE_BASE} ${active ? CHOICE_ON : CHOICE_OFF}`}>
                    <div className="flex items-center gap-2 w-full">
                      <span className="text-lg">{emoji}</span>
                      <div className="flex-1 text-left">
                        <p className="font-semibold text-sm">{label}</p>
                        <p className="text-xs text-gray-400">{sub}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 ${active ? 'border-blue-500 bg-blue-500' : 'border-gray-200'}`}>
                        {active && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step gamme — Niveau de gamme */}
          {currentKey === 'gamme' && (
            <div className="space-y-2">
              <p className="font-semibold text-gray-900 mb-3">Quel niveau de prestations ?</p>
              {([
                ['entree',        '🪵', 'Entrée de gamme', 'Matériaux fonctionnels, finitions simples',        '– 28% vs standard'],
                ['standard',      '✨', 'Standard',        'Bon rapport qualité-prix, prestations soignées',   'Prix de référence'],
                ['haut_de_gamme', '💎', 'Haut de gamme',   'Matériaux premium, artisans spécialisés',          '+ 45% vs standard'],
              ] as const).map(([val, emoji, label, sub, badge]) => (
                <button key={val} onClick={() => upd('gamme', val as Gamme)}
                  className={`${CHOICE_BASE} ${answers.gamme === val ? CHOICE_ON : CHOICE_OFF}`}>
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-lg">{emoji}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{label}</p>
                      <p className="text-xs text-gray-400">{sub}</p>
                    </div>
                    <span className="text-[10px] font-semibold text-gray-400 shrink-0">{badge}</span>
                    {answers.gamme === val && <Check className="h-4 w-4 text-blue-500 shrink-0" />}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Step participation */}
          {currentKey === 'participation' && (
            <div className="space-y-2">
              <p className="font-semibold text-gray-900 mb-3">Quelle part réalisez-vous vous-même ?</p>
              {([
                ['tout_delegue',  '👷', 'Tout délégué',             'Vous faites appel uniquement à des professionnels', 'Prix pleins'],
                ['partiellement', '🤝', 'Partiellement fait soi-même', 'Vous réalisez quelques tâches simples',         '– 15% estimé'],
                ['beaucoup',      '🛠️', 'Beaucoup fait soi-même',   'Vous êtes très impliqué dans les travaux',          '– 35% estimé'],
              ] as const).map(([val, emoji, label, sub, badge]) => (
                <button key={val} onClick={() => upd('participation', val as Participation)}
                  className={`${CHOICE_BASE} ${answers.participation === val ? CHOICE_ON : CHOICE_OFF}`}>
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-lg">{emoji}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{label}</p>
                      <p className="text-xs text-gray-400">{sub}</p>
                    </div>
                    <span className="text-[10px] font-semibold text-gray-400 shrink-0">{badge}</span>
                    {answers.participation === val && <Check className="h-4 w-4 text-blue-500 shrink-0" />}
                  </div>
                </button>
              ))}
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
                  onClick={() => onValidate(refined.min || baseMin, refined.max || baseMax)}
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
}

export default function BudgetTresorerie({ result, documents, insights, insightsLoading, baseRangeMin, baseRangeMax, onAddDoc, onGoToAnalyse, onGoToLots, onGoToLot, onRangeRefined, onAmeliorer }: Props) {
  const lots = result.lots ?? [];

  // ── État modal affinage ────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]       = useState(false);
  const [refinedMin, setRefinedMin]     = useState<number | null>(null);
  const [refinedMax, setRefinedMax]     = useState<number | null>(null);
  const [affinageScore, setAffinageScore] = useState(0);
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

  function handleValidate(min: number, max: number) {
    setRefinedMin(min); setRefinedMax(max); setAffinageScore(6); setModalOpen(false);
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
          onClose={() => setModalOpen(false)}
          onValidate={handleValidate}
        />
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

      {/* ── Trésorerie par phase ──────────────────────────────────────────── */}
      {hasAnyBudget && <TresoreriePhases result={result} />}

      {/* ── Factures & paiements ──────────────────────────────────────────── */}
      <FacturesPaiements documents={documents} onAddFacture={onAddDoc} />

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <QuickActions onAddDoc={onAddDoc} onGoToAnalyse={onGoToAnalyse} onGoToLots={onGoToLots} />
    </div>
  );
}
