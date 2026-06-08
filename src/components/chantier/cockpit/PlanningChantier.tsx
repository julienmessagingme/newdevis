/**
 * PlanningChantier — Planning Gantt + Rendez-vous.
 * Tasks live in AssistantChantierSection via useTaches hook.
 */
import { useState, useEffect } from 'react';
import {
  Plus, Trash2, Loader2,
  Calendar, Pencil, Layers, Lock, Sparkles,
} from 'lucide-react';
import type { ChantierIAResult } from '@/types/chantier-ia';
import PlanningTimeline from './planning/PlanningTimeline';
import SubPlanningView from './planning/SubPlanningView';
import { useAdvancedPlanningAccess } from '@/hooks/useAdvancedPlanningAccess';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Rdv {
  id: string;
  titre: string;
  date: string;
  time?: string;
  type: 'artisan' | 'visite' | 'signature' | 'autre';
}

// ── Constants ──────────────────────────────────────────────────────────────────

const RDV_CFG: Record<Rdv['type'], { label: string; emoji: string; cls: string }> = {
  artisan:   { label: 'Artisan',   emoji: '👷', cls: 'bg-blue-50 text-blue-700'   },
  visite:    { label: 'Visite',    emoji: '🏠', cls: 'bg-purple-50 text-purple-700' },
  signature: { label: 'Signature', emoji: '✍️', cls: 'bg-emerald-50 text-emerald-700' },
  autre:     { label: 'Autre',     emoji: '📅', cls: 'bg-gray-50 text-gray-600'   },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  } catch { return iso; }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  result: ChantierIAResult;
  chantierId: string | null;
  token: string | null;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PlanningChantier({ result, chantierId, token }: Props) {
  const [tab,          setTab]          = useState<'planning' | 'rdv'>('planning');
  const [planningView, setPlanningView] = useState<'simple' | 'advanced'>('simple');
  const [showUpsell,   setShowUpsell]   = useState(false);
  const access = useAdvancedPlanningAccess();
  const [rdvs,         setRdvs]         = useState<Rdv[]>([]);
  const [showAddRdv,   setShowAddRdv]   = useState(false);
  const [newRdv,       setNewRdv]       = useState<Partial<Rdv>>({ type: 'artisan' });
  const [editingRdv,   setEditingRdv]   = useState<Rdv | null>(null);

  // ── RDV — localStorage ────────────────────────────────────────────────────

  useEffect(() => {
    if (!chantierId) return;
    try {
      const raw = localStorage.getItem(`rdvs_${chantierId}`);
      if (raw) setRdvs(JSON.parse(raw));
    } catch {}
  }, [chantierId]);

  // Vue planning préférée (simple/avancé) persistée par chantier.
  useEffect(() => {
    if (!chantierId) return;
    try {
      const v = localStorage.getItem(`planning_view_${chantierId}`);
      if (v === 'advanced' || v === 'simple') setPlanningView(v);
    } catch {}
  }, [chantierId]);

  const selectView = (v: 'simple' | 'advanced') => {
    // Le mode avancé est premium : si non habilité → upsell au lieu de switcher.
    if (v === 'advanced' && !access.allowed) { setShowUpsell(true); return; }
    setShowUpsell(false);
    setPlanningView(v);
    if (chantierId) { try { localStorage.setItem(`planning_view_${chantierId}`, v); } catch {} }
  };

  const persistRdvs = (list: Rdv[]) => {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    setRdvs(sorted);
    if (chantierId) {
      try { localStorage.setItem(`rdvs_${chantierId}`, JSON.stringify(sorted)); } catch {}
    }
  };

  const saveRdv = () => {
    if (!newRdv.titre?.trim() || !newRdv.date) return;
    if (editingRdv) {
      persistRdvs(rdvs.map(r => r.id === editingRdv.id
        ? { ...r, titre: newRdv.titre!, date: newRdv.date!, time: newRdv.time, type: newRdv.type ?? 'autre' }
        : r
      ));
      setEditingRdv(null);
    } else {
      const rdv: Rdv = {
        id: crypto.randomUUID(),
        titre: newRdv.titre!,
        date: newRdv.date!,
        time: newRdv.time,
        type: newRdv.type ?? 'autre',
      };
      persistRdvs([...rdvs, rdv]);
    }
    setNewRdv({ type: 'artisan' });
    setShowAddRdv(false);
  };

  const startEditRdv = (rdv: Rdv) => {
    setEditingRdv(rdv);
    setNewRdv({ titre: rdv.titre, date: rdv.date, time: rdv.time ?? '', type: rdv.type });
    setShowAddRdv(true);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const upcomingRdvs = rdvs.filter(r => r.date >= today());

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto px-4 sm:px-6 py-6 space-y-5 max-w-3xl lg:max-w-7xl xl:max-w-[1600px]">

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 max-w-xl mx-auto">
        {([
          ['planning', 'Planning',                   Calendar   ],
          ['rdv',      `RDV (${upcomingRdvs.length})`, Calendar ],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id as typeof tab)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
              tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />{label}
          </button>
        ))}
      </div>

      {/* ── Tab Planning ───────────────────────────────────────────────── */}
      {tab === 'planning' && (
        <div className="space-y-4">
          {/* Toggle Simplifié / Avancé (avancé = premium) */}
          {(() => {
            const advancedActive = planningView === 'advanced' && access.allowed;
            const tabCls = (active: boolean) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`;
            return (
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                <button onClick={() => selectView('simple')} className={tabCls(!advancedActive)}>
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />Simplifié
                </button>
                <button
                  onClick={() => selectView('advanced')}
                  aria-label="Vue avancée (sous-phases) — premium"
                  className={tabCls(advancedActive)}
                >
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />Avancé
                  {!access.allowed && !access.isLoading && <Lock className="h-3 w-3 text-amber-500" aria-hidden="true" />}
                </button>
              </div>
            );
          })()}

          {/* Upsell premium si clic sur Avancé sans habilitation */}
          {showUpsell && !access.allowed && (
            <div className="flex items-start gap-3 bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl px-4 py-3">
              <Sparkles className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="text-sm text-gray-700">
                <p className="font-semibold text-gray-900">Planning avancé — offre premium</p>
                <p className="text-xs mt-0.5 text-gray-600">Découpez chaque phase en sous-étapes et chaînez-les, même entre métiers (ex : l'électricité démarre quand la mise en eau du plombier est finie). Disponible avec l'abonnement GérerMonChantier.</p>
              </div>
            </div>
          )}

          {planningView === 'advanced' && access.allowed
            ? <SubPlanningView chantierId={chantierId} token={token} />
            : <PlanningTimeline chantierId={chantierId} token={token} />}
        </div>
      )}

      {/* ── Tab Rendez-vous ────────────────────────────────────────────── */}
      {tab === 'rdv' && (
        <div className="space-y-4">
          {showAddRdv ? (
            <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-5 space-y-4">
              <p className="font-semibold text-gray-900 text-sm">
                {editingRdv ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous'}
              </p>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Titre *</label>
                <input
                  value={newRdv.titre ?? ''}
                  onChange={e => setNewRdv(p => ({ ...p, titre: e.target.value }))}
                  placeholder="Ex : Visite de chantier, RDV plombier..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Date *</label>
                  <input type="date" min={editingRdv ? undefined : today()} value={newRdv.date ?? ''}
                    onChange={e => setNewRdv(p => ({ ...p, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Heure</label>
                  <input type="time" value={newRdv.time ?? ''}
                    onChange={e => setNewRdv(p => ({ ...p, time: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Type</label>
                <div className="flex gap-2 flex-wrap">
                  {(Object.entries(RDV_CFG) as [Rdv['type'], typeof RDV_CFG[Rdv['type']]][]).map(([type, cfg]) => (
                    <button key={type} onClick={() => setNewRdv(p => ({ ...p, type }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 text-xs font-medium transition-all ${
                        newRdv.type === type ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500 hover:border-blue-200'
                      }`}>
                      <span>{cfg.emoji}</span>{cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveRdv}
                  disabled={!newRdv.titre?.trim() || !newRdv.date}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl py-2.5 disabled:opacity-50 transition-colors"
                >
                  {editingRdv ? 'Enregistrer' : 'Ajouter'}
                </button>
                <button
                  onClick={() => { setShowAddRdv(false); setNewRdv({ type: 'artisan' }); setEditingRdv(null); }}
                  className="px-4 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddRdv(true)}
              className="w-full flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-2xl px-4 py-3 transition-all">
              <Plus className="h-4 w-4" />
              Ajouter un rendez-vous
            </button>
          )}

          {rdvs.length === 0 && !showAddRdv && (
            <div className="text-center py-10 text-gray-400 text-sm">
              Aucun rendez-vous planifi. Ajoutez vos visites, RDV artisans, signatures...
            </div>
          )}

          {rdvs.map(rdv => {
            const cfg    = RDV_CFG[rdv.type];
            const isPast = rdv.date < today();
            return (
              <div key={rdv.id} className={`group bg-white rounded-xl border px-4 py-3.5 flex items-center gap-3 transition-colors ${isPast ? 'border-gray-100 opacity-50' : 'border-gray-100 hover:border-gray-200'}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 ${cfg.cls}`}>
                  {cfg.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{rdv.titre}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {fmtDate(rdv.date)}{rdv.time ? ` a ${rdv.time}` : ''} · {cfg.label}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => startEditRdv(rdv)}
                    className="text-gray-300 hover:text-blue-500 p-1 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => persistRdvs(rdvs.filter(r => r.id !== rdv.id))}
                    className="text-gray-300 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
