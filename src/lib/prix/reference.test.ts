/**
 * Tests de la référence de prix unique (2026-09-08).
 *
 * Ils protègent trois choses : que le fichier généré est cohérent, que le
 * formatage ne produit pas d'absurdité (« €/forfait »), et qu'un poste inconnu
 * casse le build au lieu d'afficher un trou en production.
 */

import { describe, it, expect } from "vitest";
import {
  poste,
  tousLesPostes,
  fourchette,
  fourchetteCourte,
  suffixeUnite,
  GENERE_LE,
} from "./reference";

describe("référence de prix", () => {
  it("expose des postes, tous cohérents", () => {
    const postes = tousLesPostes();
    expect(postes.length).toBeGreaterThanOrEqual(15);
    for (const p of postes) {
      expect(p.min, `${p.cle} : min`).toBeGreaterThan(0);
      expect(p.max, `${p.cle} : max > min`).toBeGreaterThan(p.min);
      expect(p.moy, `${p.cle} : moyenne dans la fourchette`).toBeGreaterThanOrEqual(p.min);
      expect(p.moy).toBeLessThanOrEqual(p.max);
      expect(p.libelle.length, `${p.cle} : libellé`).toBeGreaterThan(3);
      expect(p.job_type.length, `${p.cle} : job_type`).toBeGreaterThan(0);
    }
  });

  it("porte la date de génération, pour dater la référence affichée", () => {
    expect(GENERE_LE).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("un poste inconnu casse, il n'affiche pas un trou", () => {
    // @ts-expect-error — clé volontairement invalide
    expect(() => poste("poste_qui_nexiste_pas")).toThrow(/poste inconnu/);
  });

  it("formate une fourchette au m² avec la mention HT", () => {
    const s = fourchette("peinture_murs_plafonds");
    expect(s).toMatch(/€ HT\/m²$/);
    expect(s).toContain(" à ");
  });

  it("la forme courte utilise un tiret, pour les énumérations", () => {
    expect(fourchetteCourte("cloison_placo")).toMatch(/^\d+-\d+ € HT\/m²$/);
  });

  it("un forfait ne prend PAS de suffixe d'unité", () => {
    // « 5 100 à 11 900 € HT/forfait » ne veut rien dire.
    expect(suffixeUnite("forfait")).toBe("");
    expect(fourchette("cuisine_complete")).not.toContain("forfait");
    expect(fourchette("cuisine_complete")).toMatch(/€ HT$/);
  });

  it("une unité se lit « l'unité », pas « /unité »", () => {
    expect(fourchette("fenetre_pvc")).toContain("l'unité");
  });

  it("les milliers sont séparés à la française", () => {
    // Espace insécable attendu : 11 900, jamais 11900 ni 11,900.
    expect(fourchette("cuisine_complete")).toMatch(/11[\s  ]900/);
  });

  it("les postes cités dans les pages éditoriales existent tous", () => {
    // Si une page en cite un qui disparaît du catalogue, le build doit tomber
    // ici plutôt qu'en production.
    for (const cle of [
      "peinture_murs_plafonds",
      "carrelage_fourni_pose",
      "parquet_stratifie",
      "isolation_interieure",
      "isolation_exterieure",
      "toiture_refection",
      "fenetre_pvc",
      "cuisine_complete",
      "sdb_complete",
    ] as const) {
      expect(() => poste(cle)).not.toThrow();
    }
  });
});
