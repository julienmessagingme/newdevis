// Coeur PUR de la phase 3 du portefeuille : positionnement des chantiers sur une
// frise temporelle commune (1 chantier = 1 barre debut -> livraison estimee).
//
// Aucun import Supabase/fetch/env. Reutilise les champs deja exposes par
// ChantierSummary (dateDebutChantier, estimatedEnd, isLate) : on ne recalcule
// aucune date, on les positionne seulement sur une echelle partagee.

import type { ChantierSummary } from './portfolioSummary';

export interface TimelineBar {
  id: string;
  nom: string;
  emoji: string;
  isLate: boolean;
  /** Position de la barre en % de la largeur de la frise. */
  leftPct: number;
  widthPct: number;
  startMs: number;
  endMs: number;
}

export interface PortfolioTimeline {
  /** Bornes de la frise (epoch ms). */
  rangeStartMs: number;
  rangeEndMs: number;
  bars: TimelineBar[];
  /** Chantiers sans aucune date exploitable (affiches a part, hors frise). */
  undated: { id: string; nom: string; emoji: string }[];
}

const DAY = 86_400_000;
/** Largeur minimale d'une barre (en %) pour rester cliquable meme tres courte. */
const MIN_BAR_PCT = 1.5;

function toMs(d: string | null): number {
  if (!d) return NaN;
  const ms = new Date(d).getTime();
  return Number.isNaN(ms) ? NaN : ms;
}

/**
 * Resout la fenetre [debut, fin] d'un chantier pour la frise :
 *  - fin   = estimatedEnd (livraison estimee)
 *  - debut = dateDebutChantier si presente, sinon on retombe sur fin (barre courte)
 * Retourne null si aucune date exploitable (chantier non date).
 */
function resolveWindow(s: ChantierSummary): { startMs: number; endMs: number } | null {
  const endMs = toMs(s.estimatedEnd);
  const startRaw = toMs(s.dateDebutChantier);
  if (Number.isNaN(endMs) && Number.isNaN(startRaw)) return null;
  if (Number.isNaN(endMs)) return { startMs: startRaw, endMs: startRaw + DAY };
  const startMs = Number.isNaN(startRaw) || startRaw > endMs ? endMs - DAY : startRaw;
  return { startMs, endMs };
}

/**
 * Construit la frise portefeuille a partir des resumes chantier.
 * La plage englobe toutes les fenetres + `nowMs` (pour que "aujourd'hui" soit
 * toujours visible). Les chantiers non dates sont renvoyes a part (jamais
 * positionnes a tort).
 */
export function buildPortfolioTimeline(
  summaries: ChantierSummary[],
  nowMs: number = Date.now(),
): PortfolioTimeline {
  const dated: { s: ChantierSummary; startMs: number; endMs: number }[] = [];
  const undated: { id: string; nom: string; emoji: string }[] = [];

  for (const s of summaries) {
    const w = resolveWindow(s);
    if (!w) { undated.push({ id: s.id, nom: s.nom, emoji: s.emoji }); continue; }
    dated.push({ s, ...w });
  }

  if (dated.length === 0) {
    return { rangeStartMs: nowMs, rangeEndMs: nowMs + DAY, bars: [], undated };
  }

  let minMs = nowMs;
  let maxMs = nowMs;
  for (const d of dated) {
    if (d.startMs < minMs) minMs = d.startMs;
    if (d.endMs > maxMs) maxMs = d.endMs;
  }
  // Marge de respiration ~3% de chaque cote (au moins 1 jour).
  const pad = Math.max(DAY, (maxMs - minMs) * 0.03);
  const rangeStartMs = minMs - pad;
  const rangeEndMs = maxMs + pad;
  const span = rangeEndMs - rangeStartMs || DAY;

  const bars: TimelineBar[] = dated.map(({ s, startMs, endMs }) => {
    const leftPct = ((startMs - rangeStartMs) / span) * 100;
    const widthPct = Math.max(MIN_BAR_PCT, ((endMs - startMs) / span) * 100);
    return {
      id: s.id,
      nom: s.nom,
      emoji: s.emoji,
      isLate: s.isLate,
      leftPct: Math.max(0, Math.min(100, leftPct)),
      widthPct: Math.min(100, widthPct),
      startMs,
      endMs,
    };
  });

  // Retards d'abord, puis par date de fin.
  bars.sort((a, b) => (Number(b.isLate) - Number(a.isLate)) || (a.endMs - b.endMs));

  return { rangeStartMs, rangeEndMs, bars, undated };
}

/** Position en % de `nowMs` sur la frise (pour le repere "aujourd'hui"). null si hors plage. */
export function nowMarkerPct(timeline: PortfolioTimeline, nowMs: number = Date.now()): number | null {
  const { rangeStartMs, rangeEndMs } = timeline;
  if (nowMs < rangeStartMs || nowMs > rangeEndMs) return null;
  const span = rangeEndMs - rangeStartMs || DAY;
  return ((nowMs - rangeStartMs) / span) * 100;
}
