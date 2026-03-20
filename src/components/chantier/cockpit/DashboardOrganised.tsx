import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Upload, ChevronRight, Plus, LayoutGrid, Calendar,
  FileText, FolderOpen, X, Loader2, CheckCircle2,
  AlertCircle, CloudUpload, Sparkles, Trash2, TrendingUp,
} from 'lucide-react';
import type {
  ChantierIAResult, DocumentChantier, DocumentType,
  LotChantier, ProjectMode, StatutArtisan,
} from '@/types/chantier-ia';
import { useInsights, type InsightItem } from './useInsights';

// ── Supabase client (frontend) ────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtEuro(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)} k€`;
  return `${n} €`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

const TYPE_LABELS: Record<DocumentType, string> = {
  devis: 'Devis', facture: 'Facture', photo: 'Photo',
  plan: 'Plan', autorisation: 'Autorisation', assurance: 'Assurance', autre: 'Autre',
};

// ── Types ─────────────────────────────────────────────────────────────────────

type NavItem = 'lots' | 'planning' | 'documents' | 'projet';
type UploadState = 'idle' | 'uploading' | 'analyzing' | 'success' | 'error';

// ── InsightsBar ───────────────────────────────────────────────────────────────

const INSIGHT_STYLES: Record<InsightItem['type'], { bg: string; text: string; border: string }> = {
  success: { bg: 'bg-emerald-50',  text: 'text-emerald-800', border: 'border-emerald-100' },
  warning: { bg: 'bg-amber-50',    text: 'text-amber-800',   border: 'border-amber-100'   },
  alert:   { bg: 'bg-red-50',      text: 'text-red-800',     border: 'border-red-100'     },
  info:    { bg: 'bg-blue-50',     text: 'text-blue-800',    border: 'border-blue-100'    },
};

function InsightsBar({ items, loading }: { items: InsightItem[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 mb-5">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-7 w-36 bg-gray-100 rounded-full animate-pulse" />
        ))}
      </div>
    );
  }
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      {items.map((item, i) => {
        const s = INSIGHT_STYLES[item.type];
        return (
          <span
            key={i}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${s.bg} ${s.text} ${s.border}`}
          >
            {item.icon && <span className="leading-none">{item.icon}</span>}
            {item.text}
          </span>
        );
      })}
    </div>
  );
}

function LotInsightPill({ insight }: { insight: InsightItem | undefined }) {
  if (!insight) return null;
  const s = INSIGHT_STYLES[insight.type];
  return (
    <div className={`mx-[-1px] px-4 py-2.5 border-t ${s.border} ${s.bg} flex items-center gap-1.5`}>
      {insight.icon && <span className="text-[11px] leading-none">{insight.icon}</span>}
      <span className={`text-[11px] font-semibold ${s.text} leading-tight`}>{insight.text}</span>
    </div>
  );
}

// ── Modal Upload ──────────────────────────────────────────────────────────────

interface UploadModalProps {
  chantierId: string;
  token: string;
  lots: LotChantier[];
  defaultLotId?: string | null;
  onClose: () => void;
  onSuccess: (doc: DocumentChantier) => void;
}

function UploadModal({ chantierId, token, lots, defaultLotId, onClose, onSuccess }: UploadModalProps) {
  const [tab, setTab] = useState<'file' | 'import'>('file');
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState<DocumentType>('devis');
  const [lotId, setLotId] = useState<string>(defaultLotId ?? '');
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [resultMsg, setResultMsg] = useState('');
  const [analyses, setAnalyses] = useState<{ id: string; created_at: string; titre?: string }[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch analyses pour l'onglet "Depuis VerifierMonDevis"
  useEffect(() => {
    if (tab !== 'import') return;
    setLoadingAnalyses(true);
    supabase
      .from('analyses')
      .select('id, created_at, raw_text')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data }) => {
        setAnalyses((data ?? []).map(a => ({
          id: a.id,
          created_at: a.created_at,
          titre: a.raw_text?.entreprise?.nom ?? a.raw_text?.context?.type_chantier ?? 'Analyse du ' + fmtDate(a.created_at),
        })));
      })
      .finally(() => setLoadingAnalyses(false));
  }, [tab]);

  function handleFile(f: File) {
    setFile(f);
    setDocName(f.name.replace(/\.[^.]+$/, ''));
    // Auto-détecter le type
    const lower = f.name.toLowerCase();
    if (lower.includes('devis') || lower.includes('quote')) setDocType('devis');
    else if (lower.includes('facture') || lower.includes('invoice')) setDocType('facture');
    else if (/\.(jpg|jpeg|png|webp|heic)$/i.test(f.name)) setDocType('photo');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function handleUpload() {
    if (!file || !docName.trim()) return;
    setUploadState('uploading');
    setErrorMsg('');

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('nom', docName.trim());
      fd.append('documentType', docType);
      if (lotId) fd.append('lotId', lotId);

      const res = await fetch(`/api/chantier/${chantierId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error ?? 'Erreur lors de l\'upload'); setUploadState('error'); return; }

      const doc: DocumentChantier = data.document;

      // Si c'est un devis → déclencher l'analyse en background
      if (docType === 'devis') {
        setUploadState('analyzing');
        try {
          const aRes = await fetch(`/api/chantier/${chantierId}/documents/${doc.id}/analyser`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          });
          if (aRes.ok) {
            const aData = await aRes.json().catch(() => ({}));
            const savings = aData?.result?.economics?.savings;
            setResultMsg(savings > 0
              ? `+${fmtEuro(savings)} économisés détectés 🎉`
              : 'Devis importé et analysé ✓');
          } else {
            setResultMsg('Devis importé avec succès ✓');
          }
        } catch {
          setResultMsg('Devis importé avec succès ✓');
        }
      } else {
        setResultMsg(`${TYPE_LABELS[docType]} ajouté ✓`);
      }

      setUploadState('success');
      onSuccess(doc);
    } catch {
      setErrorMsg('Erreur réseau. Veuillez réessayer.');
      setUploadState('error');
    }
  }

  async function handleImportAnalyse(analyseId: string, titre: string) {
    setUploadState('uploading');
    try {
      const fd = new FormData();
      fd.append('nom', titre);
      fd.append('documentType', 'devis');
      fd.append('source', 'verifier_mon_devis');
      if (lotId) fd.append('lotId', lotId);
      fd.append('analyseId', analyseId);

      const res = await fetch(`/api/chantier/${chantierId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error ?? 'Erreur'); setUploadState('error'); return; }
      setResultMsg('Analyse importée avec succès ✓');
      setUploadState('success');
      onSuccess(data.document);
    } catch {
      setErrorMsg('Erreur réseau.');
      setUploadState('error');
    }
  }

  const isUploading = uploadState === 'uploading' || uploadState === 'analyzing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={!isUploading ? onClose : undefined} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Ajouter un document</h2>
          {!isUploading && (
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <X className="h-4 w-4 text-gray-500" />
            </button>
          )}
        </div>

        {/* ── État : Uploading ─────────────────────────────────────────────── */}
        {uploadState === 'uploading' && (
          <div className="px-6 py-12 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Loader2 className="h-7 w-7 text-blue-600 animate-spin" />
            </div>
            <p className="font-semibold text-gray-900">Téléversement en cours…</p>
            <p className="text-sm text-gray-400">Ne fermez pas cette fenêtre</p>
          </div>
        )}

        {/* ── État : Analyzing ─────────────────────────────────────────────── */}
        {uploadState === 'analyzing' && (
          <div className="px-6 py-12 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-violet-600 animate-pulse" />
            </div>
            <p className="font-semibold text-gray-900">Analyse en cours…</p>
            <p className="text-sm text-gray-400">Détection des surcoûts et économies</p>
          </div>
        )}

        {/* ── État : Success ────────────────────────────────────────────────── */}
        {uploadState === 'success' && (
          <div className="px-6 py-12 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="font-bold text-gray-900 text-lg">{resultMsg}</p>
            <button
              onClick={onClose}
              className="mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-6 py-2.5 text-sm transition-colors"
            >
              Parfait
            </button>
          </div>
        )}

        {/* ── État : Error ──────────────────────────────────────────────────── */}
        {uploadState === 'error' && (
          <div className="px-6 py-10 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <p className="font-semibold text-gray-900">Erreur</p>
            <p className="text-sm text-red-600">{errorMsg}</p>
            <button
              onClick={() => setUploadState('idle')}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Réessayer
            </button>
          </div>
        )}

        {/* ── État : Idle ───────────────────────────────────────────────────── */}
        {uploadState === 'idle' && (
          <div className="px-6 py-5">

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
              {[
                { id: 'file' as const, label: 'Importer un fichier' },
                { id: 'import' as const, label: 'Depuis VerifierMonDevis' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Tab: Fichier ──────────────────────────────────────────────── */}
            {tab === 'file' && (
              <div className="space-y-4">
                {/* Drop zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onClick={() => inputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    dragging
                      ? 'border-blue-400 bg-blue-50'
                      : file
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                  {file ? (
                    <>
                      <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                      <p className="font-semibold text-emerald-800 text-sm">{file.name}</p>
                      <p className="text-xs text-emerald-600 mt-0.5">{(file.size / 1024).toFixed(0)} Ko</p>
                    </>
                  ) : (
                    <>
                      <CloudUpload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-700">Glissez votre fichier ici</p>
                      <p className="text-xs text-gray-400 mt-1">ou cliquez pour parcourir</p>
                      <p className="text-[10px] text-gray-300 mt-2">PDF, JPG, PNG, Word — max 10 Mo</p>
                    </>
                  )}
                </div>

                {/* Fields */}
                {file && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Nom</label>
                      <input
                        value={docName}
                        onChange={e => setDocName(e.target.value)}
                        placeholder="ex : Devis Piscine — Entreprise Martin"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Type</label>
                        <select
                          value={docType}
                          onChange={e => setDocType(e.target.value as DocumentType)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                        >
                          {Object.entries(TYPE_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Lot</label>
                        <select
                          value={lotId}
                          onChange={e => setLotId(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                        >
                          <option value="">— Aucun lot —</option>
                          {lots.filter(l => !l.id.startsWith('fallback-')).map(l => (
                            <option key={l.id} value={l.id}>{l.emoji ?? '🔧'} {l.nom}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleUpload}
                  disabled={!file || !docName.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-colors"
                >
                  Importer ce document
                </button>
              </div>
            )}

            {/* ── Tab: Depuis VerifierMonDevis ──────────────────────────────── */}
            {tab === 'import' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Lot de destination</label>
                  <select
                    value={lotId}
                    onChange={e => setLotId(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 mb-3"
                  >
                    <option value="">— Aucun lot —</option>
                    {lots.filter(l => !l.id.startsWith('fallback-')).map(l => (
                      <option key={l.id} value={l.id}>{l.emoji ?? '🔧'} {l.nom}</option>
                    ))}
                  </select>
                </div>

                {loadingAnalyses ? (
                  <div className="py-8 flex justify-center">
                    <Loader2 className="h-5 w-5 text-gray-300 animate-spin" />
                  </div>
                ) : analyses.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-400 mb-2">Aucune analyse disponible</p>
                    <a href="/nouvelle-analyse" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                      Analyser un devis →
                    </a>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 border border-gray-100 rounded-2xl overflow-hidden">
                    {analyses.map(a => (
                      <button
                        key={a.id}
                        onClick={() => handleImportAnalyse(a.id, a.titre ?? `Analyse du ${fmtDate(a.created_at)}`)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-blue-50 transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{a.titre}</p>
                          <p className="text-xs text-gray-400">{fmtDate(a.created_at)}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
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

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-5">
        <CloudUpload className="h-8 w-8 text-blue-400" />
      </div>
      <h3 className="font-bold text-gray-900 text-lg mb-2">Aucune donnée pour le moment</h3>
      <p className="text-gray-400 text-sm max-w-xs leading-relaxed mb-8">
        Ajoutez un devis ou une facture → votre budget sera calculé automatiquement
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-3 text-sm transition-colors shadow-lg shadow-blue-200"
      >
        <Plus className="h-4 w-4" />
        Ajouter votre premier document
      </button>
    </div>
  );
}

// ── Lot Card ──────────────────────────────────────────────────────────────────

function LotCard({
  lot, docs, refMin, refMax, onAdd, onDetail, insight,
}: {
  lot: LotChantier;
  docs: DocumentChantier[];
  refMin: number; refMax: number;
  onAdd: () => void;
  onDetail: () => void;
  insight?: InsightItem;
}) {
  const devisCount   = docs.filter(d => d.document_type === 'devis').length;
  const factureCount = docs.filter(d => d.document_type === 'facture').length;
  const photoCount   = docs.filter(d => d.document_type === 'photo').length;
  const totalDocs    = docs.length;
  const hasRef       = refMin > 0 || refMax > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col">
      <div className="p-5 flex-1">
        {/* Titre */}
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl shrink-0 leading-none">{lot.emoji ?? '🔧'}</span>
            <h3 className="font-bold text-gray-900 text-sm leading-tight truncate">{lot.nom}</h3>
          </div>
        </div>

        {/* Contenu principal selon l'état */}
        {totalDocs === 0 ? (
          // Aucun document → état vide avec prix référence
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Aucun devis ajouté</p>
            {hasRef && (
              <div className="bg-gray-50 rounded-xl px-3.5 py-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Prix observé</p>
                <p className="text-sm font-bold text-gray-700">
                  {fmtEuro(refMin)} – {fmtEuro(refMax)}
                </p>
              </div>
            )}
          </div>
        ) : (
          // Documents présents → résumé
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap text-xs">
              {devisCount > 0 && (
                <span className="flex items-center gap-1 font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                  <FileText className="h-3 w-3" />{devisCount} devis
                </span>
              )}
              {factureCount > 0 && (
                <span className="flex items-center gap-1 font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">
                  <FileText className="h-3 w-3" />{factureCount} facture{factureCount > 1 ? 's' : ''}
                </span>
              )}
              {photoCount > 0 && (
                <span className="flex items-center gap-1 font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                  📷 {photoCount}
                </span>
              )}
            </div>
            {hasRef && (
              <div className="bg-gray-50 rounded-xl px-3.5 py-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Référence marché</p>
                <p className="text-sm font-bold text-gray-700">{fmtEuro(refMin)} – {fmtEuro(refMax)}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Insight assistant */}
      <LotInsightPill insight={insight} />

      {/* Actions */}
      <div className="flex border-t border-gray-50">
        <button
          onClick={onDetail}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
        >
          Voir détail <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <div className="w-px bg-gray-50" />
        <button
          onClick={onAdd}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </button>
      </div>
    </div>
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

// ── Composant principal ───────────────────────────────────────────────────────

export default function DashboardOrganised({ result, chantierId, token, onLotStatutChange, onProjectModeChange }: Props) {
  const [activeNav, setActiveNav] = useState<NavItem>('lots');
  const [documents, setDocuments] = useState<DocumentChantier[]>([]);
  const [lots, setLots] = useState<LotChantier[]>(result.lots ?? []);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [uploadModal, setUploadModal] = useState<{ open: boolean; lotId?: string }>({ open: false });

  // ── Insights maître d'œuvre ───────────────────────────────────────────────
  const { insights, loading: insightsLoading, refresh: refreshInsights } = useInsights(
    chantierId, token, documents.length,
  );

  // ── Budget ────────────────────────────────────────────────────────────────
  const totalMin = lots.reduce((s, l) => s + (l.budget_min_ht ?? 0), 0);
  const totalMax = lots.reduce((s, l) => s + (l.budget_max_ht ?? 0), 0);
  const rangeMin = totalMin > 0 ? totalMin : Math.round(result.budgetTotal * 0.85);
  const rangeMax = totalMax > 0 ? totalMax : Math.round(result.budgetTotal * 1.20);

  // Économies = différence entre prix max et prix moyen (potential)
  const totalAvg = lots.reduce((s, l) => s + (l.budget_avg_ht ?? 0), 0);
  const savings = totalAvg > 0 && totalMax > totalAvg ? Math.round(totalMax - totalAvg) : 0;

  // ── Chargement documents ──────────────────────────────────────────────────
  const loadDocuments = useCallback(async () => {
    if (!chantierId || !token) return;
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setDocuments(d.documents ?? []);
      }
    } catch {}
  }, [chantierId, token]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  // ── Index docs par lot ────────────────────────────────────────────────────
  const docsByLot: Record<string, DocumentChantier[]> = {};
  for (const doc of documents) {
    const key = doc.lot_id ?? '__none__';
    (docsByLot[key] ??= []).push(doc);
  }

  const selectedLot = lots.find(l => l.id === selectedLotId);

  const NAV_ITEMS: { id: NavItem; label: string; icon: React.ReactNode }[] = [
    { id: 'lots',      label: 'Lots',      icon: <LayoutGrid className="h-4 w-4" /> },
    { id: 'planning',  label: 'Planning',  icon: <Calendar  className="h-4 w-4" /> },
    { id: 'documents', label: 'Documents', icon: <FileText  className="h-4 w-4" /> },
    { id: 'projet',    label: 'Projet',    icon: <FolderOpen className="h-4 w-4" /> },
  ];

  async function handleDeleteDoc(docId: string) {
    if (!chantierId || !token) return;
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch {}
  }

  return (
    <div className="min-h-screen bg-[#f7f8fc] flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="text-2xl leading-none">{result.emoji}</span>
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 text-base leading-tight truncate">{result.nom}</h1>
              <p className="text-sm text-gray-400 mt-0.5">{fmtEuro(rangeMin)} – {fmtEuro(rangeMax)}</p>
            </div>
          </div>

          {/* Indicateurs */}
          {savings > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full shrink-0">
              <TrendingUp className="h-3.5 w-3.5" />
              Jusqu'à {fmtEuro(savings)} économisables
            </div>
          )}

          {onProjectModeChange && (
            <button
              onClick={() => onProjectModeChange('guided')}
              className="hidden sm:block text-xs text-gray-400 hover:text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Changer de mode
            </button>
          )}

          <button
            onClick={() => setUploadModal({ open: true })}
            className="shrink-0 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors shadow-sm shadow-blue-200"
          >
            <Plus className="h-4 w-4" />
            Ajouter un document
          </button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 max-w-5xl w-full mx-auto">

        {/* Sidebar */}
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
                }`}>{documents.length}</span>
              )}
            </button>
          ))}

          {/* Quick stats */}
          <div className="mx-2 mt-6 pt-5 border-t border-gray-100 space-y-3">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Lots</p>
              <p className="text-sm font-semibold text-gray-800">{lots.length} lot{lots.length > 1 ? 's' : ''}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Durée</p>
              <p className="text-sm font-semibold text-gray-800">{result.dureeEstimeeMois} mois</p>
            </div>
            {documents.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Documents</p>
                <p className="text-sm font-semibold text-gray-800">{documents.length} fichier{documents.length > 1 ? 's' : ''}</p>
              </div>
            )}
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 py-6 pl-4 pr-6">

          {/* ── Vue : Lots ────────────────────────────────────────────────── */}
          {activeNav === 'lots' && !selectedLotId && (
            <>
              {documents.length === 0 && lots.length === 0 ? (
                <EmptyState onAdd={() => setUploadModal({ open: true })} />
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-gray-900">Lots de travaux</h2>
                    <span className="text-xs text-gray-400">{lots.length} lot{lots.length > 1 ? 's' : ''}</span>
                  </div>

                  {/* ── Insights globaux ── */}
                  <InsightsBar items={insights?.global ?? []} loading={insightsLoading} />

                  {lots.length === 0 ? (
                    <EmptyState onAdd={() => setUploadModal({ open: true })} />
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {lots.map(lot => (
                        <LotCard
                          key={lot.id}
                          lot={lot}
                          docs={docsByLot[lot.id] ?? []}
                          refMin={lot.budget_min_ht ?? 0}
                          refMax={lot.budget_max_ht ?? 0}
                          insight={insights?.lots?.[lot.id]}
                          onAdd={() => setUploadModal({ open: true, lotId: lot.id.startsWith('fallback-') ? undefined : lot.id })}
                          onDetail={() => setSelectedLotId(lot.id)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Vue : Détail lot ──────────────────────────────────────────── */}
          {activeNav === 'lots' && selectedLotId && selectedLot && (
            <div>
              <button
                onClick={() => setSelectedLotId(null)}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-5 transition-colors"
              >
                ← Retour aux lots
              </button>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Entête du lot */}
                <div className="px-5 py-5 border-b border-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl leading-none">{selectedLot.emoji ?? '🔧'}</span>
                    <div>
                      <h2 className="font-bold text-gray-900">{selectedLot.nom}</h2>
                      {(selectedLot.budget_min_ht || selectedLot.budget_max_ht) && (
                        <p className="text-sm text-gray-400 mt-0.5">
                          Référence marché : {fmtEuro(selectedLot.budget_min_ht ?? 0)} – {fmtEuro(selectedLot.budget_max_ht ?? 0)}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setUploadModal({ open: true, lotId: selectedLot.id.startsWith('fallback-') ? undefined : selectedLot.id })}
                    className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Ajouter
                  </button>
                </div>

                {/* Documents du lot */}
                {(docsByLot[selectedLot.id] ?? []).length === 0 ? (
                  <div className="py-14 text-center">
                    <FileText className="h-8 w-8 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400 mb-1">Aucun document pour ce lot</p>
                    {(selectedLot.budget_min_ht || selectedLot.budget_max_ht) && (
                      <p className="text-xs text-gray-300">
                        Prix moyen observé : {fmtEuro(selectedLot.budget_min_ht ?? 0)} – {fmtEuro(selectedLot.budget_max_ht ?? 0)}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {(docsByLot[selectedLot.id] ?? []).map(doc => (
                      <div key={doc.id} className="flex items-center gap-3 px-5 py-4 group">
                        <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-gray-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{doc.nom}</p>
                          <p className="text-xs text-gray-400">
                            {TYPE_LABELS[doc.document_type] ?? doc.document_type} · {fmtDate(doc.created_at)}
                          </p>
                        </div>
                        {doc.signedUrl && (
                          <a
                            href={doc.signedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 text-xs text-blue-600 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Ouvrir
                          </a>
                        )}
                        <button
                          onClick={() => handleDeleteDoc(doc.id)}
                          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-5 border-t border-gray-50">
                  <button
                    onClick={() => setUploadModal({ open: true, lotId: selectedLot.id.startsWith('fallback-') ? undefined : selectedLot.id })}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all"
                  >
                    <Plus className="h-4 w-4" /> Ajouter un document
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Vue : Planning ────────────────────────────────────────────── */}
          {activeNav === 'planning' && (
            <div className="space-y-3">
              <h2 className="font-semibold text-gray-900 mb-5">Planning du projet</h2>
              {result.roadmap.length === 0 ? (
                <p className="text-sm text-gray-400">Aucune étape de planning disponible</p>
              ) : result.roadmap.map((step, i) => (
                <div key={i} className={`bg-white rounded-2xl border p-4 shadow-sm ${
                  step.isCurrent ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-100'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      step.isCurrent ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {step.numero}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className={`text-sm font-semibold ${step.isCurrent ? 'text-blue-700' : 'text-gray-800'}`}>{step.nom}</p>
                        {step.isCurrent && (
                          <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full">En cours</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{step.detail}</p>
                    </div>
                    <span className="shrink-0 text-xs text-gray-400 font-medium">{step.mois}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Vue : Documents ───────────────────────────────────────────── */}
          {activeNav === 'documents' && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-gray-900">Tous les documents</h2>
                <button
                  onClick={() => setUploadModal({ open: true })}
                  className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  <Plus className="h-4 w-4" /> Ajouter
                </button>
              </div>
              {documents.length === 0 ? (
                <EmptyState onAdd={() => setUploadModal({ open: true })} />
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 px-5 py-4 group">
                      <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{doc.nom}</p>
                        <p className="text-xs text-gray-400">
                          {TYPE_LABELS[doc.document_type] ?? doc.document_type} · {fmtDate(doc.created_at)}
                          {doc.lot_id && lots.find(l => l.id === doc.lot_id) && (
                            <span className="ml-1.5 text-blue-500">
                              · {lots.find(l => l.id === doc.lot_id)?.nom}
                            </span>
                          )}
                        </p>
                      </div>
                      {doc.signedUrl && (
                        <a
                          href={doc.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-xs text-blue-600 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Ouvrir
                        </a>
                      )}
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Vue : Projet ──────────────────────────────────────────────── */}
          {activeNav === 'projet' && (
            <div className="space-y-4">
              <h2 className="font-semibold text-gray-900">Récapitulatif du projet</h2>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Budget estimé', value: `${fmtEuro(rangeMin)} – ${fmtEuro(rangeMax)}`, bg: 'bg-blue-50', color: 'text-blue-700' },
                  { label: 'Durée estimée', value: `${result.dureeEstimeeMois} mois`, bg: 'bg-violet-50', color: 'text-violet-700' },
                  { label: 'Corps de métier', value: `${result.artisans.length}`, bg: 'bg-emerald-50', color: 'text-emerald-700' },
                ].map(({ label, value, bg, color }) => (
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

      {/* ── Modal Upload ───────────────────────────────────────────────────── */}
      {uploadModal.open && chantierId && token && (
        <UploadModal
          chantierId={chantierId}
          token={token}
          lots={lots}
          defaultLotId={uploadModal.lotId}
          onClose={() => setUploadModal({ open: false })}
          onSuccess={(doc) => {
            setDocuments(prev => [doc, ...prev]);
            setTimeout(() => {
              setUploadModal({ open: false });
              refreshInsights();   // régénérer les insights après ajout
            }, 1800);
          }}
        />
      )}
    </div>
  );
}
