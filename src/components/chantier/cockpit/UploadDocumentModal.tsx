import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  X, Loader2, CheckCircle2, AlertCircle, CloudUpload, FileText,
  Sparkles, ChevronRight, Plus,
} from 'lucide-react';
import type { DocumentChantier, DocumentType, LotChantier } from '@/types/chantier-ia';

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)} k€`;
  return `${n} €`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<DocumentType, string> = {
  devis: 'Devis', facture: 'Facture', photo: 'Photo',
  plan: 'Plan', autorisation: 'Autorisation', assurance: 'Assurance', autre: 'Autre',
};

const FEMININE_TYPES: Set<DocumentType> = new Set(['facture', 'photo', 'autorisation', 'assurance']);

type UploadState = 'idle' | 'uploading' | 'analyzing' | 'success' | 'error';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface UploadDocumentModalProps {
  chantierId: string;
  token: string;
  lots: LotChantier[];
  defaultLotId?: string | null;
  defaultType?: DocumentType;
  onClose: () => void;
  onSuccess: (doc: DocumentChantier) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UploadDocumentModal({
  chantierId, token, lots, defaultLotId, defaultType, onClose, onSuccess,
}: UploadDocumentModalProps) {
  const [tab, setTab]                   = useState<'file' | 'import'>('file');
  const [dragging, setDragging]         = useState(false);
  const [file, setFile]                 = useState<File | null>(null);
  const [docName, setDocName]           = useState('');
  const [docType, setDocType]           = useState<DocumentType>(defaultType ?? 'devis');
  const [lotId, setLotId]               = useState(defaultLotId || '');
  const [newLotName, setNewLotName]     = useState('');
  const [uploadState, setUploadState]   = useState<UploadState>('idle');
  const [errorMsg, setErrorMsg]         = useState('');
  const [savingsAmount, setSavingsAmount] = useState(0);
  const [analyses, setAnalyses]         = useState<{
    id: string; created_at: string; titre: string;
    artisanNom: string | null; totalTtc: number | null; dateDevis: string | null;
  }[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab !== 'import') return;
    setLoadingAnalyses(true);
    supabase.from('analyses').select('id, created_at, raw_text').eq('status', 'completed')
      .order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => {
        setAnalyses((data ?? []).map(a => {
          let parsed: Record<string, any> = {};
          try {
            parsed = typeof a.raw_text === 'string' ? JSON.parse(a.raw_text) : (a.raw_text ?? {});
          } catch {}
          // raw_text structure : { extracted: { entreprise, totaux, dates, context, ... }, verified, scoring, ... }
          const extracted   = parsed?.extracted ?? parsed; // rétrocompat si structure plate
          const artisanNom  = extracted?.entreprise?.nom ?? null;
          const totalTtc    = extracted?.totaux?.ttc ?? null;
          const dateDevis   = extracted?.dates?.date_devis ?? null;
          const typeChantier = extracted?.context?.type_chantier ?? null;
          const titre = artisanNom
            ? artisanNom
            : typeChantier ?? `Analyse du ${fmtDate(a.created_at)}`;
          return { id: a.id, created_at: a.created_at, titre, artisanNom, totalTtc, dateDevis };
        }));
      }).finally(() => setLoadingAnalyses(false));
  }, [tab]);

  function handleFile(f: File) {
    setFile(f); setDocName(f.name.replace(/\.[^.]+$/, ''));
    const lower = f.name.toLowerCase();
    if (lower.includes('devis') || lower.includes('quote')) setDocType('devis');
    else if (lower.includes('facture') || lower.includes('invoice')) setDocType('facture');
    else if (/\.(jpg|jpeg|png|webp|heic)$/i.test(f.name)) setDocType('photo');
  }

  async function handleUpload() {
    if (!file || !docName.trim()) return;
    setUploadState('uploading'); setErrorMsg('');
    try {
      // Toujours récupérer un token frais pour éviter les 401 sur token expiré
      const { data: { session } } = await supabase.auth.getSession();
      const freshToken = session?.access_token ?? token;
      if (!freshToken) {
        setErrorMsg('Session expirée — rechargez la page');
        setUploadState('error');
        return;
      }

      // ── Étape 1 : obtenir une URL signée pour l'upload direct (bypass Vercel 4.5 Mo) ──
      const urlRes = await fetch(`/api/chantier/${chantierId}/upload-url`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${freshToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name }),
      });
      if (!urlRes.ok) {
        const { error } = await urlRes.json().catch(() => ({ error: `Erreur ${urlRes.status}` }));
        setErrorMsg(error ?? `Erreur ${urlRes.status}`);
        setUploadState('error');
        return;
      }
      const { signedUrl, bucketPath } = await urlRes.json();

      // ── Étape 2 : upload direct navigateur → Supabase Storage (pas via Vercel) ──
      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!putRes.ok) {
        setErrorMsg(`Erreur upload fichier (${putRes.status})`);
        setUploadState('error');
        return;
      }

      // ── Étape 2b : créer un nouveau lot si demandé ──
      let finalLotId = lotId;
      if (lotId === '__new__' && newLotName.trim()) {
        const lotRes = await fetch(`/api/chantier/${chantierId}/lots`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${freshToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ nom: newLotName.trim(), budget_min_ht: 0, budget_avg_ht: 0, budget_max_ht: 0 }),
        });
        if (lotRes.ok) {
          const lotData = await lotRes.json();
          finalLotId = lotData.lot?.id ?? lotData.id ?? '';
        } else {
          finalLotId = '';  // Fallback: pas de lot
        }
      } else if (lotId === '__new__') {
        finalLotId = '';  // User selected "new" but didn't type a name
      }

      // ── Étape 3 : enregistrer les métadonnées en base ──
      const regRes = await fetch(`/api/chantier/${chantierId}/documents/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${freshToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: docName.trim(),
          documentType: docType,
          lotId: finalLotId || null,   // '' → null pour éviter erreur UUID PostgreSQL
          bucketPath,
          nomFichier: file.name,
          mimeType: file.type || null,
          tailleOctets: file.size || null,
        }),
      });
      const rawText = await regRes.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(rawText); } catch { /* non-JSON */ }
      if (!regRes.ok) { setErrorMsg((data.error as string) ?? `Erreur ${regRes.status}`); setUploadState('error'); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc: DocumentChantier = data.document as DocumentChantier;
      if (docType === 'devis') {
        setUploadState('analyzing');
        try {
          const aRes = await fetch(`/api/chantier/${chantierId}/documents/${doc.id}/analyser`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
          });
          if (aRes.ok) {
            const aData = await aRes.json().catch(() => ({}));
            setSavingsAmount(aData?.result?.economics?.savings ?? 0);
            // Mettre à jour l'analyse_id sur le doc AVANT onSuccess
            if (aData.analysisId) (doc as unknown as Record<string, unknown>).analyse_id = aData.analysisId;
          } else { setSavingsAmount(0); }
        } catch { setSavingsAmount(0); }
      } else { setSavingsAmount(0); }
      setUploadState('success');
      onSuccess(doc);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur réseau.');
      setUploadState('error');
    }
  }

  async function handleImportAnalyse(analyseId: string, titre: string) {
    setUploadState('uploading');
    try {
      const fd = new FormData();
      fd.append('nom', titre); fd.append('documentType', 'devis');
      fd.append('source', 'verifier_mon_devis'); fd.append('analyseId', analyseId);
      if (lotId) fd.append('lotId', lotId);
      const res = await fetch(`/api/chantier/${chantierId}/documents`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(rawText); } catch { /* non-JSON */ }
      if (!res.ok) { setErrorMsg((data.error as string) ?? `Erreur ${res.status}`); setUploadState('error'); return; }
      setSavingsAmount(0); setUploadState('success'); onSuccess(data.document as DocumentChantier);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur réseau.');
      setUploadState('error');
    }
  }

  const isUploading = uploadState === 'uploading' || uploadState === 'analyzing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={!isUploading ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Ajouter un document</h2>
          {!isUploading && (
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <X className="h-4 w-4 text-gray-500" />
            </button>
          )}
        </div>
        {uploadState === 'uploading' && (
          <div className="px-6 py-12 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Loader2 className="h-7 w-7 text-blue-600 animate-spin" />
            </div>
            <p className="font-semibold text-gray-900">Téléversement en cours…</p>
            <p className="text-sm text-gray-400">Ne fermez pas cette fenêtre</p>
          </div>
        )}
        {uploadState === 'analyzing' && (
          <div className="px-6 py-12 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-violet-600 animate-pulse" />
            </div>
            <p className="font-semibold text-gray-900">Analyse IA en cours…</p>
            <p className="text-sm text-gray-400">Détection des surcoûts et économies</p>
          </div>
        )}
        {uploadState === 'success' && (
          <div className="px-6 py-8 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="font-bold text-gray-900 text-lg">
              {docType === 'devis' ? '✔ Devis analysé' : `${TYPE_LABELS[docType]} ajouté${FEMININE_TYPES.has(docType) ? 'e' : ''} ✓`}
            </p>
            {savingsAmount > 0 && (
              <div className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-4">
                <p className="text-3xl font-extrabold text-emerald-600">+{fmtK(savingsAmount)}</p>
                <p className="text-xs font-medium text-emerald-600 mt-1">détectés vs prix du marché 🎉</p>
              </div>
            )}
            <div className="flex flex-col gap-2 w-full">
              <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 text-sm transition-colors">Parfait</button>
              {docType === 'devis' && (
                <button onClick={() => { setFile(null); setDocName(''); setSavingsAmount(0); setUploadState('idle'); }}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 py-2">
                  Ajouter un autre devis pour comparer →
                </button>
              )}
            </div>
          </div>
        )}
        {uploadState === 'error' && (
          <div className="px-6 py-10 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <p className="font-semibold text-gray-900">Erreur</p>
            <p className="text-sm text-red-600">{errorMsg}</p>
            <button onClick={() => setUploadState('idle')} className="text-sm font-medium text-blue-600">Réessayer</button>
          </div>
        )}
        {uploadState === 'idle' && (
          <div className="px-6 py-5">
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
              {[{ id: 'file' as const, label: 'Importer un fichier' }, { id: 'import' as const, label: 'Depuis VerifierMonDevis' }].map(({ id, label }) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>
            {tab === 'file' && (
              <div className="space-y-4">
                <div
                  onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onClick={() => inputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${dragging ? 'border-blue-400 bg-blue-50' : file ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}>
                  <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                  {file ? (
                    <><CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" /><p className="font-semibold text-emerald-800 text-sm">{file.name}</p></>
                  ) : (
                    <><CloudUpload className="h-8 w-8 text-gray-300 mx-auto mb-2" /><p className="text-sm font-medium text-gray-700">Glissez votre fichier ici</p><p className="text-xs text-gray-400 mt-1">ou cliquez pour parcourir</p></>
                  )}
                </div>
                {file && (
                  <div className="space-y-3">
                    <input value={docName} onChange={e => setDocName(e.target.value)} placeholder="Nom du document"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
                    <div className="grid grid-cols-2 gap-3">
                      <select value={docType} onChange={e => setDocType(e.target.value as DocumentType)}
                        className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100">
                        {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <select value={lotId} onChange={e => { setLotId(e.target.value); if (e.target.value !== '__new__') setNewLotName(''); }}
                        className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100">
                        <option value="">— Aucun lot —</option>
                        {lots.filter(l => !l.id.startsWith('fallback-')).map(l => <option key={l.id} value={l.id}>{l.emoji ?? '🔧'} {l.nom}</option>)}
                        <option value="__new__">+ Nouveau lot</option>
                      </select>
                    </div>
                    {lotId === '__new__' && (
                      <div className="flex items-center gap-2">
                        <Plus className="h-4 w-4 text-blue-400 shrink-0" />
                        <input value={newLotName} onChange={e => setNewLotName(e.target.value)} placeholder="Nom du nouveau lot"
                          className="flex-1 border border-blue-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                          autoFocus />
                      </div>
                    )}
                  </div>
                )}
                <button onClick={handleUpload} disabled={!file || !docName.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white font-semibold rounded-xl py-3 text-sm transition-colors">
                  Importer
                </button>
              </div>
            )}
            {tab === 'import' && (
              <div className="space-y-3">
                <select value={lotId} onChange={e => { setLotId(e.target.value); if (e.target.value !== '__new__') setNewLotName(''); }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 mb-1">
                  <option value="">— Aucun lot —</option>
                  {lots.filter(l => !l.id.startsWith('fallback-')).map(l => <option key={l.id} value={l.id}>{l.emoji ?? '🔧'} {l.nom}</option>)}
                  <option value="__new__">+ Nouveau lot</option>
                </select>
                {lotId === '__new__' && (
                  <div className="flex items-center gap-2 mb-1">
                    <Plus className="h-4 w-4 text-blue-400 shrink-0" />
                    <input value={newLotName} onChange={e => setNewLotName(e.target.value)} placeholder="Nom du nouveau lot"
                      className="flex-1 border border-blue-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                      autoFocus />
                  </div>
                )}
                {loadingAnalyses ? (
                  <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 text-gray-300 animate-spin" /></div>
                ) : analyses.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-400 mb-2">Aucune analyse disponible</p>
                    <a href="/nouvelle-analyse" className="text-sm font-medium text-blue-600">Analyser un devis →</a>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 border border-gray-100 rounded-2xl overflow-hidden max-h-80 overflow-y-auto">
                    {analyses.map(a => (
                      <button key={a.id}
                        onClick={() => handleImportAnalyse(a.id, a.titre ?? fmtDate(a.created_at))}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-blue-50 transition-colors text-left group">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                          <FileText className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* Nom artisan */}
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {a.artisanNom ?? '—'}
                          </p>
                          {/* Montant TTC + date */}
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {a.totalTtc != null && a.totalTtc > 0 && (
                              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full">
                                {fmtK(a.totalTtc)} TTC
                              </span>
                            )}
                            <span className="text-xs text-gray-400">
                              Devis du {a.dateDevis
                                ? new Date(a.dateDevis).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
                                : fmtDate(a.created_at)}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 group-hover:text-blue-400 transition-colors" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
