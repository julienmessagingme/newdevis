import { useState } from 'react';
import {
  LayoutDashboard, Route, FileText, CheckSquare,
  Wand2, Plus, ExternalLink, ChevronRight, AlertCircle,
  TrendingUp, Layers, AlertTriangle, Wallet, FolderOpen,
} from 'lucide-react';
import type { ChantierIAResult, LotChantier, TacheIA, StatutArtisan } from '@/types/chantier-ia';
import DocumentsSection from '@/components/chantier/nouveau/DocumentsSection';

interface DashboardChantierProps {
  result: ChantierIAResult;
  chantierId: string | null;
  onAmeliorer: () => void;
  onNouveau: () => void;
  /** Appelé après toggle local pour persister en DB. Ne plante pas l'UI si absent ou en erreur. */
  onToggleTache?: (todoId: string, done: boolean) => void;
  /** Appelé après changement statut lot pour persister en DB. No-op si lot fallback. */
  onLotStatutChange?: (lotId: string, statut: StatutArtisan) => void;
  /** Token JWT de l'utilisateur — passé à DocumentsSection pour upload direct Storage. */
  token?: string | null;
  /** userId de l'utilisateur — passé à DocumentsSection pour le chemin bucket. */
  userId?: string | null;
}

const SIDEBAR_LINKS = [
  { id: 'apercu',     label: 'Aperçu',      icon: LayoutDashboard },
  { id: 'alertes',    label: 'Alertes',     icon: AlertTriangle   },
  { id: 'budget',     label: 'Budget',      icon: Wallet          },
  { id: 'lots',       label: 'Lots',        icon: Layers          },
  { id: 'documents',  label: 'Documents',   icon: FolderOpen      },
  { id: 'roadmap',    label: 'Planning',    icon: Route           },
  { id: 'formalites', label: 'Formalités',  icon: FileText        },
  { id: 'checklist',  label: 'Checklist',   icon: CheckSquare     },
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
  // lotStatuts : état local indexé par lot.id (UUID ou 'fallback-{i}')
  // Initialisé depuis result.lots, recalculé si result change (source de vérité : DB)
  const [lotStatuts, setLotStatuts] = useState<Record<string, StatutArtisan>>(
    () => Object.fromEntries((result.lots ?? []).map((l) => [l.id, l.statut])),
  );

  const toggleTache = (idx: number) => {
    setTaches((prev) => prev.map((t, i) => (i === idx ? { ...t, done: !t.done } : t)));
    const tache = taches[idx];
    if (tache?.id && onToggleTache) {
      onToggleTache(tache.id, !tache.done);
    }
  };

  const budgetTotal = result.budgetTotal || 1;

  const scrollTo = (id: string) => {
    setActiveSection(id);
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Métriques progression ────────────────────────────────────────────────────
  const totalTaches    = taches.length;
  const doneTaches     = taches.filter((t) => t.done).length;
  const progressPct    = totalTaches > 0 ? Math.round((doneTaches / totalTaches) * 100) : 0;
  const currentStepIdx = Math.max(0, (result.roadmap ?? []).findIndex((e) => e.isCurrent));
  const totalSteps     = result.roadmap?.length ?? 0;
  const aidesTotales   = (result.aides ?? [])
    .filter((a) => a.eligible && a.montant)
    .reduce((s, a) => s + (a.montant ?? 0), 0);

  // ── Alertes dynamiques ──────────────────────────────────────────────────────
  type AlerteItem = { emoji: string; label: string; section: string };
  const alertes: AlerteItem[] = [];

  taches
    .filter((t) => !t.done && t.priorite === 'urgent')
    .forEach((t) => alertes.push({ emoji: '🔴', label: t.titre, section: 'checklist' }));

  // Alertes lots : uniquement les lots persistés (pas les fallbacks read-only)
  const nbATrouver = (result.lots ?? [])
    .filter((l) => !l.id.startsWith('fallback-') && (lotStatuts[l.id] ?? l.statut) === 'a_trouver')
    .length;
  if (nbATrouver > 0) {
    alertes.push({
      emoji: '👷',
      label: `${nbATrouver} lot${nbATrouver > 1 ? 's' : ''} sans artisan trouvé`,
      section: 'lots',
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
    alertes.push({ emoji: '⏰', label: `Deadline : ${result.prochaineAction.deadline}`, section: 'apercu' });
  }

  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-[#0d1525] border-r border-white/[0.05] p-4 sticky top-0 h-screen overflow-y-auto">

        {/* En-tête projet */}
        <div className="mb-4">
          <div className="text-2xl mb-1">{result.emoji}</div>
          <h2 className="text-white font-semibold text-sm leading-tight">{result.nom}</h2>
          <p className="text-slate-500 text-xs mt-0.5 leading-snug">{result.description}</p>
        </div>

        {/* Mini-jauge progression */}
        <div className="mb-4 px-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-slate-500 text-xs">Progression</span>
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

        {/* Navigation */}
        <nav className="space-y-0.5 flex-1">
          {SIDEBAR_LINKS.map(({ id, label, icon: Icon }) => (
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

          {/* ── APERÇU : Progression + Prochaine action ── */}
          <div id="section-apercu" className="space-y-4">

            {/* ① Carte progression */}
            <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-400" />
                  <span className="text-white font-semibold text-sm">Progression du projet</span>
                </div>
                <span className="text-2xl font-bold text-blue-300">{progressPct}%</span>
              </div>
              <div className="h-2.5 bg-white/[0.06] rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-700"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>✅ {doneTaches}/{totalTaches} tâches terminées</span>
                  {totalSteps > 0 && (
                    <span className="hidden sm:inline">🗓️ Étape {currentStepIdx + 1}/{totalSteps}</span>
                  )}
                </div>
                <button
                  onClick={() => scrollTo('checklist')}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors shrink-0"
                >
                  Voir la checklist →
                </button>
              </div>
            </div>

            {/* ② Carte prochaine action recommandée */}
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-1.5">
                    Prochaine action recommandée
                  </p>
                  <p className="text-amber-200 font-semibold text-sm leading-snug">
                    {result.prochaineAction.titre}
                  </p>
                  <p className="text-amber-500/80 text-xs mt-1 leading-relaxed">
                    {result.prochaineAction.detail}
                  </p>
                  {result.prochaineAction.deadline && (
                    <span className="inline-block mt-2 bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-lg px-2 py-0.5 text-xs font-medium">
                      ⏰ {result.prochaineAction.deadline}
                    </span>
                  )}
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <button
                      onClick={() => scrollTo('checklist')}
                      className="text-xs bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-300 rounded-lg px-3 py-1.5 font-medium transition-all"
                    >
                      Voir les tâches
                    </button>
                    <button
                      onClick={onAmeliorer}
                      className="text-xs text-amber-500/60 hover:text-amber-400 transition-colors"
                    >
                      Modifier avec l'IA →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── ③ ALERTES ── */}
          <section id="section-alertes">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-white font-bold text-lg">⚡ Alertes</h3>
              {alertes.length > 0 && (
                <span className="bg-orange-500/20 text-orange-300 border border-orange-500/20 text-xs rounded-full px-2 py-0.5 font-semibold">
                  {alertes.length}
                </span>
              )}
            </div>
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

          {/* ── ④ BUDGET GLOBAL ── */}
          <section id="section-budget">
            <h3 className="text-white font-bold text-lg mb-4">💰 Budget global</h3>
            <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-5">
              {/* Total */}
              <div className="flex items-baseline gap-2 mb-5">
                <span className="text-3xl font-bold text-white">
                  {result.budgetTotal.toLocaleString('fr-FR')} €
                </span>
                <span className="text-slate-500 text-sm">TTC estimé</span>
              </div>

              {/* Barres proportionnelles */}
              <div className="space-y-3">
                {result.lignesBudget?.map((ligne, i) => {
                  const pct = Math.round((ligne.montant / budgetTotal) * 100);
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-slate-300 text-sm">{ligne.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium text-sm">
                            {ligne.montant.toLocaleString('fr-FR')} €
                          </span>
                          <span className="text-slate-600 text-xs">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: ligne.couleur }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Financement crédit */}
              {result.mensualite && (
                <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-slate-500 text-sm">Mensualité crédit</span>
                  <span className="text-blue-300 font-semibold">
                    {result.mensualite.toLocaleString('fr-FR')} €/mois · {result.dureeCredit} mois
                  </span>
                </div>
              )}

              {/* Économies potentielles via aides */}
              {aidesTotales > 0 && (
                <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-slate-500 text-sm">Économie potentielle (aides)</span>
                  <span className="text-emerald-400 font-semibold">
                    ~{aidesTotales.toLocaleString('fr-FR')} €
                  </span>
                </div>
              )}

              {/* Action : ajuster le budget */}
              <button
                onClick={onAmeliorer}
                className="mt-5 w-full flex items-center justify-center gap-2 border border-white/[0.08] hover:border-blue-500/40 text-slate-400 hover:text-blue-300 rounded-xl px-4 py-2.5 text-sm transition-all group"
              >
                <Wand2 className="h-3.5 w-3.5 group-hover:text-blue-300 transition-colors" />
                Ajuster le budget avec l'IA
              </button>
            </div>
          </section>

          {/* ── ⑤ LOTS DE TRAVAUX ── */}
          <section id="section-lots">
            <h3 className="text-white font-bold text-lg mb-4">🔨 Lots de travaux</h3>
            {(result.lots ?? []).length === 0 ? (
              <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-6 text-center">
                <p className="text-slate-500 text-sm mb-3">Aucun lot défini pour l'instant.</p>
                <button
                  onClick={onAmeliorer}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
                >
                  Ajouter des artisans avec l'IA →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {(result.lots ?? []).map((lot: LotChantier) => {
                  const statut = lotStatuts[lot.id] ?? lot.statut;
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
                          {/* Sélecteur de statut — persisté en DB sauf lots fallback */}
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

          {/* ── ⑥ DOCUMENTS ── */}
          <section id="section-documents">
            <DocumentsSection
              chantierId={chantierId ?? ''}
              userId={userId ?? ''}
              token={token ?? ''}
              lots={result.lots ?? []}
            />
          </section>

          {/* ── PLANNING / ROADMAP ── */}
          <section id="section-roadmap">
            <h3 className="text-white font-bold text-lg mb-4">🗓️ Planning prévisionnel</h3>
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

          {/* ── FORMALITÉS ── */}
          <section id="section-formalites">
            <h3 className="text-white font-bold text-lg mb-4">📋 Formalités administratives</h3>
            <div className="space-y-3">
              {result.formalites?.map((f, i) => (
                <div key={i} className="flex items-start gap-3 bg-[#0d1525] border border-white/[0.06] rounded-2xl p-4">
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
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-700 shrink-0 mt-0.5" />
                </div>
              ))}
            </div>
          </section>

          {/* ── CHECKLIST ── */}
          <section id="section-checklist">
            <h3 className="text-white font-bold text-lg mb-4">✅ Checklist prioritaire</h3>
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

          {/* ── AIDES DISPONIBLES ── */}
          {result.aides?.some((a) => a.eligible) && (
            <section>
              <h3 className="text-white font-bold text-lg mb-4">🎁 Aides disponibles</h3>
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

          {/* ── CTA AMÉLIORER ── */}
          <div className="bg-gradient-to-r from-blue-600/10 to-cyan-600/10 border border-blue-500/20 rounded-2xl p-6 text-center">
            <p className="text-white font-semibold mb-1">Ce plan vous convient presque ?</p>
            <p className="text-slate-400 text-sm mb-4">
              Ajoutez un spa, modifiez le budget, changez les dates — l'IA adapte votre plan en direct.
            </p>
            <button
              onClick={onAmeliorer}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl px-6 py-2.5 text-sm transition-all"
            >
              <Wand2 className="h-4 w-4" />
              Améliorer avec l'IA
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}
