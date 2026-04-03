/**
 * PlanningChantier — assistant chantier interactif.
 * Tâches CRUD + Planning par mois + Rendez-vous.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Check, Trash2, ChevronRight, Loader2, X,
  Star, Sparkles, Calendar, CheckSquare, Pencil,
} from 'lucide-react';
import type { ChantierIAResult, TacheIA } from '@/types/chantier-ia';
import type { PrioriteTache } from '@/types/chantier-ia';
import PlanningTimeline from './planning/PlanningTimeline';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Rdv {
  id: string;
  titre: string;
  date: string;
  time?: string;
  type: 'artisan' | 'visite' | 'signature' | 'autre';
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PRIO: Record<PrioriteTache, { label: string; cls: string }> = {
  urgent:    { label: 'Urgent',    cls: 'bg-red-50 text-red-700 border-red-100'       },
  important: { label: 'Important', cls: 'bg-amber-50 text-amber-700 border-amber-100' },
  normal:    { label: 'Normal',    cls: 'bg-gray-50 text-gray-500 border-gray-100'    },
};


const RDV_CFG: Record<Rdv['type'], { label: string; emoji: string; cls: string }> = {
  artisan:   { label: 'Artisan',   emoji: '👷', cls: 'bg-blue-50 text-blue-700'   },
  visite:    { label: 'Visite',    emoji: '🏠', cls: 'bg-purple-50 text-purple-700' },
  signature: { label: 'Signature', emoji: '✍️', cls: 'bg-emerald-50 text-emerald-700' },
  autre:     { label: 'Autre',     emoji: '📅', cls: 'bg-gray-50 text-gray-600'   },
};

// Tâches auto-générées par type de projet
const AUTO_TASKS: Record<string, Array<{ titre: string; priorite: PrioriteTache }>> = {
  extension: [
    { titre: 'Déposer le permis de construire en mairie', priorite: 'urgent' },
    { titre: 'Consulter un architecte (obligatoire si > 150 m²)', priorite: 'urgent' },
    { titre: 'Obtenir 3 devis gros œuvre', priorite: 'urgent' },
    { titre: 'Souscrire une assurance dommages-ouvrage', priorite: 'important' },
    { titre: 'Planifier le raccordement aux réseaux', priorite: 'normal' },
  ],
  renovation_maison: [
    { titre: 'Obtenir 3 devis par corps d\'état', priorite: 'urgent' },
    { titre: 'Vérifier la décennale de chaque artisan', priorite: 'urgent' },
    { titre: 'Planifier l\'ordre des interventions', priorite: 'important' },
    { titre: 'Prévoir une solution de relogement si nécessaire', priorite: 'normal' },
  ],
  salle_de_bain: [
    { titre: 'Obtenir 2-3 devis plombier + carreleur', priorite: 'urgent' },
    { titre: 'Choisir les équipements sanitaires', priorite: 'important' },
    { titre: 'Planifier la coupure d\'eau', priorite: 'important' },
  ],
  cuisine: [
    { titre: 'Commander la cuisine (délai ~8 semaines)', priorite: 'urgent' },
    { titre: 'Obtenir devis plombier + électricien', priorite: 'urgent' },
    { titre: 'Prévoir le stockage temporaire', priorite: 'normal' },
  ],
  piscine: [
    { titre: 'Demander une déclaration préalable en mairie', priorite: 'urgent' },
    { titre: 'Obtenir 3 devis piscinistes', priorite: 'urgent' },
    { titre: 'Prévoir terrassement et évacuation des terres', priorite: 'important' },
  ],
  terrasse: [
    { titre: 'Obtenir 2-3 devis terrasse', priorite: 'urgent' },
    { titre: 'Choisir le matériau (composite vs naturel)', priorite: 'important' },
    { titre: 'Vérifier la résistance de la dalle support', priorite: 'important' },
  ],
  autre: [
    { titre: 'Obtenir 3 devis comparatifs', priorite: 'urgent' },
    { titre: 'Vérifier les assurances des artisans (décennale)', priorite: 'important' },
    { titre: 'Définir le planning d\'intervention', priorite: 'normal' },
  ],
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
  initialTaches: TacheIA[];
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PlanningChantier({ result, chantierId, token, initialTaches }: Props) {
  const [taches,       setTaches]       = useState<TacheIA[]>(initialTaches);
  const [tab,          setTab]          = useState<'taches' | 'planning' | 'rdv'>('taches');
  const [showAdd,      setShowAdd]      = useState(false);
  const [newTitre,     setNewTitre]     = useState('');
  const [newPrio,      setNewPrio]      = useState<PrioriteTache>('normal');
  const [saving,       setSaving]       = useState(false);
  const [toggling,     setToggling]     = useState<string | null>(null);
  const [deleting,     setDeleting]     = useState<string | null>(null);
  const [selected,     setSelected]     = useState<TacheIA | null>(null);
  const [generating,   setGenerating]   = useState(false);
  const [rdvs,         setRdvs]         = useState<Rdv[]>([]);
  const [showAddRdv,   setShowAddRdv]   = useState(false);
  const [newRdv,       setNewRdv]       = useState<Partial<Rdv>>({ type: 'artisan' });
  const [editingRdv,   setEditingRdv]   = useState<Rdv | null>(null);
  const addRef = useRef<HTMLInputElement>(null);

  // ── RDV — localStorage ────────────────────────────────────────────────────

  useEffect(() => {
    if (!chantierId) return;
    try {
      const raw = localStorage.getItem(`rdvs_${chantierId}`);
      if (raw) setRdvs(JSON.parse(raw));
    } catch {}
  }, [chantierId]);

  const persistRdvs = (list: Rdv[]) => {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    setRdvs(sorted);
    if (chantierId) {
      try { localStorage.setItem(`rdvs_${chantierId}`, JSON.stringify(sorted)); } catch {}
    }
  };

  // ── Auto-focus ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (showAdd) setTimeout(() => addRef.current?.focus(), 40);
  }, [showAdd]);

  // ── Auto-génération si aucune tâche ───────────────────────────────────────

  useEffect(() => {
    if (initialTaches.length === 0 && chantierId && token) {
      generateTasks();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── API helpers ───────────────────────────────────────────────────────────

  const base    = chantierId ? `/api/chantier/${chantierId}/taches` : null;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` };

  async function generateTasks() {
    if (!base || generating) return;
    const templates = AUTO_TASKS[result.typeProjet] ?? AUTO_TASKS['autre'];
    if (!templates?.length) return;
    setGenerating(true);
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers,
        body: JSON.stringify({ bulk: true, taches: templates }),
      });
      if (res.ok) {
        const data = await res.json();
        const created: TacheIA[] = (data.taches ?? []).map((t: Record<string, unknown>) => ({
          id: t.id as string, titre: t.titre as string,
          priorite: t.priorite as PrioriteTache, done: false,
        }));
        if (created.length) setTaches(created);
      }
    } catch { /* silent */ }
    setGenerating(false);
  }

  const toggleDone = useCallback(async (task: TacheIA) => {
    if (!base || !task.id) return;
    setToggling(task.id);
    const nd = !task.done;
    setTaches(prev => prev.map(t => t.id === task.id ? { ...t, done: nd } : t));
    try {
      await fetch(base, { method: 'PATCH', headers, body: JSON.stringify({ id: task.id, done: nd }) });
    } catch {
      setTaches(prev => prev.map(t => t.id === task.id ? { ...t, done: task.done } : t));
    }
    setToggling(null);
  }, [base, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const addTask = async () => {
    if (!newTitre.trim() || !base) return;
    setSaving(true);
    try {
      const res = await fetch(base, {
        method: 'POST', headers,
        body: JSON.stringify({ titre: newTitre.trim(), priorite: newPrio }),
      });
      if (res.ok) {
        const data = await res.json();
        setTaches(prev => [...prev, {
          id: data.tache.id, titre: data.tache.titre,
          priorite: data.tache.priorite as PrioriteTache, done: false,
        }]);
        setNewTitre('');
        setNewPrio('normal');
        setShowAdd(false);
      }
    } catch { /* silent */ }
    setSaving(false);
  };

  const deleteTask = async (task: TacheIA) => {
    if (!base || !task.id) return;
    setDeleting(task.id);
    setTaches(prev => prev.filter(t => t.id !== task.id));
    if (selected?.id === task.id) setSelected(null);
    try {
      await fetch(`${base}?todoId=${task.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
    } catch {
      setTaches(prev => [...prev, task]); // rollback
    }
    setDeleting(null);
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

  const pending      = taches.filter(t => !t.done);
  const done         = taches.filter(t => t.done);
  const urgentTasks  = pending.filter(t => t.priorite === 'urgent').slice(0, 3);
  const weekTasks    = urgentTasks.length > 0 ? urgentTasks : pending.slice(0, 3);
  const upcomingRdvs = rdvs.filter(r => r.date >= today());

  // ── Styles partagés ───────────────────────────────────────────────────────

  const BTN_PRIO_BASE = 'px-3 py-1.5 rounded-xl border-2 text-xs font-semibold transition-all';
  const BTN_ON        = 'border-blue-500 bg-blue-50 text-blue-700';
  const BTN_OFF       = 'border-gray-100 hover:border-blue-200 text-gray-500';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">

      {/* ── Cette semaine ──────────────────────────────────────────────── */}
      {weekTasks.length > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-4 w-4 text-blue-500 shrink-0" />
            <h3 className="font-semibold text-blue-900 text-sm">Priorités cette semaine</h3>
          </div>
          <div className="space-y-2">
            {weekTasks.map(task => (
              <div key={task.id}
                className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-blue-100 cursor-pointer hover:border-blue-200 transition-colors"
                onClick={() => setSelected(task)}
              >
                <button
                  onClick={e => { e.stopPropagation(); toggleDone(task); }}
                  className="w-5 h-5 rounded-md border-2 border-blue-300 flex items-center justify-center shrink-0 hover:border-blue-500 transition-colors"
                >
                  {toggling === task.id && <Loader2 className="h-3 w-3 animate-spin text-blue-400" />}
                </button>
                <span className="flex-1 text-sm font-medium text-gray-800 min-w-0 truncate">{task.titre}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${PRIO[task.priorite].cls}`}>
                  {PRIO[task.priorite].label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1">
        {([
          ['taches',   `Tâches (${pending.length})`, CheckSquare],
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

      {/* ── Tab Tâches ─────────────────────────────────────────────────── */}
      {tab === 'taches' && (
        <div className="space-y-4">
          {/* Formulaire ajout */}
          {showAdd ? (
            <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-4 space-y-3">
              <input
                ref={addRef}
                value={newTitre}
                onChange={e => setNewTitre(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addTask(); }
                  if (e.key === 'Escape') { setShowAdd(false); setNewTitre(''); }
                }}
                placeholder="Décrire la tâche…"
                className="w-full text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 shrink-0">Priorité :</span>
                {(['urgent', 'important', 'normal'] as PrioriteTache[]).map(p => (
                  <button key={p} onClick={() => setNewPrio(p)}
                    className={`${BTN_PRIO_BASE} ${newPrio === p ? BTN_ON : BTN_OFF}`}>
                    {PRIO[p].label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={addTask}
                  disabled={!newTitre.trim() || saving}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl py-2.5 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Ajouter
                </button>
                <button
                  onClick={() => { setShowAdd(false); setNewTitre(''); setNewPrio('normal'); }}
                  className="px-4 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAdd(true)}
              className="w-full flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-2xl px-4 py-3 transition-all">
              <Plus className="h-4 w-4" />
              Ajouter une tâche
            </button>
          )}

          {/* Auto-génération */}
          {taches.length === 0 && !generating && !showAdd && (
            <button onClick={generateTasks}
              className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 bg-white border border-gray-200 hover:border-gray-300 rounded-2xl px-4 py-3 transition-all">
              <Sparkles className="h-4 w-4 text-blue-400" />
              Générer des tâches recommandées pour ce projet
            </button>
          )}

          {generating && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />Génération en cours…
            </div>
          )}

          {/* Pending */}
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
                À faire · {pending.length}
              </p>
              {pending.map(task => (
                <TaskRow
                  key={task.id} task={task}
                  toggling={toggling} deleting={deleting}
                  onToggle={toggleDone} onDelete={deleteTask}
                  onClick={() => setSelected(task)}
                />
              ))}
            </div>
          )}

          {/* Done */}
          {done.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
                Terminées · {done.length}
              </p>
              {done.map(task => (
                <TaskRow
                  key={task.id} task={task}
                  toggling={toggling} deleting={deleting}
                  onToggle={toggleDone} onDelete={deleteTask}
                  onClick={() => setSelected(task)}
                  faded
                />
              ))}
            </div>
          )}

          {taches.length === 0 && !generating && (
            <div className="text-center py-10 text-gray-400 text-sm">
              Aucune tâche pour le moment.
            </div>
          )}
        </div>
      )}

      {/* ── Tab Planning ───────────────────────────────────────────────── */}
      {tab === 'planning' && (
        <div className="space-y-6">
          <PlanningTimeline chantierId={chantierId} token={token} />
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
                  placeholder="Ex : Visite de chantier, RDV plombier…"
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
              Aucun rendez-vous planifié. Ajoutez vos visites, RDV artisans, signatures…
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
                    {fmtDate(rdv.date)}{rdv.time ? ` à ${rdv.time}` : ''} · {cfg.label}
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

      {/* ── Drawer détail tâche ─────────────────────────────────────────── */}
      {selected && (
        <TaskDetail
          task={selected}
          onClose={() => setSelected(null)}
          onToggle={() => { toggleDone(selected); setSelected(null); }}
          onDelete={() => deleteTask(selected)}
        />
      )}
    </div>
  );
}

// ── TaskRow ────────────────────────────────────────────────────────────────────

function TaskRow({ task, toggling, deleting, onToggle, onDelete, onClick, faded }: {
  task: TacheIA; toggling: string | null; deleting: string | null;
  onToggle: (t: TacheIA) => void; onDelete: (t: TacheIA) => void;
  onClick: () => void; faded?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`group bg-white rounded-xl border px-4 py-3 flex items-center gap-3 cursor-pointer transition-all ${
        faded ? 'border-gray-100 opacity-60' : 'border-gray-100 hover:border-blue-200 hover:shadow-sm'
      }`}
    >
      <button
        onClick={e => { e.stopPropagation(); onToggle(task); }}
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
          task.done ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300 hover:border-blue-400'
        }`}
      >
        {toggling === task.id
          ? <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
          : task.done && <Check className="h-3 w-3 text-white" />}
      </button>

      <span className={`flex-1 text-sm font-medium min-w-0 truncate ${task.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
        {task.titre}
      </span>

      {!task.done && (
        <span className={`hidden sm:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${PRIO[task.priorite].cls}`}>
          {PRIO[task.priorite].label}
        </span>
      )}

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
        <button
          onClick={e => { e.stopPropagation(); onDelete(task); }}
          className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all"
        >
          {deleting === task.id
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Trash2 className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}

// ── TaskDetail drawer ──────────────────────────────────────────────────────────

function TaskDetail({ task, onClose, onToggle, onDelete }: {
  task: TacheIA; onClose: () => void;
  onToggle: () => void; onDelete: () => void;
}) {
  const WHY: Record<PrioriteTache, string> = {
    urgent:    'Cette tâche est critique — la retarder peut bloquer d\'autres étapes du chantier.',
    important: 'Cette tâche contribue significativement au bon déroulement du projet.',
    normal:    'Cette tâche peut être planifiée librement selon vos disponibilités.',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-sm bg-white shadow-2xl flex flex-col" style={{ animation: 'slideIn .22s cubic-bezier(.22,1,.36,1) both' }}>

        {/* Header */}
        <div className="px-5 py-5 border-b border-gray-100 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-base leading-snug">{task.titre}</p>
            <span className={`inline-flex mt-2 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${PRIO[task.priorite].cls}`}>
              {PRIO[task.priorite].label}
            </span>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 shrink-0 mt-0.5">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-5 overflow-y-auto">
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-amber-700 mb-1">Pourquoi c'est important ?</p>
            <p className="text-sm text-amber-900 leading-relaxed">{WHY[task.priorite]}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button
            onClick={onToggle}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              task.done
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <Check className="h-4 w-4" />
            {task.done ? 'Rouvrir la tâche' : 'Marquer terminée'}
          </button>
          <button
            onClick={onDelete}
            className="w-11 h-11 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
