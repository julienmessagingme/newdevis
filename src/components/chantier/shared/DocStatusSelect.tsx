import { useState } from 'react';
import { toast } from 'sonner';
import type { DocumentChantier, DevisStatut, FactureStatut } from '@/types/chantier-ia';

// ── Options & styles ────────────────────────────────────────────────────────

const DEVIS_OPTIONS: { value: DevisStatut; label: string }[] = [
  { value: 'en_cours',        label: 'En cours' },
  { value: 'a_relancer',      label: 'À relancer' },
  { value: 'valide',          label: '✓ Validé' },
  { value: 'attente_facture', label: 'Att. facture' },
];

const FACTURE_OPTIONS: { value: FactureStatut; label: string }[] = [
  { value: 'recue',               label: 'Reçue' },
  { value: 'payee',               label: '✓ Payée' },
  { value: 'payee_partiellement', label: '◐ Partiel' },
];

const STYLE: Record<string, string> = {
  en_cours:              'bg-blue-50 border-blue-200 text-blue-700',
  a_relancer:            'bg-orange-50 border-orange-200 text-orange-700',
  valide:                'bg-emerald-50 border-emerald-200 text-emerald-700',
  attente_facture:       'bg-violet-50 border-violet-200 text-violet-700',
  recue:                 'bg-blue-50 border-blue-200 text-blue-700',
  payee:                 'bg-emerald-50 border-emerald-200 text-emerald-700',
  payee_partiellement:   'bg-amber-50 border-amber-200 text-amber-700',
};

// ── Props ───────────────────────────────────────────────────────────────────

interface Props {
  doc: DocumentChantier;
  chantierId: string;
  token: string;
  onUpdated?: (docId: string, statut: string) => void;
  onMontantPayeUpdated?: (docId: string, montantPaye: number) => void;
  /** Compact = no border, rounded-full (for table cells) */
  compact?: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function DocStatusSelect({ doc, chantierId, token, onUpdated, onMontantPayeUpdated, compact = false }: Props) {
  const isFacture = doc.document_type === 'facture';
  const defaultStatut = isFacture ? (doc.facture_statut ?? 'recue') : (doc.devis_statut ?? 'en_cours');

  const [statut, setStatut] = useState(defaultStatut);
  const [editingMontant, setEditingMontant] = useState(false);
  const [montantPaye, setMontantPaye] = useState<number | null>(doc.montant_paye ?? null);

  const options = isFacture ? FACTURE_OPTIONS : DEVIS_OPTIONS;
  const style = STYLE[statut] ?? 'bg-gray-50 border-gray-200 text-gray-700';

  async function handleChange(newStatut: string) {
    const prev = statut;
    setStatut(newStatut);
    const payload = isFacture ? { factureStatut: newStatut } : { devisStatut: newStatut };
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onUpdated?.(doc.id, newStatut);
        if (isFacture && newStatut === 'payee_partiellement') {
          setEditingMontant(true);
        } else {
          setEditingMontant(false);
        }
      } else {
        toast.error('Statut non sauvegardé');
        setStatut(prev);
      }
    } catch {
      toast.error('Erreur réseau');
      setStatut(prev);
    }
  }

  async function handleMontantSave(val: number) {
    setMontantPaye(val);
    setEditingMontant(false);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ montantPaye: val }),
      });
      if (res.ok) {
        onMontantPayeUpdated?.(doc.id, val);
      } else {
        toast.error('Montant non sauvegardé');
      }
    } catch {
      toast.error('Erreur réseau');
    }
  }

  const selectCls = compact
    ? `text-[11px] font-semibold px-2 py-0.5 rounded-full border-0 focus:outline-none focus:ring-1 focus:ring-blue-200 cursor-pointer ${style}`
    : `text-[11px] font-bold px-2.5 py-1.5 rounded-lg border appearance-none cursor-pointer outline-none transition-colors ${style}`;

  return (
    <div className="flex flex-col gap-1">
      <select value={statut} onChange={e => handleChange(e.target.value)} className={selectCls}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {isFacture && statut === 'payee_partiellement' && (
        editingMontant ? (
          <form onSubmit={e => {
            e.preventDefault();
            const v = parseFloat((e.currentTarget.elements.namedItem('mp') as HTMLInputElement).value);
            if (!isNaN(v) && v >= 0) handleMontantSave(v);
          }} className="flex items-center gap-1">
            <input name="mp" type="number" inputMode="decimal" step="0.01" min="0" placeholder="€ payé"
              defaultValue={montantPaye ?? ''}
              autoFocus
              className="w-16 text-[11px] border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-200" />
            <button type="submit" className="text-[10px] text-blue-600 font-semibold">OK</button>
          </form>
        ) : (
          <button onClick={() => setEditingMontant(true)}
            className="text-[10px] text-amber-600 hover:text-amber-800 font-medium text-left">
            {montantPaye != null ? `${montantPaye.toLocaleString('fr-FR')} € payé` : 'Saisir montant payé'}
          </button>
        )
      )}
    </div>
  );
}
