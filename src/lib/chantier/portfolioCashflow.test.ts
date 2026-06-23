import { describe, it, expect } from 'vitest';
import { bucketCashflowByMonth, type CashflowEvent } from './portfolioCashflow';

const NOW = new Date('2026-06-23T12:00:00Z').getTime();

describe('bucketCashflowByMonth', () => {
  it('ventile les sorties par mois et separe paid / pending', () => {
    const events: CashflowEvent[] = [
      { dueDate: '2026-07-10', amount: 1000, paid: false },
      { dueDate: '2026-07-25', amount: 500, paid: false },
      { dueDate: '2026-07-05', amount: 2000, paid: true },
      { dueDate: '2026-08-01', amount: 800, paid: false },
    ];
    const r = bucketCashflowByMonth(events, NOW);
    expect(r.months).toHaveLength(2);
    expect(r.months[0].month).toBe('2026-07');
    expect(r.months[0].pending).toBe(1500);
    expect(r.months[0].paid).toBe(2000);
    expect(r.months[1].month).toBe('2026-08');
    expect(r.months[1].pending).toBe(800);
    expect(r.totalPending).toBe(2300);
    expect(r.totalPaid).toBe(2000);
    expect(r.peak).toBe(3500); // juillet = 1500 + 2000
  });

  it('tri chronologique', () => {
    const events: CashflowEvent[] = [
      { dueDate: '2026-09-01', amount: 100, paid: false },
      { dueDate: '2026-05-01', amount: 100, paid: false },
      { dueDate: '2026-07-01', amount: 100, paid: false },
    ];
    const r = bucketCashflowByMonth(events, NOW);
    expect(r.months.map((m) => m.month)).toEqual(['2026-05', '2026-07', '2026-09']);
  });

  it('marque les mois passes', () => {
    const events: CashflowEvent[] = [
      { dueDate: '2026-05-01', amount: 100, paid: true },  // passe (avant juin)
      { dueDate: '2026-06-15', amount: 100, paid: false }, // mois courant
      { dueDate: '2026-08-01', amount: 100, paid: false }, // futur
    ];
    const r = bucketCashflowByMonth(events, NOW);
    expect(r.months.find((m) => m.month === '2026-05')!.isPast).toBe(true);
    expect(r.months.find((m) => m.month === '2026-06')!.isPast).toBe(false);
    expect(r.months.find((m) => m.month === '2026-08')!.isPast).toBe(false);
  });

  it('ignore les events sans date ou montant <= 0', () => {
    const events: CashflowEvent[] = [
      { dueDate: null, amount: 1000, paid: false },
      { dueDate: '2026-07-01', amount: 0, paid: false },
      { dueDate: '2026-07-01', amount: -50, paid: false },
      { dueDate: 'pas-une-date', amount: 100, paid: false },
      { dueDate: '2026-07-01', amount: 300, paid: false },
    ];
    const r = bucketCashflowByMonth(events, NOW);
    expect(r.months).toHaveLength(1);
    expect(r.months[0].pending).toBe(300);
    expect(r.totalPending).toBe(300);
  });

  it('libelle FR court', () => {
    const r = bucketCashflowByMonth([{ dueDate: '2026-07-10', amount: 100, paid: false }], NOW);
    expect(r.months[0].label).toBe('juil. 2026');
  });

  it('aucun event -> vide', () => {
    const r = bucketCashflowByMonth([], NOW);
    expect(r.months).toHaveLength(0);
    expect(r.totalPending).toBe(0);
    expect(r.peak).toBe(0);
  });
});
