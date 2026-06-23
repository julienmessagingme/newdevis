import { describe, it, expect } from 'vitest';
import {
  buildChantierSummary,
  buildPortfolioTotals,
  type RawChantierRow,
  type RawBudgetResponse,
  type RawPlanningResponse,
  type ChantierSummary,
} from './portfolioSummary';

const NOW = new Date('2026-06-23T12:00:00Z').getTime();

const chantier: RawChantierRow = {
  id: 'c1',
  nom: 'Maison Dupont',
  emoji: '🏠',
  budget: 50000,
  phase: 'gros_oeuvre',
};

const fullBudget: RawBudgetResponse = {
  totaux: { paye: 10000, acompte: 5000, a_payer: 3000, a_venir: 2000 },
};

function planningWith(lots: RawPlanningResponse['lots'], fin?: string | null): RawPlanningResponse {
  return { dateDebutChantier: '2026-01-01', dateFinSouhaitee: fin ?? null, lots };
}

describe('buildChantierSummary', () => {
  it('agrege budget + planning complets', () => {
    const planning = planningWith(
      [
        { id: 'l1', statut: 'termine', date_fin: '2026-05-10' },
        { id: 'l2', statut: 'en_cours', date_fin: '2026-08-15' },
        { id: 'l3', statut: 'a_faire', date_fin: '2026-07-01' },
      ],
      '2026-09-01',
    );
    const s = buildChantierSummary(chantier, fullBudget, planning, NOW);

    expect(s.estimatedEnd).toBe('2026-08-15'); // max des date_fin
    expect(s.lotsCount).toBe(3);
    expect(s.lotsDone).toBe(1); // seul l1 termine
    expect(s.decaisse).toBe(15000); // paye + acompte
    expect(s.aRegler).toBe(3000);
    expect(s.aVenir).toBe(2000);
    expect(s.fluxCertains).toBe(18000); // decaisse + a regler
    expect(s.budgetCible).toBe(50000);
    expect(s.fetchError).toBe(false);
    expect(s.isLate).toBe(false); // estimation 08-15 < objectif 09-01
  });

  it('isLate quand estimation depasse l objectif', () => {
    const planning = planningWith(
      [{ id: 'l1', statut: 'en_cours', date_fin: '2026-10-01' }],
      '2026-09-01',
    );
    const s = buildChantierSummary(chantier, fullBudget, planning, NOW);
    expect(s.isLate).toBe(true);
  });

  it('isLate sans objectif : estimation passee + lots non tous termines', () => {
    const planning = planningWith(
      [{ id: 'l1', statut: 'en_cours', date_fin: '2026-05-01' }], // passe vs NOW (06-23)
      null,
    );
    const s = buildChantierSummary(chantier, fullBudget, planning, NOW);
    expect(s.isLate).toBe(true);
  });

  it('pas de retard sans objectif si tous les lots sont termines', () => {
    const planning = planningWith(
      [{ id: 'l1', statut: 'termine', date_fin: '2026-05-01' }], // passe mais termine
      null,
    );
    const s = buildChantierSummary(chantier, fullBudget, planning, NOW);
    expect(s.isLate).toBe(false);
    expect(s.lotsDone).toBe(1);
  });

  it('planning null : pas de date, pas de retard, lots a 0', () => {
    const s = buildChantierSummary(chantier, fullBudget, null, NOW);
    expect(s.estimatedEnd).toBeNull();
    expect(s.isLate).toBe(false);
    expect(s.lotsCount).toBe(0);
    expect(s.lotsDone).toBe(0);
    expect(s.decaisse).toBe(15000); // budget toujours present
    expect(s.fetchError).toBe(false); // un seul sous-appel null
  });

  it('budget null : KPI a 0 mais planning preserve', () => {
    const planning = planningWith([{ id: 'l1', statut: 'termine', date_fin: '2026-05-01' }], '2026-09-01');
    const s = buildChantierSummary(chantier, null, planning, NOW);
    expect(s.decaisse).toBe(0);
    expect(s.aRegler).toBe(0);
    expect(s.aVenir).toBe(0);
    expect(s.fluxCertains).toBe(0);
    expect(s.lotsCount).toBe(1);
    expect(s.fetchError).toBe(false);
  });

  it('budget ET planning null : fetchError = true, tout a 0', () => {
    const s = buildChantierSummary(chantier, null, null, NOW);
    expect(s.fetchError).toBe(true);
    expect(s.decaisse).toBe(0);
    expect(s.estimatedEnd).toBeNull();
    expect(s.isLate).toBe(false);
  });

  it('budget cible null + 0 lot : pas de crash', () => {
    const s = buildChantierSummary(
      { ...chantier, budget: null },
      { totaux: {} },
      planningWith([], '2026-09-01'),
      NOW,
    );
    expect(s.budgetCible).toBeNull();
    expect(s.decaisse).toBe(0);
    expect(s.lotsCount).toBe(0);
    expect(s.isLate).toBe(false); // pas d'estimation
  });
});

describe('buildPortfolioTotals', () => {
  it('somme les KPI et compte les retards', () => {
    const summaries: ChantierSummary[] = [
      buildChantierSummary(chantier, fullBudget, planningWith([{ id: 'l1', statut: 'en_cours', date_fin: '2026-10-01' }], '2026-09-01'), NOW), // late
      buildChantierSummary({ ...chantier, id: 'c2', budget: 20000 }, { totaux: { paye: 1000, acompte: 0, a_payer: 500, a_venir: 100 } }, planningWith([{ id: 'l2', statut: 'termine', date_fin: '2026-04-01' }], '2026-09-01'), NOW), // not late
    ];
    const t = buildPortfolioTotals(summaries);
    expect(t.chantierCount).toBe(2);
    expect(t.lateCount).toBe(1);
    expect(t.budgetCibleTotal).toBe(70000);
    expect(t.decaisseTotal).toBe(16000); // 15000 + 1000
    expect(t.aReglerTotal).toBe(3500);
    expect(t.aVenirTotal).toBe(2100);
    expect(t.fluxCertainsTotal).toBe(19500);
  });

  it('exclut les chantiers fetchError des agregats financiers (mais les compte)', () => {
    const ok = buildChantierSummary(chantier, fullBudget, planningWith([{ id: 'l1', statut: 'a_faire', date_fin: '2026-10-01' }], '2026-09-01'), NOW); // late
    const broken = buildChantierSummary({ ...chantier, id: 'c2', budget: 99999 }, null, null, NOW);
    const t = buildPortfolioTotals([ok, broken]);
    expect(t.chantierCount).toBe(2);
    expect(t.budgetCibleTotal).toBe(50000); // 99999 du chantier casse exclu
    expect(t.decaisseTotal).toBe(15000);
    expect(t.lateCount).toBe(1);
  });

  it('portefeuille vide', () => {
    const t = buildPortfolioTotals([]);
    expect(t.chantierCount).toBe(0);
    expect(t.lateCount).toBe(0);
    expect(t.fluxCertainsTotal).toBe(0);
  });
});
