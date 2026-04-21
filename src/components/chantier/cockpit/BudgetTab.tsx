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
import { useState, useMemo, useCallback, useEffect, Fragment } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Search, Plus, Paperclip, X, Download,
  AlertCircle, Loader2, RotateCw, AlertTriangle,
  Check, Clock, ChevronDown, ChevronRight, Scale, Pencil,
} from 'lucide-react';
import { fmtEur } from '@/lib/financingUtils';
import AddDocumentModal from './AddDocumentModal';

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
  montant_acompte_echeancier?: number; // paiements Échéancier payés sur ce devis
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
  devis_recus:   number;
  devis_valides: number;
  facture:       number;
  paye:          number;
  acompte:       number;
  litige:        number;
  a_payer:       number;
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

interface BudgetData {
  budget_ia:        number;
  lots:             BudgetLot[];
  sans_lot:         BudgetLot | null;
  totaux:           BudgetLotTotaux;
  type_projet:      string;
  backfilled_count: number;
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
  const reste = Math.max(0, facture - totalPaye);

  const statuses = lot.devis.map(d => d.devis_statut);
  let devisStatut: DevisStatut = 'pending';
  if (statuses.some(s => s === 'valide' || s === 'attente_facture')) devisStatut = 'validated';
  else if (statuses.some(s => s === 'en_cours')) devisStatut = 'received';

  // Statut paiement agrégé
  let payStatut: PayStatut = 'none';
  if (lot.factures.length > 0 || acompte > 0) {
    if (lot.totaux.litige > 0)             payStatut = 'litige';
    else if (facture > 0 && totalPaye >= facture) payStatut = 'paid';
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

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, refresh: load, backfillToast };
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
  payee:               { label: 'Payée intégralement', short: 'Payée',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <Check className="h-3 w-3" /> },
  recue:               { label: 'Reçue — à payer',     short: 'À payer', cls: 'bg-amber-50 text-amber-700 border-amber-200',      icon: <Clock className="h-3 w-3" /> },
  payee_partiellement: { label: 'Acompte versé',        short: 'Acompte', cls: 'bg-blue-50 text-blue-700 border-blue-200',         icon: <ChevronDown className="h-3 w-3" /> },
  en_litige:           { label: 'En litige',            short: 'Litige',  cls: 'bg-red-50 text-red-700 border-red-200',            icon: <Scale className="h-3 w-3" /> },
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
  data, loading, chantierId, token,
}: {
  data:        BudgetData | null;
  loading:     boolean;
  chantierId:  string;
  token:       string;
}) {
  const storageKey = `budget_reel_${chantierId}`;

  const [budgetReel, setBudgetReel] = useState<number | null>(() => {
    try { const s = localStorage.getItem(storageKey); return s ? parseFloat(s) : null; }
    catch { return null; }
  });
  const [editing,  setEditing]  = useState(false);
  const [editVal,  setEditVal]  = useState('');

  const totaux         = data?.totaux;
  const decaisse       = (totaux?.paye ?? 0) + (totaux?.acompte ?? 0); // tout ce qui est sorti du compte
  const aRegler        = totaux?.a_payer  ?? 0;                         // factures reçues non soldées
  const litige         = totaux?.litige   ?? 0;
  const devisValides   = totaux?.devis_valides ?? 0;
  // Engage réel = devis validés + factures d'artisans sans devis (engagement même sans devis)
  const engageReel = data
    ? [...(data.lots ?? []), ...(data.sans_lot ? [data.sans_lot] : [])].reduce((s, lot) =>
        s + lot.artisans.reduce((ls, a) => ls + (a.devis.length > 0 ? a.totaux.devis_valides : a.totaux.facture), 0), 0
      )
    : devisValides;
  const effectiveReel  = budgetReel ?? (engageReel > 0 ? engageReel : null);
  const budgetRestant  = effectiveReel ? Math.max(0, effectiveReel - decaisse - aRegler) : 0;

  const pctEngagement = effectiveReel && effectiveReel > 0 ? Math.round((engageReel / effectiveReel) * 100) : 0;
  const pctDecaisse   = effectiveReel && effectiveReel > 0 ? Math.round((decaisse / effectiveReel) * 100) : 0;
  const pctARegler    = effectiveReel && effectiveReel > 0 ? Math.round((aRegler / effectiveReel) * 100) : 0;

  // Couleurs dynamiques
  const colorEngagement = pctEngagement > 100 ? '#ef4444' : pctEngagement > 80 ? '#f59e0b' : '#6366f1';
  const colorDecaisse   = pctDecaisse  >= 100 ? '#10b981' : pctDecaisse  > 0   ? '#3b82f6' : '#d1d5db';
  const colorARegler    = aRegler > 0 ? '#f59e0b' : '#d1d5db';

  function startEdit() {
    setEditVal(effectiveReel ? String(Math.round(effectiveReel)) : '');
    setEditing(true);
  }

  function persistBudgetReel(v: number) {
    setBudgetReel(v);
    try { localStorage.setItem(storageKey, String(v)); } catch {}
    window.dispatchEvent(new CustomEvent('budgetReelChanged', { detail: { chantierId, value: v } }));
    // Persist to DB (fire & forget)
    freshToken(token).then(tk => {
      fetch(`/api/chantier/${chantierId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ enveloppePrevue: v }),
      }).catch(() => {});
    }).catch(() => {});
  }

  function commitEdit() {
    const v = parseFloat(editVal.replace(/\s/g, '').replace(',', '.'));
    if (!isNaN(v) && v > 0) persistBudgetReel(v);
    setEditing(false);
  }

  // Auto-init : pré-remplit budgetReel avec le total engagé réel au premier chargement
  useEffect(() => {
    if (budgetReel !== null || engageReel <= 0) return;
    persistBudgetReel(engageReel);
  }, [engageReel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Détection conflit : budget choisi < engagé réel (tolérance 1%)
  const conflict      = budgetReel !== null && engageReel > 0 && engageReel > (budgetReel ?? 0) * 1.01;
  const conflictDiff  = conflict ? Math.round(engageReel - (budgetReel ?? 0)) : 0;

  function adjustToDevis() { persistBudgetReel(engageReel); }

  if (loading) return (
    <div className="px-7 py-6 border-b border-gray-100">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
        {[0,1,2].map(i => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-gray-100 animate-pulse shrink-0" />
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
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">

        {/* ── 1. Budget réel (éditable) ─────────────────── */}
        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center">
              Budget réel
              <InfoTooltip lines={[
                'Votre enveloppe globale pour ce chantier.',
                devisValides > 0 ? `Devis validés : ${fmtEur(devisValides)}` : 'Aucun devis validé pour l\'instant.',
                budgetReel ? `Budget saisi manuellement : ${fmtEur(budgetReel)}` : 'Cliquez sur "Modifier" pour définir votre budget.',
              ]} />
            </p>
            {!editing && (
              <button onClick={startEdit}
                      className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-500 transition-colors">
                <Pencil className="h-3 w-3" />
                Modifier
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <DonutRing pct={pctEngagement} color={colorEngagement} size={80} stroke={7} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[12px] font-black text-gray-700">{pctEngagement}%</span>
              </div>
            </div>
            <div className="min-w-0">
              {editing ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    type="number"
                    inputMode="decimal"
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
                    className="w-28 text-[16px] font-black border-b-2 border-indigo-400 outline-none bg-transparent text-gray-800 pb-0.5"
                    placeholder="Ex: 45000"
                  />
                  <span className="text-[13px] text-gray-400">€</span>
                </div>
              ) : (
                <button onClick={startEdit} className="group text-left">
                  <p className="text-[18px] font-black text-gray-800 group-hover:text-indigo-600 transition-colors leading-none">
                    {effectiveReel ? fmtEur(effectiveReel) : <span className="text-gray-300 text-[13px]">Cliquer pour définir</span>}
                  </p>
                </button>
              )}
              <p className="text-[11px] text-gray-400 mt-1.5">
                {pctEngagement > 0
                  ? <span className={pctEngagement > 100 ? 'text-red-500 font-semibold' : ''}>{pctEngagement}% engagé</span>
                  : 'devis en cours'}
              </p>
            </div>
          </div>
        </div>

        {/* ── 3. Décaissé ───────────────────────────────── */}
        <div className="px-5 py-5 sm:px-7 sm:py-6">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center">
            Décaissé
            <InfoTooltip lines={[
              'Tout l\'argent qui a quitté votre compte.',
              totaux?.acompte ? `Acomptes versés : ${fmtEur(totaux.acompte)}` : null,
              totaux?.paye ? `Factures réglées : ${fmtEur(totaux.paye)}` : null,
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
                      <span className="text-gray-500">Acomptes</span>
                      <span className="font-semibold text-indigo-600 ml-auto">{fmtEur(totaux!.acompte)}</span>
                    </p>
                  )}
                  {(totaux?.paye ?? 0) > 0 && (
                    <p className="text-[10px] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="text-gray-500">Factures réglées</span>
                      <span className="font-semibold text-emerald-600 ml-auto">{fmtEur(totaux!.paye)}</span>
                    </p>
                  )}
                  {pctDecaisse >= 100 && devisValides > 0 && (
                    <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                      <Check className="h-3 w-3" />Tout soldé
                    </p>
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

      </div>

      {/* ── Bannière conflit budget ────────────────────────────────────────────── */}
      {conflict && (
        <div className="mx-5 mb-4 mt-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-amber-800">
              Budget en dépassement de {fmtEur(conflictDiff)}
            </p>
            <p className="text-[10px] text-amber-700 mt-0.5 leading-relaxed">
              L'ensemble de vos engagements (devis + factures) totalise <strong>{fmtEur(engageReel)}</strong>, soit {fmtEur(conflictDiff)} de plus
              que votre budget de <strong>{fmtEur(budgetReel ?? 0)}</strong>.
              Souhaitez-vous ajuster votre budget ou revoir les devis ?
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={adjustToDevis}
              className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors whitespace-nowrap"
            >
              Ajuster à {fmtEur(engageReel)}
            </button>
            <button
              onClick={startEdit}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap"
            >
              Modifier le budget
            </button>
          </div>
        </div>
      )}
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
}: {
  search: string; onSearch: (v: string) => void;
  filterDevis: FilterDevis; onFilterDevis: (v: FilterDevis) => void;
  filterPay: FilterPay; onFilterPay: (v: FilterPay) => void;
  sortBy: SortBy; onSort: (v: SortBy) => void;
  onAddDocument?: () => void;
}) {
  const sel = 'text-[12px] border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-300 w-full md:w-auto';
  return (
    <div className="px-5 py-3 border-b border-gray-100 flex flex-col md:flex-row md:items-center gap-2 md:gap-3 md:flex-wrap">
      <div className="relative w-full md:flex-1 md:min-w-[180px] md:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          value={search} onChange={e => onSearch(e.target.value)}
          placeholder="Rechercher un artisan…"
          className="w-full pl-8 pr-7 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 placeholder:text-gray-400"
        />
        {search && (
          <button onClick={() => onSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5">
            <X className="h-3 w-3 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:flex md:gap-3 md:contents">
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
      <button
        onClick={onAddDocument}
        className="w-full md:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 transition-colors shrink-0"
      >
        <Plus className="h-3.5 w-3.5" />
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
      <div className="fixed inset-0 bg-black/40 sm:bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] bg-white shadow-2xl z-50 flex flex-col">

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
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0 ml-2">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Totaux */}
        <div className="grid grid-cols-3 border-b border-gray-100 divide-x divide-gray-100">
          {[
            { label: 'Facturé', value: fmtEur(totalFacture), red: false },
            { label: 'Payé',    value: fmtEur(totalPaye),    red: false },
            { label: 'Reste',   value: fmtEur(row.reste),    red: row.reste > 0 },
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
          {lot.devis.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Devis</p>
              <div className="space-y-0">
                {lot.devis.map(d => (
                  <div key={d.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-[12px] text-gray-800 truncate">{d.nom}</p>
                      {d.devis_statut && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {DEVIS_STATUT_LABEL[d.devis_statut] ?? d.devis_statut}
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
                ))}
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
          )}

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
}: {
  chantierId: string;
  token:      string;
  rangeMin?:  number;
  rangeMax?:  number;
}) {
  const { data, loading, error, refresh, backfillToast } = useBudgetData(chantierId, token);

  const [search,       setSearch]       = useState('');
  const [filterDevis,  setFilterDevis]  = useState<FilterDevis>('all');
  const [filterPay,    setFilterPay]    = useState<FilterPay>('all');
  const [sortBy,       setSortBy]       = useState<SortBy>('default');
  const [selected,     setSelected]     = useState<BudgetRow | null>(null);
  const [showAddDoc,   setShowAddDoc]   = useState(false);
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set());
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
    if (filterPay   !== 'all') result = result.filter(r => r.payStatut   === filterPay);

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

  const toggleExpand = useCallback((lotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(lotId)) next.delete(lotId); else next.add(lotId);
      return next;
    });
  }, []);

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
      <BudgetKpiDashboard data={data} loading={loading} chantierId={chantierId} token={token} />

      {/* ── Barre d'actions ───────────────────────────────────────────────── */}
      <ActionBar
        search={search}           onSearch={setSearch}
        filterDevis={filterDevis} onFilterDevis={setFilterDevis}
        filterPay={filterPay}     onFilterPay={setFilterPay}
        sortBy={sortBy}           onSort={setSortBy}
        onAddDocument={() => setShowAddDoc(true)}
      />

      {/* ── Tableau ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto overscroll-x-contain">
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
                <td colSpan={COLS} className="py-16 text-center">
                  <p className="text-[13px] text-gray-400">
                    {search ? `Aucun résultat pour "${search}"` : 'Aucun artisan pour ce chantier'}
                  </p>
                </td>
              </tr>
            ) : (
              rows.map(row => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const isExpanded = expanded.has(row.lot.id);
                // lotTotal = budgetTotal calculé par buildRow (per-artisan : devis validés + factures sans devis)
                const lotTotal = row.devisAmount ?? 0;

                return (
                  <Fragment key={row.lot.id}>
                    {/* ── En-tête du lot ── */}
                    <tr
                      className="bg-gray-50/80 border-b border-gray-200 cursor-pointer hover:bg-gray-100/80 transition-colors select-none"
                      onClick={e => toggleExpand(row.lot.id, e)}
                    >
                      <td colSpan={COLS} className="px-4 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <button className="shrink-0 text-gray-400" onClick={e => toggleExpand(row.lot.id, e)}>
                            {isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5" />
                              : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                          {row.lot.emoji && <span className="text-sm leading-none shrink-0">{row.lot.emoji}</span>}
                          <span className="text-[12px] font-bold text-gray-700 truncate">{row.lot.nom}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">
                            {row.lot.artisans.length} artisan{row.lot.artisans.length > 1 ? 's' : ''}
                          </span>
                          <div className="ml-auto flex items-center gap-2 shrink-0">
                            {lotTotal > 0 && (
                              <span className="text-[12px] font-bold text-gray-700">{fmtEur(lotTotal)}</span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* ── Lignes artisans (visibles si lot expanded) ── */}
                    {isExpanded && row.lot.artisans.map((artisan, aIdx) => {
                      const totalPaye  = artisan.totaux.paye + artisan.totaux.acompte;
                      const budget     = artisan.totaux.devis_valides || artisan.totaux.facture;
                      const pct        = budget > 0 ? Math.min(100, Math.round(totalPaye / budget * 100)) : 0;
                      const isSolde    = artisan.totaux.a_payer === 0 && totalPaye > 0 && budget > 0;
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

                      const noDevis = artisan.devis.length === 0 && artisan.factures.length > 0;

                      return (
                        <tr
                          key={artisan.nom}
                          className={`border-b transition-colors cursor-pointer hover:bg-indigo-50/30 ${
                            isLast ? 'border-b-2 border-gray-200' : 'border-gray-50'
                          }`}
                          onClick={() => setSelected(buildRow(virtualLot))}
                        >
                          {/* ARTISAN */}
                          <td className="pl-9 pr-3 py-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-[12px] font-semibold text-gray-800 truncate">{artisan.nom}</p>
                                  {hasAlert && <span className="text-amber-500 text-[10px] shrink-0" title="Vérifier la cohérence">⚠</span>}
                                </div>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  {artisan.devis.length > 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-emerald-600 font-medium mr-1.5">
                                      <Check className="h-2.5 w-2.5" />Validé
                                    </span>
                                  )}
                                  {noDevis && (
                                    <span className="inline-flex items-center gap-0.5 text-amber-600 font-medium mr-1.5">
                                      <AlertTriangle className="h-2.5 w-2.5" />Devis manquant
                                    </span>
                                  )}
                                  {artisan.factures.length > 0 && `${artisan.factures.length} facture${artisan.factures.length > 1 ? 's' : ''}`}
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
                            {artisan.totaux.facture > 0
                              ? <span className="text-[12px] font-semibold text-gray-700">{fmtEur(artisan.totaux.facture)}</span>
                              : <span className="text-[12px] text-gray-300">—</span>}
                          </td>

                          {/* PAYÉ */}
                          <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex flex-col items-end gap-0.5">
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
                              {artisan.totaux.litige > 0 && (
                                <span className="text-[11px] font-semibold text-red-600 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                                  {fmtEur(artisan.totaux.litige)} litige
                                </span>
                              )}
                              {artisan.totaux.litige === 0 && (() => {
                                // Facture cible : partielle existante (modifier) ou première facture (créer)
                                const acompteFacture = artisan.factures.find(f => f.facture_statut === 'payee_partiellement');
                                const targetFacture = acompteFacture ?? (totalPaye === 0 ? artisan.factures[0] : null);
                                if (!targetFacture) return null;
                                const artisanKey = artisan.nom;
                                const isInline = inlineAcompte?.artisanKey === artisanKey;
                                const isSaving = savingAcompte === targetFacture.id;
                                if (isSaving) return <Loader2 className="h-3 w-3 text-indigo-400 animate-spin" />;
                                if (isInline) return (
                                  <div className="flex items-center gap-1 mt-0.5" onClick={e => e.stopPropagation()}>
                                    <input
                                      autoFocus
                                      type="number"
                                      inputMode="decimal"
                                      value={inlineAcompte.value}
                                      onChange={e => setInlineAcompte({ ...inlineAcompte, value: e.target.value })}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') saveInlineAcompte(targetFacture.id, inlineAcompte.value);
                                        if (e.key === 'Escape') setInlineAcompte(null);
                                      }}
                                      onBlur={() => saveInlineAcompte(targetFacture.id, inlineAcompte.value)}
                                      className="w-16 text-[11px] font-bold border-b border-indigo-400 outline-none bg-transparent text-gray-800 pb-0.5 text-right"
                                      placeholder={acompteFacture ? String(acompteFacture.montant_paye ?? '') : '0'}
                                    />
                                    <span className="text-[10px] text-gray-400">€</span>
                                    <button onClick={() => setInlineAcompte(null)} className="text-gray-300 hover:text-gray-500">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                );
                                return (
                                  <button
                                    onClick={e => { e.stopPropagation(); setInlineAcompte({ artisanKey, factureId: targetFacture.id, value: acompteFacture ? String(acompteFacture.montant_paye ?? '') : '' }); }}
                                    className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold flex items-center gap-1 mt-0.5 border border-indigo-200 hover:border-indigo-400 rounded-full px-2 py-0.5 transition-colors"
                                  >
                                    <Pencil className="h-2.5 w-2.5" />
                                    {acompteFacture ? 'Modifier' : '+ Acompte'}
                                  </button>
                                );
                              })()}
                            </div>
                          </td>

                          {/* SOLDE */}
                          <td className="px-3 py-3 text-right">
                            {isSolde ? (
                              <span className="text-[11px] font-bold text-emerald-600 flex items-center justify-end gap-1">
                                <Check className="h-3 w-3" />Soldé
                              </span>
                            ) : artisan.totaux.a_payer > 0 ? (
                              <span className="text-[12px] font-bold text-orange-600">{fmtEur(artisan.totaux.a_payer)}</span>
                            ) : (
                              <span className="text-[11px] text-gray-300">—</span>
                            )}
                          </td>

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

      {/* Overlay fermeture menu statut */}
      {openMenu && (
        <div className="fixed inset-0 z-20" onClick={() => { setOpenMenu(null); setAcompteInput(null); }} />
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
          onClose={() => setShowAddDoc(false)}
          onSuccess={() => { setShowAddDoc(false); refresh(); }}
        />
      )}
    </div>
  );
}
