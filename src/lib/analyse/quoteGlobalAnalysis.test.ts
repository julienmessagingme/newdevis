/**
 * Tests unitaires pour classifyItem + classifyRowEnriched.
 * Prévient les régressions silencieuses sur les seuils du verdict :
 *   - seuils de classification prix (1.0 / 1.3 / 2.0)
 *   - gardes surface_mismatch, hétérogène, confidence vectorielle, upgrade ligne
 *   - filtres forfait / hors catalogue / theoreticalMax=0 / devisTotal=null
 */

import { describe, it, expect } from 'vitest';
import { classifyItem, classifyRowEnriched } from './quoteGlobalAnalysis';
import type { JobTypeDisplayRow } from '@/hooks/useMarketPriceAPI';

// ── Fixture helper — JobTypeDisplayRow minimal avec override ──────────────
function makeRow(overrides: Partial<JobTypeDisplayRow> = {}): JobTypeDisplayRow {
  return {
    jobTypeLabel: 'Peinture intérieure',
    catalogJobTypes: ['peinture_interieure'],
    mainUnit: 'm²',
    mainQuantity: 50,
    devisLines: [
      { description: 'Peinture murs séjour', quantity: 50, amountHT: 1500, unit: 'm²' },
    ],
    devisTotalHT: 1500,
    theoreticalMinHT: 1000,
    theoreticalAvgHT: 1500,
    theoreticalMaxHT: 2000,
    prices: [
      { job_type: 'peinture_interieure', label: 'Peinture intérieure',
        unit: 'm²', price_min_unit_ht: 20, price_avg_unit_ht: 30, price_max_unit_ht: 40,
        fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, zip_scope: 'national', notes: '' },
    ],
    verdict: null,
    vsAvgPct: null,
    isForfait: false,
    // Confidence high par défaut pour ne pas déclencher la garde vectorielle
    vectorial: {
      top_similarity: 0.90,
      confidence: 'high',
      all_candidates: [],
    },
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// classifyItem — seuils de classification prix
// ══════════════════════════════════════════════════════════════════════════

describe('classifyItem — seuils de classification prix', () => {
  it('marketMax=0 → normal (pas de référence)', () => {
    expect(classifyItem(1000, 0)).toBe('normal');
  });

  it('price ≤ marketMax → normal', () => {
    expect(classifyItem(1000, 2000)).toBe('normal');
    expect(classifyItem(2000, 2000)).toBe('normal'); // borne haute inclusive
  });

  it('ratio 1.0 à 1.3 → legerement_eleve', () => {
    expect(classifyItem(2200, 2000)).toBe('legerement_eleve'); // +10%
    expect(classifyItem(2600, 2000)).toBe('legerement_eleve'); // +30% exact
  });

  it('ratio 1.3 à 2.0 → survalue', () => {
    expect(classifyItem(2601, 2000)).toBe('survalue'); // +30.05%
    expect(classifyItem(3000, 2000)).toBe('survalue'); // +50%
    expect(classifyItem(4000, 2000)).toBe('survalue'); // +100% exact
  });

  it('ratio > 2.0 → anomalie', () => {
    expect(classifyItem(4001, 2000)).toBe('anomalie'); // +100.05%
    expect(classifyItem(6000, 2000)).toBe('anomalie'); // ×3
    expect(classifyItem(20000, 2000)).toBe('anomalie'); // ×10
  });
});

// ══════════════════════════════════════════════════════════════════════════
// classifyRowEnriched — filtres de non-comparabilité (retourne null)
// ══════════════════════════════════════════════════════════════════════════

describe('classifyRowEnriched — cas non comparables', () => {
  it('isForfait → null', () => {
    const row = makeRow({ isForfait: true, devisTotalHT: 3000 });
    expect(classifyRowEnriched(row)).toBeNull();
  });

  it("jobTypeLabel='Autre' (hors catalogue) → null", () => {
    const row = makeRow({ jobTypeLabel: 'Autre' });
    expect(classifyRowEnriched(row)).toBeNull();
  });

  it('theoreticalMaxHT=0 (pas de référence marché) → null', () => {
    const row = makeRow({ theoreticalMaxHT: 0 });
    expect(classifyRowEnriched(row)).toBeNull();
  });

  it('devisTotalHT=null (montant devis non extrait) → null', () => {
    const row = makeRow({ devisTotalHT: null });
    expect(classifyRowEnriched(row)).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// classifyRowEnriched — Garde 4 confidence vectorielle (V3.5.11)
// ══════════════════════════════════════════════════════════════════════════

describe('classifyRowEnriched — garde confidence vectorielle', () => {
  it('confidence medium + ratio modéré → low_confidence_match (downgrade anomalie)', () => {
    const row = makeRow({
      devisTotalHT: 3500, // ratio 1.75 → survalue
      vectorial: { top_similarity: 0.78, confidence: 'medium', all_candidates: [] },
    });
    expect(classifyRowEnriched(row)).toBe('low_confidence_match');
  });

  it('confidence medium + ratio franc ≥ 2 → anomalie (garde bypass)', () => {
    const row = makeRow({
      devisTotalHT: 8000, // ratio 4.0 → anomalie franche, seuil bypass 2.0
      vectorial: { top_similarity: 0.78, confidence: 'medium', all_candidates: [] },
    });
    expect(classifyRowEnriched(row)).toBe('anomalie');
  });

  it('confidence high → classification standard préservée', () => {
    const row = makeRow({
      devisTotalHT: 5000, // ratio 2.5 → anomalie
      vectorial: { top_similarity: 0.92, confidence: 'high', all_candidates: [] },
    });
    expect(classifyRowEnriched(row)).toBe('anomalie');
  });

  it('vectorial=undefined (legacy V3.6) → garde non appliquée', () => {
    const row = makeRow({
      devisTotalHT: 3500, // ratio 1.75 → survalue
      vectorial: undefined,
    });
    expect(classifyRowEnriched(row)).toBe('survalue');
  });

  it('confidence high + normal → normal', () => {
    const row = makeRow({ devisTotalHT: 1500 });
    expect(classifyRowEnriched(row)).toBe('normal');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// classifyRowEnriched — cas globaux
// ══════════════════════════════════════════════════════════════════════════

describe('classifyRowEnriched — cas globaux', () => {
  it('prix dans le marché → normal', () => {
    const row = makeRow({ devisTotalHT: 1500 });
    expect(classifyRowEnriched(row)).toBe('normal');
  });

  it('prix +30% du marketMax → legerement_eleve', () => {
    const row = makeRow({ devisTotalHT: 2500 });
    expect(classifyRowEnriched(row)).toBe('legerement_eleve');
  });

  it('prix +50% du marketMax → survalue', () => {
    const row = makeRow({ devisTotalHT: 3000 });
    expect(classifyRowEnriched(row)).toBe('survalue');
  });

  it('prix ×3 du marketMax → anomalie', () => {
    const row = makeRow({ devisTotalHT: 6000 });
    expect(classifyRowEnriched(row)).toBe('anomalie');
  });
});
