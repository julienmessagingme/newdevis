import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { X, FileText, Receipt, Image, FolderOpen, Download, ExternalLink, GitCompareArrows, PlusCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DocumentChantier, DocumentType, LotChantier } from '@/types/chantier-ia';
import { compareQuotes } from '@/utils/devis/compareQuotes';
import ComparateurDevis from '@/components/chantier/devis/ComparateurDevis';
import { calcLotBudget } from '@/utils/chantier/calcLotBudget';

// ── Constants upload ───────────────────────────────────────────────────────────

const SUPABASE_URL   = import.meta.env.PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON  = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;
const BUCKET         = 'chantier-documents';
const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.docx,.xlsx,.xls,.doc';

const DOC_TYPES: { value: DocumentType; label: string; emoji: string }[] = [
  { value: 'devis',        label: 'Devis',          emoji: '📋' },
  { value: 'facture',      label: 'Facture',         emoji: '💰' },
  { value: 'photo',        label: 'Photo',           emoji: '📸' },
  { value: 'plan',         label: 'Plan',            emoji: '📐' },
  { value: 'autorisation', label: 'Autorisation',    emoji: '🏛️' },
  { value: 'assurance',    label: 'Assurance',       emoji: '🛡️' },
  { value: 'autre',        label: 'Autre document',  emoji: '📄' },
];

// ── Config types de documents ─────────────────────────────────────────────────

interface DocSection {
  type:      DocumentType[];
  label:     string;
  emoji:     string;
  emptyText: string;
}

const SECTIONS: DocSection[] = [
  {
    type:      ['devis'],
    label:     'Devis',
    emoji:     '📋',
    emptyText: 'Aucun devis ajouté',
  },
  {
    type:      ['facture'],
    label:     'Factures',
    emoji:     '💰',
    emptyText: 'Aucune facture ajoutée',
  },
  {
    type:      ['photo'],
    label:     'Photos',
    emoji:     '📸',
    emptyText: 'Aucune photo ajoutée',
  },
  {
    type:      ['plan', 'autorisation', 'assurance', 'autre'],
    label:     'Autres documents',
    emoji:     '📄',
    emptyText: 'Aucun autre document',
  },
];

const TYPE_EMOJI: Partial<Record<DocumentType, string>> = {
  devis:        '📋',
  facture:      '💰',
  photo:        '📸',
  plan:         '📐',
  autorisation: '🏛️',
  assurance:    '🛡️',
  autre:        '📄',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface LotDetailProps {
  lotName:    string;
  budget:     number;
  couleur:    string;
  documents:  DocumentChantier[];
  onClose:    () => void;
  /** Props optionnelles pour l'upload de documents */
  chantierId?:       string;
  userId?:           string;
  token?:            string;
  lotId?:            string | null;
  /** Lot DB correspondant — utilisé pour afficher la décomposition budgétaire */
  lot?:              LotChantier | null;
  onDocumentAdded?:  () => void;
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function LotDetail({
  lotName,
  budget,
  couleur,
  documents,
  onClose,
  chantierId,
  userId,
  token,
  lotId,
  lot,
  onDocumentAdded,
}: LotDetailProps) {
  const [showComparateur, setShowComparateur] = useState(false);

  // Documents locaux — mis à jour après upload sans rechargement complet
  const [localDocuments, setLocalDocuments] = useState<DocumentChantier[]>(documents);

  // Synchronise si le parent passe de nouveaux documents (ex: rafraîchissement)
  useEffect(() => { setLocalDocuments(documents); }, [documents]);

  // Upload inline
  const fileInputRef                    = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile]   = useState<File | null>(null);
  const [uploadType, setUploadType]     = useState<DocumentType>('autre');
  const [uploadNom, setUploadNom]       = useState('');
  const [uploading, setUploading]       = useState(false);

  // Fermeture au clavier (Escape)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingFile) { cancelUpload(); }
        else { onClose(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, pendingFile]);

  // Bloquer le scroll body pendant l'ouverture
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ── Upload helpers ───────────────────────────────────────────────────────

  const canUpload = !!(chantierId && userId && token);

  const handleFileSelect = (file: File) => {
    if (file.size > MAX_SIZE_BYTES) {
      toast.error('Fichier trop volumineux — 10 Mo maximum', { duration: 3000 });
      return;
    }
    setPendingFile(file);
    setUploadType(inferDocType(file));
    setUploadNom(file.name.replace(/\.[^/.]+$/, ''));
  };

  const cancelUpload = () => {
    setPendingFile(null);
    setUploadNom('');
    setUploadType('autre');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!pendingFile || !uploadNom.trim() || uploading || !chantierId || !userId || !token) return;
    setUploading(true);

    const ext        = getFileExt(pendingFile);
    const uuid       = crypto.randomUUID();
    const bucketPath = `${userId}/${chantierId}/${uuid}${ext}`;

    try {
      const storageClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth:   { persistSession: false },
      });

      const { error: uploadErr } = await storageClient.storage
        .from(BUCKET)
        .upload(bucketPath, pendingFile, {
          contentType: pendingFile.type || 'application/octet-stream',
          upsert: false,
        });

      if (uploadErr) throw new Error(`Storage: ${uploadErr.message}`);

      const res = await fetch(`/api/chantier/${chantierId}/documents`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bucketPath,
          nom:          uploadNom.trim(),
          nomFichier:   pendingFile.name,
          documentType: uploadType,
          lotId:        lotId ?? null,
          tailleOctets: pendingFile.size,
          mimeType:     pendingFile.type || null,
        }),
      });

      if (!res.ok) {
        await storageClient.storage.from(BUCKET).remove([bucketPath]);
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setLocalDocuments((prev) => [data.document, ...prev]);
      cancelUpload();
      toast.success('Document ajouté', { duration: 2000 });
      onDocumentAdded?.();
    } catch (e) {
      console.error('[LotDetail] upload error:', e instanceof Error ? e.message : String(e));
      toast.error("Erreur lors de l'ajout du document", { duration: 3000 });
    } finally {
      setUploading(false);
    }
  };

  // ── Données dérivées ─────────────────────────────────────────────────────

  const totalDocs  = localDocuments.length;
  const { devis: quotes } = compareQuotes(localDocuments);
  const canCompare = quotes.length >= 2;
  const lotBudget  = calcLotBudget(localDocuments, budget);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panneau */}
      <div
        className="relative w-full max-w-md bg-[#0a0f1e] border-l border-white/[0.08] h-full flex flex-col shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Détail du lot : ${lotName}`}
      >

        {/* ── En-tête ── */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-white/[0.06] shrink-0">
          <span
            className="w-1 rounded-full shrink-0 self-stretch min-h-[3rem]"
            style={{ backgroundColor: couleur }}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-widest mb-0.5">
              Lot de travaux
            </p>
            <h2 className="text-white font-bold text-lg leading-tight line-clamp-2">
              {lotName}
            </h2>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-2xl font-bold text-white leading-none">
                {budget.toLocaleString('fr-FR')}&thinsp;€
              </span>
              <span className="text-xs text-slate-500">budget estimé</span>
              {totalDocs > 0 && (
                <span className="text-xs text-slate-500">
                  · {totalDocs} document{totalDocs > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Actions : comparateur + ajouter un document */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {canCompare && (
                <button
                  onClick={() => setShowComparateur((v) => !v)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 border transition-all ${
                    showComparateur
                      ? 'bg-blue-500/20 border-blue-500/30 text-blue-300'
                      : 'bg-white/[0.05] border-white/[0.08] text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 hover:border-blue-500/20'
                  }`}
                >
                  <GitCompareArrows className="h-3.5 w-3.5 shrink-0" />
                  {showComparateur ? 'Masquer la comparaison' : `Comparer les devis (${quotes.length})`}
                </button>
              )}

              {canUpload && !pendingFile && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 border border-white/[0.08] bg-white/[0.05] text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 hover:border-emerald-500/20 transition-all"
                  >
                    <PlusCircle className="h-3.5 w-3.5 shrink-0" />
                    Ajouter un document
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_TYPES}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                  />
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 text-slate-500 hover:text-white hover:bg-white/[0.06] rounded-lg transition-all"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Corps scrollable ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* Formulaire d'upload inline — affiché quand un fichier est sélectionné */}
          {pendingFile && (
            <UploadForm
              file={pendingFile}
              nom={uploadNom}
              type={uploadType}
              uploading={uploading}
              onNomChange={setUploadNom}
              onTypeChange={setUploadType}
              onConfirm={handleUpload}
              onCancel={cancelUpload}
            />
          )}

          {/* Comparateur de devis — conditionnel */}
          {showComparateur && canCompare && (
            <ComparateurDevis
              devis={quotes}
              budget={budget}
              onClose={() => setShowComparateur(false)}
            />
          )}

          {/* ── Section budget du lot ── */}
          <LotBudgetSection
            budgetEstime={budget}
            devisTotal={lotBudget.devisTotal}
            payeTotal={lotBudget.payeTotal}
            reste={lotBudget.reste}
            nbDevis={lotBudget.nbDevis}
            nbFactures={lotBudget.nbFactures}
          />

          {/* ── Décomposition budgétaire (market_prices) ── */}
          {lot?.budget_avg_ht != null && (
            <LotDecompositionSection lot={lot} />
          )}

          {totalDocs === 0 && !pendingFile && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FolderOpen className="h-10 w-10 text-slate-700 mb-3" />
              <p className="text-slate-500 text-sm font-medium">Aucun document pour ce lot</p>
              <p className="text-slate-700 text-xs mt-1">
                {canUpload
                  ? 'Ajoutez un document depuis le bouton ci-dessus'
                  : 'Rattachez des documents depuis la section Documents'}
              </p>
            </div>
          )}

          {SECTIONS.map((section) => {
            const sectionDocs = localDocuments.filter((d) =>
              (section.type as string[]).includes(d.document_type),
            );

            return (
              <div key={section.label}>

                {/* Titre de section */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">{section.emoji}</span>
                  <h3 className="text-white text-sm font-semibold">{section.label}</h3>
                  {sectionDocs.length > 0 && (
                    <span className="ml-auto text-xs text-slate-500 font-medium">
                      {sectionDocs.length}
                    </span>
                  )}
                </div>

                {sectionDocs.length === 0 ? (
                  <p className="text-xs text-slate-700 pl-1">{section.emptyText}</p>
                ) : (
                  <ul className="space-y-2">
                    {sectionDocs.map((doc) => (
                      <DocumentRow
                        key={doc.id}
                        doc={doc}
                        chantierId={chantierId}
                        token={token}
                        onAnalysed={(docId, analyseId) => {
                          setLocalDocuments(prev =>
                            prev.map(d => d.id === docId ? { ...d, analyse_id: analyseId } : d),
                          );
                        }}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Sous-composant formulaire upload ──────────────────────────────────────────

interface UploadFormProps {
  file:         File;
  nom:          string;
  type:         DocumentType;
  uploading:    boolean;
  onNomChange:  (v: string) => void;
  onTypeChange: (v: DocumentType) => void;
  onConfirm:    () => void;
  onCancel:     () => void;
}

function UploadForm({
  file,
  nom,
  type,
  uploading,
  onNomChange,
  onTypeChange,
  onConfirm,
  onCancel,
}: UploadFormProps) {
  const sizeLabel = file.size < 1024 * 1024
    ? `${Math.round(file.size / 1024)} Ko`
    : `${(file.size / (1024 * 1024)).toFixed(1)} Mo`;

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-emerald-500/10">
        <PlusCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        <span className="text-xs font-semibold text-emerald-300">Nouveau document</span>
        <button
          onClick={onCancel}
          disabled={uploading}
          className="ml-auto p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
          aria-label="Annuler l'ajout"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Fichier sélectionné */}
        <p className="text-[11px] text-slate-500 truncate">
          <span className="text-slate-400 font-medium">{file.name}</span>
          {' · '}{sizeLabel}
        </p>

        {/* Nom affiché */}
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">
            Nom du document
          </label>
          <input
            type="text"
            value={nom}
            onChange={(e) => onNomChange(e.target.value)}
            placeholder="ex : Devis plomberie — Dupont"
            disabled={uploading}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/40 focus:bg-white/[0.07] transition-all disabled:opacity-50"
          />
        </div>

        {/* Type de document */}
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">
            Type
          </label>
          <div className="flex flex-wrap gap-1.5">
            {DOC_TYPES.map((dt) => (
              <button
                key={dt.value}
                onClick={() => onTypeChange(dt.value)}
                disabled={uploading}
                className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                  type === dt.value
                    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                    : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/[0.12]'
                } disabled:opacity-50`}
              >
                <span>{dt.emoji}</span>
                {dt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onConfirm}
            disabled={uploading || !nom.trim()}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 rounded-lg px-3 py-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                Envoi en cours…
              </>
            ) : (
              <>
                <PlusCircle className="h-3.5 w-3.5 shrink-0" />
                Confirmer l'ajout
              </>
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={uploading}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-2 disabled:opacity-50"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sous-composant budget du lot ──────────────────────────────────────────────

interface LotBudgetSectionProps {
  budgetEstime: number;
  devisTotal:   number;
  payeTotal:    number;
  reste:        number;
  nbDevis:      number;
  nbFactures:   number;
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function LotBudgetSection({
  budgetEstime,
  devisTotal,
  payeTotal,
  reste,
  nbDevis,
  nbFactures,
}: LotBudgetSectionProps) {
  // Aucun montant extractible → affichage minimal (seulement budget estimé + compteurs)
  const hasDevisMontant = devisTotal > 0;
  const hasFactMontant  = payeTotal  > 0;
  const hasAnyMontant   = hasDevisMontant || hasFactMontant;

  // Pourcentage de paiement pour la barre de progression
  const referenceMontant = hasDevisMontant ? devisTotal : budgetEstime;
  const progressPct = referenceMontant > 0
    ? Math.min(100, Math.round((payeTotal / referenceMontant) * 100))
    : 0;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] overflow-hidden">

      {/* Titre */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-white/[0.05]">
        <span className="text-sm">💰</span>
        <span className="text-xs font-semibold text-white">Budget du lot</span>
      </div>

      {/* Grille 2×2 */}
      <div className="grid grid-cols-2 gap-px bg-white/[0.04]">

        {/* Budget estimé */}
        <div className="bg-[#0a0f1e] px-4 py-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">
            Budget estimé
          </p>
          <p className="text-white font-bold text-base leading-none">
            {fmt(budgetEstime)}&thinsp;<span className="text-slate-400 text-xs font-medium">€</span>
          </p>
          <p className="text-slate-600 text-[11px] mt-1">IA — valeur indicative</p>
        </div>

        {/* Devis signé */}
        <div className="bg-[#0a0f1e] px-4 py-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">
            Devis signé
          </p>
          {hasDevisMontant ? (
            <>
              <p className="text-blue-300 font-bold text-base leading-none">
                {fmt(devisTotal)}&thinsp;<span className="text-blue-400/70 text-xs font-medium">€</span>
              </p>
              <p className="text-slate-600 text-[11px] mt-1">
                {nbDevis} devis · extrait du nom
              </p>
            </>
          ) : (
            <>
              <p className="text-slate-600 font-semibold text-base leading-none">–</p>
              <p className="text-slate-700 text-[11px] mt-1">
                {nbDevis > 0
                  ? `${nbDevis} devis · montant non détecté`
                  : 'Aucun devis ajouté'}
              </p>
            </>
          )}
        </div>

        {/* Déjà payé */}
        <div className="bg-[#0a0f1e] px-4 py-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">
            Déjà payé
          </p>
          {hasFactMontant ? (
            <>
              <p className="text-emerald-400 font-bold text-base leading-none">
                {fmt(payeTotal)}&thinsp;<span className="text-emerald-500/70 text-xs font-medium">€</span>
              </p>
              <p className="text-slate-600 text-[11px] mt-1">
                {nbFactures} facture{nbFactures > 1 ? 's' : ''} · extrait du nom
              </p>
            </>
          ) : (
            <>
              <p className="text-slate-600 font-semibold text-base leading-none">–</p>
              <p className="text-slate-700 text-[11px] mt-1">
                {nbFactures > 0
                  ? `${nbFactures} facture${nbFactures > 1 ? 's' : ''} · montant non détecté`
                  : 'Aucune facture ajoutée'}
              </p>
            </>
          )}
        </div>

        {/* Reste à payer */}
        <div className="bg-[#0a0f1e] px-4 py-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">
            Reste à payer
          </p>
          {hasAnyMontant ? (
            <>
              <p className={`font-bold text-base leading-none ${
                reste <= 0 ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {reste <= 0 ? '✓ Soldé' : `${fmt(reste)}\u2009€`}
              </p>
              <p className="text-slate-600 text-[11px] mt-1">
                {reste <= 0 ? 'Lot entièrement réglé' : 'Basé sur devis / factures'}
              </p>
            </>
          ) : (
            <>
              <p className="text-slate-600 font-semibold text-base leading-none">–</p>
              <p className="text-slate-700 text-[11px] mt-1">Données insuffisantes</p>
            </>
          )}
        </div>
      </div>

      {/* Barre de progression paiement — uniquement si données disponibles */}
      {hasAnyMontant && progressPct > 0 && (
        <div className="px-4 py-3 border-t border-white/[0.05]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-slate-500">Avancement paiement</span>
            <span className="text-[11px] text-slate-400 font-semibold">{progressPct}%</span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progressPct}%`,
                background: progressPct >= 100
                  ? '#34d399'
                  : `linear-gradient(90deg, #3b82f6, #34d399)`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sous-composant décomposition budgétaire ───────────────────────────────────

function LotDecompositionSection({ lot }: { lot: LotChantier }) {
  const avg = lot.budget_avg_ht!;
  const min = lot.budget_min_ht ?? avg;
  const max = lot.budget_max_ht ?? avg;
  const mat = lot.materiaux_ht ?? 0;
  const mo  = lot.main_oeuvre_ht ?? 0;
  const div = lot.divers_ht ?? 0;
  const total = mat + mo + div;

  const pct = (v: number) =>
    total > 0 ? Math.round((v / total) * 100) : 0;

  const rows: { label: string; value: number; color: string }[] = [
    { label: 'Matériaux',    value: mat, color: '#60a5fa' },
    { label: "Main-d'œuvre", value: mo,  color: '#34d399' },
    { label: 'Divers',       value: div, color: '#94a3b8' },
  ];

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] overflow-hidden">

      {/* Titre */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-white/[0.05]">
        <span className="text-sm">📊</span>
        <span className="text-xs font-semibold text-white">Prix de référence marché</span>
        {lot.unite && (
          <span className="ml-auto text-[10px] text-slate-600 font-medium">
            {lot.quantite?.toLocaleString('fr-FR')}&thinsp;{lot.unite}
          </span>
        )}
      </div>

      {/* Fourchette */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xl font-bold text-white leading-none">
            {avg.toLocaleString('fr-FR')}&thinsp;€
          </span>
          <span className="text-[11px] text-slate-500">
            {min.toLocaleString('fr-FR')} – {max.toLocaleString('fr-FR')} € HT
          </span>
        </div>
        <p className="text-[10px] text-slate-600 mt-0.5">Moyenne marché · hors taxes</p>
      </div>

      {/* Barres décomposition */}
      <div className="px-4 pb-3 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <div
              className="h-1 rounded-full"
              style={{ width: `${pct(row.value)}%`, backgroundColor: row.color, minWidth: '4px', maxWidth: '100%' }}
            />
            <span className="text-[11px] text-slate-400 whitespace-nowrap">
              {row.label}
            </span>
            <span className="ml-auto text-[11px] text-slate-400 font-medium tabular-nums shrink-0">
              {row.value.toLocaleString('fr-FR')}&thinsp;€
              <span className="text-slate-600 ml-1">({pct(row.value)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sous-composant ligne document ─────────────────────────────────────────────

interface DocumentRowProps {
  doc: DocumentChantier;
  chantierId?: string;
  token?: string;
  onAnalysed?: (docId: string, analyseId: string) => void;
}

function DocumentRow({ doc, chantierId, token, onAnalysed }: DocumentRowProps) {
  const emoji = TYPE_EMOJI[doc.document_type] ?? '📄';
  const [analysing, setAnalysing] = useState(false);
  const [localDoc, setLocalDoc] = useState(doc);

  // Sync si le parent rafraîchit
  useEffect(() => { setLocalDoc(doc); }, [doc]);

  const isDevis = localDoc.document_type === 'devis';
  const isAnalysed = !!localDoc.analyse_id;
  const canAnalyse = isDevis && !isAnalysed && !!chantierId && !!token;

  const handleOpen = () => {
    if (localDoc.signedUrl) {
      window.open(localDoc.signedUrl, '_blank', 'noopener,noreferrer');
    }
  };

  async function handleAnalyser() {
    if (!chantierId || !token) { toast.error('Session expirée — rechargez'); return; }
    setAnalysing(true);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${localDoc.id}/analyser`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok || res.status === 409) {
        const analysisId: string = data.analysisId;
        if (analysisId) {
          setLocalDoc(prev => ({ ...prev, analyse_id: analysisId }));
          onAnalysed?.(localDoc.id, analysisId);
          toast.success('Analyse lancée — résultat dans quelques secondes');
        }
      } else {
        toast.error(`Erreur analyse : ${data.error ?? res.status}`);
      }
    } catch {
      toast.error("Erreur réseau lors de l'analyse");
    } finally {
      setAnalysing(false);
    }
  }

  // Lien analyse avec param retour chantier
  const analyseHref = localDoc.analyse_id
    ? `/analyse/${localDoc.analyse_id}?from=chantier&chantierId=${chantierId}`
    : undefined;

  return (
    <li className="flex items-start gap-2.5 bg-white/[0.03] border border-white/[0.05] rounded-xl p-3 hover:bg-white/[0.05] transition-colors">
      <span className="text-base shrink-0 mt-0.5">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-slate-200 text-xs font-medium truncate">{localDoc.nom}</p>
          {isDevis && (
            isAnalysed
              ? <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">✓ Analysé</span>
              : <span className="text-[9px] font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">Non analysé</span>
          )}
        </div>
        <p className="text-slate-600 text-[11px] mt-0.5">
          {formatDate(localDoc.created_at)}
          {localDoc.taille_octets ? ` · ${formatBytes(localDoc.taille_octets)}` : ''}
          {localDoc.mime_type ? ` · ${localDoc.mime_type.split('/').pop()?.toUpperCase()}` : ''}
        </p>
        {/* Boutons analyse */}
        <div className="flex items-center gap-2 mt-1.5">
          {isAnalysed && analyseHref && (
            <a
              href={analyseHref}
              className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Voir l'analyse
            </a>
          )}
          {canAnalyse && (
            <button
              onClick={handleAnalyser}
              disabled={analysing}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
            >
              {analysing ? <><Loader2 className="h-3 w-3 animate-spin" /> Analyse…</> : '⚡ Analyser'}
            </button>
          )}
        </div>
      </div>
      {localDoc.signedUrl && (
        <button
          onClick={handleOpen}
          className="shrink-0 p-1.5 text-slate-600 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-all"
          title="Ouvrir"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}
