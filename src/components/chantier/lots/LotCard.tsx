import { FileText, Receipt, Image } from 'lucide-react';

// ── Statut dérivé ─────────────────────────────────────────────────────────────

type StatutLot = 'a_lancer' | 'devis_recus';

function getStatut(devisCount: number): StatutLot {
  return devisCount > 0 ? 'devis_recus' : 'a_lancer';
}

const STATUT_CONFIG: Record<StatutLot, { label: string; badgeClass: string }> = {
  a_lancer:    {
    label:      'À lancer',
    badgeClass: 'bg-slate-500/10 border-slate-500/20 text-slate-400',
  },
  devis_recus: {
    label:      'Devis reçus',
    badgeClass: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
  },
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface LotCardProps {
  /** Nom du lot — issu de LigneBudgetIA.label */
  label: string;
  /** Budget estimé TTC en € — issu de LigneBudgetIA.montant */
  montant: number;
  /** Couleur d'accent hex — issu de LigneBudgetIA.couleur */
  couleur: string;
  /** Nombre de devis associés */
  nbDevis: number;
  /** Nombre de factures associées */
  nbFactures: number;
  /** Nombre de photos associées */
  nbPhotos: number;
  /** Callback déclenché par le bouton "Voir le lot" */
  onVoir?: () => void;
}

// ── Sous-composant compteur ───────────────────────────────────────────────────

function Counter({
  icon: Icon,
  count,
  singular,
  plural,
}: {
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  singular: string;
  plural: string;
}) {
  return (
    <div className="flex items-center gap-1 text-xs text-slate-500">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>
        {count === 0
          ? `Aucun ${singular}`
          : `${count}\u00a0${count > 1 ? plural : singular}`}
      </span>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function LotCard({
  label,
  montant,
  couleur,
  nbDevis,
  nbFactures,
  nbPhotos,
  onVoir,
}: LotCardProps) {
  const statut = getStatut(nbDevis);
  const cfg = STATUT_CONFIG[statut];

  return (
    <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-3 hover:border-white/[0.11] transition-colors">

      {/* En-tête : bande couleur + nom + budget */}
      <div className="flex items-start gap-3">
        <span
          className="w-1.5 rounded-full shrink-0 self-stretch min-h-[2.5rem]"
          style={{ backgroundColor: couleur }}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium leading-snug line-clamp-2">{label}</p>
          <p className="text-2xl font-bold text-white mt-1.5 leading-none tracking-tight">
            {montant.toLocaleString('fr-FR')}&thinsp;€
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">budget estimé</p>
        </div>
      </div>

      {/* Compteurs documents */}
      <div className="flex items-center gap-3 flex-wrap">
        <Counter icon={FileText} count={nbDevis}    singular="devis"   plural="devis"    />
        <Counter icon={Receipt}  count={nbFactures} singular="facture" plural="factures" />
        <Counter icon={Image}    count={nbPhotos}   singular="photo"   plural="photos"   />
      </div>

      {/* Badge statut + bouton détail */}
      <div className="pt-2 border-t border-white/[0.05] flex items-center justify-between gap-2">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.badgeClass}`}>
          {cfg.label}
        </span>
        {onVoir && (
          <button
            onClick={onVoir}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors shrink-0"
          >
            Voir le lot →
          </button>
        )}
      </div>
    </div>
  );
}
