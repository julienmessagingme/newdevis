/**
 * TresoreriePanel — module financier complet du cockpit chantier.
 *
 * Onglets :
 *   📅 Échéancier  — timeline de paiement triée + statuts + bouton "Marquer payé" visible
 *   📊 Trésorerie  — jauge budget (enveloppe éditable) + sources de financement
 *   💳 Financement — simulateur aides (MaPrimeRénov/CEE/Éco-PTZ) + crédit travaux
 */
import { useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { TrendingUp, Calendar, CreditCard, Check } from 'lucide-react';
import PaymentTimeline from './PaymentTimeline';
import CashflowTab from './CashflowTab';
import FinancementTab from './financing/FinancementTab';
import type { SourceKey } from './FinancingSources';
import type { SimulationData } from './financing/AidesTravaux';

// ── Supabase (token refresh pour la persistence) ─────────────────────────────

const _supabase = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL,
  (import.meta as any).env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
async function getFreshBearerToken(fallback: string): Promise<string> {
  try {
    const { data: { session } } = await _supabase.auth.getSession();
    return session?.access_token ?? fallback;
  } catch {
    return fallback;
  }
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

type Tab = 'timeline' | 'cashflow' | 'financement';

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'timeline',    label: 'Échéancier',  icon: <Calendar className="h-3.5 w-3.5" /> },
    { id: 'cashflow',    label: 'Trésorerie',  icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { id: 'financement', label: 'Financement', icon: <CreditCard className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
      {tabs.map(t => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-all ${
            active === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  );
}

// ── Composant principal exporté ───────────────────────────────────────────────

interface TresoreeriePanelProps {
  chantierId: string;
  token: string;
  budgetMax?: number;
  initialFinancing?: Record<string, unknown> | null;
}

export default function TresoreriePanel({
  chantierId,
  token,
  budgetMax: budgetMaxProp = 0,
  initialFinancing,
}: TresoreeriePanelProps) {
  const [tab, setTab] = useState<Tab>('timeline');
  const [budgetOverride, setBudgetOverride] = useState<number | null>(null);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectiveBudget = budgetOverride ?? budgetMaxProp;

  // Initialise depuis metadonnees.financing chargée par le parent
  const initAmounts = (initialFinancing?.amounts as Partial<Record<SourceKey, string>> | undefined) ?? {};
  const [financingAmounts, setFinancingAmounts] = useState<Record<SourceKey, string>>({
    apport:   initAmounts.apport   ?? '',
    credit:   initAmounts.credit   ?? '',
    maprime:  initAmounts.maprime  ?? '',
    cee:      initAmounts.cee      ?? '',
    eco_ptz:  initAmounts.eco_ptz  ?? '',
  });
  const [simulationData, setSimulationData] = useState<SimulationData | null>(
    (initialFinancing?.simulation as SimulationData | null | undefined) ?? null,
  );

  // Débounce sauvegarde vers /api/chantier/[id] (PATCH financing)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function persistFinancing(amounts: Record<SourceKey, string>, simulation: SimulationData | null) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const t = await getFreshBearerToken(token);
        const res = await fetch(`/api/chantier/${chantierId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ financing: { amounts, simulation } }),
        });
        if (res.ok) {
          setSavedIndicator(true);
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(() => setSavedIndicator(false), 2500);
        }
      } catch { /* non-bloquant */ }
    }, 300);
  }

  function handleSetFinancingAmounts(updater: React.SetStateAction<Record<SourceKey, string>>) {
    setFinancingAmounts(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persistFinancing(next, simulationData);
      return next;
    });
  }

  function handleImportAides(values: Partial<Record<SourceKey, string>>) {
    setFinancingAmounts(prev => {
      const next = { ...prev, ...values };
      persistFinancing(next, simulationData);
      return next;
    });
    setTab('cashflow');
  }

  function handleSimulationSave(data: SimulationData | null) {
    setSimulationData(data);
    persistFinancing(financingAmounts, data);
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-gray-50">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </div>
          <h2 className="font-bold text-gray-900 text-base">Budget & Trésorerie</h2>
          {savedIndicator && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-emerald-600 animate-fade-in">
              <Check className="h-3 w-3" /> Sauvegardé
            </span>
          )}
        </div>
        <TabBar active={tab} onChange={setTab} />
      </div>

      <div className="p-5">
        {tab === 'timeline'    && <PaymentTimeline chantierId={chantierId} token={token} />}
        {tab === 'cashflow'    && (
          <CashflowTab
            chantierId={chantierId}
            token={token}
            budgetMax={effectiveBudget}
            onBudgetOverride={setBudgetOverride}
            financingAmounts={financingAmounts}
            setFinancingAmounts={handleSetFinancingAmounts}
          />
        )}
        {tab === 'financement' && (
          <FinancementTab
            onImportAides={handleImportAides}
            initialSimulation={simulationData}
            onSimulationSave={handleSimulationSave}
          />
        )}
      </div>
    </div>
  );
}
