/**
 * Tests du rapprochement de deux devis concurrents (2026-09-08).
 *
 * Le cas d'origine : la même personne a déposé deux devis de climatisation de
 * prestataires différents à quelques minutes d'intervalle, et l'outil ne lui a
 * jamais proposé de les comparer.
 *
 * Principe défendu, comme partout ailleurs : **on propose, on n'affirme pas**.
 * Ne rien proposer est le cas normal ; une suggestion à tort coûte plus cher
 * que dix suggestions manquées.
 */

import { describe, it, expect } from "vitest";
import {
  signatureDevis,
  recouvrement,
  trouverDevisApparente,
  SEUIL_RECOUVREMENT,
  RAPPORT_MONTANT_MAX,
  type DevisCandidat,
} from "./devisApparentes";

const clim1 = [
  "Groupe extérieur multi split MITSUBISHI ELECTRIC MXZ-2F53VF4 2 sorties Puissance chaud 6,40 Kw",
  "Unité intérieure séjour type console au sol MITSUBISHI ELECTRIC gamme MFZ KT35VG",
  "Réseau climatisation Goulotte mural Liaison frigorifique bi tube en cuivre tuyau de condensat",
  "Réalisation des travaux Montage du groupe extérieur Mise en service et contrôle",
];
const clim2 = [
  "Multi-split Mitsubishi Electric 6.8 kW Référence MXZ-3F68VF3 Puissance nominale froid chaud",
  "Unité intérieure Mitsubishi Electric AY25 Référence MSZ-AY25VGK",
  "Fourniture P.A.C. Air/Air Liaison frigorifique pré-isolée Liaison électrique tuyau condensat",
  "Installation P.A.C. Air/Air Mise en service essais et réglage",
];
const peinture = [
  "Préparation des supports et application de deux couches de peinture acrylique sur murs",
  "Ponçage et rebouchage des fissures avant mise en peinture des plafonds",
  "Protection des sols et du mobilier, nettoyage en fin de chantier",
];

const devis = (id: string, libelles: string[], o: Partial<DevisCandidat> = {}): DevisCandidat => ({
  id,
  libelles,
  entreprise: o.entreprise ?? `Entreprise ${id}`,
  createdAt: o.createdAt ?? "2026-09-08T10:00:00Z",
  montantHt: o.montantHt ?? 10_000,
  fileName: o.fileName ?? `${id}.pdf`,
});

describe("signature d'un devis", () => {
  it("écarte le bruit, les nombres et les références produit", () => {
    const s = signatureDevis(["Fourniture et pose MXZ-3F68VF3 pour 2 unités, garantie 5 ans"]);
    expect(s.has("mxz")).toBe(false);
    expect(s.has("fourniture")).toBe(false);
    expect(s.has("garantie")).toBe(false);
  });

  it("réunit singulier et pluriel", () => {
    expect(signatureDevis(["Radiateurs"]).has("radiateur")).toBe(true);
    expect(signatureDevis(["Radiateur"]).has("radiateur")).toBe(true);
  });
});

describe("recouvrement", () => {
  it("deux devis de climatisation se reconnaissent", () => {
    expect(recouvrement(signatureDevis(clim1), signatureDevis(clim2))).toBeGreaterThan(SEUIL_RECOUVREMENT);
  });

  it("climatisation et peinture ne se ressemblent pas", () => {
    expect(recouvrement(signatureDevis(clim1), signatureDevis(peinture))).toBeLessThan(0.1);
  });

  it("un devis bavard et un devis synthétique restent comparables", () => {
    // On divise par le plus PETIT ensemble : un devis de 40 lignes ne doit pas
    // être séparé d'un devis de 6 lignes décrivant le même chantier.
    const court = signatureDevis([clim1[0]]);
    const long = signatureDevis(clim1);
    expect(recouvrement(court, long)).toBe(1);
  });
});

describe("proposition de comparaison", () => {
  it("propose le devis concurrent du même projet", () => {
    const r = trouverDevisApparente(devis("a", clim1), [devis("b", clim2, { montantHt: 10_900 })]);
    expect(r?.id).toBe("b");
  });

  it("ne propose rien sur un autre métier", () => {
    expect(trouverDevisApparente(devis("a", clim1), [devis("b", peinture)])).toBeNull();
  });

  it("ne propose pas le même devis redéposé", () => {
    // Même fichier, à l'index de copie près.
    const r = trouverDevisApparente(
      devis("a", clim1, { fileName: "devis clim.pdf" }),
      [devis("b", clim1, { fileName: "devis clim (1).pdf" })],
    );
    expect(r).toBeNull();
  });

  it("ne propose pas un devis de la même entreprise", () => {
    const r = trouverDevisApparente(
      devis("a", clim1, { entreprise: "C'energie" }),
      [devis("b", clim2, { entreprise: "C'ENERGIE" })],
    );
    expect(r).toBeNull();
  });

  it("écarte un devis au montant sans rapport", () => {
    // Même vocabulaire de métier, tout autre périmètre : mesuré jusqu'à ×98
    // sur le stock réel.
    const r = trouverDevisApparente(
      devis("a", clim1, { montantHt: 10_000 }),
      [devis("b", clim2, { montantHt: 10_000 * (RAPPORT_MONTANT_MAX + 1) })],
    );
    expect(r).toBeNull();
  });

  it("écarte un devis trop ancien", () => {
    const r = trouverDevisApparente(
      devis("a", clim1, { createdAt: "2026-09-08T10:00:00Z" }),
      [devis("b", clim2, { createdAt: "2026-06-01T10:00:00Z" })],
    );
    expect(r).toBeNull();
  });

  it("sans matière, aucune proposition", () => {
    expect(trouverDevisApparente(devis("a", ["Forfait"]), [devis("b", clim2)])).toBeNull();
  });

  it("retient le meilleur quand plusieurs conviennent", () => {
    const r = trouverDevisApparente(devis("a", clim1), [
      devis("b", [...clim2, ...peinture]),
      devis("c", clim2),
    ]);
    expect(r?.id).toBe("c");
  });
});
