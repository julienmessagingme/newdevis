/**
 * Tests du lancement en lot (2026-09-07).
 * Ce qui compte ici : un devis en échec ne doit jamais emporter les autres,
 * et le résumé affiché doit rester vrai à chaque étape.
 */

import { describe, it, expect, vi } from "vitest";
import {
  lancerAnalysesEnLot,
  resumerAvancement,
  DEVIS_MAX_SANS_CONFIRMATION,
  type SuiviDevis,
} from "./analysesEnLot";

function fauxFichier(nom: string): File {
  return new File([new Uint8Array([37, 80, 68, 70])], nom, { type: "application/pdf" });
}

/** Client Supabase minimal ; `echecSur` fait échouer le téléversement d'un nom donné. */
function fauxSupabase(opts: { echecSur?: string } = {}) {
  let compteur = 0;
  const invocations: string[] = [];
  return {
    invocations,
    storage: {
      from: () => ({
        upload: (chemin: string) =>
          Promise.resolve(
            opts.echecSur && chemin.includes("-0.")
              ? { error: { message: opts.echecSur } }
              : { error: null },
          ),
      }),
    },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: `analyse-${++compteur}` }, error: null }),
        }),
      }),
    }),
    functions: {
      invoke: (_nom: string, o: { body: { analysisId: string } }) => {
        invocations.push(o.body.analysisId);
        return Promise.resolve({ error: null });
      },
    },
  };
}

describe("lancerAnalysesEnLot", () => {
  it("crée une analyse par devis et déclenche chacune", async () => {
    const sb = fauxSupabase();
    const etapes: SuiviDevis[][] = [];
    const suivi = await lancerAnalysesEnLot({
      supabase: sb,
      userId: "u1",
      fichiers: [fauxFichier("devis-A.pdf"), fauxFichier("devis-B.pdf")],
      onChange: (s) => etapes.push(s),
    });

    expect(suivi).toHaveLength(2);
    expect(suivi.every((s) => s.etat === "analyse")).toBe(true);
    expect(suivi.map((s) => s.analysisId)).toEqual(["analyse-1", "analyse-2"]);
    expect(sb.invocations).toEqual(["analyse-1", "analyse-2"]);
    // L'écran de suivi doit avoir été rafraîchi à chaque changement d'état.
    expect(etapes.length).toBeGreaterThan(2);
  });

  it("un devis en échec n'emporte pas les autres", async () => {
    const sb = fauxSupabase({ echecSur: "quota de stockage atteint" });
    const suivi = await lancerAnalysesEnLot({
      supabase: sb,
      userId: "u1",
      fichiers: [fauxFichier("casse.pdf"), fauxFichier("bon.pdf")],
      onChange: () => {},
    });

    expect(suivi[0].etat).toBe("echec");
    expect(suivi[0].erreur).toContain("quota");
    expect(suivi[1].etat).toBe("analyse");
    expect(sb.invocations).toHaveLength(1);
  });

  it("aucun fichier → aucun appel", async () => {
    const sb = fauxSupabase();
    const suivi = await lancerAnalysesEnLot({
      supabase: sb, userId: "u1", fichiers: [], onChange: () => {},
    });
    expect(suivi).toEqual([]);
    expect(sb.invocations).toHaveLength(0);
  });
});

describe("resumerAvancement", () => {
  const s = (etat: SuiviDevis["etat"]): SuiviDevis =>
    ({ nom: "d.pdf", etat, analysisId: "x", erreur: null });

  it("pendant le traitement", () => {
    expect(resumerAvancement([s("analyse"), s("analyse")])).toMatch(/2 devis en cours/i);
    expect(resumerAvancement([s("pret"), s("analyse")])).toMatch(/1 devis sur 2 est prêt/i);
  });

  it("à la fin", () => {
    expect(resumerAvancement([s("pret"), s("pret")])).toMatch(/2 analyses sont prêtes/i);
    expect(resumerAvancement([s("pret")])).toMatch(/analyse est prête/i);
  });

  it("dit les échecs plutôt que de les taire", () => {
    expect(resumerAvancement([s("pret"), s("echec")])).toMatch(/1 analyse sur 2 est prête.*n'a pas abouti/i);
    expect(resumerAvancement([s("echec"), s("echec")])).toMatch(/aucune analyse n'a abouti/i);
  });

  it("le seuil de confirmation reste explicite", () => {
    expect(DEVIS_MAX_SANS_CONFIRMATION).toBe(5);
  });
});
