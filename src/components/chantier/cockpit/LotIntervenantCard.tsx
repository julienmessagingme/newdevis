import {
  Plus, ChevronRight, FileText, Trash2, Receipt, Scale, Calendar,
} from 'lucide-react';
import type { LotChantier, DocumentChantier } from '@/types/chantier-ia';
import { formatDuration } from '@/lib/planningUtils';
import { fmtK, IS } from '@/lib/dashboardHelpers';
import type { InsightItem } from './useInsights';

// ── Statut artisan ─────────────────────────────────────────────────────────────

export const STATUT_STYLE: Record<string, { label: string; pill: string }> = {
  a_trouver:  { label: 'À trouver',  pill: 'text-gray-500 bg-gray-100'       },
  a_contacter:{ label: 'À contacter',pill: 'text-blue-700 bg-blue-100'       },
  ok:         { label: 'Validé ✓',   pill: 'text-emerald-700 bg-emerald-100' },
};

// ── Statut sémantique intervenant ──────────────────────────────────────────────

type LotStatusLevel = 'blocked' | 'insufficient' | 'ok';

export function getLotStatusLevel(lot: LotChantier, docs: DocumentChantier[]): {
  level: LotStatusLevel;
  label: string;
  msg: string;
  dotColor: string;
  textColor: string;
  bgColor: string;
} {
  const statut      = lot.statut ?? 'a_trouver';
  const devisCnt    = docs.filter(d => d.document_type === 'devis').length;
  const hasValidated = docs.some(d =>
    d.document_type === 'devis' &&
    (d.devis_statut === 'valide' || ['ok', 'termine', 'contrat_signe'].includes(statut)),
  );

  if (['ok', 'termine', 'en_cours'].includes(statut)) {
    const msg = statut === 'en_cours' ? 'Travaux en cours' : 'Intervenant validé ✓';
    return { level: 'ok', label: 'OK', msg, dotColor: 'bg-emerald-400', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50' };
  }
  if (statut === 'contrat_signe') {
    return { level: 'ok', label: 'Signé', msg: 'Contrat signé — en attente de démarrage', dotColor: 'bg-emerald-400', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50' };
  }
  if (hasValidated) {
    return { level: 'ok', label: 'Sélection en cours', msg: 'Devis retenu — vérifiez les détails avant signature', dotColor: 'bg-emerald-400', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50' };
  }
  if (devisCnt >= 3) {
    return { level: 'ok', label: 'Comparaison optimale', msg: 'Nous vous aidons à choisir le meilleur', dotColor: 'bg-violet-400', textColor: 'text-violet-700', bgColor: 'bg-violet-50' };
  }
  if (devisCnt >= 2) {
    return { level: 'ok', label: 'Comparaison recommandée', msg: 'Nous vous aidons à choisir le meilleur', dotColor: 'bg-blue-400', textColor: 'text-blue-700', bgColor: 'bg-blue-50' };
  }
  if (devisCnt === 1) {
    return { level: 'insufficient', label: '1 devis reçu', msg: 'Obtenez 1 devis supplémentaire pour comparer', dotColor: 'bg-amber-400', textColor: 'text-amber-700', bgColor: 'bg-amber-50' };
  }
  if (statut === 'a_contacter') {
    return { level: 'insufficient', label: 'En attente', msg: 'Devis demandé, pas encore reçu', dotColor: 'bg-amber-400', textColor: 'text-amber-700', bgColor: 'bg-amber-50' };
  }
  return { level: 'blocked', label: 'Bloqué', msg: 'Aucun devis reçu — ajoutez un document', dotColor: 'bg-red-400', textColor: 'text-red-700', bgColor: 'bg-red-50' };
}

// ── Lot Intervenant Card (home) ────────────────────────────────────────────────

function LotIntervenantCard({ lot, docs, onAddDevis, onAddDocument, onDetail, onDelete, onCompare }: {
  lot: LotChantier;
  docs: DocumentChantier[];
  onAddDevis: () => void;
  onAddDocument: () => void;
  onDetail: () => void;
  onDelete: () => void;
  onCompare: (lot: LotChantier, docs: DocumentChantier[]) => void;
}) {
  const devisCnt  = docs.filter(d => d.document_type === 'devis').length;
  const photoCnt  = docs.filter(d => d.document_type === 'photo').length;
  const devisDocs = docs.filter(d => d.document_type === 'devis' || d.document_type === 'facture');
  const hasRef    = (lot.budget_min_ht ?? 0) > 0 || (lot.budget_max_ht ?? 0) > 0;
  const status    = getLotStatusLevel(lot, docs);
  const statut    = lot.statut ?? 'a_trouver';

  // Jauge — labels contextuels selon l'étape réelle
  const progress =
    statut === 'termine' || statut === 'ok' ? 100 :
    statut === 'en_cours'                   ? 85  :
    statut === 'contrat_signe'              ? 65  :
    devisCnt >= 2                           ? 50  :
    devisCnt === 1                          ? 35  :
    statut === 'a_contacter'                ? 15  : 5;

  const gaugeColor =
    progress >= 65  ? 'bg-emerald-400' :
    progress >= 35  ? 'bg-amber-400'   :
                      'bg-red-400';

  const gaugeLabel =
    statut === 'termine' || statut === 'ok'
      ? { text: '✅ Terminé',                cls: 'text-emerald-600' } :
    statut === 'en_cours'
      ? { text: '🔨 Travaux en cours',       cls: 'text-emerald-600' } :
    statut === 'contrat_signe'
      ? { text: '✓ Artisan sélectionné',     cls: 'text-emerald-600' } :
    devisCnt >= 2
      ? { text: '🔍 Nous vous aidons à choisir', cls: 'text-blue-600' } :
    devisCnt === 1
      ? { text: '📋 Obtenez un 2e devis pour comparer', cls: 'text-amber-600' } :
    statut === 'a_contacter'
      ? { text: '📞 Contacter des artisans', cls: 'text-red-600'     } :
      { text: '📋 Demander des devis',        cls: 'text-red-600'     };

  return (
    <div className="relative group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col">

      {/* Delete button removed from hover — now in action bar with window.confirm */}

      {/* ── Zone cliquable principale ──────────────────── */}
      <button onClick={onDetail} className="p-5 pb-3 flex items-start gap-3 text-left hover:bg-gray-50/60 transition-colors group">
        <span className="text-2xl leading-none pt-0.5 shrink-0">{lot.emoji ?? '🔧'}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 leading-tight truncate text-base">{lot.nom}</p>
          {/* Statut clair */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className={`w-2 h-2 rounded-full shrink-0 ${status.dotColor}`} />
            <span className={`text-[11px] font-bold ${status.textColor}`}>{status.label}</span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 mt-1 group-hover:text-blue-400 transition-colors" />
      </button>

      {/* ── Message explicatif ─────────────────────────── */}
      <div className={`mx-5 mb-3 px-3 py-2 rounded-xl border ${status.bgColor} border-transparent`}>
        <p className={`text-xs leading-snug ${status.textColor} font-medium`}>{status.msg}</p>
      </div>

      {/* ── Budget fourchette ───────────────────────────── */}
      {hasRef ? (
        <div className="px-5 pb-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Budget observé</p>
          <p className="text-lg font-extrabold text-gray-900 tabular-nums">
            {fmtK(lot.budget_min_ht ?? 0)} – {fmtK(lot.budget_max_ht ?? 0)}
          </p>
        </div>
      ) : (
        <div className="px-5 pb-3">
          <p className="text-xs text-gray-300 italic">Budget à estimer</p>
        </div>
      )}

      {/* ── Planning (dates + durée) ──────────────────────── */}
      {lot.duree_jours != null && lot.duree_jours > 0 && lot.date_debut && lot.date_fin && (
        <div className="px-5 pb-2 flex items-center gap-1.5 text-xs text-gray-500">
          <Calendar className="h-3 w-3 text-gray-400" />
          <span className="font-medium">
            {new Date(lot.date_debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} → {new Date(lot.date_fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
          <span className="text-gray-300">·</span>
          <span>{formatDuration(lot.duree_jours)}</span>
        </div>
      )}

      {/* ── Compteur devis + photos ──────────────────────── */}
      <div className="px-5 pb-3 flex items-center gap-2 flex-wrap min-h-[24px]">
        {devisCnt > 0 ? (
          <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full">
            <FileText className="h-3 w-3" /> {devisCnt} devis reçu{devisCnt > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="text-xs text-gray-400 italic">Aucun devis reçu</span>
        )}
        {photoCnt > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 px-2.5 py-1 rounded-full">
            📷 {photoCnt} photo{photoCnt > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Jauge + interprétation ──────────────────────── */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Avancement</span>
          <span className={`text-[10px] font-bold ${gaugeLabel.cls}`}>{gaugeLabel.text}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${gaugeColor}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* ── Actions ─────────────────────────────────────── */}
      <div className={`border-t border-gray-50 grid divide-x divide-gray-50 mt-auto ${devisCnt >= 2 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <button onClick={onDetail}
          className="flex flex-col items-center gap-1 py-3.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
          <ChevronRight className="h-3.5 w-3.5" />
          Voir détails
        </button>
        {devisCnt >= 2 && (
          <button onClick={() => onCompare(lot, devisDocs)}
            className="flex flex-col items-center gap-1 py-3.5 text-[11px] font-semibold text-amber-600 hover:bg-amber-50 transition-colors">
            <Scale className="h-3.5 w-3.5" />
            Comparer
          </button>
        )}
        <button onClick={onAddDocument}
          className="flex flex-col items-center gap-1 py-3.5 text-[11px] font-semibold text-violet-600 hover:bg-violet-50 transition-colors">
          <Receipt className="h-3.5 w-3.5" />
          Ajouter un document
        </button>
        <button onClick={() => { if (window.confirm(`Supprimer le lot "${lot.nom}" ?`)) onDelete(); }}
          className="flex flex-col items-center gap-1 py-3.5 text-[11px] font-semibold text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
          Supprimer
        </button>
      </div>

    </div>
  );
}

export default LotIntervenantCard;
