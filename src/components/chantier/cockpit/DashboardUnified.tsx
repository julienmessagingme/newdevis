/**
 * DashboardUnified — cockpit chantier simplifié, premium, orienté action.
 * Remplace les 3 modes (guided / organised / expert) par une expérience unique.
 * Principe : chaque bloc répond à "qu'est-ce que ça m'apporte concrètement ?"
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Plus, X, Loader2, CheckCircle2, AlertCircle, CloudUpload,
  FileText, Sparkles, Trash2, ArrowLeft, ChevronRight, Wrench,
} from 'lucide-react';
import type {
  ChantierIAResult, DocumentChantier, DocumentType,
  LotChantier, StatutArtisan,
} from '@/types/chantier-ia';
import { useInsights, type InsightItem } from './useInsights';

// ── Supabase ──────────────────────────────────────────────────────────────────

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

// ── Insight styles ────────────────────────────────────────────────────────────

const IS: Record<InsightItem['type'], { bg: string; text: string; border: string; accent: string }> = {
  success: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-100', accent: 'border-l-emerald-400' },
  warning: { bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-100',   accent: 'border-l-amber-400'   },
  alert:   { bg: 'bg-red-50',     text: 'text-red-800',     border: 'border-red-100',     accent: 'border-l-red-400'     },
  info:    { bg: 'bg-blue-50',    text: 'text-blue-800',    border: 'border-blue-100',    accent: 'border-l-blue-400'    },
};

type UploadState = 'idle' | 'uploading' | 'analyzing' | 'success' | 'error';

// ── Assistant Banner ──────────────────────────────────────────────────────────

function AssistantBanner({ items, loading }: { items: InsightItem[]; loading: boolean }) {
  const shown = items.slice(0, 3);
  if (!loading && shown.length === 0) return null;
  return (
    <div className="border-b border-gray-100 bg-white px-6 py-2.5">
      <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 shrink-0">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Insights</span>
        </div>
        {loading ? (
          [1, 2, 3].map(i => <div key={i} className="h-5 w-32 bg-gray-100 rounded-full animate-pulse" />)
        ) : (
          shown.map((item, i) => {
            const s = IS[item.type];
            return (
              <span key={i} className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${s.bg} ${s.text} ${s.border}`}>
                {item.icon && <span className="leading-none">{item.icon}</span>}
                {item.text}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Lot insight pill (bande colorée en bas de carte) ─────────────────────────

function LotInsightPill({ insight }: { insight?: InsightItem }) {
  if (!insight) return null;
  const s = IS[insight.type];
  return (
    <div className={`px-4 py-2.5 border-t border-l-4 ${s.accent} ${s.border} ${s.bg} flex items-center gap-1.5`}>
      {insight.icon && <span className="text-[11px] leading-none">{insight.icon}</span>}
      <span className={`text-[11px] font-semibold ${s.text} leading-tight`}>{insight.text}</span>
    </div>
  );
}

// ── Lot Card ──────────────────────────────────────────────────────────────────

function LotCard({
  lot, docs, insight, onAdd, onDetail,
}: {
  lot: LotChantier;
  docs: DocumentChantier[];
  insight?: InsightItem;
  onAdd: () => void;
  onDetail: () => void;
}) {
  const devisCount   = docs.filter(d => d.document_type === 'devis').length;
  const factureCount = docs.filter(d => d.document_type === 'facture').length;
  const photoCount   = docs.filter(d => d.document_type === 'photo').length;
  const hasRef       = (lot.budget_min_ht ?? 0) > 0 || (lot.budget_max_ht ?? 0) > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col">
      <div className="p-5 flex-1 space-y-3">

        {/* Titre */}
        <div className="flex items-center gap-2.5">
          <span className="text-xl shrink-0 leading-none">{lot.emoji ?? '🔧'}</span>
          <h3 className="font-bold text-gray-900 text-sm leading-tight truncate">{lot.nom}</h3>
        </div>

        {/* Contenu selon état */}
        {docs.length === 0 ? (
          <div className="space-y-2">
            <span className="inline-flex items-center text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full">
              Aucun devis ajouté
            </span>
            {hasRef && (
              <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Prix observé</p>
                <p className="text-sm font-bold text-gray-700">
                  {fmtEuro(lot.budget_min_ht ?? 0)} – {fmtEuro(lot.budget_max_ht ?? 0)}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {devisCount > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                  <FileText className="h-3 w-3" />{devisCount} devis
                </span>
              )}
              {factureCount > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">
                  <FileText className="h-3 w-3" />{factureCount} facture{factureCount > 1 ? 's' : ''}
                </span>
              )}
              {photoCount > 0 && (
                <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                  📷 {photoCount}
                </span>
              )}
            </div>
            {hasRef && (
              <p className="text-xs text-gray-400">
                Réf. marché · {fmtEuro(lot.budget_min_ht ?? 0)} – {fmtEuro(lot.budget_max_ht ?? 0)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Insight */}
      <LotInsightPill insight={insight} />

      {/* Actions */}
      <div className="flex border-t border-gray-50">
        <button onClick={onDetail} className="flex-1 flex items-center justify-center gap-1 py-3 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors">
          Voir <ChevronRight className="h-3 w-3" />
        </button>
        <div className="w-px bg-gray-50" />
        <button onClick={onAdd} className="flex-1 flex items-center justify-center gap-1 py-3 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors">
          <Plus className="h-3 w-3" /> Ajouter
        </button>
      </div>
    </div>
  );
}

// ── Lot Detail ────────────────────────────────────────────────────────────────

function LotDetail({
  lot, docs, insight, onAddDoc, onDeleteDoc, onBack,
}: {
  lot: LotChantier;
  docs: DocumentChantier[];
  insight?: InsightItem;
  onAddDoc: () => void;
  onDeleteDoc: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-5 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Retour aux lots
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">{lot.emoji ?? '🔧'}</span>
            <div>
              <h2 className="font-bold text-gray-900">{lot.nom}</h2>
              {(lot.budget_min_ht || lot.budget_max_ht) && (
                <p className="text-sm text-gray-400 mt-0.5">
                  Prix observé : {fmtEuro(lot.budget_min_ht ?? 0)} – {fmtEuro(lot.budget_max_ht ?? 0)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onAddDoc}
            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Ajouter
          </button>
        </div>

        {/* Insight lot */}
        {insight && (
          <div className={`px-5 py-3 border-b ${IS[insight.type].border} ${IS[insight.type].bg} flex items-center gap-2`}>
            {insight.icon && <span className="text-sm">{insight.icon}</span>}
            <span className={`text-sm font-semibold ${IS[insight.type].text}`}>{insight.text}</span>
          </div>
        )}

        {/* Documents */}
        {docs.length === 0 ? (
          <div className="py-14 text-center">
            <FileText className="h-8 w-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-4">Aucun document pour ce lot</p>
            <button
              onClick={onAddDoc}
              className="flex items-center gap-2 mx-auto text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-xl transition-colors"
            >
              <CloudUpload className="h-4 w-4" /> Ajouter un devis
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {docs.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 px-5 py-4 group">
                <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.nom}</p>
                  <p className="text-xs text-gray-400">
                    {TYPE_LABELS[doc.document_type]} · {fmtDate(doc.created_at)}
                  </p>
                </div>
                {doc.signedUrl && (
                  <a href={doc.signedUrl} target="_blank" rel="noreferrer"
                    className="shrink-0 text-xs text-blue-600 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity">
                    Ouvrir
                  </a>
                )}
                <button onClick={() => onDeleteDoc(doc.id)}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="p-5 border-t border-gray-50">
          <button onClick={onAddDoc}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all">
            <Plus className="h-4 w-4" /> Ajouter un document
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DIY Section ───────────────────────────────────────────────────────────────

function DiySection({ onAddDoc }: { onAddDoc: () => void }) {
  return (
    <div className="mt-8">
      <div className="flex items-center gap-2.5 mb-4">
        <Wrench className="h-4 w-4 text-gray-400" />
        <h2 className="font-semibold text-gray-700 text-sm">Travaux réalisés par vous-même</h2>
      </div>
      <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-1">Estimez vos économies DIY</p>
          <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
            Ajoutez vos factures de matériaux et photos pour calculer automatiquement ce que vous économisez.
          </p>
        </div>
        <button
          onClick={onAddDoc}
          className="shrink-0 flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-xl px-4 py-2.5 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </button>
      </div>
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

interface UploadModalProps {
  chantierId: string;
  token: string;
  lots: LotChantier[];
  defaultLotId?: string | null;
  onClose: () => void;
  onSuccess: (doc: DocumentChantier) => void;
}

function UploadModal({ chantierId, token, lots, defaultLotId, onClose, onSuccess }: UploadModalProps) {
  const [tab, setTab]                   = useState<'file' | 'import'>('file');
  const [dragging, setDragging]         = useState(false);
  const [file, setFile]                 = useState<File | null>(null);
  const [docName, setDocName]           = useState('');
  const [docType, setDocType]           = useState<DocumentType>('devis');
  const [lotId, setLotId]               = useState<string>(defaultLotId ?? '');
  const [uploadState, setUploadState]   = useState<UploadState>('idle');
  const [errorMsg, setErrorMsg]         = useState('');
  const [savingsAmount, setSavingsAmount] = useState(0);
  const [analyses, setAnalyses]         = useState<{ id: string; created_at: string; titre?: string }[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
          titre: a.raw_text?.entreprise?.nom ?? a.raw_text?.context?.type_chantier ?? `Analyse du ${fmtDate(a.created_at)}`,
        })));
      })
      .finally(() => setLoadingAnalyses(false));
  }, [tab]);

  function handleFile(f: File) {
    setFile(f);
    setDocName(f.name.replace(/\.[^.]+$/, ''));
    const lower = f.name.toLowerCase();
    if (lower.includes('devis') || lower.includes('quote')) setDocType('devis');
    else if (lower.includes('facture') || lower.includes('invoice')) setDocType('facture');
    else if (/\.(jpg|jpeg|png|webp|heic)$/i.test(f.name)) setDocType('photo');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function handleUpload() {
    if (!file || !docName.trim()) return;
    setUploadState('uploading'); setErrorMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('nom', docName.trim());
      fd.append('documentType', docType);
      if (lotId) fd.append('lotId', lotId);
      const res = await fetch(`/api/chantier/${chantierId}/documents`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error ?? 'Erreur upload'); setUploadState('error'); return; }
      const doc: DocumentChantier = data.document;

      if (docType === 'devis') {
        setUploadState('analyzing');
        try {
          const aRes = await fetch(`/api/chantier/${chantierId}/documents/${doc.id}/analyser`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          });
          if (aRes.ok) {
            const aData = await aRes.json().catch(() => ({}));
            const savings = aData?.result?.economics?.savings ?? 0;
            setSavingsAmount(savings > 0 ? savings : 0);
          } else { setSavingsAmount(0); }
        } catch { setSavingsAmount(0); }
      } else { setSavingsAmount(0); }

      setUploadState('success');
      onSuccess(doc);
    } catch { setErrorMsg('Erreur réseau.'); setUploadState('error'); }
  }

  async function handleImportAnalyse(analyseId: string, titre: string) {
    setUploadState('uploading');
    try {
      const fd = new FormData();
      fd.append('nom', titre); fd.append('documentType', 'devis');
      fd.append('source', 'verifier_mon_devis');
      if (lotId) fd.append('lotId', lotId);
      fd.append('analyseId', analyseId);
      const res = await fetch(`/api/chantier/${chantierId}/documents`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error ?? 'Erreur'); setUploadState('error'); return; }
      setSavingsAmount(0);
      setUploadState('success');
      onSuccess(data.document);
    } catch { setErrorMsg('Erreur réseau.'); setUploadState('error'); }
  }

  const isUploading = uploadState === 'uploading' || uploadState === 'analyzing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={!isUploading ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

        {/* Header modal */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Ajouter un document</h2>
          {!isUploading && (
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <X className="h-4 w-4 text-gray-500" />
            </button>
          )}
        </div>

        {/* Uploading */}
        {uploadState === 'uploading' && (
          <div className="px-6 py-12 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Loader2 className="h-7 w-7 text-blue-600 animate-spin" />
            </div>
            <p className="font-semibold text-gray-900">Téléversement en cours…</p>
            <p className="text-sm text-gray-400">Ne fermez pas cette fenêtre</p>
          </div>
        )}

        {/* Analyzing */}
        {uploadState === 'analyzing' && (
          <div className="px-6 py-12 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-violet-600 animate-pulse" />
            </div>
            <p className="font-semibold text-gray-900">Analyse en cours…</p>
            <p className="text-sm text-gray-400">Détection des surcoûts et économies</p>
          </div>
        )}

        {/* Success */}
        {uploadState === 'success' && (
          <div className="px-6 py-8 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="font-bold text-gray-900 text-lg">
              {docType === 'devis' ? '✔ Devis analysé' : `${TYPE_LABELS[docType]} ajouté ✓`}
            </p>
            {savingsAmount > 0 && (
              <div className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-4">
                <p className="text-3xl font-extrabold text-emerald-600">+{fmtEuro(savingsAmount)}</p>
                <p className="text-xs font-medium text-emerald-600 mt-1">détectés vs prix du marché 🎉</p>
              </div>
            )}
            <div className="flex flex-col gap-2 w-full mt-1">
              <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 text-sm transition-colors">
                Parfait
              </button>
              {docType === 'devis' && (
                <button
                  onClick={() => { setFile(null); setDocName(''); setSavingsAmount(0); setUploadState('idle'); }}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 py-2"
                >
                  Ajouter un autre devis pour comparer →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {uploadState === 'error' && (
          <div className="px-6 py-10 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <p className="font-semibold text-gray-900">Erreur</p>
            <p className="text-sm text-red-600">{errorMsg}</p>
            <button onClick={() => setUploadState('idle')} className="text-sm font-medium text-blue-600 hover:text-blue-700">
              Réessayer
            </button>
          </div>
        )}

        {/* Idle */}
        {uploadState === 'idle' && (
          <div className="px-6 py-5">
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5">
              {[{ id: 'file' as const, label: 'Importer un fichier' }, { id: 'import' as const, label: 'Depuis VerifierMonDevis' }].map(({ id, label }) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Tab fichier */}
            {tab === 'file' && (
              <div className="space-y-4">
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onClick={() => inputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${dragging ? 'border-blue-400 bg-blue-50' : file ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
                >
                  <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
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

                {file && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Nom</label>
                      <input value={docName} onChange={e => setDocName(e.target.value)}
                        placeholder="ex : Devis Piscine — Entreprise Martin"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Type</label>
                        <select value={docType} onChange={e => setDocType(e.target.value as DocumentType)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100">
                          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Lot</label>
                        <select value={lotId} onChange={e => setLotId(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100">
                          <option value="">— Aucun lot —</option>
                          {lots.filter(l => !l.id.startsWith('fallback-')).map(l => (
                            <option key={l.id} value={l.id}>{l.emoji ?? '🔧'} {l.nom}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <button onClick={handleUpload} disabled={!file || !docName.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-colors">
                  Importer ce document
                </button>
              </div>
            )}

            {/* Tab import VerifierMonDevis */}
            {tab === 'import' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Lot de destination</label>
                  <select value={lotId} onChange={e => setLotId(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 mb-3">
                    <option value="">— Aucun lot —</option>
                    {lots.filter(l => !l.id.startsWith('fallback-')).map(l => (
                      <option key={l.id} value={l.id}>{l.emoji ?? '🔧'} {l.nom}</option>
                    ))}
                  </select>
                </div>
                {loadingAnalyses ? (
                  <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 text-gray-300 animate-spin" /></div>
                ) : analyses.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-400 mb-2">Aucune analyse disponible</p>
                    <a href="/nouvelle-analyse" className="text-sm font-medium text-blue-600 hover:text-blue-700">Analyser un devis →</a>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 border border-gray-100 rounded-2xl overflow-hidden">
                    {analyses.map(a => (
                      <button key={a.id}
                        onClick={() => handleImportAnalyse(a.id, a.titre ?? `Analyse du ${fmtDate(a.created_at)}`)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-blue-50 transition-colors text-left">
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

// ── Props & composant principal ───────────────────────────────────────────────

interface Props {
  result: ChantierIAResult;
  chantierId: string | null;
  token?: string | null;
  onLotStatutChange?: (lotId: string, statut: StatutArtisan) => void;
}

export default function DashboardUnified({ result, chantierId, token }: Props) {
  const [documents, setDocuments]     = useState<DocumentChantier[]>([]);
  const [lots]                        = useState<LotChantier[]>(result.lots ?? []);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [uploadModal, setUploadModal] = useState<{ open: boolean; lotId?: string }>({ open: false });

  // ── Insights ──────────────────────────────────────────────────────────────
  const { insights, loading: insightsLoading, refresh: refreshInsights } = useInsights(
    chantierId, token, documents.length,
  );

  // ── Budget (fourchette uniquement — jamais de prix fixe) ──────────────────
  const totalMin = lots.reduce((s, l) => s + (l.budget_min_ht ?? 0), 0);
  const totalMax = lots.reduce((s, l) => s + (l.budget_max_ht ?? 0), 0);
  const rangeMin = totalMin > 0 ? totalMin : Math.round(result.budgetTotal * 0.85);
  const rangeMax = totalMax > 0 ? totalMax : Math.round(result.budgetTotal * 1.20);

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
    const k = doc.lot_id ?? '__none__';
    (docsByLot[k] ??= []).push(doc);
  }

  async function handleDeleteDoc(docId: string) {
    if (!chantierId || !token) return;
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${docId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch {}
  }

  const selectedLot = lots.find(l => l.id === selectedLotId);

  // DIY : proposer si certains lots n'ont pas encore d'artisan
  const hasDiyOpportunity = lots.some(l => l.statut === 'a_trouver');

  return (
    <div className="min-h-screen bg-[#f7f8fc] flex flex-col">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          {/* Retour */}
          <a href="/mon-chantier" className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </a>

          {/* Identité */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="text-2xl leading-none shrink-0">{result.emoji}</span>
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 text-base leading-tight truncate">{result.nom}</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                Budget observé · {fmtEuro(rangeMin)} – {fmtEuro(rangeMax)}
              </p>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={() => setUploadModal({ open: true })}
            className="shrink-0 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors shadow-sm shadow-blue-200"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Ajouter un document</span>
            <span className="sm:hidden">Ajouter</span>
          </button>
        </div>
      </header>

      {/* ── Insights banner ────────────────────────────────────────────────── */}
      <AssistantBanner items={insights?.global ?? []} loading={insightsLoading} />

      {/* ── Corps ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-7">

        {/* Vue : liste des lots */}
        {!selectedLotId && (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-gray-900">
                Vos lots de travaux
                <span className="ml-2 text-xs font-normal text-gray-400">{lots.length} lot{lots.length > 1 ? 's' : ''}</span>
              </h2>
            </div>

            {lots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-5">
                  <CloudUpload className="h-8 w-8 text-blue-400" />
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">Commencez par ajouter un devis</h3>
                <p className="text-gray-400 text-sm max-w-xs leading-relaxed mb-8">
                  Importez un devis pour obtenir une analyse automatique et voir s'il est au prix du marché.
                </p>
                <button onClick={() => setUploadModal({ open: true })}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-3 text-sm transition-colors shadow-lg shadow-blue-200">
                  <Plus className="h-4 w-4" /> Ajouter votre premier devis
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {lots.map(lot => (
                  <LotCard
                    key={lot.id}
                    lot={lot}
                    docs={docsByLot[lot.id] ?? []}
                    insight={insights?.lots?.[lot.id]}
                    onAdd={() => setUploadModal({ open: true, lotId: lot.id.startsWith('fallback-') ? undefined : lot.id })}
                    onDetail={() => setSelectedLotId(lot.id)}
                  />
                ))}
              </div>
            )}

            {/* Section DIY */}
            {hasDiyOpportunity && (
              <DiySection onAddDoc={() => setUploadModal({ open: true })} />
            )}
          </>
        )}

        {/* Vue : détail d'un lot */}
        {selectedLotId && selectedLot && (
          <LotDetail
            lot={selectedLot}
            docs={docsByLot[selectedLot.id] ?? []}
            insight={insights?.lots?.[selectedLot.id]}
            onAddDoc={() => setUploadModal({ open: true, lotId: selectedLot.id.startsWith('fallback-') ? undefined : selectedLot.id })}
            onDeleteDoc={handleDeleteDoc}
            onBack={() => setSelectedLotId(null)}
          />
        )}
      </main>

      {/* ── Modal upload ──────────────────────────────────────────────────── */}
      {uploadModal.open && chantierId && token && (
        <UploadModal
          chantierId={chantierId}
          token={token}
          lots={lots}
          defaultLotId={uploadModal.lotId}
          onClose={() => setUploadModal({ open: false })}
          onSuccess={(doc) => {
            setDocuments(prev => [doc, ...prev]);
            refreshInsights();
          }}
        />
      )}
    </div>
  );
}
