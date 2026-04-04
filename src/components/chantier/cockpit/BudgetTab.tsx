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
import { useState, useMemo, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Search, Plus, Paperclip, X, ExternalLink, Download,
  AlertCircle, Loader2, RotateCw, AlertTriangle,
  Check, Clock, ChevronDown, Scale, Pencil, TrendingUp,
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

interface BudgetLot {
  id:       string;
  nom:      string;
  emoji:    string | null;
  devis:    BudgetDevis[];
  factures: BudgetFacture[];
  totaux:   BudgetLotTotaux;
}

interface BudgetData {
  budget_ia:  number;
  lots:       BudgetLot[];
  sans_lot:   BudgetLot | null;
  totaux:     BudgetLotTotaux;
  type_projet: string;
}

// ── Ligne enrichie ────────────────────────────────────────────────────────────

type FactureStatut = 'payee' | 'recue' | 'payee_partiellement' | 'en_litige';
type DevisStatut   = 'validated' | 'received' | 'pending';
type PayStatut     = 'paid' | 'litige' | 'partial' | 'unpaid' | 'none';

interface BudgetRow {
  lot:             BudgetLot;
  devisAmount:     number | null;
  devisAmountGrey: number | null;
  devisStatut:     DevisStatut;
  facture:         number;
  paye:            number;
  reste:           number;
  payStatut:       PayStatut;
  alertOverrun:    boolean;
}

function buildRow(lot: BudgetLot): BudgetRow {
  const { devis_valides, devis_recus, facture, paye } = lot.totaux;
  const reste = Math.max(0, facture - paye);

  const statuses = lot.devis.map(d => d.devis_statut);
  let devisStatut: DevisStatut = 'pending';
  if (statuses.some(s => s === 'valide' || s === 'attente_facture')) devisStatut = 'validated';
  else if (statuses.some(s => s === 'en_cours')) devisStatut = 'received';

  // Statut paiement agrégé : pire cas
  let payStatut: PayStatut = 'none';
  if (lot.factures.length > 0) {
    if (lot.totaux.litige > 0)                                   payStatut = 'litige';
    else if (facture > 0 && paye >= facture)                     payStatut = 'paid';
    else if (lot.totaux.acompte > 0 || paye > 0)                 payStatut = 'partial';
    else if (facture > 0)                                        payStatut = 'unpaid';
  }

  return {
    lot,
    devisAmount:     devis_valides > 0 ? devis_valides : null,
    devisAmountGrey: devis_valides === 0 && devis_recus > 0 ? devis_recus : null,
    devisStatut,
    facture,
    paye,
    reste,
    payStatut,
    alertOverrun: devis_valides > 0 && facture > devis_valides * 1.05,
  };
}

// ── Hook données ──────────────────────────────────────────────────────────────

function useBudgetData(chantierId: string, token: string) {
  const [data,    setData]    = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bearer = await freshToken(token);
      const res = await fetch(`/api/chantier/${chantierId}/budget`, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [chantierId, token]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, refresh: load };
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

function ProgressBar({ paye, facture }: { paye: number; facture: number }) {
  if (facture === 0) return <span className="text-gray-300 text-[11px]">—</span>;
  const pct   = Math.min(Math.round((paye / facture) * 100), 100);
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
  data, loading, rangeMin, rangeMax, chantierId,
}: {
  data:        BudgetData | null;
  loading:     boolean;
  rangeMin?:   number;
  rangeMax?:   number;
  chantierId:  string;
}) {
  const storageKey = `budget_reel_${chantierId}`;

  const [budgetReel, setBudgetReel] = useState<number | null>(() => {
    try { const s = localStorage.getItem(storageKey); return s ? parseFloat(s) : null; }
    catch { return null; }
  });
  const [editing,  setEditing]  = useState(false);
  const [editVal,  setEditVal]  = useState('');

  const totaux         = data?.totaux;
  const facture        = totaux?.facture      ?? 0;
  const paye           = (totaux?.paye ?? 0) + (totaux?.acompte ?? 0);
  const litige         = totaux?.litige       ?? 0;
  const devisValides   = totaux?.devis_valides ?? 0;
  const effectiveReel  = budgetReel ?? (devisValides > 0 ? devisValides : null);

  const pctEngagement = effectiveReel && effectiveReel > 0 ? Math.round((devisValides / effectiveReel) * 100) : 0;
  const pctFacture    = effectiveReel && effectiveReel > 0 ? Math.round((facture / effectiveReel) * 100) : 0;
  const pctPaye       = facture > 0 ? Math.round((paye / facture) * 100) : 0;

  // Couleurs dynamiques
  const colorEngagement = pctEngagement > 100 ? '#ef4444' : pctEngagement > 80 ? '#f59e0b' : '#6366f1';
  const colorFacture    = pctFacture > 100 ? '#ef4444' : pctFacture > 80 ? '#f59e0b' : '#f59e0b';
  const colorPaye       = pctPaye >= 100 ? '#10b981' : pctPaye > 0 ? '#3b82f6' : '#d1d5db';

  // Marker position sur la range bar
  const rangeWidth  = (rangeMax ?? 0) - (rangeMin ?? 0);
  const markerPct   = rangeWidth > 0 && devisValides > (rangeMin ?? 0)
    ? Math.min(((devisValides - (rangeMin ?? 0)) / rangeWidth) * 100, 100) : -1;

  function startEdit() {
    setEditVal(effectiveReel ? String(Math.round(effectiveReel)) : '');
    setEditing(true);
  }
  function commitEdit() {
    const v = parseFloat(editVal.replace(/\s/g, '').replace(',', '.'));
    if (!isNaN(v) && v > 0) {
      setBudgetReel(v);
      try { localStorage.setItem(storageKey, String(v)); } catch {}
    }
    setEditing(false);
  }

  if (loading) return (
    <div className="px-5 py-5 border-b border-gray-100">
      <div className="grid grid-cols-4 gap-5">
        {[0,1,2,3].map(i => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-gray-100 animate-pulse shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-2 w-20 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
              <div className="h-2 w-12 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="border-b border-gray-100 bg-white">
      <div className="grid grid-cols-4 divide-x divide-gray-100">

        {/* ── 1. Budget IA ─────────────────────────────── */}
        <div className="px-5 py-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Budget estimé IA</p>
          {(rangeMin && rangeMax) ? (
            <div>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-[14px] font-black text-gray-800">{fmtEur(rangeMin)}</span>
                <span className="text-[11px] text-gray-300 mx-0.5">–</span>
                <span className="text-[14px] font-black text-gray-800">{fmtEur(rangeMax)}</span>
              </div>
              {/* Range bar avec marqueur devis validé */}
              <div className="relative h-2 bg-indigo-50 rounded-full overflow-visible mb-2">
                <div className="absolute inset-0 rounded-full"
                     style={{ background: 'linear-gradient(90deg, #c7d2fe 0%, #818cf8 100%)' }} />
                {markerPct >= 0 && (
                  <div
                    className="absolute top-1/2 w-3.5 h-3.5 bg-indigo-600 rounded-full shadow border-2 border-white"
                    style={{ left: `${markerPct}%`, transform: 'translate(-50%, -50%)', zIndex: 1 }}
                    title={`Devis validé : ${fmtEur(devisValides)}`}
                  />
                )}
              </div>
              <div className="flex justify-between text-[9px] text-gray-400">
                <span>Minimum</span>
                {markerPct >= 0 && (
                  <span className="text-indigo-500 font-semibold">{fmtEur(devisValides)} engagé</span>
                )}
                <span>Maximum</span>
              </div>
            </div>
          ) : data?.budget_ia ? (
            <p className="text-[15px] font-black text-gray-800">{fmtEur(data.budget_ia)}</p>
          ) : (
            <p className="text-[13px] text-gray-300 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" /> Non estimé
            </p>
          )}
        </div>

        {/* ── 2. Budget réel (éditable) ─────────────────── */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Budget réel</p>
            {!editing && (
              <button onClick={startEdit}
                      className="flex items-center gap-1 text-[9px] text-gray-400 hover:text-indigo-500 transition-colors">
                <Pencil className="h-2.5 w-2.5" />
                Modifier
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <DonutRing pct={pctEngagement} color={colorEngagement} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-black text-gray-700">{pctEngagement}%</span>
              </div>
            </div>
            <div className="min-w-0">
              {editing ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    type="number"
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
                    className="w-24 text-[13px] font-black border-b-2 border-indigo-400 outline-none bg-transparent text-gray-800 pb-0.5"
                    placeholder="Ex: 45000"
                  />
                  <span className="text-[11px] text-gray-400">€</span>
                </div>
              ) : (
                <button onClick={startEdit} className="group text-left">
                  <p className="text-[14px] font-black text-gray-800 group-hover:text-indigo-600 transition-colors">
                    {effectiveReel ? fmtEur(effectiveReel) : <span className="text-gray-300 text-[12px]">Cliquer pour définir</span>}
                  </p>
                </button>
              )}
              <p className="text-[10px] text-gray-400 mt-0.5">
                {pctEngagement > 0
                  ? <span className={pctEngagement > 100 ? 'text-red-500 font-semibold' : ''}>{pctEngagement}% engagé</span>
                  : 'devis en cours'}
              </p>
            </div>
          </div>
        </div>

        {/* ── 3. Total facturé ──────────────────────────── */}
        <div className="px-5 py-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Total facturé</p>
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <DonutRing pct={pctFacture} color={colorFacture} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-black text-gray-700">{pctFacture}%</span>
              </div>
            </div>
            <div>
              <p className="text-[14px] font-black text-gray-800">{facture > 0 ? fmtEur(facture) : '—'}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {effectiveReel && effectiveReel > 0 && facture > 0
                  ? `sur ${fmtEur(effectiveReel)}`
                  : facture > 0 ? 'du budget réel' : 'Aucune facture'}
              </p>
              {pctFacture > 100 && (
                <p className="text-[10px] text-red-500 mt-0.5 flex items-center gap-1 font-semibold">
                  <AlertTriangle className="h-2.5 w-2.5" />Dépassement
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── 4. Total payé ─────────────────────────────── */}
        <div className="px-5 py-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Total payé</p>
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <DonutRing pct={pctPaye} color={colorPaye} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-black text-gray-700">{pctPaye}%</span>
              </div>
            </div>
            <div>
              <p className="text-[14px] font-black text-gray-800">{paye > 0 ? fmtEur(paye) : '—'}</p>
              {litige > 0 ? (
                <p className="text-[10px] text-red-500 mt-0.5 flex items-center gap-1 font-semibold">
                  <Scale className="h-2.5 w-2.5" />{fmtEur(litige)} en litige
                </p>
              ) : (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {facture > 0 ? `sur ${fmtEur(facture)}` : 'des factures'}
                </p>
              )}
              {pctPaye >= 100 && facture > 0 && (
                <p className="text-[10px] text-emerald-600 font-semibold mt-0.5 flex items-center gap-1">
                  <Check className="h-2.5 w-2.5" />Tout soldé
                </p>
              )}
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
}: {
  search: string; onSearch: (v: string) => void;
  filterDevis: FilterDevis; onFilterDevis: (v: FilterDevis) => void;
  filterPay: FilterPay; onFilterPay: (v: FilterPay) => void;
  sortBy: SortBy; onSort: (v: SortBy) => void;
  onAddDocument?: () => void;
}) {
  const sel = 'text-[12px] border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-300';
  return (
    <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 min-w-[180px] max-w-xs">
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
      <div className="flex-1" />
      <button
        onClick={onAddDocument}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 transition-colors shrink-0"
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
  const [changingId, setChangingId] = useState<string | null>(null);
  const [openMenu,   setOpenMenu]   = useState<string | null>(null);

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
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-[400px] max-w-full bg-white shadow-2xl z-50 flex flex-col">

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
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

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
                      {d.montant !== null && (
                        <span className="text-[12px] font-bold text-gray-700">{fmtEur(d.montant)}</span>
                      )}
                      {d.signed_url && (
                        <a href={d.signed_url} target="_blank" rel="noopener noreferrer"
                           className="p-1 hover:bg-gray-100 rounded transition-colors" title="Télécharger">
                          <Download className="h-3.5 w-3.5 text-gray-400" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

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

                  return (
                    <div key={f.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-[12px] text-gray-800 truncate font-medium">{label}</p>
                        {statut === 'payee_partiellement' && f.montant_paye != null && (
                          <p className="text-[10px] text-blue-500 mt-0.5">
                            {fmtEur(f.montant_paye)} versé · {fmtEur(resteF)} restant
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {f.montant !== null && (
                          <span className="text-[12px] font-bold text-gray-700">{fmtEur(f.montant)}</span>
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

function TableSkeleton() {
  return (
    <>
      {[0, 1, 2].map(i => (
        <tr key={i} className="border-b border-gray-50">
          {Array.from({ length: 9 }).map((_, j) => (
            <td key={j} className="px-4 py-3.5">
              <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: j === 0 ? '80%' : '60%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
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
  const { data, loading, error, refresh } = useBudgetData(chantierId, token);

  const [search,       setSearch]       = useState('');
  const [filterDevis,  setFilterDevis]  = useState<FilterDevis>('all');
  const [filterPay,    setFilterPay]    = useState<FilterPay>('all');
  const [sortBy,       setSortBy]       = useState<SortBy>('default');
  const [selected,     setSelected]     = useState<BudgetRow | null>(null);
  const [showAddDoc,   setShowAddDoc]   = useState(false);

  // Overrides locaux des statuts factures (optimistic updates)
  const [statutOverrides, setStatutOverrides] = useState<Record<string, FactureStatut>>({});

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
    // Re-sélectionner la ligne mise à jour (optimistic)
    setSelected(prev => {
      if (!prev) return prev;
      const updated = prev.lot.factures.map(f =>
        f.id === factureId ? { ...f, facture_statut: statut } : f,
      );
      return buildRow({ ...prev.lot, factures: updated });
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

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <BudgetKpiDashboard data={data} loading={loading} rangeMin={rangeMin} rangeMax={rangeMax} chantierId={chantierId} />

      {/* ── Barre d'actions ───────────────────────────────────────────────── */}
      <ActionBar
        search={search}           onSearch={setSearch}
        filterDevis={filterDevis} onFilterDevis={setFilterDevis}
        filterPay={filterPay}     onFilterPay={setFilterPay}
        sortBy={sortBy}           onSort={setSortBy}
        onAddDocument={() => setShowAddDoc(true)}
      />

      {/* ── Tableau ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
              <th className={`${TH} w-[160px]`}>Artisan</th>
              <th className={TH}>Poste</th>
              <th className={`${TH} text-right`}>Devis</th>
              <th className={TH}>Statut devis</th>
              <th className={`${TH} text-right`}>Factures</th>
              <th className={TH}>Statut</th>
              <th className={`${TH} text-right`}>Reste à payer</th>
              <th className={`${TH} w-[120px]`}>Progression</th>
              <th className={`${TH} text-center w-[60px]`}>Docs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <TableSkeleton />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center">
                  <p className="text-[13px] text-gray-400">
                    {search ? `Aucun résultat pour "${search}"` : 'Aucun artisan pour ce chantier'}
                  </p>
                </td>
              </tr>
            ) : (
              rows.map(row => {
                const ds      = DEVIS_STATUS[row.devisStatut];
                const ps      = PAY_STATUS[row.payStatut];
                const docCount = row.lot.devis.length + row.lot.factures.length;
                const firstDevisUrl = row.lot.devis.find(d => d.signed_url)?.signed_url;
                const factureCount  = row.lot.factures.length;

                return (
                  <tr
                    key={row.lot.id}
                    onClick={() => setSelected(row)}
                    className="hover:bg-gray-50/70 cursor-pointer transition-colors"
                  >
                    {/* Artisan */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        {row.lot.emoji && <span className="text-[15px] leading-none shrink-0">{row.lot.emoji}</span>}
                        <p className="text-[12px] font-semibold text-gray-800 truncate">{row.lot.nom}</p>
                      </div>
                    </td>

                    {/* Poste */}
                    <td className="px-4 py-3.5">
                      <p className="text-[11px] text-gray-400 truncate max-w-[140px]">
                        {row.lot.devis[0]?.nom ?? '—'}
                      </p>
                    </td>

                    {/* Devis + icône téléchargement */}
                    <td className="px-4 py-3.5 text-right">
                      {row.devisAmount !== null ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[12px] font-bold text-gray-800">{fmtEur(row.devisAmount)}</span>
                          {firstDevisUrl && (
                            <a
                              href={firstDevisUrl} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-indigo-600 transition-colors"
                              title="Télécharger le devis"
                            >
                              <Download className="h-3 w-3" />
                              <span>Devis</span>
                            </a>
                          )}
                        </div>
                      ) : row.devisAmountGrey !== null ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[12px] text-gray-400">{fmtEur(row.devisAmountGrey)}</span>
                          {firstDevisUrl && (
                            <a
                              href={firstDevisUrl} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-indigo-600 transition-colors"
                            >
                              <Download className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px] text-gray-300">—</span>
                      )}
                    </td>

                    {/* Statut devis + alerte dépassement */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <Badge label={ds.label} cls={ds.cls} />
                        {row.alertOverrun && (
                          <AlertTriangle
                            className="h-3.5 w-3.5 text-amber-500 shrink-0"
                            title="Facture supérieure au devis validé"
                          />
                        )}
                      </div>
                    </td>

                    {/* Factures */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex flex-col items-end gap-1">
                        {row.facture > 0 ? (
                          <span className="text-[12px] font-semibold text-gray-700">{fmtEur(row.facture)}</span>
                        ) : (
                          <span className="text-[12px] text-gray-300">—</span>
                        )}
                        {factureCount > 0 && (
                          <span className="text-[10px] text-gray-400">
                            {factureCount} facture{factureCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Statut paiement */}
                    <td className="px-4 py-3.5">
                      {row.payStatut !== 'none' ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${ps.cls}`}
                          onClick={e => { e.stopPropagation(); setSelected(row); }}
                        >
                          {ps.icon}{ps.label}
                        </span>
                      ) : (
                        <span className="text-[12px] text-gray-300">—</span>
                      )}
                    </td>

                    {/* Reste à payer */}
                    <td className="px-4 py-3.5 text-right">
                      {row.reste > 0 ? (
                        <span className="text-[12px] font-bold text-amber-700">{fmtEur(row.reste)}</span>
                      ) : row.facture > 0 ? (
                        <span className="text-[11px] text-emerald-600 font-semibold">Soldé</span>
                      ) : (
                        <span className="text-[12px] text-gray-300">—</span>
                      )}
                    </td>

                    {/* Progression */}
                    <td className="px-4 py-3.5">
                      <ProgressBar paye={row.paye + row.lot.totaux.acompte} facture={row.facture} />
                    </td>

                    {/* Documents */}
                    <td className="px-4 py-3.5 text-center">
                      {docCount > 0 ? (
                        <button
                          onClick={e => { e.stopPropagation(); setSelected(row); }}
                          className="inline-flex items-center gap-1 text-gray-400 hover:text-indigo-600 transition-colors"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-semibold">{docCount}</span>
                        </button>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>
                  </tr>
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
            {totalDocs > 0 && ` · ${totalDocs} document${totalDocs !== 1 ? 's' : ''}`}
          </p>
          <button onClick={refresh} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
            <RotateCw className="h-3 w-3" />
            Actualiser
          </button>
        </div>
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
