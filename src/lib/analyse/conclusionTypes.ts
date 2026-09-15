/**
 * Types partagés pour le verdict expert IA (ConclusionIA).
 * Importé par : API route, hook useConclusionIA, composant ConclusionIA.
 */

export interface AnomalieConclusion {
  poste: string;
  ligne_devis: string;
  prix_unitaire_devis: number;
  unite: string;
  fourchette_min: number | null;
  fourchette_max: number | null;
  surcout_estime: number | null;
  explication: string | null;
}

export interface ConclusionData {
  // ── Analyse narrative ──────────────────────────────────────────────────────
  verdict_global:   "dans_la_norme" | "eleve_justifie" | "a_negocier" | "a_risque";
  phrase_intro:     string;
  anomalies:        AnomalieConclusion[];
  justifications:   string;
  has_anomalies:    boolean;

  // ── Aide à la décision ─────────────────────────────────────────────────────
  /** Recommandation binaire pour le particulier */
  verdict_decisionnel: "signer" | "signer_avec_negociation" | "ne_pas_signer";

  /** Surcoût global estimé (Σ anomalies + marge d'incertitude) */
  surcout_global: { min: number; max: number };

  /** Niveau de risque financier global */
  niveau_risque: "faible" | "modéré" | "élevé";

  /** 3 actions concrètes à réaliser avant de signer */
  actions_avant_signature: string[];

  // ── Explication verdict (section "Pourquoi ce verdict ?") ───────────────────
  /** Bloc structuré généré par generateVerdictReasons() */
  verdict_reasons?: {
    summary: string;
    reasons: string[];
    context: string[];
  };

  // ── Contexte marché (seuils adaptatifs — affiché dans ConclusionIA) ──────────
  /** Phrase courte expliquant pourquoi les seuils ont été ajustés (dispersion / complexité) */
  market_context_note?: string;

  /**
   * V3.4.13 — `true` quand `overprice_pct > 0.50` ET `anomalies_count === 0`.
   * Cas typique : catalogue marché qui sous-couvre la prestation (ex: assainissement
   * réhabilitation complète matché à un seul "micro-station" → écart aberrant).
   * Quand ce flag est set, ConclusionIA :
   *  - Masque le hero "+X €" alarmiste (chiffre non fiable)
   *  - Affiche un encadré "Comparaison globale indicative" à la place
   *  - Garde le verdict `signer_avec_negociation` (action de précaution conseillée)
   */
  comparison_indicative?: boolean;
  /**
   * 2026-09-15 — avis de l'ARBITRE DU RAPPROCHEMENT (`arbitreRapprochement.ts`).
   * Une IA relit, poste par poste, si l'entrée catalogue opposée décrit bien la
   * même prestation que la ligne de devis. Ses contestations MATÉRIELLES (celles
   * qui changeraient le montant) routent l'analyse en `pending_review`.
   * ⚠️ Présent même quand il ne conteste rien : « il a regardé et n'a rien
   * trouvé » et « il n'a pas tourné » ne doivent jamais être confondus.
   */
  arbitrage_rapprochement?: {
    modele: string;
    postes_juges: number;
    conteste: Array<{
      label: string; ligne: string; choix: number; raison: string;
      propose: string | null; proposeJobType: string | null; ecart: number;
    }>;
    /** Somme des écarts contestés — c'est elle qui décide du routage en revue. */
    ecart_conteste: number;
    sans_effet: number;
    echecs: number;
    duree_ms: number;
  };
  /**
   * 2026-09-06 — postes qu'aucun tarif de référence ne couvre, NOMMÉS (3 max,
   * les plus gros d'abord). Avant, la page écrivait « certaines prestations
   * sont trop spécifiques » sans jamais dire lesquelles, alors que le moteur
   * le sait : ce sont les groupes qui ne sortent pas en confiance haute.
   */
  postes_sans_reference?: string[];

  /**
   * V3.4.14 (2026-05-16) — Devis étranger (Belgique, Luxembourg, Suisse, etc.).
   * Le catalogue marché, les vérifications SIRET/RGE/RNE et l'analyse financière
   * sont calibrés sur la réglementation française. Quand `is_foreign=true`,
   * la conclusion est entièrement bypassée (pas d'appel Gemini, pas de comparaison
   * catalogue) et un wording dédié est généré côté serveur.
   * UI : ConclusionIA affiche une bannière ambre explicite, masque le hero surcoût.
   */
  foreign_quote?: {
    country_code: string;
    country_label: string;
  };

  /**
   * V3.4.20 (2026-05-19) — Estimation courtier travaux (pas un vrai devis d'artisan).
   * Couvre Renovation Man, Ootravaux, Hellio, Travaux.com, Bricoleur du Coin, etc.
   * Quand le doc est détecté comme estimation courtier :
   * - Bypass complet de l'appel Gemini conclusion
   * - Bypass du bloc Entreprise (pas d'artisan à vérifier — il sera désigné plus tard)
   * - Bypass du matching catalogue (pas pertinent — l'estimation est déjà au prix marché)
   * - Bannière UI dédiée invitant à re-uploader le VRAI devis quand l'artisan sera désigné
   * Bug d'origine : VMD cherchait "Renovation Man" sur INSEE → 6 homonymes dont 3 RADIÉS
   * → bloc ROUGE faux + verdict REFUSER mensonger.
   */
  estimation_courtier?: {
    courtier_nom: string | null;
  };

  /**
   * V3.4.28 (2026-05-22) — Devis HORS-SCOPE BTP (réparation véhicule, électroménager,
   * service personnel, médical, etc.). Quand ce champ est set, ConclusionIA affiche
   * une bannière dédiée et AnalysisResult masque BlockPrixMarche (qui sinon afficherait
   * des hallucinations de matching catalogue type "Remplacement chaudière fioul" pour
   * un nettoyage de vélo).
   */
  hors_scope?: {
    categorie: "reparation_vehicule" | "reparation_electromenager" | "achat_biens" | "service_personnel" | "medical" | "veterinaire" | "autre";
  };

  /**
   * V3.5.1 (2026-05-26) — Devis incomplet / résumé par lot (sous-totaux par
   * corps de métier sans quantités ni prix unitaires). Quand ce champ est set,
   * ConclusionIA affiche une bannière dédiée "Devis trop synthétique" et
   * AnalysisResult peut masquer BlockPrixMarche (qui sinon afficherait des
   * fausses anomalies type "Plomberie 7600€ vs 90-220€" pour un sous-total
   * de lot).
   */
  incomplete_quote?: {
    reason: string;
  };

  /**
   * V3.5.4 (2026-07-08) — Prestation intellectuelle réglementée (géomètre-expert,
   * architecte DPLG, notaire, huissier, BET, MOE indépendant, diagnostiqueur,
   * expert judiciaire, économiste de construction…). Ces prestations ont des
   * conditions de paiement standards (acompte élevé) qui ne doivent PAS
   * déclencher le hard block acompte_cumule_excessif. Cas d'origine : devis
   * FARAUD.pdf géomètre-expert 2 250€ avec 40+50% acompte -> verdict "à risque"
   * disproportionné (Julien 2026-07-08).
   */
  prestation_intellectuelle?: {
    /** Libellé du métier détecté (ex: "géomètre-expert", "architecte DPLG"). */
    metier: string;
  };

  // ── Phase 4 (2026-08-15) — Verdict honnête (Maillon 3) ─────────────────────
  /**
   * Verdict tranché 1 ligne, assemblé DÉTERMINISTIQUEMENT par leviersBuilder.ts.
   * Le motif est TOUJOURS nommé — jamais « risque élevé » sans dire lequel.
   * Absent sur les conclusions antérieures à Phase 4 (fallback UI = phrase_intro).
   */
  verdict_ligne?: {
    decision: "signer" | "signer_avec_negociation" | "ne_pas_signer";
    resume: string;
    motif: string;
    marge: string | null;
  };

  /**
   * 2026-09-13 — le devis touche-t-il au GROS ŒUVRE (`estGrosOeuvre`) ?
   * Déjà calculé pour les leviers, il n'était pas exposé à l'UI. Il sert à
   * poser la question du sondage dommages-ouvrage sur **toute** la population
   * concernée, et plus seulement là où le CONSEIL DO se déclenche : le test
   * n'avait recueilli que 2 affichages en quinze jours.
   * ⚠️ Absent des conclusions antérieures → l'UI retombe sur l'ancien
   * comportement (question posée uniquement sous le levier).
   */
  travaux_gros_oeuvre?: boolean;

  /**
   * Max 3 leviers de négociation hiérarchisés (🔴 puissant / 🟠 important /
   * 🟡 bonus) — remplacent la liste de 6-8 actions dans le chemin de lecture
   * principal. Absent sur les conclusions pré-Phase 4 (fallback UI = actions).
   */
  leviers?: Array<{
    niveau: "puissant" | "important" | "bonus";
    /** Phase 4 tranche 1+ : negocier = fait baisser le prix ; securiser = protège. */
    objectif?: "negocier" | "securiser";
    /** Phase 4 tranche 2 : identifiant machine-lisible (aligne fiche + message). */
    type?: string;
    titre: string;
    detail: string;
  }>;

  /**
   * 2026-09-15 — MATÉRIEL VÉRIFIÉ PAR SA RÉFÉRENCE FABRICANT (vertical clim).
   *
   * Rapprochement LITTÉRAL contre la table `prix_materiel` — pas de similarité
   * sémantique : le vectoriel confondrait un MXZ-4F72VF4 et un MXZ-2F53VF4,
   * deux produits séparés par 900 €.
   *
   * 🔴 CES LIGNES PRIMENT SUR LE RAPPROCHEMENT VECTORIEL, et l'UI doit les
   * retirer du détail poste par poste. Mesuré sur le stock : le catalogue
   * rapproche ces mêmes lignes sur « Climatisation mono-split · 900-2 800 € »
   * — une unité intérieure seule comparée à une installation complète. Une
   * unité facturée 647 € y paraît BON MARCHÉ quand la référence exacte la
   * situe à +94 %. Afficher les deux fourchettes serait la contradiction
   * corrigée le 2026-09-10 (« soit on connaît les prix, soit on ne les
   * connaît pas »).
   *
   * ⚠️ Absent des conclusions antérieures → l'UI retombe sur l'affichage
   * historique.
   */
  materiel_verifie?: Array<{
    /** Le libellé du DEVIS, jamais notre désignation (règle du 2026-09-10). */
    ligne: string;
    reference: string;
    designation: string;
    quantite: number;
    /** ⚠️ UNITAIRE, jamais le montant de ligne (piège du 2026-09-15). */
    prix_unitaire_devis: number;
    marche_min_ht: number;
    marche_max_ht: number;
    ecart_min_pct: number;
    ecart_max_pct: number;
    /** normal < +50 % · mention +50-70 % · question > +70 % (seuils mesurés). */
    zone: "normal" | "mention" | "question";
    nb_sources: number;
    releve_le: string;
  }>;

  // ── Métadonnée ─────────────────────────────────────────────────────────────
  generated_at: string;
}
