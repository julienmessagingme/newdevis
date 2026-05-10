/**
 * FundingAllocations — sélecteur de financement avec mode mono ou multi (split).
 *
 * Remplace l'ancien FundingSourceSelect (mono uniquement, Fix #5).
 *
 * Modes :
 *  - SIMPLE (défaut) : un seul select "Financé par" — produit allocations
 *    avec 1 seule entrée (entree_id, amount = totalAmount).
 *  - MULTI (toggle "Répartir") : pour chaque source, un input montant.
 *    Validation : la somme des amounts doit égaler totalAmount.
 *
 * Renvoie via onChange un tableau d'allocations (vide = "à répartir plus tard"
 * → le serveur appliquera l'auto-FIFO Fix #7).
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, SplitSquareHorizontal, X } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { fmtEur } from '@/lib/chantier/financingUtils';

const _sb = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL,
  (import.meta as any).env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
async function freshToken(fallback: string) {
  const { data: { session } } = await _sb.auth.getSession();
  return session?.access_token ?? fallback;
}

interface Entree {
  id:          string;
  source_type: string;
  montant:     number;
  libelle:     string | null;
}

const SRC_TO_LABEL: Record<string, string> = {
  apport_personnel:  '🏦 Apport',
  deblocage_credit:  '🏛️ Crédit',
  aide_maprime:      '🌿 MaPrimeRénov\'',
  aide_cee:          '🌿 CEE',
  eco_ptz:           '🌿 Éco-PTZ',
  remboursement:     '↩️ Remboursement',
  autre:             '📌 Autre',
};

export interface AllocationItem {
  entree_id: string;
  amount:    number;
}

interface Props {
  chantierId:  string;
  token:       string;
  /** Montant total payé (pour validation que la somme des allocations matche). */
  totalAmount: number;
  /** Allocations courantes (vide = "à répartir plus tard"). */
  value:       AllocationItem[];
  onChange:    (allocs: AllocationItem[]) => void;
  className?:  string;
}

export default function FundingAllocations({
  chantierId, token, totalAmount, value, onChange, className,
}: Props) {
  const [entrees, setEntrees] = useState<Entree[]>([]);
  const [loading, setLoading] = useState(true);

  // Mode : 'simple' ou 'multi'. Auto-deviné depuis value au mount.
  const [mode, setMode] = useState<'simple' | 'multi'>(
    value.length > 1 ? 'multi' : 'simple',
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tk = await freshToken(token);
        const res = await fetch(`/api/chantier/${chantierId}/entrees`, {
          headers: { Authorization: `Bearer ${tk}` },
        });
        if (!res.ok || cancelled) return;
        const d = await res.json();
        if (!cancelled) setEntrees(d.entrees ?? []);
      } catch {} finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [chantierId, token]);

  // ── Mode SIMPLE ──────────────────────────────────────────────────────────
  const simpleEntreeId = value.length === 1 ? value[0].entree_id : '';
  function setSimple(id: string) {
    if (!id) onChange([]);
    else onChange([{ entree_id: id, amount: totalAmount }]);
  }

  // ── Mode MULTI ────────────────────────────────────────────────────────────
  const valueMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of value) m[a.entree_id] = a.amount;
    return m;
  }, [value]);

  function setMultiAmount(entreeId: string, amount: number) {
    const next = value.filter(a => a.entree_id !== entreeId);
    if (amount > 0) next.push({ entree_id: entreeId, amount });
    onChange(next);
  }

  const sumAllocated = value.reduce((s, a) => s + a.amount, 0);
  const remaining    = Math.max(0, totalAmount - sumAllocated);
  const overflow     = sumAllocated - totalAmount;

  function switchToMulti() {
    // Si simple sélectionné → on convertit en multi avec 1 seule allocation
    setMode('multi');
  }
  function switchToSimple() {
    // Garde la 1re allocation (si plusieurs, retient la plus grosse)
    if (value.length === 0) {
      setMode('simple');
      return;
    }
    const biggest = [...value].sort((a, b) => b.amount - a.amount)[0];
    onChange([{ entree_id: biggest.entree_id, amount: totalAmount }]);
    setMode('simple');
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-gray-500">Financé par</label>
        <button
          type="button"
          onClick={mode === 'simple' ? switchToMulti : switchToSimple}
          className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800"
        >
          {mode === 'simple' ? (
            <>
              <SplitSquareHorizontal className="h-3 w-3" />
              Répartir entre plusieurs sources
            </>
          ) : (
            <>
              <X className="h-3 w-3" />
              Revenir à une seule source
            </>
          )}
        </button>
      </div>

      {mode === 'simple' ? (
        <div className="relative">
          <select
            value={simpleEntreeId}
            onChange={e => setSimple(e.target.value)}
            disabled={loading}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-white disabled:opacity-50"
          >
            <option value="">— À répartir automatiquement —</option>
            {entrees.length > 0 && (
              <optgroup label="Vos sources de financement">
                {entrees.map(e => (
                  <option key={e.id} value={e.id}>
                    {SRC_TO_LABEL[e.source_type] ?? e.source_type}
                    {e.libelle ? ` · ${e.libelle}` : ''}
                    {' · '}
                    {Math.round(e.montant).toLocaleString('fr-FR')} €
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {loading && (
            <Loader2 className="absolute right-9 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-gray-400" />
          )}
        </div>
      ) : (
        <div className="space-y-2 border border-gray-200 rounded-xl p-2.5 bg-gray-50/50">
          {entrees.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic">
              Aucune source configurée — ajoutez-en dans Trésorerie d'abord.
            </p>
          ) : (
            <>
              {entrees.map(e => (
                <div key={e.id} className="flex items-center gap-2">
                  <span className="text-[11px] flex-1 truncate text-gray-600">
                    {SRC_TO_LABEL[e.source_type] ?? e.source_type}
                    {e.libelle ? ` · ${e.libelle}` : ''}
                  </span>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={valueMap[e.id] ?? ''}
                      onChange={ev => {
                        const v = parseFloat(ev.target.value);
                        setMultiAmount(e.id, isNaN(v) || v <= 0 ? 0 : v);
                      }}
                      className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 pr-6 text-[12px] focus:outline-none focus:border-indigo-400 bg-white"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">€</span>
                  </div>
                </div>
              ))}
              <div className="border-t border-gray-200 pt-2 mt-1 flex items-center justify-between text-[11px]">
                <span className="text-gray-500">Total alloué</span>
                <span className={
                  overflow > 0.01
                    ? 'font-bold text-red-600'
                    : remaining > 0.01
                      ? 'font-bold text-amber-600'
                      : 'font-bold text-emerald-600'
                }>
                  {fmtEur(sumAllocated)} / {fmtEur(totalAmount)}
                  {overflow > 0.01 && ` · dépasse de ${fmtEur(overflow)}`}
                  {remaining > 0.01 && overflow <= 0 && ` · reste ${fmtEur(remaining)}`}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-400 mt-1 italic">
        {value.length === 0
          ? '→ Le système attribuera automatiquement (Apport puis Crédit puis Aides).'
          : null}
      </p>
    </div>
  );
}
