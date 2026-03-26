import { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronUp, Filter, HelpCircle, Scale, Trash2,
} from 'lucide-react';
import type { DocumentChantier, LotChantier } from '@/types/chantier-ia';
import DocScoreCell from '@/components/chantier/shared/DocScoreCell';
import DocStatusSelect from '@/components/chantier/shared/DocStatusSelect';
import DocTypeBadge from '@/components/chantier/shared/DocTypeBadge';
import ComparateurDevisModal from '@/components/chantier/cockpit/ComparateurDevisModal';
import { useAnalysisScores } from '@/hooks/useAnalysisScores';
import { getDevisEtFactures } from '@/lib/documentFilters';

// ── Helpers (local copies) ────────────────────────────────────────────────────

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

const LOT_STATUS_CFG: Record<LotListStatus, { dot: string; label: string; badge: string; text: string }> = {
  bloque:               { dot: 'bg-red-400',     label: '🔴 Bloqué',                  badge: 'bg-red-50 border-red-200 text-red-700',         text: 'text-red-600'     },
  a_comparer:           { dot: 'bg-amber-400',   label: '🟡 1 devis reçu',             badge: 'bg-amber-50 border-amber-200 text-amber-700',   text: 'text-amber-600'   },
  comparaison:          { dot: 'bg-blue-400',    label: '🔵 Comparaison recommandée',  badge: 'bg-blue-50 border-blue-200 text-blue-700',      text: 'text-blue-600'    },
  comparaison_optimale: { dot: 'bg-violet-400',  label: '✨ Comparaison optimale',     badge: 'bg-violet-50 border-violet-200 text-violet-700',text: 'text-violet-600'  },
  valide:               { dot: 'bg-emerald-400', label: '🟢 Sélection en cours',       badge: 'bg-emerald-50 border-emerald-200 text-emerald-700', text: 'text-emerald-600' },
};

type SortKey = 'none' | 'prix_asc' | 'prix_desc';
type FilterStatus = 'all' | LotListStatus;

// ── Component ─────────────────────────────────────────────────────────────────

export default function IntervenantsListView({ lots, docsByLot, documents, onAddDevisForLot, onGoToLot, onGoToDiy, onDeleteDoc, chantierId, token, onDocStatutUpdated }: {
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
  const [sortKey,       setSortKey]       = useState<SortKey>('none');
  const [filterSt,      setFilterSt]      = useState<FilterStatus>('all');
  const [comparingLot, setComparingLot]   = useState<{ lot: LotChantier; docs: DocumentChantier[] } | null>(null);

  // Tous les devis/factures de tous les lots
  const allDevis = useMemo(() =>
    lots.flatMap(l => getDevisEtFactures(docsByLot[l.id] ?? [])),
  [lots, docsByLot]);

  // Score + montant depuis les analyses (hook partagé — 1 seul appel)
  const { data: analysisData } = useAnalysisScores(allDevis);

  // Construction des groupes (lot + ses devis)
  const groups = useMemo(() => {
    return lots.map(lot => {
      const devisDocs = getDevisEtFactures(docsByLot[lot.id] ?? []);
      return { lot, devisDocs, status: getLotListStatus(lot, devisDocs) };
    });
  }, [lots, docsByLot]);

  // Filtrage par statut
  const filtered = filterSt === 'all' ? groups : groups.filter(g => g.status === filterSt);

  // Tri par prix (total TTC du lot ou premier devis)
  const sorted = useMemo(() => {
    if (sortKey === 'none') return filtered;
    return [...filtered].sort((a, b) => {
      const priceA = a.devisDocs.reduce((s, d) => s + (analysisData[d.id]?.ttc ?? 0), 0);
      const priceB = b.devisDocs.reduce((s, d) => s + (analysisData[d.id]?.ttc ?? 0), 0);
      return sortKey === 'prix_asc' ? priceA - priceB : priceB - priceA;
    });
  }, [filtered, sortKey, analysisData]);

  const filterOptions: { key: FilterStatus; label: string }[] = [
    { key: 'all',                 label: 'Tous' },
    { key: 'bloque',              label: '🔴 Bloqués' },
    { key: 'a_comparer',          label: '🟡 1 devis' },
    { key: 'comparaison',         label: '🔵 À comparer' },
    { key: 'comparaison_optimale',label: '✨ Optimal' },
    { key: 'valide',              label: '🟢 Sélection' },
  ];

  return (
    <div className="space-y-3 pb-20">
      {/* Filtres + tri */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        {filterOptions.map(opt => (
          <button key={opt.key}
            onClick={() => setFilterSt(opt.key)}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${filterSt === opt.key ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            {opt.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[11px] text-gray-400">Prix :</span>
          <button onClick={() => setSortKey(sortKey === 'prix_asc' ? 'prix_desc' : 'prix_asc')}
            className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border transition-all ${sortKey !== 'none' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'}`}>
            {sortKey === 'prix_asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {sortKey === 'prix_asc' ? 'Croissant' : 'Décroissant'}
          </button>
          {sortKey !== 'none' && (
            <button onClick={() => setSortKey('none')} className="text-[11px] text-gray-400 hover:text-gray-600 px-1">×</button>
          )}
        </div>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* En-tête colonnes */}
        <div className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1.2fr_auto] gap-0 border-b border-gray-100 bg-gray-50">
          {['Intervenant / Artisan', 'Lot', 'Prix TTC', 'Statut'].map((h, i) => (
            <div key={i} className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{h}</div>
          ))}
          <div className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            <span className="flex items-center gap-1">
              Score fiabilité
              <span title="Score VerifierMonDevis — analyse automatique du devis : clauses légales, prix du marché, solvabilité de l'artisan. 🟢 Bon · 🟡 Moyen · 🔴 Risqué" className="cursor-help inline-flex">
                <HelpCircle className="h-3 w-3 text-gray-300" />
              </span>
            </span>
          </div>
          <div />
        </div>

        {sorted.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-center">
            <p className="text-sm text-gray-400">Aucun intervenant dans ce filtre</p>
          </div>
        ) : (
          sorted.map(({ lot, devisDocs, status }) => {
            const cfg      = LOT_STATUS_CFG[status];
            const lotTotal = devisDocs.reduce((s, d) => s + (analysisData[d.id]?.ttc ?? 0), 0);

            return (
              <div key={lot.id} className="border-b border-gray-100 last:border-0">
                {/* Ligne groupe (header du lot) */}
                <div className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1.2fr_auto] gap-0 bg-gray-50/70 border-b border-gray-100 group/lot">
                  {/* Intervenant */}
                  <div className="px-4 py-2.5 flex items-center gap-2">
                    <span className="text-base leading-none">{lot.emoji ?? '🔧'}</span>
                    <span className="font-bold text-sm text-gray-900 truncate">{lot.nom}</span>
                  </div>
                  {/* Lot (statut avancement) */}
                  <div className="px-4 py-2.5 flex items-center">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </div>
                  {/* Prix total */}
                  <div className="px-4 py-2.5 flex items-center">
                    {lotTotal > 0
                      ? <span className="text-sm font-bold text-gray-700 tabular-nums">{fmtEur(lotTotal)}</span>
                      : <span className="text-xs text-gray-300">—</span>
                    }
                  </div>
                  {/* Statut (vide — au niveau lot) */}
                  <div className="px-4 py-2.5" />
                  {/* Analyse (vide — au niveau lot) */}
                  <div className="px-4 py-2.5" />
                  {/* Action */}
                  <div className="px-4 py-2.5 flex items-center justify-end gap-2">
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

                {/* Lignes devis du lot */}
                {devisDocs.length === 0 ? (
                  <div className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1.2fr_auto] gap-0 bg-red-50/30">
                    <div className="px-4 py-3 col-span-5 flex items-center gap-2">
                      <span className="text-[11px] text-red-400 italic">Aucun devis pour cet intervenant</span>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-end">
                      <button
                        onClick={() => onAddDevisForLot(lot.id)}
                        className="text-[11px] font-semibold text-blue-600 bg-white hover:bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap">
                        + Ajouter
                      </button>
                    </div>
                  </div>
                ) : (
                  devisDocs.map((doc, idx) => {
                    const data = analysisData[doc.id];
                    const ttc  = data?.ttc;

                    return (
                      <div key={doc.id}
                        className={`grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1.2fr_auto] gap-0 hover:bg-gray-50/60 transition-colors ${idx < devisDocs.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        {/* Artisan / nom — cliquable (fichier ou analyse) */}
                        <div className="px-4 py-3 pl-10 flex flex-col justify-center">
                          {doc.signedUrl ? (
                            <a href={doc.signedUrl} target="_blank" rel="noreferrer"
                              className="text-sm font-semibold text-blue-700 hover:underline truncate max-w-[180px]">
                              {doc.nom}
                            </a>
                          ) : doc.analyse_id ? (
                            <a href={`/analyse/${doc.analyse_id}`} target="_blank" rel="noreferrer"
                              className="text-sm font-semibold text-blue-700 hover:underline truncate max-w-[180px]">
                              {doc.nom}
                            </a>
                          ) : (
                            <span className="text-sm font-semibold text-gray-800 truncate max-w-[180px]">{doc.nom}</span>
                          )}
                          <span className="text-[10px] text-gray-400 mt-0.5">{fmtDate(doc.created_at)}</span>
                        </div>
                        {/* Type de doc */}
                        <div className="px-4 py-3 flex items-center">
                          <DocTypeBadge type={doc.document_type} signedUrl={doc.signedUrl} />
                        </div>
                        {/* Prix TTC */}
                        <div className="px-4 py-3 flex items-center">
                          {ttc != null
                            ? <span className="text-sm font-bold text-gray-800 tabular-nums">{fmtEur(ttc)}</span>
                            : <span className="text-xs text-gray-300">—</span>
                          }
                        </div>
                        {/* Statut */}
                        <div className="px-4 py-3 flex items-center">
                          <DocStatusSelect doc={doc} chantierId={chantierId} token={token!} onUpdated={onDocStatutUpdated} compact />
                        </div>
                        {/* Score fiabilité */}
                        <div className="px-4 py-3 flex items-center gap-2">
                          <DocScoreCell doc={doc} chantierId={chantierId} token={token} score={data?.score} variant="dot" />
                        </div>
                        {/* Actions */}
                        <div className="px-4 py-3 flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onDeleteDoc(doc.id)}
                            title="Supprimer ce document"
                            className="text-[11px] font-semibold text-gray-300 hover:text-red-500 hover:bg-red-50 p-1 rounded-lg transition-colors">
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

        {/* ── Ligne DIY — Travaux par vous-même ──────────────────────────────── */}
        {(() => {
          const diyDocs = documents.filter(d =>
            d.document_type === 'facture' || d.document_type === 'photo',
          );
          return (
            <div className="border-t-2 border-dashed border-gray-200">
              {/* En-tête lot DIY */}
              <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: '1fr 160px 120px 130px 160px 100px' }}>
                <div className="px-4 py-3 flex items-center gap-2.5">
                  <span className="text-base leading-none">🔧</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-700 truncate">Travaux par vous-même</p>
                    <p className="text-[11px] text-gray-400">DIY · Auto-construction</p>
                  </div>
                </div>
                <div className="px-4 py-3 flex items-center">
                  <span className="text-[11px] text-gray-400 italic">{diyDocs.length} document{diyDocs.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="px-4 py-3 flex items-center" />
                <div className="px-4 py-3 flex items-center" />
                <div className="px-4 py-3 flex items-center" />
                <div className="px-4 py-3 flex items-center justify-end">
                  <button
                    onClick={onGoToDiy}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Voir détails →
                  </button>
                </div>
              </div>
              {/* Sous-lignes documents DIY */}
              {diyDocs.length === 0 ? (
                <div className="px-6 py-3 text-[11px] text-gray-400 italic">
                  Aucun document — ajoutez vos factures matériaux et photos.
                  <button onClick={onGoToDiy} className="ml-2 text-blue-500 hover:text-blue-600 font-medium">Accéder →</button>
                </div>
              ) : (
                diyDocs.slice(0, 3).map(doc => (
                  <div key={doc.id} className="grid border-b border-gray-50 bg-gray-50/40" style={{ gridTemplateColumns: '1fr 160px 120px 130px 160px 100px' }}>
                    <div className="px-4 py-2.5 flex items-center gap-2 pl-10">
                      <span className="text-xs">
                        {doc.document_type === 'facture' ? '🧾' : '📷'}
                      </span>
                      <span className="text-xs text-gray-600 truncate max-w-[200px]">{doc.nom}</span>
                    </div>
                    <div className="px-4 py-2.5 flex items-center">
                      <span className="text-[11px] text-gray-400 capitalize">{doc.document_type}</span>
                    </div>
                    <div className="px-4 py-2.5" />
                    <div className="px-4 py-2.5" />
                    <div className="px-4 py-2.5" />
                    <div className="px-4 py-2.5 flex items-center justify-end">
                      {doc.signedUrl && (
                        <a href={doc.signedUrl} target="_blank" rel="noreferrer"
                          className="text-[11px] text-blue-500 hover:text-blue-600">Ouvrir →</a>
                      )}
                    </div>
                  </div>
                ))
              )}
              {diyDocs.length > 3 && (
                <div className="px-6 py-2 text-[11px] text-gray-400">
                  +{diyDocs.length - 3} autres documents —{' '}
                  <button onClick={onGoToDiy} className="text-blue-500 hover:text-blue-600 font-medium">tout voir</button>
                </div>
              )}
            </div>
          );
        })()}

        {/* Footer récap */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            {sorted.length} intervenant{sorted.length > 1 ? 's' : ''} · {sorted.reduce((s, g) => s + g.devisDocs.length, 0)} devis
          </span>
          <span className="text-[11px] font-semibold text-gray-600 tabular-nums">
            Total TTC estimé : {fmtEur(sorted.reduce((s, g) => s + g.devisDocs.reduce((ss, d) => ss + (analysisData[d.id]?.ttc ?? 0), 0), 0))}
          </span>
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
