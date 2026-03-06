import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePremium } from "@/hooks/usePremium";
import { toast } from "sonner";
import {
  LayoutDashboard, FileText, Euro, Award, Shield, Mail,
  Camera, Loader2, Plus, Upload, Download, Send,
  Settings, LogOut, Sparkles, Users, Check,
  Circle, CheckCircle2, X, TrendingUp,
  BookOpen, Trash2, Menu, ArrowLeft,
} from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = "dashboard" | "devis" | "budget" | "aides" | "formalites" | "relances" | "journal";

interface Chantier {
  id: string;
  nom: string;
  budget: number | null;
  apport: number | null;
  credit: number | null;
  taux_interet: number | null;
}
interface DevisItem {
  id: string;
  analyse_id: string | null;
  artisan_nom: string;
  artisan_email: string | null;
  type_travaux: string;
  montant_ht: number;
  montant_ttc: number;
  acompte_pct: number | null;
  acompte_paye: number | null;
  statut: string;
  score_analyse: string | null;
  created_at: string;
}
interface JournalEntry {
  id: string;
  date: string;
  phase: string;
  artisan_nom: string | null;
  note: string;
  tags: string[];
}
interface RelanceItem {
  id: string;
  artisan_nom: string;
  artisan_email: string;
  type: string;
  contenu: string;
  envoye_at: string | null;
  created_at: string;
}
interface Aide {
  id: string;
  nom: string;
  montant: number;
  statut: "percu" | "en_attente";
}
interface FormaliteState {
  completed: boolean;
  notes: string;
  date: string;
}
interface BudgetExtra {
  mensualite: string;
  duree: string;
  aides_deduites: string;
  montant_debloque: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const FORMALITES: { section: string; items: { key: string; label: string }[] }[] = [
  {
    section: "Avant les travaux",
    items: [
      { key: "assurance_decennale", label: "Assurance décennale artisan" },
      { key: "rc_pro", label: "RC Pro artisan" },
      { key: "siret_verifie", label: "SIRET vérifié" },
      { key: "declaration_prealable", label: "Déclaration préalable de travaux" },
      { key: "permis_construire", label: "Permis de construire" },
    ],
  },
  {
    section: "Pendant les travaux",
    items: [
      { key: "ordre_service", label: "Ordre de service signé" },
      { key: "reunions_chantier", label: "Réunions de chantier" },
      { key: "pv_avancement", label: "PV d'avancement" },
      { key: "suivi_paiements", label: "Suivi des paiements d'étape" },
      { key: "photos_chantier", label: "Photos de chantier" },
    ],
  },
  {
    section: "Après les travaux",
    items: [
      { key: "pv_reception", label: "PV de réception" },
      { key: "levee_reserves", label: "Levée des réserves" },
      { key: "daact", label: "DAACT (Déclaration d'achèvement)" },
      { key: "doe", label: "Dossier des Ouvrages Exécutés (DOE)" },
    ],
  },
];

const RELANCE_TEMPLATES = [
  {
    type: "relance_delai",
    label: "Relance délai",
    template: (_: string) =>
      `Bonjour,\n\nJe me permets de vous contacter concernant les travaux en cours.\nLes délais initialement prévus semblent dépassés et je souhaiterais connaître la date estimée de fin de chantier.\n\nMerci de bien vouloir me répondre dans les meilleurs délais.\n\nCordialement`,
  },
  {
    type: "reclamation",
    label: "Réclamation",
    template: (_: string) =>
      `Bonjour,\n\nJe vous contacte suite à des malfaçons constatées lors des travaux effectués à mon domicile.\nJe vous demande d'intervenir pour corriger ces problèmes dans un délai raisonnable.\n\nCordialement`,
  },
  {
    type: "demande_facture",
    label: "Demande de facture",
    template: (_: string) =>
      `Bonjour,\n\nLes travaux étant terminés, je vous remercie de bien vouloir m'adresser la facture définitive dans les meilleurs délais.\n\nCordialement`,
  },
  {
    type: "mise_en_demeure",
    label: "Mise en demeure",
    template: (_: string) =>
      `Bonjour,\n\nMalgré mes relances précédentes, je n'ai pas obtenu satisfaction concernant les travaux commandés.\nJe vous mets en demeure d'intervenir sous 8 jours, faute de quoi je me verrai contraint(e) de faire appel à un médiateur.\n\nCordialement`,
  },
];

const PHASE_KEYS = ["preparation", "gros_oeuvre", "second_oeuvre", "finitions", "reception"];
const PHASE_LABELS = ["Préparation", "Gros œuvre", "Second œuvre", "Finitions", "Réception"];

const SCORE_COLORS: Record<string, string> = {
  VERT: "text-green-400 bg-green-400/10 border-green-400/20",
  ORANGE: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  ROUGE: "text-red-400 bg-red-400/10 border-red-400/20",
};
const STATUT_LABELS: Record<string, { label: string; color: string }> = {
  recu: { label: "Reçu", color: "bg-slate-500/20 text-slate-300" },
  signe: { label: "Signé", color: "bg-blue-500/20 text-blue-300" },
  en_cours: { label: "En cours", color: "bg-amber-500/20 text-amber-300" },
  termine: { label: "Terminé", color: "bg-green-500/20 text-green-300" },
  litige: { label: "Litige", color: "bg-red-500/20 text-red-300" },
};

const fmt = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ── KPICard ────────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, icon, iconColor }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; iconColor: string;
}) {
  return (
    <div className="bg-[#162035] border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400">{label}</span>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── DashboardTab ───────────────────────────────────────────────────────────────
function DashboardTab({ chantier, devisList, analyses, formalites, relancesList, onImportAll, onImportChoose, onTabChange }: {
  chantier: Chantier; devisList: DevisItem[]; analyses: any[];
  formalites: Record<string, FormaliteState>; relancesList: RelanceItem[];
  onImportAll: () => void; onImportChoose: () => void; onTabChange: (t: Tab) => void;
}) {
  const [importDismissed, setImportDismissed] = useState(false);

  const importable = useMemo(
    () => analyses.filter((a) => !devisList.find((d) => d.analyse_id === a.id)),
    [analyses, devisList]
  );
  const allKeys = FORMALITES.flatMap((s) => s.items.map((i) => i.key));
  const totalFItems = allKeys.length;
  const totalCompleted = allKeys.filter((k) => formalites[k]?.completed).length;
  const totalEngaged = devisList
    .filter((d) => ["signe", "en_cours", "termine"].includes(d.statut))
    .reduce((acc, d) => acc + d.montant_ttc, 0);
  const recentActivity = [...devisList]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Bonjour ,</h1>
        <p className="text-slate-400 mt-1">voici l'état de votre chantier</p>
        <p className="text-cyan-400 text-sm mt-1">{chantier.nom}</p>
      </div>

      {/* Import banner */}
      {importable.length > 0 && !importDismissed && (
        <div className="mb-6 rounded-xl p-5 bg-gradient-to-r from-cyan-600 to-teal-600">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-white mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white">Vos analyses sont prêtes !</p>
              <p className="text-cyan-100 text-sm mt-1">
                Nous avons détecté <strong>{analyses.length} devis</strong> analysés sur verifiermondevis.fr.
                Importez-les en un clic pour pré-remplir tous vos onglets.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={onImportAll}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Sparkles className="h-4 w-4" /> Importer tout automatiquement
                </button>
                <button
                  onClick={onImportChoose}
                  className="px-4 py-2 bg-black/20 hover:bg-black/30 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Choisir les devis à importer
                </button>
                <button
                  onClick={() => setImportDismissed(true)}
                  className="px-3 py-2 text-cyan-200 text-sm hover:text-white transition-colors"
                >
                  Plus tard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          label="Budget consommé"
          value={`${fmt(totalEngaged)} €`}
          sub={`sur ${fmt(chantier.budget || 0)} €`}
          icon={<Euro className="h-4 w-4" />}
          iconColor="text-green-400"
        />
        <KPICard
          label="Aides perçues"
          value="0 €"
          sub="0 aide(s)"
          icon={<Award className="h-4 w-4" />}
          iconColor="text-purple-400"
        />
        <KPICard
          label="Formalités complètes"
          value={`${totalCompleted}/${totalFItems}`}
          sub={`${Math.round((totalCompleted / totalFItems) * 100)}%`}
          icon={<Shield className="h-4 w-4" />}
          iconColor="text-blue-400"
        />
        <KPICard
          label="Messages envoyés"
          value={String(relancesList.filter((r) => r.envoye_at).length)}
          sub={`${new Set(relancesList.map((r) => r.artisan_nom)).size} artisan(s)`}
          icon={<Mail className="h-4 w-4" />}
          iconColor="text-orange-400"
        />
      </div>

      {/* Actions rapides */}
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Actions rapides</p>
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => onTabChange("devis")}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" /> Ajouter un devis
        </button>
        <button
          onClick={() => onTabChange("journal")}
          className="flex items-center gap-2 px-4 py-2 border border-white/20 hover:bg-white/5 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Camera className="h-4 w-4" /> Ajouter une photo
        </button>
        <button
          onClick={() => onTabChange("relances")}
          className="flex items-center gap-2 px-4 py-2 border border-white/20 hover:bg-white/5 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Send className="h-4 w-4" /> Envoyer une relance
        </button>
      </div>

      {/* Activité récente */}
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Activité récente</p>
      <div className="bg-[#162035] border border-white/10 rounded-xl overflow-hidden">
        {recentActivity.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <TrendingUp className="h-8 w-8 text-slate-700 mb-3" />
            <p className="text-slate-500 text-sm">Aucune activité pour le moment.</p>
            <p className="text-slate-600 text-xs mt-1">Commencez par ajouter un devis !</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {recentActivity.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-slate-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-white font-medium">{d.artisan_nom}</p>
                    <p className="text-xs text-slate-500">{d.type_travaux}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-white">{fmt(d.montant_ttc)} €</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── DevisTab ───────────────────────────────────────────────────────────────────
function DevisTab({ chantier, devisList, analyses, onImportAll, onRefresh }: {
  chantier: Chantier; devisList: DevisItem[]; analyses: any[];
  onImportAll: () => void; onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ artisan_nom: "", type_travaux: "", montant_ttc: "", statut: "recu" });
  const [saving, setSaving] = useState(false);

  const importable = analyses.filter((a) => !devisList.find((d) => d.analyse_id === a.id));
  const totalTTC = devisList.reduce((acc, d) => acc + d.montant_ttc, 0);
  const totalPaye = devisList.reduce((acc, d) => acc + (d.acompte_paye || 0), 0);
  const artisansCount = new Set(devisList.map((d) => d.artisan_nom)).size;

  const handleAdd = async () => {
    if (!form.artisan_nom || !form.montant_ttc) { toast.error("Artisan et montant requis"); return; }
    setSaving(true);
    const ttc = parseFloat(form.montant_ttc) || 0;
    const { error } = await supabase.from("devis_chantier").insert({
      chantier_id: chantier.id,
      artisan_nom: form.artisan_nom,
      type_travaux: form.type_travaux || "Travaux",
      montant_ht: ttc / 1.1,
      montant_ttc: ttc,
      statut: form.statut,
    });
    if (error) toast.error("Erreur lors de l'ajout");
    else { toast.success("Devis ajouté"); setShowForm(false); setForm({ artisan_nom: "", type_travaux: "", montant_ttc: "", statut: "recu" }); onRefresh(); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("devis_chantier").delete().eq("id", id);
    onRefresh();
  };

  const handleStatut = async (id: string, statut: string) => {
    await supabase.from("devis_chantier").update({ statut }).eq("id", id);
    onRefresh();
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">Mes Devis & Factures</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {importable.length > 0 && (
            <button
              onClick={onImportAll}
              className="flex items-center gap-1.5 px-3 py-2 border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 text-sm rounded-lg transition-colors"
            >
              <Sparkles className="h-4 w-4" /> Importer depuis mes analyses ({importable.length})
            </button>
          )}
          <button className="flex items-center gap-1.5 px-3 py-2 border border-white/20 text-white hover:bg-white/5 text-sm rounded-lg transition-colors">
            <Download className="h-4 w-4" /> Récapitulatif PDF
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" /> Ajouter
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard label="Total chantier TTC" value={`${fmt(totalTTC)} €`} icon={<Euro className="h-4 w-4" />} iconColor="text-blue-400" />
        <KPICard label="Total payé" value={`${fmt(totalPaye)} €`} icon={<Check className="h-4 w-4" />} iconColor="text-green-400" />
        <KPICard label="Reste à payer" value={`${fmt(Math.max(0, totalTTC - totalPaye))} €`} icon={<Euro className="h-4 w-4" />} iconColor="text-orange-400" />
        <KPICard label="Artisans" value={String(artisansCount)} icon={<Users className="h-4 w-4" />} iconColor="text-purple-400" />
      </div>

      {/* Drop zone */}
      {!showForm && (
        <div
          onClick={() => setShowForm(true)}
          className="border-2 border-dashed border-white/15 rounded-xl p-8 text-center mb-4 cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/3 transition-colors"
        >
          <Upload className="h-8 w-8 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">Glissez-déposez vos devis ou factures ici</p>
          <p className="text-slate-600 text-xs mt-1">PDF, images — ou cliquez pour saisir manuellement</p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-[#162035] border border-white/10 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium">Nouveau devis</h3>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-slate-400" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {[
              { key: "artisan_nom", label: "Artisan *", placeholder: "Nom de l'artisan", type: "text" },
              { key: "type_travaux", label: "Type de travaux", placeholder: "Ex: Carrelage, Plomberie...", type: "text" },
              { key: "montant_ttc", label: "Montant TTC (€) *", placeholder: "Ex: 5000", type: "number" },
            ].map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label className="text-xs text-slate-400 mb-1 block">{label}</label>
                <input
                  type={type}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full bg-[#1c2a42] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Statut</label>
              <select
                value={form.statut}
                onChange={(e) => setForm({ ...form, statut: e.target.value })}
                className="w-full bg-[#1c2a42] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {Object.entries(STATUT_LABELS).map(([k, v]) => (
                  <option key={k} value={k} className="bg-[#1c2a42]">{v.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Enregistrer
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-white/20 text-white text-sm rounded-lg hover:bg-white/5">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-[#162035] border border-white/10 rounded-xl overflow-hidden">
        {devisList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <FileText className="h-8 w-8 text-slate-700 mb-3" />
            <p className="text-slate-500 text-sm">Aucun devis pour le moment.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {devisList.map((d) => (
              <div key={d.id} className="flex items-center gap-4 px-4 py-3 hover:bg-white/2 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-sm font-medium text-white">{d.artisan_nom}</p>
                    {d.score_analyse && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${SCORE_COLORS[d.score_analyse] || ""}`}>
                        {d.score_analyse}
                      </span>
                    )}
                    {d.analyse_id && (
                      <a href={`/analyse/${d.analyse_id}`} className="text-xs text-cyan-400 hover:underline">
                        Voir l'analyse →
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{d.type_travaux}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <p className="text-sm font-bold text-white">{fmt(d.montant_ttc)} €</p>
                  <select
                    value={d.statut}
                    onChange={(e) => handleStatut(d.id, e.target.value)}
                    className={`text-xs px-2 py-1 rounded-lg focus:outline-none cursor-pointer border-0 ${STATUT_LABELS[d.statut]?.color || ""}`}
                  >
                    {Object.entries(STATUT_LABELS).map(([k, v]) => (
                      <option key={k} value={k} className="bg-[#162035] text-white">{v.label}</option>
                    ))}
                  </select>
                  <button onClick={() => handleDelete(d.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── BudgetTab ──────────────────────────────────────────────────────────────────
function BudgetTab({ chantier, devisList, onUpdateChantier }: {
  chantier: Chantier; devisList: DevisItem[];
  onUpdateChantier: (u: Partial<Chantier>) => void;
}) {
  const storageKey = `chantier_budget_${chantier.id}`;
  const [extra, setExtra] = useState<BudgetExtra>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { return { mensualite: "", duree: "", aides_deduites: "", montant_debloque: "" }; }
  });
  const [main, setMain] = useState({
    budget: chantier.budget ? String(chantier.budget) : "",
    apport: chantier.apport ? String(chantier.apport) : "",
    credit: chantier.credit ? String(chantier.credit) : "",
    taux_interet: chantier.taux_interet ? String(chantier.taux_interet) : "",
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

  const updateExtra = (key: keyof BudgetExtra, value: string) => {
    const updated = { ...extra, [key]: value };
    setExtra(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const budget = parseFloat(main.budget) || 0;
  const totalEngaged = devisList.reduce((acc, d) => acc + d.montant_ttc, 0);
  const pct = budget > 0 ? Math.min(100, Math.round((totalEngaged / budget) * 100)) : 0;
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-blue-500";

  const inputClass = "w-full bg-[#1c2a42] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500";

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Budget & Financement</h1>
        <button className="flex items-center gap-1.5 px-3 py-2 border border-white/20 text-white hover:bg-white/5 text-sm rounded-lg transition-colors">
          <Download className="h-4 w-4" /> Récapitulatif PDF
        </button>
      </div>

      {/* Config */}
      <div className="bg-[#162035] border border-white/10 rounded-xl p-5 mb-4">
        <h2 className="text-white font-semibold mb-4">Configuration du budget</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Enveloppe totale (€)</label>
            <input type="number" value={main.budget} onChange={(e) => setMain({ ...main, budget: e.target.value })} onBlur={saveMain} placeholder="50000" className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Apport personnel (€)</label>
            <input type="number" value={main.apport} onChange={(e) => setMain({ ...main, apport: e.target.value })} onBlur={saveMain} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Crédit (€)</label>
            <input type="number" value={main.credit} onChange={(e) => setMain({ ...main, credit: e.target.value })} onBlur={saveMain} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Mensualité (€)</label>
            <input type="number" value={extra.mensualite} onChange={(e) => updateExtra("mensualite", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Durée (mois)</label>
            <input type="number" value={extra.duree} onChange={(e) => updateExtra("duree", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Aides déduites (€)</label>
            <input type="number" value={extra.aides_deduites} onChange={(e) => updateExtra("aides_deduites", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Taux d'intérêt annuel (%)</label>
            <input type="number" value={main.taux_interet} onChange={(e) => setMain({ ...main, taux_interet: e.target.value })} onBlur={saveMain} placeholder="Ex: 3.5" className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Montant débloqué (€)</label>
            <input type="number" value={extra.montant_debloque} onChange={(e) => updateExtra("montant_debloque", e.target.value)} placeholder="Montant déjà versé par la banque" className={inputClass} />
          </div>
        </div>
      </div>

      {/* Justificatifs */}
      <div className="bg-[#162035] border border-white/10 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold">Justificatifs d'apport personnel</h2>
          <button className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300">
            <Plus className="h-4 w-4" /> Ajouter
          </button>
        </div>
        <p className="text-slate-500 text-sm text-center py-3">Aucun justificatif ajouté</p>
      </div>

      {/* Intérêts intercalaires */}
      <div className="bg-[#162035] border border-white/10 rounded-xl p-5 mb-4">
        <h2 className="text-white font-semibold mb-2">Intérêts intercalaires</h2>
        <p className="text-slate-500 text-sm">
          {extra.montant_debloque && main.taux_interet
            ? `≈ ${fmt((parseFloat(extra.montant_debloque) * parseFloat(main.taux_interet)) / 100 / 12)} €/mois estimés`
            : "Renseignez le montant débloqué pour calculer"}
        </p>
      </div>

      {/* Budget consommé */}
      <div className="bg-[#162035] border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-white font-semibold">Budget consommé</h2>
          <span className="text-sm text-slate-400">{pct}%</span>
        </div>
        <div className="w-full bg-[#1c2a42] rounded-full h-1.5 mb-2">
          <div className={`${barColor} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>{fmt(totalEngaged)} € engagés</span>
          <span>{fmt(budget)} € budget total</span>
        </div>
      </div>
    </div>
  );
}

// ── AidesTab ───────────────────────────────────────────────────────────────────
function AidesTab({ chantierId }: { chantierId: string }) {
  const storageKey = `chantier_aides_${chantierId}`;
  const [aides, setAides] = useState<Aide[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; }
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nom: "", montant: "", statut: "en_attente" as "percu" | "en_attente" });

  const save = (updated: Aide[]) => {
    setAides(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const handleAdd = () => {
    if (!form.nom) { toast.error("Nom de l'aide requis"); return; }
    save([...aides, { id: crypto.randomUUID(), nom: form.nom, montant: parseFloat(form.montant) || 0, statut: form.statut }]);
    setForm({ nom: "", montant: "", statut: "en_attente" });
    setShowForm(false);
  };

  const totalPercu = aides.filter((a) => a.statut === "percu").reduce((acc, a) => acc + a.montant, 0);
  const totalAttente = aides.filter((a) => a.statut === "en_attente").reduce((acc, a) => acc + a.montant, 0);

  const inputClass = "w-full bg-[#1c2a42] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500";

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Aides & Subventions</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" /> Ajouter une aide
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-[#162035] border border-white/10 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Total perçu</p>
          <p className="text-xl font-bold text-green-400">{fmt(totalPercu)} €</p>
        </div>
        <div className="bg-[#162035] border border-white/10 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">En attente</p>
          <p className="text-xl font-bold text-orange-400">{fmt(totalAttente)} €</p>
        </div>
      </div>

      {showForm && (
        <div className="bg-[#162035] border border-white/10 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium">Nouvelle aide</h3>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-slate-400" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div className="sm:col-span-1">
              <label className="text-xs text-slate-400 mb-1 block">Nom de l'aide</label>
              <input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Ex: MaPrimeRénov'" className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Montant (€)</label>
              <input type="number" value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Statut</label>
              <select value={form.statut} onChange={(e) => setForm({ ...form, statut: e.target.value as any })} className={inputClass}>
                <option value="en_attente">En attente</option>
                <option value="percu">Perçu</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">Enregistrer</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-white/20 text-white text-sm rounded-lg hover:bg-white/5">Annuler</button>
          </div>
        </div>
      )}

      <div className="bg-[#162035] border border-white/10 rounded-xl overflow-hidden">
        {aides.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Award className="h-8 w-8 text-slate-700 mb-3" />
            <p className="text-slate-500 text-sm">Aucune aide ajoutée.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {aides.map((aide) => (
              <div key={aide.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{aide.nom}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${aide.statut === "percu" ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"}`}>
                    {aide.statut === "percu" ? "Perçu" : "En attente"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <p className={`font-bold ${aide.statut === "percu" ? "text-green-400" : "text-amber-400"}`}>{fmt(aide.montant)} €</p>
                  <button onClick={() => save(aides.filter((a) => a.id !== aide.id))} className="text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── FormalitesTab ──────────────────────────────────────────────────────────────
function FormalitesTab({ chantierId }: { chantierId: string }) {
  const storageKey = `chantier_formalites_${chantierId}`;
  const [states, setStates] = useState<Record<string, FormaliteState>>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { return {}; }
  });

  const allKeys = FORMALITES.flatMap((s) => s.items.map((i) => i.key));
  const totalItems = allKeys.length;
  const totalCompleted = allKeys.filter((k) => states[k]?.completed).length;
  const pct = Math.round((totalCompleted / totalItems) * 100);

  const update = (key: string, field: keyof FormaliteState, value: any) => {
    const updated = { ...states, [key]: { ...(states[key] || { completed: false, notes: "", date: "" }), [field]: value } };
    setStates(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Formalités & Documents</h1>
        <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${pct === 100 ? "bg-green-500/20 text-green-400" : pct > 0 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
          Conformité : {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="bg-[#162035] border border-white/10 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="text-slate-300">{totalCompleted}/{totalItems} formalités complètes</span>
          <span className={pct > 0 ? "text-amber-400" : "text-red-400"}>{pct}%</span>
        </div>
        <div className="w-full bg-[#1c2a42] rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${pct === 100 ? "bg-green-500" : pct > 0 ? "bg-amber-500" : "bg-slate-600"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Sections */}
      {FORMALITES.map((section) => (
        <div key={section.section} className="bg-[#162035] border border-white/10 rounded-xl p-5 mb-4">
          <h2 className="text-white font-semibold mb-4">{section.section}</h2>
          <div className="space-y-5">
            {section.items.map((item) => {
              const state = states[item.key] || { completed: false, notes: "", date: "" };
              return (
                <div key={item.key}>
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      onClick={() => update(item.key, "completed", !state.completed)}
                      className="flex-shrink-0 transition-colors"
                    >
                      {state.completed
                        ? <CheckCircle2 className="h-5 w-5 text-blue-400" />
                        : <Circle className="h-5 w-5 text-slate-600" />
                      }
                    </button>
                    <span className={`text-sm font-medium ${state.completed ? "text-slate-500 line-through" : "text-white"}`}>
                      {item.label}
                    </span>
                  </div>
                  <div className="ml-8 grid grid-cols-2 gap-2">
                    <input
                      value={state.notes}
                      onChange={(e) => update(item.key, "notes", e.target.value)}
                      placeholder="Notes"
                      className="bg-[#1c2a42] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="date"
                      value={state.date}
                      onChange={(e) => update(item.key, "date", e.target.value)}
                      className="bg-[#1c2a42] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── RelancesTab ────────────────────────────────────────────────────────────────
function RelancesTab({ chantier, devisList, relancesList, user, onRefresh }: {
  chantier: Chantier; devisList: DevisItem[]; relancesList: RelanceItem[];
  user: SupabaseUser | null; onRefresh: () => void;
}) {
  const [selectedArtisan, setSelectedArtisan] = useState("");
  const [selectedType, setSelectedType] = useState(RELANCE_TEMPLATES[0].type);
  const [contenu, setContenu] = useState(RELANCE_TEMPLATES[0].template(""));
  const [destinataireEmail, setDestinatataireEmail] = useState("");
  const [senderEmail, setSenderEmail] = useState(user?.email || "");
  const [saving, setSaving] = useState(false);

  const artisans = [...new Set(devisList.map((d) => d.artisan_nom))];

  // Auto-fill template when artisan or type changes
  useEffect(() => {
    const tpl = RELANCE_TEMPLATES.find((t) => t.type === selectedType);
    if (tpl) setContenu(tpl.template(selectedArtisan));
  }, [selectedType, selectedArtisan]);

  // Auto-detect artisan email when artisan changes
  useEffect(() => {
    const devis = devisList.find((d) => d.artisan_nom === selectedArtisan);
    setDestinatataireEmail(devis?.artisan_email || "");
  }, [selectedArtisan, devisList]);

  const handleSend = async () => {
    if (!selectedArtisan) { toast.error("Sélectionnez un artisan"); return; }
    setSaving(true);
    // Open email client with pre-filled content
    const subject = encodeURIComponent(RELANCE_TEMPLATES.find((t) => t.type === selectedType)?.label || selectedType);
    const body = encodeURIComponent(contenu);
    const mailtoUrl = `mailto:${encodeURIComponent(destinataireEmail)}?subject=${subject}&body=${body}`;
    window.open(mailtoUrl, "_blank");
    // Save to DB with envoye_at
    const { error } = await supabase.from("relances").insert({
      chantier_id: chantier.id,
      artisan_nom: selectedArtisan,
      artisan_email: destinataireEmail,
      type: selectedType,
      contenu,
      envoye_at: new Date().toISOString(),
    });
    if (error) toast.error("Erreur lors de l'enregistrement");
    else { toast.success("Relance envoyée et enregistrée"); onRefresh(); }
    setSaving(false);
  };

  const handleSaveDraft = async () => {
    if (!selectedArtisan) { toast.error("Sélectionnez un artisan"); return; }
    setSaving(true);
    const { error } = await supabase.from("relances").insert({
      chantier_id: chantier.id,
      artisan_nom: selectedArtisan,
      artisan_email: destinataireEmail,
      type: selectedType,
      contenu,
      envoye_at: null,
    });
    if (error) toast.error("Erreur lors de l'enregistrement");
    else { toast.success("Brouillon enregistré"); onRefresh(); }
    setSaving(false);
  };

  const selectClass = "bg-[#1c2a42] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500";
  const inputClass = "w-full bg-[#1c2a42] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500";

  if (artisans.length === 0) {
    return (
      <div className="flex-1 p-6 overflow-y-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Relances & Messages</h1>
        <div className="bg-[#162035] border border-white/10 rounded-xl flex flex-col items-center justify-center py-16">
          <Mail className="h-8 w-8 text-slate-700 mb-3" />
          <p className="text-slate-500 text-sm">Ajoutez d'abord des devis pour voir vos artisans ici.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Relances & Messages</h1>

      <div className="bg-[#162035] border border-white/10 rounded-xl p-5 mb-4">
        <h2 className="text-white font-semibold mb-4">Nouvelle relance</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Artisan</label>
            <select value={selectedArtisan} onChange={(e) => setSelectedArtisan(e.target.value)} className={`w-full ${selectClass}`}>
              <option value="">Sélectionner un artisan</option>
              {artisans.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Type de relance</label>
            <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className={`w-full ${selectClass}`}>
              {RELANCE_TEMPLATES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
          </div>
        </div>

        {/* Destinataire */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-slate-400">Destinataire (email artisan)</label>
            {selectedArtisan && destinataireEmail && (
              <span className="text-[10px] font-medium text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full">✓ auto-détecté</span>
            )}
            {selectedArtisan && !destinataireEmail && (
              <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full">⚠ email inconnu</span>
            )}
          </div>
          <input
            type="email"
            value={destinataireEmail}
            onChange={(e) => setDestinatataireEmail(e.target.value)}
            placeholder="email@artisan.fr"
            className={inputClass}
          />
          {selectedArtisan && !destinataireEmail && (
            <p className="text-xs text-amber-400 mt-1">Aucun email trouvé pour cet artisan. Vous pouvez le saisir manuellement.</p>
          )}
        </div>

        {/* De la part de */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-slate-400">De la part de</label>
            {senderEmail && (
              <span className="text-[10px] font-medium text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full">✓ auto-rempli</span>
            )}
          </div>
          <input
            type="email"
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
            placeholder="votre@email.fr"
            className={inputClass}
          />
        </div>

        <textarea
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          rows={6}
          className="w-full bg-[#1c2a42] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white resize-none focus:outline-none focus:border-blue-500 mb-1"
        />
        <p className="text-xs text-slate-500 mb-3">→ Le bouton Envoyer ouvrira votre client email (Outlook, Gmail…) avec le message pré-rempli.</p>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleSend}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Envoyer
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 border border-white/20 hover:border-white/40 text-slate-300 text-sm font-medium rounded-lg disabled:opacity-50"
          >
            Enregistrer brouillon
          </button>
        </div>
      </div>

      {relancesList.length > 0 && (
        <div className="bg-[#162035] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10">
            <h2 className="text-white font-semibold">Historique</h2>
          </div>
          <div className="divide-y divide-white/5">
            {relancesList.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-white">{r.artisan_nom}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.envoye_at ? "bg-green-500/20 text-green-400" : "bg-slate-500/20 text-slate-400"}`}>
                    {r.envoye_at ? "Envoyé" : "Brouillon"}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{RELANCE_TEMPLATES.find((t) => t.type === r.type)?.label || r.type}</p>
                {r.artisan_email && <p className="text-xs text-slate-600 mt-0.5">→ {r.artisan_email}</p>}
                {r.envoye_at && <p className="text-xs text-slate-600 mt-0.5">{new Date(r.envoye_at).toLocaleDateString("fr-FR")}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── JournalTab ─────────────────────────────────────────────────────────────────
function JournalTab({ chantier, devisList, journalEntries, onRefresh }: {
  chantier: Chantier; devisList: DevisItem[]; journalEntries: JournalEntry[]; onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [filterPhase, setFilterPhase] = useState("");
  const [filterArtisan, setFilterArtisan] = useState("");
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    phase: "preparation",
    artisan_nom: "",
    note: "",
    tags: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  const artisansList = [...new Set(devisList.map((d) => d.artisan_nom))];

  const filtered = journalEntries.filter((e) => {
    if (filterPhase && e.phase !== filterPhase) return false;
    if (filterArtisan && e.artisan_nom !== filterArtisan) return false;
    return true;
  });

  const handleAdd = async () => {
    if (!form.note) { toast.error("La note est requise"); return; }
    setSaving(true);
    const { error } = await supabase.from("journal_entries").insert({ chantier_id: chantier.id, ...form });
    if (error) toast.error("Erreur");
    else {
      toast.success("Entrée ajoutée");
      setShowForm(false);
      setForm({ date: new Date().toISOString().split("T")[0], phase: "preparation", artisan_nom: "", note: "", tags: [] });
      onRefresh();
    }
    setSaving(false);
  };

  const selectClass = "bg-[#162035] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 flex items-center gap-1";

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">Journal de Chantier</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 border border-white/20 text-white hover:bg-white/5 text-sm rounded-lg transition-colors">
            <Download className="h-4 w-4" /> Exporter PDF
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
          >
            <Plus className="h-4 w-4" /> Ajouter
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={filterPhase}
          onChange={(e) => setFilterPhase(e.target.value)}
          className="bg-[#162035] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">Toutes les...</option>
          {PHASE_KEYS.map((k, i) => <option key={k} value={k}>{PHASE_LABELS[i]}</option>)}
        </select>
        <select
          value={filterArtisan}
          onChange={(e) => setFilterArtisan(e.target.value)}
          className="bg-[#162035] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">Tous les artisans</option>
          {artisansList.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-[#162035] border border-white/10 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium">Nouvelle entrée</h3>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-slate-400" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full bg-[#1c2a42] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Phase</label>
              <select
                value={form.phase}
                onChange={(e) => setForm({ ...form, phase: e.target.value })}
                className="w-full bg-[#1c2a42] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {PHASE_KEYS.map((k, i) => <option key={k} value={k}>{PHASE_LABELS[i]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Artisan (optionnel)</label>
              <select
                value={form.artisan_nom}
                onChange={(e) => setForm({ ...form, artisan_nom: e.target.value })}
                className="w-full bg-[#1c2a42] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">Aucun</option>
                {artisansList.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <textarea
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Décrivez l'avancement, les problèmes rencontrés..."
            rows={4}
            className="w-full bg-[#1c2a42] border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-blue-500 mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Enregistrer
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-white/20 text-white text-sm rounded-lg hover:bg-white/5">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Entries */}
      <div className="bg-[#162035] border border-white/10 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Camera className="h-8 w-8 text-slate-700 mb-3" />
            <p className="text-slate-500 text-sm">Aucune entrée dans le journal.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((e) => (
              <div key={e.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">
                        {PHASE_LABELS[PHASE_KEYS.indexOf(e.phase)] || e.phase}
                      </span>
                      {e.artisan_nom && <span className="text-xs text-slate-400">{e.artisan_nom}</span>}
                    </div>
                    <p className="text-sm text-white whitespace-pre-wrap">{e.note}</p>
                  </div>
                  <p className="text-xs text-slate-500 flex-shrink-0">
                    {new Date(e.date).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── SyntheseModal ──────────────────────────────────────────────────────────────
function SyntheseModal({ chantier, devisList, formalites, onClose }: {
  chantier: Chantier; devisList: DevisItem[];
  formalites: Record<string, FormaliteState>; onClose: () => void;
}) {
  const allKeys = FORMALITES.flatMap((s) => s.items.map((i) => i.key));
  const totalCompleted = allKeys.filter((k) => formalites[k]?.completed).length;
  const totalTTC = devisList.reduce((acc, d) => acc + d.montant_ttc, 0);
  const budget = chantier.budget || 0;
  const pct = budget > 0 ? Math.min(100, Math.round((totalTTC / budget) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-[#162035] border border-white/10 rounded-2xl p-6 w-full max-w-lg z-10 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Ma Synthèse</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: "Chantier", value: chantier.nom },
            { label: "Budget total", value: `${fmt(budget)} €` },
            { label: "Devis", value: `${devisList.length} (${fmt(totalTTC)} € TTC)` },
            { label: "Formalités", value: `${totalCompleted}/${allKeys.length}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[#1c2a42] rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-1">{label}</p>
              <p className="font-bold text-white text-sm">{value}</p>
            </div>
          ))}
        </div>
        {budget > 0 && (
          <div className="bg-[#1c2a42] rounded-xl p-4">
            <div className="flex justify-between text-xs text-slate-400 mb-2">
              <span>Budget consommé</span>
              <span>{pct}%</span>
            </div>
            <div className="w-full bg-[#0d1526] rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── NAV items ──────────────────────────────────────────────────────────────────
const NAV_ITEMS: { tab: Tab; label: string; icon: React.ReactNode }[] = [
  { tab: "dashboard",  label: "Tableau de bord",        icon: <LayoutDashboard className="h-4 w-4" /> },
  { tab: "devis",      label: "Mes Devis & Factures",   icon: <FileText className="h-4 w-4" /> },
  { tab: "budget",     label: "Budget & Financement",   icon: <Euro className="h-4 w-4" /> },
  { tab: "aides",      label: "Aides & Subventions",    icon: <Award className="h-4 w-4" /> },
  { tab: "formalites", label: "Formalités & Documents", icon: <Shield className="h-4 w-4" /> },
  { tab: "relances",   label: "Relances & Messages",    icon: <Mail className="h-4 w-4" /> },
  { tab: "journal",    label: "Journal de Chantier",    icon: <Camera className="h-4 w-4" /> },
];

// ── Main MonChantier ───────────────────────────────────────────────────────────
export default function MonChantier() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [chantier, setChantier] = useState<Chantier | null>(null);
  const [devisList, setDevisList] = useState<DevisItem[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [relancesList, setRelancesList] = useState<RelanceItem[]>([]);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSynthese, setShowSynthese] = useState(false);
  const [loading, setLoading] = useState(true);
  const { isPremium, isLoading: premiumLoading } = usePremium();

  // Formalités live from localStorage (re-reads on tab change)
  const formalites = useMemo<Record<string, FormaliteState>>(() => {
    if (!chantier) return {};
    try { return JSON.parse(localStorage.getItem(`chantier_formalites_${chantier.id}`) || "{}"); } catch { return {}; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chantier, activeTab]);

  const syntheseCount = useMemo(() => {
    const incomplete = FORMALITES.flatMap((s) => s.items).filter((i) => !formalites[i.key]?.completed).length;
    return Math.min(9, Math.ceil(incomplete / 3) + devisList.length);
  }, [devisList, formalites]);

  const loadData = useCallback(async (userId: string, chantierId: string) => {
    const [d, j, r, a] = await Promise.all([
      supabase.from("devis_chantier").select("*").eq("chantier_id", chantierId).order("created_at", { ascending: false }),
      supabase.from("journal_entries").select("*").eq("chantier_id", chantierId).order("date", { ascending: false }),
      supabase.from("relances").select("*").eq("chantier_id", chantierId).order("created_at", { ascending: false }),
      supabase.from("analyses").select("id, file_name, score, status, raw_text").eq("user_id", userId).eq("status", "completed"),
    ]);
    if (d.data) setDevisList(d.data);
    if (j.data) setJournalEntries(j.data);
    if (r.data) setRelancesList(r.data);
    if (a.data) setAnalyses(a.data);
  }, []);

  useEffect(() => {
    const init = async () => {
      if (premiumLoading) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/connexion?redirect=/mon-chantier"; return; }
      if (!isPremium) { window.location.href = "/premium"; return; }
      setUser(user);

      let { data: chantiers } = await supabase.from("chantiers").select("*").eq("user_id", user.id).limit(1);
      let ch = chantiers?.[0];
      if (!ch) {
        const { data: newCh } = await supabase.from("chantiers").insert({ user_id: user.id }).select().single();
        ch = newCh;
      }
      if (ch) { setChantier(ch); await loadData(user.id, ch.id); }
      setLoading(false);
    };
    init();
  }, [isPremium, premiumLoading, loadData]);

  const handleImportAll = useCallback(async () => {
    if (!chantier || !user) return;
    const importable = analyses.filter((a) => !devisList.find((d) => d.analyse_id === a.id));
    if (!importable.length) { toast("Aucun nouveau devis à importer"); return; }
    const inserts = importable.map((a) => {
      const raw = a.raw_text || {};
      const extracted = raw.extracted || raw;
      const entreprise = extracted.entreprise || {};
      const ttc = extracted.montant_total_ttc || 0;
      const ht = extracted.montant_total_ht || ttc / 1.1;
      const typeTravaux = extracted.types_travaux?.[0]?.libelle || "Travaux";
      return {
        chantier_id: chantier.id,
        analyse_id: a.id,
        artisan_nom: entreprise.nom || a.file_name.replace(/\.[^.]+$/, ""),
        artisan_email: entreprise.email || null,
        artisan_siret: entreprise.siret || null,
        type_travaux: typeTravaux,
        montant_ht: ht,
        tva: extracted.tva || 10,
        montant_ttc: ttc || ht * 1.1,
        score_analyse: a.score,
        statut: "recu",
      };
    });
    const { error } = await supabase.from("devis_chantier").insert(inserts);
    if (error) toast.error("Erreur lors de l'import");
    else { toast.success(`${inserts.length} devis importés !`); await loadData(user.id, chantier.id); }
  }, [chantier, user, analyses, devisList, loadData]);

  const handleUpdateChantier = useCallback((updates: Partial<Chantier>) => {
    setChantier((prev) => prev ? { ...prev, ...updates } : prev);
  }, []);

  const refresh = useCallback(() => {
    if (user && chantier) loadData(user.id, chantier.id);
  }, [user, chantier, loadData]);

  if (loading || premiumLoading) {
    return (
      <div className="min-h-screen bg-[#0d1526] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }
  if (!chantier) return null;

  return (
    <div className="min-h-screen bg-[#0d1526] flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-52 bg-[#162035] border-r border-white/10 flex flex-col transition-transform duration-200 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="px-4 py-5 border-b border-white/10 flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm flex-shrink-0">🏠</div>
          <div className="min-w-0">
            <p className="text-white text-sm font-bold leading-none truncate">Mon Chantier</p>
            <span className="text-[10px] font-bold bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded-full leading-none">
              PREMIUM
            </span>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ tab, label, icon }) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                activeTab === tab
                  ? "bg-[#1e3255] text-white font-medium"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {icon}
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-2 py-3 border-t border-white/10 space-y-0.5">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-colors">
            <Settings className="h-4 w-4 flex-shrink-0" />
            Paramètres
          </button>
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 md:ml-52 flex flex-col min-h-screen">
        {/* Top bar — toujours visible */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#162035] border-b border-white/10 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5 text-white" />
            </button>
            <p className="text-white text-sm font-semibold md:hidden">
              {NAV_ITEMS.find((n) => n.tab === activeTab)?.label}
            </p>
          </div>
          <a
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 text-slate-300 hover:text-white hover:border-white/30 hover:bg-white/5 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour au site
          </a>
        </div>

        {/* Tab content */}
        <div className="flex flex-1 overflow-hidden">
          {activeTab === "dashboard" && (
            <DashboardTab
              chantier={chantier}
              devisList={devisList}
              analyses={analyses}
              formalites={formalites}
              relancesList={relancesList}
              onImportAll={handleImportAll}
              onImportChoose={() => setActiveTab("devis")}
              onTabChange={setActiveTab}
            />
          )}
          {activeTab === "devis" && (
            <DevisTab
              chantier={chantier}
              devisList={devisList}
              analyses={analyses}
              onImportAll={handleImportAll}
              onRefresh={refresh}
            />
          )}
          {activeTab === "budget" && (
            <BudgetTab chantier={chantier} devisList={devisList} onUpdateChantier={handleUpdateChantier} />
          )}
          {activeTab === "aides" && <AidesTab chantierId={chantier.id} />}
          {activeTab === "formalites" && <FormalitesTab chantierId={chantier.id} />}
          {activeTab === "relances" && (
            <RelancesTab chantier={chantier} devisList={devisList} relancesList={relancesList} user={user} onRefresh={refresh} />
          )}
          {activeTab === "journal" && (
            <JournalTab chantier={chantier} devisList={devisList} journalEntries={journalEntries} onRefresh={refresh} />
          )}
        </div>

        {/* Footer */}
        <div className="py-3 text-center border-t border-white/5">
          <p className="text-xs text-slate-600">
            Propulsé par{" "}
            <a href="/" className="text-cyan-500 hover:underline">verifiermondevis.fr</a>
          </p>
        </div>
      </div>

      {/* ── Ma Synthèse FAB ── */}
      <button
        onClick={() => setShowSynthese(true)}
        className="fixed bottom-6 right-6 z-20 flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full shadow-xl transition-colors"
      >
        <BookOpen className="h-4 w-4" />
        Ma Synthèse
        {syntheseCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold">
            {syntheseCount}
          </span>
        )}
      </button>

      {showSynthese && (
        <SyntheseModal
          chantier={chantier}
          devisList={devisList}
          formalites={formalites}
          onClose={() => setShowSynthese(false)}
        />
      )}
    </div>
  );
}
