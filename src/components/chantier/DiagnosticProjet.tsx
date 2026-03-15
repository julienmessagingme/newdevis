import { useMemo } from 'react';
import { TrendingUp, ShieldCheck, ShieldAlert, Activity } from 'lucide-react';
import type { ChantierIAResult } from '@/types/chantier-ia';

// ── Props ─────────────────────────────────────────────────────────────────────

interface DiagnosticProjetProps {
  result: ChantierIAResult;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('fr-FR');
}

// Fourchette marché agrégée depuis les lots (budget_min/avg/max_ht)
function getMarketRange(result: ChantierIAResult): { min: number; max: number } | null {
  const lots = result.lots ?? [];
  if (!lots.length) return null;

  let min = 0;
  let max = 0;
  let hasData = false;

  for (const lot of lots) {
    if (lot.budget_min_ht != null && lot.budget_max_ht != null) {
      min += lot.budget_min_ht;
      max += lot.budget_max_ht;
      hasData = true;
    }
  }

  return hasData ? { min: Math.round(min * 1.2), max: Math.round(max * 1.2) } : null; // +20% TTC
}

// Indice de maîtrise du projet (0-100)
function getMaitrise(result: ChantierIAResult): { score: number; label: string; color: string } {
  let pts = 0;
  let total = 0;

  // 1. Artisans identifiés
  const nbLots = (result.lots ?? []).length || (result.artisans ?? []).length;
  const nbOk   = (result.lots ?? []).filter((l) => l.statut === 'ok').length;
  total += 25;
  if (nbLots > 0) pts += Math.round((nbOk / nbLots) * 25);

  // 2. Tâches complétées
  const taches = result.taches ?? [];
  total += 20;
  if (taches.length > 0) {
    pts += Math.round((taches.filter((t) => t.done).length / taches.length) * 20);
  }

  // 3. Formalités connues
  total += 15;
  if ((result.formalites ?? []).length > 0) pts += 15;

  // 4. Budget cohérent avec le marché
  const range = getMarketRange(result);
  total += 20;
  if (range) {
    const budget = result.budgetTotal;
    if (budget >= range.min && budget <= range.max * 1.1) pts += 20;
    else if (budget >= range.min * 0.85) pts += 10;
  } else {
    pts += 10; // Pas de données marché = on ne pénalise pas
  }

  // 5. Roadmap définie
  total += 10;
  if ((result.roadmap ?? []).length > 0) pts += 10;

  // 6. Aides identifiées
  total += 10;
  if ((result.aides ?? []).some((a) => a.eligible)) pts += 10;

  const score = Math.round((pts / total) * 100);

  if (score >= 75) return { score, label: 'Bien maîtrisé', color: 'emerald' };
  if (score >= 50) return { score, label: 'En bonne voie',  color: 'blue'    };
  if (score >= 30) return { score, label: 'À consolider',   color: 'amber'   };
  return                   { score, label: 'À structurer',  color: 'rose'    };
}

type Point = { type: 'ok' | 'warn'; label: string };

function getPoints(result: ChantierIAResult): Point[] {
  const points: Point[] = [];
  const range = getMarketRange(result);

  // Points positifs
  const nbOk = (result.lots ?? []).filter((l) => l.statut === 'ok').length;
  if (nbOk > 0) {
    points.push({ type: 'ok', label: `${nbOk} artisan${nbOk > 1 ? 's' : ''} confirmé${nbOk > 1 ? 's' : ''}` });
  }
  if ((result.aides ?? []).some((a) => a.eligible)) {
    const total = (result.aides ?? []).filter((a) => a.eligible && a.montant).reduce((s, a) => s + (a.montant ?? 0), 0);
    points.push({ type: 'ok', label: `Aides disponibles${total > 0 ? ` (~${fmt(total)} €)` : ''}` });
  }
  if (range && result.budgetTotal >= range.min && result.budgetTotal <= range.max * 1.1) {
    points.push({ type: 'ok', label: 'Budget cohérent avec le marché' });
  }
  if ((result.roadmap ?? []).length > 0) {
    points.push({ type: 'ok', label: 'Planning des phases défini' });
  }
  const taches = result.taches ?? [];
  const doneTaches = taches.filter((t) => t.done).length;
  if (doneTaches > 0) {
    points.push({ type: 'ok', label: `${doneTaches} tâche${doneTaches > 1 ? 's' : ''} complétée${doneTaches > 1 ? 's' : ''}` });
  }

  // Points de vigilance
  const nbATrouver = (result.lots ?? []).filter((l) => !l.id?.startsWith('fallback-') && l.statut === 'a_trouver').length;
  if (nbATrouver > 0) {
    points.push({ type: 'warn', label: `${nbATrouver} lot${nbATrouver > 1 ? 's' : ''} sans artisan` });
  }
  if (range && result.budgetTotal > range.max * 1.1) {
    points.push({ type: 'warn', label: 'Budget au-dessus de la fourchette marché' });
  }
  if (range && result.budgetTotal < range.min * 0.85) {
    points.push({ type: 'warn', label: 'Budget potentiellement sous-estimé' });
  }
  const nbObligatoires = (result.formalites ?? []).filter((f) => f.obligatoire).length;
  if (nbObligatoires > 0) {
    points.push({ type: 'warn', label: `${nbObligatoires} formalité${nbObligatoires > 1 ? 's' : ''} obligatoire${nbObligatoires > 1 ? 's' : ''} à traiter` });
  }
  const urgentes = (result.taches ?? []).filter((t) => !t.done && t.priorite === 'urgent').length;
  if (urgentes > 0) {
    points.push({ type: 'warn', label: `${urgentes} tâche${urgentes > 1 ? 's' : ''} urgente${urgentes > 1 ? 's' : ''} en attente` });
  }

  return points.slice(0, 6); // max 6 points affichés
}

// ── Barre de progression colorée ─────────────────────────────────────────────

const MAITRISE_COLORS: Record<string, { bar: string; text: string; bg: string; border: string }> = {
  emerald: { bar: 'from-emerald-500 to-teal-400',   text: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  blue:    { bar: 'from-blue-500 to-cyan-400',       text: 'text-blue-300',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20'    },
  amber:   { bar: 'from-amber-500 to-yellow-400',    text: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20'   },
  rose:    { bar: 'from-rose-500 to-pink-400',       text: 'text-rose-300',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20'    },
};

// ── Composant ─────────────────────────────────────────────────────────────────

export default function DiagnosticProjet({ result }: DiagnosticProjetProps) {
  const range    = useMemo(() => getMarketRange(result), [result]);
  const maitrise = useMemo(() => getMaitrise(result),    [result]);
  const points   = useMemo(() => getPoints(result),      [result]);
  const colors   = MAITRISE_COLORS[maitrise.color];

  const okPoints   = points.filter((p) => p.type === 'ok');
  const warnPoints = points.filter((p) => p.type === 'warn');

  return (
    <div className="bg-[#0d1525] border border-white/[0.07] rounded-2xl p-5 space-y-5">

      {/* En-tête */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
          <Activity className="h-4 w-4 text-blue-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">Diagnostic du projet</h3>
          <p className="text-slate-500 text-xs mt-0.5">Analyse instantanée de votre chantier</p>
        </div>
      </div>

      {/* Ligne budget + fourchette */}
      <div className="grid grid-cols-2 gap-3">
        {/* Budget estimé */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5">
          <p className="text-slate-500 text-[11px] uppercase tracking-wider font-medium mb-1">Budget estimé</p>
          <p className="text-white font-bold text-xl leading-none">
            {fmt(result.budgetTotal)}&thinsp;€
          </p>
          <p className="text-slate-500 text-[11px] mt-1">TTC</p>
        </div>

        {/* Fourchette marché */}
        <div className={`rounded-xl p-3.5 border ${
          range
            ? (result.budgetTotal >= range.min && result.budgetTotal <= range.max * 1.1
                ? 'bg-emerald-500/[0.06] border-emerald-500/20'
                : result.budgetTotal > range.max * 1.1
                  ? 'bg-amber-500/[0.06] border-amber-500/20'
                  : 'bg-blue-500/[0.06] border-blue-500/20')
            : 'bg-white/[0.03] border-white/[0.06]'
        }`}>
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="h-3 w-3 text-slate-500" />
            <p className="text-slate-500 text-[11px] uppercase tracking-wider font-medium">Fourchette marché</p>
          </div>
          {range ? (
            <>
              <p className="text-white font-bold text-xl leading-none">
                {Math.round(range.min / 1000)}k – {Math.round(range.max / 1000)}k&thinsp;€
              </p>
              <p className="text-slate-500 text-[11px] mt-1">TTC estimé</p>
            </>
          ) : (
            <p className="text-slate-500 text-xs mt-1">Données insuffisantes</p>
          )}
        </div>
      </div>

      {/* Indice de maîtrise */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-400 text-xs font-medium flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Indice de maîtrise du projet
          </span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${colors.text}`}>{maitrise.label}</span>
            <span className="text-white font-bold text-sm">{maitrise.score}&nbsp;%</span>
          </div>
        </div>
        <div className="h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${colors.bar} rounded-full transition-all duration-700`}
            style={{ width: `${Math.max(maitrise.score, 3)}%` }}
          />
        </div>
      </div>

      {/* Points positifs + vigilance */}
      {(okPoints.length > 0 || warnPoints.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">

          {/* Positifs */}
          {okPoints.length > 0 && (
            <div>
              <p className="text-emerald-400 text-[11px] uppercase tracking-wider font-semibold mb-2 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Points positifs
              </p>
              <ul className="space-y-1.5">
                {okPoints.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <span className="text-emerald-400 mt-0.5 shrink-0">✔</span>
                    {p.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Vigilance */}
          {warnPoints.length > 0 && (
            <div>
              <p className="text-amber-400 text-[11px] uppercase tracking-wider font-semibold mb-2 flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" /> Points de vigilance
              </p>
              <ul className="space-y-1.5">
                {warnPoints.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <span className="text-amber-400 mt-0.5 shrink-0">⚠</span>
                    {p.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
