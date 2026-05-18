/**
 * BudgetTab v3 — Tableau de suivi budget par artisan.
 *
 * Structure :
 *   1. Header KPIs (Budget estimé fourchette · Budget validé · Total facturé · Total payé)
 *   2. Barre d'actions (recherche, filtres, tri, + Ajouter un document)
 *   3. Tableau principal (1 ligne = 1 artisan/lot)
 *      Colonnes : Artisan · Poste · Devis + dl · Statut devis · Factures · Statut · Reste · Progression · Docs
 *   4. Drawer détail artisan (devis + factures avec statut cliquable)
 */
import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Search, Plus, Paperclip, X, Download,
  AlertCircle, Loader2, RotateCw, AlertTriangle,
  Check, Clock, ChevronDown, ChevronUp, ChevronRight, Scale, Pencil,
} from 'lucide-react';
import { fmtEur } from '@/lib/chantier/financingUtils';
import { toast } from 'sonner';
import AddDocumentModal from '../documents/AddDocumentModal';
import VersementsDrawer from '../tresorerie/VersementsDrawer';
import PaiementDrawer, { type PaiementContext } from '../tresorerie/PaiementDrawer';
import OrphansReconciliationModal from './OrphansReconciliationModal';
import type { LotChantier } from '@/types/chantier-ia';
import { useIsMobile } from '@/hooks/useIsMobile';

// ── Supabase ──────────────────────────────────────────────────────────────────

const _sb = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL,
  (import.meta as any).env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

async function freshToken(fallback: string): Promise<string> {
  const { data: { session } } = await _sb.auth.getSession();
  return session?.access_token ?? fallback;
}

// ── Types (miroir de l'API /budget) ───────────────────────────────────────────

interface BudgetDevis {
  id:             string;
  nom:            string;
  montant:        number | null;
  devis_statut:   string | null;
  analyse_id:     string | null;
  analyse_score:  number | null;
  analyse_signal: string | null;
  signed_url:     string | null;
  created_at:     string;
  montant_acompte_echeancier?: number;
  payment_event_ids?: string[];        // IDs des payment_events payés
  pending_events?: { id: string; amount: number | null; label: string | null }[]; // events pending Échéancier
  // ── Avenant ─────────────────────────────────────────────────────────────────
  parent_devis_id?:    string | null;
  parent_nom?:         string | null;
  parent_analyse_id?:  string | null;
  avenant_motif?:      string | null;
  devis_validated_at?: string | null;
}

interface BudgetFacture {
  id:             string;
  nom:            string;
  montant:        number | null;
  montant_paye:   number | null;
  facture_statut: string | null;
  depense_type:   string | null;
  payment_terms:  {
    type_facture:   string;
    pct:            number;
    delai_jours:    number;
    numero_facture: string | null;
  } | null;
  signed_url:     string | null;
  created_at:     string;
}

interface BudgetLotTotaux {
  devis_recus:     number;
  devis_valides:   number;
  facture:         number;
  paye:            number;
  acompte:         number;
  /** Acomptes versés sur des devis non encore signés — exclus du KPI Décaissé */
  acompte_pending?: number;
  litige:          number;
  a_payer:         number;
  /**
   * V3.4.16 (2026-05-18) — somme des soldes restants par artisan sans facture.
   * Présent uniquement sur les totaux globaux (pas sur les lots/artisans).
   * Calculé côté backend pour éviter le bug de "compensation entre artisans".
   * Optionnel pour la compat avec les anciens caches d'API.
   */
  a_venir?:        number;
}

interface BudgetArtisanGroup {
  nom:      string;
  devis:    BudgetDevis[];
  factures: BudgetFacture[];
  totaux: {
    devis_valides: number;
    facture:       number;
    paye:          number;
    acompte:       number;
    litige:        number;
    a_payer:       number;
  };
}

interface BudgetLot {
  id:       string;
  nom:      string;
  emoji:    string | null;
  devis:    BudgetDevis[];
  factures: BudgetFacture[];
  artisans: BudgetArtisanGroup[];
  totaux:   BudgetLotTotaux;
}

interface CashflowOrphan {
  id:               string;
  label:            string;
  amount:           number;
  due_date:         string;
  status:           'pending' | 'paid' | 'late' | 'cancelled';
  financing_source: string | null;
  notes:            string | null;
  created_at:       string;
}

interface BudgetData {
  budget_ia:         number;
  lots:              BudgetLot[];
  sans_lot:          BudgetLot | null;
  totaux:            BudgetLotTotaux;
  type_projet:       string;
  backfilled_count:  number;
  cashflow_orphans?: CashflowOrphan[];
}

// ── Ligne enrichie ────────────────────────────────────────────────────────────

type FactureStatut = 'payee' | 'recue' | 'payee_partiellement' | 'en_litige';
type DevisStatut   = 'validated' | 'received' | 'pending';
type PayStatut     = 'paid' | 'litige' | 'partial' | 'unpaid' | 'none';

interface BudgetRow {
  lot:             BudgetLot;
  devisAmount:     number | null; // budget total du lot = devis_valides + factures hors-devis
  devisAmountGrey: number | null;
  devisStatut:     DevisStatut;
  facture:         number;
  factureHorsDevis: number;       // part facturée non couverte par les devis validés
  paye:            number;
  totalPaye:       number;        // paye + acompte
  reste:           number;
  payStatut:       PayStatut;
  alertOverrun:    boolean;
}

function buildRow(lot: BudgetLot): BudgetRow {
  const { devis_valides, devis_recus, facture, paye, acompte } = lot.totaux;
  // Par artisan : ceux avec devis → devis_valides, ceux sans devis → facture (engagement réel même sans devis)
  const budgetTotal = lot.artisans.length > 0
    ? lot.artisans.reduce((s, a) => s + (a.devis.length > 0 ? a.totaux.devis_valides : a.totaux.facture), 0)
    : devis_valides + (devis_valides > 0 ? Math.max(0, facture - devis_valides) : facture);
  const factureHorsDevis = Math.max(0, facture - devis_valides);
  const totalPaye = paye + acompte;
  // Si facture existe → solde restant sur la facture ; sinon → engagement devis moins acomptes déjà versés
  const reste = facture > 0
    ? Math.max(0, facture - totalPaye)
    : Math.max(0, devis_valides - totalPaye);

  const statuses = lot.devis.map(d => d.devis_statut);
  let devisStatut: DevisStatut = 'pending';
  if (statuses.some(s => s === 'valide' || s === 'attente_facture')) devisStatut = 'validated';
  else if (statuses.some(s => s === 'en_cours')) devisStatut = 'received';

  // Statut paiement agrégé
  // V3.4.16 (2026-05-18) — Fix Bug 1 : un devis 100% soldé par acompte SANS
  // facture émise doit afficher "Payée"/"Soldé" (pas "Acompte"). Avant le fix,
  // `payStatut = 'paid'` exigeait `facture > 0`, ce qui laissait les devis sans
  // facture coincés en `'partial'` même quand l'acompte couvrait 100%.
  let payStatut: PayStatut = 'none';
  if (lot.factures.length > 0 || acompte > 0) {
    if (lot.totaux.litige > 0)             payStatut = 'litige';
    else if (facture > 0 && totalPaye >= facture) payStatut = 'paid';
    // V3.4.16 — devis 100% couvert par acompte sans facture émise → soldé
    else if (facture === 0 && devis_valides > 0 && totalPaye >= devis_valides) payStatut = 'paid';
    else if (acompte > 0 || paye > 0)      payStatut = 'partial';
    else if (facture > 0)                  payStatut = 'unpaid';
  }

  return {
    lot,
    devisAmount:      budgetTotal > 0 ? budgetTotal : null,
    devisAmountGrey:  devis_valides === 0 && devis_recus > 0 ? devis_recus : null,
    devisStatut,
    facture,
    factureHorsDevis,
    paye,
    totalPaye,
    reste,
    payStatut,
    alertOverrun: devis_valides > 0 && facture > devis_valides * 1.05,
  };
}

// ── Hook données ──────────────────────────────────────────────────────────────

function useBudgetData(chantierId: string, token: string) {
  const [data,          setData]          = useState<BudgetData | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [backfillToast, setBackfillToast] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bearer = await freshToken(token);
      const res = await fetch(`/api/chantier/${chantierId}/budget`, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: BudgetData = await res.json();
      setData(json);
      if ((json.backfilled_count ?? 0) > 0) {
        setBackfillToast(true);
        setTimeout(() => setBackfillToast(false), 5000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [chantierId, token]);

  // Wrapper refresh : recharge ET notifie les autres écrans (Échéancier, Accueil)
  const refreshAndBroadcast = useCallback(async () => {
    await load();
    window.dispatchEvent(new CustomEvent('chantierBudgetChanged', { detail: { chantierId } }));
  }, [load, chantierId]);

  useEffect(() => { load(); }, [load]);

  // Recharge automatiquement quand une dépense est créée depuis un autre écran
  // (Échéancier, Accueil) → événement `chantierBudgetChanged` dispatch global.
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.chantierId === chantierId) load();
    }
    window.addEventListener('chantierBudgetChanged', onChange);
    return () => window.removeEventListener('chantierBudgetChanged', onChange);
  }, [chantierId, load]);

  return { data, loading, error, refresh: refreshAndBroadcast, backfillToast };
}

// ── Configs statuts ───────────────────────────────────────────────────────────

const DEVIS_STATUS: Record<DevisStatut, { label: string; cls: string }> = {
  validated: { label: 'Validé',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  received:  { label: 'Reçu',       cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  pending:   { label: 'En attente', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const PAY_STATUS: Record<PayStatut, { label: string; cls: string; icon: React.ReactNode }> = {
  paid:    { label: 'Payé',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <Check className="h-3 w-3" /> },
  litige:  { label: 'Litige',   cls: 'bg-red-50 text-red-700 border-red-200',            icon: <Scale className="h-3 w-3" /> },
  partial: { label: 'Partiel',  cls: 'bg-blue-50 text-blue-700 border-blue-200',         icon: <ChevronDown className="h-3 w-3" /> },
  unpaid:  { label: 'À payer',  cls: 'bg-amber-50 text-amber-700 border-amber-200',      icon: <Clock className="h-3 w-3" /> },
  none:    { label: '—',        cls: 'text-gray-300',                                    icon: null },
};

const FACTURE_STATUT_CFG: Record<FactureStatut, { label: string; short: string; cls: string; icon: React.ReactNode }> = {
  recue:               { label: 'Reçue — à payer',     short: 'À payer', cls: 'bg-amber-50 text-amber-700 border-amber-200',      icon: <Clock className="h-3 w-3" /> },
  payee_partiellement: { label: 'Acompte versé',        short: 'Acompte', cls: 'bg-blue-50 text-blue-700 border-blue-200',         icon: <ChevronDown className="h-3 w-3" /> },
  en_litige:           { label: 'En litige',            short: 'Litige',  cls: 'bg-red-50 text-red-700 border-red-200',            icon: <Scale className="h-3 w-3" /> },
  payee:               { label: 'Payée intégralement', short: 'Payée',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <Check className="h-3 w-3" /> },
};

const DEVIS_STATUT_LABEL: Record<string, string> = {
  en_cours: 'Reçu', a_relancer: 'À relancer', valide: 'Validé', attente_facture: 'Att. facture',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function smartFactureLabel(f: BudgetFacture): string {
  const terms = f.payment_terms;
  if (terms) {
    const type = terms.type_facture === 'acompte' ? 'Acompte'
               : terms.type_facture === 'solde'   ? 'Solde'
               : 'Facture';
    return `${type} ${terms.pct > 0 ? terms.pct + '%' : ''} · ${fmtDate(f.created_at)}`.trim();
  }
  const n = f.nom.toLowerCase();
  if (n.includes('acompte') || n.includes('accompte')) return `Acompte · ${fmtDate(f.created_at)}`;
  if (n.includes('solde'))                             return `Solde · ${fmtDate(f.created_at)}`;
  return `${f.nom} · ${fmtDate(f.created_at)}`;
}

// ── Sub-composants ────────────────────────────────────────────────────────────

function Badge({ label, cls, icon }: { label: string; cls: string; icon?: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {icon}{label}
    </span>
  );
}

function ProgressBar({ paye, budget }: { paye: number; budget: number }) {
  if (budget === 0) return <span className="text-gray-300 text-[11px]">—</span>;
  const pct   = Math.min(Math.round((paye / budget) * 100), 100);
  const color = pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-indigo-500' : 'bg-gray-200';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 w-8 text-right shrink-0">{pct}%</span>
    </div>
  );
}

// ── Info Tooltip ──────────────────────────────────────────────────────────────

function InfoTooltip({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center ml-1" style={{ verticalAlign: 'middle' }}>
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        className="text-gray-300 hover:text-gray-400 transition-colors focus:outline-none"
        aria-label="Aide"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="6.5" r="6" stroke="currentColor" strokeWidth="1.2" />
          <text x="6.5" y="9.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor">?</text>
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-56 bg-gray-900 text-white text-[11px] rounded-xl shadow-xl px-3 py-2.5 leading-relaxed pointer-events-none">
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
          {lines.map((l, i) => <p key={i} className={i > 0 ? 'mt-1' : ''}>{l}</p>)}
        </div>
      )}
    </span>
  );
}

// ── SVG Donut ─────────────────────────────────────────────────────────────────

function DonutRing({ pct, color, size = 56, stroke = 5 }: {
  pct: number; color: string; size?: number; stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(Math.max(pct, 0), 100) / 100 * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
         style={{ transform: 'rotate(-90deg)', display: 'block' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.55s ease' }}
      />
    </svg>
  );
}

// ── KPI Dashboard ─────────────────────────────────────────────────────────────

function BudgetKpiDashboard({
  data, loading, chantierId, token, initialEnveloppePrevue,
}: {
  data:                    BudgetData | null;
  loading:                 boolean;
  chantierId:              string;
  token:                   string;
  initialEnveloppePrevue?: number | null;
}) {
  // ── Source de vérité unique : chantiers.budget (passé via initialEnveloppePrevue) ──
  // Avant 2026-05-09 : localStorage avait priorité sur le serveur → drift possible
  // (l'utilisateur saisissait 73 998 € en local mais la DB gardait 38 000 €).
  // Maintenant : on initialise depuis le serveur, on écrit DB en premier sur édition,
  // localStorage devient un simple miroir pour la sync cross-onglet.
  const storageKey = `budget_reel_${chantierId}`;
  const [budgetReel, setBudgetReel] = useState<number | null>(initialEnveloppePrevue ?? null);

  // Quand le serveur renvoie une nouvelle valeur (après PATCH ou refresh), on resync
  useEffect(() => {
    if (initialEnveloppePrevue != null) setBudgetReel(initialEnveloppePrevue);
  }, [initialEnveloppePrevue]);

  // ── Détection de drift localStorage vs serveur (ancienne valeur saisie en local
  //    qui n'a jamais été persistée en DB, typiquement avant le fix 2026-05-09).
  //    On affiche une bannière qui demande à l'utilisateur quelle valeur garder. ──
  const [driftValue, setDriftValue] = useState<number | null>(null);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return;
      const local = parseFloat(stored);
      if (isNaN(local) || local <= 0) return;
      const server = initialEnveloppePrevue ?? 0;
      // Drift = local existe ET diffère du serveur de plus de 1 €
      if (Math.abs(local - server) > 1) setDriftValue(local);
      else setDriftValue(null);
    } catch {}
  }, [storageKey, initialEnveloppePrevue]);

  // Écoute les mises à jour cross-component (autre onglet, TresorerieView)
  useEffect(() => {
    function handler(e: Event) {
      const { chantierId: cid, value } = (e as CustomEvent).detail;
      if (cid === chantierId) setBudgetReel(value);
    }
    window.addEventListener('budgetReelChanged', handler);
    return () => window.removeEventListener('budgetReelChanged', handler);
  }, [chantierId]);

  const [editing,  setEditing]  = useState(false);
  const [editVal,  setEditVal]  = useState('');

  const totaux         = data?.totaux;
  const decaisse       = (totaux?.paye ?? 0) + (totaux?.acompte ?? 0); // tout ce qui est sorti du compte
  const aRegler        = totaux?.a_payer  ?? 0;                         // factures reçues non soldées
  const litige         = totaux?.litige   ?? 0;
  const devisValides   = totaux?.devis_valides ?? 0;
  // Reste à venir (net des acomptes) : ce que l'utilisateur va encore décaisser
  // sur les artisans qui n'ont pas encore émis de facture (futur engagement).
  //
  // V3.4.16 (2026-05-18) — Bug 4 fix : on lit `totaux.a_venir` (calculé par
  // artisan côté backend) au lieu du calcul global `devisValides - facture -
  // acompte` qui mélangait les acomptes de TOUS les artisans et masquait des
  // soldes restants (cas MURO 2352€ resté invisible).
  // Fallback sur l'ancien calcul si l'API n'a pas encore le champ (caches).
  const aVenir         = totaux?.a_venir !== undefined
    ? totaux.a_venir
    : Math.max(0, devisValides - (totaux?.facture ?? 0) - (totaux?.acompte ?? 0));
  // Budget cible : saisi manuellement OU estimation IA (jamais "engagé")
  const effectiveReel  = budgetReel ?? ((data?.budget_ia ?? 0) > 0 ? data!.budget_ia : null);
  const budgetRestant  = effectiveReel ? Math.max(0, effectiveReel - decaisse - aRegler) : 0;

  const pctDecaisse   = effectiveReel && effectiveReel > 0 ? Math.round((decaisse / effectiveReel) * 100) : 0;
  const pctARegler    = effectiveReel && effectiveReel > 0 ? Math.round((aRegler / effectiveReel) * 100) : 0;
  const pctAVenir     = effectiveReel && effectiveReel > 0 ? Math.round((aVenir  / effectiveReel) * 100) : 0;

  // V3.4.16 (2026-05-18) — Bug 2 fix : détection dépassement budget cible.
  // Tolérance 5% (taux de variation classique en BTP, on n'alerte pas pour 100€
  // de plus). Au-delà → KPI Décaissé en rouge avec sub-label "+X € dépassement".
  const overBudget    = effectiveReel && decaisse > effectiveReel * 1.05;
  const overBudgetAmt = overBudget && effectiveReel ? Math.round(decaisse - effectiveReel) : 0;

  // Couleurs dynamiques (V3.4.16 — Décaissé passe en rouge si dépassement)
  const colorDecaisse   = overBudget ? '#ef4444' : pctDecaisse >= 100 ? '#10b981' : pctDecaisse > 0 ? '#3b82f6' : '#d1d5db';
  const colorARegler    = aRegler > 0 ? '#f59e0b' : '#d1d5db';
  const colorAVenir     = aVenir  > 0 ? '#8b5cf6' : '#d1d5db';

  function startEdit() {
    setEditVal(effectiveReel ? String(Math.round(effectiveReel)) : '');
    setEditing(true);
  }

  // DB-first : on PATCH le serveur D'ABORD, localStorage devient un miroir post-succès.
  // En cas d'échec, on prévient l'utilisateur au lieu de divergir silencieusement.
  async function persistBudgetReel(v: number): Promise<boolean> {
    try {
      const tk = await freshToken(token);
      const res = await fetch(`/api/chantier/${chantierId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ enveloppePrevue: v }),
      });
      if (!res.ok) {
        toast.error('Impossible d\'enregistrer le budget cible. Réessayez.');
        return false;
      }
    } catch {
      toast.error('Erreur réseau. Le budget cible n\'a pas été sauvegardé.');
      return false;
    }
    // DB ok → on met à jour le state local + localStorage miroir
    setBudgetReel(v);
    setDriftValue(null);
    try {
      localStorage.setItem(storageKey, String(v));
      const tvKey = `tresorerie_v3_${chantierId}`;
      try {
        const saved = localStorage.getItem(tvKey);
        const parsed = saved ? JSON.parse(saved) : {};
        localStorage.setItem(tvKey, JSON.stringify({ ...parsed, budgetReel: v }));
      } catch {}
    } catch {}
    window.dispatchEvent(new CustomEvent('budgetReelChanged', { detail: { chantierId, value: v } }));
    // Sync miroir tresoreieFinancing (legacy, pour TresorerieView)
    freshToken(token).then(async tk => {
      const tvKey2 = `tresorerie_v3_${chantierId}`;
      try {
        const saved = localStorage.getItem(tvKey2);
        const parsed = saved ? JSON.parse(saved) : {};
        await fetch(`/api/chantier/${chantierId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
          body: JSON.stringify({ metadonnees: { tresoreieFinancing: { ...parsed, budgetReel: v } } }),
        }).catch(() => {});
      } catch {}
    }).catch(() => {});
  }

  function commitEdit() {
    const v = parseFloat(editVal.replace(/\s/g, '').replace(',', '.'));
    if (!isNaN(v) && v > 0) persistBudgetReel(v);
    setEditing(false);
  }

  if (loading) return (
    <div className="px-7 py-6 border-b border-gray-100">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 sm:gap-6">
        {[0,1,2,3].map(i => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-gray-100 animate-pulse shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-2.5 w-24 bg-gray-100 rounded animate-pulse" />
              <div className="h-5 w-20 bg-gray-100 rounded animate-pulse" />
              <div className="h-2.5 w-14 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="border-b border-gray-100 bg-white">

      {/* ── Bannière de drift localStorage vs serveur ─────────────────── */}
      {driftValue !== null && (
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-amber-900">
              Budget cible incohérent — quel chiffre garder ?
            </p>
            <p className="text-[11px] text-amber-700/90">
              <strong>Saisi localement</strong> : {fmtEur(driftValue)} ·
              <strong className="ml-1.5">Enregistré en base</strong> : {effectiveReel ? fmtEur(effectiveReel) : '—'}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={async () => { await persistBudgetReel(driftValue); }}
              className="px-3 py-1.5 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
            >
              Garder {fmtEur(driftValue)}
            </button>
            <button
              onClick={() => {
                try { localStorage.removeItem(storageKey); } catch {}
                setDriftValue(null);
              }}
              className="px-3 py-1.5 text-[11px] font-semibold text-amber-700 border border-amber-300 hover:bg-amber-100 rounded-lg transition-colors"
            >
              Garder {effectiveReel ? fmtEur(effectiveReel) : 'serveur'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">

        {/* ── 1. Budget cible (éditable) ─────────────────── */}
        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center">
              Budget cible
              <InfoTooltip lines={[
                'Votre enveloppe globale pour ce chantier.',
                effectiveReel ? `Budget actuel : ${fmtEur(effectiveReel)}` : 'Cliquez sur "Modifier" pour définir votre budget.',
                budgetRestant > 0 ? `Reste disponible : ${fmtEur(budgetRestant)}` : '',
              ].filter(Boolean) as string[]} />
            </p>
            {!editing && (
              <button onClick={startEdit}
                      className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-500 transition-colors">
                <Pencil className="h-3 w-3" />
                Modifier
              </button>
            )}
          </div>
          <div className="min-w-0">
            {editing ? (
              <div className="flex items-center gap-1 mb-1.5">
                <input
                  autoFocus
                  type="number"
                  inputMode="decimal"
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
                  className="w-32 text-[20px] font-black border-b-2 border-indigo-400 outline-none bg-transparent text-gray-800 pb-0.5"
                  placeholder="Ex: 45000"
                />
                <span className="text-[14px] text-gray-400">€</span>
              </div>
            ) : (
              <button onClick={startEdit} className="group text-left mb-1.5">
                <p className="text-[22px] font-black text-gray-800 group-hover:text-indigo-600 transition-colors leading-none">
                  {effectiveReel ? fmtEur(effectiveReel) : <span className="text-gray-300 text-[13px]">Cliquer pour définir</span>}
                </p>
              </button>
            )}
            {effectiveReel && !budgetReel && (
              <p className="text-[10px] text-indigo-400 mt-1">Estimation IA — cliquez Modifier pour ajuster</p>
            )}
            {budgetRestant > 0 && !overBudget && (
              <p className="text-[11px] text-emerald-600 font-semibold mt-1.5">
                Reste : {fmtEur(budgetRestant)}
              </p>
            )}
            {/* V3.4.16 — alerte dépassement budget cible visible aussi sous l'enveloppe */}
            {overBudget && (
              <p className="text-[11px] text-red-600 font-semibold mt-1.5 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />+{fmtEur(overBudgetAmt)} au-delà du budget
              </p>
            )}
          </div>
        </div>

        {/* ── 3. Décaissé ───────────────────────────────── */}
        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center">
            Décaissé
            <InfoTooltip lines={[
              'Tout l\'argent qui a quitté votre compte.',
              totaux?.acompte
                ? `Versés sur devis : ${fmtEur(totaux.acompte)} (acomptes ou solde sans facture émise)`
                : null,
              totaux?.paye
                ? `Versés sur factures : ${fmtEur(totaux.paye)} (factures payées intégralement)`
                : null,
              `Total sorti : ${fmtEur(decaisse)}`,
            ].filter(Boolean) as string[]} />
          </p>
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <DonutRing pct={pctDecaisse} color={colorDecaisse} size={80} stroke={7} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[12px] font-black text-gray-700">{pctDecaisse}%</span>
              </div>
            </div>
            <div>
              <p className="text-[18px] font-black text-gray-800 leading-none">{decaisse > 0 ? fmtEur(decaisse) : '—'}</p>
              {decaisse > 0 ? (
                <div className="mt-1.5 space-y-0.5">
                  {(totaux?.acompte ?? 0) > 0 && (
                    <p className="text-[10px] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                      <span className="text-gray-500">Versés sur devis</span>
                      <span className="font-semibold text-indigo-600 ml-auto">{fmtEur(totaux!.acompte)}</span>
                    </p>
                  )}
                  {(totaux?.paye ?? 0) > 0 && (
                    <p className="text-[10px] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="text-gray-500">Versés sur factures</span>
                      <span className="font-semibold text-emerald-600 ml-auto">{fmtEur(totaux!.paye)}</span>
                    </p>
                  )}
                  {overBudget ? (
                    /* V3.4.16 — alerte dépassement budget (priorité sur "Tout soldé") */
                    <p className="text-[10px] text-red-600 font-semibold flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="h-3 w-3" />Dépassement de +{fmtEur(overBudgetAmt)} ({Math.round((overBudgetAmt / (effectiveReel ?? 1)) * 100)}%)
                    </p>
                  ) : (
                    pctDecaisse >= 100 && devisValides > 0 && (
                      <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                        <Check className="h-3 w-3" />Tout soldé
                      </p>
                    )
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 mt-1.5">Aucun paiement</p>
              )}
            </div>
          </div>
        </div>

        {/* ── 4. À régler ───────────────────────────────── */}
        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center">
            À régler
            <InfoTooltip lines={[
              'Factures reçues mais pas encore payées.',
              'Ces montants sont dus à vos artisans.',
              aRegler > 0 ? `Montant dû : ${fmtEur(aRegler)}` : 'Aucune facture en attente de paiement.',
              litige > 0 ? `⚠️ Dont ${fmtEur(litige)} en litige` : null,
            ].filter(Boolean) as string[]} />
          </p>
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <DonutRing pct={pctARegler} color={colorARegler} size={80} stroke={7} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[12px] font-black text-gray-700">{pctARegler}%</span>
              </div>
            </div>
            <div>
              <p className="text-[18px] font-black text-gray-800 leading-none">{aRegler > 0 ? fmtEur(aRegler) : '—'}</p>
              {litige > 0 ? (
                <p className="text-[11px] text-red-500 mt-1.5 flex items-center gap-1 font-semibold">
                  <Scale className="h-3 w-3" />{fmtEur(litige)} en litige
                </p>
              ) : (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  {aRegler > 0 ? 'factures reçues non soldées' : 'Aucune facture due'}
                </p>
              )}
              {aRegler > 0 && (
                <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1 font-semibold">
                  <AlertTriangle className="h-3 w-3" />À payer
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── 4. À venir — engagement net : devis signés − factures − acomptes versés ─── */}
        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center">
            À venir
            <InfoTooltip lines={[
              'Ce qu\'il vous reste à décaisser sur vos devis signés.',
              'Formule : devis signés − déjà facturé − acomptes versés.',
              (totaux?.acompte ?? 0) > 0
                ? `Acomptes déjà versés : ${fmtEur(totaux!.acompte)} (déduits)`
                : null,
              aVenir > 0
                ? `Reste à régler : ${fmtEur(aVenir)}`
                : 'Tout est réglé ou facturé.',
            ].filter(Boolean) as string[]} />
          </p>
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <DonutRing pct={pctAVenir} color={colorAVenir} size={80} stroke={7} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[12px] font-black text-gray-700">{pctAVenir}%</span>
              </div>
            </div>
            <div>
              <p className="text-[18px] font-black text-gray-800 leading-none">
                {aVenir > 0 ? fmtEur(aVenir) : '—'}
              </p>
              <p className="text-[11px] text-gray-400 mt-1.5">
                {aVenir > 0
                  ? ((totaux?.acompte ?? 0) > 0 ? 'reste à régler (acomptes déduits)' : 'reste à régler')
                  : devisValides > 0 ? 'Tout réglé ✓' : 'Aucun devis signé'}
              </p>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}

// ── Action bar ────────────────────────────────────────────────────────────────

type FilterDevis = 'all' | 'pending' | 'received' | 'validated';
type FilterPay   = 'all' | 'unpaid' | 'partial' | 'paid' | 'litige';
type SortBy      = 'default' | 'amount' | 'reste' | 'nom';

function ActionBar({
  search, onSearch,
  filterDevis, onFilterDevis,
  filterPay, onFilterPay,
  sortBy, onSort,
  onAddDocument,
  onAddDepense,
  onToggleAll,
  allExpanded,
  isMobile = false,
}: {
  search: string; onSearch: (v: string) => void;
  filterDevis: FilterDevis; onFilterDevis: (v: FilterDevis) => void;
  filterPay: FilterPay; onFilterPay: (v: FilterPay) => void;
  sortBy: SortBy; onSort: (v: SortBy) => void;
  onAddDocument?: () => void;
  onAddDepense?: () => void;
  onToggleAll?: () => void;
  allExpanded?: boolean;
  /** V3.4.14+ — propagé depuis BudgetTab via useIsMobile() pour amplifier les
   * zones tactiles (input search, CTAs). Sur desktop, on garde le sizing dense
   * existant. */
  isMobile?: boolean;
}) {
  const sel = 'text-[12px] border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-300 w-full md:w-auto';
  // V3.4.14+ — hauteur tactile mobile pour la saisie de recherche (h-11 = 44px = WCAG)
  const inputClass = isMobile
    ? "w-full pl-9 pr-9 h-11 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 placeholder:text-gray-400"
    : "w-full pl-8 pr-7 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 placeholder:text-gray-400";
  return (
    <div className="px-5 py-3 border-b border-gray-100 flex flex-col md:flex-row md:items-center gap-2 md:gap-3 md:flex-wrap">
      <div className="relative w-full md:flex-1 md:min-w-[180px] md:max-w-xs">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5'} text-gray-400 pointer-events-none`} aria-hidden="true" />
        <input
          value={search} onChange={e => onSearch(e.target.value)}
          placeholder="Rechercher un artisan…"
          inputMode="search"
          aria-label="Rechercher un artisan"
          className={inputClass}
        />
        {search && (
          <button onClick={() => onSearch('')} aria-label="Effacer la recherche" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5">
            <X className="h-3 w-3 text-gray-400 hover:text-gray-600" aria-hidden="true" />
          </button>
        )}
      </div>
      {/* Filtres & tri — masqués sur mobile (remplacés par les cartes) */}
      <div className="hidden sm:grid sm:grid-cols-3 gap-2 md:flex md:gap-3 md:contents">
        <select value={filterDevis} onChange={e => onFilterDevis(e.target.value as FilterDevis)} className={sel}>
          <option value="all">Tous statuts devis</option>
          <option value="pending">En attente</option>
          <option value="received">Reçu</option>
          <option value="validated">Validé</option>
        </select>
        <select value={filterPay} onChange={e => onFilterPay(e.target.value as FilterPay)} className={sel}>
          <option value="all">Tous paiements</option>
          <option value="unpaid">À payer</option>
          <option value="partial">Partiel</option>
          <option value="paid">Payé</option>
          <option value="litige">En litige</option>
        </select>
        <select value={sortBy} onChange={e => onSort(e.target.value as SortBy)} className={sel}>
          <option value="default">Tri par défaut</option>
          <option value="amount">Montant devis</option>
          <option value="reste">Reste à payer</option>
          <option value="nom">Nom artisan</option>
        </select>
      </div>
      <div className="hidden md:block md:flex-1" />
      {/* Tout développer / réduire */}
      {onToggleAll && (
        <button
          onClick={onToggleAll}
          className="hidden sm:flex w-full md:w-auto items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 text-[12px] font-medium hover:bg-gray-50 transition-colors shrink-0"
        >
          {allExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {allExpanded ? 'Tout réduire' : 'Tout développer'}
        </button>
      )}
      {/* Dépense rapide — achat matériaux / paiement liquide sans document */}
      <button
        onClick={onAddDepense}
        className={`w-full md:w-auto flex items-center justify-center gap-1.5 ${isMobile ? 'px-4 min-h-[44px] text-sm' : 'px-3.5 py-2 text-[12px]'} rounded-lg border border-orange-200 bg-orange-50 text-orange-700 font-semibold hover:bg-orange-100 transition-colors shrink-0 touch-manipulation`}
      >
        <Plus className={isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5'} aria-hidden="true" />
        Dépense
      </button>
      <button
        onClick={onAddDocument}
        className={`w-full md:w-auto flex items-center justify-center gap-1.5 ${isMobile ? 'px-4 min-h-[44px] text-sm' : 'px-3.5 py-2 text-[12px]'} rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors shrink-0 touch-manipulation`}
      >
        <Plus className={isMobile ? 'h-4 w-4' : 'h-3.5 w-3.5'} aria-hidden="true" />
        Ajouter un document
      </button>
    </div>
  );
}

// ── Drawer détail artisan ─────────────────────────────────────────────────────

function ArtisanDrawer({
  row, chantierId, token, onClose, onStatutChange, onRefresh,
}: {
  row:             BudgetRow;
  chantierId:      string;
  token:           string;
  onClose:         () => void;
  onStatutChange?: (factureId: string, statut: FactureStatut) => void;
  onRefresh?:      () => void;
}) {
  const { lot } = row;
  const [changingId,            setChangingId]            = useState<string | null>(null);
  const [openMenu,              setOpenMenu]              = useState<string | null>(null);
  const [acompteInput,          setAcompteInput]          = useState<{ factureId: string; value: string } | null>(null);
  const [editingMontant,        setEditingMontant]        = useState<{ devisId: string; value: string } | null>(null);
  const [savingMontant,         setSavingMontant]         = useState<string | null>(null);
  const [editingMontantFacture, setEditingMontantFacture] = useState<{ factureId: string; value: string } | null>(null);

  async function saveMontantDevis(devisId: string, valStr: string) {
    const montant = parseFloat(valStr.replace(',', '.'));
    if (isNaN(montant) || montant <= 0) { setEditingMontant(null); return; }
    setSavingMontant(devisId);
    try {
      const bearer = await freshToken(token);
      await fetch(`/api/chantier/${chantierId}/documents/${devisId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ montant }),
      });
      setEditingMontant(null);
      onRefresh?.();
    } catch { /* silencieux */ }
    setSavingMontant(null);
  }

  async function saveMontantFacture(factureId: string, valStr: string) {
    const montant = parseFloat(valStr.replace(',', '.'));
    if (isNaN(montant) || montant <= 0) { setEditingMontantFacture(null); return; }
    setSavingMontant(factureId);
    try {
      const bearer = await freshToken(token);
      await fetch(`/api/chantier/${chantierId}/documents/${factureId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ montant }),
      });
      setEditingMontantFacture(null);
      onRefresh?.();
    } catch { /* silencieux */ }
    setSavingMontant(null);
  }

  async function changeStatut(factureId: string, statut: FactureStatut) {
    setChangingId(factureId);
    setOpenMenu(null);
    try {
      const bearer = await freshToken(token);
      await fetch(`/api/chantier/${chantierId}/documents/${factureId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ factureStatut: statut }),
      });
      onStatutChange?.(factureId, statut);
      onRefresh?.();
    } catch { /* silencieux */ }
    setChangingId(null);
  }

  const totalFacture = lot.totaux.facture;
  const totalPaye    = lot.totaux.paye + lot.totaux.acompte;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 sm:bg-black/20 z-40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Détail artisan" className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] bg-white shadow-2xl z-50 flex flex-col pb-[max(0px,env(safe-area-inset-bottom))]">

        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            {lot.emoji && <span className="text-[20px] shrink-0">{lot.emoji}</span>}
            <div className="min-w-0">
              <p className="text-[14px] font-black text-gray-900 truncate">{lot.nom}</p>
              <p className="text-[11px] text-gray-400">
                {lot.devis.length} devis · {lot.factures.length} facture{lot.factures.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer le détail artisan" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0 ml-2">
            <X className="h-4 w-4 text-gray-500" aria-hidden="true" />
          </button>
        </div>

        {/* Totaux */}
        <div className="grid grid-cols-3 border-b border-gray-100 divide-x divide-gray-100">
          {[
            { label: 'Facturé', value: fmtEur(totalFacture), red: false },
            { label: 'Payé',    value: fmtEur(totalPaye),    red: false },
            { label: 'Reste',   value: fmtEur(row.reste),    red: false },
          ].map(item => (
            <div key={item.label} className="px-4 py-3 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{item.label}</p>
              <p className={`text-[13px] font-black leading-none ${item.red ? 'text-amber-600' : 'text-gray-800'}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-5">

          {/* Devis */}
          {lot.devis.length > 0 && (() => {
            // Devis primaire = validé ou attente_facture en priorité, sinon le plus récent
            const primaryDevisId = (
              lot.devis.find(d => d.devis_statut === 'valide' || d.devis_statut === 'attente_facture')
              ?? lot.devis[0]
            )?.id;
            const [showAllDevis, setShowAllDevis] = useState(false);
            const visibleDevis = (showAllDevis || lot.devis.length <= 1)
              ? lot.devis
              : lot.devis.filter(d => d.id === primaryDevisId);
            const hiddenCount = lot.devis.length - visibleDevis.length;

            return (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Devis {lot.devis.length > 1 && `(${lot.devis.length})`}
                </p>
                {lot.devis.length > 1 && (
                  <button
                    onClick={() => setShowAllDevis(v => !v)}
                    className="text-[10px] font-semibold text-indigo-500 hover:text-indigo-700 flex items-center gap-1"
                  >
                    {showAllDevis
                      ? <><ChevronDown className="h-3 w-3" />Réduire</>
                      : <><ChevronRight className="h-3 w-3" />+{hiddenCount} autre{hiddenCount > 1 ? 's' : ''}</>
                    }
                  </button>
                )}
              </div>
              <div className="space-y-0">
                {visibleDevis.map(d => {
                  const isAvenant = !!d.parent_devis_id;
                  const validatedDay = d.devis_validated_at ? d.devis_validated_at.slice(0, 10) : null;
                  return (
                  <div key={d.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-[12px] text-gray-800 truncate flex items-center gap-1.5">
                        {isAvenant && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[9px] font-bold uppercase tracking-wider text-amber-700 shrink-0">
                            📎 Avenant
                          </span>
                        )}
                        <span className="truncate">{d.nom}</span>
                      </p>
                      {isAvenant && d.parent_nom && (
                        <p className="text-[10px] text-amber-700 mt-0.5 truncate">
                          Sur le devis "{d.parent_nom}"
                          {d.parent_analyse_id && (
                            <a href={`/analyse/${d.parent_analyse_id}`} target="_blank" rel="noreferrer"
                               className="ml-1 underline hover:text-amber-900">
                              voir analyse VMD
                            </a>
                          )}
                        </p>
                      )}
                      {isAvenant && d.avenant_motif && (
                        <p className="text-[10px] text-gray-500 mt-0.5 italic truncate">Motif : {d.avenant_motif}</p>
                      )}
                      {d.devis_statut && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {DEVIS_STATUT_LABEL[d.devis_statut] ?? d.devis_statut}
                          {validatedDay && (
                            <> · validé le {validatedDay} <a
                              href={`/mon-chantier/${chantierId}/journal?date=${validatedDay}`}
                              target="_blank" rel="noreferrer"
                              className="underline text-indigo-500 hover:text-indigo-700"
                              title="Voir le digest du jour"
                            >📓</a></>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {d.montant !== null ? (
                        <span className="text-[12px] font-bold text-gray-700">{fmtEur(d.montant)}</span>
                      ) : editingMontant?.devisId === d.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            type="number"
                            inputMode="decimal"
                            value={editingMontant.value}
                            onChange={e => setEditingMontant({ devisId: d.id, value: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveMontantDevis(d.id, editingMontant.value);
                              if (e.key === 'Escape') setEditingMontant(null);
                            }}
                            onBlur={() => saveMontantDevis(d.id, editingMontant.value)}
                            className="w-20 text-[11px] font-bold border-b border-indigo-400 outline-none bg-transparent text-gray-800 pb-0.5 text-right"
                            placeholder="Ex: 4500"
                          />
                          <span className="text-[10px] text-gray-400">€</span>
                        </div>
                      ) : savingMontant === d.id ? (
                        <Loader2 className="h-3.5 w-3.5 text-indigo-400 animate-spin" />
                      ) : (
                        <button
                          onClick={() => setEditingMontant({ devisId: d.id, value: '' })}
                          className="flex items-center gap-1 text-[10px] text-gray-300 hover:text-indigo-500 transition-colors"
                          title="Saisir le montant"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>Saisir</span>
                        </button>
                      )}
                      {d.signed_url ? (
                        <a href={d.signed_url} target="_blank" rel="noopener noreferrer"
                           className="p-1 hover:bg-gray-100 rounded transition-colors" title="Télécharger">
                          <Download className="h-3.5 w-3.5 text-gray-400" />
                        </a>
                      ) : (
                        <span className="w-[26px]" />
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* Total devis */}
              {lot.devis.length > 1 && (() => {
                const totalDevis = lot.devis.reduce((s, d) => s + (d.montant ?? 0), 0);
                return totalDevis > 0 ? (
                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-100">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Total devis
                    </span>
                    <span className="text-[12px] font-black text-gray-800">{fmtEur(totalDevis)}</span>
                  </div>
                ) : null;
              })()}

              {/* Alerte dépassement */}
              {row.alertOverrun && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Le total facturé dépasse le devis validé
                </div>
              )}
            </div>
            );
          })()}

          {/* Factures */}
          {lot.factures.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Factures</p>
              <div className="space-y-0">
                {lot.factures.map(f => {
                  const statut     = (f.facture_statut ?? 'recue') as FactureStatut;
                  const cfg        = FACTURE_STATUT_CFG[statut] ?? FACTURE_STATUT_CFG.recue;
                  const label      = smartFactureLabel(f);
                  const resteF     = Math.max(0, (f.montant ?? 0) - (f.montant_paye ?? 0));
                  const isChanging = changingId === f.id;

                  // Coherence: does facture nom share a significant token with any devis nom?
                  const fNomLow = f.nom.toLowerCase();
                  const devisTokens = lot.devis.flatMap(d =>
                    d.nom.toLowerCase().split(/[\s\-_.,\/]+/).filter(t => t.length > 3),
                  );
                  const coherent = devisTokens.length > 0
                    ? devisTokens.some(t => fNomLow.includes(t))
                    : null; // no devis → can't judge

                  return (
                    <div key={f.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[12px] text-gray-800 truncate font-medium">{label}</p>
                          {coherent === true && (
                            <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
                              <Check className="h-2.5 w-2.5" />OK
                            </span>
                          )}
                          {coherent === false && (
                            <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5"
                                  title="Le nom de la facture ne correspond pas aux devis enregistrés">
                              <AlertTriangle className="h-2.5 w-2.5" />Vérifier
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate" title={f.nom}>{f.nom}</p>
                        {statut === 'payee_partiellement' && f.montant_paye != null && (
                          <p className="text-[10px] text-blue-500 mt-0.5">
                            {fmtEur(f.montant_paye)} versé · {fmtEur(resteF)} restant
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {editingMontantFacture?.factureId === f.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              type="number"
                              inputMode="decimal"
                              value={editingMontantFacture.value}
                              onChange={e => setEditingMontantFacture({ factureId: f.id, value: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveMontantFacture(f.id, editingMontantFacture.value);
                                if (e.key === 'Escape') setEditingMontantFacture(null);
                              }}
                              onBlur={() => saveMontantFacture(f.id, editingMontantFacture.value)}
                              className="w-20 text-[11px] font-bold border-b border-indigo-400 outline-none bg-transparent text-gray-800 pb-0.5 text-right"
                              placeholder="Ex: 4500"
                            />
                            <span className="text-[10px] text-gray-400">€</span>
                          </div>
                        ) : f.montant !== null ? (
                          <button
                            onClick={() => setEditingMontantFacture({ factureId: f.id, value: String(f.montant) })}
                            className="group flex items-center gap-1 text-[12px] font-bold text-gray-700 hover:text-indigo-600 transition-colors"
                            title="Modifier le montant"
                          >
                            {fmtEur(f.montant)}
                            <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditingMontantFacture({ factureId: f.id, value: '' })}
                            className="flex items-center gap-1 text-[10px] text-gray-300 hover:text-indigo-500 transition-colors"
                            title="Saisir le montant de la facture"
                          >
                            <Pencil className="h-3 w-3" />
                            <span>Saisir</span>
                          </button>
                        )}

                        {/* Badge statut cliquable */}
                        <div className="relative">
                          <button
                            disabled={isChanging}
                            onClick={() => setOpenMenu(openMenu === f.id ? null : f.id)}
                            className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border transition-all ${cfg.cls}`}
                          >
                            {isChanging ? <Loader2 className="h-3 w-3 animate-spin" /> : cfg.icon}
                            {cfg.short}
                            <ChevronDown className="h-2.5 w-2.5" />
                          </button>

                          {openMenu === f.id && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden">
                              {(Object.entries(FACTURE_STATUT_CFG) as [FactureStatut, typeof FACTURE_STATUT_CFG[FactureStatut]][]).map(([s, c]) => (
                                <button
                                  key={s}
                                  onClick={() => changeStatut(f.id, s)}
                                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium hover:bg-gray-50 transition-colors text-left ${
                                    s === statut ? 'text-indigo-600 bg-indigo-50/50' : 'text-gray-700'
                                  }`}
                                >
                                  <span>{c.icon}</span>
                                  {c.label}
                                  {s === statut && <Check className="h-3 w-3 ml-auto text-indigo-500" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {f.signed_url && (
                          <a href={f.signed_url} target="_blank" rel="noopener noreferrer"
                             className="p-1 hover:bg-gray-100 rounded transition-colors" title="Télécharger">
                            <Download className="h-3.5 w-3.5 text-gray-400" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {lot.devis.length === 0 && lot.factures.length === 0 && (
            <p className="text-[12px] text-gray-400 text-center py-10">Aucun document pour cet intervenant</p>
          )}
        </div>
      </div>

      {/* Overlay fermeture dropdown */}
      {openMenu && (
        <div className="fixed inset-0 z-[45]" onClick={() => setOpenMenu(null)} />
      )}
    </>
  );
}

// ── Card artisan mobile (ÉTAPE 2) ─────────────────────────────────────────────

function ArtisanCardMobile({
  artisan,
  lot,
  statutOverrides,
  onDetail,
  onPay,
}: {
  artisan:        BudgetArtisanGroup;
  lot:            BudgetLot;
  statutOverrides: Record<string, FactureStatut>;
  onDetail:       () => void;
  onPay:          () => void;
}) {
  const totalPaye = artisan.totaux.paye + artisan.totaux.acompte;
  const budget    = artisan.totaux.devis_valides || artisan.totaux.facture;
  const reste     = artisan.totaux.a_payer;
  const isSolde   = budget > 0 && totalPaye >= budget && artisan.totaux.a_payer === 0;
  const pct       = budget > 0 ? Math.min(100, Math.round(totalPaye / budget * 100)) : 0;
  const SANS_DEVIS_TYPES = ['frais', 'ticket_caisse', 'achat_materiaux'];
  const isAlwaysPaid = artisan.factures.length > 0 && artisan.factures.every(f => SANS_DEVIS_TYPES.includes(f.depense_type ?? ''));
  const hasActionable = !isSolde && !isAlwaysPaid && (reste > 0 || artisan.devis.length > 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      {/* En-tête artisan */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-start gap-2 min-w-0">
          {lot.emoji && <span className="text-xl shrink-0 leading-none mt-0.5">{lot.emoji}</span>}
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 leading-tight truncate">{artisan.nom}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{lot.nom}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          {budget > 0 && (
            <p className="text-sm font-bold text-gray-800 tabular-nums">{fmtEur(budget)}</p>
          )}
          {isSolde ? (
            <span className="text-[10px] font-bold text-emerald-600 flex items-center justify-end gap-0.5 mt-0.5">
              <Check className="h-3 w-3" />Soldé
            </span>
          ) : isAlwaysPaid ? (
            <span className="text-[10px] font-bold text-emerald-600 mt-0.5 flex justify-end items-center gap-0.5">
              <Check className="h-3 w-3" />Payé
            </span>
          ) : reste > 0 ? (
            <p className="text-[11px] text-amber-600 font-semibold mt-0.5 tabular-nums">
              {fmtEur(reste)} restant
            </p>
          ) : artisan.totaux.devis_valides > 0 ? (
            <p className="text-[11px] text-gray-400 mt-0.5">Pas de facture</p>
          ) : null}
        </div>
      </div>

      {/* Barre de progression */}
      {budget > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isSolde ? 'bg-emerald-500' : pct > 0 ? 'bg-indigo-500' : 'bg-gray-200'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400 w-8 text-right tabular-nums shrink-0">{pct}%</span>
        </div>
      )}

      {/* Ligne payé / à payer */}
      {(totalPaye > 0 || reste > 0) && (
        <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
          <span className="tabular-nums">{totalPaye > 0 ? `${fmtEur(totalPaye)} payés` : '—'}</span>
          {reste > 0 && (
            <span className="font-semibold text-gray-700 tabular-nums">{fmtEur(reste)} à payer</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {hasActionable && (
          <button
            onClick={onPay}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] bg-indigo-600 text-white rounded-xl text-sm font-semibold touch-manipulation"
          >
            💸 Payer
          </button>
        )}
        <button
          onClick={onDetail}
          className={`${hasActionable ? '' : 'flex-1'} flex items-center justify-center gap-1.5 min-h-[44px] px-4 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium touch-manipulation`}
        >
          Voir détail
        </button>
      </div>
    </div>
  );
}

// ── Tableau squelette ─────────────────────────────────────────────────────────

const TH = 'px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider';
const COLS = 6;

function TableSkeleton() {
  return (
    <>
      {[0, 1, 2].map(i => (
        <tr key={i} className="border-b border-gray-50">
          {Array.from({ length: COLS }).map((_, j) => (
            <td key={j} className="px-4 py-3.5">
              <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: j === 0 ? '80%' : '60%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Coherence helper ──────────────────────────────────────────────────────────

function factureCoherence(factureName: string, devis: { nom: string }[]): boolean | null {
  const fNomLow = factureName.toLowerCase();
  const tokens = devis.flatMap(d =>
    d.nom.toLowerCase().split(/[\s\-_.,\/]+/).filter(t => t.length > 3),
  );
  if (tokens.length === 0) return null;
  return tokens.some(t => fNomLow.includes(t));
}

// ── Composant principal ────────────────────────────────────────────────────────

export default function BudgetTab({
  chantierId,
  token,
  rangeMin,
  rangeMax,
  initialEnveloppePrevue,
}: {
  chantierId: string;
  token:      string;
  rangeMin?:  number;
  rangeMax?:  number;
  initialEnveloppePrevue?: number | null;
}) {
  // V3.4.14+ — Harmonisation useIsMobile() (cf. CLAUDE.md "Composants mobile dédiés").
  // Utilisé pour : safe-area padding sur le drawer artisan, hauteur tactile search,
  // sizing tactile des CTA action bar. Le full split (BudgetTabMobile dédié) est en
  // backlog — pour l'instant on amplifie les zones tactiles qui posaient le plus
  // de problèmes pendant les sessions mobile réelles (audit Vague C 2026-05-16).
  const isMobile = useIsMobile();

  const { data, loading, error, refresh, backfillToast } = useBudgetData(chantierId, token);

  const [search,       setSearch]       = useState('');
  const [filterDevis,  setFilterDevis]  = useState<FilterDevis>('all');
  // Signal one-shot depuis l'accueil (clic sur une facture à régler) → ouvre filtré "À payer".
  const [filterPay,    setFilterPay]    = useState<FilterPay>(() => {
    try {
      const intent = sessionStorage.getItem('cockpitBudgetFilter');
      if (intent) sessionStorage.removeItem('cockpitBudgetFilter');
      return intent === 'unpaid' ? 'unpaid' : 'all';
    } catch { return 'all'; }
  });
  const [sortBy,       setSortBy]       = useState<SortBy>('default');
  const [selected,     setSelected]     = useState<BudgetRow | null>(null);
  const [showAddDoc,   setShowAddDoc]   = useState(false);
  const [addDocLotId,  setAddDocLotId]  = useState<string | undefined>(undefined);
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set());
  const [showOrphansModal, setShowOrphansModal] = useState(false);
  const [orphanLots, setOrphanLots] = useState<LotChantier[]>([]);

  // Fetch lots à l'ouverture du modal de réconciliation (lazy)
  useEffect(() => {
    if (!showOrphansModal || orphanLots.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const bearer = await freshToken(token);
        const res = await fetch(`/api/chantier/${chantierId}/lots`, {
          headers: { Authorization: `Bearer ${bearer}` },
        });
        if (!res.ok || cancelled) return;
        const d = await res.json();
        if (!cancelled) setOrphanLots(d.lots ?? []);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [showOrphansModal, chantierId, token, orphanLots.length]);
  const [changingId,   setChangingId]   = useState<string | null>(null);
  const [openMenu,     setOpenMenu]     = useState<string | null>(null);
  // Acompte avec saisie montant inline
  const [acompteInput, setAcompteInput] = useState<{ factureId: string; value: string } | null>(null);
  // Édition montant devis inline (pour les devis sans montant)
  const [editingMontant, setEditingMontant] = useState<{ devisId: string; value: string } | null>(null);
  const [savingMontant,  setSavingMontant]  = useState<string | null>(null);
  // Édition montant facture inline (pour les factures sans montant)
  const [editingMontantFacture, setEditingMontantFacture] = useState<{ factureId: string; value: string } | null>(null);

  // Overrides locaux des statuts factures (optimistic updates)
  const [statutOverrides, setStatutOverrides] = useState<Record<string, FactureStatut>>({});
  // Saisie acompte inline sur la ligne artisan
  const [inlineAcompte, setInlineAcompte] = useState<{ artisanKey: string; factureId: string; value: string } | null>(null);
  const [savingAcompte, setSavingAcompte] = useState<string | null>(null);
  // Dropdown statut facture inline sur la ligne artisan
  const [openArtisanMenu, setOpenArtisanMenu] = useState<string | null>(null); // artisanKey
  // Drawer versements échelonnés
  const [versementsDrawer, setVersementsDrawer] = useState<{
    artisanNom: string; budget: number; sourceIds: string[]; eventIds: string[];
    primaryDocumentId?: string; primaryDocumentType?: 'devis' | 'facture';
    legacyMontantPaye?: number;
    /** Pour le sélecteur de statut intégré au drawer */
    factureId?: string;
    factureStatut?: string;
    /** Bouton "Paiement" rapide : ouvre le formulaire directement pré-rempli */
    autoOpenForm?: boolean;
    autoFillAmount?: number;
    autoFillLabel?: string;
  } | null>(null);
  // PaiementDrawer contextualisé (bouton "Payer" mobile)
  const [paiementCtx, setPaiementCtx] = useState<PaiementContext | null>(null);
  // Drawer dépense rapide (achat matériaux, paiement liquide)
  const [depenseRapide, setDepenseRapide] = useState<null | 'open'>(null);
  const [depenseForm, setDepenseForm] = useState<{
    label: string; amount: string; depense_type: 'achat_materiaux' | 'frais' | 'ticket_caisse';
    lot_id: string; note: string; date: string;
  }>({ label: '', amount: '', depense_type: 'achat_materiaux', lot_id: '', note: '', date: new Date().toISOString().slice(0, 10) });
  const [savingDepense, setSavingDepense] = useState(false);
  const [depenseError,  setDepenseError]  = useState<string | null>(null);

  // Alerte cohérence : montant versé ≠ montant prévu dans l'échéancier
  const [coherenceAlert, setCoherenceAlert] = useState<{
    eventId: string; plannedAmount: number; plannedLabel: string | null;
    paidAmount: number; onConfirm: () => void;
  } | null>(null);

  const allLots = useMemo(() => {
    if (!data) return [];
    return [...data.lots, ...(data.sans_lot ? [data.sans_lot] : [])];
  }, [data]);

  // Lots pour AddDocumentModal
  const lotsForModal = useMemo(() => allLots.map(l => ({
    id: l.id, nom: l.nom, emoji: l.emoji,
  })), [allLots]);

  // Lignes avec overrides appliqués
  const lotsEnriched = useMemo(() => allLots.map(lot => ({
    ...lot,
    factures: lot.factures.map(f =>
      statutOverrides[f.id] ? { ...f, facture_statut: statutOverrides[f.id] } : f
    ),
  })), [allLots, statutOverrides]);

  const rows = useMemo<BudgetRow[]>(() => {
    let result = lotsEnriched.map(buildRow);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.lot.nom.toLowerCase().includes(q) ||
        r.lot.devis.some(d => d.nom.toLowerCase().includes(q)),
      );
    }

    if (filterDevis !== 'all') result = result.filter(r => r.devisStatut === filterDevis);
    // "À payer" = tout ce qui a un reste à régler (factures vierges ET
    // partiellement payées) → cohérent avec le KPI "à régler" du camembert.
    if (filterPay === 'unpaid') {
      result = result.filter(r => (r.lot.totaux.a_payer ?? 0) > 0);
    } else if (filterPay !== 'all') {
      result = result.filter(r => r.payStatut === filterPay);
    }

    switch (sortBy) {
      case 'amount':
        result.sort((a, b) =>
          (b.devisAmount ?? b.devisAmountGrey ?? 0) - (a.devisAmount ?? a.devisAmountGrey ?? 0),
        ); break;
      case 'reste':
        result.sort((a, b) => b.reste - a.reste);
        break;
      case 'nom':
        result.sort((a, b) => a.lot.nom.localeCompare(b.lot.nom, 'fr'));
        break;
      default:
        result.sort((a, b) => {
          const score = (r: BudgetRow) => r.reste > 0 ? 2 : r.facture > 0 ? 1 : 0;
          return score(b) - score(a) || b.reste - a.reste;
        });
    }
    return result;
  }, [lotsEnriched, search, filterDevis, filterPay, sortBy]);

  const totalDocs = useMemo(
    () => allLots.reduce((s, l) => s + l.devis.length + l.factures.length, 0),
    [allLots],
  );

  const handleStatutChange = useCallback((factureId: string, statut: FactureStatut) => {
    setStatutOverrides(prev => ({ ...prev, [factureId]: statut }));
    setSelected(prev => {
      if (!prev) return prev;
      const updated = prev.lot.factures.map(f =>
        f.id === factureId ? { ...f, facture_statut: statut } : f,
      );
      return buildRow({ ...prev.lot, factures: updated });
    });
  }, []);

  const changeStatut = useCallback(async (
    factureId: string,
    statut: FactureStatut,
    e?: React.MouseEvent,
    montantPaye?: number | null,
  ) => {
    e?.stopPropagation();
    setChangingId(factureId);
    setOpenMenu(null);
    setAcompteInput(null);
    try {
      const bearer = await freshToken(token);
      const body: Record<string, unknown> = { factureStatut: statut };
      if (montantPaye !== undefined) body.montantPaye = montantPaye;
      await fetch(`/api/chantier/${chantierId}/documents/${factureId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify(body),
      });
      handleStatutChange(factureId, statut);
      refresh();
      setStatutOverrides({});
    } catch { /* silencieux */ }
    setChangingId(null);
  }, [chantierId, token, handleStatutChange, refresh]);


  // Effectue le PATCH réel d'un payment_event
  const doPatchPaymentEvent = useCallback(async (eventId: string, montantPaye: number) => {
    setSavingAcompte(eventId);
    try {
      const bearer = await freshToken(token);
      await fetch(`/api/chantier/${chantierId}/payment-events`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ id: eventId, status: 'paid', amount: montantPaye }),
      });
      refresh();
    } catch { /* silencieux */ }
    setSavingAcompte(null);
  }, [chantierId, token, refresh]);

  // Sauvegarde acompte via payment_events (pour les artisans sans facture — acompte sur devis)
  // Priorité : utilise le pending event de l'Échéancier en priorité (cohérence Budget ↔ Échéancier)
  const saveInlineAcompteDevis = useCallback(async (
    eventIds: string[],           // paid event IDs (si déjà payé une fois)
    valStr: string,
    pendingEvents?: { id: string; amount: number | null; label: string | null }[],
    artisanKey?: string,          // clé artisan (= nom) pour le spinner + label event
  ) => {
    const montantPaye = parseFloat(valStr.replace(',', '.'));
    if (isNaN(montantPaye) || montantPaye <= 0) { setInlineAcompte(null); return; }
    setInlineAcompte(null);

    // Choisir l'event cible : pending event de l'échéancier en priorité, sinon paid event
    const pendingEvent = (pendingEvents ?? []).find(e => e.amount != null);
    const targetEventId = pendingEvent?.id ?? eventIds[0];

    // Aucun event existant → créer un event manuel puis le marquer payé
    if (!targetEventId) {
      setSavingAcompte(artisanKey ?? 'new');
      try {
        const bearer = await freshToken(token);
        const res = await fetch(`/api/chantier/${chantierId}/payment-events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: bearer },
          body: JSON.stringify({ manuel: true, label: artisanKey ? `Acompte — ${artisanKey}` : 'Acompte', amount: montantPaye }),
        });
        const json = await res.json();
        const newEventId = json.payment_events?.[0]?.id;
        if (newEventId) await doPatchPaymentEvent(newEventId, montantPaye);
        else refresh();
      } catch { refresh(); }
      setSavingAcompte(null);
      return;
    }

    // Alerte cohérence : si montant versé diffère de plus de 10% du montant prévu
    if (pendingEvent?.amount != null && Math.abs(montantPaye - pendingEvent.amount) > pendingEvent.amount * 0.10) {
      setCoherenceAlert({
        eventId:       targetEventId,
        plannedAmount: pendingEvent.amount,
        plannedLabel:  pendingEvent.label,
        paidAmount:    montantPaye,
        onConfirm:     () => { setCoherenceAlert(null); doPatchPaymentEvent(targetEventId, montantPaye); },
      });
      return;
    }

    doPatchPaymentEvent(targetEventId, montantPaye);
  }, [doPatchPaymentEvent]);

  // Marquer devis comme intégralement payé via payment_events
  const markDevisFullyPaid = useCallback(async (
    eventIds: string[],
    fullAmount: number,
    pendingEvents?: { id: string; amount: number | null; label: string | null }[],
  ) => {
    const targetId = pendingEvents?.[0]?.id ?? eventIds[0];
    if (!targetId || fullAmount <= 0) return;
    doPatchPaymentEvent(targetId, fullAmount);
  }, [doPatchPaymentEvent]);

  // Annuler acompte devis (remettre en pending)
  const cancelDevisAcompte = useCallback(async (eventIds: string[]) => {
    if (eventIds.length === 0) return;
    setSavingAcompte(eventIds[0]);
    try {
      const bearer = await freshToken(token);
      await fetch(`/api/chantier/${chantierId}/payment-events`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ id: eventIds[0], status: 'pending' }),
      });
      refresh();
    } catch { /* silencieux */ }
    setSavingAcompte(null);
  }, [chantierId, token, refresh]);

  const saveInlineAcompte = useCallback(async (factureId: string, valStr: string) => {
    const montantPaye = parseFloat(valStr.replace(',', '.'));
    if (isNaN(montantPaye) || montantPaye <= 0) { setInlineAcompte(null); return; }
    setSavingAcompte(factureId);
    setInlineAcompte(null);
    try {
      const bearer = await freshToken(token);
      await fetch(`/api/chantier/${chantierId}/documents/${factureId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ factureStatut: 'payee_partiellement', montantPaye }),
      });
      handleStatutChange(factureId, 'payee_partiellement');
      refresh();
      setStatutOverrides({});
    } catch { /* silencieux */ }
    setSavingAcompte(null);
  }, [chantierId, token, handleStatutChange, refresh]);

  // Enregistre une dépense rapide (achat matériaux, frais liquide)
  const saveDepenseRapide = useCallback(async () => {
    const amount = parseFloat(depenseForm.amount.replace(',', '.'));
    if (!depenseForm.label.trim() || isNaN(amount) || amount <= 0) {
      setDepenseError('Libellé et montant requis'); return;
    }
    // 'sans_lot' = pseudo-bucket budget (id non-UUID) → on l'envoie comme null.
    const lotIdToSend = depenseForm.lot_id && depenseForm.lot_id !== 'sans_lot'
      ? depenseForm.lot_id
      : null;
    setSavingDepense(true); setDepenseError(null);
    try {
      const bearer = await freshToken(token);
      const res = await fetch(`/api/chantier/${chantierId}/quick-expense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({
          label:        depenseForm.label.trim(),
          amount,
          depense_type: depenseForm.depense_type,
          lot_id:       lotIdToSend,
          note:         depenseForm.note.trim() || null,
          date:         depenseForm.date,
        }),
      });
      if (!res.ok) {
        const rawText = await res.text().catch(() => '');
        let j: { error?: string } = {};
        try { j = JSON.parse(rawText); } catch { /* non-JSON */ }
        // Log brut pour debug — visible dans la console du navigateur.
        // eslint-disable-next-line no-console
        console.error('[saveDepenseRapide] HTTP', res.status, rawText);
        const msg = j.error || `Erreur ${res.status}${rawText && !j.error ? ` — ${rawText.slice(0, 200)}` : ''}`;
        setDepenseError(msg);
        setSavingDepense(false); return;
      }
      setDepenseRapide(null);
      setDepenseForm({ label: '', amount: '', depense_type: 'achat_materiaux', lot_id: '', note: '', date: new Date().toISOString().slice(0, 10) });
      refresh();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[saveDepenseRapide] network error:', e);
      setDepenseError(e instanceof Error ? `Erreur réseau : ${e.message}` : 'Erreur réseau. Réessayez.');
    }
    setSavingDepense(false);
  }, [chantierId, token, depenseForm, refresh]);

  // Signature simplifiée : pas besoin d'event. Auparavant, on appelait stopPropagation
  // depuis 2 handlers concurrents (TR + <button> chevron) → clics aléatoires "à côté"
  // qui touchaient la zone du button (avec padding navigateur invisible) au lieu du TR.
  const toggleExpand = useCallback((lotId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(lotId)) next.delete(lotId); else next.add(lotId);
      return next;
    });
  }, []);

  // Auto-expand si ≤4 lots (au premier chargement uniquement)
  const autoExpandDone = useRef(false);
  useEffect(() => {
    if (!data || autoExpandDone.current) return;
    const allLots = [...data.lots, ...(data.sans_lot ? [data.sans_lot] : [])];
    if (allLots.length <= 4) {
      setExpanded(new Set(allLots.map(l => l.id)));
    }
    autoExpandDone.current = true;
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper : tout développer / tout réduire
  const allLotIds = useMemo(() => {
    if (!data) return [] as string[];
    return [...data.lots, ...(data.sans_lot ? [data.sans_lot] : [])].map(l => l.id);
  }, [data]);

  // Compteur de devis reçus mais non signés (en_cours / recu) — pour bannière d'incitation
  const pendingDevisCount = useMemo(() => {
    if (!data) return 0;
    const all = [...data.lots, ...(data.sans_lot ? [data.sans_lot] : [])];
    let count = 0;
    for (const lot of all) {
      for (const d of lot.devis) {
        if (d.devis_statut !== 'valide' && d.devis_statut !== 'attente_facture') count++;
      }
    }
    return count;
  }, [data]);
  const allExpanded = allLotIds.length > 0 && allLotIds.every(id => expanded.has(id));
  const toggleAll = useCallback(() => {
    setExpanded(allExpanded ? new Set() : new Set(allLotIds));
  }, [allExpanded, allLotIds]);

  // Sync drawer row quand les données serveur se rechargent
  useEffect(() => {
    if (!selected || !data) return;
    const freshLot = [...data.lots, ...(data.sans_lot ? [data.sans_lot] : [])].find(l => l.id === selected.lot.id);
    if (freshLot) setSelected(buildRow(freshLot));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3">
        <AlertCircle className="h-7 w-7 text-red-400" />
        <p className="text-[13px] text-gray-500">Erreur : {error}</p>
        <button onClick={refresh} className="text-[12px] text-indigo-600 hover:underline">Réessayer</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">

      {/* ── Toast : montant repris depuis l'analyse ────────────────────────── */}
      {backfillToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-gray-900 text-white text-sm px-4 py-3 rounded-xl shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Check className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>Montant(s) devis mis à jour automatiquement depuis l'analyse IA</span>
        </div>
      )}

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <BudgetKpiDashboard data={data} loading={loading} chantierId={chantierId} token={token} initialEnveloppePrevue={initialEnveloppePrevue} />

      {/* ── Bannière : devis reçus en attente de signature ────────────────── */}
      {!loading && pendingDevisCount > 0 && (
        <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <p className="text-[12px] text-amber-800 font-medium">
              {pendingDevisCount} devis reçu{pendingDevisCount > 1 ? 's' : ''} en attente de signature
            </p>
          </div>
          <span className="text-[11px] text-amber-600/80 sm:ml-1">
            — non comptés dans l'engagement tant que non signés
          </span>
        </div>
      )}

      {/* ── Bannière : acomptes versés sur des devis non signés (Bug A) ───── */}
      {!loading && (data?.totaux as any)?.acompte_pending > 0 && (
        <div className="px-5 py-2.5 bg-orange-50 border-b border-orange-100 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-orange-600 shrink-0" />
            <p className="text-[12px] text-orange-800 font-medium">
              {fmtEur((data!.totaux as any).acompte_pending)} d'acomptes versés sur des devis non signés
            </p>
          </div>
          <span className="text-[11px] text-orange-600/80 sm:ml-1">
            — signez le devis pour les inclure dans le suivi
          </span>
        </div>
      )}

      {/* ── Bannière : mouvements financiers non rattachés (orphelins) ────── */}
      {!loading && (data?.cashflow_orphans?.length ?? 0) > 0 && (
        <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-100 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
            <p className="text-[12px] text-rose-800 font-medium">
              {data!.cashflow_orphans!.length} mouvement{data!.cashflow_orphans!.length > 1 ? 's' : ''} non rattaché{data!.cashflow_orphans!.length > 1 ? 's' : ''} ·{' '}
              {fmtEur(data!.cashflow_orphans!.reduce((s, o) => s + o.amount, 0))}
            </p>
            <span className="text-[11px] text-rose-600/80 hidden sm:inline">
              — invisibles dans le tableau, à rattacher ou supprimer
            </span>
          </div>
          <button
            onClick={() => setShowOrphansModal(true)}
            className="px-3 py-1.5 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shrink-0"
          >
            Réconcilier
          </button>
        </div>
      )}

      {/* ── Barre d'actions ───────────────────────────────────────────────── */}
      <ActionBar
        search={search}           onSearch={setSearch}
        filterDevis={filterDevis} onFilterDevis={setFilterDevis}
        filterPay={filterPay}     onFilterPay={setFilterPay}
        sortBy={sortBy}           onSort={setSortBy}
        onAddDocument={() => setShowAddDoc(true)}
        onAddDepense={() => setDepenseRapide('open')}
        onToggleAll={allLotIds.length > 0 ? toggleAll : undefined}
        allExpanded={allExpanded}
        isMobile={isMobile}
      />

      {/* ── Vue mobile : cartes artisans (ÉTAPE 1&2) ───────────────────────── */}
      <div className="sm:hidden flex-1 overflow-y-auto px-4 py-4 pb-[max(4rem,env(safe-area-inset-bottom))] space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-32 bg-gray-50 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          search ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <p className="text-sm">Aucun résultat pour "{search}"</p>
            </div>
          ) : (
            <div className="py-8">
              <div className="mx-auto h-14 w-14 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                <Plus className="h-6 w-6 text-indigo-500" />
              </div>
              <p className="text-[14px] font-bold text-gray-800 mb-1 text-center">Pilotez votre budget en 3 étapes</p>
              <p className="text-[11px] text-gray-500 mb-5 text-center px-4">
                Ajoutez vos devis et factures, déclarez les paiements, gardez le contrôle.
              </p>
              <div className="space-y-2.5">
                <button
                  onClick={() => setShowAddDoc(true)}
                  className="w-full p-3.5 border border-gray-200 rounded-xl text-left active:bg-indigo-50/30"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">📄</span>
                    <span className="text-[12px] font-semibold text-gray-800">Ajouter un devis</span>
                  </div>
                  <p className="text-[11px] text-gray-500">Pour comparer et signer avec vos artisans</p>
                </button>
                <button
                  onClick={() => setDepenseRapide('open')}
                  className="w-full p-3.5 border border-gray-200 rounded-xl text-left active:bg-orange-50/30"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🧾</span>
                    <span className="text-[12px] font-semibold text-gray-800">Saisir une dépense</span>
                  </div>
                  <p className="text-[11px] text-gray-500">Achat matériaux, frais ponctuels, liquide</p>
                </button>
              </div>
            </div>
          )
        ) : (
          rows.flatMap(row =>
            row.lot.artisans.map(artisan => {
              const virtualLot: BudgetLot = {
                ...row.lot,
                devis: artisan.devis,
                factures: artisan.factures.map(f => statutOverrides[f.id] ? { ...f, facture_statut: statutOverrides[f.id] } : f),
                artisans: [artisan],
                totaux: {
                  devis_recus:   artisan.totaux.devis_valides,
                  devis_valides: artisan.totaux.devis_valides,
                  facture:       artisan.totaux.facture,
                  paye:          artisan.totaux.paye,
                  acompte:       artisan.totaux.acompte,
                  litige:        artisan.totaux.litige,
                  a_payer:       artisan.totaux.a_payer,
                },
              };
              const SANS_DEVIS_TYPES = ['frais', 'ticket_caisse', 'achat_materiaux'];
              const isAlwaysPaid = artisan.factures.length > 0 && artisan.factures.every(f => SANS_DEVIS_TYPES.includes(f.depense_type ?? ''));
              const primaryFacture = artisan.factures.find(f => {
                const s = statutOverrides[f.id] ?? f.facture_statut ?? '';
                return ['recue', 'payee_partiellement', 'en_litige'].includes(s);
              }) ?? artisan.factures[0];
              const primaryDevis = artisan.devis[0] ?? null;
              const eventIds      = artisan.devis.flatMap(d => d.payment_event_ids ?? []);
              const allPendingEvts = artisan.devis.flatMap(d => d.pending_events ?? []);

              return (
                <ArtisanCardMobile
                  key={`${row.lot.id}-${artisan.nom}`}
                  artisan={artisan}
                  lot={row.lot}
                  statutOverrides={statutOverrides}
                  onDetail={() => setSelected(buildRow(virtualLot))}
                  onPay={() => {
                    if (primaryFacture && !isAlwaysPaid) {
                      setPaiementCtx({
                        artisanNom:     artisan.nom,
                        montantRestant: artisan.totaux.a_payer > 0 ? artisan.totaux.a_payer : 0,
                        documentId:     primaryFacture.id,
                        documentType:   'facture',
                        label:          `Paiement — ${artisan.nom}`,
                      });
                    } else {
                      setPaiementCtx({
                        artisanNom:     artisan.nom,
                        montantRestant: artisan.totaux.a_payer > 0 ? artisan.totaux.a_payer : 0,
                        documentId:     primaryDevis?.id ?? '',
                        documentType:   'devis',
                        label:          `Paiement — ${artisan.nom}`,
                      });
                    }
                  }}
                />
              );
            })
          )
        )}
        {/* Boutons d'ajout mobile */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => setDepenseRapide('open')}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] border border-orange-200 bg-orange-50 text-orange-700 rounded-xl text-sm font-semibold touch-manipulation"
          >
            <Plus className="h-4 w-4" />Dépense
          </button>
          <button
            onClick={() => setShowAddDoc(true)}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] bg-indigo-600 text-white rounded-xl text-sm font-semibold touch-manipulation"
          >
            <Plus className="h-4 w-4" />Document
          </button>
        </div>
      </div>

      {/* ── Tableau desktop ───────────────────────────────────────────────────── */}
      <div className="hidden sm:flex sm:flex-1 sm:overflow-auto sm:overscroll-x-contain">
        <table className="min-w-[860px] w-full text-left border-collapse table-fixed">
          <colgroup>
            <col style={{ width: 210 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 170 }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
              <th className={TH}>Artisan</th>
              <th className={`${TH} text-right`}>Engagé</th>
              <th className={`${TH} text-right`}>Facturé</th>
              <th className={`${TH} text-right`}>Payé</th>
              <th className={`${TH} text-right`}>Solde</th>
              <th className={TH}>Avancement</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="py-12 px-8">
                  {search ? (
                    <p className="text-[13px] text-gray-400 text-center">Aucun résultat pour "{search}"</p>
                  ) : (
                    <div className="max-w-2xl mx-auto text-center">
                      <div className="mx-auto h-14 w-14 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                        <Plus className="h-6 w-6 text-indigo-500" />
                      </div>
                      <p className="text-[15px] font-bold text-gray-800 mb-1">Pilotez votre budget en 3 étapes</p>
                      <p className="text-[12px] text-gray-500 mb-6">
                        Ajoutez vos devis et factures, déclarez les paiements, gardez le contrôle.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                        <button
                          onClick={() => setShowAddDoc(true)}
                          className="p-4 border border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/30 transition-all group"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">📄</span>
                            <span className="text-[12px] font-semibold text-gray-800 group-hover:text-indigo-700">Ajouter un devis</span>
                          </div>
                          <p className="text-[11px] text-gray-500">Pour comparer et signer avec vos artisans</p>
                        </button>
                        <button
                          onClick={() => setDepenseRapide('open')}
                          className="p-4 border border-gray-200 rounded-xl hover:border-orange-300 hover:bg-orange-50/30 transition-all group"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">🧾</span>
                            <span className="text-[12px] font-semibold text-gray-800 group-hover:text-orange-700">Saisir une dépense</span>
                          </div>
                          <p className="text-[11px] text-gray-500">Achat matériaux, frais ponctuels, paiement liquide</p>
                        </button>
                        <div className="p-4 border border-gray-200 rounded-xl bg-gray-50/40">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">🎯</span>
                            <span className="text-[12px] font-semibold text-gray-700">Définir un budget cible</span>
                          </div>
                          <p className="text-[11px] text-gray-500">Cliquez sur "Modifier" dans le KPI ci-dessus pour fixer votre enveloppe</p>
                        </div>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              rows.map(row => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const isExpanded = expanded.has(row.lot.id);
                // lotTotal = budgetTotal calculé par buildRow (per-artisan : devis validés + factures sans devis)
                const lotTotal = row.devisAmount ?? 0;

                // Agrégats lot (utilisés pour le récap collapsed)
                const lotEngage     = lotTotal; // déjà calculé par buildRow (devis_valides + factures hors-devis)
                const lotFacture    = row.lot.totaux.facture;
                const lotPaye       = row.lot.totaux.paye + row.lot.totaux.acompte;
                const lotSoldeRest  = row.lot.totaux.a_payer; // factures reçues non soldées (canonique)
                const lotPctAvance  = lotEngage > 0 ? Math.min(100, Math.round((lotPaye / lotEngage) * 100)) : 0;
                const lotIsSolded   = lotSoldeRest === 0 && lotPaye > 0 && lotEngage > 0 && lotPaye >= lotEngage * 0.99;

                return (
                  <Fragment key={row.lot.id}>
                    {/* ── En-tête du lot — récap engagé/facturé/payé/solde/avancement (visible aussi quand collapsed) ──
                        Toute la ligne est cliquable via le TR. On NE met pas de <button> autour du chevron
                        (ça créait une hitbox concurrente avec stopPropagation → clics aléatoires "à côté"). */}
                    <tr
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      className="bg-gray-50/80 border-b border-gray-200 cursor-pointer hover:bg-gray-100/80 transition-colors select-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-200"
                      onClick={() => toggleExpand(row.lot.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(row.lot.id); }
                      }}
                    >
                      {/* ARTISAN — chevron + emoji + nom + nb artisans */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0 text-gray-400" aria-hidden="true">
                            {isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5" />
                              : <ChevronRight className="h-3.5 w-3.5" />}
                          </span>
                          {row.lot.emoji && <span className="text-sm leading-none shrink-0">{row.lot.emoji}</span>}
                          <span className="text-[12px] font-bold text-gray-700 truncate">{row.lot.nom}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">
                            {row.lot.artisans.length} artisan{row.lot.artisans.length > 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>
                      {/* ENGAGÉ */}
                      <td className="px-3 py-2.5 text-right">
                        {lotEngage > 0
                          ? <span className="text-[12px] font-bold text-gray-700 tabular-nums">{fmtEur(lotEngage)}</span>
                          : <span className="text-[11px] text-gray-300">—</span>}
                      </td>
                      {/* FACTURÉ */}
                      <td className="px-3 py-2.5 text-right">
                        {lotFacture > 0
                          ? <span className="text-[12px] font-semibold text-gray-600 tabular-nums">{fmtEur(lotFacture)}</span>
                          : <span className="text-[11px] text-gray-300">—</span>}
                      </td>
                      {/* PAYÉ (paye + acompte) */}
                      <td className="px-3 py-2.5 text-right">
                        {lotPaye > 0
                          ? <span className="text-[12px] font-semibold text-emerald-600 tabular-nums">{fmtEur(lotPaye)}</span>
                          : <span className="text-[11px] text-gray-300">—</span>}
                      </td>
                      {/* SOLDE */}
                      <td className="px-3 py-2.5 text-right">
                        {lotIsSolded ? (
                          <span className="text-[11px] font-bold text-emerald-600 flex items-center justify-end gap-1">
                            <Check className="h-3 w-3" />Soldé
                          </span>
                        ) : lotSoldeRest > 0 ? (
                          <span className="text-[12px] font-bold text-orange-600 tabular-nums">{fmtEur(lotSoldeRest)}</span>
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                      {/* AVANCEMENT — barre + % */}
                      <td className="px-3 py-2.5">
                        {lotEngage > 0 ? (
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden shrink-0">
                              <div
                                className={`h-full rounded-full transition-all ${lotPctAvance >= 100 ? 'bg-emerald-500' : lotPctAvance >= 50 ? 'bg-indigo-500' : 'bg-indigo-300'}`}
                                style={{ width: `${lotPctAvance}%` }}
                              />
                            </div>
                            <span className={`text-[11px] font-bold tabular-nums w-9 text-right ${lotPctAvance >= 100 ? 'text-emerald-600' : 'text-gray-500'}`}>
                              {lotPctAvance}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                    </tr>

                    {/* ── Lignes artisans (visibles si lot expanded) ── */}
                    {isExpanded && row.lot.artisans.map((artisan, aIdx) => {
                      const totalPaye  = artisan.totaux.paye + artisan.totaux.acompte;
                      const budget     = artisan.totaux.devis_valides || artisan.totaux.facture;
                      const pct        = budget > 0 ? Math.min(100, Math.round(totalPaye / budget * 100)) : 0;
                      // V3.4.16+ (2026-05-18) — Fix : pour la branche "sans facture",
                      // on utilise `a_payer` (backend) au lieu de comparer `totalPaye`
                      // à `budget`. La formule backend (`max(0, devis_valides -
                      // acompte_devis)`) est plus fiable que la soustraction front
                      // (risque d'arrondi flottant 0.99 → état "non soldé" alors que
                      // tout est versé). Devis Malet 15917€ acompte = 15917€ → a_payer
                      // = 0 → isSolde = true.
                      const isSolde    = artisan.factures.length > 0
                        ? artisan.factures.some(f => (statutOverrides[f.id] ?? f.facture_statut) === 'payee') && artisan.totaux.a_payer === 0
                        : artisan.totaux.devis_valides > 0 && artisan.totaux.a_payer === 0;
                      const hasAlert   = artisan.factures.some(f => factureCoherence(f.nom, artisan.devis) === false);
                      const docsCount  = artisan.devis.filter(d => d.signed_url).length
                                       + artisan.factures.filter(f => f.signed_url).length;
                      const isLast     = aIdx === row.lot.artisans.length - 1;

                      // Crée un lot virtuel (artisan seul) pour l'ArtisanDrawer
                      const virtualLot: BudgetLot = {
                        ...row.lot,
                        devis:    artisan.devis,
                        factures: artisan.factures,
                        artisans: [artisan],
                        totaux:   {
                          devis_recus:   artisan.totaux.devis_valides,
                          devis_valides: artisan.totaux.devis_valides,
                          facture:       artisan.totaux.facture,
                          paye:          artisan.totaux.paye,
                          acompte:       artisan.totaux.acompte,
                          litige:        artisan.totaux.litige,
                          a_payer:       artisan.totaux.a_payer,
                        },
                      };

                      // frais, ticket_caisse, achat_materiaux n'ont pas de devis associé par définition.
                      const SANS_DEVIS_TYPES = ['frais', 'ticket_caisse', 'achat_materiaux'];
                      const realFactures = artisan.factures.filter(f => !SANS_DEVIS_TYPES.includes(f.depense_type ?? ''));
                      const fraisOnly    = artisan.factures.filter(f => f.depense_type === 'frais');
                      const noDevis    = artisan.devis.length === 0 && realFactures.length > 0;
                      const noFacture  = artisan.devis.length > 0 && artisan.totaux.devis_valides > 0 && realFactures.length === 0 && !isSolde;
                      const totalFrais = fraisOnly.reduce((s, f) => s + (f.montant ?? 0), 0);
                      // Tous les devis pending (reçus, non signés) ET pas de facture = ligne "à signer"
                      const pendingDevis  = artisan.devis.filter(d => d.devis_statut !== 'valide' && d.devis_statut !== 'attente_facture');
                      const isFullyPending = artisan.devis.length > 0
                        && artisan.totaux.devis_valides === 0
                        && artisan.factures.length === 0
                        && pendingDevis.length > 0;
                      const pendingMontant = pendingDevis.reduce((s, d) => s + (d.montant ?? 0), 0);

                      return (
                        <tr
                          key={artisan.nom}
                          className={`border-b transition-colors cursor-pointer hover:bg-indigo-50/30 ${
                            isLast ? 'border-b-2 border-gray-200' : 'border-gray-50'
                          } ${isFullyPending ? 'bg-amber-50/30' : ''}`}
                          onClick={() => setSelected(buildRow(virtualLot))}
                        >
                          {/* ARTISAN */}
                          <td className="pl-9 pr-3 py-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className={`text-[12px] font-semibold truncate ${isFullyPending ? 'text-gray-500 italic' : 'text-gray-800'}`}>{artisan.nom}</p>
                                  {hasAlert && <span className="text-amber-500 text-[10px] shrink-0" title="Vérifier la cohérence">⚠</span>}
                                </div>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  {isFullyPending ? (
                                    <span className="inline-flex items-center gap-0.5 text-amber-600 font-medium mr-1.5">
                                      <Clock className="h-2.5 w-2.5" />À signer
                                    </span>
                                  ) : artisan.devis.length > 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-emerald-600 font-medium mr-1.5">
                                      <Check className="h-2.5 w-2.5" />Validé
                                    </span>
                                  )}
                                  {noDevis && (
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        setAddDocLotId(row.lot.id);
                                        setShowAddDoc(true);
                                      }}
                                      title="Ajouter un devis pour cet artisan"
                                      className="inline-flex items-center gap-0.5 text-amber-600 font-medium mr-1.5 hover:text-amber-800 hover:underline cursor-pointer"
                                    >
                                      <AlertTriangle className="h-2.5 w-2.5" />Devis manquant
                                    </button>
                                  )}
                                  {noFacture && (
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        setAddDocLotId(row.lot.id);
                                        setShowAddDoc(true);
                                      }}
                                      title="Ajouter une facture pour cet artisan"
                                      className="inline-flex items-center gap-0.5 text-amber-600 font-medium mr-1.5 hover:text-amber-800 hover:underline cursor-pointer"
                                    >
                                      <AlertTriangle className="h-2.5 w-2.5" />Facture manquante
                                    </button>
                                  )}
                                  {realFactures.length > 0 && `${realFactures.length} facture${realFactures.length > 1 ? 's' : ''}`}
                                  {fraisOnly.length > 0 && (
                                    <span className="ml-1.5 text-amber-600 font-medium">📝 {fmtEur(totalFrais)} frais</span>
                                  )}
                                  {docsCount > 0 && (
                                    <span className="ml-1.5 text-gray-300">· 📄{docsCount}</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* ENGAGÉ */}
                          <td className="px-3 py-3 text-right">
                            {artisan.totaux.devis_valides > 0 ? (
                              <span className="text-[12px] font-bold text-gray-800">{fmtEur(artisan.totaux.devis_valides)}</span>
                            ) : isFullyPending && pendingMontant > 0 ? (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-[12px] font-medium italic text-gray-400" title="Devis reçu mais non signé — non compté dans l'engagement">
                                  {fmtEur(pendingMontant)}
                                </span>
                                <span className="text-[9px] text-amber-600 italic">non signé</span>
                              </div>
                            ) : noDevis && artisan.totaux.facture > 0 ? (
                              <span className="text-[12px] font-bold text-amber-600" title="Montant de la facture (devis manquant)">
                                {fmtEur(artisan.totaux.facture)}
                              </span>
                            ) : (
                              <span className="text-[12px] text-gray-300">—</span>
                            )}
                          </td>

                          {/* FACTURÉ */}
                          <td className="px-3 py-3 text-right">
                            {artisan.totaux.facture > 0 ? (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-[12px] font-semibold text-gray-700">{fmtEur(artisan.totaux.facture)}</span>
                                {artisan.totaux.devis_valides > 0 && artisan.totaux.facture > artisan.totaux.devis_valides * 1.05 && (
                                  <span className="text-[10px] text-red-500 font-semibold flex items-center gap-0.5 whitespace-nowrap">
                                    <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                    +{fmtEur(artisan.totaux.facture - artisan.totaux.devis_valides)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[12px] text-gray-300">—</span>
                            )}
                          </td>

                          {/* PAYÉ — montants uniquement (read-only) */}
                          <td className="px-3 py-3">
                            <div className="flex flex-col items-end gap-0.5">
                              {isSolde && totalPaye > 0 ? (
                                <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                  {fmtEur(totalPaye)} réglé
                                </span>
                              ) : (
                                <>
                                  {artisan.totaux.acompte > 0 && (
                                    <span className="text-[11px] font-semibold text-indigo-600 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                                      {fmtEur(artisan.totaux.acompte)} acompte
                                    </span>
                                  )}
                                  {artisan.totaux.paye > 0 && (
                                    <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                      {fmtEur(artisan.totaux.paye)} réglé
                                    </span>
                                  )}
                                </>
                              )}
                              {artisan.totaux.litige > 0 && (
                                <span className="text-[11px] font-semibold text-red-600 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                                  {fmtEur(artisan.totaux.litige)} litige
                                </span>
                              )}
                              {artisan.totaux.acompte === 0 && artisan.totaux.paye === 0 && artisan.totaux.litige === 0 && (
                                <span className="text-[11px] text-gray-300">—</span>
                              )}
                            </div>
                          </td>

                          {/* SOLDE — machine à états centrale */}
                          {(() => {
                            const artisanKey = artisan.nom;
                            const primaryFacture = artisan.factures[0] ?? null;
                            const currentStatut = primaryFacture
                              ? ((statutOverrides[primaryFacture.id] ?? primaryFacture.facture_statut ?? 'recue') as FactureStatut)
                              : null;
                            const cfg = currentStatut ? (FACTURE_STATUT_CFG[currentStatut] ?? FACTURE_STATUT_CFG.recue) : null;
                            const isOpen = openArtisanMenu === artisanKey;
                            const isChanging = primaryFacture ? changingId === primaryFacture.id : false;
                            const isAcompteStatut = currentStatut === 'payee_partiellement';
                            const isInlineOpen = inlineAcompte?.artisanKey === artisanKey;
                            const isSavingAcomp = primaryFacture ? savingAcompte === primaryFacture.id : false;
                            // Ticket/frais = toujours payé, pas de dropdown ni bouton versement
                            // Déclaré ici (scope outer) pour être accessible en section 3
                            const isAlwaysPaid = primaryFacture?.depense_type === 'ticket_caisse' || primaryFacture?.depense_type === 'frais';

                            // Artisan sans facture : acompte via payment_events
                            const devisWithEvents = artisan.devis.filter(d => (d.payment_event_ids?.length ?? 0) > 0);
                            const eventIds = devisWithEvents.flatMap(d => d.payment_event_ids ?? []);
                            // Pending events de l'échéancier (source de vérité prioritaire)
                            const allPendingEvents = artisan.devis.flatMap(d => d.pending_events ?? []);
                            const hasDevisAcompte = eventIds.length > 0 || allPendingEvents.length > 0;
                            const isSavingDevisAcomp = savingAcompte === (allPendingEvents[0]?.id ?? eventIds[0] ?? artisanKey);

                            // Helper : input acompte inline
                            const AcompteInput = ({ onSave, max }: { onSave: (v: string) => void; max?: number }) => {
                              const val = parseFloat((inlineAcompte?.value ?? '').replace(',', '.'));
                              const isOver = max !== undefined && !isNaN(val) && val > max;
                              return (
                                <div className="flex flex-col items-end gap-0.5">
                                  <div className="flex items-center gap-1 justify-end">
                                    <input autoFocus type="number" inputMode="decimal"
                                      value={inlineAcompte?.value ?? ''}
                                      onChange={e => setInlineAcompte(prev => prev ? { ...prev, value: e.target.value } : prev)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter' && inlineAcompte && !isOver) onSave(inlineAcompte.value);
                                        if (e.key === 'Escape') setInlineAcompte(null);
                                      }}
                                      onBlur={() => { if (inlineAcompte && !isOver) onSave(inlineAcompte.value); else setInlineAcompte(null); }}
                                      className={`w-20 text-[12px] font-bold border-b-2 outline-none bg-transparent pb-0.5 text-right ${isOver ? 'border-red-400 text-red-600' : 'border-indigo-400 text-gray-800'}`}
                                      placeholder="montant €"
                                    />
                                    <button onClick={() => setInlineAcompte(null)} aria-label="Annuler la saisie d'acompte" className="text-gray-300 hover:text-gray-500"><X className="h-3 w-3" aria-hidden="true" /></button>
                                  </div>
                                  {isOver && (
                                    <span className="text-[9px] text-red-500">Max {fmtEur(max!)}</span>
                                  )}
                                </div>
                              );
                            };

                            return (
                              <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                                <div className="flex flex-col items-end gap-1">

                                  {/* 1. MONTANT — toujours visible en premier */}
                                  {isSolde && artisan.totaux.acompte > budget * 1.01 ? (
                                    <span className="text-[12px] font-bold text-orange-500 flex items-center gap-1" title={`Acompte versé (${fmtEur(artisan.totaux.acompte)}) dépasse le montant du devis (${fmtEur(budget)})`}>
                                      <AlertTriangle className="h-3.5 w-3.5" />Dépassement
                                    </span>
                                  ) : isSolde ? (
                                    <span className="text-[12px] font-bold text-emerald-600 flex items-center gap-1">
                                      <Check className="h-3.5 w-3.5" />Soldé
                                    </span>
                                  ) : artisan.totaux.a_payer > 0 ? (
                                    <span className="text-[13px] font-black text-gray-700">{fmtEur(artisan.totaux.a_payer)}</span>
                                  ) : !primaryFacture && !hasDevisAcompte ? (
                                    <span className="text-[11px] text-gray-300">—</span>
                                  ) : null}

                                  {/* 2a. STATUT — bouton central (si facture) → ouvre drawer versements */}
                                  {primaryFacture && cfg && (() => {
                                    if (isAlwaysPaid) {
                                      return (
                                        <span className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                                          <Check className="h-3 w-3" />Payé
                                        </span>
                                      );
                                    }
                                    return (
                                      <button
                                        disabled={isChanging}
                                        onClick={e => {
                                          e.stopPropagation();
                                          setVersementsDrawer({
                                            artisanNom: artisanKey,
                                            budget,
                                            sourceIds: [...artisan.devis.map(d => d.id), primaryFacture.id],
                                            eventIds: [...eventIds, ...allPendingEvents.map(ev => ev.id)],
                                            primaryDocumentId: primaryFacture.id,
                                            primaryDocumentType: 'facture',
                                            legacyMontantPaye: primaryFacture.montant_paye ?? 0,
                                            factureId: primaryFacture.id,
                                            factureStatut: currentStatut ?? 'recue',
                                          });
                                        }}
                                        className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all ${cfg.cls}`}
                                      >
                                        {isChanging ? <Loader2 className="h-3 w-3 animate-spin" /> : cfg.icon}
                                        {cfg.short}
                                        <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
                                      </button>
                                    );
                                  })()}

                                  {/* 2b. STATUT — bouton central (sans facture, via payment_events) */}
                                  {(!primaryFacture || !cfg) && (() => {
                                    const devisStatut = isSolde ? 'solde' : hasDevisAcompte ? 'acompte' : 'none';
                                    const devisCfg = devisStatut === 'solde'
                                      ? { icon: <Check className="h-3 w-3" />, short: 'Payée', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
                                      : devisStatut === 'acompte'
                                      ? { icon: <span>⏳</span>, short: 'Acompte', cls: 'border-indigo-200 bg-indigo-50 text-indigo-700' }
                                      : { icon: <Plus className="h-3 w-3" />, short: 'Paiement', cls: 'border-gray-200 bg-gray-50 text-gray-400' };
                                    // Premier devis valide = document cible pour cashflow_terms
                                    // Sans primaryDocumentId → cashflow_extras flottant → invisible dans Budget
                                    const primaryDevis = artisan.devis[0] ?? null;
                                    return (
                                      <button
                                        onClick={e => {
                                          e.stopPropagation();
                                          setVersementsDrawer({
                                            artisanNom: artisanKey,
                                            budget,
                                            sourceIds: artisan.devis.map(d => d.id),
                                            eventIds: [...eventIds, ...allPendingEvents.map(e => e.id)],
                                            // Lier au devis source → versement compté dans Budget
                                            ...(primaryDevis ? {
                                              primaryDocumentId:   primaryDevis.id,
                                              primaryDocumentType: 'devis' as const,
                                            } : {}),
                                          });
                                        }}
                                        className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all ${devisCfg.cls}`}
                                      >
                                        {devisCfg.icon}
                                        {devisCfg.short}
                                        <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
                                      </button>
                                    );
                                  })()}

                                  {/* 3. BOUTON PAIEMENT RAPIDE — visible si montant restant à régler */}
                                  {primaryFacture && !isAlwaysPaid && artisan.totaux.a_payer > 0 && (
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        const resteARegler = artisan.totaux.a_payer;
                                        const isAcompte = (statutOverrides[primaryFacture.id] ?? primaryFacture.facture_statut) === 'payee_partiellement';
                                        setVersementsDrawer({
                                          artisanNom: artisanKey,
                                          budget,
                                          sourceIds: [...artisan.devis.map(d => d.id), primaryFacture.id],
                                          eventIds: [...eventIds, ...allPendingEvents.map(ev => ev.id)],
                                          primaryDocumentId: primaryFacture.id,
                                          primaryDocumentType: 'facture',
                                          legacyMontantPaye: primaryFacture.montant_paye ?? 0,
                                          factureId: primaryFacture.id,
                                          factureStatut: currentStatut ?? 'recue',
                                          autoOpenForm: true,
                                          autoFillAmount: resteARegler,
                                          autoFillLabel: isAcompte
                                            ? `Solde — ${artisanKey}`
                                            : `Paiement — ${artisanKey}`,
                                        });
                                      }}
                                      className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                    >
                                      💸 Paiement
                                    </button>
                                  )}

                                </div>
                              </td>
                            );
                          })()}

                          {/* AVANCEMENT */}
                          <td className="px-3 py-3">
                            {budget > 0 ? (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[50px] relative">
                                  {/* Acompte (bleu) */}
                                  {artisan.totaux.acompte > 0 && (
                                    <div
                                      className="absolute left-0 top-0 h-full bg-indigo-400 rounded-full"
                                      style={{ width: `${Math.min(100, Math.round(artisan.totaux.acompte / budget * 100))}%` }}
                                    />
                                  )}
                                  {/* Réglé (vert) */}
                                  {artisan.totaux.paye > 0 && (
                                    <div
                                      className="absolute top-0 h-full bg-emerald-400 rounded-full"
                                      style={{
                                        left: `${Math.min(100, Math.round(artisan.totaux.acompte / budget * 100))}%`,
                                        width: `${Math.min(100 - Math.round(artisan.totaux.acompte / budget * 100), Math.round(artisan.totaux.paye / budget * 100))}%`,
                                      }}
                                    />
                                  )}
                                </div>
                                <span className={`text-[10px] tabular-nums w-7 text-right shrink-0 ${isSolde ? 'text-emerald-600 font-bold' : 'text-gray-400'}`}>
                                  {pct}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Ligne total du lot (si 2+ artisans) */}
                    {isExpanded && row.lot.artisans.length > 1 && (() => {
                      const lotTotalPaye = row.lot.totaux.paye + row.lot.totaux.acompte;
                      const lotSolde = row.lot.totaux.a_payer;
                      const lotSolded = lotSolde === 0 && lotTotalPaye > 0 && lotTotal > 0;
                      return (
                        <tr className="border-b-2 border-gray-300 bg-gray-50/60">
                          <td className="pl-9 pr-3 py-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Total {row.lot.nom}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-[12px] font-black text-gray-800">{lotTotal > 0 ? fmtEur(lotTotal) : '—'}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-[12px] font-semibold text-gray-700">{row.lot.totaux.facture > 0 ? fmtEur(row.lot.totaux.facture) : '—'}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-[12px] font-semibold text-gray-700">{lotTotalPaye > 0 ? fmtEur(lotTotalPaye) : '—'}</span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {lotSolded ? (
                              <span className="text-[11px] font-bold text-emerald-600 flex items-center justify-end gap-1"><Check className="h-3 w-3" />Soldé</span>
                            ) : lotSolde > 0 ? (
                              <span className="text-[12px] font-black text-orange-600">{fmtEur(lotSolde)}</span>
                            ) : (
                              <span className="text-[11px] text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2" />
                        </tr>
                      );
                    })()}

                    {/* Lot vide (pas encore de docs) */}
                    {isExpanded && row.lot.artisans.length === 0 && (
                      <tr className="border-b-2 border-gray-200">
                        <td colSpan={COLS} className="pl-9 py-3 text-[12px] text-gray-400">
                          Aucun document dans ce lot
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

                      

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      {!loading && data && (
        <div className="px-5 py-2.5 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[11px] text-gray-400">
            {rows.length} intervenant{rows.length !== 1 ? 's' : ''}
            {totalDocs > 0 && ` · ${totalDocs} document${totalDocs !== 1 ? 's' : ''} téléchargeable${totalDocs !== 1 ? 's' : ''}`}
          </p>
          <button onClick={refresh} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
            <RotateCw className="h-3 w-3" />
            Actualiser
          </button>
        </div>
      )}

      {/* Overlay fermeture menus statut */}
      {(openMenu || openArtisanMenu) && (
        <div className="fixed inset-0 z-20" onClick={() => { setOpenMenu(null); setAcompteInput(null); setOpenArtisanMenu(null); }} />
      )}

      {/* ── Drawer artisan ────────────────────────────────────────────────── */}
      {selected && (
        <ArtisanDrawer
          row={selected}
          chantierId={chantierId}
          token={token}
          onClose={() => setSelected(null)}
          onStatutChange={handleStatutChange}
          onRefresh={() => { refresh(); setStatutOverrides({}); }}
        />
      )}

      {/* ── Modal ajout document ──────────────────────────────────────────── */}
      {showAddDoc && (
        <AddDocumentModal
          chantierId={chantierId}
          token={token}
          lots={lotsForModal}
          defaultDocType={addDocLotId ? 'devis' : undefined}
          defaultLotId={addDocLotId}
          onClose={() => { setShowAddDoc(false); setAddDocLotId(undefined); }}
          onSuccess={() => { setShowAddDoc(false); setAddDocLotId(undefined); refresh(); }}
        />
      )}

      {/* ── Modal réconciliation des cashflow_extras orphelins ────────────── */}
      {showOrphansModal && data && (
        <OrphansReconciliationModal
          chantierId={chantierId}
          token={token}
          lots={orphanLots}
          orphans={data.cashflow_orphans ?? []}
          onClose={() => setShowOrphansModal(false)}
          onChange={() => { refresh(); }}
        />
      )}

      {/* ── Modale alerte cohérence paiement ──────────────────────────────── */}
      {coherenceAlert && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setCoherenceAlert(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-gray-800">Montant différent du prévu</h3>
                <p className="text-[12px] text-gray-500 mt-1">
                  {coherenceAlert.plannedLabel && (
                    <span className="block font-medium text-gray-700 mb-1">"{coherenceAlert.plannedLabel}"</span>
                  )}
                  L'échéancier prévoyait <strong>{fmtEur(coherenceAlert.plannedAmount)}</strong>, vous versez <strong>{fmtEur(coherenceAlert.paidAmount)}</strong>.
                  <span className="block mt-1 text-amber-700">
                    S'agit-il d'un accord modifié avec l'artisan, ou d'une erreur de saisie ?
                  </span>
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setCoherenceAlert(null)}
                className="flex-1 px-3 py-2 text-[12px] font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Corriger le montant
              </button>
              <button
                onClick={coherenceAlert.onConfirm}
                className="flex-1 px-3 py-2 text-[12px] font-bold rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              >
                Confirmer {fmtEur(coherenceAlert.paidAmount)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drawer versements échelonnés ───────────────────────────────────── */}
      {versementsDrawer && (
        <VersementsDrawer
          chantierId={chantierId}
          token={token}
          artisanNom={versementsDrawer.artisanNom}
          budget={versementsDrawer.budget}
          sourceIds={versementsDrawer.sourceIds}
          knownEventIds={versementsDrawer.eventIds}
          primaryDocumentId={versementsDrawer.primaryDocumentId}
          primaryDocumentType={versementsDrawer.primaryDocumentType}
          legacyMontantPaye={versementsDrawer.legacyMontantPaye ?? 0}
          factureStatut={versementsDrawer.factureStatut}
          onStatutChange={versementsDrawer.factureId ? (s) => {
            changeStatut(versementsDrawer.factureId!, s as FactureStatut);
            setVersementsDrawer(prev => prev ? { ...prev, factureStatut: s } : prev);
          } : undefined}
          autoOpenForm={versementsDrawer.autoOpenForm}
          autoFillAmount={versementsDrawer.autoFillAmount}
          autoFillLabel={versementsDrawer.autoFillLabel}
          onClose={() => setVersementsDrawer(null)}
          onRefresh={refresh}
        />
      )}

      {/* ── PaiementDrawer contextualisé (bouton "Payer" mobile) ─────────── */}
      {paiementCtx && (
        <PaiementDrawer
          chantierId={chantierId}
          token={token}
          lots={[]}
          context={paiementCtx}
          onClose={() => setPaiementCtx(null)}
          onSuccess={refresh}
        />
      )}

      {/* ── Drawer dépense rapide ─────────────────────────────────────────── */}
      {depenseRapide === 'open' && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDepenseRapide(null)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-label="Enregistrer une dépense" className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] bg-white shadow-2xl z-50 flex flex-col pb-[max(0px,env(safe-area-inset-bottom))]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Budget</p>
                <h3 className="text-[15px] font-bold text-gray-900">Enregistrer une dépense</h3>
                <p className="text-[10px] text-orange-500 mt-0.5">Achat matériaux, paiement liquide, frais annexes…</p>
              </div>
              <button onClick={() => setDepenseRapide(null)} aria-label="Fermer la dépense rapide" className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Formulaire */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Libellé *</label>
                <input
                  autoFocus type="text" value={depenseForm.label}
                  onChange={e => setDepenseForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="ex : Carrelage chez Brico, Paiement plombier…"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Montant (€) *</label>
                  <input
                    type="number" inputMode="decimal" value={depenseForm.amount}
                    onChange={e => setDepenseForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-orange-400"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Date</label>
                  <input
                    type="date" value={depenseForm.date}
                    onChange={e => setDepenseForm(f => ({ ...f, date: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Type de dépense</label>
                <select
                  value={depenseForm.depense_type}
                  onChange={e => setDepenseForm(f => ({ ...f, depense_type: e.target.value as any }))}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                >
                  <option value="achat_materiaux">Achat matériaux</option>
                  <option value="frais">Frais annexes</option>
                  <option value="ticket_caisse">Ticket de caisse</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Lot / poste</label>
                <select
                  value={depenseForm.lot_id}
                  onChange={e => setDepenseForm(f => ({ ...f, lot_id: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                >
                  <option value="">— Aucun lot spécifique —</option>
                  {lotsForModal.map(l => (
                    <option key={l.id} value={l.id}>{l.emoji ? `${l.emoji} ` : ''}{l.nom}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Note (optionnel)</label>
                <input
                  type="text" value={depenseForm.note}
                  onChange={e => setDepenseForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="ex : Ticket garde en poche"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-orange-400"
                />
              </div>

              {depenseError && (
                <p className="text-[11px] text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {depenseError}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setDepenseRapide(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  onClick={saveDepenseRapide}
                  disabled={savingDepense || !depenseForm.label.trim() || !depenseForm.amount}
                  className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {savingDepense ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
