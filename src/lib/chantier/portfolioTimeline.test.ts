import { describe, it, expect } from 'vitest';
import { buildPortfolioTimeline, nowMarkerPct } from './portfolioTimeline';
import type { ChantierSummary } from './portfolioSummary';

const NOW = new Date('2026-06-23T12:00:00Z').getTime();

function sum(p: Partial<ChantierSummary> & { id: string }): ChantierSummary {
  return {
    nom: 'Chantier', emoji: '🏠', phase: 'gros_oeuvre',
    dateDebutChantier: null, dateFinSouhaitee: null, estimatedEnd: null,
    isLate: false, lotsCount: 0, lotsDone: 0,
    budgetCible: null, decaisse: 0, aRegler: 0, aVenir: 0, fluxCertains: 0,
    fetchError: false,
    ...p,
  };
}

describe('buildPortfolioTimeline', () => {
  it('positionne les chantiers dates sur une plage commune', () => {
    const t = buildPortfolioTimeline([
      sum({ id: 'a', dateDebutChantier: '2026-05-01', estimatedEnd: '2026-07-01' }),
      sum({ id: 'b', dateDebutChantier: '2026-06-01', estimatedEnd: '2026-09-01' }),
    ], NOW);
    expect(t.bars).toHaveLength(2);
    expect(t.undated).toHaveLength(0);
    // La plage englobe la 1ere date et la derniere.
    expect(t.rangeStartMs).toBeLessThan(new Date('2026-05-01').getTime());
    expect(t.rangeEndMs).toBeGreaterThan(new Date('2026-09-01').getTime());
    for (const bar of t.bars) {
      expect(bar.leftPct).toBeGreaterThanOrEqual(0);
      expect(bar.leftPct + bar.widthPct).toBeLessThanOrEqual(100.01);
      expect(bar.widthPct).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('met les chantiers sans date dans undated, hors frise', () => {
    const t = buildPortfolioTimeline([
      sum({ id: 'a', dateDebutChantier: '2026-05-01', estimatedEnd: '2026-07-01' }),
      sum({ id: 'b' }), // aucune date
    ], NOW);
    expect(t.bars).toHaveLength(1);
    expect(t.undated.map((u) => u.id)).toEqual(['b']);
  });

  it('trie les retards en premier', () => {
    const t = buildPortfolioTimeline([
      sum({ id: 'ok', dateDebutChantier: '2026-05-01', estimatedEnd: '2026-07-01', isLate: false }),
      sum({ id: 'late', dateDebutChantier: '2026-05-01', estimatedEnd: '2026-12-01', isLate: true }),
    ], NOW);
    expect(t.bars[0].id).toBe('late');
  });

  it('barre courte quand seule la fin est connue (pas de debut)', () => {
    const t = buildPortfolioTimeline([
      sum({ id: 'a', dateDebutChantier: null, estimatedEnd: '2026-07-01' }),
    ], NOW);
    expect(t.bars).toHaveLength(1);
    expect(t.bars[0].endMs).toBe(new Date('2026-07-01').getTime());
    expect(t.bars[0].startMs).toBeLessThan(t.bars[0].endMs);
  });

  it('aucun chantier date -> plage par defaut autour de now, bars vide', () => {
    const t = buildPortfolioTimeline([sum({ id: 'a' })], NOW);
    expect(t.bars).toHaveLength(0);
    expect(t.undated).toHaveLength(1);
    expect(t.rangeStartMs).toBe(NOW);
  });
});

describe('nowMarkerPct', () => {
  it('positionne aujourd hui dans la plage', () => {
    const t = buildPortfolioTimeline([
      sum({ id: 'a', dateDebutChantier: '2026-05-01', estimatedEnd: '2026-09-01' }),
    ], NOW);
    const pct = nowMarkerPct(t, NOW);
    expect(pct).not.toBeNull();
    expect(pct!).toBeGreaterThan(0);
    expect(pct!).toBeLessThan(100);
  });

  it('retourne null si le marqueur interroge est hors de la plage construite', () => {
    // La plage est batie autour de NOW (debut 2026) ; un instant tres futur tombe hors plage.
    const t = buildPortfolioTimeline([
      sum({ id: 'a', dateDebutChantier: '2026-05-01', estimatedEnd: '2026-09-01' }),
    ], NOW);
    expect(nowMarkerPct(t, new Date('2035-01-01').getTime())).toBeNull();
  });
});
