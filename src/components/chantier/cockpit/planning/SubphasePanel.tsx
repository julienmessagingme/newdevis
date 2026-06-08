/**
 * SubphasePanel — gestion des sous-phases d'UN lot (feature premium).
 * Ajout/édition/suppression de sous-phases + construction des dépendances
 * (y compris cross-métier : une sous-phase peut dépendre d'une sous-phase d'un
 * AUTRE lot). Affiche les refus serveur (cycle, lot↔propre-sous-phase).
 *
 * Composant présentiel : toute la persistance passe par les callbacks (hook usePlanning).
 */
import { useMemo, useState } from 'react';
import { Plus, Trash2, X, Pencil, Check, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import type { LotChantier, Subphase, PlanningEdgeRow, PlanningEdge } from '@/types/chantier-ia';

interface ActionResult { ok: boolean; error?: string }

interface Props {
  lot: LotChantier;
  lots: LotChantier[];
  subphases: Subphase[];          // TOUTES les sous-phases (pour le sélecteur cross-lot)
  subphaseDeps: PlanningEdgeRow[];
  saving: boolean;
  onAdd: (lotId: string, payload: { nom: string; duree_jours?: number }) => Promise<ActionResult>;
  onUpdate: (subId: string, patch: { nom?: string; duree_jours?: number; statut?: string }) => Promise<ActionResult>;
  onDelete: (subId: string) => Promise<ActionResult>;
  onAddDep: (edge: PlanningEdge) => Promise<ActionResult>;
  onRemoveDep: (edgeId: string) => Promise<ActionResult>;
  onClose: () => void;
}

const STATUT_CFG: Record<string, { label: string; cls: string }> = {
  a_faire:  { label: 'À faire',  cls: 'bg-gray-100 text-gray-600' },
  en_cours: { label: 'En cours', cls: 'bg-amber-100 text-amber-700' },
  termine:  { label: 'Terminé',  cls: 'bg-emerald-100 text-emerald-700' },
};

function fmt(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }
  catch { return iso; }
}

export default function SubphasePanel({
  lot, lots, subphases, subphaseDeps, saving,
  onAdd, onUpdate, onDelete, onAddDep, onRemoveDep, onClose,
}: Props) {
  const [newNom, setNewNom] = useState('');
  const [newDuree, setNewDuree] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editNom, setEditNom] = useState('');
  const [editDuree, setEditDuree] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // sous-phase pour laquelle on choisit un prédécesseur (id) + valeur sélectionnée
  const [depFor, setDepFor] = useState<string | null>(null);
  const [depValue, setDepValue] = useState('');

  const mySubs = useMemo(
    () => subphases.filter(s => s.lot_id === lot.id).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
    [subphases, lot.id],
  );
  const lotById = useMemo(() => new Map(lots.map(l => [l.id, l] as const)), [lots]);
  const subById = useMemo(() => new Map(subphases.map(s => [s.id, s] as const)), [subphases]);

  /** Prédécesseurs d'une sous-phase = arêtes from_subphase_id = sub.id. */
  const predsOf = (subId: string) => subphaseDeps.filter(e => e.from_subphase_id === subId);

  /** Libellé d'un endpoint prédécesseur (sous-phase d'un autre lot, ou lot). */
  const predLabel = (e: PlanningEdgeRow): string => {
    if (e.to_subphase_id) {
      const s = subById.get(e.to_subphase_id);
      if (!s) return '?';
      const parent = lotById.get(s.lot_id);
      return parent && parent.id !== lot.id ? `${s.nom} (${parent.nom})` : s.nom;
    }
    if (e.to_lot_id) return lotById.get(e.to_lot_id)?.nom ?? 'Lot';
    return '?';
  };

  const handleAction = async (p: Promise<ActionResult>) => {
    setErr(null);
    const r = await p;
    if (!r.ok) setErr(r.error ?? 'Erreur');
    return r;
  };

  const submitAdd = async () => {
    const nom = newNom.trim();
    if (!nom) return;
    const duree = Number(newDuree);
    const r = await handleAction(onAdd(lot.id, { nom, duree_jours: Number.isFinite(duree) && duree > 0 ? duree : undefined }));
    if (r.ok) { setNewNom(''); setNewDuree(''); }
  };

  const startEdit = (s: Subphase) => {
    setEditId(s.id); setEditNom(s.nom); setEditDuree(String(s.duree_jours ?? '')); setErr(null);
  };
  const submitEdit = async () => {
    if (!editId) return;
    const nom = editNom.trim();
    const duree = Number(editDuree);
    const r = await handleAction(onUpdate(editId, {
      nom: nom || undefined,
      duree_jours: Number.isFinite(duree) && duree > 0 ? duree : undefined,
    }));
    if (r.ok) setEditId(null);
  };

  const cycleStatut = async (s: Subphase) => {
    const order = ['a_faire', 'en_cours', 'termine'];
    const next = order[(order.indexOf(s.statut ?? 'a_faire') + 1) % order.length];
    await handleAction(onUpdate(s.id, { statut: next }));
  };

  const submitDep = async (subId: string) => {
    if (!depValue) return;
    // depValue = "sub:<id>" | "lot:<id>"
    const [kind, id] = depValue.split(':');
    const edge: PlanningEdge = kind === 'lot'
      ? { from_subphase_id: subId, to_lot_id: id }
      : { from_subphase_id: subId, to_subphase_id: id };
    const r = await handleAction(onAddDep(edge));
    if (r.ok) { setDepFor(null); setDepValue(''); }
  };

  // Options du sélecteur de prédécesseur pour une sous-phase donnée :
  // toutes les autres sous-phases (cross-lot inclus) + les lots, sauf soi-même /
  // sa propre sous-phase / son propre lot (le serveur refuse de toute façon).
  const depOptions = (subId: string) => {
    const opts: Array<{ value: string; label: string }> = [];
    for (const s of subphases) {
      if (s.id === subId) continue;
      if (s.lot_id === lot.id) {
        opts.push({ value: `sub:${s.id}`, label: `${s.nom}` });
      } else {
        const parent = lotById.get(s.lot_id);
        opts.push({ value: `sub:${s.id}`, label: `${s.nom} — ${parent?.nom ?? 'autre lot'}` });
      }
    }
    for (const l of lots) {
      if (l.id === lot.id) continue;
      opts.push({ value: `lot:${l.id}`, label: `Lot entier : ${l.nom}` });
    }
    return opts;
  };

  return (
    <div className="bg-white border border-indigo-200 rounded-2xl shadow-sm" role="region" aria-label={`Sous-phases du lot ${lot.nom}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{lot.emoji ? `${lot.emoji} ` : ''}{lot.nom}</p>
          <p className="text-xs text-gray-400">Découper en sous-phases · {fmt(lot.date_debut)} → {fmt(lot.date_fin)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saving && <Loader2 className="h-4 w-4 animate-spin text-indigo-400" aria-hidden="true" />}
          <button onClick={onClose} aria-label="Fermer le panneau de sous-phases" className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {err && (
        <div className="mx-4 mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{err}</span>
        </div>
      )}

      {/* Liste des sous-phases */}
      <div className="p-4 space-y-2">
        {mySubs.length === 0 && (
          <p className="text-sm text-gray-400 py-2">Aucune sous-phase. Ajoutez la première étape de ce lot ci-dessous.</p>
        )}

        {mySubs.map(s => {
          const preds = predsOf(s.id);
          const stCfg = STATUT_CFG[s.statut ?? 'a_faire'] ?? STATUT_CFG.a_faire;
          const isEditing = editId === s.id;
          return (
            <div key={s.id} className="border border-gray-100 rounded-xl p-3">
              {isEditing ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <input value={editNom} onChange={e => setEditNom(e.target.value)} placeholder="Nom de la sous-phase"
                    className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
                  <input value={editDuree} onChange={e => setEditDuree(e.target.value)} inputMode="numeric" placeholder="jours"
                    className="w-20 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
                  <div className="flex gap-1">
                    <button onClick={submitEdit} aria-label="Enregistrer" className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"><Check className="h-4 w-4" aria-hidden="true" /></button>
                    <button onClick={() => setEditId(null)} aria-label="Annuler" className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg"><X className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{s.nom}</p>
                    <p className="text-xs text-gray-400">{s.duree_jours ?? '?'} j · {fmt(s.date_debut)} → {fmt(s.date_fin)}</p>
                  </div>
                  <button onClick={() => cycleStatut(s)} className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${stCfg.cls}`} aria-label={`Statut : ${stCfg.label}, cliquer pour changer`}>
                    {stCfg.label}
                  </button>
                  <button onClick={() => startEdit(s)} aria-label="Modifier la sous-phase" className="p-1.5 text-gray-300 hover:text-indigo-500 rounded-lg hover:bg-indigo-50"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  <button onClick={() => handleAction(onDelete(s.id))} aria-label="Supprimer la sous-phase" className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                </div>
              )}

              {/* Dépendances : "démarre après" */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-gray-400 inline-flex items-center gap-1"><ArrowRight className="h-3 w-3" aria-hidden="true" />démarre après :</span>
                {preds.length === 0 && depFor !== s.id && (
                  <span className="text-[11px] text-gray-300">rien</span>
                )}
                {preds.map(e => (
                  <span key={e.id} className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-700 rounded-full pl-2 pr-1 py-0.5">
                    {predLabel(e)}
                    <button onClick={() => handleAction(onRemoveDep(e.id))} aria-label={`Retirer la dépendance ${predLabel(e)}`} className="hover:text-red-500"><X className="h-3 w-3" aria-hidden="true" /></button>
                  </span>
                ))}
                {depFor === s.id ? (
                  <span className="inline-flex items-center gap-1">
                    <select value={depValue} onChange={e => setDepValue(e.target.value)} className="text-[11px] border border-gray-200 rounded-lg px-1.5 py-0.5 max-w-[200px] focus:outline-none focus:border-indigo-400">
                      <option value="">Choisir…</option>
                      {depOptions(s.id).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button onClick={() => submitDep(s.id)} aria-label="Ajouter la dépendance" className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="h-3.5 w-3.5" aria-hidden="true" /></button>
                    <button onClick={() => { setDepFor(null); setDepValue(''); }} aria-label="Annuler" className="p-1 text-gray-400 hover:bg-gray-50 rounded"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  </span>
                ) : (
                  <button onClick={() => { setDepFor(s.id); setDepValue(''); setErr(null); }} className="text-[11px] text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-0.5">
                    <Plus className="h-3 w-3" aria-hidden="true" />ajouter
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Ajout d'une sous-phase */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-gray-100">
          <input value={newNom} onChange={e => setNewNom(e.target.value)} placeholder="Nouvelle sous-phase (ex : Mise en eau)"
            onKeyDown={e => { if (e.key === 'Enter') submitAdd(); }}
            className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          <input value={newDuree} onChange={e => setNewDuree(e.target.value)} inputMode="numeric" placeholder="jours"
            onKeyDown={e => { if (e.key === 'Enter') submitAdd(); }}
            className="w-20 border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          <button onClick={submitAdd} disabled={!newNom.trim() || saving}
            className="inline-flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-3 py-2">
            <Plus className="h-4 w-4" aria-hidden="true" />Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
