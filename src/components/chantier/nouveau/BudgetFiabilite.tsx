import { Info } from 'lucide-react';
import type { ChantierIAResult, EstimationSignaux } from '@/types/chantier-ia';

// ── Score & niveaux ────────────────────────────────────────────────────────────

/**
 * Calcule le score de fiabilité (0-100) à partir des signaux factuels.
 * Aucun signal = aucune précision cosmétique.
 *
 * Barème :
 *   hasLocalisation  → 25 pts  (zone géo utilisée)
 *   hasBudget        → 25 pts  (budget cible connu)
 *   hasSurface       → 20 pts  (dimensions précisées)
 *   typeProjetPrecis → 15 pts  (type ≠ 'autre')
 *   nbLignesBudget≥3 → 15 pts  (détail budgétaire riche)
 *   ─────────────────────────
 *   Total max        = 100 pts
 */
function computeScore(s: EstimationSignaux): number {
  let score = 0;
  if (s.hasLocalisation) score += 25;
  if (s.hasBudget)       score += 25;
  if (s.hasSurface)      score += 20;
  if (s.typeProjetPrecis) score += 15;
  if (s.nbLignesBudget >= 3) score += 15;
  return score;
}

type Niveau = 'indicative' | 'cadrage' | 'fiable';

function getNiveau(score: number): Niveau {
  if (score >= 70) return 'fiable';
  if (score >= 40) return 'cadrage';
  return 'indicative';
}

const NIVEAU_CONFIG: Record<Niveau, { label: string; badgeClass: string; barClass: string; dotClass: string }> = {
  indicative: {
    label: 'Estimation indicative',
    badgeClass: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
    barClass:   'bg-amber-500',
    dotClass:   'bg-amber-400',
  },
  cadrage: {
    label: 'Estimation de cadrage',
    badgeClass: 'bg-blue-500/15 text-blue-300 border border-blue-500/25',
    barClass:   'bg-blue-500',
    dotClass:   'bg-blue-400',
  },
  fiable: {
    label: 'Estimation fiable',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
    barClass:   'bg-emerald-500',
    dotClass:   'bg-emerald-400',
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Construit les listes "connu" / "manquant" depuis les signaux */
function buildLists(s: EstimationSignaux): {
  knownItems: string[];
  missingItems: string[];
} {
  const knownItems: string[] = [];
  const missingItems: string[] = [];

  if (s.hasLocalisation) {
    knownItems.push('Zone géographique prise en compte');
  } else {
    missingItems.push('Localisation non renseignée — coefficients nationaux utilisés');
  }

  if (s.hasBudget) {
    knownItems.push('Budget cible renseigné');
  } else {
    missingItems.push('Budget cible non renseigné');
  }

  if (s.hasSurface) {
    knownItems.push('Surface ou dimensions précisées');
  } else {
    missingItems.push('Surface ou dimensions non précisées');
  }

  if (s.typeProjetPrecis) {
    knownItems.push('Type de projet identifié');
  } else {
    missingItems.push('Type de projet non précisé');
  }

  // hasDate affiché comme info bonus si connu, silencieux sinon (pas dans le score)
  if (s.hasDate) {
    knownItems.push('Date de démarrage renseignée');
  }

  return { knownItems, missingItems };
}

// ── Composant principal ────────────────────────────────────────────────────────

interface BudgetFiabiliteProps {
  result: ChantierIAResult;
  onAmeliorer: () => void;
}

export default function BudgetFiabilite({ result, onAmeliorer }: BudgetFiabiliteProps) {
  const signals = result.estimationSignaux;

  // ── Fallback pour anciens chantiers sans signaux ──────────────────────────
  if (!signals) {
    return (
      <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-4 mb-5 flex items-start gap-2.5">
        <Info className="h-3.5 w-3.5 text-slate-600 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed">
          Estimation indicative — données de fiabilité non disponibles pour ce chantier.{' '}
          <button
            onClick={onAmeliorer}
            className="text-blue-500/70 hover:text-blue-400 transition-colors underline underline-offset-2"
          >
            Régénérer le plan
          </button>{' '}
          pour obtenir un score de précision.
        </p>
      </div>
    );
  }

  // ── Score et niveau ──────────────────────────────────────────────────────
  const score = computeScore(signals);
  const niveau = getNiveau(score);
  const cfg = NIVEAU_CONFIG[niveau];
  const { knownItems, missingItems } = buildLists(signals);

  return (
    <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-5 mb-5">

      {/* En-tête : titre + badge niveau */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">
          Fiabilité de l'estimation
        </span>
        <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${cfg.badgeClass}`}>
          {cfg.label}
        </span>
      </div>

      {/* Barre de progression */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-slate-600">Score de précision</span>
          <span className="text-white font-semibold">{score} / 100</span>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${cfg.barClass}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      {/* Deux colonnes : connu / manquant */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-4">

        {/* Ce que nous savons */}
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2 font-medium">
            Ce que nous savons
          </p>
          {knownItems.length > 0 ? (
            <ul className="space-y-1.5">
              {knownItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                  <span className="text-emerald-400 shrink-0 mt-px">✓</span>
                  <span className="leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-600">Aucune information précise disponible</p>
          )}
        </div>

        {/* Ce qu'il nous manque */}
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2 font-medium">
            Ce qu'il nous manque
          </p>
          {missingItems.length > 0 ? (
            <ul className="space-y-1.5">
              {missingItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                  <span className="text-amber-400/60 shrink-0 mt-px">○</span>
                  <span className="leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-emerald-500/70">
              Toutes les informations clés sont renseignées
            </p>
          )}
        </div>
      </div>

      {/* Note de bas + CTA affiner */}
      <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Estimation indicative basée sur les références VerifierMonDevis
        </p>
        {missingItems.length > 0 && (
          <button
            onClick={onAmeliorer}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium shrink-0 transition-colors"
          >
            Affiner →
          </button>
        )}
      </div>
    </div>
  );
}
