import { useState } from 'react';
import { FileText, Receipt, Image, ChevronDown, PlusCircle, Layers } from 'lucide-react';

type StatutLot = 'a_lancer' | 'devis_recus';
function getStatut(devisCount: number): StatutLot { return devisCount > 0 ? 'devis_recus' : 'a_lancer'; }
const STATUT_CONFIG: Record<StatutLot, { label: string; badgeClass: string }> = {
  a_lancer:    { label: 'À lancer',    badgeClass: 'bg-slate-500/10 border-slate-500/20 text-slate-400' },
  devis_recus: { label: 'Devis reçus', badgeClass: 'bg-blue-500/10 border-blue-500/20 text-blue-300'   },
};

export interface LotCardProps {
  label: string; montant: number; couleur: string;
  nbDevis: number; nbFactures: number; nbPhotos: number;
  budgetRef?: { min: number; avg: number; max: number; unite?: string | null } | null;
  decomposition?: { quantite?: number | null; unite?: string | null; materiaux_ht?: number | null; main_oeuvre_ht?: number | null; divers_ht?: number | null; } | null;
  onVoir?: () => void;
  onAjouterDevis?: () => void;
}

function Counter({ icon: Icon, count, singular, plural }: { icon: React.ComponentType<{ className?: string }>; count: number; singular: string; plural: string; }) {
  return (
    <div className="flex items-center gap-1 text-xs text-slate-500">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{count === 0 ? `Aucun ${singular}` : `${count}\u00a0${count > 1 ? plural : singular}`}</span>
    </div>
  );
}

export default function LotCard({ label, montant, couleur, nbDevis, nbFactures, nbPhotos, budgetRef, decomposition, onVoir, onAjouterDevis }: LotCardProps) {
  const [expanded, setExpanded] = useState(false);
  const statut = getStatut(nbDevis);
  const cfg = STATUT_CONFIG[statut];
  const hasDecomp = !!decomposition && ((decomposition.materiaux_ht ?? 0) + (decomposition.main_oeuvre_ht ?? 0) + (decomposition.divers_ht ?? 0) > 0);
  const mainBudget = budgetRef?.avg ?? montant;
  const subText = budgetRef ? `Fourchette : ${budgetRef.min.toLocaleString('fr-FR')} – ${budgetRef.max.toLocaleString('fr-FR')} €` : 'budget estimé';

  return (
    <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl flex flex-col hover:border-white/[0.11] transition-colors overflow-hidden">
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="w-1.5 rounded-full shrink-0 self-stretch min-h-[2.5rem]" style={{ backgroundColor: couleur }} aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium leading-snug line-clamp-2">{label}</p>
            <p className="text-2xl font-bold text-white mt-1.5 leading-none tracking-tight">{mainBudget.toLocaleString('fr-FR')}&thinsp;€</p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{subText}</p>
          </div>
        </div>
        {decomposition?.quantite && decomposition?.unite && (
          <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl px-3 py-2">
            <p className="text-slate-500 text-[10px] uppercase tracking-wider font-medium mb-0.5">Base de calcul</p>
            <p className="text-slate-300 text-xs leading-snug">
              Surface estimée : <span className="text-white font-semibold">{decomposition.quantite} {decomposition.unite}</span>
              {budgetRef?.avg && decomposition.quantite > 0 && (
                <> · Prix moyen : <span className="text-white font-semibold">{Math.round(budgetRef.avg / decomposition.quantite).toLocaleString('fr-FR')} €/{decomposition.unite}</span></>
              )}
            </p>
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <Counter icon={FileText} count={nbDevis}    singular="devis"   plural="devis"    />
          <Counter icon={Receipt}  count={nbFactures} singular="facture" plural="factures" />
          <Counter icon={Image}    count={nbPhotos}   singular="photo"   plural="photos"   />
        </div>
        <div className="pt-1 border-t border-white/[0.05] flex items-center justify-between gap-2">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.badgeClass}`}>{cfg.label}</span>
          <div className="flex items-center gap-2.5">
            {hasDecomp && (
              <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">
                <Layers className="h-3 w-3" /><span className="text-[10px]">Décomposition</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
              </button>
            )}
            {onVoir && <button onClick={onVoir} className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors shrink-0">Voir →</button>}
          </div>
        </div>
      </div>
      {hasDecomp && expanded && (
        <div className="border-t border-white/[0.05] px-4 pb-3 pt-3 space-y-2 bg-white/[0.015]">
          <p className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold mb-2">Décomposition du budget</p>
          {(decomposition!.materiaux_ht ?? 0) > 0 && <div className="flex items-center justify-between text-xs"><span className="text-slate-400">Matériaux</span><span className="text-white font-medium">{decomposition!.materiaux_ht!.toLocaleString('fr-FR')} €</span></div>}
          {(decomposition!.main_oeuvre_ht ?? 0) > 0 && <div className="flex items-center justify-between text-xs"><span className="text-slate-400">Main d'œuvre</span><span className="text-white font-medium">{decomposition!.main_oeuvre_ht!.toLocaleString('fr-FR')} €</span></div>}
          {(decomposition!.divers_ht ?? 0) > 0 && <div className="flex items-center justify-between text-xs"><span className="text-slate-400">Divers / imprévus</span><span className="text-white font-medium">{decomposition!.divers_ht!.toLocaleString('fr-FR')} €</span></div>}
        </div>
      )}
      <div className="border-t border-white/[0.04] px-4 pb-4 pt-3 grid grid-cols-2 gap-2">
        <button onClick={onAjouterDevis} className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-blue-300 bg-white/[0.03] hover:bg-blue-500/[0.08] border border-white/[0.06] hover:border-blue-500/20 rounded-xl py-2 transition-all">
          <PlusCircle className="h-3.5 w-3.5" />Ajouter devis
        </button>
        <button onClick={onVoir} className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] rounded-xl py-2 transition-all">
          <Layers className="h-3.5 w-3.5" />Voir le lot
        </button>
      </div>
    </div>
  );
}
