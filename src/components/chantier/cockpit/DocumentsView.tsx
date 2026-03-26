import { useState, useEffect } from 'react';
import { FileText, FolderOpen, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DocumentChantier, DocumentType, LotChantier } from '@/types/chantier-ia';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<DocumentType, string> = {
  devis: 'Devis', facture: 'Facture', photo: 'Photo',
  plan: 'Plan', autorisation: 'Autorisation', assurance: 'Assurance', autre: 'Autre',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function DocumentsView({ documents, lots: lotsProp, chantierId, token, onAddDoc, onDeleteDoc, onDocUpdated, onDocLotUpdated, onDocNomUpdated, pendingDescribeIds = [] }: {
  documents: DocumentChantier[]; lots: LotChantier[];
  chantierId: string; token: string;
  onDocLotUpdated?: (docId: string, lotId: string | null) => void;
  onDocNomUpdated?: (docId: string, nom: string) => void;
  onAddDoc: () => void; onDeleteDoc: (id: string) => void; onDocUpdated: () => void;
  pendingDescribeIds?: string[];
}) {
  const byType: Record<DocumentType, DocumentChantier[]> = {} as never;
  for (const doc of documents) (byType[doc.document_type] ??= []).push(doc);
  const typesWithDocs = Object.entries(byType).filter(([, docs]) => docs.length > 0);

  // ── Renommage inline ─────────────────────────────────────────────────────────
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingId, setSavingId]       = useState<string | null>(null);

  async function saveRename(docId: string) {
    const trimmed = editingName.trim();
    if (!trimmed || savingId === docId) return;
    setSavingId(docId);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${docId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: trimmed }),
      });
      if (res.ok) {
        onDocNomUpdated?.(docId, trimmed);
      } else {
        toast.error('Impossible de renommer le document');
      }
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setSavingId(null);
      setEditingId(null);
    }
  }

  // Lots réels fetchés depuis la DB (garantit la cohérence avec la validation PATCH)
  const [dbLots, setDbLots] = useState<LotChantier[]>([]);
  useEffect(() => {
    if (!chantierId || !token) return;
    fetch(`/api/chantier/${chantierId}/lots`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.lots) setDbLots(d.lots); })
      .catch(() => {});
  }, [chantierId, token]);

  // Fallback sur les lots de la prop si l'API n'a pas encore répondu
  const realLots = dbLots.length > 0
    ? dbLots
    : lotsProp.filter(l => !l.id.startsWith('fallback-'));

  // Optimistic update : map docId → lotId pour affichage immédiat
  const [lotOverrides, setLotOverrides] = useState<Record<string, string | null>>({});

  async function handleChangeLot(docId: string, lotId: string | null) {
    // Mise à jour visuelle immédiate (optimiste)
    setLotOverrides(prev => ({ ...prev, [docId]: lotId }));
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${docId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotId }),
      });
      if (res.ok) {
        // Mise à jour directe de la ligne dans le state parent (pas de reload complet)
        // On conserve l'override — source de vérité jusqu'au prochain rechargement
        onDocLotUpdated?.(docId, lotId);
      } else {
        const { error } = await res.json().catch(() => ({ error: 'Erreur inconnue' }));
        toast.error(`Impossible d'affecter l'intervenant : ${error}`);
        // Rollback visuel
        setLotOverrides(prev => { const n = { ...prev }; delete n[docId]; return n; });
      }
    } catch {
      toast.error("Erreur réseau — réessayez");
      setLotOverrides(prev => { const n = { ...prev }; delete n[docId]; return n; });
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-7">
      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen className="h-10 w-10 text-gray-200 mx-auto mb-4" />
          <p className="font-bold text-gray-900 mb-1">Aucun document</p>
          <p className="text-sm text-gray-400 mb-6">Importez vos devis, factures et photos de chantier</p>
          <button onClick={onAddDoc} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
            <Plus className="h-4 w-4" /> Ajouter un document
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {typesWithDocs.map(([type, docs]) => (
            <div key={type} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                <p className="font-semibold text-gray-900 text-sm">{TYPE_LABELS[type as DocumentType]} ({docs.length})</p>
              </div>
              <div className="divide-y divide-gray-50">
                {docs.map(doc => {
                  const effectiveLotId = lotOverrides[doc.id] !== undefined ? lotOverrides[doc.id] : doc.lot_id;
                  const lot = realLots.find(l => l.id === effectiveLotId);
                  const isEditing  = editingId === doc.id;
                  const isSaving   = savingId === doc.id;
                  const isDescribing = pendingDescribeIds.includes(doc.id);
                  return (
                    <div key={doc.id} className="flex items-center gap-3 px-5 py-4 group">
                      {/* Icône type */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        doc.document_type === 'photo' ? 'bg-purple-50' : 'bg-gray-50'
                      }`}>
                        {doc.document_type === 'photo'
                          ? <span className="text-base">📷</span>
                          : <FileText className="h-4 w-4 text-gray-400" />}
                      </div>

                      {/* Nom — éditable inline */}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={editingName}
                              onChange={e => setEditingName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveRename(doc.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              onBlur={() => saveRename(doc.id)}
                              className="flex-1 min-w-0 text-sm font-medium text-gray-900 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-300"
                            />
                            {isSaving && <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group/name">
                            {isDescribing ? (
                              <span className="flex items-center gap-1.5 text-sm text-blue-500 italic">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                IA en cours…
                              </span>
                            ) : (
                              <p
                                className="text-sm font-medium text-gray-800 truncate cursor-pointer hover:text-blue-600 transition-colors"
                                title="Cliquer pour renommer"
                                onClick={() => { setEditingId(doc.id); setEditingName(doc.nom); }}
                              >
                                {doc.nom}
                              </p>
                            )}
                            {!isDescribing && (
                              <button
                                onClick={() => { setEditingId(doc.id); setEditingName(doc.nom); }}
                                className="opacity-0 group-hover/name:opacity-100 transition-opacity p-0.5 rounded text-gray-300 hover:text-blue-500"
                                title="Renommer"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDate(doc.created_at)}</p>
                      </div>

                      {/* Sélecteur intervenant — lots réels uniquement */}
                      {(doc.document_type === 'devis' || doc.document_type === 'facture') && realLots.length > 0 && (
                        <select
                          value={effectiveLotId ?? ''}
                          onChange={e => handleChangeLot(doc.id, e.target.value || null)}
                          className={`text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 max-w-[160px] truncate ${
                            lot ? 'border-purple-200 text-purple-700 font-medium' : 'border-gray-200 text-gray-400'
                          }`}
                        >
                          <option value="">Aucun intervenant</option>
                          {realLots.map(l => <option key={l.id} value={l.id}>{l.emoji} {l.nom}</option>)}
                        </select>
                      )}

                      {doc.signedUrl && !isEditing && (
                        <a href={doc.signedUrl} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          Ouvrir
                        </a>
                      )}
                      {!isEditing && (
                        <button onClick={() => onDeleteDoc(doc.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <button onClick={onAddDoc}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl py-4 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all">
            <Plus className="h-4 w-4" /> Ajouter un document
          </button>
        </div>
      )}
    </div>
  );
}
