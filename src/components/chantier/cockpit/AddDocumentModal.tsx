/**
 * AddDocumentModal — upload intelligent de documents (devis ou facture).
 *
 * Flux :
 *  1. Choix du type (devis / facture / achat matériaux)
 *  2. Sélection du fichier → formulaire s'ouvre immédiatement (non-bloquant)
 *  3. En arrière-plan : upload du fichier + extraction IA (factures seulement)
 *  4. L'IA pré-remplit nom/montant + suggère l'artisan matching
 *  5. Si aucun lot matchant : proposition de créer la ligne artisan
 *  6. Sauvegarde
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  X, FileUp, Receipt, ShoppingCart, Wrench, FileText,
  Loader2, Check, AlertTriangle, Plus, ChevronDown, Sparkles,
} from 'lucide-react';
import { getSemanticEmoji } from '@/lib/lotUtils';

// ── Supabase ──────────────────────────────────────────────────────────────────

const _sb = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL,
  (import.meta as any).env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

async function freshToken(fallback: string): Promise<string> {
  const { data: { session } } = await _sb.auth.getSession();
  return session?.access_token ?? fallback;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type DocType = 'devis' | 'facture' | 'achat_materiaux';
type UploadStep = 'type' | 'form' | 'done';

interface Lot { id: string; nom: string; emoji: string | null; }

interface ExtractResult {
  confidence: 'high' | 'low';
  artisan_nom:   string | null;
  montant_total: number | null;
  type_facture:  'acompte' | 'solde' | 'facture' | null;
  pct_acompte:   number | null;
  date_facture:  string | null;
}

export interface AddDocumentModalProps {
  chantierId: string;
  token:      string;
  lots:       Lot[];
  onClose:    () => void;
  onSuccess:  () => void;
}

// ── Config type ───────────────────────────────────────────────────────────────

const TYPE_CFG: Record<DocType, {
  label:    string;
  icon:     React.ReactNode;
  desc:     string;
  color:    string;
}> = {
  devis: {
    label: 'Devis',
    icon:  <FileText className="h-5 w-5" />,
    desc:  'Devis reçu d\'un artisan ou prestataire',
    color: 'border-blue-500 bg-blue-50 text-blue-700',
  },
  facture: {
    label: 'Facture',
    icon:  <Receipt className="h-5 w-5" />,
    desc:  'Facture d\'acompte ou solde',
    color: 'border-emerald-500 bg-emerald-50 text-emerald-700',
  },
  achat_materiaux: {
    label: 'Achat / Ticket',
    icon:  <ShoppingCart className="h-5 w-5" />,
    desc:  'Achat matériaux ou ticket de caisse',
    color: 'border-purple-500 bg-purple-50 text-purple-700',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findMatchingLot(artisanNom: string, lots: Lot[]): Lot | null {
  if (!artisanNom) return null;
  const needle = normalizeName(artisanNom);
  // Exact match first
  let match = lots.find(l => normalizeName(l.nom) === needle);
  if (match) return match;
  // Partial match (artisan name includes lot name or vice versa)
  match = lots.find(l => {
    const lotN = normalizeName(l.nom);
    return needle.includes(lotN) || lotN.includes(needle);
  });
  return match ?? null;
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function AddDocumentModal({
  chantierId, token, lots, onClose, onSuccess,
}: AddDocumentModalProps) {
  const [step,        setStep]       = useState<UploadStep>('type');
  const [docType,     setDocType]    = useState<DocType>('devis');
  const [file,        setFile]       = useState<File | null>(null);
  const [nom,         setNom]        = useState('');
  const [montant,     setMontant]    = useState('');
  const [lotId,       setLotId]      = useState('');
  const [dragging,    setDragging]   = useState(false);
  const [uploading,   setUploading]  = useState(false);
  const [extracting,  setExtracting] = useState(false);
  const [extracted,   setExtracted]  = useState<ExtractResult | null>(null);
  const [error,       setError]      = useState<string | null>(null);
  const [createLot,   setCreateLot]  = useState(false);
  const [newLotName,  setNewLotName] = useState('');
  const [bucketPath,  setBucketPath] = useState<string | null>(null);

  const fileRef  = useRef<HTMLInputElement>(null);
  const isFact   = docType === 'facture' || docType === 'achat_materiaux';

  // ── Sélection fichier ─────────────────────────────────────────────────────

  function handleFile(f: File) {
    setFile(f);
    // Pré-remplir nom depuis le nom de fichier
    const guessName = f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    setNom(guessName);
    setStep('form');
    // Upload en arrière-plan
    uploadInBackground(f);
  }

  // ── Upload en arrière-plan ────────────────────────────────────────────────

  const uploadInBackground = useCallback(async (f: File) => {
    setUploading(true);
    try {
      const bearer = await freshToken(token);

      // 1. Obtenir URL signée pour upload direct
      const urlRes = await fetch(`/api/chantier/${chantierId}/upload-url`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: f.name }),
      });
      if (!urlRes.ok) { setUploading(false); return; }
      const { signedUrl, bucketPath: bp } = await urlRes.json();

      // 2. Upload direct vers storage
      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': f.type || 'application/octet-stream' },
        body: f,
      });
      if (!putRes.ok) { setUploading(false); return; }

      setBucketPath(bp);
      setUploading(false);

      // 3. Extraction IA si facture (non-bloquant)
      if (isFact) {
        setExtracting(true);
        try {
          const extRes = await fetch(
            `/api/chantier/${chantierId}/documents/extract-invoice`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ bucketPath: bp }),
            },
          );
          if (extRes.ok) {
            const ext: ExtractResult = await extRes.json();
            setExtracted(ext);

            // Pré-remplir les champs si confiance haute
            if (ext.confidence === 'high') {
              if (ext.artisan_nom && !nom.trim()) setNom(ext.artisan_nom);
              if (ext.montant_total && !montant) setMontant(String(ext.montant_total));

              // Matching artisan → lot
              const match = findMatchingLot(ext.artisan_nom ?? '', lots);
              if (match) {
                setLotId(match.id);
              } else if (ext.artisan_nom) {
                // Pas de lot trouvé → proposer la création
                setNewLotName(ext.artisan_nom);
                setCreateLot(true);
              }
            }
          }
        } catch { /* silencieux */ }
        setExtracting(false);
      }
    } catch {
      setUploading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chantierId, token, isFact, lots]);

  // ── Sauvegarde ────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!nom.trim() || !file) return;
    setError(null);
    setUploading(true);

    try {
      const bearer = await freshToken(token);

      // Si l'upload n'est pas encore terminé (edge case), on attend qu'il soit fait
      // En pratique bucketPath est déjà set car le form est accessible après upload
      let bp = bucketPath;
      if (!bp) {
        // Fallback : ré-upload si nécessaire
        const urlRes = await fetch(`/api/chantier/${chantierId}/upload-url`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name }),
        });
        if (!urlRes.ok) throw new Error('Erreur upload');
        const { signedUrl, bucketPath: newBp } = await urlRes.json();
        await fetch(signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        bp = newBp;
      }

      // Créer le lot si demandé
      let finalLotId = lotId || null;
      if (createLot && newLotName.trim() && !finalLotId) {
        const lotRes = await fetch(`/api/chantier/${chantierId}/lots`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ nom: newLotName.trim(), emoji: getSemanticEmoji(newLotName.trim()) }),
        });
        if (lotRes.ok) {
          const lotData = await lotRes.json();
          finalLotId = lotData.lot?.id ?? null;
        }
      }

      // Enregistrer le document
      const docType_ = docType === 'achat_materiaux' ? 'facture' : docType;
      const regRes = await fetch(`/api/chantier/${chantierId}/documents/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom:          nom.trim(),
          documentType: docType_,
          depenseType:  docType,
          lotId:        finalLotId,
          bucketPath:   bp,
          nomFichier:   file.name,
          mimeType:     file.type || null,
          tailleOctets: file.size || null,
          montant:      montant ? parseFloat(montant) : null,
          factureStatut: isFact ? 'recue' : null,
          paymentTerms: extracted?.type_facture && extracted.type_facture !== 'facture'
            ? {
                type_facture:    extracted.type_facture,
                pct:             extracted.pct_acompte ?? 0,
                delai_jours:     0,
                numero_facture:  null,
              }
            : null,
        }),
      });

      if (!regRes.ok) {
        const d = await regRes.json().catch(() => ({}));
        throw new Error(d.error ?? `Erreur ${regRes.status}`);
      }

      // Si devis → déclencher l'analyse en arrière-plan
      if (docType === 'devis') {
        const regData = await regRes.json();
        const docId   = regData.document?.id;
        if (docId) {
          fetch(`/api/chantier/${chantierId}/documents/${docId}/analyser`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          }).catch(() => {});
        }
      }

      setStep('done');
      setTimeout(() => { onSuccess(); onClose(); }, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setUploading(false);
    }
  }

  const canSave = nom.trim().length > 0 && (file !== null) && !uploading;

  // ── Drag & drop ────────────────────────────────────────────────────────────

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Ajouter un document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[80vh] overflow-y-auto">

          {/* ── Étape 1 : Choix du type ─────────────────────────────────── */}
          {step === 'type' && (
            <>
              <p className="text-sm text-gray-500">Quel type de document souhaitez-vous ajouter ?</p>
              <div className="space-y-2">
                {(Object.entries(TYPE_CFG) as [DocType, typeof TYPE_CFG[DocType]][]).map(([type, cfg]) => (
                  <button
                    key={type}
                    onClick={() => { setDocType(type); fileRef.current?.click(); }}
                    className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all text-left"
                  >
                    <span className="text-gray-400">{cfg.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{cfg.label}</p>
                      <p className="text-xs text-gray-400">{cfg.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </>
          )}

          {/* ── Étape 2 : Formulaire ─────────────────────────────────────── */}
          {step === 'form' && (
            <>
              {/* Type pill */}
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${TYPE_CFG[docType].color}`}>
                  {TYPE_CFG[docType].icon}
                  {TYPE_CFG[docType].label}
                </span>
                <button
                  onClick={() => { setFile(null); setBucketPath(null); setExtracted(null); setStep('type'); }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Changer
                </button>
              </div>

              {/* Fichier sélectionné */}
              {file && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl text-sm text-gray-600">
                  <FileUp className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="truncate flex-1">{file.name}</span>
                  {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 shrink-0" />}
                  {!uploading && bucketPath && <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                </div>
              )}

              {/* IA en cours */}
              {extracting && (
                <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 rounded-xl px-3 py-2">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                  L'IA lit votre document pour pré-remplir les champs…
                </div>
              )}

              {/* Suggestion artisan matchée */}
              {extracted?.confidence === 'high' && extracted.artisan_nom && lotId && !extracting && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                  <Check className="h-3.5 w-3.5" />
                  Artisan détecté : <strong>{extracted.artisan_nom}</strong> — classé sur la ligne correspondante
                </div>
              )}

              {/* Nom */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">
                  {isFact ? 'Artisan / Description *' : 'Nom du document *'}
                </label>
                <input
                  value={nom}
                  onChange={e => setNom(e.target.value)}
                  placeholder={isFact ? 'Ex : Plombier Martin, ECO RENOV…' : 'Ex : Devis plomberie salle de bains'}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* Montant + Lot */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">
                    Montant TTC {isFact ? '*' : ''}
                  </label>
                  <div className="relative">
                    <input
                      type="number" inputMode="decimal" min="0" step="0.01"
                      value={montant}
                      onChange={e => setMontant(e.target.value)}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-7 text-sm focus:outline-none focus:border-blue-400"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Lot / Artisan</label>
                  <select
                    value={lotId}
                    onChange={e => { setLotId(e.target.value); if (e.target.value) setCreateLot(false); }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-white"
                  >
                    <option value="">Sans lot</option>
                    {lots.map(l => (
                      <option key={l.id} value={l.id}>{l.emoji ? `${l.emoji} ` : ''}{l.nom}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Type facture détecté */}
              {extracted?.type_facture && extracted.type_facture !== 'facture' && !extracting && (
                <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  {extracted.type_facture === 'acompte'
                    ? `Acompte détecté${extracted.pct_acompte ? ` (${extracted.pct_acompte}%)` : ''} — le statut sera "Reçue — à payer"`
                    : 'Facture de solde détectée'
                  }
                </div>
              )}

              {/* Proposition création lot */}
              {createLot && !lotId && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Aucun artisan correspondant trouvé dans vos lots
                  </p>
                  <p className="text-xs text-amber-600">
                    Créer la ligne pour <strong>{extracted?.artisan_nom ?? newLotName}</strong> ?
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={newLotName}
                      onChange={e => setNewLotName(e.target.value)}
                      placeholder="Nom de l'artisan"
                      className="flex-1 border border-amber-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-amber-400 bg-white"
                    />
                    <button
                      onClick={() => setCreateLot(false)}
                      className="text-xs text-gray-400 hover:text-gray-600 px-2"
                    >
                      Ignorer
                    </button>
                  </div>
                </div>
              )}

              {!createLot && !lotId && extracted?.artisan_nom && !extracting && lots.length > 0 && (
                <button
                  onClick={() => { setCreateLot(true); setNewLotName(extracted.artisan_nom ?? ''); }}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Plus className="h-3 w-3" />
                  Créer la ligne artisan « {extracted.artisan_nom} »
                </button>
              )}

              {error && (
                <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
              )}
            </>
          )}

          {/* ── Étape 3 : Succès ──────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <Check className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-gray-800">Document enregistré</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'form' && (
          <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl disabled:opacity-50 transition-colors"
            >
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
