import { useState, useEffect, useRef } from "react";
import { X, FileSearch, Upload, PenLine, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import LotSelector from "@/components/chantier/lots/LotSelector";
import { supabase } from "@/integrations/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────────

interface LotOption {
  id: string;
  nom: string;
  emoji?: string | null;
}

interface AnalyseItem {
  id: string;
  file_name: string | null;
  status: string;
  score_label: string | null;
  created_at: string;
  raw_text: unknown;
}

interface AjouterDevisModalProps {
  chantierId: string;
  /** Lot pré-sélectionné (quand ouvert depuis LotCard) */
  preselectedLotId?: string | null;
  lots: LotOption[];
  token: string;
  onClose: () => void;
  onDevisAdded: () => void;
  onLotCreated?: (lot: LotOption) => void;
}

type Tab = "analyses" | "upload" | "manuel";

const TABS: { key: Tab; label: string; icon: typeof FileSearch }[] = [
  { key: "analyses", label: "Mes analyses", icon: FileSearch },
  { key: "upload", label: "Uploader", icon: Upload },
  { key: "manuel", label: "Saisie manuelle", icon: PenLine },
];

const SCORE_COLORS: Record<string, string> = {
  VERT: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  ORANGE: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  ROUGE: "bg-red-500/20 text-red-300 border-red-500/30",
};

// ── Helper: extract artisan info from analysis ───────────────────────────────

function extractArtisan(raw: unknown): { nom: string; email?: string; phone?: string; siret?: string; montant?: number } | null {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const ent = data?.extracted?.entreprise;
    if (!ent) return null;
    return {
      nom: ent.nom || ent.raison_sociale || "Artisan",
      email: ent.email || undefined,
      phone: ent.telephone || undefined,
      siret: ent.siret || undefined,
      montant: data?.extracted?.devis?.montant_ttc ?? undefined,
    };
  } catch {
    return null;
  }
}

// ── Composant ────────────────────────────────────────────────────────────────

export default function AjouterDevisModal({
  chantierId,
  preselectedLotId = null,
  lots,
  token,
  onClose,
  onDevisAdded,
  onLotCreated,
}: AjouterDevisModalProps) {
  const [tab, setTab] = useState<Tab>("analyses");
  const [lotId, setLotId] = useState<string | null>(preselectedLotId);
  const [lotsList, setLotsList] = useState<LotOption[]>(lots);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Tab 1: analyses
  const [analyses, setAnalyses] = useState<AnalyseItem[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(true);

  // Tab 2: upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadArtisan, setUploadArtisan] = useState("");
  const [uploadMontant, setUploadMontant] = useState("");
  const [uploadEmail, setUploadEmail] = useState("");
  const [uploadPhone, setUploadPhone] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab 3: manual
  const [manuelNom, setManuelNom] = useState("");
  const [manuelEmail, setManuelEmail] = useState("");
  const [manuelPhone, setManuelPhone] = useState("");
  const [manuelSiret, setManuelSiret] = useState("");
  const [manuelMontant, setManuelMontant] = useState("");
  const [manuelType, setManuelType] = useState("");

  // Fetch user analyses
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("analyses")
        .select("id, file_name, status, score_label, created_at, raw_text")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false });

      setAnalyses(data ?? []);
      setLoadingAnalyses(false);
    })();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── API helpers ──────────────────────────────────────────────────────────

  const postDevis = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/chantier/${chantierId}/devis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Erreur" }));
      throw new Error(err.error || "Erreur création devis");
    }
    return res.json();
  };

  // ── Tab 1: Import analyse ────────────────────────────────────────────────

  const handleImportAnalyse = async (analyse: AnalyseItem) => {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const artisan = extractArtisan(analyse.raw_text);
      await postDevis({
        analyseId: analyse.id,
        lotId,
        nom: artisan?.nom || analyse.file_name || "Artisan",
        artisanEmail: artisan?.email,
        artisanPhone: artisan?.phone,
        artisanSiret: artisan?.siret,
        montant: artisan?.montant,
        description: "Devis importé",
      });

      setSuccess(true);
      onDevisAdded();
      setTimeout(onClose, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  // ── Tab 2: Upload ────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!uploadFile || saving) return;
    setSaving(true);
    setError(null);

    try {
      // 1. Upload document
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("nom", uploadFile.name);
      formData.append("documentType", "devis");
      if (lotId) formData.append("lotId", lotId);

      const uploadRes = await fetch(`/api/chantier/${chantierId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Erreur upload du document");
      const { document: doc } = await uploadRes.json();

      // 2. Create devis_chantier entry
      await postDevis({
        lotId,
        nom: uploadArtisan.trim() || uploadFile.name,
        artisanEmail: uploadEmail.trim() || undefined,
        artisanPhone: uploadPhone.trim() || undefined,
        montant: uploadMontant ? parseFloat(uploadMontant) : undefined,
        statut: "recu",
        description: "Devis uploadé",
      });

      // 3. Optionally trigger analysis
      if (doc?.id) {
        fetch(`/api/chantier/${chantierId}/documents/${doc.id}/analyser`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {}); // fire & forget
      }

      setSuccess(true);
      onDevisAdded();
      setTimeout(onClose, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  // ── Tab 3: Manual ────────────────────────────────────────────────────────

  const handleManuel = async () => {
    if (!manuelNom.trim() || saving) return;
    setSaving(true);
    setError(null);

    try {
      await postDevis({
        lotId,
        nom: manuelNom.trim(),
        artisanEmail: manuelEmail.trim() || undefined,
        artisanPhone: manuelPhone.trim() || undefined,
        artisanSiret: manuelSiret.trim() || undefined,
        montant: manuelMontant ? parseFloat(manuelMontant) : undefined,
        description: manuelType.trim() || "Travaux",
        statut: "accord_verbal",
      });

      setSuccess(true);
      onDevisAdded();
      setTimeout(onClose, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  // ── Lot created callback ─────────────────────────────────────────────────

  const handleLotCreated = (lot: LotOption) => {
    setLotsList((prev) => [...prev, lot]);
    onLotCreated?.(lot);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const inputCls = "w-full bg-white/[0.05] border border-white/[0.08] text-white text-xs rounded-lg px-2.5 py-2 outline-none focus:border-blue-500/50 placeholder:text-slate-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-[#162035] border border-white/[0.08] rounded-2xl shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <h3 className="text-white font-bold text-base">Ajouter un devis</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06]">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                tab === key
                  ? "text-blue-400 border-b-2 border-blue-400 bg-blue-500/5"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Lot selector (unless preselected) */}
          {!preselectedLotId && (
            <LotSelector
              lots={lotsList}
              selectedLotId={lotId}
              onSelect={setLotId}
              chantierId={chantierId}
              token={token}
              onLotCreated={handleLotCreated}
              disabled={saving}
            />
          )}

          {/* Success state */}
          {success && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm py-4 justify-center">
              <CheckCircle2 className="h-5 w-5" />
              Devis ajouté
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {/* ── Tab 1: Mes analyses ──────────────────────────────────────── */}
          {tab === "analyses" && !success && (
            <>
              {loadingAnalyses ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                </div>
              ) : analyses.length === 0 ? (
                <p className="text-slate-500 text-xs text-center py-6">
                  Aucune analyse disponible. Analysez un devis d'abord sur VerifierMonDevis.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-slate-500 text-[11px]">Sélectionnez une analyse pour l'importer :</p>
                  {analyses.map((a) => {
                    const artisan = extractArtisan(a.raw_text);
                    const score = a.score_label?.toUpperCase() ?? "";
                    const scoreCls = SCORE_COLORS[score] || "bg-slate-500/20 text-slate-400 border-slate-500/30";
                    return (
                      <button
                        key={a.id}
                        onClick={() => handleImportAnalyse(a)}
                        disabled={saving}
                        className="w-full text-left bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] rounded-xl p-3 transition-all disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-medium truncate">
                              {artisan?.nom || a.file_name || "Analyse"}
                            </p>
                            <p className="text-slate-500 text-[10px] mt-0.5">
                              {new Date(a.created_at).toLocaleDateString("fr-FR")}
                              {artisan?.montant ? ` · ${artisan.montant.toLocaleString("fr-FR")} € TTC` : ""}
                            </p>
                          </div>
                          {score && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${scoreCls}`}>
                              {score}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── Tab 2: Upload ────────────────────────────────────────────── */}
          {tab === "upload" && !success && (
            <div className="space-y-3">
              {/* File input */}
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Fichier devis</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-600/20 file:text-blue-400 hover:file:bg-blue-600/30 file:cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Nom artisan</label>
                  <input type="text" value={uploadArtisan} onChange={(e) => setUploadArtisan(e.target.value)} placeholder="Ex: M. Dupont" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Montant TTC</label>
                  <input type="number" value={uploadMontant} onChange={(e) => setUploadMontant(e.target.value)} placeholder="0" className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Email</label>
                  <input type="email" value={uploadEmail} onChange={(e) => setUploadEmail(e.target.value)} placeholder="artisan@email.com" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Téléphone</label>
                  <input type="tel" value={uploadPhone} onChange={(e) => setUploadPhone(e.target.value)} placeholder="06 12 34 56 78" className={inputCls} />
                </div>
              </div>

              <button
                onClick={handleUpload}
                disabled={!uploadFile || saving}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white text-xs font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Uploader et analyser
              </button>
              <p className="text-slate-600 text-[10px] text-center">
                Le devis sera analysé automatiquement par VerifierMonDevis
              </p>
            </div>
          )}

          {/* ── Tab 3: Saisie manuelle ───────────────────────────────────── */}
          {tab === "manuel" && !success && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Nom artisan *</label>
                <input type="text" value={manuelNom} onChange={(e) => setManuelNom(e.target.value)} placeholder="Ex: Plomberie Dupont" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Email</label>
                  <input type="email" value={manuelEmail} onChange={(e) => setManuelEmail(e.target.value)} placeholder="artisan@email.com" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Téléphone</label>
                  <input type="tel" value={manuelPhone} onChange={(e) => setManuelPhone(e.target.value)} placeholder="06 12 34 56 78" className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">SIRET</label>
                  <input type="text" value={manuelSiret} onChange={(e) => setManuelSiret(e.target.value)} placeholder="123 456 789 00012" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Montant TTC</label>
                  <input type="number" value={manuelMontant} onChange={(e) => setManuelMontant(e.target.value)} placeholder="0" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Type de travaux</label>
                <input type="text" value={manuelType} onChange={(e) => setManuelType(e.target.value)} placeholder="Ex: Plomberie, Carrelage..." className={inputCls} />
              </div>

              <button
                onClick={handleManuel}
                disabled={!manuelNom.trim() || saving}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white text-xs font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
                Ajouter (accord verbal)
              </button>
              <p className="text-slate-600 text-[10px] text-center">
                Idéal pour un accord à l'oral — vous pourrez ajouter le devis officiel plus tard
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
