import { describe, it, expect } from 'vitest';
import {
  normalizePhone, normalizeSiret, normalizeName,
  buildUnifiedArtisans, detectConflicts,
  type RawContact, type RawLotWindow, type ChantierRef,
} from './portfolioConflicts';

const chantiers: ChantierRef[] = [
  { id: 'A', nom: 'Maison A' },
  { id: 'B', nom: 'Maison B' },
];

function lot(id: string, chantier_id: string, debut: string | null, fin: string | null, nom = 'Lot'): RawLotWindow {
  return { id, chantier_id, nom, date_debut: debut, date_fin: fin };
}
function contact(p: Partial<RawContact> & { id: string; chantier_id: string; nom: string }): RawContact {
  return { telephone: null, siret: null, role: null, lot_id: null, ...p };
}

describe('normalizePhone', () => {
  it('canonicalise les formats FR vers +33', () => {
    expect(normalizePhone('06 12 34 56 78')).toBe('+33612345678');
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('+33612345678');
    expect(normalizePhone('0033612345678')).toBe('+33612345678');
    expect(normalizePhone('06.12.34.56.78')).toBe('+33612345678');
  });
  it('rejette les numeros trop partiels', () => {
    expect(normalizePhone('123')).toBe('');
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
  });
});

describe('normalizeSiret', () => {
  it('exige 14 chiffres', () => {
    expect(normalizeSiret('123 456 789 00012')).toBe('12345678900012');
    expect(normalizeSiret('12345678900012')).toBe('12345678900012');
  });
  it('rejette si != 14 chiffres', () => {
    expect(normalizeSiret('123')).toBe('');
    expect(normalizeSiret(null)).toBe('');
  });
});

describe('normalizeName', () => {
  it('minuscule, sans accents ni ponctuation', () => {
    expect(normalizeName('Élec  Pro-2000')).toBe('elec pro 2000');
    expect(normalizeName('Maçonnerie Dupont')).toBe('maconnerie dupont');
  });
});

describe('buildUnifiedArtisans', () => {
  it('rapproche par telephone entre 2 chantiers (high)', () => {
    const contacts = [
      contact({ id: 'c1', chantier_id: 'A', nom: 'Plomberie Martin', telephone: '0612345678', lot_id: 'l1' }),
      contact({ id: 'c2', chantier_id: 'B', nom: 'Martin Plomberie', telephone: '+33 6 12 34 56 78', lot_id: 'l2' }),
    ];
    const lots = [lot('l1', 'A', '2026-06-01', '2026-06-30'), lot('l2', 'B', '2026-06-15', '2026-07-15')];
    const arts = buildUnifiedArtisans(contacts, lots, chantiers);
    expect(arts).toHaveLength(1);
    expect(arts[0].confidence).toBe('high');
    expect(arts[0].chantierCount).toBe(2);
    expect(arts[0].phone).toBe('+33612345678');
  });

  it('rapproche par SIRET (high)', () => {
    const contacts = [
      contact({ id: 'c1', chantier_id: 'A', nom: 'Elec A', siret: '12345678900012' }),
      contact({ id: 'c2', chantier_id: 'B', nom: 'Elec B', siret: '123 456 789 00012' }),
    ];
    const arts = buildUnifiedArtisans(contacts, [], chantiers);
    expect(arts).toHaveLength(1);
    expect(arts[0].confidence).toBe('high');
    expect(arts[0].siret).toBe('12345678900012');
  });

  it('rapproche par nom uniquement (low) si pas de cle forte', () => {
    const contacts = [
      contact({ id: 'c1', chantier_id: 'A', nom: 'Peinture Durand' }),
      contact({ id: 'c2', chantier_id: 'B', nom: 'peinture  durand' }),
    ];
    const arts = buildUnifiedArtisans(contacts, [], chantiers);
    expect(arts).toHaveLength(1);
    expect(arts[0].confidence).toBe('low');
    expect(arts[0].chantierCount).toBe(2);
  });

  it('NE fusionne PAS deux memes noms ayant des telephones distincts', () => {
    const contacts = [
      contact({ id: 'c1', chantier_id: 'A', nom: 'Dupont', telephone: '0611111111' }),
      contact({ id: 'c2', chantier_id: 'B', nom: 'Dupont', telephone: '0622222222' }),
    ];
    const arts = buildUnifiedArtisans(contacts, [], chantiers);
    expect(arts).toHaveLength(2); // pas de faux rapprochement
  });
});

describe('detectConflicts', () => {
  it('conflit confirme : meme tel + fenetres qui se chevauchent sur 2 chantiers', () => {
    const contacts = [
      contact({ id: 'c1', chantier_id: 'A', nom: 'Martin', telephone: '0612345678', lot_id: 'l1' }),
      contact({ id: 'c2', chantier_id: 'B', nom: 'Martin', telephone: '0612345678', lot_id: 'l2' }),
    ];
    const lots = [lot('l1', 'A', '2026-06-01', '2026-06-30'), lot('l2', 'B', '2026-06-15', '2026-07-15')];
    const conflicts = detectConflicts(buildUnifiedArtisans(contacts, lots, chantiers));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].confidence).toBe('confirmed');
    expect(conflicts[0].windows).toHaveLength(2);
  });

  it('pas de conflit si les fenetres ne se chevauchent pas', () => {
    const contacts = [
      contact({ id: 'c1', chantier_id: 'A', nom: 'Martin', telephone: '0612345678', lot_id: 'l1' }),
      contact({ id: 'c2', chantier_id: 'B', nom: 'Martin', telephone: '0612345678', lot_id: 'l2' }),
    ];
    const lots = [lot('l1', 'A', '2026-06-01', '2026-06-30'), lot('l2', 'B', '2026-07-15', '2026-08-15')];
    const conflicts = detectConflicts(buildUnifiedArtisans(contacts, lots, chantiers));
    expect(conflicts).toHaveLength(0);
  });

  it('pas de conflit si les fenetres se touchent seulement (fin = debut)', () => {
    const contacts = [
      contact({ id: 'c1', chantier_id: 'A', nom: 'Martin', telephone: '0612345678', lot_id: 'l1' }),
      contact({ id: 'c2', chantier_id: 'B', nom: 'Martin', telephone: '0612345678', lot_id: 'l2' }),
    ];
    // l1 finit le 30/06, l2 demarre le 30/06 : l'artisan enchaine, pas un conflit.
    const lots = [lot('l1', 'A', '2026-06-01', '2026-06-30'), lot('l2', 'B', '2026-06-30', '2026-07-30')];
    const conflicts = detectConflicts(buildUnifiedArtisans(contacts, lots, chantiers));
    expect(conflicts).toHaveLength(0);
  });

  it('conflit a verifier si rapprochement faible (nom seul)', () => {
    const contacts = [
      contact({ id: 'c1', chantier_id: 'A', nom: 'Carrelage Sud', lot_id: 'l1' }),
      contact({ id: 'c2', chantier_id: 'B', nom: 'carrelage sud', lot_id: 'l2' }),
    ];
    const lots = [lot('l1', 'A', '2026-06-01', '2026-06-30'), lot('l2', 'B', '2026-06-10', '2026-07-10')];
    const conflicts = detectConflicts(buildUnifiedArtisans(contacts, lots, chantiers));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].confidence).toBe('to_verify');
  });

  it('exclut les contacts sans lot rattache (pas de fenetre -> pas de conflit)', () => {
    const contacts = [
      contact({ id: 'c1', chantier_id: 'A', nom: 'Martin', telephone: '0612345678', lot_id: null }),
      contact({ id: 'c2', chantier_id: 'B', nom: 'Martin', telephone: '0612345678', lot_id: 'l2' }),
    ];
    const lots = [lot('l2', 'B', '2026-06-10', '2026-07-10')];
    const conflicts = detectConflicts(buildUnifiedArtisans(contacts, lots, chantiers));
    expect(conflicts).toHaveLength(0); // 1 seule fenetre valide
  });

  it('pas de conflit pour plusieurs lots du MEME chantier qui se chevauchent', () => {
    const contacts = [
      contact({ id: 'c1', chantier_id: 'A', nom: 'Martin', telephone: '0612345678', lot_id: 'l1' }),
      contact({ id: 'c2', chantier_id: 'A', nom: 'Martin', telephone: '0612345678', lot_id: 'l2' }),
    ];
    const lots = [lot('l1', 'A', '2026-06-01', '2026-06-30'), lot('l2', 'A', '2026-06-10', '2026-07-10')];
    const arts = buildUnifiedArtisans(contacts, lots, chantiers);
    expect(arts[0].chantierCount).toBe(1); // meme chantier
    expect(detectConflicts(arts)).toHaveLength(0);
  });
});
