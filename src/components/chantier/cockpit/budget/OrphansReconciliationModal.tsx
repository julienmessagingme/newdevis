/**
 * OrphansReconciliationModal — résout les cashflow_extras orphelins.
 *
 * Pour chaque mouvement non rattaché (cashflow_extras créé via Échéancier
 * avant le fix 2026-05-09), l'utilisateur choisit :
 *   - Rattacher à un lot → crée un documents_chantier.facture (depense_type
 *     = achat_materiaux) avec le bon lot, supprime l'orphan.
 *   - Supprimer définitivement → DELETE direct de l'orphan.
 *
 * Une fois le modal vidé, les chiffres Budget redeviennent cohérents.
 */

import { useState } from 'react';
import { X, Link2, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { fmtEur } from '@/lib/financingUtils';
import { createClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import type { LotChantier } from '@/types/chantier-ia';

const _sb = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL,
  (import.meta as any).env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
async function freshToken(fallback: string) {
  const { data: { session } } = await _sb.auth.getSession();
  return session?.access_token ?? fallback;
}

interface CashflowOrphan {
  id:               string;
  label:            string;
  amount:           number;
  due_date:         string;
  status:           'pending' | 'paid' | 'late' | 'cancelled';
  financing_source: string | null;
  notes:            string | null;
  created_at:       string;
}

interface Props {
  chantierId: string;
  token:      string;
  lots:       LotChantier[];
  orphans:    CashflowOrphan[];
  onClose:    () => void;
  onChange:   () => void; // appelé après chaque modif pour rafraîchir Budget
}

export default function OrphansReconciliationModal({
  chantierId, token, lots, orphans, onClose, onChange,
}: Props) {
  // Sélection de lot par orphan id
  const [lotByOrphan, setLotByOrphan] = useState<Record<string, string>>({});
  const [busyId,      setBusyId]      = useState<string | null>(null);

  async function rattacher(orphan: CashflowOrphan) {
    const lotId = lotByOrphan[orphan.id];
    if (!lotId) {
      toast.error('Choisissez un lot avant de rattacher.');
      return;
    }
    setBusyId(orphan.id);
    try {
      const tk = await freshToken(token);
      // 1. Créer le document_chantier équivalent
      const facStatut = orphan.status === 'paid' ? 'payee' : 'recue';
      const r1 = await fetch(`/api/chantier/${chantierId}/documents/depense-rapide`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: JSON.stringify({
          nom:            orphan.label,
          documentType:   'facture',
          depenseType:    'achat_materiaux',
          montant:        orphan.amount,
          factureStatut:  facStatut,
          lotId:          lotId,
        }),
      });
      if (!r1.ok) {
        const err = await r1.json().catch(() => ({}));
        toast.error(err.error ?? 'Erreur lors de la création du document');
        setBusyId(null);
        return;
      }
      // 2. Supprimer l'orphan
      const r2 = await fetch(`/api/chantier/${chantierId}/payment-events`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body:    JSON.stringify({ id: orphan.id }),
      });
      if (!r2.ok) {
        toast.error('Document créé, mais impossible de supprimer l\'ancien orphan. À supprimer manuellement.');
      } else {
        toast.success(`"${orphan.label}" rattaché au lot.`);
      }
      onChange();
    } catch {
      toast.error('Erreur réseau pendant le rattachement.');
    } finally {
      setBusyId(null);
    }
  }

  async function supprimer(orphan: CashflowOrphan) {
    if (!window.confirm(`Supprimer définitivement "${orphan.label}" (${fmtEur(orphan.amount)}) ?`)) return;
    setBusyId(orphan.id);
    try {
      const tk = await freshToken(token);
      const r = await fetch(`/api/chantier/${chantierId}/payment-events`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body:    JSON.stringify({ id: orphan.id }),
      });
      if (!r.ok) {
        toast.error('Erreur lors de la suppression.');
      } else {
        toast.success('Mouvement supprimé.');
      }
      onChange();
    } catch {
      toast.error('Erreur réseau.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-rose-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="h-4 w-4 text-rose-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-[14px]">
                Réconcilier les mouvements non rattachés
              </h2>
              <p className="text-[11px] text-gray-500">
                {orphans.length} mouvement{orphans.length > 1 ? 's' : ''} ·{' '}
                {fmtEur(orphans.reduce((s, o) => s + o.amount, 0))}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Empty state */}
        {orphans.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[13px] text-gray-500">Plus aucun mouvement à réconcilier.</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 text-[12px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
            >
              Fermer
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Pour chaque mouvement : <strong>choisissez un lot</strong> et cliquez
                <strong> Rattacher</strong> pour le faire apparaître dans le Budget,
                ou <strong>Supprimer</strong> pour l'effacer définitivement.
              </p>
            </div>

            <div className="divide-y divide-gray-100">
              {orphans.map(o => (
                <div key={o.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-gray-800 truncate">
                        {o.label}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {fmtEur(o.amount)} ·{' '}
                        <span className={o.status === 'paid' ? 'text-emerald-600 font-medium' : 'text-amber-600'}>
                          {o.status === 'paid' ? '✓ Payé' : '⏳ En attente'}
                        </span>
                        {' · '}
                        {new Date(o.due_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={lotByOrphan[o.id] ?? ''}
                      onChange={e => setLotByOrphan(prev => ({ ...prev, [o.id]: e.target.value }))}
                      className="flex-1 text-[12px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-rose-200"
                      disabled={busyId === o.id}
                    >
                      <option value="">— Choisir un lot —</option>
                      {lots.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.emoji ? `${l.emoji} ` : ''}{l.nom}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => rattacher(o)}
                      disabled={busyId === o.id || !lotByOrphan[o.id]}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shrink-0"
                    >
                      {busyId === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                      Rattacher
                    </button>
                    <button
                      onClick={() => supprimer(o)}
                      disabled={busyId === o.id}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-rose-700 border border-rose-200 hover:bg-rose-50 disabled:opacity-50 rounded-lg transition-colors shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[12px] font-semibold text-gray-600 hover:text-gray-800"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
