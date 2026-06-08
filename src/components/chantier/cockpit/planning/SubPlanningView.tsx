/**
 * SubPlanningView — vue planning AVANCÉE (feature premium).
 * Liste les lots avec leurs sous-phases sur une mini-timeline (positions en %,
 * dérivées des dates CPM). Cliquer un lot ouvre en bas le SubphasePanel pour le
 * découper en sous-phases et construire les dépendances (cross-métier inclus).
 *
 * La vue SIMPLIFIÉE (PlanningTimeline, Gantt complet avec D&D) reste inchangée :
 * cette vue est volontairement séparée pour ne pas déstabiliser le Gantt existant.
 */
import { useMemo, useState } from 'react';
import { Loader2, Layers, ChevronRight } from 'lucide-react';
import { usePlanning } from '@/hooks/usePlanning';
import type { Subphase } from '@/types/chantier-ia';
import SubphasePanel from './SubphasePanel';

const LOT_BAR = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-indigo-500',
];
function lotColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) { h = ((h << 5) - h) + id.charCodeAt(i); h |= 0; }
  return LOT_BAR[Math.abs(h) % LOT_BAR.length];
}

interface Props {
  chantierId: string | null;
  token: string | null;
}

export default function SubPlanningView({ chantierId, token }: Props) {
  const p = usePlanning(chantierId, token);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);

  const lots = useMemo(
    () => [...p.lots].sort((a, b) => (a.date_debut ?? '').localeCompare(b.date_debut ?? '')),
    [p.lots],
  );

  const subsByLot = useMemo(() => {
    const m = new Map<string, Subphase[]>();
    for (const s of p.subphases) {
      const arr = m.get(s.lot_id);
      if (arr) arr.push(s); else m.set(s.lot_id, [s]);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    return m;
  }, [p.subphases]);

  // Plage temporelle globale (lots + sous-phases) pour positionner en %.
  const range = useMemo(() => {
    const times: number[] = [];
    const push = (iso?: string | null) => { if (iso) { const t = new Date(iso).getTime(); if (!Number.isNaN(t)) times.push(t); } };
    for (const l of p.lots) { push(l.date_debut); push(l.date_fin); }
    for (const s of p.subphases) { push(s.date_debut); push(s.date_fin); }
    if (times.length === 0) return null;
    const min = Math.min(...times);
    const max = Math.max(...times);
    return { min, max: max > min ? max : min + 86400000 };
  }, [p.lots, p.subphases]);

  const barStyle = (debut?: string | null, fin?: string | null): { left: string; width: string } | null => {
    if (!range || !debut || !fin) return null;
    const span = range.max - range.min;
    const l = ((new Date(debut).getTime() - range.min) / span) * 100;
    const w = ((new Date(fin).getTime() - new Date(debut).getTime()) / span) * 100;
    return { left: `${Math.max(0, l)}%`, width: `${Math.max(w, 1.5)}%` };
  };

  const selectedLot = lots.find(l => l.id === selectedLotId) ?? null;

  if (p.loading) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Layers className="h-4 w-4 text-indigo-500" aria-hidden="true" />
        <span>Cliquez un lot pour le découper en sous-phases et chaîner les étapes (même entre métiers).</span>
      </div>

      {!p.startDate && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Le chantier n'a pas encore de date de début : les sous-phases s'afficheront sans dates tant que le planning n'est pas ancré.
        </div>
      )}

      {lots.length === 0 && (
        <p className="text-sm text-gray-400 py-8 text-center">Aucun lot à planifier pour le moment.</p>
      )}

      <div className="space-y-1.5">
        {lots.map(lot => {
          const subs = subsByLot.get(lot.id) ?? [];
          const lb = barStyle(lot.date_debut, lot.date_fin);
          const selected = lot.id === selectedLotId;
          return (
            <div key={lot.id} className={`rounded-xl border ${selected ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-100'} bg-white`}>
              <button
                onClick={() => setSelectedLotId(selected ? null : lot.id)}
                className="w-full flex items-stretch gap-3 px-3 py-2 text-left hover:bg-gray-50/60 rounded-xl"
                aria-label={`Gérer les sous-phases du lot ${lot.nom}`}
              >
                <div className="w-40 sm:w-52 shrink-0 min-w-0 flex items-center gap-1.5">
                  <ChevronRight className={`h-4 w-4 shrink-0 text-gray-300 transition-transform ${selected ? 'rotate-90' : ''}`} aria-hidden="true" />
                  <span className="text-sm font-medium text-gray-800 truncate">{lot.emoji ? `${lot.emoji} ` : ''}{lot.nom}</span>
                  {subs.length > 0 && (
                    <span className="text-[10px] font-medium bg-indigo-50 text-indigo-600 rounded-full px-1.5 py-0.5 shrink-0">{subs.length}</span>
                  )}
                </div>
                <div className="relative flex-1 h-6 self-center bg-gray-50 rounded">
                  {lb && <div className={`absolute top-1 bottom-1 rounded ${lotColor(lot.id)}`} style={lb} />}
                </div>
              </button>

              {subs.length > 0 && (
                <div className="pb-2 space-y-1">
                  {subs.map(s => {
                    const sb = barStyle(s.date_debut, s.date_fin);
                    return (
                      <div key={s.id} className="flex items-stretch gap-3 px-3">
                        <div className="w-40 sm:w-52 shrink-0 min-w-0 pl-6">
                          <span className="text-xs text-gray-500 truncate block">{s.nom}</span>
                        </div>
                        <div className="relative flex-1 h-3.5 self-center">
                          {sb && <div className={`absolute top-0.5 bottom-0.5 rounded ${lotColor(lot.id)} opacity-50`} style={sb} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedLot && (
        <SubphasePanel
          lot={selectedLot}
          lots={p.lots}
          subphases={p.subphases}
          subphaseDeps={p.subphaseDeps}
          saving={p.saving}
          onAdd={p.addSubphase}
          onUpdate={p.updateSubphase}
          onDelete={p.deleteSubphase}
          onAddDep={p.addSubphaseDep}
          onRemoveDep={p.removeSubphaseDep}
          onClose={() => setSelectedLotId(null)}
        />
      )}
    </div>
  );
}
