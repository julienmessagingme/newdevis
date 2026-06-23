import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Wallet, Calendar, Users, LayoutGrid, Loader2, AlertTriangle, Lock,
  ArrowRight, Menu, TrendingUp, Phone, Building2,
} from 'lucide-react';
import { PHASE_LABELS, type PhaseChantier } from '@/types/chantier-dashboard';
import type { ChantierSummary, PortfolioTotals } from '@/lib/chantier/portfolioSummary';
import type { UnifiedArtisan, PortfolioConflict } from '@/lib/chantier/portfolioConflicts';
import { buildPortfolioTimeline, nowMarkerPct } from '@/lib/chantier/portfolioTimeline';
import type { PortfolioCashflow } from '@/lib/chantier/portfolioCashflow';
import '@/styles/cockpit-refonte.css';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

type Tab = 'finances' | 'planning' | 'contacts';

interface PortfolioData {
  summaries: ChantierSummary[];
  totals: PortfolioTotals;
}

interface ContactsData {
  artisans: UnifiedArtisan[];
  conflicts: PortfolioConflict[];
}

// ── Helpers d'affichage ──────────────────────────────────────────────────────

function eur(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function phaseLabel(p: string): string {
  return PHASE_LABELS[p as PhaseChantier] ?? p;
}

// ── Mark GMC (replique allegee de la sidebar cockpit) ────────────────────────

function GmcMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="11" fill="#fff" fillOpacity="0.08" />
      <path d="M11 30 L24 18 L37 30 L37 39 L11 39 Z" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" fill="none" />
      <rect x="21" y="32" width="6" height="7" stroke="#fff" strokeWidth="1.6" fill="none" />
      <line x1="14" y1="12" x2="32" y2="12" stroke="#F58A06" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="12" x2="14" y2="30" stroke="#F58A06" strokeWidth="2" strokeLinecap="round" />
      <rect x="27" y="20" width="4" height="3" fill="#F58A06" />
    </svg>
  );
}

// ── Sidebar gauche du portefeuille (le "menu" demande) ───────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'finances', label: 'Finances', icon: Wallet },
  { id: 'planning', label: 'Planning', icon: Calendar },
  { id: 'contacts', label: 'Contacts unifiés', icon: Users },
];

function PortfolioSidebar({
  active, onSelect, mobileOpen, onCloseMobile, lateCount, conflictCount,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  lateCount: number;
  conflictCount: number;
}) {
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={onCloseMobile} aria-hidden="true" />}
      <aside className={`
        cr-sidebar fixed top-0 left-0 h-full w-[248px] z-40
        pb-[max(0.5rem,env(safe-area-inset-bottom))]
        transition-transform duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0 lg:z-auto lg:flex-none lg:pb-5
      `}>
        {/* Brand → retour au hub chantiers */}
        <a href="/mon-chantier" className="cr-sb-brand" title="Retour à mes chantiers">
          <div className="cr-sb-brand-mark"><GmcMark /></div>
          <div className="cr-sb-brand-text">
            <div className="l1">Gérer<span className="or">Mon</span></div>
            <div className="l1">Chantier</div>
          </div>
        </a>

        {/* En-tete portefeuille */}
        <div className="cr-project-picker" style={{ cursor: 'default' }}>
          <div className="cr-pp-icon">🗂️</div>
          <div className="cr-pp-text">
            <div className="cr-pp-name">Portefeuille</div>
            <div className="cr-pp-sub">Vue multi-chantier</div>
          </div>
        </div>

        {/* Navigation = les onglets multi-chantier */}
        <nav className="cr-nav">
          <div className="cr-nav-section">
            <div className="cr-nav-label">Vue d'ensemble</div>
            {TABS.map((t) => {
              const isActive = active === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { onSelect(t.id); onCloseMobile(); }}
                  className={`cr-nav-item${isActive ? ' active' : ''}`}
                >
                  <span className="ic"><t.icon /></span>
                  <span className="lbl">{t.label}</span>
                  {t.id === 'planning' && lateCount > 0 && (
                    <span className="badge">{lateCount}</span>
                  )}
                  {t.id === 'contacts' && conflictCount > 0 && (
                    <span className="badge">{conflictCount}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="cr-nav-section">
            <div className="cr-nav-label">Naviguer</div>
            <a href="/mon-chantier" className="cr-nav-item">
              <span className="ic"><LayoutGrid /></span>
              <span className="lbl">Mes chantiers</span>
            </a>
          </div>
        </nav>
      </aside>
    </>
  );
}

// ── Bandeau de KPI portefeuille ──────────────────────────────────────────────

function TotalsBar({ totals }: { totals: PortfolioTotals }) {
  const kpis = [
    { label: 'Budget cible', value: eur(totals.budgetCibleTotal) },
    { label: 'Décaissé', value: eur(totals.decaisseTotal) },
    { label: 'À régler', value: eur(totals.aReglerTotal) },
    { label: 'À venir', value: eur(totals.aVenirTotal) },
    { label: 'Flux certains', value: eur(totals.fluxCertainsTotal) },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {kpis.map((k) => (
        <div key={k.label} className="bg-white border border-gray-100 rounded-xl px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{k.label}</div>
          <div className="text-lg font-bold text-gray-900 mt-0.5">{k.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Onglet Finances ──────────────────────────────────────────────────────────

function EtatChip({ s }: { s: ChantierSummary }) {
  if (s.fetchError) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">Indisponible</span>;
  }
  if (s.aRegler > 0) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">{eur(s.aRegler)} à régler</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">À jour</span>;
}

function CashflowProjection({ cashflow }: { cashflow: PortfolioCashflow | null }) {
  if (!cashflow || cashflow.months.length === 0) return null;
  const { months, totalPending, peak } = cashflow;
  const scale = peak > 0 ? peak : 1;
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 mb-4">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-bold text-gray-900 text-sm">Trésorerie prévisionnelle</h3>
        <span className="text-xs text-gray-500">
          Reste à prévoir : <span className="font-bold text-gray-900">{eur(totalPending)}</span>
        </span>
      </div>
      <div className="flex items-end gap-2 sm:gap-3 overflow-x-auto overscroll-x-contain pb-2" style={{ minHeight: 140 }}>
        {months.map((m) => {
          const pendingH = Math.round((m.pending / scale) * 110);
          const paidH = Math.round((m.paid / scale) * 110);
          return (
            <div key={m.month} className="flex flex-col items-center gap-1 shrink-0 w-16">
              <div className="flex flex-col-reverse items-center justify-end" style={{ height: 110 }}>
                {m.paid > 0 && <div className="w-7 rounded-t bg-emerald-300" style={{ height: Math.max(2, paidH) }} title={`Payé : ${eur(m.paid)}`} />}
                {m.pending > 0 && <div className={`w-7 ${m.paid > 0 ? '' : 'rounded-t'} bg-blue-500`} style={{ height: Math.max(2, pendingH) }} title={`À prévoir : ${eur(m.pending)}`} />}
              </div>
              <span className={`text-[10px] font-medium ${m.isPast ? 'text-gray-300' : 'text-gray-500'}`}>{m.label}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-400">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> À prévoir</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-300 inline-block" /> Déjà payé</span>
      </div>
    </div>
  );
}

function FinanceCardsMobile({ summaries }: { summaries: ChantierSummary[] }) {
  return (
    <div className="sm:hidden flex flex-col gap-3">
      {summaries.map((s) => (
        <a key={s.id} href={`/mon-chantier/${s.id}`} className="block bg-white border border-gray-100 rounded-2xl p-4 no-underline">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg select-none">{s.emoji}</span>
              <span className="font-semibold text-gray-900 truncate">{s.nom}</span>
            </div>
            <EtatChip s={s} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-50 rounded-lg py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-400">Décaissé</div>
              <div className="text-sm font-bold text-gray-900">{eur(s.decaisse)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-400">À régler</div>
              <div className="text-sm font-bold text-gray-900">{eur(s.aRegler)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-400">À venir</div>
              <div className="text-sm font-bold text-gray-900">{eur(s.aVenir)}</div>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

function FinancesTab({ summaries, totals, cashflow }: { summaries: ChantierSummary[]; totals: PortfolioTotals; cashflow: PortfolioCashflow | null }) {
  return (
   <>
    <CashflowProjection cashflow={cashflow} />
    <FinanceCardsMobile summaries={summaries} />
    <div className="hidden sm:block bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="min-w-[820px] w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3">Chantier</th>
              <th className="px-4 py-3">Phase</th>
              <th className="px-4 py-3 text-right">Budget cible</th>
              <th className="px-4 py-3 text-right">Décaissé</th>
              <th className="px-4 py-3 text-right">À régler</th>
              <th className="px-4 py-3 text-right">À venir</th>
              <th className="px-4 py-3 text-right">Flux certains</th>
              <th className="px-4 py-3">État</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {summaries.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3">
                  <a href={`/mon-chantier/${s.id}`} className="flex items-center gap-2 font-semibold text-gray-900 hover:text-blue-600 no-underline">
                    <span className="select-none">{s.emoji}</span>
                    <span className="truncate max-w-[200px]">{s.nom}</span>
                  </a>
                </td>
                <td className="px-4 py-3 text-gray-500">{phaseLabel(s.phase)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{eur(s.budgetCible)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{eur(s.decaisse)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{eur(s.aRegler)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{eur(s.aVenir)}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">{eur(s.fluxCertains)}</td>
                <td className="px-4 py-3"><EtatChip s={s} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-bold text-gray-900">
              <td className="px-4 py-3" colSpan={2}>Total · {totals.chantierCount} chantier{totals.chantierCount > 1 ? 's' : ''}</td>
              <td className="px-4 py-3 text-right">{eur(totals.budgetCibleTotal)}</td>
              <td className="px-4 py-3 text-right">{eur(totals.decaisseTotal)}</td>
              <td className="px-4 py-3 text-right">{eur(totals.aReglerTotal)}</td>
              <td className="px-4 py-3 text-right">{eur(totals.aVenirTotal)}</td>
              <td className="px-4 py-3 text-right">{eur(totals.fluxCertainsTotal)}</td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
   </>
  );
}

// ── Onglet Planning : frise consolidée + détail ─────────────────────────────

function FriseTimeline({ summaries }: { summaries: ChantierSummary[] }) {
  const timeline = buildPortfolioTimeline(summaries);
  const marker = nowMarkerPct(timeline);
  if (timeline.bars.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center text-gray-400 text-sm mb-4">
        Aucun chantier daté à afficher sur la frise. Définissez des dates de planning pour les voir ici.
      </div>
    );
  }
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900 text-sm">Frise consolidée</h3>
        <span className="text-[11px] text-gray-400">{fmtDate(new Date(timeline.rangeStartMs).toISOString())} → {fmtDate(new Date(timeline.rangeEndMs).toISOString())}</span>
      </div>
      <div className="relative flex flex-col gap-2">
        {/* Repère "aujourd'hui" */}
        {marker !== null && (
          <div className="absolute top-0 bottom-0 w-px bg-blue-400/70 z-10" style={{ left: `${marker}%` }} aria-hidden="true">
            <span className="absolute -top-0.5 -translate-x-1/2 text-[9px] font-semibold text-blue-500 bg-white px-1">auj.</span>
          </div>
        )}
        {timeline.bars.map((bar) => (
          <a
            key={bar.id}
            href={`/mon-chantier/${bar.id}`}
            className="relative h-8 rounded-lg bg-gray-50 border border-gray-100 block no-underline group"
            title={`${bar.nom} · ${fmtDate(new Date(bar.startMs).toISOString())} → ${fmtDate(new Date(bar.endMs).toISOString())}`}
          >
            <div
              className={`absolute top-1 bottom-1 rounded-md flex items-center px-2 overflow-hidden ${bar.isLate ? 'bg-amber-400/90' : 'bg-blue-500/90'} group-hover:brightness-110`}
              style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%`, minWidth: 24 }}
            >
              <span className="text-[11px] font-semibold text-white whitespace-nowrap">{bar.emoji} {bar.nom}</span>
            </div>
          </a>
        ))}
      </div>
      {timeline.undated.length > 0 && (
        <p className="text-[11px] text-gray-400 mt-3">
          {timeline.undated.length} chantier{timeline.undated.length > 1 ? 's' : ''} sans date de planning (non affiché{timeline.undated.length > 1 ? 's' : ''} sur la frise).
        </p>
      )}
    </div>
  );
}

function PlanningTab({ summaries }: { summaries: ChantierSummary[] }) {
  // Retards en premier.
  const sorted = [...summaries].sort((a, b) => Number(b.isLate) - Number(a.isLate));
  return (
    <>
      <FriseTimeline summaries={summaries} />
      <div className="flex flex-col gap-3">
      {sorted.map((s) => {
        const pct = s.lotsCount > 0 ? Math.round((s.lotsDone / s.lotsCount) * 100) : 0;
        return (
          <a
            key={s.id}
            href={`/mon-chantier/${s.id}`}
            className="group flex items-center gap-4 bg-white border border-gray-100 hover:border-blue-200 hover:shadow-sm rounded-2xl px-5 py-4 no-underline transition-all"
          >
            <span className="text-xl select-none">{s.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 truncate group-hover:text-blue-600">{s.nom}</span>
                {s.isLate && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" /> En retard
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-500">
                <span>Objectif : {fmtDate(s.dateFinSouhaitee)}</span>
                <span>Livraison estimée : {fmtDate(s.estimatedEnd)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 max-w-[220px] rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[11px] text-gray-400 font-medium">{s.lotsDone}/{s.lotsCount} lots</span>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500 transition-all group-hover:translate-x-0.5 shrink-0" aria-hidden="true" />
          </a>
        );
      })}
      </div>
    </>
  );
}

// ── Onglet Contacts unifiés (phase 2 : annuaire dédupliqué + conflits) ───────

function ConflictsBanner({ conflicts }: { conflicts: PortfolioConflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
        <span className="font-bold text-amber-800 text-sm">
          {conflicts.length} conflit{conflicts.length > 1 ? 's' : ''} de ressources à arbitrer
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {conflicts.map((c, i) => (
          <div key={i} className="rounded-xl bg-white border border-amber-100 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-semibold text-gray-900 text-sm">{c.artisanLabel}</span>
              {c.confidence === 'confirmed' ? (
                <span className="px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-[11px] font-semibold">Conflit confirmé</span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-700 text-[11px] font-semibold">À vérifier</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-gray-600">
              {c.windows.map((w, j) => (
                <span key={j} className="inline-flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1">
                  <span className="font-medium text-gray-800">{w.chantierNom}</span>
                  {w.lotNom ? <span className="text-gray-400">· {w.lotNom}</span> : null}
                  <span className="text-gray-400">({fmtDate(w.start)} → {fmtDate(w.end)})</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-amber-700/80 mt-2">
        Périodes qui se recoupent : à confirmer avec l'artisan (un chevauchement de dates ne signifie pas toujours une présence simultanée).
      </p>
    </div>
  );
}

function ContactsTab({ data }: { data: ContactsData | null }) {
  if (!data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }
  const { artisans, conflicts } = data;
  if (artisans.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center text-gray-500 text-sm">
        Aucun artisan enregistré sur vos chantiers pour l'instant.
      </div>
    );
  }
  return (
    <div>
      <ConflictsBanner conflicts={conflicts} />
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="min-w-[720px] w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Artisan</th>
                <th className="px-4 py-3">Coordonnées</th>
                <th className="px-4 py-3">Intervient sur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {artisans.map((a) => (
                <tr key={a.key} className="hover:bg-gray-50/60 transition-colors align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{a.label}</div>
                    {a.confidence === 'low' && a.chantierCount > 1 && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium">
                        rapprochement à vérifier
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="flex flex-col gap-1">
                      {a.phone && (
                        <span className="inline-flex items-center gap-1.5"><Phone className="h-3 w-3 text-gray-400" aria-hidden="true" />{a.phone}</span>
                      )}
                      {a.siret && (
                        <span className="inline-flex items-center gap-1.5"><Building2 className="h-3 w-3 text-gray-400" aria-hidden="true" />{a.siret}</span>
                      )}
                      {!a.phone && !a.siret && <span className="text-gray-300">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {a.occurrences.map((o, i) => (
                        <a
                          key={i}
                          href={`/mon-chantier/${o.chantierId}`}
                          className="inline-flex items-center gap-1 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg px-2 py-0.5 text-xs no-underline hover:bg-blue-100"
                        >
                          {o.chantierNom}{o.lotNom ? <span className="text-blue-400">· {o.lotNom}</span> : null}
                        </a>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PortefeuillePage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PortfolioData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('finances');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [contactsData, setContactsData] = useState<ContactsData | null>(null);
  const [cashflowData, setCashflowData] = useState<PortfolioCashflow | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) setLoading(false); // evite le flash du spinner pendant la redirection
        window.location.href = '/connexion?redirect=/mon-chantier/portefeuille';
        return;
      }
      const auth = { Authorization: `Bearer ${session.access_token}` };
      // Annuaire unifie + conflits : best-effort, ne bloque pas l'affichage principal.
      // En cas d'echec serveur on resout vers vide (evite le spinner infini de l'onglet).
      const emptyContacts: ContactsData = { artisans: [], conflicts: [] };
      fetch('/api/portfolio/contacts', { headers: auth })
        .then((r) => (r.ok ? r.json() : emptyContacts))
        .then((c) => { if (!cancelled) setContactsData(c as ContactsData); })
        .catch(() => { if (!cancelled) setContactsData(emptyContacts); });
      // Projection de tresorerie : best-effort egalement.
      const emptyCashflow: PortfolioCashflow = { months: [], totalPending: 0, totalPaid: 0, peak: 0 };
      fetch('/api/portfolio/cashflow', { headers: auth })
        .then((r) => (r.ok ? r.json() : emptyCashflow))
        .then((c) => { if (!cancelled) setCashflowData(c as PortfolioCashflow); })
        .catch(() => { if (!cancelled) setCashflowData(emptyCashflow); });
      try {
        const res = await fetch('/api/portfolio/summary', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.status === 403) {
          if (!cancelled) setLocked(true);
          return;
        }
        if (!res.ok) {
          let detail = '';
          try { const b = await res.json(); detail = b?.error ?? ''; } catch {}
          throw new Error(`HTTP ${res.status}${detail ? ' · ' + detail : ''}`);
        }
        const json = (await res.json()) as PortfolioData;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erreur inconnue');
          console.error('[PortefeuillePage] fetch error:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Acces refuse (palier Multi requis) ──
  if (locked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center bg-white border border-gray-100 rounded-2xl p-8 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="h-6 w-6 text-amber-500" aria-hidden="true" />
          </div>
          <h1 className="font-bold text-gray-900 text-xl mb-2">Poste de pilotage portefeuille</h1>
          <p className="text-gray-500 text-sm mb-6">
            La vue consolidée de tous vos chantiers (planning global, finances agrégées, contacts unifiés)
            fait partie de l'offre Multi.
          </p>
          <a href="/gmc-abonnement?plan=multi" className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors no-underline">
            <TrendingUp className="h-4 w-4" aria-hidden="true" /> Passer à l'offre Multi
          </a>
          <div className="mt-4">
            <a href="/mon-chantier" className="text-xs text-gray-400 hover:text-gray-600">Retour à mes chantiers</a>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-400">Chargement de votre portefeuille…</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-red-500 text-sm mb-4">{error ?? 'Impossible de charger le portefeuille.'}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 text-sm bg-white border border-gray-200 hover:border-gray-300 text-gray-600 rounded-xl transition-colors">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const { summaries, totals } = data;

  return (
    <div className="gmc-cockpit flex h-screen overflow-hidden">
      <PortfolioSidebar
        active={activeTab}
        onSelect={setActiveTab}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        lateCount={totals.lateCount}
        conflictCount={contactsData?.conflicts.length ?? 0}
      />

      <div className="cr-main flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="cr-project-header shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setMobileOpen((v) => !v)} aria-label="Ouvrir le menu"
              className="flex lg:hidden w-10 h-10 items-center justify-center rounded-lg text-gray-500 hover:bg-black/5 shrink-0 touch-manipulation">
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <h1 className="cr-ph-title">
              <span className="emoji">🗂️</span>
              Portefeuille
              <span className="text-sm font-medium text-gray-400 ml-1">
                · {totals.chantierCount} chantier{totals.chantierCount > 1 ? 's' : ''}
                {totals.lateCount > 0 ? `, ${totals.lateCount} en retard` : ''}
              </span>
            </h1>
          </div>
        </div>

        {/* Contenu */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24">
          {summaries.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center text-gray-500 text-sm">
              Aucun chantier dans votre portefeuille pour l'instant.
            </div>
          ) : (
            <>
              <TotalsBar totals={totals} />
              {activeTab === 'finances' && <FinancesTab summaries={summaries} totals={totals} cashflow={cashflowData} />}
              {activeTab === 'planning' && <PlanningTab summaries={summaries} />}
              {activeTab === 'contacts' && <ContactsTab data={contactsData} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
