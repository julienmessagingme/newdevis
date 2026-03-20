import { useState, useEffect } from 'react';
import { Upload, ChevronRight, Plus, LayoutGrid, Calendar, FileText, FolderOpen, TrendingUp, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import type { ChantierIAResult, DocumentChantier, LotChantier, ProjectMode, StatutArtisan } from '@/types/chantier-ia';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtEuro(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)} k€`;
  return `${n} €`;
}

type NavItem = 'lots' | 'planning' | 'documents' | 'projet';

// ── Sous-composants ───────────────────────────────────────────────────────────

function LotInsight({ lot, docCount }: { lot: LotChantier; docCount: number }) {
  if (lot.statut === 'ok') {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
        <CheckCircle className="h-3.5 w-3.5" />
        Artisan sélectionné
      </span>
    );
  }
  if (lot.budget_avg_ht && lot.budget_max_ht) {
    const saving = Math.round(lot.budget_max_ht - lot.budget_avg_ht);
    if (saving > 500) {
      return (
        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <TrendingUp className="h-3.5 w-3.5" />
          Jusqu'à {fmtEuro(saving)} économisables
        </span>
      );
    }
  }
  if (lot.statut === 'a_contacter') {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-blue-700">
        <Clock className="h-3.5 w-3.5" />
        Devis à demander
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-gray-400">
      <AlertCircle className="h-3.5 w-3.5" />
      Artisan à trouver
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  result: ChantierIAResult;
  chantierId: string | null;
  token?: string | null;
  onLotStatutChange?: (lotId: string, statut: StatutArtisan) => void;
  onProjectModeChange?: (mode: ProjectMode) => void;
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function DashboardOrganised({ result, chantierId, token, onLotStatutChange, onProjectModeChange }: Props) {
  const [activeNav, setActiveNav] = useState<NavItem>('lots');
  const [documents, setDocuments] = useState<DocumentChantier[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [lots, setLots] = useState<LotChantier[]>(result.lots ?? []);

  const totalMin = lots.reduce((s, l) => s + (l.budget_min_ht ?? 0), 0);
  const totalMax = lots.reduce((s, l) => s + (l.budget_max_ht ?? 0), 0);
  const rangeMin = totalMin > 0 ? totalMin : Math.round(result.budgetTotal * 0.85);
  const rangeMax = totalMax > 0 ? totalMax : Math.round(result.budgetTotal * 1.20);

  // Chargement des documents
  useEffect(() => {
    if (!chantierId || !token) return;
    fetch(`/api/chantier/${chantierId}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { documents: [] })
      .then(d => setDocuments(d.documents ?? []))
      .catch(() => {});
  }, [chantierId, token]);

  // Compte de documents par lot
  const docsByLot: Record<string, DocumentChantier[]> = {};
  for (const doc of documents) {
    const key = doc.lot_id ?? '__none__';
    (docsByLot[key] ??= []).push(doc);
  }

  const selectedLot = lots.find(l => l.id === selectedLotId);

  const NAV_ITEMS: { id: NavItem; label: string; icon: React.ReactNode }[] = [
    { id: 'lots', label: 'Lots', icon: <LayoutGrid className="h-4 w-4" /> },
    { id: 'planning', label: 'Planning', icon: <Calendar className="h-4 w-4" /> },
    { id: 'documents', label: 'Documents', icon: <FileText className="h-4 w-4" /> },
    { id: 'projet', label: 'Projet', icon: <FolderOpen className="h-4 w-4" /> },
  ];

  function handleStatutChange(lot: LotChantier, statut: StatutArtisan) {
    setLots(prev => prev.map(l => l.id === lot.id ? { ...l, statut } : l));
    if (!lot.id.startsWith('fallback-') && onLotStatutChange) {
      onLotStatutChange(lot.id, statut);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8fc] flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="text-2xl">{result.emoji}</span>
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 text-base leading-tight truncate">{result.nom}</h1>
              <p className="text-sm text-gray-400 mt-0.5">{fmtEuro(rangeMin)} – {fmtEuro(rangeMax)}</p>
            </div>
          </div>
          {onProjectModeChange && (
            <button
              onClick={() => onProjectModeChange('guided')}
              className="text-xs text-gray-400 hover:text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Changer de mode
            </button>
          )}
          <button className="shrink-0 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-colors">
            <Upload className="h-4 w-4" />
            Importer mes devis
          </button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 max-w-5xl w-full mx-auto">

        {/* Sidebar navigation */}
        <aside className="w-52 shrink-0 py-6 px-4 space-y-1">
          {NAV_ITEMS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => { setActiveNav(id); setSelectedLotId(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors text-left ${
                activeNav === id
                  ? 'bg-blue-600 text-white font-medium shadow-sm shadow-blue-200'
                  : 'text-gray-500 hover:bg-white hover:text-gray-800 hover:shadow-sm'
              }`}
            >
              {icon}
              {label}
              {id === 'documents' && documents.length > 0 && (
                <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeNav === id ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {documents.length}
                </span>
              )}
            </button>
          ))}

          {/* Résumé rapide */}
          <div className="mx-2 mt-6 pt-5 border-t border-gray-100 space-y-3">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Lots</p>
              <p className="text-sm font-semibold text-gray-800">
                {lots.filter(l => l.statut === 'ok').length}/{lots.length} artisans
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Durée estimée</p>
              <p className="text-sm font-semibold text-gray-800">{result.dureeEstimeeMois} mois</p>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 py-6 pl-4 pr-6">

          {/* ── Vue: Lots ─────────────────────────────────────────────────── */}
          {activeNav === 'lots' && !selectedLotId && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-gray-900">Lots de travaux</h2>
                <span className="text-xs text-gray-400">{lots.length} lot{lots.length > 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {lots.map(lot => {
                  const lotDocs = docsByLot[lot.id] ?? [];
                  const devisCount = lotDocs.filter(d => d.document_type === 'devis').length;
                  const factureCount = lotDocs.filter(d => d.document_type === 'facture').length;
                  const photoCount = lotDocs.filter(d => d.document_type === 'photo').length;

                  return (
                    <div
                      key={lot.id}
                      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
                    >
                      <div className="p-5">
                        {/* Lot name + statut */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xl shrink-0">{lot.emoji ?? '🔧'}</span>
                            <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">{lot.nom}</h3>
                          </div>
                          <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                            lot.statut === 'ok'
                              ? 'bg-emerald-50 text-emerald-700'
                              : lot.statut === 'a_contacter'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-gray-100 text-gray-500'
                          }`}>
                            {lot.statut === 'ok' ? 'Artisan OK' : lot.statut === 'a_contacter' ? 'À contacter' : 'À trouver'}
                          </span>
                        </div>

                        {/* Budget fourchette */}
                        {(lot.budget_min_ht || lot.budget_max_ht) ? (
                          <p className="text-base font-bold text-gray-900 mb-3">
                            {fmtEuro(lot.budget_min_ht ?? 0)}
                            <span className="text-gray-300 mx-1">–</span>
                            {fmtEuro(lot.budget_max_ht ?? 0)}
                          </p>
                        ) : (
                          <p className="text-sm text-gray-400 mb-3">Budget à chiffrer</p>
                        )}

                        {/* Documents */}
                        <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
                          {devisCount > 0 && <span>{devisCount} devis</span>}
                          {factureCount > 0 && <span>{factureCount} facture{factureCount > 1 ? 's' : ''}</span>}
                          {photoCount > 0 && <span>{photoCount} photo{photoCount > 1 ? 's' : ''}</span>}
                          {lotDocs.length === 0 && <span className="text-gray-300">Aucun document</span>}
                        </div>

                        {/* Insight clé */}
                        <div className="py-3 border-t border-gray-50">
                          <LotInsight lot={lot} docCount={lotDocs.length} />
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex border-t border-gray-50">
                        <button
                          onClick={() => setSelectedLotId(lot.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          Voir détail
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <div className="w-px bg-gray-50" />
                        <button className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors">
                          <Plus className="h-3.5 w-3.5" />
                          Document
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Vue: Détail d'un lot ───────────────────────────────────────── */}
          {activeNav === 'lots' && selectedLotId && selectedLot && (
            <div>
              <button
                onClick={() => setSelectedLotId(null)}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-5 transition-colors"
              >
                ← Retour aux lots
              </button>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                {/* Header lot */}
                <div className="p-5 border-b border-gray-50">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{selectedLot.emoji ?? '🔧'}</span>
                    <div>
                      <h2 className="font-bold text-gray-900">{selectedLot.nom}</h2>
                      {(selectedLot.budget_min_ht || selectedLot.budget_max_ht) && (
                        <p className="text-sm text-gray-400">
                          {fmtEuro(selectedLot.budget_min_ht ?? 0)} – {fmtEuro(selectedLot.budget_max_ht ?? 0)}
                        </p>
                      )}
                    </div>
                    <div className="ml-auto">
                      <select
                        value={selectedLot.statut}
                        onChange={e => handleStatutChange(selectedLot, e.target.value as StatutArtisan)}
                        className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="a_trouver">À trouver</option>
                        <option value="a_contacter">À contacter</option>
                        <option value="ok">Artisan OK</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Devis */}
                {(() => {
                  const devis = (docsByLot[selectedLot.id] ?? []).filter(d => d.document_type === 'devis');
                  return devis.length > 0 ? (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-5 pt-4 pb-2">Devis</p>
                      <div className="divide-y divide-gray-50">
                        {devis.map(doc => (
                          <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
                            <FileText className="h-4 w-4 text-gray-300 shrink-0" />
                            <span className="flex-1 text-sm text-gray-700 truncate">{doc.nom}</span>
                            <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">
                              Importé
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Factures */}
                {(() => {
                  const factures = (docsByLot[selectedLot.id] ?? []).filter(d => d.document_type === 'facture');
                  return factures.length > 0 ? (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-5 pt-4 pb-2">Factures</p>
                      <div className="divide-y divide-gray-50">
                        {factures.map(doc => (
                          <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
                            <FileText className="h-4 w-4 text-gray-300 shrink-0" />
                            <span className="flex-1 text-sm text-gray-700 truncate">{doc.nom}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Photos */}
                {(() => {
                  const photos = (docsByLot[selectedLot.id] ?? []).filter(d => d.document_type === 'photo');
                  return photos.length > 0 ? (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-5 pt-4 pb-2">Photos</p>
                      <div className="grid grid-cols-3 gap-3 px-5 py-3">
                        {photos.map(doc => (
                          <div key={doc.id} className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                            {doc.signedUrl ? (
                              <img src={doc.signedUrl} alt={doc.nom} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">{doc.nom}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Empty state */}
                {(docsByLot[selectedLot.id] ?? []).length === 0 && (
                  <div className="px-5 py-10 text-center">
                    <p className="text-sm text-gray-400 mb-3">Aucun document pour ce lot</p>
                    <button className="flex items-center gap-2 mx-auto text-sm font-medium text-blue-600 hover:text-blue-700">
                      <Plus className="h-4 w-4" />
                      Ajouter un document
                    </button>
                  </div>
                )}

                {/* Ajouter */}
                <div className="p-5 border-t border-gray-50">
                  <button className="w-full flex items-center justify-center gap-2 border border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                    <Plus className="h-4 w-4" />
                    Ajouter un document
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Vue: Planning (simplifié) ──────────────────────────────────── */}
          {activeNav === 'planning' && (
            <div>
              <h2 className="font-semibold text-gray-900 mb-5">Planning du projet</h2>
              <div className="space-y-3">
                {result.roadmap.map((step, i) => (
                  <div
                    key={i}
                    className={`bg-white rounded-2xl border p-4 shadow-sm ${
                      step.isCurrent ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-100'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        step.isCurrent ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {step.numero}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className={`text-sm font-semibold ${step.isCurrent ? 'text-blue-700' : 'text-gray-800'}`}>
                            {step.nom}
                          </p>
                          {step.isCurrent && (
                            <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full">
                              En cours
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{step.detail}</p>
                      </div>
                      <span className="shrink-0 text-xs text-gray-400 font-medium">{step.mois}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Vue: Documents ─────────────────────────────────────────────── */}
          {activeNav === 'documents' && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-gray-900">Documents</h2>
                <button className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
                  <Plus className="h-4 w-4" />
                  Ajouter
                </button>
              </div>
              {documents.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
                  <FileText className="h-8 w-8 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-500 mb-1">Aucun document importé</p>
                  <p className="text-xs text-gray-400">Importez vos devis, factures et photos</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 px-5 py-3.5">
                      <FileText className="h-4 w-4 text-gray-300 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate">{doc.nom}</p>
                        <p className="text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full capitalize">
                        {doc.document_type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Vue: Projet ────────────────────────────────────────────────── */}
          {activeNav === 'projet' && (
            <div className="space-y-4">
              <h2 className="font-semibold text-gray-900">Récapitulatif du projet</h2>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Budget total', value: `${fmtEuro(rangeMin)} – ${fmtEuro(rangeMax)}`, color: 'text-blue-700', bg: 'bg-blue-50' },
                  { label: 'Durée estimée', value: `${result.dureeEstimeeMois} mois`, color: 'text-violet-700', bg: 'bg-violet-50' },
                  { label: 'Artisans', value: `${result.artisans.length} corps de métier`, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`${bg} rounded-2xl p-4`}>
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className={`text-sm font-bold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-sm font-semibold text-gray-900 mb-3">Répartition du budget</p>
                <div className="space-y-2">
                  {result.lignesBudget.map((l, i) => {
                    const pct = result.budgetTotal > 0 ? (l.montant / result.budgetTotal) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.couleur }} />
                        <span className="text-xs text-gray-600 flex-1 truncate">{l.label}</span>
                        <span className="text-xs text-gray-400 shrink-0">{fmtEuro(l.montant)}</span>
                        <div className="w-24 h-1.5 bg-gray-100 rounded-full shrink-0 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: l.couleur }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
