import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Upload, Trash2, Download, X, Loader2,
  Sparkles, AlertCircle, FolderOpen, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import type { DocumentChantier, DocumentType, LotChantier } from '@/types/chantier-ia';

// ── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL     = import.meta.env.PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON    = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;
const BUCKET           = 'chantier-documents';
const MAX_SIZE_BYTES   = 10 * 1024 * 1024; // 10 Mo — cohérent avec bucket + serveur
const ACCEPTED_TYPES   = '.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.docx,.xlsx,.xls,.doc';

const DOC_TYPES: { value: DocumentType; label: string; emoji: string }[] = [
  { value: 'devis',        label: 'Devis',          emoji: '📋' },
  { value: 'facture',      label: 'Facture',         emoji: '💰' },
  { value: 'photo',        label: 'Photo',           emoji: '📸' },
  { value: 'plan',         label: 'Plan',            emoji: '📐' },
  { value: 'autorisation', label: 'Autorisation',    emoji: '🏛️' },
  { value: 'assurance',    label: 'Assurance',       emoji: '🛡️' },
  { value: 'autre',        label: 'Autre document',  emoji: '📄' },
];

// ── Utilities ────────────────────────────────────────────────────────────────

function getFileExt(file: File): string {
  const parts = file.name.split('.');
  return parts.length > 1 ? `.${parts.pop()!.toLowerCase()}` : '';
}

function inferDocType(file: File): DocumentType {
  if (file.type.startsWith('image/')) return 'photo';
  const n = file.name.toLowerCase();
  if (n.includes('devis')) return 'devis';
  if (n.includes('facture') || n.includes('invoice')) return 'facture';
  if (n.includes('plan') || n.includes('blueprint')) return 'plan';
  if (n.includes('assurance') || n.includes('insurance')) return 'assurance';
  if (n.includes('permis') || n.includes('autorisation')) return 'autorisation';
  return 'autre';
}

function formatBytes(b: number | null | undefined): string {
  if (!b) return '';
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} Ko`;
  return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function typeInfo(type: DocumentType) {
  return DOC_TYPES.find((d) => d.value === type) ?? DOC_TYPES[DOC_TYPES.length - 1];
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  chantierId: string;
  userId: string;   // extrait de la session dans ChantierDetail, sert à construire le bucket path
  token: string;
  lots: LotChantier[];
}

export default function DocumentsSection({ chantierId, userId, token, lots }: Props) {
  const [docs, setDocs] = useState<DocumentChantier[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload form
  const [pendingFile, setPendingFile]   = useState<File | null>(null);
  const [uploadType, setUploadType]     = useState<DocumentType>('autre');
  const [uploadNom, setUploadNom]       = useState('');
  const [uploadLotId, setUploadLotId]   = useState('');
  const [uploading, setUploading]       = useState(false);

  // UI
  const [isDragging, setIsDragging]         = useState(false);
  const [confirmDeleteId, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting]             = useState(false);
  // Lot 6 : lance l'analyse depuis Mon Chantier — verrouille le bouton pendant le lancement
  const [analyzingId, setAnalyzingId]       = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDocs(data.documents ?? []);
    } catch {
      toast.error('Impossible de charger les documents', { duration: 2500 });
    } finally {
      setLoading(false);
    }
  }, [chantierId, token]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // ── File selection ────────────────────────────────────────────────────────

  const handleFileSelect = (file: File) => {
    if (file.size > MAX_SIZE_BYTES) {
      toast.error('Fichier trop volumineux — 10 Mo maximum', { duration: 3000 });
      return;
    }
    setPendingFile(file);
    setUploadType(inferDocType(file));
    setUploadNom(file.name.replace(/\.[^/.]+$/, ''));
    setUploadLotId('');
  };

  const cancelUpload = () => {
    setPendingFile(null);
    setUploadNom('');
    setUploadType('autre');
    setUploadLotId('');
  };

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!pendingFile || !uploadNom.trim() || uploading || !chantierId || !userId || !token) return;
    setUploading(true);

    const ext        = getFileExt(pendingFile);
    const uuid       = crypto.randomUUID();
    const bucketPath = `${userId}/${chantierId}/${uuid}${ext}`;

    try {
      // 1. Upload direct vers Supabase Storage avec le token user (RLS policy appliquée)
      const storageClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth:   { persistSession: false },
      });

      const { error: uploadErr } = await storageClient.storage
        .from(BUCKET)
        .upload(bucketPath, pendingFile, { contentType: pendingFile.type || 'application/octet-stream', upsert: false });

      if (uploadErr) throw new Error(`Storage: ${uploadErr.message}`);

      // 2. Enregistrement métadonnées en DB (avec 2e validation taille côté serveur)
      const res = await fetch(`/api/chantier/${chantierId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bucketPath,
          nom:          uploadNom.trim(),
          nomFichier:   pendingFile.name,
          documentType: uploadType,
          lotId:        uploadLotId || null,
          tailleOctets: pendingFile.size,
          mimeType:     pendingFile.type || null,
        }),
      });

      if (!res.ok) {
        // Rollback storage si la DB échoue
        await storageClient.storage.from(BUCKET).remove([bucketPath]);
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setDocs((prev) => [data.document, ...prev]);
      cancelUpload();
      toast.success('Document ajouté', { duration: 2000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[DocumentsSection] upload error:', msg);
      toast.error(`Erreur upload : ${msg}`, { duration: 8000 });
    } finally {
      setUploading(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (docId: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Erreur');
      }
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      setConfirmDelete(null);
      toast.success('Document supprimé', { duration: 2000 });
    } catch (e) {
      console.error('[DocumentsSection] delete error:', e instanceof Error ? e.message : String(e));
      toast.error('Impossible de supprimer le document', { duration: 2500 });
    } finally {
      setDeleting(false);
    }
  };

  // ── Lot update ────────────────────────────────────────────────────────────

  const handleUpdateLot = async (docId: string, lotId: string | null) => {
    // Optimistic UI
    setDocs((prev) => prev.map((d) => d.id === docId ? { ...d, lot_id: lotId } : d));
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lotId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revert optimistic update
      fetchDocs();
      toast.error('Impossible de mettre à jour le lot', { duration: 2500 });
    }
  };

  // ── Download ──────────────────────────────────────────────────────────────

  const handleDownload = async (doc: DocumentChantier) => {
    if (doc.signedUrl) {
      window.open(doc.signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    // URL expirée — en recharger une fraîche
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${doc.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Impossible de télécharger le document', { duration: 2500 });
    }
  };

  // ── Analyser un devis (lot 6) ─────────────────────────────────────────────
  // Lance le pipeline analyze-quote via l'API route dédiée.
  // Idempotent côté API (409 si analyse_id déjà défini).
  // Rollback complet côté serveur si une étape intermédiaire échoue.

  const handleAnalyser = async (doc: DocumentChantier) => {
    setAnalyzingId(doc.id);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${doc.id}/analyser`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 409) {
        // Analyse déjà lancée (race condition ou double clic) → redirige vers l'existante
        const data = await res.json().catch(() => ({}));
        const existingId = (data as { analysisId?: string }).analysisId;
        if (existingId) {
          window.location.href = `/analyse/${existingId}`;
          return;
        }
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      const { analysisId } = data as { analysisId: string };

      // Mise à jour locale immédiate pour afficher le badge "Voir l'analyse"
      setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, analyse_id: analysisId } : d));

      window.location.href = `/analyse/${analysisId}`;
    } catch (e) {
      console.error('[DocumentsSection] analyser error:', e instanceof Error ? e.message : String(e));
      toast.error("Erreur lors du lancement de l'analyse", { duration: 3000 });
      setAnalyzingId(null); // Réactive le bouton — on ne reset pas en cas de redirect
    }
  };

  // Lots persistés seulement (exclure les fallbacks read-only)
  const persistedLots = lots.filter((l) => !l.id.startsWith('fallback-'));

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 text-slate-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Drop zone (masquée quand un fichier est sélectionné) ── */}
      {!pendingFile && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-blue-500/60 bg-blue-500/[0.08]'
              : 'border-white/[0.10] bg-white/[0.02] hover:border-white/[0.18] hover:bg-white/[0.04]'
          }`}
        >
          <Upload className="h-5 w-5 text-slate-500 mx-auto mb-2" />
          <p className="text-slate-300 text-sm font-medium">Déposer un fichier ici</p>
          <p className="text-slate-600 text-xs mt-0.5">ou cliquer pour parcourir · PDF, images, documents — max 10 Mo</p>
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept={ACCEPTED_TYPES}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
          />
        </div>
      )}

      {/* ── Formulaire upload inline ── */}
      {pendingFile && (
        <div className="bg-[#0d1525] border border-blue-500/25 rounded-2xl p-4">
          {/* Fichier sélectionné */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Upload className="h-4 w-4 text-blue-400 shrink-0" />
              <span className="text-sm text-slate-300 truncate">{pendingFile.name}</span>
              <span className="text-xs text-slate-600 shrink-0">{formatBytes(pendingFile.size)}</span>
            </div>
            <button onClick={cancelUpload} disabled={uploading} className="text-slate-600 hover:text-slate-400 transition-colors shrink-0 ml-2">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Champs */}
          <div className={`grid gap-2 mb-3 ${persistedLots.length > 0 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Type</label>
              <select
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value as DocumentType)}
                className="w-full bg-white/[0.05] border border-white/[0.08] text-white text-xs rounded-lg px-2.5 py-2 appearance-none outline-none focus:border-blue-500/50"
              >
                {DOC_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>{d.emoji} {d.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-500 mb-1 block">Nom</label>
              <input
                type="text"
                value={uploadNom}
                onChange={(e) => setUploadNom(e.target.value)}
                placeholder="Nom du document"
                className="w-full bg-white/[0.05] border border-white/[0.08] text-white text-xs rounded-lg px-2.5 py-2 outline-none focus:border-blue-500/50 placeholder:text-slate-600"
              />
            </div>

            {persistedLots.length > 0 && (
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Lot (optionnel)</label>
                <select
                  value={uploadLotId}
                  onChange={(e) => setUploadLotId(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] text-white text-xs rounded-lg px-2.5 py-2 appearance-none outline-none focus:border-blue-500/50"
                >
                  <option value="">— Aucun lot —</option>
                  {persistedLots.map((l) => (
                    <option key={l.id} value={l.id}>{l.emoji ?? ''} {l.nom}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={cancelUpload}
              disabled={uploading}
              className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50 transition-colors px-3 py-1.5"
            >
              Annuler
            </button>
            <button
              onClick={handleUpload}
              disabled={!uploadNom.trim() || uploading || !chantierId || !userId || !token}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg px-3 py-1.5 transition-all"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? 'Envoi en cours…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {/* ── État vide ── */}
      {docs.length === 0 && !pendingFile && (
        <div className="text-center py-8">
          <FolderOpen className="h-8 w-8 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Aucun document pour l'instant.</p>
          <p className="text-slate-700 text-xs mt-0.5">Déposez votre premier fichier ci-dessus.</p>
        </div>
      )}

      {/* ── Liste des documents ── */}
      {docs.length > 0 && (
        <div className="space-y-2">
          {docs.map((doc) => {
            const info          = typeInfo(doc.document_type);
            const attachedLot   = persistedLots.find((l) => l.id === doc.lot_id);
            const isDelConfirm  = confirmDeleteId === doc.id;

            return (
              <div key={doc.id} className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0 mt-0.5">{info.emoji}</span>

                  <div className="flex-1 min-w-0">
                    {/* Nom + actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{doc.nom}</p>
                        <p className="text-slate-600 text-xs mt-0.5">
                          {formatDate(doc.created_at)}
                          {doc.taille_octets ? ` · ${formatBytes(doc.taille_octets)}` : ''}
                          {doc.mime_type ? ` · ${doc.mime_type.split('/').pop()?.toUpperCase()}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleDownload(doc)}
                          className="p-1.5 text-slate-500 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-all"
                          title="Télécharger"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(doc.id)}
                          className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                          title="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Lot rattaché (sélecteur inline) */}
                    {persistedLots.length > 0 && (
                      <div className="mt-2">
                        <select
                          value={doc.lot_id ?? ''}
                          onChange={(e) => handleUpdateLot(doc.id, e.target.value || null)}
                          className="bg-white/[0.04] border border-white/[0.06] text-slate-500 text-xs rounded-lg px-2 py-1 appearance-none outline-none hover:border-white/[0.12] transition-colors max-w-[220px]"
                        >
                          <option value="">— Sans lot —</option>
                          {persistedLots.map((l) => (
                            <option key={l.id} value={l.id}>{l.emoji ?? ''} {l.nom}</option>
                          ))}
                        </select>
                        {attachedLot && (
                          <span className="ml-2 text-xs text-slate-500">
                            {attachedLot.emoji} {attachedLot.nom}
                          </span>
                        )}
                      </div>
                    )}

                    {/* CTA analyse devis — lot 6
                        3 états : à lancer / en cours / déjà analysé */}
                    {doc.document_type === 'devis' && (
                      doc.analyse_id ? (
                        // État : analyse existante — lien vers le résultat
                        <a
                          href={`/analyse/${doc.analyse_id}`}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300 rounded-lg px-2.5 py-1.5 font-medium transition-all"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Voir l'analyse
                        </a>
                      ) : analyzingId === doc.id ? (
                        // État : lancement en cours — bouton désactivé
                        <span className="mt-2 inline-flex items-center gap-1.5 text-xs bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg px-2.5 py-1.5 font-medium opacity-70 cursor-not-allowed">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Lancement en cours…
                        </span>
                      ) : (
                        // État : pas encore analysé — bouton actif
                        <button
                          onClick={() => handleAnalyser(doc)}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300 rounded-lg px-2.5 py-1.5 font-medium transition-all"
                        >
                          <Sparkles className="h-3 w-3" />
                          Analyser ce devis
                        </button>
                      )
                    )}

                    {/* Confirmation suppression inline */}
                    {isDelConfirm && (
                      <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-3 flex-wrap">
                        <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                        <span className="text-xs text-slate-400 flex-1 min-w-0">Supprimer définitivement ce document ?</span>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          disabled={deleting}
                          className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors disabled:opacity-50"
                        >
                          {deleting ? 'Suppression…' : 'Confirmer'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
