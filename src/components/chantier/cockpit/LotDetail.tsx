import { useMemo, useState } from 'react';
import {
  Plus, X, Trash2, ArrowLeft, FileText, HelpCircle, Calendar, Pencil, Check,
} from 'lucide-react';
import type { LotChantier, DocumentChantier } from '@/types/chantier-ia';
import { fmtK, fmtEur, fmtDate, TYPE_LABELS } from '@/lib/dashboardHelpers';
import { formatDuration } from '@/lib/planningUtils';
import DocScoreCell from '@/components/chantier/shared/DocScoreCell';
import DocStatusSelect from '@/components/chantier/shared/DocStatusSelect';
import DocTypeBadge from '@/components/chantier/shared/DocTypeBadge';
import { useAnalysisScores } from '@/hooks/useAnalysisScores';
import { getDevisEtFactures, getPhotos, getFraisDeclares } from '@/lib/documentFilters';

function LotDetail({ lot, docs, onAddDoc, onDeleteDoc, onBack, chantierId, token, onDocStatutUpdated, onDurationChange }: {
  lot: LotChantier;
  docs: DocumentChantier[];
  onAddDoc: () => void;
  onDeleteDoc: (id: string) => void;
  onBack: () => void;
  chantierId: string | undefined;
  token: string | null | undefined;
  onDocStatutUpdated?: (docId: string, statut: string) => void;
  onDurationChange?: (dureeJours: number) => Promise<void>;
}) {
  // ── Séparation par type ──────────────────────────────────────────────────
  const devisDocs = getDevisEtFactures(docs);
  const photoDocs = getPhotos(docs);
  const fraisDocs = getFraisDeclares(docs);
  const totalFrais = fraisDocs.reduce((s, d) => s + (d.montant ?? 0), 0);

  // ── Jauge budget (devis validés vs fourchette estimée) ───────────────────
  const hasRange = (lot.budget_min_ht ?? 0) > 0 || (lot.budget_max_ht ?? 0) > 0;
  const budgetMax = (lot.budget_max_ht ?? lot.budget_avg_ht ?? 0) * 1.2; // HT → TTC approx

  // Montant validé = sum des devis en statut 'valide'
  const validatedCount = devisDocs.filter(d => (d.devis_statut ?? 'en_cours') === 'valide').length;
  const totalCount     = devisDocs.length;

  // ── Score + montant depuis les analyses (hook partagé) ─────────────────
  // ── Planning inline edit ─────────────────────────────────────────────────
  const [editingDuree, setEditingDuree]   = useState(false);
  const [dureeInput, setDureeInput]       = useState('');
  const [savingDuree, setSavingDuree]     = useState(false);

  async function saveDuree() {
    const val = parseInt(dureeInput, 10);
    if (isNaN(val) || val < 1 || !onDurationChange) return;
    setSavingDuree(true);
    await onDurationChange(val);
    setSavingDuree(false);
    setEditingDuree(false);
  }

  const { data: analysisScores } = useAnalysisScores(devisDocs);
  const scoreMap  = useMemo(() => {
    const m: Record<string, number | null> = {};
    Object.entries(analysisScores).forEach(([id, d]) => { m[id] = d.scoreNum; });
    return m;
  }, [analysisScores]);
  const amountMap = useMemo(() => {
    const m: Record<string, { ttc: number | null; ht: number | null }> = {};
    Object.entries(analysisScores).forEach(([id, d]) => { m[id] = { ttc: d.ttc, ht: d.ht }; });
    return m;
  }, [analysisScores]);

  return (
    <div className="px-5 py-6 space-y-5 max-w-5xl mx-auto">

      {/* ── Back + header ── */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-2xl leading-none">{lot.emoji ?? '🔧'}</span>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-gray-900 text-lg leading-tight">{lot.nom}</h2>
          {hasRange && (
            <p className="text-sm text-blue-700 font-semibold mt-0.5 tabular-nums">
              Fourchette estimée : {fmtK(lot.budget_min_ht ?? 0)} – {fmtK(lot.budget_max_ht ?? 0)} HT
            </p>
          )}
        </div>
        <button onClick={onAddDoc}
          className="shrink-0 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl px-4 py-2.5 transition-colors shadow-sm shadow-blue-200">
          <Plus className="h-4 w-4" /> Ajouter un devis
        </button>
      </div>

      {/* ── Jauge budget ── */}
      {hasRange && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Budget engagé — devis validés</p>
            <span className={`text-sm font-extrabold tabular-nums ${validatedCount === 0 ? 'text-gray-400' : 'text-emerald-600'}`}>
              {validatedCount} devis validé{validatedCount > 1 ? 's' : ''} / {totalCount} reçu{totalCount > 1 ? 's' : ''}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-blue-50 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-700"
              style={{ width: totalCount > 0 ? `${Math.min(100, (validatedCount / Math.max(totalCount, 1)) * 100)}%` : '2%' }}
            />
          </div>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{validatedCount} validé{validatedCount > 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <span className="w-2 h-2 rounded-full bg-gray-200 inline-block" />{totalCount - validatedCount} en attente
            </span>
          </div>
        </div>
      )}

      {/* ── Planning du lot ── */}
      {(lot.duree_jours != null || lot.date_debut) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-bold text-gray-700">Planning</span>
          </div>

          <div className="flex flex-wrap gap-4 items-start">
            {/* Durée */}
            <div className="flex-1 min-w-[140px]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Durée estimée</p>
              {editingDuree ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={dureeInput}
                    onChange={e => setDureeInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveDuree(); if (e.key === 'Escape') setEditingDuree(false); }}
                    className="w-20 border border-blue-300 rounded-lg px-2.5 py-1.5 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    autoFocus
                  />
                  <span className="text-xs text-gray-400">jours ouvrés</span>
                  <button
                    onClick={saveDuree}
                    disabled={savingDuree}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setEditingDuree(false)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-50 text-gray-400 hover:bg-gray-100 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">
                    {lot.duree_jours != null && lot.duree_jours > 0 ? formatDuration(lot.duree_jours) : '—'}
                  </span>
                  {onDurationChange && (
                    <button
                      onClick={() => { setDureeInput(String(lot.duree_jours ?? 5)); setEditingDuree(true); }}
                      className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                      title="Modifier la durée"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Dates calculées */}
            {lot.date_debut && lot.date_fin && (
              <div className="flex-1 min-w-[180px]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Créneau calculé</p>
                <p className="text-sm font-bold text-gray-900">
                  {new Date(lot.date_debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                  {' → '}
                  {new Date(lot.date_fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">Recalculé automatiquement si vous modifiez la durée</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tableau devis / factures ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-700">Devis & Factures</span>
            <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{devisDocs.length}</span>
          </div>
        </div>

        {devisDocs.length === 0 ? (
          <div className="py-14 flex flex-col items-center text-center">
            <FileText className="h-8 w-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-4">Aucun devis ajouté pour ce lot</p>
            <button onClick={onAddDoc} className="flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-colors">
              <Plus className="h-4 w-4" /> Ajouter un devis
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-[22%]">Artisan / Société</th>
                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-[10%]">Type</th>
                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-[16%]">
                    <span className="flex items-center gap-1">
                      Score fiabilité
                      <span title="Score VerifierMonDevis — analyse automatique du devis : clauses légales, prix du marché, solvabilité de l'artisan. 🟢 Bon · 🟡 Moyen · 🔴 Risqué" className="cursor-help inline-flex">
                        <HelpCircle className="h-3 w-3 text-gray-300" />
                      </span>
                    </span>
                  </th>
                  <th className="text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-[14%]">Montant</th>
                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-[18%]">Statut</th>
                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-[12%]">Date</th>
                  <th className="w-[4%]" />
                </tr>
              </thead>
              <tbody>
                {devisDocs.map(doc => {
                  const score   = scoreMap[doc.id];
                  const amounts = amountMap[doc.id];
                  return (
                    <tr key={doc.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors group">
                      {/* Artisan — cliquable pour ouvrir le doc */}
                      <td className="px-4 py-3.5">
                        {doc.signedUrl ? (
                          <a href={doc.signedUrl} target="_blank" rel="noreferrer"
                            className="group/name flex flex-col">
                            <span className="text-sm font-bold text-blue-700 hover:text-blue-900 underline-offset-2 hover:underline truncate max-w-[160px] transition-colors">{doc.nom}</span>
                            <span className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1"><FileText className="h-2.5 w-2.5" /> Ouvrir le document</span>
                          </a>
                        ) : (
                          <div>
                            <p className="text-sm font-bold text-gray-900 truncate max-w-[160px]">{doc.nom}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{TYPE_LABELS[doc.document_type]}</p>
                          </div>
                        )}
                      </td>
                      {/* Type */}
                      <td className="px-4 py-3.5">
                        <DocTypeBadge type={doc.document_type} signedUrl={doc.signedUrl} />
                      </td>
                      {/* Score VMD — cliquable vers l'analyse OU bouton analyser */}
                      <td className="px-4 py-3.5">
                        <DocScoreCell
                          doc={doc}
                          chantierId={chantierId}
                          token={token}
                          score={score}
                        />
                      </td>
                      {/* Montant TTC / HT */}
                      <td className="px-4 py-3.5 text-right">
                        {amounts?.ttc != null ? (
                          <div>
                            <p className="text-sm font-bold text-gray-800 tabular-nums whitespace-nowrap">{fmtEur(amounts.ttc)} TTC</p>
                            {amounts.ht != null && (
                              <p className="text-[10px] text-gray-400 tabular-nums">{fmtEur(amounts.ht)} HT</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                      {/* Statut — différent pour devis vs facture */}
                      <td className="px-4 py-3.5">
                        <DocStatusSelect
                          doc={doc}
                          chantierId={chantierId!}
                          token={token!}
                          onUpdated={onDocStatutUpdated}
                        />
                      </td>
                      {/* Date */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(doc.created_at)}</span>
                      </td>
                      {/* Supprimer */}
                      <td className="px-2 py-3.5">
                        <button onClick={() => onDeleteDoc(doc.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-200 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer tableau */}
        {devisDocs.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-400">{devisDocs.length} document{devisDocs.length > 1 ? 's' : ''} · {validatedCount} validé{validatedCount > 1 ? 's' : ''}</span>
            <button onClick={onAddDoc}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
              <Plus className="h-3 w-3" /> Ajouter
            </button>
          </div>
        )}
      </div>

      {/* ── Frais annexes déclarés (chat agent, sans pièce jointe) ── */}
      {fraisDocs.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-amber-50 flex items-center justify-between bg-amber-50/40">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-amber-800">Frais annexes déclarés</span>
              <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{fraisDocs.length}</span>
            </div>
            <span className="text-sm font-bold text-amber-800 tabular-nums">{fmtEur(totalFrais)}</span>
          </div>
          <div className="divide-y divide-amber-50">
            {fraisDocs.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 text-amber-600 text-base">📝</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.nom || 'Frais déclarés'}</p>
                  <p className="text-[11px] text-gray-400">Déclaré le {fmtDate(doc.created_at)}</p>
                </div>
                {doc.montant != null && (
                  <span className="text-sm font-bold text-gray-900 tabular-nums shrink-0">{fmtEur(doc.montant)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Photos du lot ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-700">📷 Photos</span>
            <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{photoDocs.length}</span>
          </div>
          <button onClick={onAddDoc}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors">
            <Plus className="h-3 w-3" /> Ajouter
          </button>
        </div>

        {photoDocs.length === 0 ? (
          <div className="py-10 flex flex-col items-center text-center">
            <p className="text-3xl mb-2">📷</p>
            <p className="text-sm text-gray-400 mb-1">Aucune photo pour ce lot</p>
            <p className="text-xs text-gray-300">Avant travaux · Pendant · Après réception</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {photoDocs.map(doc => (
              <div key={doc.id} className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-100">
                {doc.signedUrl ? (
                  <a href={doc.signedUrl} target="_blank" rel="noreferrer">
                    <img src={doc.signedUrl} alt={doc.nom} className="w-full h-full object-cover hover:scale-105 transition-transform duration-200" />
                  </a>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">📷</div>
                )}
                <button onClick={() => onDeleteDoc(doc.id)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
                  <X className="h-3 w-3" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-white truncate">{doc.nom}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Autres documents (plans, autorisations…) ── */}
      {docs.filter(d => !['devis', 'facture', 'photo'].includes(d.document_type)).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50">
            <span className="text-sm font-bold text-gray-700">Autres documents</span>
          </div>
          <div className="divide-y divide-gray-50">
            {docs.filter(d => !['devis', 'facture', 'photo'].includes(d.document_type)).map(doc => (
              <div key={doc.id} className="flex items-center gap-3 px-5 py-3.5 group">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                  <FileText className="h-3.5 w-3.5 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.nom}</p>
                  <p className="text-[11px] text-gray-400">{TYPE_LABELS[doc.document_type]} · {fmtDate(doc.created_at)}</p>
                </div>
                {doc.signedUrl && (
                  <a href={doc.signedUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Ouvrir</a>
                )}
                <button onClick={() => onDeleteDoc(doc.id)}
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-200 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default LotDetail;
