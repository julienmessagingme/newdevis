import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePremium } from "@/hooks/usePremium";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  LayoutDashboard, FileText, Euro, Award, ClipboardList,
  Mail, Camera, Loader2, Plus, ChevronRight, Settings,
  LogOut, AlertCircle, CheckCircle2, Clock, Wrench,
  TrendingUp, Building2, Sparkles, Download
} from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";

// ── Types ───────────────────────────────────────────────────
type Tab = "dashboard" | "devis" | "budget" | "aides" | "formalites" | "relances" | "journal";

interface Chantier {
  id: string;
  nom: string;
  adresse: string | null;
  date_debut: string | null;
  date_fin: string | null;
  budget: number | null;
  apport: number | null;
  credit: number | null;
  taux_interet: number | null;
}

interface DevisChantier {
  id: string;
  chantier_id: string;
  analyse_id: string | null;
  artisan_nom: string;
  type_travaux: string;
  montant_ht: number;
  montant_ttc: number;
  statut: string;
  score_analyse: string | null;
  date_debut: string | null;
  date_fin: string | null;
  assurance_ok: boolean;
  rc_pro_ok: boolean;
  mentions_ok: boolean;
  created_at: string;
}

interface JournalEntry {
  id: string;
  date: string;
  phase: string;
  artisan_nom: string | null;
  note: string;
  tags: string[];
  created_at: string;
}

interface Relance {
  id: string;
  artisan_nom: string;
  artisan_email: string;
  type: string;
  contenu: string;
  envoye_at: string | null;
  created_at: string;
}

interface AnalyseImport {
  id: string;
  file_name: string;
  score: string | null;
  created_at: string;
  types_travaux: { libelle?: string; montant_ht?: number }[] | null;
}

// ── Helpers ─────────────────────────────────────────────────
const formatCurrency = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const formatDate = (s: string) =>
  new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

const STATUT_LABELS: Record<string, { label: string; color: string }> = {
  recu:      { label: "Reçu",      color: "bg-gray-100 text-gray-700" },
  signe:     { label: "Signé",     color: "bg-blue-100 text-blue-700" },
  en_cours:  { label: "En cours",  color: "bg-amber-100 text-amber-700" },
  termine:   { label: "Terminé",   color: "bg-green-100 text-green-700" },
  litige:    { label: "Litige",    color: "bg-red-100 text-red-700" },
};

const PHASE_LABELS: Record<string, string> = {
  preparation: "Préparation",
  gros_oeuvre: "Gros œuvre",
  second_oeuvre: "Second œuvre",
  finitions: "Finitions",
  reception: "Réception",
};

const TAG_CONFIG: Record<string, { label: string; color: string }> = {
  important:  { label: "Important",  color: "bg-amber-100 text-amber-700" },
  probleme:   { label: "Problème",   color: "bg-red-100 text-red-700" },
  validation: { label: "Validation", color: "bg-green-100 text-green-700" },
  info:       { label: "Info",       color: "bg-blue-100 text-blue-700" },
};

const RELANCE_TEMPLATES: Record<string, { label: string; template: (nom: string, chantier: string) => string }> = {
  relance_delai: {
    label: "Relance délai",
    template: (nom, chantier) =>
      `Bonjour,\n\nJe me permets de vous contacter concernant le chantier "${chantier}".\n\nLes travaux devaient débuter selon le planning convenu, mais je n'ai pas encore reçu de confirmation de votre part.\n\nPourriez-vous me confirmer la date de démarrage effective ?\n\nCordialement`,
  },
  reclamation: {
    label: "Réclamation",
    template: (nom, chantier) =>
      `Bonjour,\n\nSuite à l'avancement des travaux sur le chantier "${chantier}", j'ai constaté plusieurs non-conformités par rapport aux prestations prévues au devis.\n\nJe vous demande de procéder aux corrections nécessaires dans les meilleurs délais.\n\nCordialement`,
  },
  demande_facture: {
    label: "Demande de facture",
    template: (nom, chantier) =>
      `Bonjour,\n\nJe n'ai pas encore reçu la facture correspondant aux travaux réalisés sur le chantier "${chantier}".\n\nMerci de me la transmettre dans les plus brefs délais.\n\nCordialement`,
  },
  mise_en_demeure: {
    label: "Mise en demeure",
    template: (nom, chantier) =>
      `Objet : Mise en demeure\n\nPar la présente, je vous mets en demeure de respecter vos obligations contractuelles concernant le chantier "${chantier}".\n\nSans réponse de votre part sous 8 jours, je me verrai contraint d'engager les procédures légales nécessaires.\n\nCordialement`,
  },
};

const AIDES_LIST = [
  {
    nom: "MaPrimeRénov'",
    desc: "Aide de l'État pour les travaux de rénovation énergétique",
    max: "90 % du coût",
    url: "https://www.maprimerenov.gouv.fr/",
    categories: ["isolation", "chauffage", "fenetres"],
  },
  {
    nom: "CEE (Certificats d'Économie d'Énergie)",
    desc: "Prime énergie versée par les fournisseurs d'énergie",
    max: "Variable",
    url: "https://www.prime-energie.gouv.fr/",
    categories: ["isolation", "chauffage"],
  },
  {
    nom: "Éco-PTZ",
    desc: "Prêt à taux zéro pour la rénovation énergétique",
    max: "50 000 €",
    url: "https://www.service-public.fr/particuliers/vosdroits/F19905",
    categories: ["isolation", "chauffage", "fenetres"],
  },
  {
    nom: "TVA à 5,5 % ou 10 %",
    desc: "Taux réduit de TVA pour les travaux d'amélioration",
    max: "Réduction TVA",
    url: "https://www.impots.gouv.fr/particulier/questions/jai-fait-des-travaux-dans-mon-logement",
    categories: ["renovation"],
  },
  {
    nom: "Aide Action Logement",
    desc: "Aide pour les salariés du secteur privé",
    max: "10 000 €",
    url: "https://www.actionlogement.fr/",
    categories: ["renovation"],
  },
];

const FORMALITES_LIST = [
  { id: "assurance_decennale", label: "Attestation d'assurance décennale reçue", phase: "avant" },
  { id: "rc_pro", label: "Attestation RC professionnelle reçue", phase: "avant" },
  { id: "devis_signe", label: "Devis signé avec date de début", phase: "avant" },
  { id: "ordre_service", label: "Ordre de service envoyé (si applicable)", phase: "avant" },
  { id: "declaration_mairie", label: "Déclaration préalable en mairie (si applicable)", phase: "avant" },
  { id: "photos_avant", label: "Photos de l'état initial prises", phase: "pendant" },
  { id: "suivi_avancement", label: "Journal de chantier tenu régulièrement", phase: "pendant" },
  { id: "pv_reception", label: "PV de réception signé", phase: "apres" },
  { id: "reserve_levee", label: "Levée des réserves confirmée par écrit", phase: "apres" },
  { id: "garantie_parfait", label: "Garantie de parfait achèvement (1 an) notifiée", phase: "apres" },
  { id: "daact", label: "DAACT déposée en mairie (si permis de construire)", phase: "apres" },
];

// ── Nav tabs ─────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard",  label: "Vue d'ensemble", icon: LayoutDashboard },
  { id: "devis",      label: "Devis",          icon: FileText },
  { id: "budget",     label: "Budget",         icon: Euro },
  { id: "aides",      label: "Aides",          icon: Award },
  { id: "formalites", label: "Formalités",     icon: ClipboardList },
  { id: "relances",   label: "Relances",       icon: Mail },
  { id: "journal",    label: "Journal",        icon: Camera },
];

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
const MonChantier = () => {
  const { isPremium, isLoading: premiumLoading, trialDaysLeft } = usePremium();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [chantier, setChantier] = useState<Chantier | null>(null);
  const [devis, setDevis] = useState<DevisChantier[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [relances, setRelances] = useState<Relance[]>([]);
  const [formalites, setFormalites] = useState<Record<string, boolean>>({});
  const [analyses, setAnalyses] = useState<AnalyseImport[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Auth check ───────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/connexion?redirect=/mon-chantier";
        return;
      }
      setUser(user);
      setAuthLoading(false);
    };
    check();
  }, []);

  // ── Redirect non-premium to sales page ──────────────────────
  useEffect(() => {
    if (!premiumLoading && !isPremium && !authLoading && user) {
      window.location.href = "/premium";
    }
  }, [premiumLoading, isPremium, authLoading, user]);

  // ── Load chantier + data ─────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);

    // Get or create chantier
    let { data: existing } = await supabase
      .from("chantiers")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { data: created } = await supabase
        .from("chantiers")
        .insert({ user_id: user.id, nom: "Mon projet travaux" })
        .select()
        .single();
      existing = created;
    }

    if (!existing) { setDataLoading(false); return; }
    setChantier(existing as Chantier);

    // Load devis
    const { data: devisData } = await supabase
      .from("devis_chantier")
      .select("*")
      .eq("chantier_id", existing.id)
      .order("created_at", { ascending: false });
    setDevis((devisData || []) as DevisChantier[]);

    // Load journal
    const { data: journalData } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("chantier_id", existing.id)
      .order("date", { ascending: false });
    setJournal((journalData || []) as JournalEntry[]);

    // Load relances
    const { data: relancesData } = await supabase
      .from("relances")
      .select("*")
      .eq("chantier_id", existing.id)
      .order("created_at", { ascending: false });
    setRelances((relancesData || []) as Relance[]);

    // Load completed analyses for import
    const { data: analysesData } = await supabase
      .from("analyses")
      .select("id, file_name, score, created_at, types_travaux")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false });
    setAnalyses((analysesData || []) as AnalyseImport[]);

    // Formalités from localStorage (user-specific)
    const stored = localStorage.getItem(`formalites_${existing.id}`);
    if (stored) {
      try { setFormalites(JSON.parse(stored)); } catch { /* ignore */ }
    }

    setDataLoading(false);
  }, [user]);

  useEffect(() => {
    if (user && isPremium) loadData();
  }, [user, isPremium, loadData]);

  // ── Import analyses ──────────────────────────────────────────
  const importFromAnalyses = async () => {
    if (!chantier || !analyses.length) return;
    setImporting(true);
    const alreadyImported = new Set(devis.map(d => d.analyse_id).filter(Boolean));
    const toImport = analyses.filter(a => !alreadyImported.has(a.id));

    if (!toImport.length) {
      toast.info("Toutes les analyses ont déjà été importées");
      setImporting(false);
      return;
    }

    const rows = toImport.map(a => {
      const montant = Array.isArray(a.types_travaux)
        ? a.types_travaux.reduce((s: number, t) => s + (t.montant_ht || 0), 0)
        : 0;
      const type = Array.isArray(a.types_travaux) && a.types_travaux.length
        ? a.types_travaux[0].libelle || "Travaux"
        : "Travaux";
      return {
        chantier_id: chantier.id,
        analyse_id: a.id,
        artisan_nom: a.file_name.replace(/\.[^.]+$/, ""),
        type_travaux: type,
        montant_ht: montant,
        montant_ttc: montant * 1.1,
        score_analyse: a.score,
        statut: "recu",
      };
    });

    const { error } = await supabase.from("devis_chantier").insert(rows);
    if (error) {
      toast.error("Erreur lors de l'import");
    } else {
      toast.success(`${rows.length} devis importé${rows.length > 1 ? "s" : ""} 🎉`);
      await loadData();
    }
    setImporting(false);
  };

  // ── Formalités toggle ────────────────────────────────────────
  const toggleFormalite = (id: string) => {
    const updated = { ...formalites, [id]: !formalites[id] };
    setFormalites(updated);
    if (chantier) {
      localStorage.setItem(`formalites_${chantier.id}`, JSON.stringify(updated));
    }
  };

  // ── Add journal entry ────────────────────────────────────────
  const addJournalEntry = async (note: string, phase: string, tags: string[]) => {
    if (!chantier || !note.trim()) return;
    const { error } = await supabase.from("journal_entries").insert({
      chantier_id: chantier.id,
      note,
      phase,
      tags,
    });
    if (error) { toast.error("Erreur"); return; }
    toast.success("Entrée ajoutée");
    await loadData();
  };

  // ── Compute KPIs ─────────────────────────────────────────────
  const totalDevis = devis.reduce((s, d) => s + d.montant_ttc, 0);
  const devisSignes = devis.filter(d => d.statut === "signe" || d.statut === "en_cours" || d.statut === "termine");
  const totalEngage = devisSignes.reduce((s, d) => s + d.montant_ttc, 0);
  const enveloppeTotale = (chantier?.budget || 0) + (chantier?.credit || 0);
  const budgetRestant = enveloppeTotale - totalEngage;
  const formalitesDone = FORMALITES_LIST.filter(f => formalites[f.id]).length;

  // ── Loading states ───────────────────────────────────────────
  if (authLoading || premiumLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isPremium) return null; // handled by redirects

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-accent"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Menu"
            >
              <LayoutDashboard className="h-5 w-5 text-primary" />
            </button>
            <a href="/" className="flex items-center gap-2 flex-shrink-0">
              <img alt="Logo" className="h-9 w-9 object-contain" src="/images/logo detouré.png" width={36} height={36} />
              <span className="hidden sm:block text-lg font-bold leading-none">
                <span className="text-foreground">Mon</span><span className="text-primary"> Chantier</span>
              </span>
            </a>
            {trialDaysLeft !== null && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                <Clock className="h-3 w-3" />
                Essai : {trialDaysLeft}j restant{trialDaysLeft > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {chantier && (
              <span className="hidden md:block text-sm font-medium text-muted-foreground truncate max-w-[200px]">
                {chantier.nom}
              </span>
            )}
            <a href="/tableau-de-bord">
              <Button variant="ghost" size="icon" title="Tableau de bord">
                <Building2 className="h-4 w-4" />
              </Button>
            </a>
            <Button variant="ghost" size="icon" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Trial banner mobile */}
      {trialDaysLeft !== null && (
        <div className="sm:hidden bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 text-center">
          Essai gratuit — {trialDaysLeft} jour{trialDaysLeft > 1 ? "s" : ""} restant{trialDaysLeft > 1 ? "s" : ""}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* ── Sidebar ──────────────────────────────────────────── */}
        <aside className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border pt-16 flex flex-col
          transform transition-transform duration-200 md:translate-x-0 md:static md:h-auto md:pt-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}>
          {/* Overlay mobile */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/40 z-30 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <nav className="flex-1 py-4 px-2 space-y-0.5 relative z-50 bg-card md:bg-transparent">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setTab(id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  tab === id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </button>
            ))}
          </nav>
          <div className="px-3 py-3 border-t border-border text-xs text-muted-foreground text-center">
            Propulsé par{" "}
            <a href="/" className="text-primary hover:underline font-medium">
              verifiermondevis.fr
            </a>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────────── */}
        <main className="flex-1 min-w-0 overflow-auto">
          {dataLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="p-4 sm:p-6 max-w-5xl mx-auto">
              {/* ── DASHBOARD ─────────────────────────────────── */}
              {tab === "dashboard" && (
                <DashboardTab
                  chantier={chantier}
                  devis={devis}
                  totalDevis={totalDevis}
                  totalEngage={totalEngage}
                  enveloppeTotale={enveloppeTotale}
                  budgetRestant={budgetRestant}
                  formalitesDone={formalitesDone}
                  journalCount={journal.length}
                  analyses={analyses}
                  importing={importing}
                  onImport={importFromAnalyses}
                  onSetTab={setTab}
                />
              )}

              {/* ── DEVIS ─────────────────────────────────────── */}
              {tab === "devis" && (
                <DevisTab
                  devis={devis}
                  chantier={chantier}
                  analyses={analyses}
                  importing={importing}
                  onImport={importFromAnalyses}
                  onRefresh={loadData}
                />
              )}

              {/* ── BUDGET ────────────────────────────────────── */}
              {tab === "budget" && (
                <BudgetTab
                  chantier={chantier}
                  devis={devis}
                  totalDevis={totalDevis}
                  totalEngage={totalEngage}
                  enveloppeTotale={enveloppeTotale}
                  budgetRestant={budgetRestant}
                  onRefresh={loadData}
                />
              )}

              {/* ── AIDES ─────────────────────────────────────── */}
              {tab === "aides" && <AidesTab />}

              {/* ── FORMALITÉS ────────────────────────────────── */}
              {tab === "formalites" && (
                <FormalitesTab
                  formalites={formalites}
                  formalitesDone={formalitesDone}
                  onToggle={toggleFormalite}
                />
              )}

              {/* ── RELANCES ──────────────────────────────────── */}
              {tab === "relances" && (
                <RelancesTab
                  relances={relances}
                  chantier={chantier}
                  devis={devis}
                  onRefresh={loadData}
                />
              )}

              {/* ── JOURNAL ───────────────────────────────────── */}
              {tab === "journal" && (
                <JournalTab
                  journal={journal}
                  onAdd={addJournalEntry}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// TAB: DASHBOARD
// ══════════════════════════════════════════════════════════════
const DashboardTab = ({
  chantier, devis, totalDevis, totalEngage, enveloppeTotale,
  budgetRestant, formalitesDone, journalCount, analyses, importing,
  onImport, onSetTab,
}: {
  chantier: Chantier | null;
  devis: DevisChantier[];
  totalDevis: number;
  totalEngage: number;
  enveloppeTotale: number;
  budgetRestant: number;
  formalitesDone: number;
  journalCount: number;
  analyses: AnalyseImport[];
  importing: boolean;
  onImport: () => void;
  onSetTab: (t: Tab) => void;
}) => {
  const nonImported = analyses.filter(a => !devis.some(d => d.analyse_id === a.id));
  const scoreColor = (s: string | null) =>
    s === "VERT" ? "text-green-700" : s === "ORANGE" ? "text-orange-600" : s === "ROUGE" ? "text-red-600" : "text-muted-foreground";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Vue d'ensemble</h1>
        <p className="text-muted-foreground mt-1">{chantier?.nom || "Mon projet"}</p>
      </div>

      {/* Magic import banner */}
      {nonImported.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-r from-primary/10 to-blue-500/10 border border-primary/20 p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">
                  {nonImported.length} analyse{nonImported.length > 1 ? "s" : ""} à importer
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Vos analyses de devis existantes peuvent être ajoutées automatiquement à votre chantier.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {nonImported.slice(0, 4).map(a => (
                    <span key={a.id} className={`text-xs font-medium ${scoreColor(a.score)}`}>
                      {a.file_name.length > 25 ? a.file_name.slice(0, 25) + "…" : a.file_name}
                    </span>
                  ))}
                  {nonImported.length > 4 && <span className="text-xs text-muted-foreground">+{nonImported.length - 4}</span>}
                </div>
              </div>
            </div>
            <Button size="sm" onClick={onImport} disabled={importing} className="flex-shrink-0">
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="h-4 w-4 mr-1.5" />Importer</>}
            </Button>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total devis", value: formatCurrency(totalDevis), icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Engagé", value: formatCurrency(totalEngage), icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Budget restant", value: enveloppeTotale > 0 ? formatCurrency(budgetRestant) : "—", icon: Euro, color: budgetRestant < 0 ? "text-red-600" : "text-emerald-600", bg: budgetRestant < 0 ? "bg-red-50" : "bg-emerald-50" },
          { label: "Formalités", value: `${formalitesDone}/${FORMALITES_LIST.length}`, icon: ClipboardList, color: "text-purple-600", bg: "bg-purple-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-card border border-border rounded-2xl p-4">
            <div className={`inline-flex p-2 rounded-lg ${bg} mb-2`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Quick access */}
      <div className="grid sm:grid-cols-2 gap-3">
        {[
          { tab: "devis" as Tab, label: "Devis & Artisans", sub: `${devis.length} devis enregistré${devis.length > 1 ? "s" : ""}`, icon: FileText },
          { tab: "journal" as Tab, label: "Journal de chantier", sub: `${journalCount} entrée${journalCount > 1 ? "s" : ""}`, icon: Camera },
          { tab: "aides" as Tab, label: "Aides disponibles", sub: `${AIDES_LIST.length} aides identifiées`, icon: Award },
          { tab: "formalites" as Tab, label: "Formalités", sub: `${formalitesDone}/${FORMALITES_LIST.length} complétées`, icon: ClipboardList },
        ].map(({ tab, label, sub, icon: Icon }) => (
          <button
            key={tab}
            onClick={() => onSetTab(tab)}
            className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:bg-accent/50 transition-colors text-left"
          >
            <Icon className="h-5 w-5 text-primary flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// TAB: DEVIS
// ══════════════════════════════════════════════════════════════
const DevisTab = ({
  devis, chantier, analyses, importing, onImport, onRefresh,
}: {
  devis: DevisChantier[];
  chantier: Chantier | null;
  analyses: AnalyseImport[];
  importing: boolean;
  onImport: () => void;
  onRefresh: () => void;
}) => {
  const nonImported = analyses.filter(a => !devis.some(d => d.analyse_id === a.id));
  const scoreColor = (s: string | null) =>
    s === "VERT" ? "bg-green-100 text-green-700" : s === "ORANGE" ? "bg-orange-100 text-orange-700" : s === "ROUGE" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600";

  const updateStatut = async (id: string, statut: string) => {
    const { error } = await supabase.from("devis_chantier").update({ statut }).eq("id", id);
    if (error) { toast.error("Erreur"); return; }
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-foreground">Devis & Artisans</h1>
        {nonImported.length > 0 && (
          <Button size="sm" onClick={onImport} disabled={importing} variant="outline">
            {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Importer mes analyses ({nonImported.length})
          </Button>
        )}
      </div>

      {devis.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-2xl">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="font-semibold text-foreground mb-2">Aucun devis</p>
          <p className="text-sm text-muted-foreground mb-4">
            Importez vos analyses existantes ou ajoutez un devis manuellement
          </p>
          {nonImported.length > 0 && (
            <Button onClick={onImport} disabled={importing}>
              <Sparkles className="h-4 w-4 mr-2" />
              Importer mes {nonImported.length} analyse{nonImported.length > 1 ? "s" : ""}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {devis.map(d => {
            const st = STATUT_LABELS[d.statut] || { label: d.statut, color: "bg-gray-100 text-gray-700" };
            return (
              <div key={d.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground">{d.artisan_nom}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                      {d.score_analyse && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${scoreColor(d.score_analyse)}`}>
                          {d.score_analyse}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{d.type_travaux}</p>
                    <div className="flex flex-wrap gap-3 mt-2 text-sm">
                      <span className="font-medium text-foreground">{formatCurrency(d.montant_ttc)} TTC</span>
                      {d.date_debut && <span className="text-muted-foreground">Début : {formatDate(d.date_debut)}</span>}
                      {d.date_fin && <span className="text-muted-foreground">Fin prévue : {formatDate(d.date_fin)}</span>}
                    </div>
                    <div className="flex gap-3 mt-2">
                      <span className={`text-xs flex items-center gap-1 ${d.assurance_ok ? "text-green-600" : "text-muted-foreground"}`}>
                        {d.assurance_ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                        Décennale
                      </span>
                      <span className={`text-xs flex items-center gap-1 ${d.rc_pro_ok ? "text-green-600" : "text-muted-foreground"}`}>
                        {d.rc_pro_ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                        RC Pro
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {d.analyse_id && (
                      <a href={`/analyse/${d.analyse_id}`} target="_blank" rel="noopener">
                        <Button variant="outline" size="sm">Voir analyse</Button>
                      </a>
                    )}
                    <select
                      className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background"
                      value={d.statut}
                      onChange={e => updateStatut(d.id, e.target.value)}
                    >
                      {Object.entries(STATUT_LABELS).map(([v, { label }]) => (
                        <option key={v} value={v}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// TAB: BUDGET
// ══════════════════════════════════════════════════════════════
const BudgetTab = ({
  chantier, devis, totalDevis, totalEngage, enveloppeTotale, budgetRestant, onRefresh,
}: {
  chantier: Chantier | null;
  devis: DevisChantier[];
  totalDevis: number;
  totalEngage: number;
  enveloppeTotale: number;
  budgetRestant: number;
  onRefresh: () => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    budget: chantier?.budget?.toString() || "",
    apport: chantier?.apport?.toString() || "",
    credit: chantier?.credit?.toString() || "",
  });

  const save = async () => {
    if (!chantier) return;
    const { error } = await supabase.from("chantiers").update({
      budget: form.budget ? parseFloat(form.budget) : null,
      apport: form.apport ? parseFloat(form.apport) : null,
      credit: form.credit ? parseFloat(form.credit) : null,
    }).eq("id", chantier.id);
    if (error) { toast.error("Erreur"); return; }
    toast.success("Budget mis à jour");
    setEditing(false);
    onRefresh();
  };

  const pct = enveloppeTotale > 0 ? Math.min(100, (totalEngage / enveloppeTotale) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-foreground">Budget</h1>
        <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
          <Settings className="h-4 w-4 mr-2" />
          {editing ? "Annuler" : "Configurer"}
        </Button>
      </div>

      {editing && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground">Enveloppe budgétaire</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { key: "budget", label: "Budget total (€)", placeholder: "ex: 50000" },
              { key: "apport", label: "Apport personnel (€)", placeholder: "ex: 20000" },
              { key: "credit", label: "Montant crédit (€)", placeholder: "ex: 30000" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
                <input
                  type="number"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  placeholder={placeholder}
                  value={form[key as keyof typeof form]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <Button size="sm" onClick={save}>Enregistrer</Button>
        </div>
      )}

      {/* Enveloppe vs engagé */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium text-foreground">Enveloppe vs engagé</p>
          <span className={`text-sm font-medium ${budgetRestant < 0 ? "text-red-600" : "text-green-600"}`}>
            {budgetRestant < 0 ? "Dépassement" : "Restant"} : {formatCurrency(Math.abs(budgetRestant))}
          </span>
        </div>
        {enveloppeTotale > 0 ? (
          <>
            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-green-500"}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>{formatCurrency(totalEngage)} engagé</span>
              <span>{formatCurrency(enveloppeTotale)} total</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Configurez votre enveloppe budgétaire pour voir le suivi.
          </p>
        )}
      </div>

      {/* Récap devis */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold text-foreground mb-4">Récapitulatif par artisan</h3>
        {devis.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun devis enregistré.</p>
        ) : (
          <div className="space-y-2">
            {devis.map(d => {
              const st = STATUT_LABELS[d.statut] || { label: d.statut, color: "bg-gray-100 text-gray-700" };
              return (
                <div key={d.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{d.artisan_nom}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                  </div>
                  <p className={`text-sm font-semibold ${d.statut === "recu" ? "text-muted-foreground" : "text-foreground"}`}>
                    {formatCurrency(d.montant_ttc)}
                  </p>
                </div>
              );
            })}
            <div className="flex items-center justify-between pt-2 font-semibold">
              <span className="text-sm">Total (tous devis)</span>
              <span className="text-sm">{formatCurrency(totalDevis)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// TAB: AIDES
// ══════════════════════════════════════════════════════════════
const AidesTab = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-foreground">Aides & Subventions</h1>
      <p className="text-muted-foreground mt-1">Aides potentiellement disponibles pour votre projet</p>
    </div>
    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
      <strong>Important :</strong> Vérifiez votre éligibilité auprès des organismes compétents. Les montants varient selon vos revenus, la nature des travaux et votre situation.
    </div>
    <div className="space-y-3">
      {AIDES_LIST.map(aide => (
        <div key={aide.nom} className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-foreground">{aide.nom}</h3>
                <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  Jusqu'à {aide.max}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{aide.desc}</p>
            </div>
            <a href={aide.url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                En savoir plus
              </Button>
            </a>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ══════════════════════════════════════════════════════════════
// TAB: FORMALITÉS
// ══════════════════════════════════════════════════════════════
const FormalitesTab = ({
  formalites, formalitesDone, onToggle,
}: {
  formalites: Record<string, boolean>;
  formalitesDone: number;
  onToggle: (id: string) => void;
}) => {
  const phases = [
    { key: "avant", label: "Avant travaux", icon: ClipboardList },
    { key: "pendant", label: "Pendant travaux", icon: Wrench },
    { key: "apres", label: "Après travaux", icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-foreground">Formalités</h1>
        <span className="text-sm font-medium text-muted-foreground">
          {formalitesDone}/{FORMALITES_LIST.length} complétées
        </span>
      </div>

      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="h-2 rounded-full bg-primary transition-all"
          style={{ width: `${(formalitesDone / FORMALITES_LIST.length) * 100}%` }}
        />
      </div>

      {phases.map(({ key, label, icon: Icon }) => {
        const items = FORMALITES_LIST.filter(f => f.phase === key);
        const done = items.filter(f => formalites[f.id]).length;
        return (
          <div key={key} className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <Icon className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">{label}</h3>
              <span className="ml-auto text-sm text-muted-foreground">{done}/{items.length}</span>
            </div>
            <div className="space-y-3">
              {items.map(f => (
                <label key={f.id} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={!!formalites[f.id]}
                    onChange={() => onToggle(f.id)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary accent-primary"
                  />
                  <span className={`text-sm transition-colors ${formalites[f.id] ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {f.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// TAB: RELANCES
// ══════════════════════════════════════════════════════════════
const RelancesTab = ({
  relances, chantier, devis, onRefresh,
}: {
  relances: Relance[];
  chantier: Chantier | null;
  devis: DevisChantier[];
  onRefresh: () => void;
}) => {
  const [type, setType] = useState("relance_delai");
  const [artisan, setArtisan] = useState("");
  const [email, setEmail] = useState("");
  const [contenu, setContenu] = useState("");

  const nomChantier = chantier?.nom || "Mon chantier";

  useEffect(() => {
    const tpl = RELANCE_TEMPLATES[type];
    if (tpl) setContenu(tpl.template(artisan || "l'artisan", nomChantier));
  }, [type, artisan, nomChantier]);

  const save = async () => {
    if (!chantier || !artisan.trim()) { toast.error("Renseignez le nom de l'artisan"); return; }
    const { error } = await supabase.from("relances").insert({
      chantier_id: chantier.id,
      artisan_nom: artisan,
      artisan_email: email,
      type,
      contenu,
    });
    if (error) { toast.error("Erreur"); return; }
    toast.success("Relance enregistrée");
    setArtisan(""); setEmail(""); setContenu("");
    onRefresh();
  };

  const markSent = async (id: string) => {
    await supabase.from("relances").update({ envoye_at: new Date().toISOString() }).eq("id", id);
    toast.success("Marquée comme envoyée");
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Relances Artisans</h1>

      {/* Form */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold text-foreground">Nouvelle relance</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Type</label>
            <select
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              value={type}
              onChange={e => setType(e.target.value)}
            >
              {Object.entries(RELANCE_TEMPLATES).map(([k, { label }]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Nom artisan</label>
            <input
              type="text"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="ex: Plomberie Dupont"
              value={artisan}
              onChange={e => setArtisan(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground block mb-1">Email artisan (optionnel)</label>
            <input
              type="email"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="artisan@exemple.fr"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground block mb-1">Contenu (modifiable)</label>
            <textarea
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-none"
              rows={7}
              value={contenu}
              onChange={e => setContenu(e.target.value)}
            />
          </div>
        </div>
        <Button size="sm" onClick={save}>
          <Plus className="h-4 w-4 mr-2" />
          Enregistrer la relance
        </Button>
      </div>

      {/* List */}
      {relances.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">Historique des relances</h3>
          {relances.map(r => {
            const tpl = RELANCE_TEMPLATES[r.type];
            return (
              <div key={r.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-foreground text-sm">{r.artisan_nom}</span>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{tpl?.label || r.type}</span>
                      {r.envoye_at ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />Envoyée le {formatDate(r.envoye_at)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />Non envoyée
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Créée le {formatDate(r.created_at)}</p>
                  </div>
                  {!r.envoye_at && (
                    <Button variant="outline" size="sm" onClick={() => markSent(r.id)}>
                      Marquer envoyée
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// TAB: JOURNAL
// ══════════════════════════════════════════════════════════════
const JournalTab = ({
  journal, onAdd,
}: {
  journal: JournalEntry[];
  onAdd: (note: string, phase: string, tags: string[]) => Promise<void>;
}) => {
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState("preparation");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleTag = (t: string) =>
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const submit = async () => {
    if (!note.trim()) { toast.error("Rédigez une note"); return; }
    setSaving(true);
    await onAdd(note, phase, tags);
    setNote(""); setTags([]);
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Journal de Chantier</h1>

      {/* Add entry form */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold text-foreground">Nouvelle entrée</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Phase</label>
            <select
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              value={phase}
              onChange={e => setPhase(e.target.value)}
            >
              {Object.entries(PHASE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(TAG_CONFIG).map(([k, { label, color }]) => (
                <button
                  key={k}
                  onClick={() => toggleTag(k)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all border ${
                    tags.includes(k)
                      ? `${color} border-transparent scale-95`
                      : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground block mb-1">Note</label>
            <textarea
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-none"
              rows={3}
              placeholder="Décrivez l'avancement, les observations, les problèmes rencontrés…"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
        </div>
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
          Ajouter au journal
        </Button>
      </div>

      {/* Entries */}
      {journal.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-2xl">
          <Camera className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium text-foreground">Journal vide</p>
          <p className="text-sm text-muted-foreground mt-1">Commencez à documenter votre chantier ci-dessus</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
          <div className="space-y-4 pl-10">
            {journal.map(entry => (
              <div key={entry.id} className="relative">
                <div className="absolute -left-[34px] top-4 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {PHASE_LABELS[entry.phase] || entry.phase}
                      </span>
                      {entry.tags.map(t => (
                        <span key={t} className={`text-xs px-2 py-0.5 rounded-full font-medium ${TAG_CONFIG[t]?.color || "bg-gray-100 text-gray-600"}`}>
                          {TAG_CONFIG[t]?.label || t}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(entry.date)}</span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{entry.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MonChantier;
