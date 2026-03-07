import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus, X, Upload, Trash2, Loader2, CheckCircle2, AlertCircle,
  Info, ChevronDown, ChevronUp,
} from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type {
  FactureApport, FactureFinancement, BudgetStoredState,
  StatutPaiement, ModeDeblocage, DonneesIA,
} from "@/types/budget";

// ── Minimal Chantier shape needed here ────────────────────────────────────────
interface Chantier {
  id: string;
  budget: number | null;
  apport: number | null;
  credit: number | null;
  taux_interet: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const STORAGE_KEY = (id: string) => `chantier_budget_v2_${id}`;

const EMPTY_STATE: BudgetStoredState = {
  facturesApport: [],
  facturesFinancement: [],
  mensualite: "",
  duree: "",
};

function loadState(chantierId: string): BudgetStoredState {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY(chantierId)) || "{}");
  } catch {
    return EMPTY_STATE;
  }
}

function getAidesPercues(chantierId: string): number {
  try {
    const raw = localStorage.getItem(`chantier_aides_${chantierId}`);
    const aides: Array<{ statut: string; montant: number }> = JSON.parse(raw || "[]");
    return aides.filter((a) => a.statut === "percu").reduce((acc, a) => acc + a.montant, 0);
  } catch {
    return 0;
  }
}

const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png", "heic"];
const MAX_SIZE = 10 * 1024 * 1024;

const INPUT = "w-full bg-[#1c2a42] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500";

// ── Form state types ──────────────────────────────────────────────────────────
interface FormApport {
  entreprise: string; objetTravaux: string; montantTTC: string;
  dateFacture: string; statutPaiement: StatutPaiement;
  montantAcompte: string; commentaire: string;
  documentUrl: string; luParIA: boolean;
}
interface FormFinancement extends FormApport {
  modeDeblocage: ModeDeblocage;
}

const emptyApport: FormApport = {
  entreprise: "", objetTravaux: "", montantTTC: "", dateFacture: "",
  statutPaiement: "total", montantAcompte: "", commentaire: "",
  documentUrl: "", luParIA: false,
};
const emptyFinancement: FormFinancement = {
  ...emptyApport, modeDeblocage: "compte_courant",
};

// ── Upload + IA ───────────────────────────────────────────────────────────────
async function uploadAndRead(
  file: File,
  userId: string,
  onUploadDone: (filePath: string) => void,
  onIA: (data: DonneesIA | null) => void,
  onError: (msg: string) => void,
) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXT.includes(ext)) {
    onError("Format non supporté (PDF, JPG, PNG, HEIC)");
    return;
  }
  if (file.size > MAX_SIZE) {
    onError("Fichier trop lourd (max 10 Mo)");
    return;
  }

  const filePath = `${userId}/factures/${Date.now()}.${ext}`;
  const blob = new Blob([await file.arrayBuffer()], { type: file.type });

  const { error: uploadError } = await supabase.storage
    .from("devis")
    .upload(filePath, blob, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (uploadError) {
    onError("Échec de l'upload");
    return;
  }

  onUploadDone(filePath);

  // Appel edge function read-invoice (réutilise Gemini via pipeline existant)
  const { data, error } = await supabase.functions.invoke("read-invoice", {
    body: { file_path: filePath },
  });

  if (error || !data?.success) {
    onIA(null);
  } else {
    onIA(data.donnees as DonneesIA);
  }
}

// ── DropZone ──────────────────────────────────────────────────────────────────
function DropZone({
  onFile, loading,
}: { onFile: (f: File) => void; loading: boolean }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = (f: File | undefined) => f && onFile(f);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
      onClick={() => !loading && inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${
        dragging ? "border-blue-400 bg-blue-500/10" : "border-white/15 hover:border-white/30"
      } ${loading ? "opacity-60 cursor-wait" : ""}`}
    >
      {loading ? (
        <>
          <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
          <p className="text-sm text-slate-400">Lecture IA en cours…</p>
        </>
      ) : (
        <>
          <Upload className="h-6 w-6 text-slate-500" />
          <p className="text-sm text-slate-400 text-center">
            Glissez votre facture ici ou <span className="text-blue-400 underline">parcourir</span>
          </p>
          <p className="text-xs text-slate-600">PDF, JPG, PNG, HEIC — max 10 Mo</p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.heic"
        onChange={(e) => handle(e.target.files?.[0])}
      />
    </div>
  );
}

// ── Statut badge ──────────────────────────────────────────────────────────────
function StatutBadge({ s }: { s: StatutPaiement }) {
  return s === "total"
    ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">Payé</span>
    : <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Acompte</span>;
}

// ── ModeBadge ─────────────────────────────────────────────────────────────────
function ModeBadge({ m }: { m: ModeDeblocage }) {
  return m === "compte_courant"
    ? <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">→ Mon compte</span>
    : <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400">→ Fournisseur</span>;
}

// ── Barre de progression ──────────────────────────────────────────────────────
function ProgressBar({ pct, alert }: { pct: number; alert?: boolean }) {
  const color = pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-blue-500";
  return (
    <div className="w-full bg-[#1c2a42] rounded-full h-1.5">
      <div
        className={`${alert && pct >= 90 ? "bg-red-500" : color} h-1.5 rounded-full transition-all duration-500`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

// ── Sous-onglet 1 : Apport personnel ─────────────────────────────────────────
function ApportTab({
  chantier, user, state, aidesPercues,
  onSaveMain, main, setMain,
  onSaveState,
}: {
  chantier: Chantier;
  user: SupabaseUser | null;
  state: BudgetStoredState;
  aidesPercues: number;
  onSaveMain: () => void;
  main: { budget: string; apport: string };
  setMain: (m: { budget: string; apport: string }) => void;
  onSaveState: (s: BudgetStoredState) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormApport>(emptyApport);
  const [uploading, setUploading] = useState(false);

  const apportPersonnel = parseFloat(main.apport) || 0;
  const totalPaye = state.facturesApport.reduce((acc, f) => acc + f.montantPaye, 0);
  const apportRestant = apportPersonnel - totalPaye;
  const pct = apportPersonnel > 0 ? Math.round((totalPaye / apportPersonnel) * 100) : 0;

  const handleFile = useCallback(async (file: File) => {
    if (!user) return;
    setUploading(true);
    await uploadAndRead(
      file, user.id,
      (filePath) => setForm((f) => ({ ...f, documentUrl: filePath })),
      (donnees) => {
        if (donnees) {
          setForm((f) => ({
            ...f,
            entreprise: donnees.entreprise || f.entreprise,
            objetTravaux: donnees.objet || f.objetTravaux,
            montantTTC: String(donnees.montant_ttc || f.montantTTC),
            dateFacture: donnees.date || f.dateFacture,
            luParIA: true,
          }));
          toast.success("Facture lue par l'IA ✓");
        } else {
          setForm((f) => ({ ...f, luParIA: false }));
          toast.warning("Lecture IA impossible — veuillez saisir manuellement");
        }
        setUploading(false);
      },
      (msg) => { toast.error(msg); setUploading(false); },
    );
  }, [user]);

  const handleSave = () => {
    if (!form.entreprise || !form.montantTTC) {
      toast.error("Nom de l'entreprise et montant requis");
      return;
    }
    const montantTTC = parseFloat(form.montantTTC) || 0;
    const montantAcompte = parseFloat(form.montantAcompte) || 0;
    const montantPaye = form.statutPaiement === "total" ? montantTTC : montantAcompte;
    const facture: FactureApport = {
      id: crypto.randomUUID(),
      entreprise: form.entreprise,
      objetTravaux: form.objetTravaux,
      montantTTC,
      dateFacture: form.dateFacture,
      statutPaiement: form.statutPaiement,
      montantPaye,
      commentaire: form.commentaire || undefined,
      documentUrl: form.documentUrl || undefined,
      luParIA: form.luParIA,
      createdAt: new Date().toISOString(),
    };
    onSaveState({ ...state, facturesApport: [...state.facturesApport, facture] });
    setForm(emptyApport);
    setShowForm(false);
    toast.success("Facture enregistrée");
  };

  const handleDelete = (id: string) => {
    onSaveState({ ...state, facturesApport: state.facturesApport.filter((f) => f.id !== id) });
  };

  return (
    <div className="space-y-5">
      {/* Section A — Config budget */}
      <div className="bg-[#162035] border border-white/10 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-4">Configuration du budget</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Enveloppe totale (€)</label>
            <input
              type="number" value={main.budget} placeholder="100000"
              onChange={(e) => setMain({ ...main, budget: e.target.value })}
              onBlur={onSaveMain} className={INPUT}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Apport personnel (€)</label>
            <input
              type="number" value={main.apport} placeholder="30000"
              onChange={(e) => setMain({ ...main, apport: e.target.value })}
              onBlur={onSaveMain} className={INPUT}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              Aides déduites (€)
              <span className="ml-1 text-slate-600 text-[10px]">auto depuis Aides & Subventions</span>
            </label>
            <input
              type="number" value={aidesPercues} readOnly
              className={`${INPUT} opacity-50 cursor-not-allowed`}
            />
          </div>
        </div>
      </div>

      {/* Section B — Factures apport */}
      <div className="bg-[#162035] border border-white/10 rounded-xl p-5">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-white font-semibold">Factures réglées sur mon apport personnel</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Glissez vos factures (pas les devis) pour suivre vos dépenses sur apport
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 shrink-0 ml-4"
            >
              <Plus className="h-4 w-4" /> Ajouter
            </button>
          )}
        </div>

        {/* Formulaire inline */}
        {showForm && (
          <div className="mt-4 bg-[#1c2a42] rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-white">Nouvelle facture — apport</h3>
              <button onClick={() => { setShowForm(false); setForm(emptyApport); }}>
                <X className="h-4 w-4 text-slate-400 hover:text-white" />
              </button>
            </div>

            <DropZone onFile={handleFile} loading={uploading} />

            {form.luParIA && (
              <div className="flex items-center gap-1.5 text-xs text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Lu par IA — vérifiez et corrigez si nécessaire
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nom de l'entreprise *</label>
                <input value={form.entreprise} onChange={(e) => setForm({ ...form, entreprise: e.target.value })}
                  placeholder="Ex: Entreprise Martin" className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Objet des travaux</label>
                <input value={form.objetTravaux} onChange={(e) => setForm({ ...form, objetTravaux: e.target.value })}
                  placeholder="Ex: Pose carrelage salle de bain" className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Montant total TTC (€) *</label>
                <input type="number" value={form.montantTTC} onChange={(e) => setForm({ ...form, montantTTC: e.target.value })}
                  placeholder="5000" className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Date de la facture</label>
                <input type="text" value={form.dateFacture} onChange={(e) => setForm({ ...form, dateFacture: e.target.value })}
                  placeholder="JJ/MM/AAAA" className={INPUT} />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-2 block">Statut du paiement</label>
              <div className="flex flex-wrap gap-4">
                {(["total", "acompte"] as StatutPaiement[]).map((v) => (
                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio" name="statut-apport" value={v}
                      checked={form.statutPaiement === v}
                      onChange={() => setForm({ ...form, statutPaiement: v })}
                      className="accent-blue-500"
                    />
                    <span className="text-sm text-slate-300">
                      {v === "total" ? "Payé en totalité" : "Acompte versé"}
                    </span>
                  </label>
                ))}
              </div>
              {form.statutPaiement === "acompte" && (
                <div className="mt-3">
                  <label className="text-xs text-slate-400 mb-1 block">Montant de l'acompte (€)</label>
                  <input type="number" value={form.montantAcompte}
                    onChange={(e) => setForm({ ...form, montantAcompte: e.target.value })}
                    placeholder="1500" className={`${INPUT} max-w-xs`} />
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Commentaire</label>
              <textarea
                value={form.commentaire}
                onChange={(e) => setForm({ ...form, commentaire: e.target.value })}
                rows={2}
                placeholder="Ex: Chèque n°1234567, remis le 15/03/2026"
                className={`${INPUT} resize-none`}
              />
            </div>

            <div className="flex gap-2">
              <button onClick={handleSave}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                Enregistrer cette facture
              </button>
              <button onClick={() => { setShowForm(false); setForm(emptyApport); }}
                className="px-4 py-2 border border-white/20 text-white text-sm rounded-lg hover:bg-white/5">
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Tableau */}
        {state.facturesApport.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-white/10">
                  {["Entreprise", "Objet", "Montant TTC", "Payé", "Statut", "Commentaire", ""].map((h) => (
                    <th key={h} className="text-left text-xs text-slate-500 pb-2 pr-3 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {state.facturesApport.map((f) => (
                  <tr key={f.id}>
                    <td className="py-2.5 pr-3 text-white font-medium">{f.entreprise}</td>
                    <td className="py-2.5 pr-3 text-slate-400 max-w-[150px] truncate">{f.objetTravaux || "—"}</td>
                    <td className="py-2.5 pr-3 text-white">{fmt(f.montantTTC)} €</td>
                    <td className="py-2.5 pr-3 text-green-400 font-medium">{fmt(f.montantPaye)} €</td>
                    <td className="py-2.5 pr-3"><StatutBadge s={f.statutPaiement} /></td>
                    <td className="py-2.5 pr-3 text-slate-500 max-w-[160px] truncate">{f.commentaire || "—"}</td>
                    <td className="py-2.5">
                      <button onClick={() => handleDelete(f.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !showForm && (
          <p className="text-slate-500 text-sm text-center py-6">Aucune facture enregistrée</p>
        )}
      </div>

      {/* Récapitulatif apport */}
      <div className="bg-[#162035] border border-white/10 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-3">Récapitulatif apport</h2>
        <div className="space-y-2 mb-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Apport initial</span>
            <span className="text-white">{fmt(apportPersonnel)} €</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Total payé sur apport</span>
            <span className="text-red-400">−{fmt(totalPaye)} €</span>
          </div>
          <div className="flex justify-between text-sm font-bold border-t border-white/10 pt-2">
            <span className="text-white">Apport restant</span>
            <span className={apportRestant < 0 ? "text-red-400" : "text-green-400"}>
              {fmt(apportRestant)} €
            </span>
          </div>
        </div>
        <ProgressBar pct={pct} />
        <p className="text-xs text-slate-600 mt-1.5 text-right">{pct}% consommé</p>
      </div>
    </div>
  );
}

// ── Sous-onglet 2 : Financement bancaire ──────────────────────────────────────
function FinancementTab({
  chantier, user, state,
  onSaveMain, mainF, setMainF,
  onSaveState,
}: {
  chantier: Chantier;
  user: SupabaseUser | null;
  state: BudgetStoredState;
  onSaveMain: () => void;
  mainF: { credit: string; taux_interet: string };
  setMainF: (m: { credit: string; taux_interet: string }) => void;
  onSaveState: (s: BudgetStoredState) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormFinancement>(emptyFinancement);
  const [uploading, setUploading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const creditTotal = parseFloat(mainF.credit) || 0;
  const taux = parseFloat(mainF.taux_interet) || 0;
  const totalPaye = state.facturesFinancement.reduce((acc, f) => acc + f.montantPaye, 0);
  const montantDebloque = totalPaye;
  const creditRestant = creditTotal - totalPaye;
  const pct = creditTotal > 0 ? Math.round((totalPaye / creditTotal) * 100) : 0;
  const interets = taux > 0 && montantDebloque > 0
    ? (montantDebloque * taux / 100) / 12
    : 0;

  const compteTotal = state.facturesFinancement
    .filter((f) => f.modeDeblocage === "compte_courant")
    .reduce((acc, f) => acc + f.montantPaye, 0);
  const fournisseurTotal = state.facturesFinancement
    .filter((f) => f.modeDeblocage === "virement_fournisseur")
    .reduce((acc, f) => acc + f.montantPaye, 0);

  const handleFile = useCallback(async (file: File) => {
    if (!user) return;
    setUploading(true);
    await uploadAndRead(
      file, user.id,
      (filePath) => setForm((f) => ({ ...f, documentUrl: filePath })),
      (donnees) => {
        if (donnees) {
          setForm((f) => ({
            ...f,
            entreprise: donnees.entreprise || f.entreprise,
            objetTravaux: donnees.objet || f.objetTravaux,
            montantTTC: String(donnees.montant_ttc || f.montantTTC),
            dateFacture: donnees.date || f.dateFacture,
            luParIA: true,
          }));
          toast.success("Facture lue par l'IA ✓");
        } else {
          setForm((f) => ({ ...f, luParIA: false }));
          toast.warning("Lecture IA impossible — veuillez saisir manuellement");
        }
        setUploading(false);
      },
      (msg) => { toast.error(msg); setUploading(false); },
    );
  }, [user]);

  const handleSave = () => {
    if (!form.entreprise || !form.montantTTC) {
      toast.error("Nom de l'entreprise et montant requis");
      return;
    }
    const montantTTC = parseFloat(form.montantTTC) || 0;
    const montantAcompte = parseFloat(form.montantAcompte) || 0;
    const montantPaye = form.statutPaiement === "total" ? montantTTC : montantAcompte;
    const facture: FactureFinancement = {
      id: crypto.randomUUID(),
      entreprise: form.entreprise,
      objetTravaux: form.objetTravaux,
      montantTTC,
      dateFacture: form.dateFacture,
      statutPaiement: form.statutPaiement,
      montantPaye,
      modeDeblocage: form.modeDeblocage,
      commentaire: form.commentaire || undefined,
      documentUrl: form.documentUrl || undefined,
      luParIA: form.luParIA,
      createdAt: new Date().toISOString(),
    };
    onSaveState({ ...state, facturesFinancement: [...state.facturesFinancement, facture] });
    setForm(emptyFinancement);
    setShowForm(false);
    toast.success("Facture enregistrée");
  };

  const handleDelete = (id: string) => {
    onSaveState({ ...state, facturesFinancement: state.facturesFinancement.filter((f) => f.id !== id) });
  };

  return (
    <div className="space-y-5">
      {/* Section A — Config financement */}
      <div className="bg-[#162035] border border-white/10 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-4">Configuration du financement</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Crédit total accordé (€)</label>
            <input type="number" value={mainF.credit} placeholder="70000"
              onChange={(e) => setMainF({ ...mainF, credit: e.target.value })}
              onBlur={onSaveMain} className={INPUT} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Mensualité prévue (€)</label>
            <input type="number" value={state.mensualite} placeholder="650"
              onChange={(e) => onSaveState({ ...state, mensualite: e.target.value })}
              className={INPUT} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Durée totale (mois)</label>
            <input type="number" value={state.duree} placeholder="120"
              onChange={(e) => onSaveState({ ...state, duree: e.target.value })}
              className={INPUT} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Taux d'intérêt annuel (%)</label>
            <input type="number" step="0.01" value={mainF.taux_interet} placeholder="3.5"
              onChange={(e) => setMainF({ ...mainF, taux_interet: e.target.value })}
              onBlur={onSaveMain} className={INPUT} />
          </div>
        </div>

        {/* Montant débloqué + intérêts intercalaires */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-[#1c2a42] rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-0.5">Montant débloqué (auto)</p>
            <p className="text-lg font-bold text-white">{fmt(montantDebloque)} €</p>
            <p className="text-xs text-slate-600">= somme des factures financées payées</p>
          </div>
          <div className="relative bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="text-xs text-amber-400 font-medium">Intérêts intercalaires estimés</p>
              <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="text-amber-400/60 hover:text-amber-400"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-lg font-bold text-amber-400">
              {interets > 0 ? `≈ ${fmt(interets)} €/mois` : "—"}
            </p>
            {showTooltip && (
              <div className="absolute bottom-full left-0 mb-2 w-64 bg-[#0f1b2d] border border-white/20 rounded-lg p-3 text-xs text-slate-300 z-10 shadow-xl">
                Les intérêts intercalaires sont calculés sur le montant débloqué pendant la période de construction.
                Formule : (montant débloqué × taux) ÷ 12
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section B — Factures financement */}
      <div className="bg-[#162035] border border-white/10 rounded-xl p-5">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-white font-semibold">Factures réglées via mon financement bancaire</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Glissez vos factures pour suivre les déblocages
            </p>
          </div>
          {!showForm && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 shrink-0 ml-4">
              <Plus className="h-4 w-4" /> Ajouter
            </button>
          )}
        </div>

        {/* Formulaire inline */}
        {showForm && (
          <div className="mt-4 bg-[#1c2a42] rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-white">Nouvelle facture — financement</h3>
              <button onClick={() => { setShowForm(false); setForm(emptyFinancement); }}>
                <X className="h-4 w-4 text-slate-400 hover:text-white" />
              </button>
            </div>

            <DropZone onFile={handleFile} loading={uploading} />

            {form.luParIA && (
              <div className="flex items-center gap-1.5 text-xs text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Lu par IA — vérifiez et corrigez si nécessaire
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nom de l'entreprise *</label>
                <input value={form.entreprise} onChange={(e) => setForm({ ...form, entreprise: e.target.value })}
                  placeholder="Ex: Entreprise Martin" className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Objet des travaux</label>
                <input value={form.objetTravaux} onChange={(e) => setForm({ ...form, objetTravaux: e.target.value })}
                  placeholder="Ex: Gros œuvre" className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Montant total TTC (€) *</label>
                <input type="number" value={form.montantTTC} onChange={(e) => setForm({ ...form, montantTTC: e.target.value })}
                  placeholder="12000" className={INPUT} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Date de la facture</label>
                <input type="text" value={form.dateFacture} onChange={(e) => setForm({ ...form, dateFacture: e.target.value })}
                  placeholder="JJ/MM/AAAA" className={INPUT} />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-2 block">Statut du paiement</label>
              <div className="flex flex-wrap gap-4">
                {(["total", "acompte"] as StatutPaiement[]).map((v) => (
                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="statut-fin" value={v}
                      checked={form.statutPaiement === v}
                      onChange={() => setForm({ ...form, statutPaiement: v })}
                      className="accent-blue-500" />
                    <span className="text-sm text-slate-300">
                      {v === "total" ? "Payé en totalité" : "Acompte versé"}
                    </span>
                  </label>
                ))}
              </div>
              {form.statutPaiement === "acompte" && (
                <div className="mt-3">
                  <label className="text-xs text-slate-400 mb-1 block">Montant de l'acompte (€)</label>
                  <input type="number" value={form.montantAcompte}
                    onChange={(e) => setForm({ ...form, montantAcompte: e.target.value })}
                    placeholder="3000" className={`${INPUT} max-w-xs`} />
                </div>
              )}
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-2 block">Mode de déblocage bancaire *</label>
              <div className="flex flex-col gap-2">
                {([
                  { v: "compte_courant" as ModeDeblocage, label: "🏦→👤 Remboursé par la banque sur mon compte courant" },
                  { v: "virement_fournisseur" as ModeDeblocage, label: "🏦→🏗️ Viré directement par la banque au fournisseur" },
                ]).map(({ v, label }) => (
                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="mode-fin" value={v}
                      checked={form.modeDeblocage === v}
                      onChange={() => setForm({ ...form, modeDeblocage: v })}
                      className="accent-blue-500" />
                    <span className="text-sm text-slate-300">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Commentaire</label>
              <textarea value={form.commentaire}
                onChange={(e) => setForm({ ...form, commentaire: e.target.value })}
                rows={2}
                placeholder="Ex: Virement du 22/03/2026, réf. VIR-2026-0042, contact: M. Dupont"
                className={`${INPUT} resize-none`} />
            </div>

            <div className="flex gap-2">
              <button onClick={handleSave}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                Enregistrer cette facture
              </button>
              <button onClick={() => { setShowForm(false); setForm(emptyFinancement); }}
                className="px-4 py-2 border border-white/20 text-white text-sm rounded-lg hover:bg-white/5">
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Tableau */}
        {state.facturesFinancement.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-white/10">
                  {["Entreprise", "Objet", "Montant TTC", "Payé", "Mode bancaire", "Statut", "Commentaire", ""].map((h) => (
                    <th key={h} className="text-left text-xs text-slate-500 pb-2 pr-3 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {state.facturesFinancement.map((f) => (
                  <tr key={f.id}>
                    <td className="py-2.5 pr-3 text-white font-medium">{f.entreprise}</td>
                    <td className="py-2.5 pr-3 text-slate-400 max-w-[120px] truncate">{f.objetTravaux || "—"}</td>
                    <td className="py-2.5 pr-3 text-white">{fmt(f.montantTTC)} €</td>
                    <td className="py-2.5 pr-3 text-green-400 font-medium">{fmt(f.montantPaye)} €</td>
                    <td className="py-2.5 pr-3"><ModeBadge m={f.modeDeblocage} /></td>
                    <td className="py-2.5 pr-3"><StatutBadge s={f.statutPaiement} /></td>
                    <td className="py-2.5 pr-3 text-slate-500 max-w-[140px] truncate">{f.commentaire || "—"}</td>
                    <td className="py-2.5">
                      <button onClick={() => handleDelete(f.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !showForm && (
          <p className="text-slate-500 text-sm text-center py-6">Aucune facture enregistrée</p>
        )}
      </div>

      {/* Récapitulatif financement */}
      <div className="bg-[#162035] border border-white/10 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-3">Récapitulatif financement</h2>
        <div className="space-y-2 mb-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Crédit total</span>
            <span className="text-white">{fmt(creditTotal)} €</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Total factures enregistrées</span>
            <span className="text-red-400">−{fmt(totalPaye)} €</span>
          </div>
          {totalPaye > 0 && (
            <>
              <div className="flex justify-between text-xs pl-3">
                <span className="text-slate-500">dont → Mon compte</span>
                <span className="text-blue-400">{fmt(compteTotal)} €</span>
              </div>
              <div className="flex justify-between text-xs pl-3">
                <span className="text-slate-500">dont → Fournisseur</span>
                <span className="text-violet-400">{fmt(fournisseurTotal)} €</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-sm font-bold border-t border-white/10 pt-2">
            <span className="text-white">Reste à débloquer</span>
            <span className={creditRestant < creditTotal * 0.1 && creditTotal > 0 ? "text-red-400" : "text-green-400"}>
              {fmt(Math.max(0, creditRestant))} €
            </span>
          </div>
        </div>
        <ProgressBar pct={pct} alert />
        <p className="text-xs text-slate-600 mt-1.5 text-right">{pct}% du crédit utilisé</p>
        {creditRestant < creditTotal * 0.1 && creditTotal > 0 && creditRestant >= 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Attention : moins de 10% du crédit disponible
          </div>
        )}
        {creditRestant < 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            ⚠️ Dépassement de crédit détecté
          </div>
        )}
      </div>
    </div>
  );
}

// ── Composant principal BudgetTab ─────────────────────────────────────────────
export default function BudgetTab({
  chantier, user, onUpdateChantier,
}: {
  chantier: Chantier;
  user: SupabaseUser | null;
  onUpdateChantier: (u: Partial<Chantier>) => void;
}) {
  const [subTab, setSubTab] = useState<"apport" | "financement">("apport");

  // Champs Supabase
  const [main, setMain] = useState({
    budget: chantier.budget ? String(chantier.budget) : "",
    apport: chantier.apport ? String(chantier.apport) : "",
    credit: chantier.credit ? String(chantier.credit) : "",
    taux_interet: chantier.taux_interet ? String(chantier.taux_interet) : "",
  });

  // État complet localStorage
  const [state, setState] = useState<BudgetStoredState>(() => {
    const stored = loadState(chantier.id);
    return { ...EMPTY_STATE, ...stored };
  });

  const saveMain = useCallback(async () => {
    const updates = {
      budget: parseFloat(main.budget) || null,
      apport: parseFloat(main.apport) || null,
      credit: parseFloat(main.credit) || null,
      taux_interet: parseFloat(main.taux_interet) || null,
    };
    await supabase.from("chantiers").update(updates).eq("id", chantier.id);
    onUpdateChantier(updates);
  }, [main, chantier.id, onUpdateChantier]);

  const saveState = useCallback((updated: BudgetStoredState) => {
    setState(updated);
    localStorage.setItem(STORAGE_KEY(chantier.id), JSON.stringify(updated));
  }, [chantier.id]);

  // Aides auto depuis AidesTab
  const aidesPercues = getAidesPercues(chantier.id);

  // Valeurs globales pour le bandeau
  const budget = parseFloat(main.budget) || 0;
  const apportPersonnel = parseFloat(main.apport) || 0;
  const creditTotal = parseFloat(main.credit) || 0;
  const totalPayeApport = state.facturesApport.reduce((acc, f) => acc + f.montantPaye, 0);
  const totalPayeFinancement = state.facturesFinancement.reduce((acc, f) => acc + f.montantPaye, 0);
  const apportRestant = apportPersonnel - totalPayeApport;
  const creditRestant = creditTotal - totalPayeFinancement;
  const totalEngage = totalPayeApport + totalPayeFinancement;
  const totalPct = budget > 0 ? Math.round((totalEngage / budget) * 100) : 0;

  const bandeauColor =
    totalPct >= 90 ? "text-red-400" : totalPct >= 75 ? "text-amber-400" : "text-green-400";

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold text-white">Budget & Financement</h1>
        </div>

        {/* Sous-onglets */}
        <div className="flex gap-1 mb-5 bg-[#0f1b2d] rounded-lg p-1 w-fit">
          {([
            { id: "apport", label: "💰 Budget & Apport Personnel" },
            { id: "financement", label: "🏦 Financement Bancaire" },
          ] as const).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                subTab === id
                  ? "bg-[#1e3255] text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {subTab === "apport" ? (
          <ApportTab
            chantier={chantier}
            user={user}
            state={state}
            aidesPercues={aidesPercues}
            onSaveMain={saveMain}
            main={{ budget: main.budget, apport: main.apport }}
            setMain={(m) => setMain({ ...main, ...m })}
            onSaveState={saveState}
          />
        ) : (
          <FinancementTab
            chantier={chantier}
            user={user}
            state={state}
            onSaveMain={saveMain}
            mainF={{ credit: main.credit, taux_interet: main.taux_interet }}
            setMainF={(m) => setMain({ ...main, ...m })}
            onSaveState={saveState}
          />
        )}
      </div>

      {/* Bandeau récapitulatif sticky */}
      <div className="shrink-0 bg-[#0b1526] border-t border-white/10 px-4 sm:px-6 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Enveloppe totale</p>
            <p className="text-base font-bold text-white">{fmt(budget)} €</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Apport restant</p>
            <p className={`text-base font-bold ${apportRestant < 0 ? "text-red-400" : "text-blue-300"}`}>
              {fmt(apportRestant)} €
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Crédit restant</p>
            <p className={`text-base font-bold ${creditRestant < 0 ? "text-red-400" : "text-blue-300"}`}>
              {fmt(Math.max(0, creditRestant))} €
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Total engagé</p>
            <p className={`text-base font-bold ${bandeauColor}`}>{fmt(totalEngage)} €</p>
            {budget > 0 && (
              <p className="text-xs text-slate-600">{totalPct}% de l'enveloppe</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
