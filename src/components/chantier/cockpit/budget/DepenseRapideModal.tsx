/**
 * DepenseRapideModal — saisie rapide d'une dépense sans upload de fichier.
 * Types : facture artisan · ticket de caisse · achat matériaux
 */
import { useState } from 'react';
import { X, Receipt, ShoppingCart, Wrench, Loader2 } from 'lucide-react';
import type { LotChantier } from '@/types/chantier-ia';
import { fmtFull } from '@/lib/budgetHelpers';

// ── Types ─────────────────────────────────────────────────────────────────────

type DepenseType = 'facture' | 'ticket_caisse' | 'achat_materiaux';
type FactureStatut = 'recue' | 'payee' | 'payee_partiellement' | 'en_litige';

interface Props {
  chantierId: string;
  token: string;
  lots: LotChantier[];
  onClose: () => void;
  onSaved: () => void;
}

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CFG: Record<DepenseType, { label: string; icon: React.ReactNode; desc: string }> = {
  facture: {
    label: 'Facture artisan',
    icon: <Receipt className="h-5 w-5" />,
    desc: "Facture reçue d'un artisan ou prestataire",
  },
  ticket_caisse: {
    label: 'Ticket de caisse',
    icon: <ShoppingCart className="h-5 w-5" />,
    desc: 'Achat en magasin (outillage, petit matériel…)',
  },
  achat_materiaux: {
    label: 'Achat matériaux',
    icon: <Wrench className="h-5 w-5" />,
    desc: 'Commande matériaux (carrelage, bois, peinture…)',
  },
};

const STATUT_CFG: Record<FactureStatut, { label: string; color: string }> = {
  recue:               { label: 'Reçue — à payer',      color: 'border-amber-400 bg-amber-50 text-amber-700' },
  payee:               { label: 'Payée intégralement',  color: 'border-emerald-400 bg-emerald-50 text-emerald-700' },
  payee_partiellement: { label: 'Acompte versé',        color: 'border-blue-400 bg-blue-50 text-blue-700' },
  en_litige:           { label: 'En litige',            color: 'border-red-400 bg-red-50 text-red-700' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function DepenseRapideModal({ chantierId, token, lots, onClose, onSaved }: Props) {
  const [depenseType,   setDepenseType]   = useState<DepenseType>('facture');
  const [nom,           setNom]           = useState('');
  const [montant,       setMontant]       = useState('');
  const [montantPaye,   setMontantPaye]   = useState('');
  const [statut,        setStatut]        = useState<FactureStatut>('recue');
  const [lotId,         setLotId]         = useState<string>('');
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const showAcompte = statut === 'payee_partiellement' || statut === 'en_litige';
  const isValid     = nom.trim() && montant && parseFloat(montant) > 0;

  async function handleSave() {
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);

    try {
      // 1. Créer le document sans fichier via FormData
      const formData = new FormData();
      formData.append('nom', nom.trim());
      formData.append('documentType', 'facture');
      formData.append('source', 'manual_entry');
      if (lotId) formData.append('lotId', lotId);

      // On passe un fichier vide symbolique de 0 octet pour les dépenses rapides
      // (pas de fichier = on utilise l'API dédiée via JSON)
      const body: Record<string, unknown> = {
        nom: nom.trim(),
        documentType: 'facture',
        depenseType,
        montant: parseFloat(montant),
        factureStatut: statut,
        lotId: lotId || null,
      };
      if (showAcompte && montantPaye) {
        body.montantPaye = parseFloat(montantPaye);
      }

      const res = await fetch(`/api/chantier/${chantierId}/documents/depense-rapide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erreur lors de l'enregistrement");
      }

      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Ajouter une dépense</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[80vh] overflow-y-auto">

          {/* Type de dépense */}
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(TYPE_CFG) as [DepenseType, typeof TYPE_CFG[DepenseType]][]).map(([type, cfg]) => (
              <button
                key={type}
                onClick={() => setDepenseType(type)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${
                  depenseType === type
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-100 text-gray-500 hover:border-blue-200'
                }`}
              >
                <span className={depenseType === type ? 'text-blue-600' : 'text-gray-400'}>{cfg.icon}</span>
                <span className="text-[11px] font-semibold leading-tight">{cfg.label}</span>
              </button>
            ))}
          </div>

          {/* Nom */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              {depenseType === 'facture' ? 'Artisan / Fournisseur *' : 'Description *'}
            </label>
            <input
              value={nom}
              onChange={e => setNom(e.target.value)}
              placeholder={
                depenseType === 'facture' ? 'Ex : Plombier Martin, SARL Carrelages…'
                : depenseType === 'ticket_caisse' ? 'Ex : Leroy Merlin — outillage'
                : 'Ex : 50 m² carrelage salle de bain'
              }
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Montant + Lot */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Montant TTC *</label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={montant}
                  onChange={e => setMontant(e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-7 text-sm focus:outline-none focus:border-blue-400"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Lot / Intervenant</label>
              <select
                value={lotId}
                onChange={e => setLotId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-white"
              >
                <option value="">Sans lot</option>
                {lots.map(l => (
                  <option key={l.id} value={l.id}>{l.emoji ? `${l.emoji} ` : ''}{l.nom}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Statut de paiement */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Statut du paiement</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(STATUT_CFG) as [FactureStatut, typeof STATUT_CFG[FactureStatut]][]).map(([s, cfg]) => (
                <button
                  key={s}
                  onClick={() => setStatut(s)}
                  className={`px-3 py-2 rounded-xl border-2 text-xs font-semibold transition-all text-left ${
                    statut === s ? cfg.color + ' border-current' : 'border-gray-100 text-gray-500 hover:border-gray-200'
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Montant acompte / montant en litige */}
          {showAcompte && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                {statut === 'en_litige' ? 'Montant contesté' : 'Montant déjà versé (acompte)'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={montantPaye}
                  onChange={e => setMontantPaye(e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-7 text-sm focus:outline-none focus:border-blue-400"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
              </div>
              {montant && montantPaye && parseFloat(montantPaye) > 0 && statut === 'payee_partiellement' && (
                <p className="text-xs text-gray-400 mt-1">
                  Reste à payer : <span className="font-semibold text-amber-600">
                    {fmtFull(Math.max(0, parseFloat(montant) - parseFloat(montantPaye)))}
                  </span>
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
