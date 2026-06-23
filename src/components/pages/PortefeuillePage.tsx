import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Wallet, Calendar, Users, LayoutGrid, Loader2, AlertTriangle, Lock,
  ArrowRight, Menu, TrendingUp,
} from 'lucide-react';
import { PHASE_LABELS, type PhaseChantier } from '@/types/chantier-dashboard';
import type { ChantierSummary, PortfolioTotals } from '@/lib/chantier/portfolioSummary';
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
  active, onSelect, mobileOpen, onCloseMobile, lateCount,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  lateCount: number;
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

function FinancesTab({ summaries, totals }: { summaries: ChantierSummary[]; totals: PortfolioTotals }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
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
  );
}

// ── Onglet Planning (lite) ───────────────────────────────────────────────────

function PlanningLiteTab({ summaries }: { summaries: ChantierSummary[] }) {
  // Retards en premier.
  const sorted = [...summaries].sort((a, b) => Number(b.isLate) - Number(a.isLate));
  return (
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
  );
}

// ── Onglet Contacts (placeholder, phase 2) ───────────────────────────────────

function ContactsPlaceholder() {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-4">
        <Users className="h-6 w-6 text-blue-500" aria-hidden="true" />
      </div>
      <h3 className="font-bold text-gray-900 text-lg">Annuaire unifié</h3>
      <p className="text-gray-500 text-sm mt-2 max-w-md mx-auto">
        Tous vos artisans dédupliqués, tous chantiers confondus, avec la détection des conflits
        de disponibilité. Disponible prochainement.
      </p>
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) setLoading(false); // evite le flash du spinner pendant la redirection
        window.location.href = '/connexion?redirect=/mon-chantier/portefeuille';
        return;
      }
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
              {activeTab === 'finances' && <FinancesTab summaries={summaries} totals={totals} />}
              {activeTab === 'planning' && <PlanningLiteTab summaries={summaries} />}
              {activeTab === 'contacts' && <ContactsPlaceholder />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
