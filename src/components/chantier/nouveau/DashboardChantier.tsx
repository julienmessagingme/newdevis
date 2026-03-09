import { useState } from 'react';
import {
  LayoutDashboard, Route, Users, FileText, CheckSquare, Gift,
  Wand2, Plus, ExternalLink, ChevronRight, AlertCircle,
} from 'lucide-react';
import type { ChantierIAResult, TacheIA } from '@/types/chantier-ia';

interface DashboardChantierProps {
  result: ChantierIAResult;
  chantierId: string | null;
  onAmeliorer: () => void;
  onNouveau: () => void;
}

const SIDEBAR_LINKS = [
  { id: 'apercu', label: 'Aperçu', icon: LayoutDashboard },
  { id: 'budget', label: 'Budget', icon: Gift },
  { id: 'roadmap', label: 'Planning', icon: Route },
  { id: 'artisans', label: 'Artisans', icon: Users },
  { id: 'formalites', label: 'Formalités', icon: FileText },
  { id: 'checklist', label: 'Checklist', icon: CheckSquare },
];

const STATUT_COLORS: Record<string, string> = {
  a_trouver: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  a_contacter: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  ok: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
};
const STATUT_LABELS: Record<string, string> = {
  a_trouver: 'À trouver',
  a_contacter: 'À contacter',
  ok: 'Confirmé',
};

const PRIORITE_COLORS: Record<string, string> = {
  urgent: 'text-red-400',
  important: 'text-amber-400',
  normal: 'text-slate-500',
};
const PRIORITE_DOTS: Record<string, string> = {
  urgent: 'bg-red-500',
  important: 'bg-amber-500',
  normal: 'bg-slate-600',
};

export default function DashboardChantier({ result, chantierId, onAmeliorer, onNouveau }: DashboardChantierProps) {
  const [activeSection, setActiveSection] = useState('apercu');
  const [taches, setTaches] = useState<TacheIA[]>(result.taches ?? []);

  const toggleTache = (idx: number) => {
    setTaches((prev) => prev.map((t, i) => (i === idx ? { ...t, done: !t.done } : t)));
  };

  const budgetTotal = result.budgetTotal || 1;

  const scrollTo = (id: string) => {
    setActiveSection(id);
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-[#0d1525] border-r border-white/[0.05] p-4 sticky top-0 h-screen overflow-y-auto">
        {/* Project header */}
        <div className="mb-6">
          <div className="text-2xl mb-1">{result.emoji}</div>
          <h2 className="text-white font-semibold text-sm leading-tight">{result.nom}</h2>
          <p className="text-slate-500 text-xs mt-0.5 leading-snug">{result.description}</p>
        </div>

        {/* Nav links */}
        <nav className="space-y-1 flex-1">
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
              {label}
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="mt-6 space-y-2">
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
              className="w-full flex items-center gap-2 text-slate-500 hover:text-white text-xs rounded-xl px-3 py-2 transition-all"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Mes chantiers
            </a>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">

          {/* ── SECTION 0 : Prochaine action ── */}
          <div id="section-apercu">
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-amber-200 font-semibold text-sm">{result.prochaineAction.titre}</p>
                  <p className="text-amber-500/80 text-xs mt-0.5 leading-relaxed">{result.prochaineAction.detail}</p>
                  {result.prochaineAction.deadline && (
                    <span className="inline-block mt-2 bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-lg px-2 py-0.5 text-xs font-medium">
                      ⏰ {result.prochaineAction.deadline}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── SECTION 1 : Budget ── */}
          <section id="section-budget">
            <h3 className="text-white font-display font-bold text-lg mb-4">💰 Budget estimatif</h3>
            <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-5">
              {/* Total */}
              <div className="flex items-baseline gap-2 mb-5">
                <span className="text-3xl font-display font-bold text-white">
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
                          <span className="text-white font-medium text-sm">{ligne.montant.toLocaleString('fr-FR')} €</span>
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

              {/* Financement */}
              {result.mensualite && (
                <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-slate-500 text-sm">Mensualité crédit</span>
                  <span className="text-blue-300 font-semibold">
                    {result.mensualite.toLocaleString('fr-FR')} €/mois · {result.dureeCredit} mois
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* ── SECTION 2 : Planning / Roadmap ── */}
          <section id="section-roadmap">
            <h3 className="text-white font-display font-bold text-lg mb-4">🗓️ Planning prévisionnel</h3>
            <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-5">
              <div className="space-y-4">
                {result.roadmap?.map((etape, i) => (
                  <div key={i} className="flex gap-4">
                    {/* Timeline dot + line */}
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        etape.isCurrent
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/[0.06] text-slate-500'
                      }`}>
                        {etape.numero}
                      </div>
                      {i < (result.roadmap?.length ?? 0) - 1 && (
                        <div className={`w-0.5 flex-1 mt-2 ${etape.isCurrent ? 'bg-blue-500/30' : 'bg-white/[0.04]'}`} style={{ minHeight: '1.5rem' }} />
                      )}
                    </div>
                    {/* Content */}
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

          {/* ── SECTION 3 : Artisans ── */}
          <section id="section-artisans">
            <h3 className="text-white font-display font-bold text-lg mb-4">👷 Artisans à mobiliser</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {result.artisans?.map((artisan, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 bg-[#0d1525] border border-white/[0.06] rounded-2xl p-4"
                  style={{ backgroundColor: artisan.couleurBg }}
                >
                  <span className="text-2xl shrink-0">{artisan.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{artisan.metier}</p>
                    <p className="text-slate-500 text-xs mt-0.5 leading-tight">{artisan.role}</p>
                    <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full border font-medium ${STATUT_COLORS[artisan.statut] ?? STATUT_COLORS.a_trouver}`}>
                      {STATUT_LABELS[artisan.statut] ?? artisan.statut}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── SECTION 4 : Formalités ── */}
          <section id="section-formalites">
            <h3 className="text-white font-display font-bold text-lg mb-4">📋 Formalités administratives</h3>
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

          {/* ── SECTION 5 : Checklist ── */}
          <section id="section-checklist">
            <h3 className="text-white font-display font-bold text-lg mb-4">✅ Checklist prioritaire</h3>
            <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl divide-y divide-white/[0.04]">
              {taches.map((t, i) => (
                <button
                  key={i}
                  onClick={() => toggleTache(i)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.02] transition-colors group"
                >
                  {/* Checkbox */}
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
                  {/* Dot priorité */}
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITE_DOTS[t.priorite]}`} />
                  {/* Texte */}
                  <span className={`flex-1 text-left text-sm transition-all ${
                    t.done ? 'line-through text-slate-600' : 'text-slate-200'
                  }`}>
                    {t.titre}
                  </span>
                  {/* Priorité label */}
                  <span className={`text-xs shrink-0 ${PRIORITE_COLORS[t.priorite]}`}>
                    {t.priorite === 'urgent' ? '🔴 Urgent' : t.priorite === 'important' ? '🟡 Important' : ''}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* ── SECTION 6 : Aides ── */}
          {result.aides?.some((a) => a.eligible) && (
            <section>
              <h3 className="text-white font-display font-bold text-lg mb-4">🎁 Aides disponibles</h3>
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

          {/* ── CTA Améliorer ── */}
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
