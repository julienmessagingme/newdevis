import { describe, it, expect } from "vitest";
// @ts-expect-error — module .mjs volontairement sans types (importé par astro.config.mjs)
import { urlCanonique } from "./urlCanonique.mjs";

const VMD = "https://www.verifiermondevis.fr";
const GMC = "https://www.gerermonchantier.fr";

describe("urlCanonique — la forme d'URL que le site déclare", () => {
  it("retire le slash final d'une page", () => {
    expect(urlCanonique(`${VMD}/faq/`)).toBe(`${VMD}/faq`);
    expect(urlCanonique(`${VMD}/guides/devis-travaux/`)).toBe(`${VMD}/guides/devis-travaux`);
  });

  it("laisse inchangée une URL déjà canonique", () => {
    expect(urlCanonique(`${VMD}/faq`)).toBe(`${VMD}/faq`);
  });

  it("GARDE le slash de la racine — c'est sa forme canonique", () => {
    expect(urlCanonique(`${VMD}/`)).toBe(`${VMD}/`);
  });

  it("traite la racine de GMC comme celle de VMD (même build, deux domaines)", () => {
    // ⚠️ La règle d'origine dans BaseLayout comparait à la chaîne VMD codée en
    // dur : elle retirait donc le slash de la racine de GMC. La condition porte
    // désormais sur le CHEMIN, ce qui rend les deux domaines équivalents.
    expect(urlCanonique(`${GMC}/`)).toBe(`${GMC}/`);
    expect(urlCanonique(`${GMC}/planning-chantier/`)).toBe(`${GMC}/planning-chantier`);
  });

  it("force https", () => {
    expect(urlCanonique(`http://www.verifiermondevis.fr/faq/`)).toBe(`${VMD}/faq`);
    expect(urlCanonique(`http://www.verifiermondevis.fr/`)).toBe(`${VMD}/`);
  });

  it("ne touche pas au reste de l'URL", () => {
    // Le comportement historique conserve query et fragment ; on ne le change pas
    // ici — ce module corrige la forme du chemin, rien d'autre.
    expect(urlCanonique(`${VMD}/blog?page=2`)).toBe(`${VMD}/blog?page=2`);
  });

  it("rend l'entrée inchangée si elle n'est pas une URL — on ne devine pas", () => {
    expect(urlCanonique("pas-une-url/")).toBe("pas-une-url/");
  });

  it("TÉMOIN — appliquée deux fois, elle donne le même résultat (idempotence)", () => {
    // Sans quoi un pipeline qui l'appliquerait deux fois (sitemap puis canonical)
    // produirait une troisième forme d'URL, soit le défaut qu'on corrige.
    for (const u of [`${VMD}/faq/`, `${VMD}/`, `${GMC}/securite/`, `${VMD}/blog`]) {
      expect(urlCanonique(urlCanonique(u))).toBe(urlCanonique(u));
    }
  });

  it("TÉMOIN — reproduit les cas RÉELS mesurés en production le 21/09", () => {
    // Le sitemap déclarait ces formes ; le canonical des pages disait l'autre.
    const cas: Array<[string, string]> = [
      [`${VMD}/analyser-devis-travaux/`, `${VMD}/analyser-devis-travaux`],
      [`${VMD}/observatoire/metiers/menuiserie-vitrages/`, `${VMD}/observatoire/metiers/menuiserie-vitrages`],
      [`${VMD}/centre-aide/artisans/artisan-ne-repond-plus/`, `${VMD}/centre-aide/artisans/artisan-ne-repond-plus`],
      [`${VMD}/`, `${VMD}/`],
    ];
    for (const [entree, attendu] of cas) expect(urlCanonique(entree)).toBe(attendu);
  });
});
