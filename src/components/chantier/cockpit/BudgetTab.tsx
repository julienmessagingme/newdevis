/**
 * BudgetTab — Onglet Budget du module Budget & Trésorerie.
 *
 * Affiche :
 *   1. Synthèse financière (4 KPIs + jauge + statut)
 *   2. Budget par intervenant (lots + devis scorés + factures avec termes)
 *   3. Plan de financement
 *   4. Conseils proactifs
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  AlertTriangle, CheckCircle2, Clock, Info, ChevronRight,
  TrendingUp, Zap, ExternalLink, RotateCw, Loader2,
  ChevronDown, ChevronUp, Pencil, Check,
} from 'lucide-react';
import { fmtEur } from '@/lib/financingUtils';

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

interface BudgetDevis {
  id: string;
  nom: string;
  montant: number | null;
  devis_statut: string | null;
  analyse_id: string | null;
  analyse_status: string | null;
  analyse_score: number | null;
  analyse_signal: string | null;
  signed_url: string | null;
  created_at: string;
}

interface BudgetFacture {
  id: string;
  nom: string;
  montant: number | null;
  montant_paye: number | null;
  facture_statut: string | null;
  payment_terms: {
    type_facture: string;
    pct: number;
    delai_jours: number;
    numero_facture: string | null;
  } | null;
  signed_url: string | null;
  created_at: string;
}

interface BudgetLot {
  id: string;
  nom: string;
  emoji: string | null;
  devis: BudgetDevis[];
  factures: BudgetFacture[];
  totaux: {
    devis_recus: number;
    devis_valides: number;
    facture: number;
    paye: number;
  };
}

interface Conseil {
  type: string;
  urgency: 'info' | 'warning' | 'action';
  titre: string;
  detail: string;
}

interface BudgetData {
  budget_ia: number;
  financement: { apport: number; credit: number; maprime: number; cee: number; eco_ptz: number };
  lots: BudgetLot[];
  sans_lot: BudgetLot | null;
  totaux: { devis_recus: number; devis_valides: number; facture: number; paye: number };
  conseils: Conseil[];
  type_projet: string;
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
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [chantierId, token]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refresh: load };
}

// ── Helpers d'affichage ───────────────────────────────────────────────────────

const signalConfig = {
  vert:   { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Devis coherent' },
  orange: { dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 border-amber-100',       label: 'A surveiller' },
  rouge:  { dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700 border-red-100',             label: 'Risque detecte' },
};

const devisStatutConfig: Record<string, { label: string; cls: string }> = {
  en_cours:        { label: 'Recu',           cls: 'bg-gray-100 text-gray-600' },
  a_relancer:      { label: 'A relancer',     cls: 'bg-amber-100 text-amber-700' },
  valide:          { label: 'Valide',         cls: 'bg-emerald-100 text-emerald-700' },
  attente_facture: { label: 'Att. facture',   cls: 'bg-blue-100 text-blue-700' },
};

const factureStatutConfig: Record<string, { label: string; cls: string }> = {
  recue:                 { label: 'Recue',           cls: 'bg-gray-100 text-gray-600' },
  payee:                 { label: 'Payee',           cls: 'bg-emerald-100 text-emerald-700' },
  payee_partiellement:   { label: 'Partielle',       cls: 'bg-blue-100 text-blue-700' },
};

const typeFactureLabel: Record<string, string> = {
  acompte: 'Acompte',
  solde:   'Solde',
  totale:  'Facture totale',
};

function fmtPct(pct: number) { return `${pct} %`; }
function fmtDelai(j: number) { return j === 0 ? 'A reception' : `${j}j`; }

// ─────────────────────────────────────────────────────────────────────────────
// BLOC 1 — SYNTHÈSE KPIs
// ─────────────────────────────────────────────────────────────────────────────

function SyntheseKpis({ totaux, budget_ia, loading }: {
  totaux: BudgetData['totaux'];
  budget_ia: number;
  loading: boolean;
}) {
  const ref = budget_ia > 0 ? budget_ia : totaux.devis_valides || totaux.devis_recus || 1;
  const progress = ref > 0 ? Math.min(Math.round((totaux.paye / ref) * 100), 100) : 0;
  const engageProgress = ref > 0 ? Math.min(Math.round((totaux.devis_valides / ref) * 100), 100) : 0;
  const ecart = totaux.devis_recus - budget_ia;

  const kpis = [
    {
      label:    'Budget estimé',
      sublabel: 'Estimation initiale IA',
      value:    budget_ia > 0 ? fmtEur(budget_ia) : '—',
      cls:      'text-gray-900',
      icon:     '🎯',
    },
    {
      label:    'Devis validés',
      sublabel: 'Engagements certains',
      value:    totaux.devis_valides > 0 ? fmtEur(totaux.devis_valides) : '—',
      cls:      totaux.devis_valides > 0 ? 'text-indigo-700' : 'text-gray-300',
      icon:     '✅',
    },
    {
      label:    'Facturé',
      sublabel: 'Factures reçues',
      value:    totaux.facture > 0 ? fmtEur(totaux.facture) : '—',
      cls:      totaux.facture > 0 ? 'text-gray-900' : 'text-gray-300',
      icon:     '🧾',
    },
    {
      label:    'Payé',
      sublabel: 'Règlements effectués',
      value:    totaux.paye > 0 ? fmtEur(totaux.paye) : '—',
      cls:      totaux.paye > 0 ? 'text-emerald-700' : 'text-gray-300',
      icon:     '💸',
    },
  ];

  if (loading) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="animate-pulse space-y-2">
              <div className="h-2 bg-gray-100 rounded w-20" />
              <div className="h-6 bg-gray-100 rounded w-28" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-50">
        {kpis.map(k => (
          <div key={k.label} className="px-5 py-4">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-sm">{k.icon}</span>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{k.label}</p>
            </div>
            <p className={`text-[20px] font-black tracking-tight leading-none ${k.cls}`}>{k.value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{k.sublabel}</p>
          </div>
        ))}
      </div>

      {/* Jauges + statut */}
      <div className="border-t border-gray-50 px-5 py-3.5 space-y-2.5">
        {/* Jauge paiements */}
        {totaux.paye > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>Avancement des paiements</span>
              <span className="font-bold text-gray-700">{progress} %</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Jauge engagement */}
        {totaux.devis_valides > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>Budget engage</span>
              <span className="font-bold text-indigo-700">{engageProgress} %</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-400 transition-all duration-700"
                style={{ width: `${engageProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Alerte dépassement */}
        {budget_ia > 0 && ecart > budget_ia * 0.05 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Devis recus <strong>+{fmtEur(ecart)}</strong> au-dessus du budget estimé — revoyez votre plan de financement</span>
          </div>
        )}
        {/* Statut positif */}
        {budget_ia > 0 && totaux.devis_recus > 0 && ecart <= budget_ia * 0.05 && ecart > -(budget_ia * 0.05) && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-[11px] text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>Vos devis sont dans l'enveloppe budgetaire prevue</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOC 2 — CARD DEVIS avec scoring
// ─────────────────────────────────────────────────────────────────────────────

function DevisRow({ devis, chantierId, token, onRefresh }: {
  devis: BudgetDevis;
  chantierId: string;
  token: string;
  onRefresh: () => void;
}) {
  const [validating,  setValidating]  = useState(false);
  const [analysing,   setAnalysing]   = useState(false);

  const signal = devis.analyse_signal as keyof typeof signalConfig | null;
  const sCfg   = signal ? signalConfig[signal] : null;
  const sCfgDevis = devisStatutConfig[devis.devis_statut ?? 'en_cours'];

  async function validateDevis() {
    setValidating(true);
    try {
      const bearer = await freshToken(token);
      await fetch(`/api/chantier/${chantierId}/documents/${devis.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ devisStatut: 'valide' }),
      });
      onRefresh();
    } finally { setValidating(false); }
  }

  async function lancerAnalyse() {
    setAnalysing(true);
    try {
      const bearer = await freshToken(token);
      await fetch(`/api/chantier/${chantierId}/documents/${devis.id}/analyser`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}` },
      });
      setTimeout(() => { onRefresh(); setAnalysing(false); }, 3000);
    } catch { setAnalysing(false); }
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors rounded-xl">
      {/* Icône type */}
      <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-sm shrink-0 mt-0.5">
        📋
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          {/* Nom */}
          {devis.signed_url ? (
            <a href={devis.signed_url} target="_blank" rel="noopener noreferrer"
              className="text-[13px] font-bold text-gray-900 hover:text-indigo-700 truncate max-w-[200px] flex items-center gap-1">
              {devis.nom}
              <ExternalLink className="h-3 w-3 opacity-50" />
            </a>
          ) : (
            <span className="text-[13px] font-bold text-gray-900 truncate max-w-[200px]">{devis.nom}</span>
          )}
          {/* Statut devis */}
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${sCfgDevis.cls}`}>
            {sCfgDevis.label}
          </span>
          {/* Score analyse */}
          {sCfg && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${sCfg.badge}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${sCfg.dot} mr-1`} />
              {sCfg.label}
            </span>
          )}
          {devis.analyse_status === 'pending' && (
            <span className="text-[9px] text-gray-400 animate-pulse">Analyse en cours...</span>
          )}
        </div>

        {/* Montant */}
        <p className="text-[15px] font-black text-gray-800">
          {devis.montant != null ? fmtEur(devis.montant) : '—'}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {/* Voir analyse */}
        {devis.analyse_id && devis.analyse_status === 'completed' && (
          <a href={`/analyse/${devis.analyse_id}`} target="_blank"
            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5">
            Voir analyse <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {/* Lancer analyse */}
        {!devis.analyse_id && devis.devis_statut !== 'en_cours' && (
          <button onClick={lancerAnalyse} disabled={analysing}
            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 disabled:opacity-50">
            {analysing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            Analyser
          </button>
        )}
        {/* Valider le devis */}
        {(!devis.devis_statut || devis.devis_statut === 'en_cours' || devis.devis_statut === 'a_relancer') && (
          <button onClick={validateDevis} disabled={validating}
            className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {validating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Valider
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOC 2 — ROW FACTURE avec termes de paiement
// ─────────────────────────────────────────────────────────────────────────────

function FactureRow({ facture, chantierId, token, onRefresh }: {
  facture: BudgetFacture;
  chantierId: string;
  token: string;
  onRefresh: () => void;
}) {
  const [paying, setPaying] = useState(false);
  const cfgStat = factureStatutConfig[facture.facture_statut ?? 'recue'];
  const pt      = facture.payment_terms;

  async function markPaid() {
    setPaying(true);
    try {
      const bearer = await freshToken(token);
      await fetch(`/api/chantier/${chantierId}/documents/${facture.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ factureStatut: 'payee', montantPaye: facture.montant }),
      });
      onRefresh();
    } finally { setPaying(false); }
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors rounded-xl">
      {/* Icône */}
      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-sm shrink-0 mt-0.5">
        🧾
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          {facture.signed_url ? (
            <a href={facture.signed_url} target="_blank" rel="noopener noreferrer"
              className="text-[13px] font-bold text-gray-900 hover:text-indigo-700 truncate max-w-[200px] flex items-center gap-1">
              {facture.nom}
              <ExternalLink className="h-3 w-3 opacity-50" />
            </a>
          ) : (
            <span className="text-[13px] font-bold text-gray-900 truncate max-w-[200px]">{facture.nom}</span>
          )}
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cfgStat.cls}`}>
            {cfgStat.label}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[15px] font-black text-gray-800">
            {facture.montant != null ? fmtEur(facture.montant) : '—'}
          </p>
          {/* Termes de paiement */}
          {pt && (
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              <span className="font-semibold">
                {typeFactureLabel[pt.type_facture] ?? pt.type_facture}
              </span>
              {pt.pct < 100 && <span className="text-gray-400">· {fmtPct(pt.pct)}</span>}
              <span className="text-gray-400">· {fmtDelai(pt.delai_jours)}</span>
            </div>
          )}
          {/* Partiel */}
          {facture.facture_statut === 'payee_partiellement' && facture.montant_paye != null && (
            <span className="text-[10px] text-blue-600 font-semibold">
              {fmtEur(facture.montant_paye)} regle
            </span>
          )}
        </div>
      </div>

      {/* CTA marquer payée */}
      {facture.facture_statut === 'recue' && (
        <button onClick={markPaid} disabled={paying}
          className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
          {paying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Marquer payee
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOC 2 — CARD LOT
// ─────────────────────────────────────────────────────────────────────────────

function LotCard({ lot, chantierId, token, onRefresh }: {
  lot: BudgetLot;
  chantierId: string;
  token: string;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const hasDevis    = lot.devis.length    > 0;
  const hasFactures = lot.factures.length > 0;

  // Statut du lot
  const hasRetard = lot.factures.some(f => f.facture_statut === 'recue' && f.payment_terms?.delai_jours === 0);
  const hasValide = lot.devis.some(d => d.devis_statut === 'valide' || d.devis_statut === 'attente_facture');
  const allPaid   = hasFactures && lot.factures.every(f => f.facture_statut === 'payee');

  const lotStatus = allPaid       ? { label: 'Solde',        cls: 'bg-emerald-50 text-emerald-700' }
    : hasRetard   ? { label: 'Facture recue', cls: 'bg-amber-50 text-amber-700' }
    : hasValide   ? { label: 'Valide',        cls: 'bg-indigo-50 text-indigo-700' }
    : hasDevis    ? { label: 'Devis recu',    cls: 'bg-gray-100 text-gray-600' }
    :               { label: 'Aucun devis',   cls: 'bg-gray-100 text-gray-400' };

  const progress = lot.totaux.devis_valides > 0
    ? Math.min(Math.round((lot.totaux.paye / lot.totaux.devis_valides) * 100), 100)
    : 0;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Header lot */}
      <button
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-lg shrink-0">
          {lot.emoji ?? '🔧'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-[14px] font-black text-gray-900">{lot.nom}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${lotStatus.cls}`}>
              {lotStatus.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
            {lot.totaux.devis_valides > 0 && (
              <span>{fmtEur(lot.totaux.devis_valides)} engage</span>
            )}
            {lot.totaux.facture > 0 && (
              <span>{fmtEur(lot.totaux.facture)} facture</span>
            )}
            {lot.totaux.paye > 0 && (
              <span className="text-emerald-600 font-semibold">{fmtEur(lot.totaux.paye)} regle</span>
            )}
          </div>
          {progress > 0 && (
            <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden w-full max-w-[200px]">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
        <div className="shrink-0 text-gray-300">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Contenu dépliable */}
      {expanded && (
        <div className="border-t border-gray-50 px-1 py-1 space-y-0.5">
          {/* Devis */}
          {hasDevis && (
            <div>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-4 pt-2 pb-1">
                Devis ({lot.devis.length})
              </p>
              {lot.devis.map(d => (
                <DevisRow key={d.id} devis={d} chantierId={chantierId} token={token} onRefresh={onRefresh} />
              ))}
            </div>
          )}

          {/* Factures */}
          {hasFactures && (
            <div>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-4 pt-2 pb-1">
                Factures ({lot.factures.length})
              </p>
              {lot.factures.map(f => (
                <FactureRow key={f.id} facture={f} chantierId={chantierId} token={token} onRefresh={onRefresh} />
              ))}
            </div>
          )}

          {!hasDevis && !hasFactures && (
            <p className="px-4 py-3 text-[12px] text-gray-400 italic">
              Aucun document associe a cet intervenant
            </p>
          )}

          {/* Footer lot : écart devis vs facture */}
          {lot.totaux.devis_valides > 0 && lot.totaux.facture > 0 &&
            lot.totaux.facture > lot.totaux.devis_valides * 1.05 && (
            <div className="mx-4 mb-3 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-2 text-[11px] text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                Facture de <strong>{fmtEur(lot.totaux.facture)}</strong> depasse le devis valide de{' '}
                <strong>+{fmtEur(lot.totaux.facture - lot.totaux.devis_valides)}</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOC 3 — PLAN DE FINANCEMENT
// ─────────────────────────────────────────────────────────────────────────────

type SourceKey = 'apport' | 'credit' | 'maprime' | 'cee' | 'eco_ptz';

const SOURCES: { key: SourceKey; label: string; icon: string; bar: string; bg: string }[] = [
  { key: 'apport',  label: 'Apport personnel',  icon: '💰', bar: 'bg-emerald-500', bg: 'bg-emerald-50' },
  { key: 'credit',  label: 'Pret travaux',       icon: '🏦', bar: 'bg-blue-500',    bg: 'bg-blue-50' },
  { key: 'maprime', label: "MaPrimeRenov'",      icon: '🌿', bar: 'bg-orange-400',  bg: 'bg-orange-50' },
  { key: 'cee',     label: 'CEE',                icon: '⚡', bar: 'bg-purple-400',  bg: 'bg-purple-50' },
  { key: 'eco_ptz', label: 'Eco-PTZ',            icon: '🏠', bar: 'bg-teal-400',    bg: 'bg-teal-50' },
];

function FinancementSection({ data, chantierId, token, onRefresh }: {
  data: BudgetData;
  chantierId: string;
  token: string;
  onRefresh: () => void;
}) {
  const { financement, budget_ia, totaux } = data;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<Record<SourceKey, string>>({
    apport:  String(financement.apport  || ''),
    credit:  String(financement.credit  || ''),
    maprime: String(financement.maprime || ''),
    cee:     String(financement.cee     || ''),
    eco_ptz: String(financement.eco_ptz || ''),
  });
  const [saving, setSaving] = useState(false);

  const totalFin = Object.values(financement).reduce((s, v) => s + v, 0);
  const ref      = budget_ia > 0 ? budget_ia : totaux.devis_valides || 1;
  const couv     = ref > 0 ? Math.min(Math.round((totalFin / ref) * 100), 100) : 0;
  const manque   = Math.max(ref - totalFin, 0);

  async function save() {
    setSaving(true);
    try {
      const bearer = await freshToken(token);
      const amounts = Object.fromEntries(
        SOURCES.map(s => [s.key, parseFloat(draft[s.key]) || 0]),
      );
      await fetch(`/api/chantier/${chantierId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ metadonnees: { financing: amounts } }),
      });
      setEditing(false);
      onRefresh();
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-50">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Plan de financement</p>
        <button onClick={() => setEditing(v => !v)}
          className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700">
          <Pencil className="h-3 w-3" />
          {editing ? 'Annuler' : totalFin > 0 ? 'Modifier' : 'Renseigner'}
        </button>
      </div>

      {/* Barre de couverture */}
      {totalFin > 0 && (
        <div className="px-5 py-3 border-b border-gray-50">
          <div className="flex justify-between mb-1.5 text-[10px]">
            <span className="text-gray-500">Couverture du budget</span>
            <span className={`font-bold ${couv >= 100 ? 'text-emerald-600' : couv >= 70 ? 'text-indigo-600' : 'text-amber-600'}`}>
              {couv} %
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                couv >= 100 ? 'bg-emerald-500' : couv >= 70 ? 'bg-indigo-500' : 'bg-amber-400'
              }`}
              style={{ width: `${couv}%` }}
            />
          </div>
          {manque > 0 && (
            <p className="text-[10px] text-amber-600 font-semibold mt-1.5">
              Il vous manque {fmtEur(manque)} pour couvrir le budget
            </p>
          )}
        </div>
      )}

      {/* Sources */}
      {editing ? (
        <div className="px-5 py-4 space-y-3">
          {SOURCES.map(s => (
            <div key={s.key} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center text-sm shrink-0`}>
                {s.icon}
              </div>
              <span className="flex-1 text-[12px] font-semibold text-gray-700 min-w-0 truncate">{s.label}</span>
              <input
                type="number" min="0" step="500"
                value={draft[s.key]}
                onChange={e => setDraft(prev => ({ ...prev, [s.key]: e.target.value }))}
                className="w-32 text-right text-[13px] font-bold px-3 py-1.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-indigo-400 outline-none transition-colors"
                placeholder="0"
              />
              <span className="text-[11px] text-gray-400 w-4">€</span>
            </div>
          ))}
          <button onClick={save} disabled={saving}
            className="w-full mt-2 py-2.5 bg-indigo-600 text-white text-[12px] font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Enregistrer
          </button>
        </div>
      ) : totalFin === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm font-semibold text-gray-400">Financement non renseigne</p>
          <p className="text-xs text-gray-300 mt-1">Cliquez sur "Renseigner" pour ajouter vos sources</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {SOURCES.filter(s => financement[s.key] > 0).map(s => {
            const val = financement[s.key];
            const pct = totalFin > 0 ? Math.round((val / totalFin) * 100) : 0;
            return (
              <div key={s.key} className="flex items-center gap-3 px-5 py-3">
                <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center text-sm shrink-0`}>
                  {s.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-gray-800">{s.label}</p>
                  <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className="text-[13px] font-black text-gray-900 shrink-0">{fmtEur(val)}</span>
                <span className="text-[10px] text-gray-400 w-8 text-right">{pct} %</span>
              </div>
            );
          })}
          <div className="flex items-center justify-between px-5 py-3 bg-gray-50">
            <span className="text-[12px] font-bold text-gray-600">Total finance</span>
            <span className="text-[16px] font-black text-gray-900">{fmtEur(totalFin)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOC 4 — CONSEILS PROACTIFS
// ─────────────────────────────────────────────────────────────────────────────

function ConseilsSection({ conseils }: { conseils: Conseil[] }) {
  if (conseils.length === 0) return null;

  const urgencyCfg = {
    action:  { icon: '⚡', cls: 'bg-indigo-50 border-indigo-100', dot: 'bg-indigo-600', text: 'text-indigo-900', sub: 'text-indigo-700' },
    warning: { icon: '⚠️', cls: 'bg-amber-50 border-amber-100',   dot: 'bg-amber-500',  text: 'text-amber-900',  sub: 'text-amber-700' },
    info:    { icon: '💡', cls: 'bg-gray-50 border-gray-100',      dot: 'bg-gray-400',   text: 'text-gray-900',   sub: 'text-gray-600' },
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-5 pt-4 pb-3 border-b border-gray-50">
        Conseils intelligents · {conseils.length}
      </p>
      <div className="divide-y divide-gray-50">
        {conseils.map(c => {
          const cfg = urgencyCfg[c.urgency];
          return (
            <div key={c.type} className={`flex gap-3 px-5 py-3.5 border-l-[3px] ${c.urgency === 'action' ? 'border-l-indigo-500' : c.urgency === 'warning' ? 'border-l-amber-400' : 'border-l-gray-200'}`}>
              <span className="text-base shrink-0 mt-0.5">{cfg.icon}</span>
              <div>
                <p className={`text-[12px] font-bold ${cfg.text} mb-0.5`}>{c.titre}</p>
                <p className={`text-[11px] leading-relaxed ${cfg.sub}`}>{c.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

interface BudgetTabProps {
  chantierId: string;
  token: string;
}

export default function BudgetTab({ chantierId, token }: BudgetTabProps) {
  const { data, loading, error, refresh } = useBudgetData(chantierId, token);

  const allLots = useMemo(() => {
    if (!data) return [];
    return data.sans_lot
      ? [...data.lots, data.sans_lot]
      : data.lots;
  }, [data]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-4 space-y-4 pb-8">
        <SyntheseKpis totaux={{ devis_recus: 0, devis_valides: 0, facture: 0, paye: 0 }} budget_ia={0} loading />
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="bg-white border border-gray-100 rounded-2xl p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gray-100 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-32" />
                  <div className="h-2 bg-gray-100 rounded w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Erreur ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-700">Impossible de charger le budget</p>
            <p className="text-xs text-red-500 mt-0.5">{error}</p>
          </div>
          <button onClick={refresh}
            className="shrink-0 text-[11px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1">
            <RotateCw className="h-3.5 w-3.5" /> Reessayer
          </button>
        </div>
      </div>
    );
  }

  // ── Vide ──────────────────────────────────────────────────────────────────
  if (!data || (allLots.length === 0 && data.conseils.length === 0)) {
    return (
      <div className="p-4">
        <SyntheseKpis totaux={{ devis_recus: 0, devis_valides: 0, facture: 0, paye: 0 }} budget_ia={data?.budget_ia ?? 0} loading={false} />
        <div className="mt-6 text-center py-12 bg-white border border-gray-100 rounded-2xl">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-sm font-bold text-gray-600">Aucun devis ou facture</p>
          <p className="text-xs text-gray-400 mt-1.5 max-w-[240px] mx-auto">
            Deposez vos devis depuis l'onglet Documents ou directement depuis VerifierMonDevis
          </p>
        </div>
      </div>
    );
  }

  // ── Contenu principal ─────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4 pb-8">
      {/* 1. Synthèse */}
      <SyntheseKpis totaux={data.totaux} budget_ia={data.budget_ia} loading={false} />

      {/* 2. Par lot */}
      {allLots.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1">
            Par intervenant · {allLots.length}
          </p>
          {allLots.map(lot => (
            <LotCard
              key={lot.id}
              lot={lot}
              chantierId={chantierId}
              token={token}
              onRefresh={refresh}
            />
          ))}
        </div>
      )}

      {/* 3. Financement */}
      <FinancementSection
        data={data}
        chantierId={chantierId}
        token={token}
        onRefresh={refresh}
      />

      {/* 4. Conseils */}
      <ConseilsSection conseils={data.conseils} />
    </div>
  );
}
