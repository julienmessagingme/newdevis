/**
 * Tests de la règle unique « avons-nous un prix à opposer ? ».
 *
 * Elle gouverne trois affichages qui se contredisaient (verdict de tête,
 * répartition des postes, cartes de détail) — d'où des tests sur la règle
 * elle-même plutôt que sur chacun de ses trois consommateurs.
 */

import { describe, it, expect } from "vitest";
import { referenceOpposable } from "./referenceOpposable";

describe("referenceOpposable", () => {
  it("accepte un rapprochement en confiance haute", () => {
    expect(referenceOpposable({ confidence: "high", top_similarity: 0.91 })).toBe(true);
  });

  it("refuse la zone tiède — c'est le cas AQUIVOLTAIQUE", () => {
    // Ligne réelle du devis : « Installation panneaux photovoltaïques », 0,767.
    expect(referenceOpposable({ confidence: "medium", top_similarity: 0.767 })).toBe(false);
    expect(referenceOpposable({ confidence: "low", top_similarity: 0.678 })).toBe(false);
    expect(referenceOpposable({ confidence: "no_match", top_similarity: null })).toBe(false);
  });

  it("reste permissif sans méta vectorielle — pipeline legacy V3.6", () => {
    // Les analyses d'avant le matcher vectoriel n'en portent pas, et le serveur
    // les compte déjà comme comparables : les rendre muettes ferait disparaître
    // les prix de tout le stock ancien.
    expect(referenceOpposable(undefined)).toBe(true);
    expect(referenceOpposable(null)).toBe(true);
    expect(referenceOpposable({})).toBe(true);
  });

  it("ne se laisse pas convaincre par la seule similarité", () => {
    // La confiance est la sortie du matcher, gardes lexicales comprises. Une
    // similarité élevée qui n'a PAS produit « high » a été écartée en
    // connaissance de cause (fourniture vs pose, métier exclusif…) — la
    // recycler ici rouvrirait la porte que ces gardes ferment.
    expect(referenceOpposable({ confidence: "medium", top_similarity: 0.99 })).toBe(false);
  });

  it("refuse une confiance inconnue plutôt que de l'accepter", () => {
    expect(referenceOpposable({ confidence: "peut-etre" })).toBe(false);
  });
});
