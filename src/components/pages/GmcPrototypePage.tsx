/**
 * GmcPrototypePage — Sandbox UX pour comparer Mode Accompagnement vs Mode Pilotage
 * Page : /gmc-prototype
 * ⚠️ PROTOTYPE UNIQUEMENT — données mockées, pas de connexion backend
 */

import { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const LOTS_ACCOMPAGNEMENT = [
  {
    nom: 'Terrassement',
    devis: [
      { label: 'Devis A — Dupont TP',    montant: 12000, status: 'ok'      },
      { label: 'Devis B — BTP Express',  montant: 18000, status: 'elevé'   },
      { label: 'Devis C — GeoSol',       montant: 13500, status: 'ok'      },
    ],
    recommandation: 'A ou C',
  },
  {
    nom: 'Maçonnerie',
    devis: [
      { label: 'Devis A — Construire Pro', montant: 28000, status: 'ok'   },
      { label: 'Devis B — Murs & Co',      montant: 31000, status: 'elevé' },
    ],
    recommandation: 'A',
  },
];

const ETAPES = [
  { num: 1, label: 'Choisir les artisans',   done: false },
  { num: 2, label: 'Valider les devis',      done: false },
  { num: 3, label: 'Planifier les travaux',  done: false },
  { num: 4, label: 'Suivre le budget',       done: false },
];

const LOTS_PILOTAGE = [
  { nom: 'Espaces verts',  status: 'done',    montant: 8400,  paye: 8400  },
  { nom: 'Terrassement',   status: 'warning', montant: 13500, paye: 4000  },
  { nom: 'Électricité',    status: 'active',  montant: 18200, paye: 0     },
  { nom: 'Maçonnerie',     status: 'pending', montant: 28000, paye: 0     },
];

const PAIEMENTS = [
  { artisan: 'GeoSol',       lot: 'Terrassement', montant: 4000, date: '12 avr.', statut: 'payé'     },
  { artisan: 'VerdeLand',    lot: 'Espaces verts', montant: 8400, date: '28 mar.', statut: 'payé'     },
  { artisan: 'Elec Pro',     lot: 'Électricité',   montant: 5460, date: '20 mai',  statut: 'à payer'  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtEur(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function ProgressBar({ value, max, color = 'bg-indigo-500' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round(value / max * 100)) : 0;
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE ACCOMPAGNEMENT
// ─────────────────────────────────────────────────────────────────────────────

function OnboardingModePreview() {
  const [expanded, setExpanded] = useState<string | null>('Terrassement');

  return (
    <div className="flex flex-col gap-5 h-full">

      {/* ── Badge mode ── */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">
          🟠 Mode Accompagnement
        </span>
        <span className="text-xs text-gray-400">Pour les débutants</span>
      </div>

      {/* ── 1. Assistant hero ── */}
      <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 p-5 text-white shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg shrink-0">🤖</div>
          <div>
            <p className="text-[13px] font-semibold mb-1">Votre Pilote de Chantier</p>
            <p className="text-sm leading-relaxed text-white/90">
              👋 On va organiser votre chantier ensemble. Commencez par importer vos devis pour comparer les artisans.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <div className="h-1.5 flex-1 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full w-1/5 bg-white rounded-full" />
          </div>
          <span className="text-[11px] text-white/70">Étape 1/5</span>
        </div>
      </div>

      {/* ── 2. Import devis VMD ── */}
      <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-green-600 text-sm font-semibold">✔ 5 devis trouvés</span>
            <span className="text-xs text-green-500 bg-green-100 px-2 py-0.5 rounded-full">VerifierMonDevis.fr</span>
          </div>
        </div>
        <button className="w-full py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
          ↓ Importer mes devis
        </button>
      </div>

      {/* ── 3. Dropzone ── */}
      <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-5 text-center hover:border-orange-300 hover:bg-orange-50/40 transition-all cursor-pointer">
        <div className="text-3xl mb-2">📎</div>
        <p className="text-sm font-medium text-gray-600">Glissez vos devis ici</p>
        <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — ou cliquez pour parcourir</p>
      </div>

      {/* ── 4. Lots avec comparaison ── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Comparaison par lot</p>
        {LOTS_ACCOMPAGNEMENT.map(lot => (
          <div key={lot.nom} className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              onClick={() => setExpanded(expanded === lot.nom ? null : lot.nom)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">{lot.nom}</span>
                <span className="text-xs text-gray-400">{lot.devis.length} devis</span>
              </div>
              <svg className={`h-4 w-4 text-gray-400 transition-transform ${expanded === lot.nom ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {expanded === lot.nom && (
              <div className="px-4 pb-4 space-y-2 border-t border-gray-50">
                {lot.devis.map(d => (
                  <div key={d.label} className="flex items-center justify-between py-1.5">
                    <span className="text-[12px] text-gray-600">{d.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-gray-900">{fmtEur(d.montant)}</span>
                      {d.status === 'elevé' && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">⚠️ Élevé</span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="mt-2 pt-2 border-t border-dashed border-gray-100 flex items-center gap-1.5">
                  <span className="text-[11px] text-orange-600 font-semibold">👉 Recommandé :</span>
                  <span className="text-[11px] text-gray-600">Devis {lot.recommandation}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── 5. Plan étapes ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Votre plan</p>
        <div className="space-y-2">
          {ETAPES.map((e, i) => (
            <div key={e.num} className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                i === 0 ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                {e.done ? '✓' : e.num}
              </div>
              <span className={`text-[12px] ${i === 0 ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
                {e.label}
              </span>
              {i === 0 && (
                <span className="ml-auto text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium">En cours</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── 6. Budget estimé ── */}
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
        <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wide mb-1.5">Budget estimé</p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-black text-indigo-700">30 000 € – 45 000 €</span>
        </div>
        <p className="text-[11px] text-indigo-500 mt-1">✅ Vous êtes dans la norme pour votre région</p>
        <ProgressBar value={37500} max={60000} color="bg-indigo-400" />
      </div>

      {/* ── Assistant flottant (simulation) ── */}
      <div className="relative">
        <div className="rounded-xl bg-gray-900 text-white px-4 py-3 text-[12px] flex items-start gap-2.5 shadow-lg">
          <span className="text-base shrink-0 mt-0.5">💬</span>
          <div>
            <p className="font-medium">Assistant</p>
            <p className="text-gray-300 mt-0.5">Ajoutez un second devis pour Maçonnerie pour comparer les prix.</p>
          </div>
          <div className="absolute -top-1.5 left-6 w-3 h-3 bg-gray-900 rotate-45" />
        </div>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE PILOTAGE
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  done:    { icon: '✅', label: 'Terminé',   cls: 'text-green-700 bg-green-50 border-green-200'  },
  warning: { icon: '⚠️', label: 'En retard', cls: 'text-amber-700 bg-amber-50 border-amber-200'  },
  active:  { icon: '🔄', label: 'En cours',  cls: 'text-blue-700 bg-blue-50 border-blue-200'     },
  pending: { icon: '⏳', label: 'À venir',   cls: 'text-gray-500 bg-gray-50 border-gray-200'     },
};

// Simple planning Gantt mini
const GANTT = [
  { label: 'Espaces verts', start: 0, dur: 2, color: 'bg-green-400'  },
  { label: 'Terrassement',  start: 1, dur: 3, color: 'bg-amber-400'  },
  { label: 'Maçonnerie',    start: 3, dur: 4, color: 'bg-indigo-400' },
  { label: 'Électricité',   start: 5, dur: 2, color: 'bg-blue-400'   },
];

function PilotageModePreview() {
  const totalPrevu  = LOTS_PILOTAGE.reduce((s, l) => s + l.montant, 0);
  const totalEngage = LOTS_PILOTAGE.filter(l => l.status !== 'pending').reduce((s, l) => s + l.montant, 0);
  const totalPaye   = LOTS_PILOTAGE.reduce((s, l) => s + l.paye, 0);
  const pctPaye     = totalPrevu > 0 ? Math.round(totalPaye / totalPrevu * 100) : 0;

  return (
    <div className="flex flex-col gap-5 h-full">

      {/* ── Badge mode ── */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
          🟢 Mode Pilotage
        </span>
        <span className="text-xs text-gray-400">Pour les utilisateurs avancés</span>
      </div>

      {/* ── 1. Budget hero ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Budget chantier</p>
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <div className="pr-4">
            <p className="text-[10px] text-gray-400 mb-0.5">Prévu</p>
            <p className="text-base font-black text-gray-900">{fmtEur(totalPrevu)}</p>
          </div>
          <div className="px-4">
            <p className="text-[10px] text-gray-400 mb-0.5">Engagé</p>
            <p className="text-base font-black text-indigo-600">{fmtEur(totalEngage)}</p>
          </div>
          <div className="pl-4">
            <p className="text-[10px] text-gray-400 mb-0.5">Payé</p>
            <p className="text-base font-black text-green-600">{fmtEur(totalPaye)}</p>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>Avancement paiements</span>
            <span className="font-semibold text-gray-600">{pctPaye}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
            <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${pctPaye}%` }} />
            <div className="h-full bg-indigo-200" style={{ width: `${Math.round(totalEngage / totalPrevu * 100) - pctPaye}%` }} />
          </div>
          <div className="flex gap-3 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Payé</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-200 inline-block" />Engagé</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-100 inline-block" />Reste</span>
          </div>
        </div>
      </div>

      {/* ── 2. Avancement lots ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Lots</p>
        <div className="space-y-2.5">
          {LOTS_PILOTAGE.map(lot => {
            const cfg = STATUS_CONFIG[lot.status as keyof typeof STATUS_CONFIG];
            const pct = lot.montant > 0 ? Math.round(lot.paye / lot.montant * 100) : 0;
            return (
              <div key={lot.nom} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-semibold text-gray-800">{lot.nom}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-gray-700">{fmtEur(lot.montant)}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${cfg.cls}`}>{cfg.icon}</span>
                    </div>
                  </div>
                  <ProgressBar
                    value={lot.paye}
                    max={lot.montant}
                    color={lot.status === 'done' ? 'bg-green-400' : lot.status === 'warning' ? 'bg-amber-400' : 'bg-indigo-400'}
                  />
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[9px] text-gray-400">{pct > 0 ? `${fmtEur(lot.paye)} payés` : 'Pas encore payé'}</span>
                    <span className="text-[9px] text-gray-400">{pct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 3. Paiements récents ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Paiements</p>
        <div className="space-y-2">
          {PAIEMENTS.map(p => (
            <div key={`${p.artisan}-${p.lot}`} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-gray-800 truncate">{p.artisan}</p>
                <p className="text-[10px] text-gray-400">{p.lot} · {p.date}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[13px] font-black text-gray-900">{fmtEur(p.montant)}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                  p.statut === 'payé' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                }`}>{p.statut}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 4. Alerte ── */}
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
        <span className="text-xl shrink-0">🚨</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-red-800">1 devis dépasse le budget prévu</p>
          <p className="text-[11px] text-red-600 mt-0.5">Terrassement · +4 500 € vs enveloppe initiale</p>
        </div>
        <button className="shrink-0 text-[10px] font-semibold text-red-700 bg-white border border-red-200 rounded-lg px-2 py-1 hover:bg-red-50">
          Voir
        </button>
      </div>

      {/* ── 5. Planning mini-Gantt ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Planning</p>
          <span className="text-[10px] text-gray-400">Semaines →</span>
        </div>
        <div className="space-y-2">
          {GANTT.map(g => (
            <div key={g.label} className="flex items-center gap-2">
              <p className="text-[10px] text-gray-500 w-20 shrink-0 truncate">{g.label}</p>
              <div className="flex-1 relative h-5 bg-gray-50 rounded overflow-hidden">
                <div
                  className={`absolute h-full rounded ${g.color} opacity-80 flex items-center justify-end pr-1`}
                  style={{
                    left:  `${g.start / 7 * 100}%`,
                    width: `${g.dur  / 7 * 100}%`,
                  }}
                >
                  <span className="text-[8px] text-white font-semibold">{g.dur}S</span>
                </div>
              </div>
            </div>
          ))}
          {/* Axe semaines */}
          <div className="flex ml-[88px] gap-0">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex-1 text-center text-[8px] text-gray-300 border-l border-gray-100 pt-1">
                S{i + 1}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Assistant discret ── */}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200">
        <span className="text-base shrink-0">🤖</span>
        <p className="text-[11px] text-gray-500 flex-1">
          <span className="font-semibold text-gray-700">Assistant :</span> Attention — un écart de tarif détecté sur Terrassement. <span className="text-indigo-500 underline cursor-pointer">Voir l'analyse →</span>
        </p>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE PRINCIPALE
// ─────────────────────────────────────────────────────────────────────────────

export default function GmcPrototypePage() {
  const [activeTab, setActiveTab] = useState<'both' | 'onboarding' | 'pilotage'>('both');

  return (
    <div className="min-h-screen bg-[#F9FAFB]">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-lg font-black text-gray-900">GMC</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs font-medium text-gray-500">Prototype UX — Comparaison modes</span>
            <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
              ⚠️ Données fictives
            </span>
          </div>
          {/* Tabs desktop uniquement */}
          <div className="hidden sm:flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {(['both', 'onboarding', 'pilotage'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                  activeTab === tab
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'both' ? '⬜ Côte à côte' : tab === 'onboarding' ? '🟠 Accompagnement' : '🟢 Pilotage'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Header explication ── */}
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-4">
        <div className="rounded-2xl bg-gradient-to-r from-slate-800 to-slate-700 text-white px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-base font-bold mb-1">🧪 Test UX — Gérer Mon Chantier</h1>
            <p className="text-sm text-slate-300">
              Comparez les deux expériences utilisateur : <strong className="text-white">Accompagnement</strong> (guidé, débutant) vs <strong className="text-white">Pilotage</strong> (compact, data-first).
            </p>
          </div>
          <div className="flex gap-3 text-center shrink-0">
            <div className="bg-white/10 rounded-xl px-4 py-2">
              <p className="text-[10px] text-slate-300">Lisibilité</p>
              <p className="text-lg font-black">👁</p>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-2">
              <p className="text-[10px] text-slate-300">Action</p>
              <p className="text-lg font-black">⚡</p>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-2">
              <p className="text-[10px] text-slate-300">Ressenti</p>
              <p className="text-lg font-black">❤️</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Layout split ── */}
      <div className="max-w-7xl mx-auto px-4 pb-12">
        <div className={`grid gap-6 ${activeTab === 'both' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-xl mx-auto'}`}>

          {/* Colonne Accompagnement */}
          {(activeTab === 'both' || activeTab === 'onboarding') && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="h-px flex-1 bg-orange-200" />
                <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">Mode Accompagnement</span>
                <div className="h-px flex-1 bg-orange-200" />
              </div>
              <div className="bg-[#F9FAFB] rounded-3xl border border-gray-200 shadow-sm p-5 overflow-y-auto">
                <OnboardingModePreview />
              </div>
              {/* Légende UX */}
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'Guidance',  val: '●●●●●' },
                  { label: 'Densité',   val: '●●○○○' },
                  { label: 'CTA',       val: '●●●●○' },
                ].map(l => (
                  <div key={l.label} className="bg-white border border-gray-100 rounded-xl py-2 px-1">
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide">{l.label}</p>
                    <p className="text-[11px] text-orange-500 font-mono mt-0.5">{l.val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Colonne Pilotage */}
          {(activeTab === 'both' || activeTab === 'pilotage') && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="h-px flex-1 bg-green-200" />
                <span className="text-xs font-bold text-green-600 uppercase tracking-wider">Mode Pilotage</span>
                <div className="h-px flex-1 bg-green-200" />
              </div>
              <div className="bg-[#F9FAFB] rounded-3xl border border-gray-200 shadow-sm p-5 overflow-y-auto">
                <PilotageModePreview />
              </div>
              {/* Légende UX */}
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'Guidance',  val: '●○○○○' },
                  { label: 'Densité',   val: '●●●●○' },
                  { label: 'Efficacité',val: '●●●●●' },
                ].map(l => (
                  <div key={l.label} className="bg-white border border-gray-100 rounded-xl py-2 px-1">
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide">{l.label}</p>
                    <p className="text-[11px] text-green-500 font-mono mt-0.5">{l.val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ── Footer comparaison ── */}
        {activeTab === 'both' && (
          <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-gray-800 mb-4 text-center">📊 Tableau comparatif</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 text-gray-400 font-medium w-1/3">Critère</th>
                    <th className="text-center py-2 text-orange-600 font-semibold">🟠 Accompagnement</th>
                    <th className="text-center py-2 text-green-600 font-semibold">🟢 Pilotage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[
                    ['Cible',             'Primo-accédant, chantier complexe',  'Utilisateur habituel, chantier connu'],
                    ['Densité info',      'Faible — 1 action à la fois',        'Élevée — tout visible d\'un coup'],
                    ['Assistant IA',      'Central, dominant, guidant',         'Discret, en bas, alertes seulement'],
                    ['Comparaison devis', 'Mise en avant ✅',                   'Accès rapide dans les lots'],
                    ['Budget',           'Fourchette estimée',                  'Chiffres précis + barre progression'],
                    ['Planning',         'Étapes séquentielles',               'Gantt compact'],
                    ['Charge cognitive', 'Très faible',                        'Modérée'],
                  ].map(([crit, a, b]) => (
                    <tr key={crit}>
                      <td className="py-2.5 font-medium text-gray-600 pr-4">{crit}</td>
                      <td className="py-2.5 text-center text-gray-500 px-2">{a}</td>
                      <td className="py-2.5 text-center text-gray-500 px-2">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
