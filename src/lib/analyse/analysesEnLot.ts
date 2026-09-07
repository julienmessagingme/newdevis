/**
 * src/lib/analyse/analysesEnLot.ts
 *
 * 2026-09-07 (décision Johan — « lot consenti ») — LANCER PLUSIEURS ANALYSES
 * DEPUIS UN DOCUMENT QUI CONTENAIT PLUSIEURS DEVIS.
 *
 * Écrit à CÔTÉ du chemin de soumission (`handleSubmit` dans NewAnalysis), pas
 * dedans. Ce chemin-là est le plus critique du produit : chaque analyse y
 * passe. Le lot s'y ajoute, il ne le réécrit pas — quitte à répéter quinze
 * lignes de téléversement plutôt que de refactorer ce qui marche.
 *
 * Déroulé : téléverser chaque devis, créer sa ligne d'analyse, déclencher le
 * traitement, puis SUIVRE l'avancement en interrogeant les statuts. On ne
 * bloque pas sur la fin de chaque analyse — l'utilisateur doit pouvoir ouvrir
 * le premier devis pendant que le second travaille.
 */

/**
 * Nombre maximal de devis analysables en un seul lot.
 *
 * 2026-09-07 (décision Johan) — **limite dure, pas une confirmation**. Le
 * premier réglage demandait confirmation au-delà de 5 ; à l'usage c'est trop :
 * chaque devis d'un lot est une analyse à suivre, potentiellement une revue
 * humaine, et une page de plus à retrouver. « Au-delà de trois, ça devient
 * ingérable » — pour l'utilisateur d'abord, qui perd le fil de ce qu'il a
 * lancé.
 *
 * Les devis au-delà du seuil ne disparaissent pas : ils restent listés et
 * l'utilisateur peut choisir LESQUELS trois analyser, puis redéposer le
 * document pour les suivants.
 */
export const DEVIS_MAX_PAR_LOT = 3;

/** Fréquence d'interrogation des statuts. */
const INTERVALLE_SUIVI_MS = 3_000;

/** Au-delà, on cesse d'attendre : le suivi côté serveur prend le relais
 *  (le cron `analysis-maintenance` bascule en erreur au bout de 15 min). */
const DUREE_SUIVI_MAX_MS = 6 * 60_000;

export type EtatAnalyse =
  | "attente"        // pas encore commencé
  | "televersement"  // fichier en cours d'envoi
  | "analyse"        // analyse lancée, en cours
  | "pret"           // conclusion disponible
  | "echec";         // téléversement, création ou analyse en échec

export interface SuiviDevis {
  nom: string;
  etat: EtatAnalyse;
  analysisId: string | null;
  erreur: string | null;
}

interface OptionsLot {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  userId: string;
  fichiers: File[];
  /** Appelé à chaque changement d'état, pour rafraîchir l'écran de suivi. */
  onChange: (suivi: SuiviDevis[]) => void;
  /** Injectable pour les tests ; par défaut `Date.now`. */
  maintenant?: () => number;
}

function extensionEtType(fichier: File): { ext: string; contentType: string } {
  const ext = fichier.name.split(".").pop()?.toLowerCase() || "pdf";
  const table: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    heic: "image/heic",
  };
  const contentType =
    fichier.type && fichier.type !== "application/octet-stream"
      ? fichier.type
      : (table[ext] ?? "application/pdf");
  return { ext, contentType };
}

/**
 * Téléverse les devis, crée une analyse par devis et déclenche leur traitement.
 *
 * Retourne dès que TOUTES les analyses sont lancées — pas quand elles sont
 * finies. Le suivi de fin est assuré par `suivreAvancement`.
 */
export async function lancerAnalysesEnLot(opts: OptionsLot): Promise<SuiviDevis[]> {
  const { supabase, userId, fichiers, onChange } = opts;

  // 2026-09-07 — identifiant du DOCUMENT d'origine, partagé par toutes les
  // analyses du lot. Sans lui, ouvrir la première analyse faisait perdre la
  // trace des autres : elles existaient en base sans que rien ne les relie.
  const batchId = fichiers.length > 1 ? crypto.randomUUID() : null;

  const suivi: SuiviDevis[] = fichiers.map((f) => ({
    nom: f.name,
    etat: "attente",
    analysisId: null,
    erreur: null,
  }));
  const publier = () => onChange(suivi.map((s) => ({ ...s })));
  publier();

  for (let i = 0; i < fichiers.length; i++) {
    const fichier = fichiers[i];
    suivi[i].etat = "televersement";
    publier();

    try {
      const { ext, contentType } = extensionEtType(fichier);
      const chemin = `${userId}/${Date.now()}-${i}.${ext}`;
      const corps = new Blob([await fichier.arrayBuffer()], { type: contentType });

      const { error: erreurEnvoi } = await supabase.storage
        .from("devis")
        .upload(chemin, corps, { contentType, upsert: false });
      if (erreurEnvoi) throw new Error(erreurEnvoi.message || "téléversement refusé");

      const { data: analyse, error: erreurCreation } = await supabase
        .from("analyses")
        .insert({
          user_id: userId,
          file_name: fichier.name,
          file_path: chemin,
          status: "pending",
          ...(batchId ? { batch_id: batchId } : {}),
        })
        .select("id")
        .single();
      if (erreurCreation || !analyse) {
        throw new Error(erreurCreation?.message || "création de l'analyse refusée");
      }

      suivi[i].analysisId = analyse.id;
      suivi[i].etat = "analyse";
      publier();

      // On ne l'attend PAS : l'analyse dure 38 s en médiane et jusqu'à trois
      // minutes au 90e centile. Les lancer à la suite sans attendre permet au
      // premier devis d'être prêt pendant que le second travaille.
      void supabase.functions
        .invoke("analyze-quote", { body: { analysisId: analyse.id } })
        .catch((e: unknown) => {
          console.warn("[lot] invocation échouée", analyse.id, e);
        });
    } catch (e) {
      suivi[i].etat = "echec";
      suivi[i].erreur = e instanceof Error ? e.message : "erreur inconnue";
      publier();
    }
  }

  return suivi.map((s) => ({ ...s }));
}

/**
 * Interroge périodiquement le statut des analyses lancées jusqu'à ce qu'elles
 * soient toutes terminées (ou en échec, ou le délai écoulé).
 *
 * Une analyse est « prête » quand son statut est `completed`. Les autres
 * statuts valides sont `pending`, `processing` et `error` — surtout pas
 * `failed`, que la contrainte de la table rejette (incident du 2026-09-03).
 *
 * Retourne une fonction d'arrêt, à appeler au démontage du composant.
 */
export function suivreAvancement(opts: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  suivi: SuiviDevis[];
  onChange: (suivi: SuiviDevis[]) => void;
}): () => void {
  const { supabase, onChange } = opts;
  const etats = opts.suivi.map((s) => ({ ...s }));
  const debut = Date.now();
  let arrete = false;

  const ids = etats.map((s) => s.analysisId).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return () => {};

  const tick = async () => {
    if (arrete) return;
    try {
      const { data } = await supabase
        .from("analyses")
        .select("id, status")
        .in("id", ids);

      for (const ligne of data ?? []) {
        const cible = etats.find((s) => s.analysisId === ligne.id);
        if (!cible || cible.etat === "echec") continue;
        if (ligne.status === "completed") cible.etat = "pret";
        else if (ligne.status === "error") {
          cible.etat = "echec";
          cible.erreur = "l'analyse n'a pas abouti";
        }
      }
      onChange(etats.map((s) => ({ ...s })));
    } catch (e) {
      console.warn("[lot] suivi interrompu", e);
    }

    const termine = etats.every((s) => s.etat === "pret" || s.etat === "echec");
    if (termine || Date.now() - debut > DUREE_SUIVI_MAX_MS) return;
    setTimeout(tick, INTERVALLE_SUIVI_MS);
  };

  setTimeout(tick, INTERVALLE_SUIVI_MS);
  return () => { arrete = true; };
}

/** Résumé lisible de l'avancement, pour l'en-tête de l'écran de suivi. */
export function resumerAvancement(suivi: SuiviDevis[]): string {
  const prets = suivi.filter((s) => s.etat === "pret").length;
  const echecs = suivi.filter((s) => s.etat === "echec").length;
  const total = suivi.length;

  if (prets === total) return total > 1 ? `Vos ${total} analyses sont prêtes.` : "Votre analyse est prête.";
  if (prets + echecs === total) {
    return echecs === total
      ? "Aucune analyse n'a abouti."
      : `${prets} analyse${prets > 1 ? "s" : ""} sur ${total} ${prets > 1 ? "sont prêtes" : "est prête"} — ${echecs} n'${echecs > 1 ? "ont" : "a"} pas abouti.`;
  }
  return prets === 0
    ? `Analyse de ${total} devis en cours…`
    : `${prets} devis sur ${total} ${prets > 1 ? "sont prêts" : "est prêt"}, les autres suivent…`;
}
