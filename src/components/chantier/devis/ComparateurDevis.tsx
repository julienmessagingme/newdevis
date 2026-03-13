import { X, ExternalLink, Download, Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { Quote } from '@/utils/devis/compareQuotes';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatMontant(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Calcule l'écart en % entre un montant et le budget estimé.
 * Positif = au-dessus du budget, négatif = en dessous.
 */
function ecartPct(montant: number, budget: number): number | null {
  if (!budget) return null;
  return Math.round(((montant - budget) / budget) * 100);
}

// ── Types internes ─────────────────────────────────────────────────────────────

interface RowStatus {
  isCheapest:     boolean;
  isMostExpensive: boolean;
}

function getRowStatuses(devis: Quote[]): Map<string, RowStatus> {
  const withMontant = devis.filter((q) => q.montant !== null);
  const map = new Map<string, RowStatus>();

  if (withMontant.length < 2) {
    // Pas assez de données pour comparer → aucune mise en valeur
    devis.forEach((q) => map.set(q.id, { isCheapest: false, isMostExpensive: false }));
    return map;
  }

  const sorted = [...withMontant].sort((a, b) => (a.montant ?? 0) - (b.montant ?? 0));
  const minId  = sorted[0].id;
  const maxId  = sorted[sorted.length - 1].id;

  devis.forEach((q) => map.set(q.id, {
    isCheapest:      q.id === minId,
    isMostExpensive: q.id === maxId,
  }));

  return map;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface ComparateurDevisProps {
  /** Liste des devis à comparer (issus de compareQuotes) */
  devis:    Quote[];
  /** Budget estimé du lot en € — sert au calcul d'écart */
  budget:   number;
  /** Ferme le panneau comparateur */
  onClose?: () => void;
}

// ── Composant ──────────────────────────────────────────────────────────────────

export default function ComparateurDevis({
  devis,
  budget,
  onClose,
}: ComparateurDevisProps) {
  if (!devis.length) return null;

  const statuses    = getRowStatuses(devis);
  const hasMontants = devis.some((q) => q.montant !== null);

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-[#0d1a35] overflow-hidden">

      {/* ── En-tête ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <span className="text-base">📊</span>
        <span className="text-sm font-semibold text-white flex-1">
          Comparatif des devis
        </span>
        <span className="text-xs text-slate-500 font-medium">
          {devis.length} devis
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-1 p-1 text-slate-600 hover:text-slate-300 hover:bg-white/[0.06] rounded-md transition-all"
            aria-label="Fermer le comparatif"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Note si montants non disponibles ── */}
      {!hasMontants && (
        <p className="px-4 py-3 text-xs text-slate-500 italic">
          Les montants n'ont pas pu être extraits automatiquement depuis les noms de fichiers.
          Ouvrez les devis pour les consulter.
        </p>
      )}

      {/* ── Tableau ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.05]">
              <th className="text-left px-4 py-2.5 text-slate-500 font-semibold uppercase tracking-wider w-full">
                Fichier
              </th>
              {hasMontants && (
                <>
                  <th className="text-right px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-wider whitespace-nowrap">
                    Montant
                  </th>
                  <th className="text-right px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-wider whitespace-nowrap">
                    Écart budget
                  </th>
                </>
              )}
              <th className="text-right px-3 py-2.5 text-slate-500 font-semibold uppercase tracking-wider whitespace-nowrap">
                Date
              </th>
              <th className="px-3 py-2.5" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {devis.map((quote) => (
              <QuoteRow
                key={quote.id}
                quote={quote}
                budget={budget}
                status={statuses.get(quote.id) ?? { isCheapest: false, isMostExpensive: false }}
                hasMontants={hasMontants}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Légende ── */}
      {hasMontants && (
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-white/[0.05]">
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
            <Trophy className="h-3 w-3" />
            Le moins cher
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            Budget estimé : {formatMontant(budget)}&thinsp;€
          </span>
        </div>
      )}
    </div>
  );
}

// ── Sous-composant ligne ───────────────────────────────────────────────────────

function QuoteRow({
  quote,
  budget,
  status,
  hasMontants,
}: {
  quote:        Quote;
  budget:       number;
  status:       RowStatus;
  hasMontants:  boolean;
}) {
  const { isCheapest, isMostExpensive } = status;

  // Couleur de fond selon rang
  const rowBg = isCheapest
    ? 'bg-emerald-500/[0.06]'
    : isMostExpensive
    ? 'bg-red-500/[0.05]'
    : '';

  // Écart budget
  const ecart = quote.montant !== null ? ecartPct(quote.montant, budget) : null;

  // Icône + couleur écart
  const EcartIcon = ecart === null || ecart === 0
    ? Minus
    : ecart < 0
    ? TrendingDown
    : TrendingUp;
  const ecartColor = ecart === null
    ? 'text-slate-600'
    : ecart <= 0
    ? 'text-emerald-400'
    : ecart <= 15
    ? 'text-amber-400'
    : 'text-red-400';

  return (
    <tr className={`transition-colors hover:bg-white/[0.03] ${rowBg}`}>

      {/* Nom du fichier + badge */}
      <td className="px-4 py-3">
        <div className="flex items-start gap-2">
          {isCheapest && (
            <Trophy className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
          )}
          <span
            className={`leading-snug line-clamp-2 ${
              isCheapest ? 'text-white font-medium' : 'text-slate-300'
            }`}
          >
            {quote.nom}
          </span>
        </div>
        {isCheapest && (
          <span className="inline-block mt-1 text-[10px] bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 rounded-full px-1.5 py-0.5 font-medium">
            Le moins cher
          </span>
        )}
      </td>

      {/* Montant */}
      {hasMontants && (
        <td className="px-3 py-3 text-right whitespace-nowrap">
          {quote.montant !== null ? (
            <span className={`font-semibold ${isCheapest ? 'text-emerald-300' : 'text-slate-200'}`}>
              {formatMontant(quote.montant)}&thinsp;€
            </span>
          ) : (
            <span className="text-slate-600">–</span>
          )}
        </td>
      )}

      {/* Écart budget */}
      {hasMontants && (
        <td className="px-3 py-3 text-right whitespace-nowrap">
          {ecart !== null ? (
            <span className={`inline-flex items-center gap-1 font-medium ${ecartColor}`}>
              <EcartIcon className="h-3 w-3 shrink-0" />
              {ecart === 0 ? '=' : `${ecart > 0 ? '+' : ''}${ecart}%`}
            </span>
          ) : (
            <span className="text-slate-600">–</span>
          )}
        </td>
      )}

      {/* Date */}
      <td className="px-3 py-3 text-right whitespace-nowrap text-slate-500">
        {formatDate(quote.date)}
      </td>

      {/* Actions */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1 justify-end">
          {quote.analyse_id && (
            <a
              href={`/analyse/${quote.analyse_id}`}
              className="p-1.5 text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-all"
              title="Voir l'analyse"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {quote.signedUrl && (
            <button
              onClick={() => window.open(quote.signedUrl!, '_blank', 'noopener,noreferrer')}
              className="p-1.5 text-slate-600 hover:text-blue-300 hover:bg-blue-500/10 rounded-md transition-all"
              title="Ouvrir le fichier"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
