/**
 * FacturesPaiements — suivi des dépenses réelles du chantier.
 * 4 colonnes : Payé · À payer · Acompte versé · En litige
 * Liste détaillée avec badge statut + montant + possibilité de changer le statut inline.
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Receipt, Plus, ShoppingCart, Wrench, ChevronDown, Check, AlertTriangle, Clock, Scale } from 'lucide-react';
import { fmtFull } from '@/lib/budgetHelpers';
import type { DocumentChantier, FactureStatut } from '@/types/chantier-ia';

// ── Config statuts ────────────────────────────────────────────────────────────

const STATUT_CFG: Record<FactureStatut, {
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  pill: string;
}> = {
  payee: {
    label: 'Payée',
    shortLabel: 'Payée',
    icon: <Check className="h-3 w-3" />,
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
  recue: {
    label: 'À payer',
    shortLabel: 'À payer',
    icon: <Clock className="h-3 w-3" />,
    pill: 'bg-amber-50 text-amber-700 border-amber-100',
  },
  payee_partiellement: {
    label: 'Acompte versé',
    shortLabel: 'Acompte',
    icon: <ChevronDown className="h-3 w-3" />,
    pill: 'bg-blue-50 text-blue-700 border-blue-100',
  },
  en_litige: {
    label: 'En litige',
    shortLabel: 'Litige',
    icon: <Scale className="h-3 w-3" />,
    pill: 'bg-red-50 text-red-700 border-red-100',
  },
};

const DEPENSE_ICON: Record<string, React.ReactNode> = {
  facture:          <Receipt className="h-4 w-4" />,
  ticket_caisse:    <ShoppingCart className="h-4 w-4" />,
  achat_materiaux:  <Wrench className="h-4 w-4" />,
};

const DEPENSE_COLOR: Record<string, string> = {
  facture:          'bg-gray-50 text-gray-500',
  ticket_caisse:    'bg-purple-50 text-purple-500',
  achat_materiaux:  'bg-orange-50 text-orange-500',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function montantPaye(doc: DocumentChantier): number {
  if (doc.facture_statut === 'payee')               return doc.montant ?? 0;
  if (doc.facture_statut === 'payee_partiellement') return doc.montant_paye ?? 0;
  return 0;
}

function montantAPayer(doc: DocumentChantier): number {
  const total = doc.montant ?? 0;
  if (doc.facture_statut === 'recue')               return total;
  if (doc.facture_statut === 'payee_partiellement') return Math.max(0, total - (doc.montant_paye ?? 0));
  return 0;
}

// ── Composant ─────────────────────────────────────────────────────────────────

interface Props {
  documents: DocumentChantier[];
  chantierId: string;
  token: string;
  onAddDepense: () => void;
  onStatusChange?: (docId: string, statut: FactureStatut) => void;
}

export default function FacturesPaiements({ documents, chantierId, onAddDepense, onStatusChange }: Props) {
  const [changingId, setChangingId] = useState<string | null>(null);
  const [openMenu,   setOpenMenu]   = useState<string | null>(null);
  const [errorId,    setErrorId]    = useState<string | null>(null);

  const factures = documents.filter(d => d.document_type === 'facture');

  // ── Totaux réels ─────────────────────────────────────────────────────────
  const totalPaye    = factures.filter(d => d.facture_statut === 'payee').reduce((s, d) => s + (d.montant ?? 0), 0);
  const totalAPayer  = factures.filter(d => d.facture_statut === 'recue' || d.facture_statut === 'payee_partiellement')
                               .reduce((s, d) => s + montantAPayer(d), 0);
  const totalAcompte = factures.filter(d => d.facture_statut === 'payee_partiellement')
                               .reduce((s, d) => s + (d.montant_paye ?? 0), 0);
  const totalLitige  = factures.filter(d => d.facture_statut === 'en_litige').reduce((s, d) => s + (d.montant ?? 0), 0);

  async function changeStatut(docId: string, statut: FactureStatut) {
    setChangingId(docId);
    setOpenMenu(null);
    setErrorId(null);

    // Force le chargement de la session avant l'appel DB (session init async)
    await supabase.auth.getSession();

    const { data, error } = await supabase
      .from('documents_chantier')
      .update({ facture_statut: statut })
      .eq('id', docId)
      .select('id');  // indispensable pour détecter 0 lignes (RLS silencieux)

    if (error || !data || data.length === 0) {
      console.error('[FacturesPaiements] changeStatut échec:', error?.message ?? '0 lignes — session ?');
      setErrorId(docId);
      setChangingId(null);
      return;
    }

    onStatusChange?.(docId, statut);
    setChangingId(null);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Dépenses & paiements</h3>
          {factures.length > 0 && (
            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider ml-1">
              {factures.length}
            </span>
          )}
        </div>
        <button
          onClick={onAddDepense}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter
        </button>
      </div>

      {/* 4 KPI colonnes */}
      <div className="grid grid-cols-4 divide-x divide-gray-50 border-b border-gray-50">
        <KpiCol
          label="Payé"
          value={totalPaye}
          color="text-emerald-700"
          bg="bg-emerald-50"
          icon={<Check className="h-3.5 w-3.5 text-emerald-500" />}
          empty={totalPaye === 0}
        />
        <KpiCol
          label="À payer"
          value={totalAPayer}
          color="text-amber-700"
          bg="bg-amber-50"
          icon={<Clock className="h-3.5 w-3.5 text-amber-500" />}
          empty={totalAPayer === 0}
        />
        <KpiCol
          label="Acompte versé"
          value={totalAcompte}
          color="text-blue-700"
          bg="bg-blue-50"
          icon={<ChevronDown className="h-3.5 w-3.5 text-blue-500" />}
          empty={totalAcompte === 0}
        />
        <KpiCol
          label="En litige"
          value={totalLitige}
          color="text-red-700"
          bg="bg-red-50"
          icon={<AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
          empty={totalLitige === 0}
          alert={totalLitige > 0}
        />
      </div>

      {/* Liste dépenses */}
      {factures.length === 0 ? (
        <div className="text-center py-10 px-5">
          <Receipt className="h-8 w-8 text-gray-100 mx-auto mb-3" />
          <p className="text-sm text-gray-400 mb-1">Aucune dépense enregistrée</p>
          <p className="text-xs text-gray-300 mb-4">Ajoutez factures, tickets et achats matériaux</p>
          <button
            onClick={onAddDepense}
            className="text-sm font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-xl transition-colors"
          >
            + Ajouter une dépense
          </button>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {factures.map(doc => {
            const statut   = (doc.facture_statut ?? 'recue') as FactureStatut;
            const cfg      = STATUT_CFG[statut];
            const dtype    = (doc as any).depense_type ?? 'facture';
            const dIcon    = DEPENSE_ICON[dtype] ?? DEPENSE_ICON.facture;
            const dColor   = DEPENSE_COLOR[dtype] ?? DEPENSE_COLOR.facture;
            const paye     = montantPaye(doc);
            const aPayer   = montantAPayer(doc);
            const isChanging = changingId === doc.id;
            const hasError   = errorId === doc.id;

            return (
              <div key={doc.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors group relative">

                {/* Icône type dépense */}
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${dColor}`}>
                  {dIcon}
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.nom}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-gray-400">
                      {new Date(doc.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </p>
                    {paye > 0 && statut === 'payee_partiellement' && (
                      <p className="text-xs text-blue-500">
                        {fmtFull(paye)} versé · {fmtFull(aPayer)} restant
                      </p>
                    )}
                  </div>
                </div>

                {/* Montant */}
                {doc.montant != null && (
                  <span className="text-sm font-bold text-gray-900 shrink-0 tabular-nums">
                    {fmtFull(doc.montant)}
                  </span>
                )}

                {/* Badge statut cliquable */}
                <div className="relative shrink-0">
                  {hasError && (
                    <p className="absolute -top-5 right-0 text-[10px] font-semibold text-red-500 whitespace-nowrap">
                      Erreur, réessayez
                    </p>
                  )}
                  <button
                    onClick={() => setOpenMenu(openMenu === doc.id ? null : doc.id)}
                    disabled={isChanging}
                    className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border transition-all ${hasError ? 'border-red-300 bg-red-50 text-red-600' : cfg.pill}`}
                  >
                    {isChanging ? <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> : cfg.icon}
                    {cfg.shortLabel}
                    <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
                  </button>

                  {/* Dropdown changement statut */}
                  {openMenu === doc.id && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden">
                      {(Object.entries(STATUT_CFG) as [FactureStatut, typeof STATUT_CFG[FactureStatut]][]).map(([s, c]) => (
                        <button
                          key={s}
                          onClick={() => changeStatut(doc.id, s)}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium hover:bg-gray-50 transition-colors text-left ${
                            s === statut ? 'text-blue-600 bg-blue-50/50' : 'text-gray-700'
                          }`}
                        >
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center ${c.pill.replace('bg-', 'bg-').split(' ')[0]}`}>
                            {c.icon}
                          </span>
                          {c.label}
                          {s === statut && <Check className="h-3 w-3 ml-auto text-blue-500" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Overlay fermeture dropdown */}
      {openMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
      )}
    </div>
  );
}

// ── KpiCol ────────────────────────────────────────────────────────────────────

function KpiCol({ label, value, color, bg, icon, empty, alert }: {
  label: string; value: number; color: string; bg: string;
  icon: React.ReactNode; empty: boolean; alert?: boolean;
}) {
  return (
    <div className={`px-4 py-3.5 flex flex-col gap-1 ${alert ? bg : ''}`}>
      <div className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
        {icon}{label}
      </div>
      <p className={`text-base font-extrabold tabular-nums leading-none ${empty ? 'text-gray-200' : color}`}>
        {empty ? '—' : fmtFull(value)}
      </p>
    </div>
  );
}
