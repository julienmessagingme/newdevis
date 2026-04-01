/**
 * BudgetTab v2 — Tableau de suivi budget par artisan.
 *
 * Structure :
 *   1. Header KPIs (4 indicateurs légers, pas de cartes lourdes)
 *   2. Barre d'actions (recherche, filtres, tri, + devis)
 *   3. Tableau principal (1 ligne = 1 artisan/lot)
 *   4. Drawer détail artisan (devis + factures + liens)
 *
 * Zéro logique trésorerie, échéancier ou financement.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Search, Plus, Paperclip, X, ExternalLink,
  AlertCircle, Loader2, RotateCw,
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

// ── Types (miroir de l'API /budget) ───────────────────────────────────────────

interface BudgetDevis {
  id: string;
  nom: string;
  montant: number | null;
  devis_statut: string | null;
  analyse_id: string | null;
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

interface BudgetData {
  budget_ia: number;
  lots: BudgetLot[];
  sans_lot: BudgetLot | null;
  totaux: { devis_recus: number; devis_valides: number; facture: number; paye: number };
  type_projet: string;
}

// ── Ligne enrichie ────────────────────────────────────────────────────────────

interface BudgetRow {
  lot: BudgetLot;
  devisAmount: number | null;       // montant devis validé
  devisAmountGrey: number | null;   // montant devis non validé (affiché grisé)
  devisStatut: 'validated' | 'received' | 'pending';
  facture: number;
  paye: number;
  reste: number;
  payStatut: 'paid' | 'partial' | 'unpaid';
  alertOverrun: boolean;   // facture > devis validé
  alertUnpaid: boolean;    // factures non payées
}

function buildRow(lot: BudgetLot): BudgetRow {
  const { devis_valides, devis_recus, facture, paye } = lot.totaux;
  const reste = Math.max(0, facture - paye);

  // Statut devis : dérivé depuis les statuts individuels
  const statuses = lot.devis.map(d => d.devis_statut);
  let devisStatut: BudgetRow['devisStatut'] = 'pending';
  if (statuses.some(s => s === 'valide' || s === 'attente_facture')) devisStatut = 'validated';
  else if (statuses.some(s => s === 'en_cours')) devisStatut = 'received';

  // Statut paiement
  let payStatut: BudgetRow['payStatut'] = 'unpaid';
  if (facture > 0 && paye >= facture) payStatut = 'paid';
  else if (paye > 0) payStatut = 'partial';

  const devisAmount     = devis_valides > 0 ? devis_valides : null;
  const devisAmountGrey = devis_valides === 0 && devis_recus > 0 ? devis_recus : null;

  return {
    lot,
    devisAmount,
    devisAmountGrey,
    devisStatut,
    facture,
    paye,
    reste,
    payStatut,
    alertOverrun: devis_valides > 0 && facture > devis_valides * 1.05,
    alertUnpaid:  facture > 0 && reste > 0,
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

const DEVIS_STATUS: Record<BudgetRow['devisStatut'], { label: string; cls: string }> = {
  validated: { label: 'Validé',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  received:  { label: 'Reçu',       cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  pending:   { label: 'En attente', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const PAY_STATUS: Record<BudgetRow['payStatut'], { label: string; cls: string }> = {
  paid:    { label: 'Payé',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partial: { label: 'Partiel',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  unpaid:  { label: 'Non payé', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const DEVIS_STATUT_LABEL: Record<string, string> = {
  en_cours:        'Reçu',
  a_relancer:      'À relancer',
  valide:          'Validé',
  attente_facture: 'Att. facture',
};

const FACTURE_STATUT_LABEL: Record<string, string> = {
  recue:               'Reçue',
  payee:               'Payée',
  payee_partiellement: 'Partielle',
};

// ── Sous-composants ────────────────────────────────────────────────────────────

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {label}
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

// ── Header KPIs ───────────────────────────────────────────────────────────────

function HeaderKpis({ data, loading }: { data: BudgetData | null; loading: boolean }) {
  const kpis = [
    { label: 'Budget estimé',  value: data?.budget_ia && data.budget_ia > 0 ? fmtEur(data.budget_ia) : '—' },
    { label: 'Budget validé',  value: data && data.totaux.devis_valides > 0 ? fmtEur(data.totaux.devis_valides) : '—' },
    { label: 'Total facturé',  value: data && data.totaux.facture > 0 ? fmtEur(data.totaux.facture) : '—' },
    { label: 'Total payé',     value: data && data.totaux.paye > 0 ? fmtEur(data.totaux.paye) : '—' },
  ];

  return (
    <div className="px-5 pt-4 pb-4 border-b border-gray-100">
      <div className="grid grid-cols-4 gap-6">
        {kpis.map(kpi => (
          <div key={kpi.label}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{kpi.label}</p>
            {loading ? (
              <div className="h-5 w-20 bg-gray-100 rounded animate-pulse" />
            ) : (
              <p className="text-[17px] font-black text-gray-800 leading-none">{kpi.value}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Action bar ────────────────────────────────────────────────────────────────

type FilterDevis = 'all' | 'pending' | 'received' | 'validated';
type FilterPay   = 'all' | 'unpaid' | 'partial' | 'paid';
type SortBy      = 'default' | 'amount' | 'reste' | 'nom';

interface ActionBarProps {
  search: string;
  onSearch: (v: string) => void;
  filterDevis: FilterDevis;
  onFilterDevis: (v: FilterDevis) => void;
  filterPay: FilterPay;
  onFilterPay: (v: FilterPay) => void;
  sortBy: SortBy;
  onSort: (v: SortBy) => void;
  onAddDevis?: () => void;
}

function ActionBar({
  search, onSearch,
  filterDevis, onFilterDevis,
  filterPay, onFilterPay,
  sortBy, onSort,
  onAddDevis,
}: ActionBarProps) {
  const selectCls = 'text-[12px] border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-300';

  return (
    <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
      {/* Recherche */}
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Rechercher un artisan ou un poste..."
          className="w-full pl-8 pr-7 py-2 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 placeholder:text-gray-400"
        />
        {search && (
          <button
            onClick={() => onSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5"
          >
            <X className="h-3 w-3 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>

      {/* Filtre statut devis */}
      <select value={filterDevis} onChange={e => onFilterDevis(e.target.value as FilterDevis)} className={selectCls}>
        <option value="all">Tous statuts devis</option>
        <option value="pending">En attente</option>
        <option value="received">Reçu</option>
        <option value="validated">Validé</option>
      </select>

      {/* Filtre paiement */}
      <select value={filterPay} onChange={e => onFilterPay(e.target.value as FilterPay)} className={selectCls}>
        <option value="all">Tous paiements</option>
        <option value="unpaid">Non payé</option>
        <option value="partial">Partiel</option>
        <option value="paid">Payé</option>
      </select>

      {/* Tri */}
      <select value={sortBy} onChange={e => onSort(e.target.value as SortBy)} className={selectCls}>
        <option value="default">Tri par défaut</option>
        <option value="amount">Montant devis</option>
        <option value="reste">Reste à payer</option>
        <option value="nom">Nom artisan</option>
      </select>

      <div className="flex-1" />

      {/* Ajouter un devis */}
      <button
        onClick={onAddDevis}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 transition-colors shrink-0"
      >
        <Plus className="h-3.5 w-3.5" />
        Ajouter un devis
      </button>
    </div>
  );
}

// ── Drawer détail artisan ─────────────────────────────────────────────────────

function ArtisanDrawer({ row, onClose }: { row: BudgetRow; onClose: () => void }) {
  const { lot } = row;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-[380px] max-w-full bg-white shadow-2xl z-50 flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            {lot.emoji && <span className="text-[20px] shrink-0">{lot.emoji}</span>}
            <div className="min-w-0">
              <p className="text-[14px] font-black text-gray-900 truncate">{lot.nom}</p>
              <p className="text-[11px] text-gray-400">
                {lot.devis.length} devis · {lot.factures.length} facture{lot.factures.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0 ml-2">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Totaux mini */}
        <div className="grid grid-cols-3 border-b border-gray-100 divide-x divide-gray-100">
          {[
            { label: 'Facturé', value: fmtEur(lot.totaux.facture), red: false },
            { label: 'Payé',    value: fmtEur(lot.totaux.paye),    red: false },
            { label: 'Reste',   value: fmtEur(row.reste),          red: row.reste > 0 },
          ].map(item => (
            <div key={item.label} className="px-4 py-3 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{item.label}</p>
              <p className={`text-[13px] font-black leading-none ${item.red ? 'text-amber-600' : 'text-gray-800'}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {/* Contenu scrollable */}
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
                        <a
                          href={d.signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title="Ouvrir le document"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Factures */}
          {lot.factures.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Factures</p>
              <div className="space-y-0">
                {lot.factures.map(f => {
                  const payeF  = f.montant_paye ?? 0;
                  const resteF = Math.max(0, (f.montant ?? 0) - payeF);
                  return (
                    <div key={f.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-[12px] text-gray-800 truncate">{f.nom}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {f.facture_statut ? (FACTURE_STATUT_LABEL[f.facture_statut] ?? f.facture_statut) : '—'}
                          {f.payment_terms && (
                            <> · {f.payment_terms.type_facture === 'acompte' ? 'Acompte' : f.payment_terms.type_facture === 'solde' ? 'Solde' : 'Facture'} {f.payment_terms.pct}%</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          {f.montant !== null && (
                            <p className="text-[12px] font-bold text-gray-700">{fmtEur(f.montant)}</p>
                          )}
                          {resteF > 0 && (
                            <p className="text-[10px] text-amber-600">Reste {fmtEur(resteF)}</p>
                          )}
                        </div>
                        {f.signed_url && (
                          <a
                            href={f.signed_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                            title="Ouvrir le document"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
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
    </>
  );
}

// ── Tableau principal ─────────────────────────────────────────────────────────

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
  onAddDevis,
}: {
  chantierId: string;
  token: string;
  onAddDevis?: () => void;
}) {
  const { data, loading, error, refresh } = useBudgetData(chantierId, token);

  const [search,      setSearch]      = useState('');
  const [filterDevis, setFilterDevis] = useState<FilterDevis>('all');
  const [filterPay,   setFilterPay]   = useState<FilterPay>('all');
  const [sortBy,      setSortBy]      = useState<SortBy>('default');
  const [selected,    setSelected]    = useState<BudgetRow | null>(null);

  // Tous les lots (avec sans_lot en dernier)
  const allLots = useMemo(() => {
    if (!data) return [];
    return [...data.lots, ...(data.sans_lot ? [data.sans_lot] : [])];
  }, [data]);

  // Lignes filtrées + triées
  const rows = useMemo<BudgetRow[]>(() => {
    let result = allLots.map(buildRow);

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
        );
        break;
      case 'reste':
        result.sort((a, b) => b.reste - a.reste);
        break;
      case 'nom':
        result.sort((a, b) => a.lot.nom.localeCompare(b.lot.nom, 'fr'));
        break;
      default:
        // Reste > 0 en premier, puis facturé, puis sans activité
        result.sort((a, b) => {
          const score = (r: BudgetRow) => r.reste > 0 ? 2 : r.facture > 0 ? 1 : 0;
          return score(b) - score(a) || b.reste - a.reste;
        });
    }

    return result;
  }, [allLots, search, filterDevis, filterPay, sortBy]);

  const totalDocs = useMemo(
    () => allLots.reduce((s, l) => s + l.devis.length + l.factures.length, 0),
    [allLots],
  );

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
      <HeaderKpis data={data} loading={loading} />

      {/* ── Barre d'actions ───────────────────────────────────────────────── */}
      <ActionBar
        search={search}           onSearch={setSearch}
        filterDevis={filterDevis} onFilterDevis={setFilterDevis}
        filterPay={filterPay}     onFilterPay={setFilterPay}
        sortBy={sortBy}           onSort={setSortBy}
        onAddDevis={onAddDevis}
      />

      {/* ── Tableau ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
              <th className={`${TH} w-[180px]`}>Artisan</th>
              <th className={TH}>Poste</th>
              <th className={`${TH} text-right`}>Devis</th>
              <th className={TH}>Statut devis</th>
              <th className={`${TH} text-right`}>Facturé</th>
              <th className={`${TH} text-right`}>Payé</th>
              <th className={`${TH} text-right`}>Reste à payer</th>
              <th className={`${TH} w-[130px]`}>Progression</th>
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
                const docCount = row.lot.devis.length + row.lot.factures.length;

                return (
                  <tr
                    key={row.lot.id}
                    onClick={() => setSelected(row)}
                    className="hover:bg-gray-50/70 cursor-pointer transition-colors"
                  >
                    {/* Artisan */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        {row.lot.emoji && (
                          <span className="text-[15px] leading-none shrink-0">{row.lot.emoji}</span>
                        )}
                        <p className="text-[12px] font-semibold text-gray-800 truncate">{row.lot.nom}</p>
                      </div>
                    </td>

                    {/* Poste — premier devis ou — */}
                    <td className="px-4 py-3.5">
                      <p className="text-[11px] text-gray-400 truncate max-w-[150px]">
                        {row.lot.devis[0]?.nom ?? '—'}
                      </p>
                    </td>

                    {/* Devis */}
                    <td className="px-4 py-3.5 text-right">
                      {row.devisAmount !== null ? (
                        <span className="text-[12px] font-bold text-gray-800">{fmtEur(row.devisAmount)}</span>
                      ) : row.devisAmountGrey !== null ? (
                        <span className="text-[12px] text-gray-400">{fmtEur(row.devisAmountGrey)}</span>
                      ) : (
                        <span className="text-[12px] text-gray-300">—</span>
                      )}
                    </td>

                    {/* Statut devis */}
                    <td className="px-4 py-3.5">
                      <Badge label={ds.label} cls={ds.cls} />
                    </td>

                    {/* Facturé */}
                    <td className="px-4 py-3.5 text-right">
                      {row.facture > 0 ? (
                        <span className={`text-[12px] font-semibold ${row.alertOverrun ? 'text-amber-600' : 'text-gray-700'}`}>
                          {fmtEur(row.facture)}
                          {row.alertOverrun && (
                            <span className="ml-1.5 text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-1 py-0.5 rounded font-bold">
                              dépassé
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[12px] text-gray-300">—</span>
                      )}
                    </td>

                    {/* Payé */}
                    <td className="px-4 py-3.5 text-right">
                      {row.paye > 0 ? (
                        <span className="text-[12px] text-gray-700">{fmtEur(row.paye)}</span>
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
                      <ProgressBar paye={row.paye} facture={row.facture} />
                    </td>

                    {/* Documents */}
                    <td className="px-4 py-3.5 text-center">
                      {docCount > 0 ? (
                        <button
                          onClick={e => { e.stopPropagation(); setSelected(row); }}
                          className="inline-flex items-center gap-1 text-gray-400 hover:text-indigo-600 transition-colors"
                          title={`${docCount} document${docCount > 1 ? 's' : ''}`}
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
          <button
            onClick={refresh}
            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            <RotateCw className="h-3 w-3" />
            Actualiser
          </button>
        </div>
      )}

      {/* ── Drawer ────────────────────────────────────────────────────────── */}
      {selected && (
        <ArtisanDrawer row={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
