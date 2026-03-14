import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Route, FileText, CheckSquare,
  Wand2, ExternalLink, ChevronRight, AlertCircle,
  TrendingUp, Layers, AlertTriangle, Wallet, FolderOpen, BookOpen,
  Upload, Sparkles, Zap, Lightbulb, CreditCard, Plus,
} from 'lucide-react';
import type { ChantierIAResult, LotChantier, TacheIA, StatutArtisan } from '@/types/chantier-ia';
import DocumentsSection from '@/components/chantier/nouveau/DocumentsSection';
import BudgetFiabilite from '@/components/chantier/nouveau/BudgetFiabilite';
import ChantierTimeline from '@/components/chantier/ChantierTimeline';
import LotGrid from '@/components/chantier/lots/LotGrid';
import JournalChantier from '@/components/chantier/JournalChantier';
import BudgetGlobal from '@/components/chantier/BudgetGlobal';
import SimulationFinancement from '@/components/chantier/financement/SimulationFinancement';
import SyntheseChantier from '@/components/chantier/SyntheseChantier';
import NextActionCard from '@/components/chantier/NextActionCard';
import ConseilsChantier from '@/components/chantier/ConseilsChantier';
import { getFormaliteLinks } from '@/lib/formalitesLinks';

interface DashboardChantierProps {
  result: ChantierIAResult;
  chantierId: string | null;
  onAmeliorer: () => void;
  onNouveau: () => void;
  onToggleTache?: (todoId: string, done: boolean) => void;
  onLotStatutChange?: (lotId: string, statut: StatutArtisan) => void;
  token?: string | null;
  userId?: string | null;
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

const PRIMARY_LINKS = [
  { id: 'apercu',    label: 'Vue d\'ensemble', icon: LayoutDashboard },
  { id: 'prochaine', label: 'À faire',          icon: Zap            },
  { id: 'timeline',  label: 'Planning',          icon: Route          },
  { id: 'conseils',  label: 'Nos conseils',      icon: Lightbulb      },
  { id: 'lots',      label: 'Lots',              icon: Layers         },
  { id: 'budget',      label: 'Budget',            icon: Wallet      },
  { id: 'financement', label: 'Financement',      icon: CreditCard  },
  { id: 'documents',   label: 'Documents',        icon: FolderOpen  },
  { id: 'journal',   label: 'Journal',           icon: BookOpen       },
];

const SECONDARY_LINKS = [
  { id: 'alertes',    label: 'Alertes',     icon: AlertTriangle },
  { id: 'artisans',   label: 'Artisans',    icon: Layers        },
  { id: 'roadmap',    label: 'Roadmap',     icon: Route         },
  { id: 'formalites', label: 'Formalités',  icon: FileText      },
  { id: 'checklist',  label: 'Checklist',   icon: CheckSquare   },
];

const STATUT_COLORS: Record<string, string> = {
  a_trouver:   'bg-orange-500/15 text-orange-300 border-orange-500/25',
  a_contacter: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  ok:          'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
};
const STATUT_LABELS: Record<string, string> = {
  a_trouver:   'À trouver',
  a_contacter: 'À contacter',
  ok:          'Confirmé',
};

const PRIORITE_COLORS: Record<string, string> = {
  urgent:    'text-red-400',
  important: 'text-amber-400',
  normal:    'text-slate-500',
};
const PRIORITE_DOTS: Record<string, string> = {
  urgent:    'bg-red-500',
  important: 'bg-amber-500',
  normal:    'bg-slate-600',
};

// ── Helper : en-tête de section ───────────────────────────────────────────────

function SectionHeading({
  icon: Icon,
  label,
  color = 'blue',
  badge,
}: {
  icon: React.ElementType;
  label: string;
  color?: string;
  badge?: number;
}) {
  const colors: Record<string, string> = {
    blue:    'bg-blue-500/15 border-blue-500/20 text-blue-400',
    violet:  'bg-violet-500/15 border-violet-500/20 text-violet-400',
    amber:   'bg-amber-500/15 border-amber-500/20 text-amber-400',
    emerald: 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400',
    slate:   'bg-white/[0.07] border-white/[0.10] text-slate-400',
    orange:  'bg-orange-500/15 border-orange-500/20 text-orange-400',
    rose:    'bg-rose-500/15 border-rose-500/20 text-rose-400',
  };
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${colors[color] ?? colors.blue}`}>
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="text-white font-bold text-lg flex-1">{label}</h3>
      {badge !== undefined && badge > 0 && (
        <span className="bg-orange-500/20 text-orange-300 border border-orange-500/20 text-xs rounded-full px-2 py-0.5 font-semibold">
          {badge}
        </span>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

// Toutes les sections dans l'ordre de la page (primary + secondary)
const ALL_SECTION_IDS = [
  'apercu', 'prochaine', 'timeline', 'conseils', 'lots',
  'budget', 'financement', 'documents', 'journal',
  'alertes', 'artisans', 'roadmap', 'formalites', 'checklist',
];

export default function DashboardChantier({
  result,
  chantierId,
  onAmeliorer,
  onNouveau,
  onToggleTache,
  onLotStatutChange,
  token,
  userId,
}: DashboardChantierProps) {
  const [activeSection, setActiveSection] = useState('apercu');
  const [taches, setTaches] = useState<TacheIA[]>(result.taches ?? []);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lotStatuts, setLotStatuts] = useState<Record<string, StatutArtisan>>(
    () => Object.fromEntries((result.lots ?? []).map((l) => [l.id, l.statut])),
  );
  /** Déclenche le mode upload dans DocumentsSection ('document' | 'devis' | null) */
  const [uploadTrigger, setUploadTrigger] = useState<'document' | 'devis' | null>(null);
  /** Bloque le scrollspy quand l'utilisateur a cliqué un lien nav (évite le flash) */
  const scrollspyPausedRef = useRef(false);

  const toggleTache = (idx: number) => {
    setTaches((prev) => prev.map((t, i) => (i === idx ? { ...t, done: !t.done } : t)));
    const tache = taches[idx];
    if (tache?.id && onToggleTache) onToggleTache(tache.id, !tache.done);
  };

  const budgetTotal = result.budgetTotal || 1;

  const scrollTo = (id: string) => {
    setActiveSection(id);
    scrollspyPausedRef.current = true;
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Réactiver le scrollspy après la fin de l'animation (~600ms)
    setTimeout(() => { scrollspyPausedRef.current = false; }, 700);
  };

  // ── Scrollspy — synchronise activeSection avec le scroll ─────────────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollspyPausedRef.current) return;
        // Prendre la section la plus haute dans le viewport
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.id.replace('section-', '');
          setActiveSection(id);
        }
      },
      { rootMargin: '-15% 0% -75% 0%', threshold: 0 },
    );
    ALL_SECTION_IDS.forEach((id) => {
      const el = document.getElementById(`section-${id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // ── Métriques ──────────────────────────────────────────────────────────────
  const totalTaches    = taches.length;
  const doneTaches     = taches.filter((t) => t.done).length;

  // Progression basée sur la phase réelle du chantier (0/10/25/50/100%)
  const PHASE_STEPS: { keys: string[]; pct: number; label: string }[] = [
    { keys: ['reception', 'livraison'],                    pct: 100, label: 'Réception' },
    { keys: ['travaux', 'finitions', 'chantier'],          pct: 50,  label: 'Travaux en cours' },
    { keys: ['autorisations', 'administratif'],            pct: 25,  label: 'Autorisations' },
    { keys: ['devis', 'chiffrage'],                        pct: 10,  label: 'Devis' },
    { keys: ['preparation', 'conception', 'projet'],       pct: 0,   label: 'Projet' },
  ];
  const _roadmapPhase = ((result.roadmap ?? []).find((e) => e.isCurrent)?.phase ?? '').toLowerCase();
  const _phaseMatch   = PHASE_STEPS.find((s) => s.keys.some((k) => _roadmapPhase.includes(k)));
  const progressPct      = _phaseMatch?.pct   ?? 0;
  const currentPhaseLabel = _phaseMatch?.label ?? 'Projet';

  const currentStepIdx = Math.max(0, (result.roadmap ?? []).findIndex((e) => e.isCurrent));
  const totalSteps     = result.roadmap?.length ?? 0;
  const aidesTotales   = (result.aides ?? [])
    .filter((a) => a.eligible && a.montant)
    .reduce((s, a) => s + (a.montant ?? 0), 0);

  // ── Alertes dynamiques ─────────────────────────────────────────────────────
  type AlerteItem = { emoji: string; label: string; section: string };
  const alertes: AlerteItem[] = [];

  taches
    .filter((t) => !t.done && t.priorite === 'urgent')
    .forEach((t) => alertes.push({ emoji: '🔴', label: t.titre, section: 'checklist' }));

  const nbATrouver = (result.lots ?? [])
    .filter((l) => !l.id.startsWith('fallback-') && (lotStatuts[l.id] ?? l.statut) === 'a_trouver')
    .length;
  if (nbATrouver > 0) {
    alertes.push({
      emoji: '👷',
      label: `${nbATrouver} lot${nbATrouver > 1 ? 's' : ''} sans artisan trouvé`,
      section: 'artisans',
    });
  }

  const nbFormalitesObl = (result.formalites ?? []).filter((f) => f.obligatoire).length;
  if (nbFormalitesObl > 0) {
    alertes.push({
      emoji: '📋',
      label: `${nbFormalitesObl} formalité${nbFormalitesObl > 1 ? 's' : ''} obligatoire${nbFormalitesObl > 1 ? 's' : ''} à traiter`,
      section: 'formalites',
    });
  }
  if (result.prochaineAction?.deadline) {
    alertes.push({ emoji: '⏰', label: `Deadline : ${result.prochaineAction.deadline}`, section: 'prochaine' });
  }

  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-[#0d1525] border-r border-white/[0.05] p-4 sticky top-0 h-screen overflow-y-auto">

        {/* Projet */}
        <div className="mb-4">
          <div className="text-2xl mb-1">{result.emoji}</div>
          <h2 className="text-white font-semibold text-sm leading-tight">{result.nom}</h2>
          <p className="text-slate-500 text-xs mt-0.5 leading-snug line-clamp-2">{result.description}</p>
        </div>

        {/* Mini progression */}
        <div className="mb-4 px-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-slate-500 text-xs">{currentPhaseLabel}</span>
            <span className="text-slate-300 text-xs font-semibold">{progressPct}%</span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {alertes.length > 0 && (
            <button
              onClick={() => scrollTo('alertes')}
              className="mt-1.5 flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors"
            >
              <AlertTriangle className="h-3 w-3" />
              {alertes.length} alerte{alertes.length > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* Navigation principale */}
        <nav className="space-y-0.5">
          {PRIMARY_LINKS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all ${
                activeSection === id
                  ? 'bg-blue-600/20 text-blue-200 font-medium'
                  : 'text-slate-500 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{label}</span>
            </button>
          ))}
        </nav>

        {/* Séparateur */}
        <div className="my-3 border-t border-white/[0.05]" />

        {/* Navigation secondaire */}
        <nav className="space-y-0.5 flex-1">
          {SECONDARY_LINKS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all ${
                activeSection === id
                  ? 'bg-blue-600/20 text-blue-200 font-medium'
                  : 'text-slate-500 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{label}</span>
              {id === 'alertes' && alertes.length > 0 && (
                <span className="bg-orange-500/25 text-orange-300 text-[10px] leading-none rounded-full px-1.5 py-0.5 font-bold">
                  {alertes.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="mt-4 space-y-2">
          <button
            onClick={onAmeliorer}
            className="w-full flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/25 text-blue-300 rounded-xl px-3 py-2.5 text-xs font-medium transition-all"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Améliorer mon plan
          </button>
          <button
            onClick={onNouveau}
            className="w-full flex items-center gap-2 text-slate-500 hover:text-white text-xs rounded-xl px-3 py-2 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Nouveau chantier
          </button>
          {chantierId && (
            <a
              href="/mon-chantier"
              className="flex items-center gap-2 text-slate-500 hover:text-white text-xs rounded-xl px-3 py-2 transition-all"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Mes chantiers
            </a>
          )}
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* 1. HEADER CHANTIER                                              */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <section id="section-apercu">
            <div className="relative overflow-hidden bg-gradient-to-br from-[#0f1d3a] via-[#0d1830] to-[#0d1525] border border-blue-500/20 rounded-2xl p-6">

              {/* Décor lumineux */}
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-500/[0.07] rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-1/3 w-32 h-24 bg-cyan-500/[0.04] rounded-full blur-2xl pointer-events-none" />

              {/* Nom + budget */}
              <div className="relative flex items-start gap-4 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-4xl shrink-0 select-none">
                  {result.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-white font-bold text-2xl leading-tight truncate">{result.nom}</h1>
                  <p className="text-slate-400 text-sm mt-1 line-clamp-2 leading-snug">{result.description}</p>
                </div>
                <div className="shrink-0 text-right hidden sm:block">
                  <p className="text-3xl font-bold text-white leading-none">
                    {result.budgetTotal.toLocaleString('fr-FR')} €
                  </p>
                  <p className="text-slate-500 text-xs mt-1">budget estimé TTC</p>
                </div>
              </div>

              {/* Budget mobile */}
              <div className="relative flex items-center justify-between mb-5 sm:hidden">
                <span className="text-slate-400 text-sm">Budget estimé</span>
                <span className="text-white font-bold text-xl">
                  {result.budgetTotal.toLocaleString('fr-FR')} €
                </span>
              </div>

              {/* Barre de progression */}
              <div className="relative mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Avancement du projet
                  </span>
                  <span className="text-white font-bold text-sm">{progressPct}%</span>
                </div>
                <div className="h-3 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-700"
                    style={{ width: `${progressPct > 0 ? progressPct : 2}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400/60 inline-block" />
                    Phase&nbsp;:&nbsp;<span className="text-slate-300 font-medium">{currentPhaseLabel}</span>
                  </span>
                  {totalSteps > 0 && (
                    <span className="hidden sm:inline">Étape {currentStepIdx + 1}/{totalSteps}</span>
                  )}
                </div>
              </div>

              {/* Boutons d'action rapide */}
              <div className="relative flex gap-3">
                {/* CTA 1 — Ajouter un document (photo, plan, facture…) */}
                <button
                  onClick={() => { scrollTo('documents'); setUploadTrigger('document'); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-lg shadow-blue-500/25"
                >
                  <Upload className="h-4 w-4" />
                  Ajouter un document
                </button>
                {/* CTA 2 — Analyser un devis (IA) — couleur violet pour différencier */}
                <button
                  onClick={() => { scrollTo('documents'); setUploadTrigger('devis'); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-lg shadow-violet-500/20"
                >
                  <Sparkles className="h-4 w-4" />
                  Analyser un devis
                </button>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* 2. PROCHAINE ACTION                                             */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <section id="section-prochaine">
            <SectionHeading icon={Zap} label="Prochaine action" color="violet" />
            <NextActionCard
              result={result}
              chantierId={chantierId}
              token={token}
              onViewLot={() => scrollTo('lots')}
            />
          </section>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* 3. TIMELINE                                                     */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <section id="section-timeline">
            <SectionHeading icon={Route} label="Phases du chantier" color="blue" />
            <ChantierTimeline roadmap={result.roadmap ?? []} />
          </section>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* 4. NOS CONSEILS                                                 */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <section id="section-conseils">
            <ConseilsChantier
              chantierId={chantierId}
              token={token}
              nomChantier={result.nom}
              lignesBudget={result.lignesBudget ?? []}
              lots={result.lots ?? []}
              artisans={result.artisans ?? []}
              roadmap={result.roadmap ?? []}
            />
          </section>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* 5. LOTS DE TRAVAUX                                              */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <section id="section-lots">
            <SectionHeading icon={Layers} label="Lots de travaux" color="orange" />
            <LotGrid
              lignesBudget={result.lignesBudget ?? []}
              lots={result.lots ?? []}
              documents={[]}
              chantierId={chantierId ?? undefined}
              userId={userId ?? undefined}
              token={token ?? undefined}
              onDocumentAdded={() => setRefreshKey((k) => k + 1)}
            />
          </section>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* 6. BUDGET GLOBAL                                                */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <section id="section-budget">
            <SectionHeading icon={Wallet} label="Budget global" color="emerald" />
            <BudgetFiabilite result={result} onAmeliorer={onAmeliorer} />
            <BudgetGlobal
              key={refreshKey}
              lignesBudget={result.lignesBudget ?? []}
              chantierId={chantierId}
              token={token}
            />
            <button
              onClick={onAmeliorer}
              className="mt-3 w-full flex items-center justify-center gap-2 border border-white/[0.08] hover:border-blue-500/40 text-slate-400 hover:text-blue-300 rounded-xl px-4 py-2.5 text-sm transition-all group"
            >
              <Wand2 className="h-3.5 w-3.5 group-hover:text-blue-300 transition-colors" />
              Affiner le budget
            </button>
          </section>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* 7. FINANCEMENT                                                  */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <section id="section-financement">
            <SectionHeading icon={CreditCard} label="Simulation de financement" color="blue" />
            <SimulationFinancement budgetTotal={result.budgetTotal} />
          </section>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* 8. DOCUMENTS                                                    */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <section id="section-documents">
            <SectionHeading icon={FolderOpen} label="Documents du chantier" color="slate" />
            <DocumentsSection
              chantierId={chantierId ?? ''}
              userId={userId ?? ''}
              token={token ?? ''}
              lots={result.lots ?? []}
              uploadTrigger={uploadTrigger}
              onTriggerConsumed={() => setUploadTrigger(null)}
            />
          </section>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* 8. JOURNAL D'ACTIVITÉ                                           */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <section id="section-journal">
            <SectionHeading icon={BookOpen} label="Journal d'activité" color="slate" />
            <JournalChantier key={refreshKey} chantierId={chantierId} token={token} limit={10} />
          </section>

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {/* SECTIONS SECONDAIRES                                            */}
          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}

          {/* Alertes */}
          <section id="section-alertes">
            <SectionHeading icon={AlertTriangle} label="Alertes" color="orange" badge={alertes.length} />
            {alertes.length === 0 ? (
              <div className="bg-emerald-500/[0.07] border border-emerald-500/20 rounded-2xl p-5 flex items-center gap-3">
                <span className="text-xl shrink-0">🎉</span>
                <div>
                  <p className="text-emerald-300 font-medium text-sm">Tout est sous contrôle !</p>
                  <p className="text-emerald-500/70 text-xs mt-0.5">Aucune alerte — votre chantier est bien suivi.</p>
                </div>
              </div>
            ) : (
              <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl divide-y divide-white/[0.04]">
                {alertes.map((alerte, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                    <span className="text-base shrink-0 w-5 text-center">{alerte.emoji}</span>
                    <span className="flex-1 text-sm text-slate-300 min-w-0">{alerte.label}</span>
                    <button
                      onClick={() => scrollTo(alerte.section)}
                      className="text-xs text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap transition-colors shrink-0 ml-2"
                    >
                      Voir →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Artisans / statuts */}
          <section id="section-artisans">
            <SectionHeading icon={Layers} label="Artisans par lot" color="slate" />
            {(result.lots ?? []).length === 0 ? (
              <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-6 text-center">
                <p className="text-slate-500 text-sm mb-3">Aucun lot défini pour l'instant.</p>
                <button
                  onClick={onAmeliorer}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
                >
                  Ajouter des artisans →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {(result.lots ?? []).map((lot: LotChantier) => {
                  const statut    = lotStatuts[lot.id] ?? lot.statut;
                  const isFallback = lot.id.startsWith('fallback-');
                  return (
                    <div key={lot.id} className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-4">
                      <div className="flex items-start gap-3">
                        {lot.emoji && <span className="text-2xl shrink-0 mt-0.5">{lot.emoji}</span>}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white text-sm font-medium">{lot.nom}</p>
                            {isFallback && (
                              <span className="text-[10px] text-slate-600 border border-white/[0.06] rounded px-1.5 py-0.5">
                                lecture seule
                              </span>
                            )}
                          </div>
                          {lot.role && (
                            <p className="text-slate-500 text-xs mt-0.5 leading-tight">{lot.role}</p>
                          )}
                          <div className="flex gap-1.5 mt-3 flex-wrap">
                            {(['a_trouver', 'a_contacter', 'ok'] as StatutArtisan[]).map((s) => (
                              <button
                                key={s}
                                disabled={isFallback}
                                onClick={() => {
                                  if (isFallback) return;
                                  setLotStatuts((prev) => ({ ...prev, [lot.id]: s }));
                                  onLotStatutChange?.(lot.id, s);
                                }}
                                className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                                  isFallback
                                    ? 'cursor-default opacity-50 ' + (statut === s ? STATUT_COLORS[s] : 'border-white/[0.06] text-slate-600')
                                    : statut === s
                                      ? STATUT_COLORS[s]
                                      : 'border-white/[0.06] text-slate-600 hover:text-slate-400 hover:border-white/[0.12]'
                                }`}
                              >
                                {STATUT_LABELS[s]}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Synthèse */}
          <SyntheseChantier result={result} chantierId={chantierId} token={token} />

          {/* Roadmap détaillée */}
          <section id="section-roadmap">
            <SectionHeading icon={Route} label="Roadmap détaillée" color="blue" />
            <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-5">
              <div className="space-y-4">
                {result.roadmap?.map((etape, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        etape.isCurrent
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/[0.06] text-slate-500'
                      }`}>
                        {etape.numero}
                      </div>
                      {i < (result.roadmap?.length ?? 0) - 1 && (
                        <div
                          className={`w-0.5 flex-1 mt-2 ${etape.isCurrent ? 'bg-blue-500/30' : 'bg-white/[0.04]'}`}
                          style={{ minHeight: '1.5rem' }}
                        />
                      )}
                    </div>
                    <div className={`flex-1 pb-4 ${etape.isCurrent ? 'opacity-100' : 'opacity-60'}`}>
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className={`text-sm font-medium ${etape.isCurrent ? 'text-white' : 'text-slate-300'}`}>
                          {etape.nom}
                        </span>
                        <span className={`text-xs ${etape.isCurrent ? 'text-blue-300' : 'text-slate-600'}`}>
                          {etape.mois}
                        </span>
                      </div>
                      <p className="text-slate-500 text-xs mt-0.5">{etape.detail}</p>
                      {etape.isCurrent && (
                        <span className="inline-block mt-1.5 bg-blue-500/15 border border-blue-500/25 text-blue-300 text-xs rounded-full px-2 py-0.5">
                          Étape en cours
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Formalités */}
          <section id="section-formalites">
            <SectionHeading icon={FileText} label="Formalités administratives" color="blue" />
            <div className="space-y-3">
              {result.formalites?.map((f, i) => {
                const links = getFormaliteLinks(f.nom, f.detail);
                return (
                  <div key={i} className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-xl shrink-0">{f.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white text-sm font-medium">{f.nom}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            f.obligatoire
                              ? 'bg-red-500/15 text-red-300 border border-red-500/25'
                              : 'bg-slate-700/50 text-slate-400 border border-white/[0.06]'
                          }`}>
                            {f.obligatoire ? 'Obligatoire' : 'Recommandé'}
                          </span>
                        </div>
                        <p className="text-slate-500 text-xs mt-0.5 leading-tight">{f.detail}</p>

                        {/* Liens officiels gouv.fr */}
                        {links && (
                          <div className="flex flex-wrap gap-2 mt-2.5">
                            <a
                              href={links.primary.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300 rounded-lg px-2.5 py-1 font-medium transition-all"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              {links.primary.cerfa
                                ? `CERFA ${links.primary.cerfa}`
                                : links.primary.label}
                            </a>
                            {links.secondary && (
                              <a
                                href={links.secondary.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                {links.secondary.label}
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Checklist */}
          <section id="section-checklist">
            <SectionHeading icon={CheckSquare} label="Checklist prioritaire" color="emerald" />
            <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl divide-y divide-white/[0.04]">
              {taches.map((t, i) => (
                <button
                  key={i}
                  onClick={() => toggleTache(i)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.02] transition-colors group"
                >
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                    t.done
                      ? 'bg-emerald-500 border-emerald-500'
                      : 'border-white/20 group-hover:border-white/40'
                  }`}>
                    {t.done && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITE_DOTS[t.priorite]}`} />
                  <span className={`flex-1 text-left text-sm transition-all ${
                    t.done ? 'line-through text-slate-600' : 'text-slate-200'
                  }`}>
                    {t.titre}
                  </span>
                  <span className={`text-xs shrink-0 ${PRIORITE_COLORS[t.priorite]}`}>
                    {t.priorite === 'urgent' ? '🔴 Urgent' : t.priorite === 'important' ? '🟡 Important' : ''}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Aides */}
          {result.aides?.some((a) => a.eligible) && (
            <section>
              <SectionHeading icon={Wallet} label="Aides disponibles" color="emerald" />
              <div className="space-y-3">
                {result.aides.map((aide, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 rounded-2xl p-4 border ${
                      aide.eligible
                        ? 'bg-emerald-500/[0.07] border-emerald-500/20'
                        : 'bg-white/[0.02] border-white/[0.05] opacity-50'
                    }`}
                  >
                    <span className="text-xl shrink-0">{aide.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-medium">{aide.nom}</span>
                        {aide.eligible && (
                          <span className="text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 rounded-full px-2 py-0.5 font-medium">
                            Éligible
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 text-xs mt-0.5 leading-tight">{aide.detail}</p>
                      {aide.montant && aide.eligible && (
                        <span className="text-emerald-400 font-semibold text-sm mt-1 block">
                          ~{aide.montant.toLocaleString('fr-FR')} €
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* CTA */}
          <div className="bg-gradient-to-r from-blue-600/10 to-cyan-600/10 border border-blue-500/20 rounded-2xl p-6 text-center">
            <p className="text-white font-semibold mb-1">Ce plan vous convient presque ?</p>
            <p className="text-slate-400 text-sm mb-4">
              Ajoutez un spa, modifiez le budget, changez les dates — votre plan s'adapte en direct.
            </p>
            <button
              onClick={onAmeliorer}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl px-6 py-2.5 text-sm transition-all"
            >
              <Wand2 className="h-4 w-4" />
              Améliorer mon plan
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}
