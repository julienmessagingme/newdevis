import { useMemo } from 'react';
import { X, Loader2, ExternalLink, Star, Scale } from 'lucide-react';
import type { DocumentChantier, LotChantier } from '@/types/chantier-ia';
import { useAnalysisScores } from '@/hooks/useAnalysisScores';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SCORE_CFG = {
  VERT:   { bg: 'bg-emerald-50 text-emerald-700', label: '✅ Bon' },
  ORANGE: { bg: 'bg-amber-50 text-amber-700',     label: '⚠️ Moyen' },
  ROUGE:  { bg: 'bg-red-50 text-red-600',         label: '🔴 Risqué' },
} as const;

const STATUT_LABELS: Record<string, string> = {
  en_cours: 'En cours', a_relancer: 'À relancer', valide: '✓ Validé', attente_facture: 'Att. facture',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ComparateurDevisModal({ lot, docs, onClose }: {
  lot: LotChantier;
  docs: DocumentChantier[];
  onClose: () => void;
}) {
  const { data: analysisData, loading } = useAnalysisScores(docs);

  const recommendation = useMemo(() => {
    const scored = docs.map(d => ({ doc: d, score: analysisData[d.id]?.score ?? null, ttc: analysisData[d.id]?.ttc ?? null }));
    const scoreOrder = { VERT: 3, ORANGE: 2, ROUGE: 1 };
    const verts = scored.filter(d => d.score === 'VERT' && d.ttc != null).sort((a, b) => a.ttc! - b.ttc!);
    if (verts.length > 0) return { id: verts[0].doc.id, nom: verts[0].doc.nom, ttc: verts[0].ttc, reason: 'Score VMD optimal et prix compétitif' };
    const withScore = scored.filter(d => d.score && d.ttc != null).sort((a, b) => {
      const diff = (scoreOrder[b.score as keyof typeof scoreOrder] ?? 0) - (scoreOrder[a.score as keyof typeof scoreOrder] ?? 0);
      return diff !== 0 ? diff : (a.ttc ?? 0) - (b.ttc ?? 0);
    });
    if (withScore.length > 0) return { id: withScore[0].doc.id, nom: withScore[0].doc.nom, ttc: withScore[0].ttc, reason: 'Meilleur rapport qualité / prix disponible' };
    const withPrice = scored.filter(d => d.ttc != null).sort((a, b) => a.ttc! - b.ttc!);
    if (withPrice.length > 0) return { id: withPrice[0].doc.id, nom: withPrice[0].doc.nom, ttc: withPrice[0].ttc, reason: 'Offre la moins chère parmi les devis reçus' };
    return null;
  }, [docs, analysisData]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-auto overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Scale className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900">Comparatif des devis</p>
              <p className="text-xs text-gray-400">{lot.emoji} {lot.nom} · {docs.length} offres reçues</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Recommandation IA */}
          {!loading && recommendation && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Star className="h-4 w-4 text-amber-500 fill-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-0.5">⭐ Recommandation</p>
                  <p className="font-bold text-gray-900 text-sm truncate">{recommendation.nom}</p>
                  <p className="text-xs text-amber-700 mt-0.5">{recommendation.reason}</p>
                  {recommendation.ttc != null && (
                    <p className="text-base font-extrabold text-gray-900 mt-1.5 tabular-nums">{fmtEur(recommendation.ttc)} TTC</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tableau comparatif */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Comparaison détaillée</p>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2.5">
                {docs.map(doc => {
                  const ad          = analysisData[doc.id];
                  const isRecommended = recommendation?.id === doc.id;
                  const scoreCfg    = ad?.score ? SCORE_CFG[ad.score] : null;
                  const statutLabel = STATUT_LABELS[doc.devis_statut ?? 'en_cours'] ?? doc.devis_statut ?? 'En cours';

                  return (
                    <div key={doc.id}
                      className={`rounded-xl border p-4 ${isRecommended ? 'border-amber-300 bg-amber-50/40' : 'border-gray-100 bg-gray-50/40'}`}>
                      <div className="flex items-start gap-2.5">
                        {isRecommended ? (
                          <div className="shrink-0 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center mt-0.5">
                            <Star className="h-2.5 w-2.5 text-white fill-white" />
                          </div>
                        ) : (
                          <div className="shrink-0 w-5 h-5 rounded-full bg-gray-100 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            {doc.signedUrl ? (
                              <a href={doc.signedUrl} target="_blank" rel="noreferrer"
                                className="font-bold text-sm text-blue-700 hover:underline truncate max-w-[200px] flex items-center gap-1">
                                {doc.nom} <ExternalLink className="h-2.5 w-2.5 opacity-60 shrink-0" />
                              </a>
                            ) : (
                              <span className="font-bold text-sm text-gray-900 truncate max-w-[200px]">{doc.nom}</span>
                            )}
                            {scoreCfg && (
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${scoreCfg.bg}`}>{scoreCfg.label}</span>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <p className="text-[10px] text-gray-400">Prix TTC</p>
                              {ad?.ttc != null
                                ? <p className="text-sm font-extrabold text-gray-900 tabular-nums">{fmtEur(ad.ttc)}</p>
                                : <p className="text-xs text-gray-300 italic">Non analysé</p>
                              }
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400">Statut</p>
                              <p className="text-xs font-semibold text-gray-700">{statutLabel}</p>
                            </div>
                            {doc.analyse_id && (
                              <div className="flex items-end">
                                <a href={`/analyse/${doc.analyse_id}`} target="_blank" rel="noreferrer"
                                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                                  Analyse VMD <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50/60 shrink-0">
          <p className="text-[10px] text-gray-400 text-center leading-relaxed">
            Recommandation calculée sur le score d'analyse VMD et le prix TTC · Vérifiez toujours les garanties et délais avant signature
          </p>
        </div>
      </div>
    </div>
  );
}
