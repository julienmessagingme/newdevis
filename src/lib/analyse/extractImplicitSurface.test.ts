import { describe, it, expect } from 'vitest';
import { extractImplicitSurface } from './extractImplicitSurface';

describe('extractImplicitSurface', () => {
  it('renvoie null pour input vide/court', () => {
    expect(extractImplicitSurface(null)).toBeNull();
    expect(extractImplicitSurface(undefined)).toBeNull();
    expect(extractImplicitSurface('')).toBeNull();
    expect(extractImplicitSurface('ab')).toBeNull();
  });

  it('renvoie null quand aucune surface n\'est mentionnée', () => {
    expect(extractImplicitSurface('Peinture pièce à vivre')).toBeNull();
    expect(extractImplicitSurface('Refaire salle de bain complète')).toBeNull();
    expect(extractImplicitSurface('Rénovation clef en main')).toBeNull();
  });

  // ── Cas d'origine : le devis Julien ─────────────────────────────────────
  it("cas d'origine — 'Peinture pièce ~12m² (murs+plafond)'", () => {
    const r = extractImplicitSurface('Peinture pièce ~12m² (murs+plafond)');
    expect(r).not.toBeNull();
    expect(r!.base_m2).toBe(12);
    expect(r!.surface_type).toBe('murs_plafond');
    expect(r!.multiplier).toBe(3.5);
    expect(r!.effective_m2).toBe(42);
    expect(r!.confidence).toBe('high');
  });

  // ── Variantes d'écriture m² ─────────────────────────────────────────────
  it('accepte m2 sans exposant', () => {
    const r = extractImplicitSurface('Chambre 15m2 murs');
    expect(r?.base_m2).toBe(15);
    expect(r?.surface_type).toBe('murs');
  });

  it('accepte l\'espace entre nombre et m²', () => {
    const r = extractImplicitSurface('SDB 6 m² sol');
    expect(r?.base_m2).toBe(6);
    expect(r?.surface_type).toBe('sol');
  });

  it('accepte les décimales avec virgule', () => {
    const r = extractImplicitSurface('Peinture cuisine 12,5m² murs');
    expect(r?.base_m2).toBe(12.5);
  });

  it('accepte "mètres carrés" en lettres', () => {
    const r = extractImplicitSurface('Peinture 20 mètres carrés murs');
    expect(r?.base_m2).toBe(20);
  });

  // ── Détection du type ──────────────────────────────────────────────────
  it("type 'murs' seul → multiplicateur 2.5", () => {
    const r = extractImplicitSurface('Peinture murs 10 m²');
    expect(r?.surface_type).toBe('murs');
    expect(r?.multiplier).toBe(2.5);
    expect(r?.effective_m2).toBe(25);
  });

  it("type 'plafond' seul → multiplicateur 1", () => {
    const r = extractImplicitSurface('Peinture plafond 15 m²');
    expect(r?.surface_type).toBe('plafond');
    expect(r?.multiplier).toBe(1);
    expect(r?.effective_m2).toBe(15);
  });

  it("type 'sol' → multiplicateur 1", () => {
    const r = extractImplicitSurface('Carrelage sol 20 m² SDB');
    expect(r?.surface_type).toBe('sol');
    expect(r?.multiplier).toBe(1);
  });

  it("type 'pièce complète' → murs_plafond", () => {
    const r = extractImplicitSurface('Peinture 4 murs et plafond 25 m²');
    expect(r?.surface_type).toBe('murs_plafond');
  });

  // ── Confidence ─────────────────────────────────────────────────────────
  it('confidence high quand type explicite', () => {
    const r = extractImplicitSurface('Peinture 20 m² murs+plafond');
    expect(r?.confidence).toBe('high');
  });

  it('confidence medium quand type inconnu mais contexte peinture', () => {
    const r = extractImplicitSurface('Peinture pièce 20 m²');
    // Pas de mention murs/plafond/sol -> unknown -> medium (contexte peinture)
    expect(r?.surface_type).toBe('unknown');
    expect(r?.confidence).toBe('medium');
  });

  it('confidence low quand surface seule sans contexte', () => {
    const r = extractImplicitSurface('Réserve emplacement 15 m²');
    expect(r?.confidence).toBe('low');
  });

  // ── Cas multiples surfaces ─────────────────────────────────────────────
  it('somme les surfaces multiples dans la même description', () => {
    const r = extractImplicitSurface('Peinture cuisine 12 m² + salle 20 m² murs+plafond');
    expect(r?.base_m2).toBe(32);
    expect(r?.detected_from).toContain('12');
    expect(r?.detected_from).toContain('20');
  });

  // ── Filtre valeurs aberrantes ──────────────────────────────────────────
  it('rejette une surface irréaliste (< 0.5 m²)', () => {
    // 0.2m² sera rejeté (< 0.5)
    const r = extractImplicitSurface('Retouche 0,2 m² murs');
    expect(r).toBeNull();
  });

  it('rejette une surface irréaliste (> 5000 m²)', () => {
    const r = extractImplicitSurface('Bâtiment 10000 m² à repeindre');
    expect(r).toBeNull();
  });

  // ── Robustesse aux formats bizarres ───────────────────────────────────
  it('ne matche pas un nombre qui n\'est pas une surface', () => {
    // "3 chambres" ne doit pas matcher m²
    const r = extractImplicitSurface('Peinture 3 chambres murs+plafond');
    expect(r).toBeNull();
  });

  it('gère un tilde avant le nombre', () => {
    const r = extractImplicitSurface('Peinture ~15m² murs+plafond');
    expect(r?.base_m2).toBe(15);
  });
});
