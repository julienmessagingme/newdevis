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
      { index: 0, description: 'Peinture murs séjour', quantity: 50, amountHT: 1500, unit: 'm²' },
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

  it('confidence medium + ratio franc ≥ 2 → low_confidence_match aussi (2026-08-27, cas ZANNOU v2)', () => {
    // L'ancien override « anomalie franche » gardait la carte ROUGE en medium
    // dès ratio ≥ 2×. Prémisse démentie (élimination amiante 1 000 € matchée
    // à Diagnostic amiante 80-180 € = ratio 5,6× ET matching faux), et le
    // verdict (V3.5.13) excluait déjà ces groupes → carte rouge sous verdict
    // VERT = statuts contradictoires interdits (Maillon 3).
    const row = makeRow({
      devisTotalHT: 8000, // ratio 4.0 — même franc, medium ≠ jamais rouge
      vectorial: { top_similarity: 0.78, confidence: 'medium', all_candidates: [] },
    });
    expect(classifyRowEnriched(row)).toBe('low_confidence_match');
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

  // ── 2026-09-10 (cas AQUIVOLTAIQUE) — LE DOUTE VAUT DANS LES DEUX SENS ────
  //
  // La garde ne se déclenchait que sur `anomalie` et `survalue` : on refusait
  // d'accuser sur un rapprochement incertain, mais on continuait d'absoudre
  // dessus. Le poste ressortait « normal », donc compté « Prix correct » en
  // vert, sur la page même où le verdict annonçait n'avoir aucune référence.
  it('confidence medium + prix DANS la fourchette → non vérifiable, PAS « normal »', () => {
    const row = makeRow({
      devisTotalHT: 1500, // pile la moyenne : « normal » sous l'ancienne règle
      vectorial: { top_similarity: 0.767, confidence: 'medium', all_candidates: [] },
    });
    expect(classifyRowEnriched(row)).toBe('low_confidence_match');
  });

  it('confidence low + prix légèrement élevé → non vérifiable', () => {
    const row = makeRow({
      devisTotalHT: 2400, // ratio 1.2 → « legerement_eleve » sous l'ancienne règle
      vectorial: { top_similarity: 0.678, confidence: 'low', all_candidates: [] },
    });
    expect(classifyRowEnriched(row)).toBe('low_confidence_match');
  });

  it('la garde passe AVANT la garde surface — sans référence sûre, réclamer une surface ne sert à rien', () => {
    const row = makeRow({
      mainUnit: 'forfait',
      mainQuantity: 1,
      devisLines: [{ index: 0, description: 'Peinture complète du séjour', quantity: 1, amountHT: 4000, unit: 'U' }],
      devisTotalHT: 4000,
      isForfait: false,
      vectorial: { top_similarity: 0.72, confidence: 'medium', all_candidates: [] },
    });
    expect(classifyRowEnriched(row)).toBe('low_confidence_match');
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

// ══════════════════════════════════════════════════════════════════════════
// Garde 0 bis — le serveur refuse de chiffrer, la carte n'accuse pas (15/09)
// ══════════════════════════════════════════════════════════════════════════
describe('classifyRowEnriched — une carte ne peut pas accuser sur un poste non chiffrable', () => {
  it('🔴 tarif de main-d\'œuvre opposé à une ligne fournie → plus d\'accusation', () => {
    // Cas réel vu à l'écran (analyse c1ece16a) : le hero annonçait 870 € et
    // cette carte affichait « Anomalie marché » à 4 809 € contre 1 072-2 228 €.
    // Le poste était sorti du MONTANT côté serveur, pas de la CARTE.
    const row = makeRow({
      jobTypeLabel: 'Carrelage sol 30m² (MO)',
      mainUnit: 'm²',
      mainQuantity: 96,
      devisTotalHT: 4809,
      theoreticalMaxHT: 2228,
      devisLines: [
        { index: 0, description: 'Fourniture et pose carrelage sol', quantity: 96, amountHT: 4809, unit: 'm²' },
      ],
      prices: [
        { job_type: 'carrelage_mo', label: 'Carrelage sol 30m² (MO)', unit: 'm²',
          price_min_unit_ht: 11, price_avg_unit_ht: 17, price_max_unit_ht: 23,
          fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, zip_scope: 'national', notes: '' },
      ],
    });
    expect(classifyRowEnriched(row)).toBe('low_confidence_match');
  });

  it('🔴 rapprochement invraisemblable (×14,7) → plus d\'accusation', () => {
    // Le forfait WC à 8 950 € du devis ALES, faux positif documenté le 30/08.
    const row = makeRow({
      jobTypeLabel: 'WC (fourni+posé)',
      mainUnit: 'U',
      mainQuantity: 1,
      devisTotalHT: 8950,
      theoreticalMaxHT: 608,
      devisLines: [
        { index: 0, description: 'Fourniture et pose de nouveaux wc', quantity: 1, amountHT: 8950, unit: 'U' },
      ],
      prices: [
        { job_type: 'wc_fp', label: 'WC (fourni+posé)', unit: 'unite',
          price_min_unit_ht: 250, price_avg_unit_ht: 400, price_max_unit_ht: 608,
          fixed_min_ht: 0, fixed_avg_ht: 0, fixed_max_ht: 0, zip_scope: 'national', notes: '' },
      ],
    });
    expect(classifyRowEnriched(row)).toBe('low_confidence_match');
  });

  it('⚠️ une vraie surfacturation garde son accusation', () => {
    // 3 000 € contre un plafond de 2 000 € en m² avec quantité : la comparaison
    // est valide, la carte doit continuer de le dire. La garde ne doit PAS
    // devenir un moyen commode de ne jamais accuser.
    const row = makeRow({ devisTotalHT: 4500, theoreticalMaxHT: 2000 });
    expect(classifyRowEnriched(row)).toBe('anomalie');
  });

  it('⚠️ un groupe hétérogène garde sa rétrogradation historique, pas le doute total', () => {
    // Décision délibérée : `groupe_heterogene` n'est PAS dans
    // MOTIFS_SANS_VERDICT_DE_PRIX — le basculer changerait le badge de dizaines
    // de postes, ce qui est une mesure à part.
    const row = makeRow({
      jobTypeLabel: 'Carrelage (fourni+posé)',
      devisTotalHT: 4422,
      theoreticalMaxHT: 1270,
      devisLines: [
        { index: 0, description: 'Chape ciment', quantity: 13, amountHT: 1200, unit: 'm²' },
        { index: 1, description: 'Primaire accrochage', quantity: 13, amountHT: 400, unit: 'm²' },
        { index: 2, description: 'Dalle céramique', quantity: 13, amountHT: 1800, unit: 'm²' },
        { index: 3, description: 'IPE acier', quantity: 1, amountHT: 1022, unit: 'U' },
      ],
    });
    expect(classifyRowEnriched(row)).not.toBe('low_confidence_match');
  });
});
