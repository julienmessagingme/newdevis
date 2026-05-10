/**
 * FundingSourceSelect — sélecteur de source de financement réutilisable.
 *
 * Utilisé partout où l'utilisateur enregistre un paiement (DepenseRapideModal,
 * PaiementDrawer, dropdown statut facture) pour choisir quelle "enveloppe"
 * (Apport / Crédit / Aide) finance ce mouvement.
 *
 * Charge les `chantier_entrees` du chantier (via /entrees) et expose un select
 * groupé par catégorie. Valeur "" = "À répartir plus tard" (pas d'attribution).
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

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
  statut:      string;
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

interface Props {
  chantierId:  string;
  token:       string;
  value:       string; // funding_source_id (entree.id) ou '' = non attribué
  onChange:    (v: string) => void;
  className?:  string;
  /** Si true, affiche un label au-dessus du select. Default: true */
  showLabel?:  boolean;
  /** Override du libellé. Default: "Financé par" */
  label?:      string;
}

export default function FundingSourceSelect({
  chantierId, token, value, onChange, className, showLabel = true, label = 'Financé par',
}: Props) {
  const [entrees, setEntrees] = useState<Entree[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className={className}>
      {showLabel && (
        <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={loading}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-white disabled:opacity-50"
        >
          <option value="">— À répartir plus tard —</option>
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
      {!loading && entrees.length === 0 && (
        <p className="text-[10px] text-gray-400 mt-1 italic">
          Aucune source configurée — ajoutez-en dans Trésorerie pour suivre la consommation par enveloppe.
        </p>
      )}
    </div>
  );
}
