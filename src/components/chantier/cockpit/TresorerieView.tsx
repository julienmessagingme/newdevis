/**
 * TresorerieView — Plan de financement · Projection · Consommation
 *
 * Remplace l'onglet "Trésorerie" dans TresoreriePanel.
 * Données : /api/chantier/[id]/budget  (identiques à BudgetTab)
 * Persistence : localStorage par chantierId (fire-and-forget PATCH metadonnees)
 *
 * 3 sections :
 *  1. Plan de financement — grande jauge colorée + 3 cartes (Apport / Crédit / Aides)
 *  2. Projection trésorerie — graphique SVG multi-courbes par artisan
 *  3. Consommation par source — 3 donuts restants + barres artisans
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Pencil, Check, ChevronDown, ChevronUp, AlertTriangle,
  ExternalLink, Loader2,
} from 'lucide-react';
import {
  fmtEur,
  WORK_TYPES_EFFY, type EffyWorkType, detectBracket,
  MPR_RATES, MPR_CAP, CEE_AMOUNT, type MprBracket,
} from '@/lib/financingUtils';

// ── Supabase ──────────────────────────────────────────────────────────────────

const _sb = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL,
  (import.meta as any).env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

async function freshToken(fallback: string): Promise<string> {
  const { data: { session } } = await _sb.auth.getSession();
  return session?.access_token ?? fallback;
}

// ── Types budget (miroir API /budget) ─────────────────────────────────────────

interface BudgetLotTotaux { devis_recus: number; devis_valides: number; facture: number; paye: number; acompte: number; litige: number; a_payer: number; }
interface BudgetLot       { id: string; nom: string; emoji: string | null; totaux: BudgetLotTotaux; devis: { montant: number | null }[]; factures: { montant: number | null; facture_statut: string | null }[]; }
interface BudgetData      { budget_ia: number; lots: BudgetLot[]; sans_lot: BudgetLot | null; totaux: BudgetLotTotaux; }

// ── Couleurs palette ──────────────────────────────────────────────────────────

const C = {
  apport: { main: '#6366f1', light: '#eef2ff', border: '#c7d2fe', text: '#4338ca', track: '#e0e7ff' },
  credit: { main: '#f97316', light: '#fff7ed', border: '#fed7aa', text: '#c2410c', track: '#ffedd5' },
  aides:  { main: '#10b981', light: '#dcfce7', border: '#a7f3d0', text: '#047857', track: '#d1fae5' },
};

const ARTISAN_PALETTE = ['#6366f1','#f59e0b','#0ea5e9','#ec4899','#14b8a6','#8b5cf6','#f43f5e','#84cc16'];

// ── Source type → catégorie de financement ────────────────────────────────────
const SRC_TO_CAT: Record<string, 'apport' | 'credit' | 'aides'> = {
  apport_personnel: 'apport',
  remboursement:    'apport',
  autre:            'apport',
  deblocage_credit: 'credit',
  eco_ptz:          'credit',
  aide_maprime:     'aides',
  aide_cee:         'aides',
};

// ── Hook consommation réelle par source (payment_events.funding_source_id) ─────
function useEntreeConsumption(chantierId: string, token: string) {
  const [consumed, setConsumed] = useState({ apport: 0, credit: 0, aides: 0, totalLinked: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const t = await freshToken(token);
        const [er, pr] = await Promise.all([
          fetch(`/api/chantier/${chantierId}/entrees`,         { headers: { Authorization: `Bearer ${t}` } }),
          fetch(`/api/chantier/${chantierId}/payment-events`,  { headers: { Authorization: `Bearer ${t}` } }),
        ]);
        if (!er.ok || !pr.ok || cancelled) return;
        const [ed, pd] = await Promise.all([er.json(), pr.json()]);
        const entrees: { id: string; source_type: string }[] = ed.entrees ?? [];
        const events:  { status: string; funding_source_id: string | null; amount: number | null }[] = pd.payment_events ?? [];

        const idToCat: Record<string, 'apport' | 'credit' | 'aides'> = {};
        for (const e of entrees) idToCat[e.id] = SRC_TO_CAT[e.source_type] ?? 'apport';

        const acc = { apport: 0, credit: 0, aides: 0, totalLinked: 0 };
        for (const ev of events) {
          if (ev.status === 'paid' && ev.funding_source_id && idToCat[ev.funding_source_id]) {
            const cat = idToCat[ev.funding_source_id];
            acc[cat]        += ev.amount ?? 0;
            acc.totalLinked += ev.amount ?? 0;
          }
        }
        if (!cancelled) setConsumed(acc);
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, [chantierId, token]);

  return consumed;
}

// ── Hook données budget ───────────────────────────────────────────────────────

function useBudget(chantierId: string, token: string) {
  const [data,    setData]    = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const t   = await freshToken(token);
      const res = await fetch(`/api/chantier/${chantierId}/budget`, { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, [chantierId, token]);
  useEffect(() => { load(); }, [load]);
  return { data, loading };
}

// ── Hook config financement (localStorage + sync serveur) ─────────────────────

interface FinancingConfig {
  budgetReel:    number | null;
  creditMontant: number;
  creditTaux:    number;
  creditDuree:   number;
  maprime:       number; maprimeOn: boolean;
  cee:           number; ceeOn:     boolean;
  ecoptz:        number; ecoptzOn:  boolean; ecoptzDuree: number;
}

function defaultConfig(initial?: Record<string, unknown> | null): FinancingConfig {
  const m  = parseFloat(String((initial as any)?.maprime ?? '0')) || 0;
  const c  = parseFloat(String((initial as any)?.cee     ?? '0')) || 0;
  const e  = parseFloat(String((initial as any)?.eco_ptz ?? '0')) || 0;
  const cr = parseFloat(String((initial as any)?.credit  ?? '0')) || 0;
  const ed = parseFloat(String((initial as any)?.ecoptzDuree ?? '15')) || 15;
  return {
    budgetReel:    null,
    creditMontant: cr,
    creditTaux:    3.5,
    creditDuree:   20,
    maprime: m, maprimeOn: m > 0,
    cee:     c, ceeOn:     c > 0,
    ecoptz:  e, ecoptzOn:  e > 0, ecoptzDuree: ed,
  };
}

function useFinancingConfig(chantierId: string, token: string, initial?: Record<string, unknown> | null) {
  const key = `tresorerie_v3_${chantierId}`;
  const budgetKey = `budget_reel_${chantierId}`;

  const [cfg, setCfgRaw] = useState<FinancingConfig>(() => {
    try {
      const saved = localStorage.getItem(key);
      const br    = localStorage.getItem(budgetKey);
      const base  = saved ? { ...defaultConfig(initial), ...JSON.parse(saved) } : defaultConfig(initial);
      base.budgetReel = br ? parseFloat(br) : base.budgetReel;
      return base;
    } catch { return defaultConfig(initial); }
  });

  const setCfg = useCallback((updater: (prev: FinancingConfig) => FinancingConfig) => {
    setCfgRaw(prev => {
      const next = updater(prev);
      try {
        localStorage.setItem(key, JSON.stringify(next));
        if (next.budgetReel !== null) localStorage.setItem(budgetKey, String(next.budgetReel));
      } catch {}
      return next;
    });
  }, [key, budgetKey]);

  // Sync serveur (fire and forget)
  const syncServer = useCallback(async (next: FinancingConfig) => {
    try {
      const t = await freshToken(token);
      await fetch(`/api/chantier/${chantierId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ metadonnees: { tresoreieFinancing: next } }),
      });
    } catch {}
  }, [chantierId, token]);

  return { cfg, setCfg, syncServer };
}

// ── Hook totaux des entrées par catégorie ────────────────────────────────────

interface EntreesTotaux { credit: number; apport: number; aides: number; loaded: boolean; }

function useEntreesTotaux(chantierId: string, token: string): EntreesTotaux {
  const [totaux, setTotaux] = useState<EntreesTotaux>({ credit: 0, apport: 0, aides: 0, loaded: false });
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const t = await freshToken(token);
        const res = await fetch(`/api/chantier/${chantierId}/entrees`, { headers: { Authorization: `Bearer ${t}` } });
        if (!res.ok || cancelled) return;
        const { entrees } = await res.json() as { entrees: { source_type: string; montant: number; statut: string }[] };
        const acc = { credit: 0, apport: 0, aides: 0 };
        for (const e of entrees) {
          // On compte toutes les entrées (reçues ET attendues) pour le plan prévisionnel
          const cat = SRC_TO_CAT[e.source_type];
          if (cat) acc[cat] += e.montant;
        }
        if (!cancelled) setTotaux({ ...acc, loaded: true });
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, [chantierId, token]);
  return totaux;
}

// ── Bannière de cohérence financement ─────────────────────────────────────────

function CoherenceAlertsBanner({
  entresTotaux, cfg,
  onUpdateCredit,
}: {
  entresTotaux:   EntreesTotaux;
  cfg:            FinancingConfig;
  onUpdateCredit: (val: number) => void;
}) {
  if (!entresTotaux.loaded) return null;

  const totalAides = (cfg.maprimeOn ? cfg.maprime : 0) + (cfg.ceeOn ? cfg.cee : 0) + (cfg.ecoptzOn ? cfg.ecoptz : 0);

  const creditGap  = entresTotaux.credit  - cfg.creditMontant;
  const aidesGap   = entresTotaux.aides   - totalAides;

  const alerts: { key: string; icon: string; title: string; detail: string; action?: { label: string; onClick: () => void } }[] = [];

  // Crédit enregistré > crédit prévu
  if (creditGap > 100) {
    alerts.push({
      key: 'credit',
      icon: '🏦',
      title: `Crédit enregistré (${fmtEur(entresTotaux.credit)}) > crédit prévu (${fmtEur(cfg.creditMontant)})`,
      detail: `Vous avez enregistré ${fmtEur(entresTotaux.credit)} de déblocages crédit mais votre plan prévoit seulement ${fmtEur(cfg.creditMontant)}.`,
      action: { label: `Mettre à jour le plan → ${fmtEur(entresTotaux.credit)}`, onClick: () => onUpdateCredit(entresTotaux.credit) },
    });
  }

  // Aides enregistrées > aides prévues
  if (entresTotaux.aides > 0 && aidesGap > 100) {
    alerts.push({
      key: 'aides',
      icon: '🌿',
      title: `Aides encaissées (${fmtEur(entresTotaux.aides)}) > aides configurées (${fmtEur(totalAides)})`,
      detail: `Les aides que vous avez enregistrées dépassent celles configurées dans le plan de financement.`,
      action: undefined,
    });
  }

  // NB : le dépassement flux certains > budget est géré inline dans FinancementSection
  //      (badge + bouton "Actualiser" directement sur la ligne "Budget de référence")

  if (alerts.length === 0) return null;

  return (
    <div className="mx-5 mb-3 space-y-2">
      {alerts.map(a => (
        <div key={a.key} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <span className="text-[16px] shrink-0 mt-0.5">{a.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-amber-800">{a.title}</p>
            <p className="text-[10px] text-amber-700 mt-0.5 leading-relaxed">{a.detail}</p>
          </div>
          {a.action && (
            <button onClick={a.action.onClick}
              className="shrink-0 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors whitespace-nowrap">
              {a.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── SVG Donut ─────────────────────────────────────────────────────────────────

function DonutRing({ pct, color, track = '#f1f5f9', size = 56, stroke = 5 }: {
  pct: number; color: string; track?: string; size?: number; stroke?: number;
}) {
  const r      = (size - stroke) / 2;
  const circ   = 2 * Math.PI * r;
  const filled = Math.min(Math.max(pct, 0), 100) / 100 * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
         style={{ transform: 'rotate(-90deg)', display: 'block', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={track}  strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.55s ease' }}
      />
    </svg>
  );
}

// ── Section 1 : Plan de financement ──────────────────────────────────────────

function FinancementSection({
  cfg, setCfg, syncServer, budgetRef, data, devisValides, fluxCertains, onUpdateBudget,
}: {
  cfg:             FinancingConfig;
  setCfg:          (u: (p: FinancingConfig) => FinancingConfig) => void;
  syncServer:      (c: FinancingConfig) => void;
  budgetRef:       number;
  data:            BudgetData | null;
  devisValides:    number;
  fluxCertains:    number;
  onUpdateBudget:  (val: number) => void;
}) {
  // Panneaux ouverts
  const [creditOpen, setCreditOpen] = useState(false);
  const [aidesOpen,  setAidesOpen]  = useState(false);

  // Budget réel — inline edit
  const [editingBudget, setEditingBudget] = useState(false);
  const [editBudgetVal, setEditBudgetVal] = useState('');

  // Crédit sliders (état local avant "Appliquer")
  const [slMontant, setSlMontant] = useState(cfg.creditMontant || 0);
  const [slTaux,    setSlTaux]    = useState(cfg.creditTaux);
  const [slDuree,   setSlDuree]   = useState(cfg.creditDuree);
  const hasMountedCredit = useRef(false);
  useEffect(() => {
    if (hasMountedCredit.current) return;
    hasMountedCredit.current = true;
    setSlMontant(cfg.creditMontant);
    setSlTaux(cfg.creditTaux);
    setSlDuree(cfg.creditDuree);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Aides state local
  const [aLocal, setALocal] = useState({
    maprime: cfg.maprime, maprimeOn: cfg.maprimeOn,
    cee:     cfg.cee,     ceeOn:     cfg.ceeOn,
    ecoptz:  cfg.ecoptz,  ecoptzOn:  cfg.ecoptzOn,
    ecoptzDuree: cfg.ecoptzDuree,
  });

  // Eco-PTZ : durée slider (local)
  const [slEcoptzDuree, setSlEcoptzDuree] = useState(cfg.ecoptzDuree);

  // MaPrimeRénov' calculateur inline — utilise MPR_RATES ANAH 2025 + detectBracket
  const [mpTravaux,       setMpTravaux]       = useState<EffyWorkType>('isolation_combles');
  const [mpHouseholdSize, setMpHouseholdSize] = useState(2);
  const [mpIncome,        setMpIncome]        = useState(0);
  const [mpMontant,       setMpMontant]       = useState(0);
  const [mpCalcOpen,      setMpCalcOpen]      = useState(false);

  // CEE calculateur inline — montant forfaitaire par type (CEE_AMOUNT)
  const [ceeTravaux, setCeeTravaux] = useState<EffyWorkType>('isolation_combles');

  // Computed
  const totalAides = (cfg.maprimeOn ? cfg.maprime : 0)
                   + (cfg.ceeOn     ? cfg.cee     : 0)
                   + (cfg.ecoptzOn  ? cfg.ecoptz  : 0);
  const apport      = Math.max(0, budgetRef - cfg.creditMontant - totalAides);
  const totalCouvert = apport + cfg.creditMontant + totalAides;
  const pctApport   = budgetRef > 0 ? Math.round((apport           / budgetRef) * 100) : 0;
  const pctCredit   = budgetRef > 0 ? Math.round((cfg.creditMontant / budgetRef) * 100) : 0;
  const pctAides    = budgetRef > 0 ? Math.round((totalAides        / budgetRef) * 100) : 0;
  const manque      = Math.max(0, budgetRef - totalCouvert);

  // Calc mensualité crédit
  function mensualite(m: number, t: number, d: number) {
    const r = (t / 100) / 12; const n = d * 12;
    if (r === 0 || n === 0) return m / (n || 1);
    return m * r * Math.pow(1+r,n) / (Math.pow(1+r,n)-1);
  }
  const slMens       = Math.round(mensualite(slMontant, slTaux, slDuree));
  const slCout       = Math.round(slMens * slDuree * 12 - slMontant);
  const slIntercalaire = Math.round(slMontant * (slTaux / 100) / 12);
  const curIntercalaire = Math.round(cfg.creditMontant * (cfg.creditTaux / 100) / 12);

  // Conflit : budget choisi par le client < total devis validés
  const conflict     = cfg.budgetReel !== null && devisValides > 0 && devisValides > (cfg.budgetReel ?? 0) * 1.01;
  const conflictDiff = conflict ? Math.round(devisValides - (cfg.budgetReel ?? 0)) : 0;

  // Dépassement flux certains (décaissé + à payer > budget de référence)
  const fluxGap           = budgetRef > 0 ? fluxCertains - budgetRef : 0;
  const fluxOverBudget    = fluxGap > 100;
  const fluxRounded       = Math.ceil(fluxCertains / 100) * 100; // arrondi au 100€ supérieur

  function adjustToDevis() {
    setCfg(p => { const n = { ...p, budgetReel: devisValides }; syncServer(n); return n; });
  }

  // PEE eligible : vérifie si des lots contiennent des mots clés rénovation
  const peeLots = useMemo(() => {
    if (!data) return [];
    const kw = ['rénov','renov','isolation','fenêtre','fenetre','porte','menuiserie','chauffage','plomberie','électr','electr','extension','comble'];
    return data.lots.filter(l => kw.some(k => l.nom.toLowerCase().includes(k))).map(l => l.nom);
  }, [data]);

  function applyBudgetEdit() {
    const v = parseFloat(editBudgetVal.replace(/\s/g,'').replace(',','.'));
    if (!isNaN(v) && v > 0) {
      setCfg(p => { const n = { ...p, budgetReel: v }; syncServer(n); return n; });
    }
    setEditingBudget(false);
  }

  function applyCredit() {
    setCfg(p => {
      const n = { ...p, creditMontant: slMontant, creditTaux: slTaux, creditDuree: slDuree };
      syncServer(n);
      return n;
    });
    setCreditOpen(false);
  }

  function applyAides() {
    const ecoptzDureeVal = slEcoptzDuree;
    setCfg(p => {
      const n = {
        ...p,
        maprime: aLocal.maprime, maprimeOn: aLocal.maprimeOn,
        cee:     aLocal.cee,     ceeOn:     aLocal.ceeOn,
        ecoptz:  aLocal.ecoptz,  ecoptzOn:  aLocal.ecoptzOn,
        ecoptzDuree: ecoptzDureeVal,
      };
      syncServer(n);
      return n;
    });
    setAidesOpen(false);
  }

  const segStyle = (pct: number, color: string): React.CSSProperties => ({
    width:  `${pct}%`, minWidth: pct > 0 ? 2 : 0,
    background: color, transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', cursor: 'pointer',
  });

  return (
    <div className="border-b border-gray-100">
      {/* ── En-tête section ── */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center text-[13px]">💰</span>
          <div>
            <p className="text-[13px] font-black text-gray-900">Plan de financement</p>
            <p className="text-[10px] text-gray-400">Comment financez-vous vos travaux ?</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">Budget de référence :</span>
          {editingBudget ? (
            <div className="flex items-center gap-1">
              <input autoFocus type="number" inputMode="decimal" value={editBudgetVal} onChange={e => setEditBudgetVal(e.target.value)}
                onBlur={applyBudgetEdit} onKeyDown={e => { if (e.key==='Enter') applyBudgetEdit(); if (e.key==='Escape') setEditingBudget(false); }}
                className="w-24 text-[12px] font-black border-b-2 border-indigo-400 outline-none bg-transparent text-gray-800 text-right pb-0.5"
                placeholder="45000" />
              <span className="text-[11px] text-gray-400">€</span>
            </div>
          ) : (
            <button onClick={() => { setEditBudgetVal(String(Math.round(budgetRef))); setEditingBudget(true); }}
              className="group flex items-center gap-1 hover:opacity-70 transition-opacity">
              <span className="text-[13px] font-black text-gray-800">{fmtEur(budgetRef)}</span>
              <Pencil className="h-3 w-3 text-gray-300 group-hover:text-indigo-400 transition-colors" />
            </button>
          )}
          {fluxOverBudget ? (
            /* ── Alerte dépassement flux certains ── */
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-300">
                ⚠ Flux certains +{fmtEur(fluxGap)}
              </span>
              <button
                onClick={() => onUpdateBudget(fluxRounded)}
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors whitespace-nowrap"
              >
                Actualiser à {fmtEur(fluxRounded)} ?
              </button>
            </div>
          ) : (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${manque > 0 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
              {manque > 0 ? `⚠ Manque ${fmtEur(manque)}` : '✓ Couvert'}
            </span>
          )}
        </div>
      </div>

      {/* ── Bannière conflit ── */}
      {conflict && (
        <div className="mx-5 mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-amber-800">
              Budget en dépassement de {fmtEur(conflictDiff)}
            </p>
            <p className="text-[10px] text-amber-700 mt-0.5 leading-relaxed">
              Les devis validés totalisent <strong>{fmtEur(devisValides)}</strong>, soit {fmtEur(conflictDiff)} de plus
              que votre budget de <strong>{fmtEur(cfg.budgetReel ?? 0)}</strong>.
              Souhaitez-vous ajuster votre budget ou revoir les devis ?
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={adjustToDevis}
              className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors whitespace-nowrap"
            >
              Ajuster à {fmtEur(devisValides)}
            </button>
            <button
              onClick={() => setEditingBudget(true)}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap"
            >
              Modifier le budget
            </button>
          </div>
        </div>
      )}

      {/* ── Gauge principale ── */}
      <div className="px-5 pb-3">
        <div style={{ height: 38, borderRadius: 10, overflow: 'hidden', display: 'flex', background: '#f1f5f9' }}>
          <div style={segStyle(pctApport, 'linear-gradient(135deg,#818cf8,#4f46e5)')} title="Apport personnel">
            {pctApport > 8 && <span style={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>{pctApport}%</span>}
          </div>
          <div style={segStyle(pctCredit, 'linear-gradient(135deg,#fb923c,#ea580c)')} title="Crédit">
            {pctCredit > 8 && <span style={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>{pctCredit}%</span>}
          </div>
          <div style={segStyle(pctAides, 'linear-gradient(135deg,#34d399,#059669)')} title="Aides">
            {pctAides > 8 && <span style={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>{pctAides}%</span>}
          </div>
          {manque > 0 && <div style={{ ...segStyle(Math.round((manque/budgetRef)*100), '#e2e8f0'), cursor: 'default' }} />}
        </div>
        <div className="flex items-center gap-5 mt-2 flex-wrap">
          {[
            { color: C.apport.main, label: 'Apport', val: apport },
            { color: C.credit.main, label: 'Crédit', val: cfg.creditMontant },
            { color: C.aides.main,  label: 'Aides',  val: totalAides },
          ].map(({ color, label, val }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span className="text-[11px] text-gray-500">{label}</span>
              <span className="text-[11px] font-black" style={{ color }}>{fmtEur(val)}</span>
            </div>
          ))}
          <div className="flex-1" />
          <span className="text-[11px] text-gray-400">Total : <strong className="text-gray-800">{fmtEur(totalCouvert)}</strong> / {fmtEur(budgetRef)}</span>
        </div>
      </div>

      {/* ── 3 cartes sources ── */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100">

        {/* — APPORT PERSONNEL — */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[16px]">🏦</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Apport personnel</span>
          </div>
          <p className="text-[18px] font-black leading-none" style={{ color: C.apport.text }}>{fmtEur(apport)}</p>

          {/* PEE */}
          {peeLots.length > 0 && (
            <div className="mt-3 rounded-lg p-3 text-[11px] leading-relaxed"
                 style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' }}>
              <strong>💡 Déblocage PEE possible</strong>
              <br />Vos lots ({peeLots.slice(0,2).join(' · ')}{peeLots.length > 2 ? ` +${peeLots.length-2}` : ''}) sont éligibles au déblocage anticipé de votre Plan d'Épargne Entreprise pour travaux sur la résidence principale.
              <br />
              <a href="https://www.service-public.fr/particuliers/vosdroits/F31622" target="_blank" rel="noopener noreferrer"
                 className="font-bold inline-flex items-center gap-1 mt-1" style={{ color: '#2563eb' }}>
                → Motifs officiels déblocage PEE <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          )}

          {/* Intérêts intercalaires — affiché seulement si taux > 0% */}
          {cfg.creditMontant > 0 && curIntercalaire > 0 && (
            <div className="mt-2 rounded-lg p-3 text-[11px] leading-relaxed"
                 style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#14532d' }}>
              <strong>📐 Économisez les intérêts intercalaires</strong>
              <br />Utilisez votre apport <em>en premier</em> : chaque mois où vous ne débloquez pas votre crédit, vous économisez <strong>{fmtEur(curIntercalaire)}</strong>.
              <br /><span style={{ fontSize: 10, opacity: 0.8 }}>Un intérêt intercalaire = ce que vous payez à la banque sur la somme débloquée avant le début des mensualités.</span>
            </div>
          )}
        </div>

        {/* — CRÉDIT BANQUE — */}
        <div className="p-4" style={{ background: creditOpen ? C.credit.light : undefined }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[16px]">🏛️</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Crédit travaux</span>
            </div>
            <button onClick={() => setCreditOpen(v => !v)}
              className="text-[10px] font-semibold flex items-center gap-1 transition-colors"
              style={{ color: C.credit.text }}>
              {creditOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {creditOpen ? 'Masquer' : 'Configurer'}
            </button>
          </div>
          <p className="text-[18px] font-black leading-none" style={{ color: C.credit.text }}>{fmtEur(cfg.creditMontant)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {cfg.creditMontant > 0 ? `${cfg.creditTaux}% · ${cfg.creditDuree} ans · ${Math.round(mensualite(cfg.creditMontant, cfg.creditTaux, cfg.creditDuree))} €/mois` : 'Non configuré'}
          </p>

          {creditOpen && (
            <div className="mt-3 space-y-3">
              {([
                { label: 'Montant', id: 'montant', min: 0, max: 100000, step: 500,  val: slMontant, set: setSlMontant, fmt: (v: number) => fmtEur(v) },
                { label: 'Taux annuel', id: 'taux', min: 0.5, max: 8, step: 0.1, val: slTaux, set: setSlTaux, fmt: (v: number) => v.toFixed(1) + ' %' },
                { label: 'Durée', id: 'duree', min: 5, max: 25, step: 1, val: slDuree, set: setSlDuree, fmt: (v: number) => v + ' ans' },
              ] as const).map(sl => (
                <div key={sl.id}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-gray-500 font-semibold">{sl.label}</span>
                    <span className="font-black" style={{ color: C.credit.text }}>{sl.fmt(sl.val as any)}</span>
                  </div>
                  <input type="range" min={sl.min} max={sl.max} step={sl.step} value={sl.val as any}
                    onChange={e => (sl.set as any)(parseFloat(e.target.value))}
                    className="w-full h-1 rounded cursor-pointer"
                    style={{ accentColor: C.credit.main }} />
                </div>
              ))}
              <div className="rounded-lg p-2.5 space-y-1.5" style={{ background: C.credit.track }}>
                {[
                  ['Mensualité', `${slMens} €/mois`],
                  ['Coût total crédit', fmtEur(slCout)],
                  ['Intérêts intercalaires / mois', `${slIntercalaire} €`],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-[11px]">
                    <span className="text-gray-500">{l}</span>
                    <span className="font-black" style={{ color: C.credit.text }}>{v}</span>
                  </div>
                ))}
              </div>
              <button onClick={applyCredit}
                className="w-full py-2 rounded-lg text-[11px] font-bold text-white transition-colors"
                style={{ background: C.credit.main }}>
                ✓ Appliquer ce montant
              </button>
            </div>
          )}
        </div>

        {/* — AIDES — */}
        <div className="p-4" style={{ background: aidesOpen ? C.aides.light : undefined }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[16px]">🌿</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Aides & subventions</span>
            </div>
            <button onClick={() => setAidesOpen(v => !v)}
              className="text-[10px] font-semibold flex items-center gap-1"
              style={{ color: C.aides.text }}>
              {aidesOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {aidesOpen ? 'Masquer' : 'Voir aides'}
            </button>
          </div>
          <p className="text-[18px] font-black leading-none" style={{ color: C.aides.text }}>{fmtEur(totalAides)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {totalAides > 0
              ? [cfg.maprimeOn && "MaPrimeRénov'", cfg.ceeOn && 'CEE', cfg.ecoptzOn && `Éco-PTZ ${cfg.ecoptzDuree} ans`].filter(Boolean).join(' + ')
              : 'Aucune aide saisie'}
          </p>

          {aidesOpen && (
            <div className="mt-3 space-y-3">

              {/* ── MaPrimeRénov' ── */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <label className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="checkbox" checked={aLocal.maprimeOn}
                    onChange={e => { setALocal(p => ({ ...p, maprimeOn: e.target.checked })); setMpCalcOpen(e.target.checked); }}
                    style={{ accentColor: C.aides.main, width: 14, height: 14, cursor: 'pointer' }} />
                  <span className="text-[11px] font-bold text-gray-800 flex-1">MaPrimeRénov'</span>
                  <span className="text-[11px] font-black" style={{ color: C.aides.text }}>{aLocal.maprime ? `${fmtEur(aLocal.maprime)}` : '—'}</span>
                  <button onClick={() => setMpCalcOpen(v => !v)}
                    className="text-[10px] px-2 py-0.5 rounded-full border transition-colors ml-1"
                    style={{ borderColor: C.aides.border, color: C.aides.text, background: mpCalcOpen ? C.aides.light : 'transparent' }}>
                    Calculer
                  </button>
                </label>
                {mpCalcOpen && (
                  <div className="px-3 pb-3 border-t border-gray-50 pt-3 space-y-2.5">
                    {/* Type de travaux */}
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 mb-1.5">Type de travaux</p>
                      <select value={mpTravaux} onChange={e => setMpTravaux(e.target.value as EffyWorkType)}
                        className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-emerald-400 bg-white">
                        {WORK_TYPES_EFFY.filter(wt => MPR_RATES[wt.key]['tres_modestes'] > 0).map(wt => (
                          <option key={wt.key} value={wt.key}>{wt.emoji} {wt.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Foyer fiscal */}
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 mb-1.5">Personnes dans le foyer fiscal</p>
                      <div className="flex gap-1">
                        {([1, 2, 3, 4, 5] as const).map(n => (
                          <button key={n} type="button" onClick={() => setMpHouseholdSize(n)}
                            className="flex-1 py-1.5 rounded-lg border text-[11px] font-bold transition-colors"
                            style={{
                              borderColor: mpHouseholdSize === n ? C.aides.main : '#e5e7eb',
                              background:  mpHouseholdSize === n ? C.aides.light : 'white',
                              color:       mpHouseholdSize === n ? C.aides.text : '#6b7280',
                            }}>
                            {n === 5 ? '5+' : n}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Revenu fiscal de référence */}
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 mb-1">Revenu fiscal de référence (€/an)</p>
                      <input type="number" inputMode="decimal" value={mpIncome || ''} placeholder="Ex: 32 000"
                        onChange={e => setMpIncome(parseFloat(e.target.value) || 0)}
                        className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-emerald-400" />
                      {mpIncome > 0 && (() => {
                        const br = detectBracket(mpHouseholdSize, mpIncome);
                        const labels: Record<string, string> = {
                          tres_modestes: 'Très modestes', modestes: 'Modestes',
                          intermediaires: 'Intermédiaires', superieurs: 'Supérieurs',
                        };
                        return <p className="text-[10px] text-gray-400 mt-0.5">Tranche détectée : <strong style={{ color: C.aides.text }}>{labels[br]}</strong></p>;
                      })()}
                    </div>
                    {/* Montant travaux */}
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 mb-1">Montant travaux HT (€)</p>
                      <input type="number" inputMode="decimal" value={mpMontant || ''} placeholder="Ex: 15 000"
                        onChange={e => setMpMontant(parseFloat(e.target.value) || 0)}
                        className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-emerald-400" />
                    </div>
                    {/* Résultat */}
                    {mpMontant > 0 && mpIncome > 0 && (() => {
                      const bracket = detectBracket(mpHouseholdSize, mpIncome);
                      const rate    = MPR_RATES[mpTravaux][bracket];
                      const est     = rate > 0 ? Math.min(Math.round(mpMontant * rate), MPR_CAP[mpTravaux]) : 0;
                      if (rate === 0) return (
                        <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                          Ces travaux ne sont pas éligibles à MaPrimeRénov' pour cette tranche de revenus.
                        </p>
                      );
                      return (
                        <div className="rounded-lg px-3 py-2.5 flex items-center justify-between"
                             style={{ background: C.aides.light, border: `1px solid ${C.aides.border}` }}>
                          <div>
                            <p className="text-[10px] text-gray-500">
                              {Math.round(rate * 100)} % · plafonné à {fmtEur(MPR_CAP[mpTravaux])}
                            </p>
                            <p className="text-[14px] font-black" style={{ color: C.aides.text }}>{fmtEur(est)}</p>
                          </div>
                          <button onClick={() => setALocal(p => ({ ...p, maprime: est, maprimeOn: true }))}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg text-white transition-colors"
                            style={{ background: C.aides.main }}>
                            Utiliser
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* ── CEE ── */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <label className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="checkbox" checked={aLocal.ceeOn}
                    onChange={e => setALocal(p => ({ ...p, ceeOn: e.target.checked }))}
                    style={{ accentColor: C.aides.main, width: 14, height: 14, cursor: 'pointer' }} />
                  <span className="text-[11px] font-bold text-gray-800 flex-1">CEE (Certificats d'Économies d'Énergie)</span>
                  <span className="text-[11px] font-black" style={{ color: C.aides.text }}>{aLocal.cee ? fmtEur(aLocal.cee) : '—'}</span>
                </label>
                {aLocal.ceeOn && (
                  <div className="px-3 pb-3 border-t border-gray-50 pt-3 space-y-2.5">
                    <div>
                      <p className="text-[10px] font-semibold text-gray-500 mb-1.5">Type de travaux</p>
                      <select value={ceeTravaux} onChange={e => setCeeTravaux(e.target.value as EffyWorkType)}
                        className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-emerald-400 bg-white">
                        {WORK_TYPES_EFFY.filter(wt => CEE_AMOUNT[wt.key] > 0).map(wt => (
                          <option key={wt.key} value={wt.key}>{wt.emoji} {wt.label}</option>
                        ))}
                      </select>
                    </div>
                    {(() => {
                      const est = CEE_AMOUNT[ceeTravaux];
                      return (
                        <div className="rounded-lg px-3 py-2.5 flex items-center justify-between"
                             style={{ background: C.aides.light, border: `1px solid ${C.aides.border}` }}>
                          <div>
                            <p className="text-[10px] text-gray-500">Prime versée par les fournisseurs d'énergie</p>
                            <p className="text-[14px] font-black" style={{ color: C.aides.text }}>{fmtEur(est)}</p>
                          </div>
                          <button onClick={() => setALocal(p => ({ ...p, cee: est, ceeOn: true }))}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg text-white transition-colors"
                            style={{ background: C.aides.main }}>
                            Utiliser
                          </button>
                        </div>
                      );
                    })()}
                    <p className="text-[9px] text-gray-400">Montant indicatif — cumulable avec MaPrimeRénov'</p>
                  </div>
                )}
              </div>

              {/* ── Éco-PTZ ── */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <label className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="checkbox" checked={aLocal.ecoptzOn}
                    onChange={e => setALocal(p => ({ ...p, ecoptzOn: e.target.checked }))}
                    style={{ accentColor: C.aides.main, width: 14, height: 14, cursor: 'pointer' }} />
                  <span className="text-[11px] font-bold text-gray-800 flex-1">Éco-PTZ <span className="font-normal text-gray-400">(prêt à 0 %)</span></span>
                  <span className="text-[11px] font-black" style={{ color: C.aides.text }}>{aLocal.ecoptz ? fmtEur(aLocal.ecoptz) : '—'}</span>
                </label>
                {aLocal.ecoptzOn && (
                  <div className="px-3 pb-3 border-t border-gray-50 pt-3 space-y-2.5">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-gray-500 font-semibold">Montant emprunté</span>
                        <span className="font-black" style={{ color: C.aides.text }}>{fmtEur(aLocal.ecoptz)}</span>
                      </div>
                      <input type="range" min={0} max={50000} step={500} value={aLocal.ecoptz}
                        onChange={e => setALocal(p => ({ ...p, ecoptz: parseFloat(e.target.value) }))}
                        className="w-full h-1 rounded cursor-pointer" style={{ accentColor: C.aides.main }} />
                      <div className="flex justify-between text-[9px] text-gray-400 mt-0.5"><span>0 €</span><span>50 000 € max</span></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-gray-500 font-semibold">Durée de remboursement</span>
                        <span className="font-black" style={{ color: C.aides.text }}>{slEcoptzDuree} ans</span>
                      </div>
                      <input type="range" min={5} max={20} step={1} value={slEcoptzDuree}
                        onChange={e => setSlEcoptzDuree(parseInt(e.target.value))}
                        className="w-full h-1 rounded cursor-pointer" style={{ accentColor: C.aides.main }} />
                      <div className="flex justify-between text-[9px] text-gray-400 mt-0.5"><span>5 ans</span><span>20 ans</span></div>
                    </div>
                    {aLocal.ecoptz > 0 && (
                      <div className="rounded-lg px-3 py-2 flex items-center justify-between"
                           style={{ background: C.aides.light, border: `1px solid ${C.aides.border}` }}>
                        <div>
                          <p className="text-[10px] text-gray-500">Mensualité à 0 %</p>
                          <p className="text-[14px] font-black" style={{ color: C.aides.text }}>
                            {Math.round(aLocal.ecoptz / (slEcoptzDuree * 12))} €/mois
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-gray-400">Coût total du crédit</p>
                          <p className="text-[11px] font-bold text-emerald-600">0 € d'intérêts</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button onClick={applyAides}
                className="w-full py-2 rounded-lg text-[11px] font-bold text-white transition-colors"
                style={{ background: C.aides.main }}>
                ✓ Appliquer ces aides
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ── Carte Éco-PTZ crédit (si activé) ── */}
      {cfg.ecoptzOn && cfg.ecoptz > 0 && (
        <div className="border-t border-gray-100 px-4 py-3.5"
             style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' }}>
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl flex items-center justify-center text-[16px] shrink-0"
                  style={{ background: '#bbf7d0' }}>🌱</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[12px] font-black" style={{ color: C.aides.text }}>Éco-PTZ — Crédit à taux zéro</p>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: C.aides.border, color: C.aides.text }}>0 %</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {fmtEur(cfg.ecoptz)} sur {cfg.ecoptzDuree} ans ·{' '}
                <strong style={{ color: C.aides.text }}>
                  {Math.round(cfg.ecoptz / (cfg.ecoptzDuree * 12))} €/mois
                </strong>{' '}
                · 0 € d'intérêts
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[18px] font-black leading-none" style={{ color: C.aides.text }}>{fmtEur(cfg.ecoptz)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">montant du prêt</p>
            </div>
          </div>
          <div className="mt-2.5 h-1.5 rounded-full overflow-hidden" style={{ background: '#bbf7d0' }}>
            <div className="h-full rounded-full transition-all" style={{ background: C.aides.main, width: '15%' }} />
          </div>
          <p className="text-[9px] text-gray-400 mt-1">
            Déblocage progressif au fil des travaux · Remboursement démarrant à la livraison
          </p>
        </div>
      )}
    </div>
  );
}

// ── Section 3 : Consommation par source ──────────────────────────────────────

function ConsommationSection({
  lots, cfg, totalAides, chantierId, token,
}: {
  lots:       BudgetLot[];
  cfg:        FinancingConfig;
  totalAides: number;
  chantierId: string;
  token:      string;
}) {
  const realConsumed = useEntreeConsumption(chantierId, token);
  const totalCredit  = cfg.creditMontant;
  const budgetRef    = cfg.budgetReel ?? 0;
  const totalPaye    = lots.reduce((s, l) => s + l.totaux.paye + l.totaux.acompte, 0);

  // Répartition paiements par source.
  // Si des paiements ont un funding_source_id (données réelles) → utiliser ces données.
  // Pour les paiements non liés, appliquer l'heuristique sur le reste.
  let payeApport: number;
  let payeCredit: number;
  let payeAides:  number;

  if (realConsumed.totalLinked > 0) {
    // Données réelles pour les paiements liés à une entrée
    payeApport = realConsumed.apport;
    payeCredit = realConsumed.credit;
    payeAides  = realConsumed.aides;
    // Paiements non liés → heuristique sur le solde résiduel
    const unlinked = Math.max(0, totalPaye - realConsumed.totalLinked);
    if (unlinked > 0) {
      const apportPool = Math.max(0, (budgetRef - totalCredit - totalAides) - payeApport);
      const addApport  = Math.min(unlinked, apportPool);
      const addCredit  = Math.min(Math.max(0, unlinked - addApport), Math.max(0, totalCredit - payeCredit));
      const addAides   = Math.min(Math.max(0, unlinked - addApport - addCredit), Math.max(0, totalAides - payeAides));
      payeApport += addApport;
      payeCredit += addCredit;
      payeAides  += addAides;
    }
  } else {
    // Aucune donnée réelle → heuristique pure (comportement d'origine)
    payeApport = Math.min(totalPaye, Math.max(0, budgetRef - totalCredit - totalAides));
    payeCredit = Math.min(Math.max(0, totalPaye - payeApport), totalCredit);
    payeAides  = Math.min(Math.max(0, totalPaye - payeApport - payeCredit), totalAides);
  }

  const sources = [
    { label: 'Apport restant', color: C.apport.main, track: C.apport.track, text: C.apport.text, total: Math.max(0, budgetRef - totalCredit - totalAides), paye: payeApport },
    { label: 'Crédit restant', color: C.credit.main, track: C.credit.track, text: C.credit.text, total: totalCredit, paye: payeCredit },
    { label: 'Aides restantes', color: C.aides.main, track: C.aides.track, text: C.aides.text,  total: totalAides,  paye: payeAides },
  ];

  const activeLots = lots.filter(l => l.totaux.paye + l.totaux.acompte > 0);

  return (
    <div>
      <div className="flex items-center gap-2 px-5 py-4">
        <span className="w-7 h-7 bg-green-50 rounded-lg flex items-center justify-center text-[13px]">🎯</span>
        <div>
          <p className="text-[13px] font-black text-gray-900">Consommation du budget par source</p>
          <p className="text-[10px] text-gray-400">Ce qui reste disponible sur chaque poste de financement</p>
        </div>
      </div>

      {/* 3 donuts restants */}
      <div className="grid grid-cols-3 gap-3 px-5 pb-4">
        {sources.map(({ label, color, track, text, total, paye }) => {
          const restant = Math.max(0, total - paye);
          const pct     = total > 0 ? Math.round((restant / total) * 100) : 0;
          return (
            <div key={label} className="border border-gray-100 rounded-xl p-4 text-center" style={{ background: '#f8fafc' }}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">{label}</p>
              <div className="relative w-14 h-14 mx-auto mb-2">
                <DonutRing pct={pct} color={color} track={track} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[11px] font-black" style={{ color: text }}>{pct}%</span>
                </div>
              </div>
              <p className="text-[15px] font-black" style={{ color: text }}>{fmtEur(restant)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">sur {fmtEur(total)} · {fmtEur(paye)} utilisé</p>
            </div>
          );
        })}
      </div>

      {/* Détail par artisan — accordéon */}
      {activeLots.length > 0 && <ArtisanPaymentDetail activeLots={activeLots} budgetRef={budgetRef} totalCredit={totalCredit} totalAides={totalAides} />}
    </div>
  );
}

function ArtisanPaymentDetail({ activeLots, budgetRef, totalCredit, totalAides }: {
  activeLots: BudgetLot[];
  budgetRef: number;
  totalCredit: number;
  totalAides: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-gray-100">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
      >
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Paiements effectués par artisan</p>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5">
          {activeLots.map((lot, idx) => {
          const paye    = lot.totaux.paye + lot.totaux.acompte;
          const total   = Math.max(lot.totaux.devis_valides, lot.totaux.facture, paye);
          const pct     = total > 0 ? Math.min(Math.round((paye / total) * 100), 100) : 0;
          const color   = ARTISAN_PALETTE[idx % ARTISAN_PALETTE.length];
          const maxApport = Math.max(0, budgetRef - totalCredit - totalAides);
          const fromApport = Math.min(paye, maxApport);
          const fromCredit = Math.min(Math.max(0, paye - fromApport), totalCredit);
          const fromAides  = Math.min(Math.max(0, paye - fromApport - fromCredit), totalAides);
          const pApport    = paye > 0 ? Math.round((fromApport / paye) * 100) : 0;
          const pCredit    = paye > 0 ? Math.round((fromCredit / paye) * 100) : 0;
          const pAides     = paye > 0 ? Math.round((fromAides  / paye) * 100) : 0;
          return (
            <div key={lot.id} className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span className="text-[12px] font-bold text-gray-700">{lot.emoji ?? ''} {lot.nom}</span>
                </div>
                <span className="text-[11px] text-gray-400">{fmtEur(paye)} / {fmtEur(total)}</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: '#f1f5f9' }}>
                <div style={{ width: `${pct * pApport / 100}%`, background: C.apport.main, transition: 'width 0.5s ease' }} />
                <div style={{ width: `${pct * pCredit / 100}%`, background: C.credit.main, transition: 'width 0.5s ease' }} />
                <div style={{ width: `${pct * pAides  / 100}%`, background: C.aides.main,  transition: 'width 0.5s ease' }} />
              </div>
              <div className="flex gap-4 mt-1.5">
                {fromApport > 0 && <span className="text-[10px] text-gray-400 flex items-center gap-1"><span style={{ display:'inline-block', width:6, height:6, borderRadius:1.5, background:C.apport.main }}></span>Apport : {fmtEur(fromApport)}</span>}
                {fromCredit > 0 && <span className="text-[10px] text-gray-400 flex items-center gap-1"><span style={{ display:'inline-block', width:6, height:6, borderRadius:1.5, background:C.credit.main }}></span>Crédit : {fmtEur(fromCredit)}</span>}
                {fromAides  > 0 && <span className="text-[10px] text-gray-400 flex items-center gap-1"><span style={{ display:'inline-block', width:6, height:6, borderRadius:1.5, background:C.aides.main }}></span>Aides : {fmtEur(fromAides)}</span>}
                {paye === 0    && <span className="text-[10px] text-gray-300">Aucun paiement effectué</span>}
              </div>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export interface TresorerieViewProps {
  chantierId:         string;
  token:              string;
  rangeMin?:          number;
  rangeMax?:          number;
  initialFinancing?:  Record<string, unknown> | null;
}

export default function TresorerieView({
  chantierId, token, rangeMin, rangeMax, initialFinancing,
}: TresorerieViewProps) {
  const { data, loading }           = useBudget(chantierId, token);
  const { cfg, setCfg, syncServer } = useFinancingConfig(chantierId, token, initialFinancing);
  const entresTotaux                = useEntreesTotaux(chantierId, token);

  const lots = useMemo(() => [
    ...(data?.lots ?? []),
    ...(data?.sans_lot ? [data.sans_lot] : []),
  ], [data]);

  const devisValides = data?.totaux.devis_valides ?? 0;

  // Auto-init : pré-remplit budgetReel avec le total des devis validés au premier chargement
  useEffect(() => {
    if (cfg.budgetReel !== null || devisValides <= 0) return;
    setCfg(p => ({ ...p, budgetReel: devisValides }));
  }, [devisValides]); // eslint-disable-line react-hooks/exhaustive-deps

  // Budget de référence : budgetReel > devisValides > rangeMax > rangeMin > budget_ia
  const budgetRef = cfg.budgetReel
    ?? (devisValides > 0 ? devisValides : null)
    ?? rangeMax
    ?? rangeMin
    ?? (data?.budget_ia ?? 0);

  const totalAides = (cfg.maprimeOn ? cfg.maprime : 0)
    + (cfg.ceeOn ? cfg.cee : 0)
    + (cfg.ecoptzOn ? cfg.ecoptz : 0)
    + (cfg.tvaOn ? cfg.tva : 0);

  // ── Handlers cohérence ─────────────────────────────────────────────────────
  function handleUpdateCreditFromEntrees(val: number) {
    setCfg(p => { const n = { ...p, creditMontant: val }; syncServer(n); return n; });
  }
  function handleUpdateBudgetFromFlux(val: number) {
    setCfg(p => { const n = { ...p, budgetReel: Math.ceil(val / 100) * 100 }; syncServer(n); return n; });
  }

  return (
    <div className="flex flex-col bg-white">
      {/* Bannière de cohérence (entrées réelles vs plan — crédit + aides) */}
      <CoherenceAlertsBanner
        entresTotaux={entresTotaux}
        cfg={cfg}
        onUpdateCredit={handleUpdateCreditFromEntrees}
      />

      {/* Section 1 — Financement */}
      <FinancementSection
        cfg={cfg}
        setCfg={setCfg}
        syncServer={syncServer}
        budgetRef={budgetRef}
        data={data}
        devisValides={devisValides}
        fluxCertains={(data?.totaux.paye ?? 0) + (data?.totaux.acompte ?? 0) + (data?.totaux.a_payer ?? 0)}
        onUpdateBudget={handleUpdateBudgetFromFlux}
      />

      {/* Section 3 — Consommation */}
      <ConsommationSection lots={lots} cfg={cfg} totalAides={totalAides} chantierId={chantierId} token={token} />
    </div>
  );
}
