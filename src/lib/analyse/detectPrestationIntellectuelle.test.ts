import { describe, it, expect } from 'vitest';
import { detectPrestationIntellectuelleReglementee as detect } from './detectPrestationIntellectuelle';

describe('detectPrestationIntellectuelleReglementee', () => {
  it('renvoie null pour input vide', () => {
    expect(detect(null)).toBeNull();
    expect(detect(undefined)).toBeNull();
    expect(detect({})).toBeNull();
    expect(detect({ extracted: {} })).toBeNull();
  });

  // ── Cas d'origine FARAUD ──────────────────────────────────────────────
  it("cas d'origine FARAUD — géomètre-expert dans description", () => {
    const r = detect({
      extracted: {
        entreprise: { nom: 'FARAUD Rémi' },
        travaux: [
          { description: 'Honoraires de géomètre-expert pour division de parcelles' },
        ],
      },
    });
    expect(r).not.toBeNull();
    expect(r?.metier).toBe('géomètre-expert');
  });

  // ── Métiers principaux ──────────────────────────────────────────────
  it('détecte architecte DPLG', () => {
    const r = detect({
      extracted: { entreprise: { activite: 'Architecte DPLG - maîtrise d\'œuvre' } },
    });
    expect(r?.metier).toBe('architecte DPLG');
  });

  it('détecte architecte HMONP', () => {
    const r = detect({
      extracted: { entreprise: { raison_sociale: 'Cabinet Architecte HMONP Dupont' } },
    });
    expect(r?.metier).toBe('architecte DPLG');
  });

  it('détecte "ordre des architectes"', () => {
    const r = detect({
      verified: { activite_principale: 'Membre de l\'Ordre des architectes région IDF' },
    });
    expect(r?.metier).toBe('architecte inscrit à l\'ordre');
  });

  it('détecte diagnostiqueur immobilier', () => {
    const r = detect({
      extracted: { entreprise: { activite: 'Diagnostic immobilier - DPE - Amiante' } },
    });
    expect(r?.metier).toBe('diagnostiqueur immobilier');
  });

  it('détecte notaire', () => {
    const r = detect({
      extracted: { entreprise: { nom: 'SCP Notaire Martin & Associés' } },
    });
    expect(r?.metier).toBe('notaire');
  });

  it('détecte huissier de justice / commissaire de justice', () => {
    const r = detect({
      extracted: { entreprise: { activite: 'Commissaire de justice - constats' } },
    });
    expect(r?.metier).toBe('huissier de justice');
  });

  it("détecte bureau d'études techniques", () => {
    const r = detect({
      extracted: { entreprise: { activite: "Bureau d'études techniques structure" } },
    });
    expect(r?.metier).toBe("bureau d'études techniques");
  });

  it("détecte maître d'œuvre / MOE", () => {
    const r = detect({
      extracted: { entreprise: { activite: 'Maître d\'œuvre indépendant' } },
    });
    expect(r?.metier).toBe("maître d'œuvre");
  });

  it('détecte économiste de la construction', () => {
    const r = detect({
      extracted: { entreprise: { activite: 'Economiste de la construction' } },
    });
    expect(r?.metier).toBe('économiste de la construction');
  });

  it('détecte expert judiciaire', () => {
    const r = detect({
      extracted: { entreprise: { activite: 'Expert judiciaire près la cour d\'appel' } },
    });
    expect(r?.metier).toBe('expert judiciaire');
  });

  // ── Conservateur : "architecte" seul ne match pas ────────────────────
  it("architecte seul (sans DPLG/HMONP) ne matche pas — trop ambigu", () => {
    const r = detect({
      extracted: { entreprise: { activite: 'Architecte d\'intérieur' } },
    });
    expect(r).toBeNull();
  });

  // ── Ne matche pas les artisans BTP classiques ────────────────────────
  it("un maçon n'est pas détecté", () => {
    const r = detect({
      extracted: {
        entreprise: { activite: 'Maçonnerie générale' },
        travaux: [{ description: 'Pose de parpaings pour mur de clôture 20m²' }],
      },
    });
    expect(r).toBeNull();
  });

  it("un plombier n'est pas détecté", () => {
    const r = detect({
      extracted: {
        entreprise: { activite: 'Plomberie sanitaire chauffage' },
        travaux: [{ description: 'Rénovation salle de bain complète' }],
      },
    });
    expect(r).toBeNull();
  });

  // ── Scan des descriptions des lignes ────────────────────────────────
  it('détection depuis description de ligne uniquement', () => {
    const r = detect({
      extracted: {
        entreprise: { nom: 'Cabinet libéral' },
        travaux: [{ description: 'Établissement du DPE pour vente logement' }],
      },
    });
    expect(r?.metier).toBe('diagnostiqueur immobilier');
  });

  // ── extracted_data legacy support ────────────────────────────────────
  it('lit extracted_data si extracted absent', () => {
    const r = detect({
      extracted_data: { entreprise: { activite: 'Géomètre-expert' } },
    });
    expect(r?.metier).toBe('géomètre-expert');
  });
});
