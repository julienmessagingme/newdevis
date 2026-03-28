import { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronUp, Filter, HelpCircle, Scale, Trash2, ExternalLink,
} from 'lucide-react';
import type { DocumentChantier, LotChantier } from '@/types/chantier-ia';
import DocScoreCell from '@/components/chantier/shared/DocScoreCell';
import DocStatusSelect from '@/components/chantier/shared/DocStatusSelect';
import DocTypeBadge from '@/components/chantier/shared/DocTypeBadge';
import ComparateurDevisModal from '@/components/chantier/cockpit/ComparateurDevisModal';
import { useAnalysisScores } from '@/hooks/useAnalysisScores';
import { getDevisEtFactures } from '@/lib/documentFilters';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

// ── Types & constants ─────────────────────────────────────────────────────────

type LotListStatus = 'bloque' | 'a_comparer' | 'comparaison' | 'comparaison_optimale' | 'valide';

function getLotListStatus(lot: LotChantier, devisDocs: DocumentChantier[]): LotListStatus {
  const hasValidated = devisDocs.some(d =>
    (d.devis_statut ?? 'en_cours') === 'valide' || ['ok', 'termine', 'contrat_signe'].includes(lot.statut ?? ''),
  );
  if (hasValidated) return 'valide';
  if (devisDocs.length >= 3) return 'comparaison_optimale';
  if (devisDocs.length >= 2) return 'comparaison';
  if (devisDocs.length === 1) return 'a_comparer';
  return 'bloque';
}

const LOT_STATUS_CFG: Record<LotListStatus, {
  dot: string; label: string; badge: string; text: string; rowBg: string; leftBorder: string;
}> = {
  bloque:               { dot: 'bg-red-400',     label: 'Bloqué',              badge: 'bg-red-50 border-red-200 text-red-700',          text: 'text-red-600',    rowBg: 'bg-red-50/20',    leftBorder: 'border-l-red-300'    },
  a_comparer:           { dot: 'bg-amber-400',   label: '1 devis reçu',        badge: 'bg-amber-50 border-amber-200 text-amber-700',    text: 'text-amber-600',  rowBg: 'bg-amber-50/20',  leftBorder: 'border-l-amber-300'  },
  comparaison:          { dot: 'bg-blue-400',    label: 'À comparer',          badge: 'bg-blue-50 border-blue-200 text-blue-700',       text: 'text-blue-600',   rowBg: 'bg-blue-50/20',   leftBorder: 'border-l-blue-300'   },
  comparaison_optimale: { dot: 'bg-violet-400',  label: 'Optimal',             badge: 'bg-violet-50 border-violet-200 text-violet-700', text: 'text-violet-600', rowBg: 'bg-violet-50/20', leftBorder: 'border-l-violet-300' },
  valide:               { dot: 'bg-emerald-400', label: 'Sélection en cours',  badge: 'bg-emerald-50 border-emerald-200 text-emerald-700', text: 'text-emerald-600', rowBg: 'bg-emerald-50/20', leftBorder: 'border-l-emerald-300' },
};

// Grille partagée par toutes les lignes — une seule source de vérité
const GRID = 'grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_116px_132px_minmax(0,1.1fr)_104px]';

type SortKey = 'none' | 'prix_asc' | 'prix_desc';
type FilterStatus = 'all' | LotListStatus;

// ── Component ─────────────────────────────────────────────────────────────────

export default function IntervenantsListView({
  lots, docsByLot, documents, onAddDevisForLot, onGoToLot, onGoToDiy,
  onDeleteDoc, chantierId, token, onDocStatutUpdated,
}: {
  lots: LotChantier[];
  docsByLot: Record<string, DocumentChantier[]>;
  documents: DocumentChantier[];
  onAddDevisForLot: (lotId: string) => void;
  onDeleteDoc: (docId: string) => void;
  onGoToLot: (lotId: string) => void;
  onGoToDiy: () => void;
  chantierId: string;
  token: string | null | undefined;
  onDocStatutUpdated?: (docId: string, statut: string) => void;
}) {
  const [sortKey,      setSortKey]      = useState<SortKey>('none');
  const [filterSt,     setFilterSt]     = useState<FilterStatus>('all');
  const [comparingLot, setComparingLot] = useState<{ lot: LotChantier; docs: DocumentChantier[] } | null>(null);

  const allDevis = useMemo(() =>
    lots.flatMap(l => getDevisEtFactures(docsByLot[l.id] ?? [])),
  [lots, docsByLot]);

  const { data: analysisData } = useAnalysisScores(allDevis);

  const groups = useMemo(() => lots.map(lot => {
    const devisDocs = getDevisEtFactures(docsByLot[lot.id] ?? []);
    return { lot, devisDocs, status: getLotListStatus(lot, devisDocs) };
  }), [lots, docsByLot]);

  const filtered = filterSt === 'all' ? groups : groups.filter(g => g.status === filterSt);

  const sorted = useMemo(() => {
    if (sortKey === 'none') return filtered;
    return [...filtered].sort((a, b) => {
      const bestPrice = (g: typeof a) => {
        const validated = g.devisDocs.find(d => d.devis_statut === 'valide');
        if (validated) return analysisData[validated.id]?.ttc ?? 0;
        const prices = g.devisDocs.map(d => analysisData[d.id]?.ttc ?? 0).filter(p => p > 0);
        return prices.length ? Math.min(...prices) : 0;
      };
      return sortKey === 'prix_asc' ? bestPrice(a) - bestPrice(b) : bestPrice(b) - bestPrice(a);
    });
  }, [filtered, sortKey, analysisData]);

  // Total : pour chaque lot, on prend le devis validé ou le moins cher (pas la somme de tous)
  const totalEstimated = useMemo(() => sorted.reduce((acc, { devisDocs }) => {
    const validated = devisDocs.find(d => d.devis_statut === 'valide');
    if (validated) return acc + (analysisData[validated.id]?.ttc ?? 0);
    const prices = devisDocs.map(d => analysisData[d.id]?.ttc ?? 0).filter(p => p > 0);
    return acc + (prices.length ? Math.min(...prices) : 0);
  }, 0), [sorted, analysisData]);

  // DIY : uniquement les factures de matériaux sans lot lié (achats faits par le client)
  const diyDocs = useMemo(() =>
    documents.filter(d => !d.lot_id && d.document_type === 'facture'),
  [documents]);

  const filterOptions: { key: FilterStatus; label: string; dot?: string }[] = [
    { key: 'all',                  label: 'Tous' },
    { key: 'bloque',               label: 'Bloqués',   dot: 'bg-red-400' },
    { key: 'a_comparer',           label: '1 devis',   dot: 'bg-amber-400' },
    { key: 'comparaison',          label: 'À comparer', dot: 'bg-blue-400' },
    { key: 'comparaison_optimale', label: 'Optimal',   dot: 'bg-violet-400' },
    { key: 'valide',               label: 'Sélection', dot: 'bg-emerald-400' },
  ];

  return (
    <div className="space-y-3 pb-20">
      {/* Filtres + tri */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        {filterOptions.map(opt => (
          <button key={opt.key}
            onClick={() => setFilterSt(opt.key)}
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${
              filterSt === opt.key ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}>
            {opt.dot && <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />}
            {opt.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] text-gray-400">Prix :</span>
          <button onClick={() => setSortKey(sortKey === 'prix_asc' ? 'prix_desc' : 'prix_asc')}
            className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${
              sortKey !== 'none' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
            }`}>
            {sortKey === 'prix_asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {sortKey === 'prix_asc' ? 'Croissant' : 'Décroissant'}
          </button>
          {sortKey !== 'none' && (
            <button onClick={() => setSortKey('none')}
              className="text-[11px] text-gray-400 hover:text-gray-600 px-1">×</button>
          )}
        </div>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* En-tête colonnes */}
        <div className={`grid ${GRID} border-b border-gray-100 bg-gray-50`}>
          <div className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Intervenant / Document</div>
          <div className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Type</div>
          <div className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Prix TTC</div>
          <div className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Statut</div>
          <div className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            <span className="flex items-center gap-1">
              Score
              <span
                title="Score VerifierMonDevis — analyse automatique du devis : clauses légales, prix marché, solvabilité. 🟢 Bon · 🟡 Moyen · 🔴 Risqué"
                className="cursor-help inline-flex">
                <HelpCircle className="h-3 w-3 text-gray-300" />
              </span>
            </span>
          </div>
          <div className="px-4 py-2.5" />
        </div>

        {sorted.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-center">
            <p className="text-sm text-gray-400">Aucun intervenant dans ce filtre</p>
          </div>
        ) : (
          sorted.map(({ lot, devisDocs, status }) => {
            const cfg      = LOT_STATUS_CFG[status];
            // Total du lot : devis validé ou plus bas prix (ne somme pas tous les devis)
            const validated = devisDocs.find(d => d.devis_statut === 'valide');
            const lotPrice  = validated
              ? (analysisData[validated.id]?.ttc ?? 0)
              : (() => {
                  const prices = devisDocs.map(d => analysisData[d.id]?.ttc ?? 0).filter(p => p > 0);
                  return prices.length ? Math.min(...prices) : 0;
                })();
            const hasMultiplePrices = !validated && devisDocs.filter(d => (analysisData[d.id]?.ttc ?? 0) > 0).length > 1;

            return (
              <div key={lot.id} className="border-b border-gray-100 last:border-0">

                {/* ── Ligne lot (header de groupe) ── */}
                <div className={`grid ${GRID} border-b border-gray-100 border-l-4 ${cfg.leftBorder} ${cfg.rowBg} group/lot`}>
                  {/* Nom intervenant */}
                  <div className="px-4 py-3 flex items-center gap-2.5">
                    <span className="text-base leading-none shrink-0">{lot.emoji ?? '🔧'}</span>
                    <span className="font-extrabold text-sm text-gray-900 truncate">{lot.nom}</span>
                  </div>
                  {/* Col 2 : nb devis */}
                  <div className="px-4 py-3 flex items-center">
                    <span className="text-[11px] text-gray-400">
                      {devisDocs.length} devis{devisDocs.length !== 1 ? '' : ''}
                    </span>
                  </div>
                  {/* Prix total lot — gras, droite */}
                  <div className="px-4 py-3 flex items-center justify-end">
                    {lotPrice > 0 ? (
                      <div className="text-right">
                        <span className="text-[15px] font-extrabold text-gray-900 tabular-nums">{fmtEur(lotPrice)}</span>
                        {hasMultiplePrices && (
                          <p className="text-[9px] text-gray-400 mt-0.5 leading-none">prix min</p>
                        )}
                        {validated && (
                          <p className="text-[9px] text-emerald-600 mt-0.5 leading-none font-semibold">validé</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-300 font-medium">—</span>
                    )}
                  </div>
                  {/* Col 4 : Statut du lot */}
                  <div className="px-4 py-3 flex items-center">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${cfg.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  </div>
                  {/* Score (vide au niveau lot) */}
                  <div className="px-4 py-3" />
                  {/* Actions lot */}
                  <div className="px-4 py-3 flex items-center justify-end gap-1">
                    {devisDocs.length >= 2 && (
                      <button
                        onClick={() => setComparingLot({ lot, docs: devisDocs })}
                        className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg transition-colors whitespace-nowrap">
                        <Scale className="h-3 w-3" /> Comparer
                      </button>
                    )}
                    <button
                      onClick={() => onAddDevisForLot(lot.id)}
                      className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-lg transition-colors whitespace-nowrap">
                      + Devis
                    </button>
                    <button
                      onClick={() => onGoToLot(lot.id)}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap">
                      Voir →
                    </button>
                  </div>
                </div>

                {/* ── Lignes devis ── */}
                {devisDocs.length === 0 ? (
                  <div className={`grid ${GRID} bg-red-50/10`}>
                    <div className="px-4 py-2.5 pl-10 col-span-5 flex items-center gap-2">
                      <span className="text-[11px] text-red-400 italic">Aucun devis pour cet intervenant</span>
                    </div>
                    <div className="px-4 py-2.5 flex items-center justify-end">
                      <button
                        onClick={() => onAddDevisForLot(lot.id)}
                        className="text-[11px] font-semibold text-blue-600 bg-white hover:bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors">
                        + Ajouter
                      </button>
                    </div>
                  </div>
                ) : (
                  devisDocs.map((doc, idx) => {
                    const data    = analysisData[doc.id];
                    const ttc     = data?.ttc;
                    const isLast  = idx === devisDocs.length - 1;
                    const isSelected = doc.devis_statut === 'valide';

                    return (
                      <div key={doc.id}
                        className={`grid ${GRID} transition-colors hover:bg-gray-50/70 ${
                          isSelected ? 'bg-emerald-50/30' : ''
                        } ${!isLast ? 'border-b border-gray-50' : ''}`}>

                        {/* Nom artisan / document — indenté */}
                        <div className="px-4 py-2.5 pl-10 flex flex-col justify-center">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isSelected && (
                              <span className="text-emerald-500 text-[10px] font-bold shrink-0">✓</span>
                            )}
                            {doc.signedUrl ? (
                              <a href={doc.signedUrl} target="_blank" rel="noreferrer"
                                className="text-sm text-blue-700 hover:text-blue-900 hover:underline truncate max-w-[190px] flex items-center gap-1">
                                {doc.nom}
                                <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50" />
                              </a>
                            ) : doc.analyse_id ? (
                              <a href={`/analyse/${doc.analyse_id}`} target="_blank" rel="noreferrer"
                                className="text-sm text-blue-700 hover:text-blue-900 hover:underline truncate max-w-[190px] flex items-center gap-1">
                                {doc.nom}
                                <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50" />
                              </a>
                            ) : (
                              <span className="text-sm text-gray-700 truncate max-w-[190px]">{doc.nom}</span>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400 mt-0.5 pl-3.5">{fmtDate(doc.created_at)}</span>
                        </div>

                        {/* Type de doc */}
                        <div className="px-4 py-2.5 flex items-center">
                          <DocTypeBadge type={doc.document_type} signedUrl={doc.signedUrl} />
                        </div>

                        {/* Prix TTC — droite, poids normal */}
                        <div className="px-4 py-2.5 flex items-center justify-end">
                          {ttc != null && ttc > 0
                            ? <span className={`text-sm tabular-nums ${isSelected ? 'font-bold text-emerald-700' : 'font-medium text-gray-700'}`}>{fmtEur(ttc)}</span>
                            : <span className="text-xs text-gray-300">—</span>
                          }
                        </div>

                        {/* Statut */}
                        <div className="px-4 py-2.5 flex items-center">
                          <DocStatusSelect doc={doc} chantierId={chantierId} token={token!} onUpdated={onDocStatutUpdated} compact />
                        </div>

                        {/* Score fiabilité */}
                        <div className="px-4 py-2.5 flex items-center">
                          <DocScoreCell doc={doc} chantierId={chantierId} token={token} score={data?.score} variant="dot" />
                        </div>

                        {/* Actions */}
                        <div className="px-4 py-2.5 flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onDeleteDoc(doc.id)}
                            title="Supprimer ce document"
                            className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-1 rounded-lg transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => onGoToLot(lot.id)}
                            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors whitespace-nowrap">
                            Détails
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })
        )}

        {/* ── DIY — uniquement si des factures matériaux non-liées à un lot existent ── */}
        {diyDocs.length > 0 && (
          <div className="border-t border-dashed border-gray-200">
            <div className={`grid ${GRID} bg-amber-50/40 border-l-4 border-l-amber-200`}>
              <div className="px-4 py-3 flex items-center gap-2.5">
                <span className="text-base leading-none">🛒</span>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-amber-800 truncate">Achats matériaux (DIY)</p>
                  <p className="text-[10px] text-amber-600">{diyDocs.length} facture{diyDocs.length !== 1 ? 's' : ''} · pose assurée par vous</p>
                </div>
              </div>
              <div className="px-4 py-3 flex items-center">
                <span className="text-[11px] text-amber-600 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">Matériaux</span>
              </div>
              <div className="px-4 py-3" />
              <div className="px-4 py-3" />
              <div className="px-4 py-3" />
              <div className="px-4 py-3 flex items-center justify-end">
                <button onClick={onGoToDiy}
                  className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap">
                  Voir →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer récap ── */}
        <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-4">
          <span className="text-[11px] text-gray-400">
            {sorted.length} intervenant{sorted.length > 1 ? 's' : ''} · {sorted.reduce((s, g) => s + g.devisDocs.length, 0)} devis
          </span>
          {totalEstimated > 0 && (
            <div className="flex items-center gap-2.5 bg-white border border-gray-200 rounded-xl px-4 py-2 shadow-sm">
              <span className="text-[11px] text-gray-400 whitespace-nowrap">
                Total TTC estimé
              </span>
              <span className="text-[11px] text-gray-300 hidden sm:inline">(devis validés ou prix min)</span>
              <span className="text-base font-extrabold text-gray-900 tabular-nums">{fmtEur(totalEstimated)}</span>
            </div>
          )}
        </div>
      </div>

      {comparingLot && (
        <ComparateurDevisModal
          lot={comparingLot.lot}
          docs={comparingLot.docs}
          onClose={() => setComparingLot(null)}
        />
      )}
    </div>
  );
}
