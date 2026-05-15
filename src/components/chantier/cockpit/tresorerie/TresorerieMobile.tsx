/**
 * TresorerieMobile — vue mobile-first pour la trésorerie chantier.
 *
 * Design pensé pour le terrain : 1 hero KPI, 2 actions principales, scroll
 * vertical sans surcharge. Distinct de TresorerieView (desktop) qui reste
 * le tableau de bord complet.
 *
 * Reçoit les valeurs déjà calculées en props (les hooks data restent dans
 * TresorerieView pour ne pas dupliquer la logique).
 *
 * Architecture mobile :
 *   1. Hero card (Budget · Décaissé · Reste) avec gauge horizontale
 *   2. Bouton "+ Dépense rapide" (action prioritaire utilisateur terrain)
 *   3. Section Plan de financement (3 cards Apport/Crédit/Aides)
 *   4. Section Consommation (% par source) — cards verticales
 *   5. Section Alertes cohérence (collapsible)
 */
import { useState } from "react";
import { Pencil, ChevronDown, ChevronRight, AlertTriangle, Plus, Check } from "lucide-react";
import { fmtEur } from "@/lib/chantier/financingUtils";

interface TresorerieMobileProps {
  // KPI canoniques
  budgetCible:   number;
  engage:        number;
  decaisse:      number;
  aPayer:        number;
  fluxCertains:  number;

  // Plan de financement (valeurs cibles configurées)
  apportCible:   number;
  creditCible:   number;
  aidesCible:    number;

  // Entrées réelles enregistrées (pour la cohérence)
  apportReel:    number;
  creditReel:    number;
  aidesReel:     number;

  // Handlers
  onEditBudget:        () => void;
  onAddDepense:        () => void;
  onAddVersement:      () => void;
  onOpenFinancement:   () => void;  // ouvre l'éditeur complet du plan
  onOpenConsommation:  () => void;  // ouvre la vue détaillée par artisan
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero card — Budget / Décaissé / Reste + gauge
// ─────────────────────────────────────────────────────────────────────────────

function HeroBudget({
  budgetCible, decaisse, aPayer, fluxCertains, onEdit,
}: {
  budgetCible: number;
  decaisse:    number;
  aPayer:      number;
  fluxCertains: number;
  onEdit:      () => void;
}) {
  const reste = Math.max(0, budgetCible - fluxCertains);
  const pctDecaisse = budgetCible > 0 ? Math.min(100, Math.round((decaisse / budgetCible) * 100)) : 0;
  const pctEngage   = budgetCible > 0 ? Math.min(100, Math.round((fluxCertains / budgetCible) * 100)) : 0;
  const overBudget  = fluxCertains > budgetCible * 1.01;

  return (
    <div className="bg-gradient-to-br from-indigo-50 via-white to-violet-50 border-b border-gray-100 px-4 py-5">
      {/* Budget cible — édition au tap */}
      <button onClick={onEdit} className="w-full text-left group">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1.5">
          Budget cible
          <Pencil className="h-3 w-3 text-gray-300 group-hover:text-indigo-500 transition-colors" />
        </p>
        <p className="text-[28px] font-black text-gray-900 tabular-nums leading-tight">
          {budgetCible > 0 ? fmtEur(budgetCible) : <span className="text-gray-300 text-base font-normal">Cliquer pour définir</span>}
        </p>
      </button>

      {/* Gauge horizontale empilée */}
      {budgetCible > 0 && (
        <div className="mt-4">
          <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
            {/* Décaissé (plein) */}
            <div
              className="absolute inset-y-0 left-0 bg-indigo-500 rounded-l-full transition-all"
              style={{ width: `${pctDecaisse}%` }}
            />
            {/* Engagé non décaissé (rayé léger) */}
            {pctEngage > pctDecaisse && (
              <div
                className="absolute inset-y-0 bg-indigo-200 transition-all"
                style={{ left: `${pctDecaisse}%`, width: `${pctEngage - pctDecaisse}%` }}
              />
            )}
            {/* Dépassement */}
            {overBudget && (
              <div className="absolute inset-y-0 right-0 bg-rose-400 rounded-r-full w-1" />
            )}
          </div>
          <div className="flex items-center justify-between mt-2 text-[11px] text-gray-600">
            <span className="font-semibold text-indigo-700 tabular-nums">{fmtEur(decaisse)} décaissé</span>
            <span className="tabular-nums">{pctDecaisse}%</span>
          </div>
        </div>
      )}

      {/* Triplette KPI condensée */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        <KpiMini label="À payer"  value={aPayer}        color="amber" />
        <KpiMini label="Flux"     value={fluxCertains}  color="indigo" hint="certains" />
        <KpiMini label="Reste"    value={reste}         color={overBudget ? "rose" : "emerald"} />
      </div>

      {overBudget && (
        <div className="mt-3 flex items-start gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-rose-800">
            <strong>Dépassement</strong> — flux certains ({fmtEur(fluxCertains)}) supérieur au budget cible. Ajustez votre enveloppe.
          </p>
        </div>
      )}
    </div>
  );
}

function KpiMini({ label, value, color, hint }: {
  label: string;
  value: number;
  color: "amber" | "indigo" | "emerald" | "rose";
  hint?: string;
}) {
  const palette = {
    amber:   "text-amber-700",
    indigo:  "text-indigo-700",
    emerald: "text-emerald-700",
    rose:    "text-rose-700",
  }[color];
  return (
    <div className="bg-white/70 backdrop-blur-sm border border-gray-100 rounded-xl px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 truncate">{label}</p>
      <p className={`text-[13px] font-extrabold tabular-nums leading-tight mt-0.5 ${palette}`}>
        {fmtEur(value)}
      </p>
      {hint && <p className="text-[9px] text-gray-400 leading-tight">{hint}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action bar — 2 boutons principaux
// ─────────────────────────────────────────────────────────────────────────────

function ActionBar({ onAddDepense, onAddVersement }: { onAddDepense: () => void; onAddVersement: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-gray-100">
      <button
        onClick={onAddDepense}
        className="flex items-center justify-center gap-1.5 min-h-[48px] bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-bold touch-manipulation active:bg-rose-100 transition-colors"
      >
        <span className="text-base">🧾</span>
        Dépense
      </button>
      <button
        onClick={onAddVersement}
        className="flex items-center justify-center gap-1.5 min-h-[48px] bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-bold touch-manipulation active:bg-emerald-100 transition-colors"
      >
        <span className="text-base">💰</span>
        Versement
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section card collapsible
// ─────────────────────────────────────────────────────────────────────────────

function SectionCard({
  title, subtitle, children, defaultOpen = false, action,
}: {
  title:       string;
  subtitle?:   string;
  children:    React.ReactNode;
  defaultOpen?: boolean;
  action?:     { label: string; onClick: () => void };
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3.5 flex items-center justify-between active:bg-gray-50 transition-colors touch-manipulation"
      >
        <div className="text-left min-w-0">
          <p className="text-sm font-bold text-gray-900">{title}</p>
          {subtitle && <p className="text-[11px] text-gray-500 truncate">{subtitle}</p>}
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {children}
          {action && (
            <button
              onClick={action.onClick}
              className="w-full mt-2 py-2.5 border border-gray-200 rounded-lg text-[12px] font-semibold text-gray-700 active:bg-gray-50 touch-manipulation flex items-center justify-center gap-1.5"
            >
              {action.label}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan de financement — 3 cartes simplifiées
// ─────────────────────────────────────────────────────────────────────────────

function FinancementCard({
  label, emoji, color, valueCible, valueReel,
}: {
  label:      string;
  emoji:      string;
  color:      "indigo" | "orange" | "emerald";
  valueCible: number;
  valueReel:  number;
}) {
  const palette = {
    indigo:  { bg: "bg-indigo-50",  border: "border-indigo-100",  text: "text-indigo-700",  bar: "bg-indigo-500" },
    orange:  { bg: "bg-orange-50",  border: "border-orange-100",  text: "text-orange-700",  bar: "bg-orange-500" },
    emerald: { bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-700", bar: "bg-emerald-500" },
  }[color];
  const pct = valueCible > 0 ? Math.min(100, Math.round((valueReel / valueCible) * 100)) : 0;

  return (
    <div className={`${palette.bg} ${palette.border} border rounded-xl p-3`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base">{emoji}</span>
          <p className={`text-[12px] font-bold ${palette.text}`}>{label}</p>
        </div>
        <p className={`text-[13px] font-extrabold tabular-nums ${palette.text}`}>
          {fmtEur(valueCible)}
        </p>
      </div>
      {valueCible > 0 && (
        <>
          <div className="h-1.5 bg-white/70 rounded-full overflow-hidden">
            <div className={`h-full ${palette.bar} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5 tabular-nums">
            Reçu : {fmtEur(valueReel)} <span className="text-gray-400">({pct}%)</span>
          </p>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export default function TresorerieMobile({
  budgetCible, engage, decaisse, aPayer, fluxCertains,
  apportCible, creditCible, aidesCible,
  apportReel,  creditReel,  aidesReel,
  onEditBudget, onAddDepense, onAddVersement,
  onOpenFinancement, onOpenConsommation,
}: TresorerieMobileProps) {
  const totalFinancement = apportCible + creditCible + aidesCible;
  const totalReel        = apportReel  + creditReel  + aidesReel;
  const couverturePct    = budgetCible > 0 ? Math.min(100, Math.round((totalFinancement / budgetCible) * 100)) : 0;

  return (
    <div className="flex flex-col bg-white pb-[max(2rem,env(safe-area-inset-bottom))]">
      <HeroBudget
        budgetCible={budgetCible}
        decaisse={decaisse}
        aPayer={aPayer}
        fluxCertains={fluxCertains}
        onEdit={onEditBudget}
      />

      <ActionBar
        onAddDepense={onAddDepense}
        onAddVersement={onAddVersement}
      />

      {/* Section Plan de financement */}
      <SectionCard
        title="Plan de financement"
        subtitle={`${fmtEur(totalFinancement)} prévu · ${couverturePct}% du budget`}
        defaultOpen={true}
        action={{ label: "Modifier le plan", onClick: onOpenFinancement }}
      >
        <FinancementCard label="Apport personnel" emoji="💼" color="indigo"
          valueCible={apportCible} valueReel={apportReel} />
        <FinancementCard label="Crédit travaux" emoji="🏦" color="orange"
          valueCible={creditCible} valueReel={creditReel} />
        <FinancementCard label="Aides & primes" emoji="🌿" color="emerald"
          valueCible={aidesCible}  valueReel={aidesReel} />

        {couverturePct < 95 && totalFinancement > 0 && (
          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800">
              Le plan ne couvre que <strong>{couverturePct}%</strong> du budget cible — il manque{" "}
              <strong>{fmtEur(budgetCible - totalFinancement)}</strong> à financer.
            </p>
          </div>
        )}
        {totalReel > 0 && totalReel < totalFinancement * 0.5 && (
          <div className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-blue-600 text-sm leading-none mt-0.5">ℹ️</span>
            <p className="text-[11px] text-blue-800">
              <strong>{fmtEur(totalReel)}</strong> reçu sur {fmtEur(totalFinancement)} prévu.
            </p>
          </div>
        )}
      </SectionCard>

      {/* Section Consommation — accès au détail */}
      <SectionCard
        title="Consommation par source"
        subtitle="Apport · Crédit · Aides utilisés"
        defaultOpen={false}
        action={{ label: "Voir détail par artisan", onClick: onOpenConsommation }}
      >
        <ConsommationGauge label="Apport"  color="indigo"  cible={apportCible} reel={apportReel}  />
        <ConsommationGauge label="Crédit"  color="orange"  cible={creditCible} reel={creditReel}  />
        <ConsommationGauge label="Aides"   color="emerald" cible={aidesCible}  reel={aidesReel}   />
      </SectionCard>

      {/* Encart explicatif bas de page */}
      <div className="px-4 py-4 bg-gray-50">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          <strong className="text-gray-700">À savoir :</strong> les versements enregistrés se répartissent automatiquement
          (Apport → Crédit → Aides) sauf si vous précisez la source. Pour gérer le détail des paiements,
          allez dans l'onglet <strong>Échéancier</strong>.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini gauge de consommation
// ─────────────────────────────────────────────────────────────────────────────

function ConsommationGauge({ label, color, cible, reel }: {
  label: string;
  color: "indigo" | "orange" | "emerald";
  cible: number;
  reel:  number;
}) {
  const palette = {
    indigo:  { bar: "bg-indigo-500",  text: "text-indigo-700"  },
    orange:  { bar: "bg-orange-500",  text: "text-orange-700"  },
    emerald: { bar: "bg-emerald-500", text: "text-emerald-700" },
  }[color];
  const pct = cible > 0 ? Math.min(100, Math.round((reel / cible) * 100)) : 0;
  const done = cible > 0 && reel >= cible;

  if (cible === 0) {
    return (
      <div className="flex items-center justify-between py-2">
        <p className="text-[12px] text-gray-400">{label}</p>
        <p className="text-[11px] text-gray-300">Non configuré</p>
      </div>
    );
  }

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[12px] font-semibold text-gray-700">{label}</p>
        <p className={`text-[12px] font-extrabold tabular-nums ${palette.text} flex items-center gap-1`}>
          {fmtEur(reel)} / {fmtEur(cible)}
          {done && <Check className="h-3 w-3 text-emerald-500" />}
        </p>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${palette.bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
