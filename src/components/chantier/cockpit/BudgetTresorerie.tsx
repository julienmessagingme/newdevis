/**
 * BudgetTresorerie — écran financier premium du cockpit chantier.
 * Données claires, zéro tableau dense, chaque bloc orienté décision.
 */
import { useMemo, useState, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, CircleDollarSign,
  FileText, Plus, Search, ChevronRight, ChevronLeft, Info, Zap, Layers, Wallet, X,
  SlidersHorizontal, Check,
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
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Vos travaux par métier</h3>
        </div>
        <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">
          {lots.length} métier{lots.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-1">
        {lotsWithData.map(lot => {
          const statusDot = lot.devisCount === 0
            ? { color: 'bg-red-400',   label: '0 devis',                  text: 'text-red-600'  }
            : lot.devisCount === 1
            ? { color: 'bg-amber-400', label: '1 devis',                  text: 'text-amber-600'}
            : { color: 'bg-emerald-400', label: `${lot.devisCount} devis`, text: 'text-emerald-600' };

          return (
            <button key={lot.id}
              onClick={() => onGoToLot ? onGoToLot(lot.id) : undefined}
              className={`w-full flex flex-col gap-2 px-3.5 py-3 rounded-xl text-left transition-all ${
                onGoToLot ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
              } group`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base leading-none shrink-0">{lot.emoji ?? '🔧'}</span>
                  <span className="text-sm font-medium text-gray-800 truncate">{lot.nom}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${statusDot.color}`} />
                    <span className={`text-[11px] font-semibold ${statusDot.text}`}>{statusDot.label}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-700">
                    {lot.min > 0 ? `${fmtK(lot.min)} – ${fmtK(lot.max)}` : '—'}
                  </span>
                  {onGoToLot && <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />}
                </div>
              </div>
              {/* Barre budget */}
              <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
                {lot.pctMax > 0 && (
                  <>
                    <div className="absolute h-full bg-blue-100 rounded-full" style={{ left: 0, width: `${lot.pctMax}%` }} />
                    <div className="absolute h-full bg-blue-400 rounded-full" style={{ left: 0, width: `${lot.pctMin}%` }} />
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
        {hasTotalBudget ? (
          <>
            <span className="text-xs text-gray-400">Total estimé (marché)</span>
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
            // Sanitize known bad alert texts
            const cleanText = item.text
              .replace(/Aucun document[^\.]*risque de dépassement/gi, 'Aucun devis ajouté — impossible de valider le budget')
              .replace(/Aucun document[^\.]*budget/gi, 'Aucun devis ajouté — impossible de valider le budget');
            return (
              <div key={i} className={`flex items-start gap-3 px-3.5 py-3 rounded-xl border ${s.bg} ${s.border}`}>
                {s.icon}
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${s.text} leading-snug`}>
                    {item.icon && <span className="mr-1">{item.icon}</span>}
                    {cleanText}
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

// ── Header projet ─────────────────────────────────────────────────────────────

function ProjectHeader({ emoji, nom, hasAnyBudget }: { emoji: string; nom: string; hasAnyBudget: boolean }) {
  return (
    <div className="flex items-center gap-3 pb-1">
      <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center text-2xl shrink-0 shadow-sm">
        {emoji}
      </div>
      <div className="min-w-0">
        <h2 className="font-bold text-gray-900 text-xl leading-tight truncate">{nom}</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          {hasAnyBudget ? "Budget en cours d\u2019affinage" : "Budget en cours d\u2019estimation"}
        </p>
      </div>
    </div>
  );
}

// ── Types questionnaire affinage ──────────────────────────────────────────────

type TypeProjetAffinage = 'renovation_complete' | 'renovation_partielle' | 'extension' | 'exterieur';
type Gamme = 'entree' | 'standard' | 'haut_de_gamme';
type Participation = 'tout_delegue' | 'partiellement' | 'beaucoup';
type NatureTravaux = 'gros_oeuvre' | 'electricite' | 'plomberie' | 'isolation' | 'menuiserie' | 'finitions';

interface AffinageAnswers {
  typeProjet?: TypeProjetAffinage;
  surface?: number;
  surfaceTravaux?: number;
  // Immeuble
  nbAppartements?: number;
  partiesCommunes?: boolean;
  ascenseur?: boolean;
  // Maison
  nbPieces?: number;
  nbNiveaux?: number;
  // Multi-select
  natureTravaux: NatureTravaux[];
  gamme?: Gamme;
  participation?: Participation;
}

const INITIAL_ANSWERS: AffinageAnswers = { natureTravaux: [] };

// Coefficients multiplicateurs — toujours appliqués SUR les prix marché existants
const TYPE_COEFF: Record<TypeProjetAffinage, number> = {
  renovation_complete: 1.0,
  renovation_partielle: 0.55,
  extension: 1.30,
  exterieur: 0.40,
};
const GAMME_COEFF: Record<Gamme, number> = {
  entree: 0.72,
  standard: 1.0,
  haut_de_gamme: 1.45,
};
const PARTICIPATION_COEFF: Record<Participation, number> = {
  tout_delegue: 1.0,
  partiellement: 0.85,
  beaucoup: 0.65,
};

function computeRefinedRange(
  baseMin: number, baseMax: number, a: AffinageAnswers,
): { min: number; max: number } {
  if (baseMin === 0 && baseMax === 0) return { min: 0, max: 0 };
  const tc = a.typeProjet ? TYPE_COEFF[a.typeProjet] : 1;
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
  if (a.typeProjet) s++;
  if ((a.surface ?? 0) > 0) s++;
  if (a.nbAppartements !== undefined || a.nbPieces !== undefined) s++;
  if (a.natureTravaux.length > 0) s++;
  if (a.gamme) s++;
  if (a.participation) s++;
  return s;
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
  baseMin, baseMax, resultNom, isImmeuble, onClose, onValidate,
}: {
  baseMin: number; baseMax: number; resultNom: string; isImmeuble: boolean;
  onClose: () => void; onValidate: (min: number, max: number) => void;
}) {
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<AffinageAnswers>(INITIAL_ANSWERS);
  const TOTAL_STEPS = 6;

  const refined = useMemo(() => computeRefinedRange(baseMin, baseMax, answers), [baseMin, baseMax, answers]);
  const score   = useMemo(() => computeScore(answers), [answers]);
  const hasBase = baseMin > 0 || baseMax > 0;

  const upd = useCallback(<K extends keyof AffinageAnswers>(key: K, val: AffinageAnswers[K]) => {
    setAnswers(prev => ({ ...prev, [key]: val }));
  }, []);

  function toggleNature(n: NatureTravaux) {
    setAnswers(prev => {
      const set = new Set(prev.natureTravaux);
      set.has(n) ? set.delete(n) : set.add(n);
      return { ...prev, natureTravaux: Array.from(set) };
    });
  }

  const canNext = (() => {
    if (step === 1) return !!answers.typeProjet;
    if (step === 5) return !!answers.gamme;
    if (step === 6) return !!answers.participation;
    return true; // steps 2, 3, 4 are optional
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

          {/* Step 1 — Type de projet */}
          {step === 1 && (
            <div className="space-y-2">
              <p className="font-semibold text-gray-900 mb-3">Quel type de projet ?</p>
              {([
                ['renovation_complete', '🏠', 'Rénovation complète', 'Ensemble du logement ou bâtiment'],
                ['renovation_partielle','🛠️', 'Rénovation partielle', 'Une ou plusieurs pièces ciblées'],
                ['extension',          '📐', 'Extension',           'Agrandissement de la surface habitable'],
                ['exterieur',          '🌿', 'Extérieur',           'Jardin, terrasse, façade, toiture'],
              ] as const).map(([val, emoji, label, sub]) => (
                <button key={val} onClick={() => upd('typeProjet', val as TypeProjetAffinage)}
                  className={`${CHOICE_BASE} ${answers.typeProjet === val ? CHOICE_ON : CHOICE_OFF}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{emoji}</span>
                    <span className="font-semibold text-sm">{label}</span>
                    {answers.typeProjet === val && <Check className="h-4 w-4 text-blue-500 ml-auto shrink-0" />}
                  </div>
                  <span className="text-xs text-gray-400 pl-7">{sub}</span>
                </button>
              ))}
            </div>
          )}

          {/* Step 2 — Surface */}
          {step === 2 && (
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

          {/* Step 3 — Détails adaptatifs */}
          {step === 3 && isImmeuble && (
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
          {step === 3 && !isImmeuble && (
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

          {/* Step 4 — Nature des travaux */}
          {step === 4 && (
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

          {/* Step 5 — Niveau de gamme */}
          {step === 5 && (
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

          {/* Step 6 — Participation */}
          {step === 6 && (
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
              <button onClick={() => setStep(s => s + 1)} disabled={!canNext}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm transition-all ${
                  canNext ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}>
                {step === 1 && !answers.typeProjet ? 'Choisissez un type de projet' : 'Continuer'}
                {canNext && <ChevronRight className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <ScoreBadge score={score} />
                <span className="text-xs text-gray-400">{score} / 6 informations renseignées</span>
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
}

export default function BudgetTresorerie({ result, documents, insights, insightsLoading, baseRangeMin, baseRangeMax, onAddDoc, onGoToAnalyse, onGoToLots, onGoToLot, onRangeRefined }: Props) {
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
      <ProjectHeader emoji={result.emoji} nom={result.nom} hasAnyBudget={hasAnyBudget} />

      {/* ── 🎯 Prochaine étape ────────────────────────────────────────────── */}
      {(() => {
        const lotsNoDocs = lots.filter(l => !documents.some(d => d.lot_id === l.id && d.document_type === 'devis'));
        const firstLot   = lotsNoDocs[0];
        if (!hasAnyBudget) return null;
        const message = devisCount === 0
          ? firstLot
            ? `Ajoutez un devis ${firstLot.nom.toLowerCase()} pour valider votre budget`
            : 'Demandez vos premiers devis artisans'
          : devisCount === 1
          ? 'Obtenez 2 devis supplémentaires pour comparer les prix'
          : firstLot
          ? `Ajoutez un devis pour le lot : ${firstLot.nom}`
          : null;
        if (!message) return null;
        return (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
            <span className="text-xl shrink-0">🎯</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider mb-0.5">Prochaine étape</p>
              <p className="text-sm font-medium text-blue-900 leading-snug">{message}</p>
            </div>
            <button onClick={onAddDoc}
              className="shrink-0 text-xs font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap">
              + Ajouter un devis
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
