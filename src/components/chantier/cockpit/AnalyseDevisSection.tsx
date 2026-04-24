/**
 * AnalyseDevisSection — "Ai-je tout pour choisir mes artisans ?"
 *
 * Vision : 1 carte par lot, avec les devis reçus dessous.
 * Statut clair, score visible, action contextuelle.
 * Suppression des insights IA confus (gardés en prop pour compat).
 */
import { useState, useEffect } from 'react';
import { Plus, FileText, Sparkles, CheckCircle2, Clock, AlertCircle, ChevronRight, ExternalLink } from 'lucide-react';
import type { DocumentChantier, LotChantier } from '@/types/chantier-ia';
import DocScoreCell from '@/components/chantier/shared/DocScoreCell';
import { fmtDate, fmtEur } from '@/lib/dashboardHelpers';
import type { InsightsData } from './useInsights';

// ── Statut par lot ────────────────────────────────────────────────────────────

type LotStatus =
  | { kind: 'no_devis' }
  | { kind: 'one_devis' }
  | { kind: 'multiple' }
  | { kind: 'validated' };

function getLotStatus(lot: LotChantier, devis: DocumentChantier[]): LotStatus {
  if (lot.statut === 'ok' || lot.statut === 'termine' || lot.statut === 'contrat_signe') {
    return { kind: 'validated' };
  }
  const hasValidated = devis.some(d => d.devis_statut === 'valide' || d.devis_statut === 'attente_facture');
  if (hasValidated) return { kind: 'validated' };
  if (devis.length === 0) return { kind: 'no_devis' };
  if (devis.length === 1) return { kind: 'one_devis' };
  return { kind: 'multiple' };
}

const STATUS_CFG = {
  no_devis:  { label: 'Aucun devis',          color: 'text-gray-400',   bg: 'bg-gray-50',    border: 'border-gray-100', icon: <AlertCircle className="h-3.5 w-3.5" /> },
  one_devis: { label: '1 devis reçu',          color: 'text-amber-600',  bg: 'bg-amber-50',   border: 'border-amber-100', icon: <Clock className="h-3.5 w-3.5" /> },
  multiple:  { label: 'Comparaison possible',  color: 'text-blue-600',   bg: 'bg-blue-50',    border: 'border-blue-100',  icon: <ChevronRight className="h-3.5 w-3.5" /> },
  validated: { label: 'Artisan sélectionné',   color: 'text-emerald-600',bg: 'bg-emerald-50', border: 'border-emerald-100',icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
};

// ── Carte lot ─────────────────────────────────────────────────────────────────

function LotCard({
  lot, devis, frais, onAddDevis, chantierId, token, onAnalysed,
}: {
  lot: LotChantier;
  devis: DocumentChantier[];
  frais?: DocumentChantier[];
  onAddDevis: () => void;
  chantierId?: string | null;
  token?: string | null;
  onAnalysed?: (docId: string, analyseId: string) => void;
}) {
  const status = getLotStatus(lot, devis);
  const cfg = STATUS_CFG[status.kind];
  const fraisList = frais ?? [];
  const fraisTotal = fraisList.reduce((s, d) => s + (d.montant ?? 0), 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* En-tête lot */}
      <div className="px-5 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-lg shrink-0 border border-gray-100">
          {lot.emoji ?? '🔧'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-[13px] truncate">{lot.nom}</p>
          {(lot.budget_min_ht ?? 0) > 0 && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              Réf. marché : {Math.round((lot.budget_min_ht ?? 0) / 1000)}–{Math.round((lot.budget_max_ht ?? 0) / 1000)} k€
            </p>
          )}
        </div>
        {/* Badge statut */}
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.color} shrink-0`}>
          {cfg.icon}
          {cfg.label}
        </span>
      </div>

      {/* Devis reçus */}
      {devis.length > 0 && (
        <div className="border-t border-gray-50 divide-y divide-gray-50">
          {devis.map(doc => (
            <div key={doc.id} className="px-5 py-3 flex items-center gap-3">
              <FileText className="h-4 w-4 text-gray-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-gray-800 truncate">{doc.nom}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(doc.created_at)}</p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <DocScoreCell
                  doc={doc}
                  chantierId={chantierId ?? undefined}
                  token={token}
                  onAnalysed={onAnalysed}
                />
                {doc.analyse_id && (
                  <a
                    href={`/analyse/${doc.analyse_id}?from=chantier&chantierId=${chantierId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 transition-colors"
                    title="Voir l'analyse complète"
                  >
                    Voir <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Frais annexes déclarés (sans pièce jointe) */}
      {fraisList.length > 0 && (
        <div className="border-t border-amber-50 bg-amber-50/30">
          <div className="px-5 py-2 flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Frais annexes déclarés</span>
            <span className="text-[11px] font-bold text-amber-800 tabular-nums">{fmtEur(fraisTotal)}</span>
          </div>
          <div className="divide-y divide-amber-50">
            {fraisList.map(doc => (
              <div key={doc.id} className="px-5 py-2 flex items-center gap-3">
                <span className="text-amber-600">📝</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-gray-700 truncate">{doc.nom}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Déclaré le {fmtDate(doc.created_at)}</p>
                </div>
                {doc.montant != null && (
                  <span className="text-[12px] font-bold text-gray-900 tabular-nums shrink-0">{fmtEur(doc.montant)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA contextuel */}
      <div className={`px-5 py-3 ${devis.length > 0 || fraisList.length > 0 ? 'border-t border-gray-50' : ''}`}>
        {status.kind === 'no_devis' && (
          <button
            onClick={onAddDevis}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter un devis pour ce lot
          </button>
        )}
        {status.kind === 'one_devis' && (
          <p className="text-[11px] text-amber-600 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            Obtenez un 2ème devis pour pouvoir comparer
          </p>
        )}
        {status.kind === 'multiple' && (
          <p className="text-[11px] text-blue-600 flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            Consultez les scores pour choisir le meilleur
          </p>
        )}
        {status.kind === 'validated' && (
          <p className="text-[11px] text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            Artisan retenu — lot suivi dans l'échéancier
          </p>
        )}
      </div>
    </div>
  );
}

// ── Devis non affectés à un lot ───────────────────────────────────────────────

function UnassignedCard({
  docs, chantierId, token, onAnalysed,
}: {
  docs: DocumentChantier[];
  chantierId?: string | null;
  token?: string | null;
  onAnalysed?: (docId: string, analyseId: string) => void;
}) {
  if (docs.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-100 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 flex items-center gap-2 border-b border-amber-100">
        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
        <p className="text-[12px] font-bold text-amber-800">
          {docs.length} devis non affecté{docs.length > 1 ? 's' : ''} à un lot
        </p>
        <p className="text-[11px] text-amber-600 ml-auto">Affecter à un lot pour les comparer</p>
      </div>
      <div className="divide-y divide-amber-100">
        {docs.map(doc => (
          <div key={doc.id} className="px-5 py-3 flex items-center gap-3">
            <FileText className="h-4 w-4 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-gray-800 truncate">{doc.nom}</p>
              <p className="text-[10px] text-gray-400">{fmtDate(doc.created_at)}</p>
            </div>
            <DocScoreCell
              doc={doc}
              chantierId={chantierId ?? undefined}
              token={token}
              onAnalysed={onAnalysed}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section principale ────────────────────────────────────────────────────────

function AnalyseDevisSection({
  documents: docsProp, lots, onAddDoc, chantierId, token,
  // Props de compat conservées mais non utilisées (legacy Gemini insights)
  insights: _insights, insightsLoading: _insightsLoading,
}: {
  documents: DocumentChantier[];
  lots: LotChantier[];
  insights: InsightsData | null;
  insightsLoading: boolean;
  onAddDoc: () => void;
  chantierId?: string | null;
  token?: string | null;
}) {
  const [docs, setDocs] = useState(docsProp);
  useEffect(() => { setDocs(docsProp); }, [docsProp]);

  const devis = docs.filter(d => d.document_type === 'devis');
  const analysed = devis.filter(d => !!d.analyse_id).length;
  const validated = lots.filter(l =>
    l.statut === 'ok' || l.statut === 'termine' || l.statut === 'contrat_signe' ||
    devis.some(d => d.lot_id === l.id && (d.devis_statut === 'valide' || d.devis_statut === 'attente_facture'))
  ).length;

  // Devis sans lot
  const unassigned = devis.filter(d => !d.lot_id);

  const handleAnalysed = (docId: string, analyseId: string) =>
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, analyse_id: analyseId } : d));

  if (devis.length === 0 && lots.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-6">
          <FileText className="h-8 w-8 text-blue-400" />
        </div>
        <h2 className="font-bold text-gray-900 text-lg mb-2">Aucun devis à comparer</h2>
        <p className="text-sm text-gray-400 leading-relaxed mb-7 max-w-sm">
          Déposez vos devis pour les comparer aux prix du marché et choisir en confiance.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <a href="/nouvelle-analyse"
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
            <Sparkles className="h-4 w-4" /> Analyser un devis
          </a>
          <button onClick={onAddDoc}
            className="flex items-center justify-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
            <Plus className="h-4 w-4" /> Importer un devis existant
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-7 space-y-5">

      {/* Barre de progression — répond à "Où en suis-je ?" */}
      {lots.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Avancement des lots</p>
            <p className="text-[12px] font-bold text-gray-600">
              {validated}/{lots.length} artisans sélectionnés
            </p>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: lots.length > 0 ? `${Math.round((validated / lots.length) * 100)}%` : '0%' }}
            />
          </div>
          {devis.length > 0 && (
            <p className="text-[11px] text-gray-400 mt-2">
              {devis.length} devis reçu{devis.length > 1 ? 's' : ''} · {analysed} analysé{analysed > 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* Un lot = une carte */}
      {lots.length > 0 ? (
        lots.map(lot => {
          const lotDevis = devis.filter(d => d.lot_id === lot.id);
          const lotFrais = docs.filter(d => d.lot_id === lot.id && (d as any).depense_type === 'frais');
          return (
            <LotCard
              key={lot.id}
              lot={lot}
              devis={lotDevis}
              frais={lotFrais}
              onAddDevis={onAddDoc}
              chantierId={chantierId}
              token={token}
              onAnalysed={handleAnalysed}
            />
          );
        })
      ) : (
        /* Pas de lots définis : liste plate */
        <div className="space-y-3">
          {devis.map(doc => (
            <div key={doc.id} className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-center gap-4 shadow-sm">
              <FileText className="h-5 w-5 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{doc.nom}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(doc.created_at)}</p>
              </div>
              <DocScoreCell doc={doc} chantierId={chantierId ?? undefined} token={token} onAnalysed={handleAnalysed} />
            </div>
          ))}
        </div>
      )}

      {/* Devis non affectés */}
      <UnassignedCard
        docs={unassigned}
        chantierId={chantierId}
        token={token}
        onAnalysed={handleAnalysed}
      />

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        <a href="/nouvelle-analyse"
          className="flex items-center justify-center gap-2 flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-3 text-sm transition-colors">
          <Sparkles className="h-4 w-4" /> Analyser un nouveau devis
        </a>
        <button onClick={onAddDoc}
          className="flex items-center justify-center gap-2 flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-5 py-3 text-sm transition-colors">
          <Plus className="h-4 w-4" /> Importer un devis
        </button>
      </div>
    </div>
  );
}

export default AnalyseDevisSection;
