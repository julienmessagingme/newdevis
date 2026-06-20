import { describe, it, expect } from 'vitest';
import {
  evaluateArtisanAccess,
  scopeArtisanDocuments,
  shapeArtisanPlanningLots,
  shapeArtisanContacts,
} from './artisanScope';

describe('evaluateArtisanAccess', () => {
  const base = { tokenRow: { revoked_at: null }, chantierExists: true, subActive: true, contactOnChantier: true };

  it('ok quand tout est valide', () => {
    expect(evaluateArtisanAccess(base)).toEqual({ ok: true });
  });
  it('token absent -> token_invalid', () => {
    expect(evaluateArtisanAccess({ ...base, tokenRow: null })).toEqual({ ok: false, code: 'token_invalid' });
  });
  it('token revoque -> token_invalid', () => {
    expect(evaluateArtisanAccess({ ...base, tokenRow: { revoked_at: '2026-01-01T00:00:00Z' } }))
      .toEqual({ ok: false, code: 'token_invalid' });
  });
  it('chantier absent -> token_invalid', () => {
    expect(evaluateArtisanAccess({ ...base, chantierExists: false })).toEqual({ ok: false, code: 'token_invalid' });
  });
  it('abo inactif -> subscription_inactive', () => {
    expect(evaluateArtisanAccess({ ...base, subActive: false })).toEqual({ ok: false, code: 'subscription_inactive' });
  });
  it('contact hors chantier -> contact_not_found', () => {
    expect(evaluateArtisanAccess({ ...base, contactOnChantier: false })).toEqual({ ok: false, code: 'contact_not_found' });
  });
});

describe('scopeArtisanDocuments (anti-fuite des concurrents)', () => {
  const docs = [
    { id: 'a', contact_id: 'me' },
    { id: 'b', contact_id: 'other' }, // concurrent du MEME lot
    { id: 'c', contact_id: null },
    { id: 'd', contact_id: 'me' },
  ];
  it('ne garde que les docs du contact courant', () => {
    expect(scopeArtisanDocuments(docs, 'me').map((d) => d.id)).toEqual(['a', 'd']);
  });
  it("ne fuite JAMAIS le doc d'un autre contact", () => {
    expect(scopeArtisanDocuments(docs, 'me').some((d) => d.contact_id !== 'me')).toBe(false);
  });
});

describe('shapeArtisanPlanningLots (pas de montants)', () => {
  it('retire budget/prix/montant/_ht/ttc, garde les colonnes neutres', () => {
    const lots = [
      {
        id: '1', nom: 'Carrelage', date_debut: '2026-01-10', date_fin: '2026-01-20',
        budget_min_ht: 1000, budget_avg_ht: 1500, budget_max_ht: 2000,
        prix_unitaire: 50, montant_ttc: 1800, total_ht: 5000,
        hauteur_plafond: 250, // colonne neutre : NE doit PAS être filtrée
      },
    ];
    const out = shapeArtisanPlanningLots(lots);
    expect(out[0]).toHaveProperty('nom', 'Carrelage');
    expect(out[0]).toHaveProperty('date_debut');
    expect(out[0]).toHaveProperty('date_fin');
    expect(out[0]).toHaveProperty('hauteur_plafond', 250);
    expect(out[0]).not.toHaveProperty('total_ht');
    expect(out[0]).not.toHaveProperty('budget_min_ht');
    expect(out[0]).not.toHaveProperty('montant_ttc');
    for (const k of Object.keys(out[0])) {
      expect(k.toLowerCase()).not.toMatch(/budget|prix|price|montant|cout|_ht|ttc/);
    }
  });
});

describe('shapeArtisanContacts (coords minimales, self exclu)', () => {
  // Fixtures volontairement "riches" (email/notes/siret) pour prouver que le shaper les retire.
  const contacts = [
    { id: 'me', nom: 'Moi', role: 'plombier', telephone: '0600000000', email: 'me@x.fr', notes: 'SECRET', siret: '111', has_whatsapp: true },
    { id: 'b', nom: 'Bob', role: 'macon', telephone: '0700000000', email: 'bob@x.fr', notes: 'NOTE', siret: '222', has_whatsapp: false },
  ];

  it('exclut self', () => {
    const out = shapeArtisanContacts(contacts, 'me');
    expect(out.length).toBe(1);
    expect(out[0].nom).toBe('Bob');
  });
  it('ne renvoie QUE nom/role/telephone', () => {
    const out = shapeArtisanContacts(contacts, 'me')[0];
    expect(Object.keys(out).sort()).toEqual(['nom', 'role', 'telephone']);
  });
  it('ne fuite aucun champ sensible', () => {
    const json = JSON.stringify(shapeArtisanContacts(contacts, 'me'));
    expect(json).not.toContain('SECRET');
    expect(json).not.toContain('@');
    expect(json).not.toContain('222');
  });
});
