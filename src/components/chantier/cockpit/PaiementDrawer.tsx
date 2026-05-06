/**
 * PaiementDrawer — drawer unifié "Enregistrer un paiement"
 *
 * Deux modes :
 *  - Libre (pas de context) : dépense rapide sans artisan pré-rempli
 *    → POST /api/chantier/[id]/quick-expense
 *  - Contextualisé (context fourni) : paiement lié à un artisan / facture
 *    → POST /api/chantier/[id]/payment-events (addToDocument: true)
 *
 * Utilisé dans :
 *  - DashboardHome → ActionCenter (mode libre)
 *  - BudgetTab → bouton "💸 Payer" sur chaque artisan (mode contextualisé)
 */

import { useState, useCallback } from 'react';
import { X, Check, AlertTriangle, Loader2 } from 'lucide-react';
import type { LotChantier } from '@/types/chantier-ia';

export interface PaiementContext {
  artisanNom:        string;
  montantRestant:    number;
  documentId:        string;
  documentType:      'devis' | 'facture';
  label?:            string;
}

interface PaiementDrawerProps {
  chantierId: string;
  token:      string | null | undefined;
  lots:       LotChantier[];
  context?:   PaiementContext;
  onClose:    () => void;
  onSuccess:  () => void;
}

export default function PaiementDrawer({
  chantierId, token, lots, context, onClose, onSuccess,
}: PaiementDrawerProps) {
  const isContextual = !!context;

  const [label,   setLabel]   = useState(context?.label ?? (isContextual ? `Paiement — ${context?.artisanNom}` : ''));
  const [amount,  setAmount]  = useState(context?.montantRestant ? String(context.montantRestant) : '');
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));
  const [lotId,   setLotId]   = useState('');
  const [depType, setDepType] = useState<'achat_materiaux' | 'frais' | 'ticket_caisse'>('achat_materiaux');
  const [note,    setNote]    = useState('');

  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const save = useCallback(async () => {
    const num = parseFloat(amount.replace(',', '.'));
    if (!label.trim() || isNaN(num) || num <= 0) {
      setError('Libellé et montant requis'); return;
    }
    setSaving(true); setError(null);
    const bearer = token ?? '';

    try {
      if (isContextual && context) {
        // Mode contextualisé → payment-events (lié au document artisan)
        const res = await fetch(`/api/chantier/${chantierId}/payment-events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
          body: JSON.stringify({
            addToDocument: true,
            documentId:    context.documentId,
            documentType:  context.documentType,
            label:         label.trim(),
            amount:        num,
            dueDate:       date,
            paid:          true,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? 'Erreur lors de l\'enregistrement');
          setSaving(false); return;
        }
      } else {
        // Mode libre → quick-expense
        const res = await fetch(`/api/chantier/${chantierId}/quick-expense`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
          body: JSON.stringify({
            label:        label.trim(),
            amount:       num,
            depense_type: depType,
            lot_id:       lotId || null,
            note:         note.trim() || null,
            date,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? 'Erreur lors de l\'enregistrement');
          setSaving(false); return;
        }
      }

      onSuccess();
      onClose();
    } catch {
      setError('Erreur réseau. Réessayez.');
    }
    setSaving(false);
  }, [chantierId, token, label, amount, date, lotId, depType, note, isContextual, context]);

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[420px] bg-white shadow-2xl z-50 flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">
              {isContextual ? context!.artisanNom : 'Budget'}
            </p>
            <h3 className="text-[15px] font-bold text-gray-900">💸 Enregistrer un paiement</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {isContextual
                ? `Payer cette facture — ${context!.montantRestant > 0 ? `${context!.montantRestant.toLocaleString('fr-FR')} € restants` : ''}`
                : 'Ajouter un paiement (acompte, facture ou dépense libre)'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 touch-manipulation">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulaire */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 pb-[max(1rem,env(safe-area-inset-bottom))]">

          {/* Libellé */}
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Libellé *</label>
            <input
              autoFocus type="text" value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={isContextual ? `Paiement — ${context?.artisanNom}` : 'ex : Facture plombier, Acompte carrelage…'}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
          </div>

          {/* Montant + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Montant (€) *</label>
              <input
                type="number" inputMode="decimal" value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-indigo-400"
              />
              {isContextual && context!.montantRestant > 0 && (
                <button
                  onClick={() => setAmount(String(context!.montantRestant))}
                  className="mt-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Tout régler ({context!.montantRestant.toLocaleString('fr-FR')} €)
                </button>
              )}
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Date</label>
              <input
                type="date" value={date}
                onChange={e => setDate(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Champs additionnels en mode libre seulement */}
          {!isContextual && (
            <>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Type de dépense</label>
                <select
                  value={depType}
                  onChange={e => setDepType(e.target.value as typeof depType)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                >
                  <option value="achat_materiaux">Achat matériaux</option>
                  <option value="frais">Frais annexes</option>
                  <option value="ticket_caisse">Ticket de caisse</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Lot / poste</label>
                <select
                  value={lotId}
                  onChange={e => setLotId(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                >
                  <option value="">— Aucun lot spécifique —</option>
                  {lots.map(l => (
                    <option key={l.id} value={l.id}>
                      {(l as any).emoji ? `${(l as any).emoji} ` : ''}{l.nom}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Note (optionnel)</label>
                <input
                  type="text" value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="ex : Ticket gardé en poche"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            </>
          )}

          {/* Erreur */}
          {error && (
            <p className="text-[11px] text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {error}
            </p>
          )}

          {/* Boutons */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 touch-manipulation"
            >
              Annuler
            </button>
            <button
              onClick={save}
              disabled={saving || !label.trim() || !amount}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-2 touch-manipulation"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Enregistrer
            </button>
          </div>

          {/* Réassurance */}
          <p className="text-center text-[11px] text-gray-400 pt-1 border-t border-gray-100">
            ✅ Tous les paiements sont automatiquement pris en compte dans votre budget
          </p>
        </div>
      </div>
    </>
  );
}
