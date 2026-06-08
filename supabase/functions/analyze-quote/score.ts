import type { ExtractedData, VerificationResult, ScoringResult, ScoringColor } from "./types.ts";
import type { DomainConfig } from "./domain-config.ts";
import { getCountryName } from "./utils.ts";

// ============================================================
// PHASE 3: DETERMINISTIC SCORING
// ============================================================

export function calculateScore(
  extracted: ExtractedData,
  verified: VerificationResult,
  config: DomainConfig
): ScoringResult {

  const rouges: string[] = [];
  const oranges: string[] = [];
  const verts: string[] = [];
  const informatifs: string[] = [];

  // ROUGE criteria
  if (verified.entreprise_radiee === true) {
    rouges.push("Entreprise radiée des registres officiels (confirmé via API)");
  }

  if (verified.procedure_collective === true) {
    rouges.push("Procédure collective en cours (redressement ou liquidation, confirmé)");
  }

  // Santé financière via ratios data.economie.gouv.fr
  // ── Guard auto-entrepreneur ──────────────────────────────────────────────────
  // Les auto-entrepreneurs (TVA non applicable, art. 293 B) ne sont pas soumis
  // à l'obligation de dépôt annuel des comptes. La règle "données périmées" ne
  // s'applique donc pas à eux et serait trompeuse. Si des données financières
  // existent quand même (ex : changement de statut SARL → AE), on les ignore
  // pour les règles de péremption.
  const isAutoEntrepreneur = extracted.tva_non_applicable === true;

  if (verified.finances.length > 0 && !isAutoEntrepreneur) {
    const latest = verified.finances[0];

    // ── Règle : données financières périmées ──────────────────────────────────
    // Les comptes peuvent être non accessibles publiquement pour diverses raisons légales
    // (déclaration de confidentialité, délai de traitement infogreffe…). On ne présume
    // pas d'infraction — on signale un manque d'information, pas une irrégularité.
    if (latest.date_cloture) {
      const anneeExercice = parseInt(latest.date_cloture.substring(0, 4), 10);
      const anneeActuelle = new Date().getFullYear();
      const retardAns = anneeActuelle - anneeExercice;

      if (retardAns >= 6) {
        rouges.push(
          `Comptes non accessibles publiquement depuis ${retardAns} ans (dernier exercice connu : ${anneeExercice}) — ` +
          `situation financière récente inconnue, analyse de solvabilité impossible`
        );
      } else if (retardAns >= 4) {
        oranges.push(
          `Comptes non accessibles publiquement (dernier exercice connu : ${anneeExercice}, il y a ${retardAns} ans) — ` +
          `impossible d'évaluer la solvabilité actuelle de l'entreprise`
        );
      } else if (retardAns >= 2) {
        oranges.push(
          `Données financières non récentes (dernier exercice connu : ${anneeExercice}) — ` +
          `interpréter les indicateurs ci-dessous avec prudence`
        );
      }
    }

    // ── Règle : badge vert uniquement si données récentes (≤ 2 ans) ──────────
    // Les critères financiers positifs (résultat net, autonomie) ne peuvent
    // valider l'entreprise que si les données sont exploitables.
    const anneeExercice = latest.date_cloture ? parseInt(latest.date_cloture.substring(0, 4), 10) : 0;
    const donneesRecentes = anneeExercice >= new Date().getFullYear() - 2;

    if (donneesRecentes) {
      if (latest.taux_endettement !== null && latest.taux_endettement > 200) {
        rouges.push(`Taux d'endettement très élevé (${latest.taux_endettement.toFixed(0)}%)`);
      }
      if (latest.resultat_net !== null && latest.resultat_net < 0 && latest.chiffre_affaires !== null && latest.chiffre_affaires > 0) {
        const pertesPct = Math.abs(latest.resultat_net / latest.chiffre_affaires * 100);
        if (pertesPct > 20) {
          rouges.push(`Pertes importantes au dernier exercice (${pertesPct.toFixed(0)}% du CA)`);
        }
      }
    } else {
      // Données trop anciennes pour déclencher des critères rouges sur les ratios,
      // mais on peut quand même signaler les ratios périmés si très dégradés
      if (latest.taux_endettement !== null && latest.taux_endettement > 200) {
        oranges.push(`Taux d'endettement très élevé au dernier exercice connu (${latest.taux_endettement.toFixed(0)}% en ${anneeExercice}) — données à actualiser`);
      }
    }
  }

  const hasExplicitCash = extracted.paiement.modes.some(m => m.toLowerCase() === "especes");
  if (hasExplicitCash) {
    rouges.push("Paiement en espèces explicitement demandé sur le devis");
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Acompte cumulé AVANT PRESTATION (V3.5.9 — 2026-06-08)
  //
  // BUG V3.1 corrigé : la version précédente cumulait TOUTES les étapes sauf
  // "reception" → un échéancier sain "40% démarrage + 40% mi-chantier + 15% fin
  // + 5% réception" produisait un cumul de 95% pré-réception → hard block ROUGE
  // alors que la structure est légitime (chaque jalon correspond à de la valeur
  // délivrée). Cas d'origine : devis Côte Maison Travaux (rénovation SDB 11 871 €).
  //
  // Nouvelle logique : on ne cumule QUE les étapes "avant prestation" :
  //   - signature           : 100% avant que l'artisan ait commencé
  //   - demarrage           : 100% avant que l'artisan ait commencé
  //   - livraison_materiaux : matériaux livrés mais pas posés (avancement
  //                            indirect — comptable comme acompte non honoré)
  //
  // On EXCLUT du cumul les jalons d'avancement (valeur déjà délivrée) :
  //   - intermediaire   : milieu de chantier, ~50% déjà fait
  //   - revue_chantier  : milestone d'avancement validé
  //   - fin_travaux     : 100% matériellement fini, juste avant PV
  //   - reception       : retenue de garantie standard 5-10%
  //
  // Le seul VRAI risque "acompte excessif" = ce qui est payé AVANT que l'artisan
  // commence à délivrer de la valeur. Le code conso L121-18 + arrêté 2 mars 1990
  // encadrent l'acompte initial, pas les paiements progressifs alignés sur
  // l'avancement (qui sont au contraire RECOMMANDÉS par la FFB/CAPEB).
  //
  // Le critère ORANGE "acompte modéré 30-50%" continue de s'appliquer sur le
  // nouveau cumul pré-prestation : un démarrage à 40% reste un signal à négocier.
  // ──────────────────────────────────────────────────────────────────────────────
  const PRE_PRESTATION_ETAPES = new Set([
    "signature",
    "demarrage",
    "livraison_materiaux",
  ]);

  const modalites = extracted.paiement.modalites_paiement;

  let acompteCumulePreReception: number | null = null;
  if (Array.isArray(modalites) && modalites.length > 0) {
    acompteCumulePreReception = modalites
      .filter(m => PRE_PRESTATION_ETAPES.has(m.etape))
      .reduce((sum, m) => sum + (m.pct ?? 0), 0);
  }

  // Fallback historique si modalites_paiement absent (rétrocompat)
  const acompteAvantTravauxLegacy = extracted.paiement.acompte_avant_travaux_pct ??
    (!extracted.paiement.echeancier_detecte ? extracted.paiement.acompte_pct : null);

  // PRIORITÉ : cumul détaillé si disponible, sinon valeur historique
  const acompteAvantTravaux = acompteCumulePreReception ?? acompteAvantTravauxLegacy;

  if (acompteAvantTravaux !== null && acompteAvantTravaux > 50) {
    // Wording adapté : si on a le détail, on l'affiche pour transparence
    const detailCumul = Array.isArray(modalites) && modalites.length > 1
      ? ` (${modalites
          .filter(m => PRE_PRESTATION_ETAPES.has(m.etape))
          .map(m => `${m.pct}% à ${m.etape}`)
          .join(" + ")})`
      : "";
    rouges.push(
      `Acompte cumulé supérieur à 50% demandé avant démarrage des travaux (${acompteAvantTravaux}%${detailCumul}) — ` +
      `risque majeur en cas de défaillance de l'entreprise`
    );
  }

  // ORANGE criteria
  if (verified.iban_verifie && verified.iban_valide === true && verified.iban_code_pays && verified.iban_code_pays !== "FR") {
    oranges.push(`IBAN étranger (${getCountryName(verified.iban_code_pays)}) - à confirmer si attendu`);
  }

  if (verified.iban_verifie && verified.iban_valide === false) {
    oranges.push("Format IBAN invalide (erreur de saisie probable)");
  }

  if (acompteAvantTravaux !== null && acompteAvantTravaux > 30 && acompteAvantTravaux <= 50) {
    oranges.push(`Acompte modéré (${acompteAvantTravaux}%) - un acompte ≤ 30% est recommandé`);
  }

  if (verified.google_trouve && verified.google_note !== null && verified.google_note < 4.0) {
    oranges.push(`Note Google inférieure au seuil de confort (${verified.google_note}/5)`);
  }

  // Peu d'avis Google au regard de l'ancienneté de l'entreprise
  if (
    verified.google_trouve &&
    verified.google_nb_avis !== null &&
    verified.anciennete_annees !== null &&
    verified.anciennete_annees >= 5
  ) {
    const seuilAvis = Math.max(3, Math.min(10, Math.floor(verified.anciennete_annees / 3)));
    if (verified.google_nb_avis < seuilAvis) {
      oranges.push(
        `Seulement ${verified.google_nb_avis} avis Google pour une entreprise de ${verified.anciennete_annees} ans — ` +
        `note statistiquement peu fiable (seuil attendu : ${seuilAvis}+ avis). Demandez des références de chantiers récents.`
      );
    }
  }

  if (verified.entreprise_immatriculee === true && verified.anciennete_annees !== null && verified.anciennete_annees < 3) {
    const ans = verified.anciennete_annees;
    oranges.push(
      ans < 1
        ? "Entreprise de moins d'un an — aucun historique financier, aucun avis client vérifiable"
        : `Entreprise de ${ans} an${ans > 1 ? "s" : ""} — historique financier insuffisant et peu d'avis clients disponibles`
    );
  }

  if (verified.finances.length > 0 && !isAutoEntrepreneur) {
    const latest = verified.finances[0];
    const anneeExOrange = latest.date_cloture ? parseInt(latest.date_cloture.substring(0, 4), 10) : 0;
    const donneesRecentes2 = anneeExOrange >= new Date().getFullYear() - 2;

    // Ratios dégradés — seulement si données récentes (sinon déjà signalé par la règle périmé)
    if (donneesRecentes2) {
      if (latest.taux_endettement !== null && latest.taux_endettement > 100 && latest.taux_endettement <= 200) {
        oranges.push(`Taux d'endettement élevé (${latest.taux_endettement.toFixed(0)}%)`);
      }
      if (latest.ratio_liquidite !== null && latest.ratio_liquidite < 80) {
        oranges.push(`Ratio de liquidité faible (${latest.ratio_liquidite.toFixed(0)}%)`);
      }
    }
  }

  // INFORMATIF criteria
  if (!extracted.entreprise.iban) {
    informatifs.push("ℹ️ Coordonnées bancaires non détectées sur le devis - demandez un RIB à l'artisan");
  }

  if (!extracted.entreprise.siret) {
    if (extracted.entreprise.nom) {
      informatifs.push("ℹ️ SIRET non détecté sur le devis - demandez-le à l'artisan pour vérification");
    } else {
      informatifs.push("ℹ️ Coordonnées entreprise non identifiées sur le devis");
    }
  }

  if (extracted.entreprise.siret && verified.lookup_status === "error") {
    informatifs.push("ℹ️ Vérification entreprise temporairement indisponible - données à confirmer manuellement");
  } else if (extracted.entreprise.siret && verified.lookup_status === "skipped") {
    informatifs.push("ℹ️ Vérification entreprise non effectuée");
  }

  // V3.4.19 — lookup_status="ambiguous" : on a plusieurs homonymes sans pouvoir
  // départager (cf. helper pickBestNameMatch dans verify.ts). Pas de ROUGE, pas
  // de VERT — on signale honnêtement que le SIRET n'a pas été extrait et qu'on
  // ne peut pas valider l'identité sans une vérification manuelle. ORANGE.
  if (verified.lookup_status === "ambiguous") {
    const candidatesPreview = (verified.ambiguous_candidates ?? []).slice(0, 3).join(" · ");
    const suffix = candidatesPreview ? ` (candidats trouvés : ${candidatesPreview})` : "";
    oranges.push(`Identification entreprise incertaine — SIRET non extrait du devis, plusieurs entreprises homonymes existent en France. Demandez le SIRET à l'artisan et vérifiez sur societe.com${suffix}`);
  }

  if (config.insuranceChecks.primary === "assurance_decennale") {
    if (extracted.entreprise.assurance_decennale_mentionnee === false) {
      informatifs.push(`ℹ️ ${config.insuranceLabels.primary} non détectée sur le devis - demandez l'attestation à l'artisan`);
    } else if (extracted.entreprise.assurance_decennale_mentionnee === null) {
      informatifs.push(`ℹ️ ${config.insuranceLabels.primary} à confirmer - mention partielle ou absente`);
    }
  } else if (config.insuranceChecks.primary === "assurance_rc_pro") {
    if (extracted.entreprise.assurance_rc_pro_mentionnee === false) {
      informatifs.push(`ℹ️ ${config.insuranceLabels.primary} non détectée sur le devis - demandez l'attestation au professionnel`);
    } else if (extracted.entreprise.assurance_rc_pro_mentionnee === null) {
      informatifs.push(`ℹ️ ${config.insuranceLabels.primary} à confirmer - mention partielle ou absente`);
    }
  }

  if (!verified.google_trouve) {
    informatifs.push("ℹ️ Aucun avis Google trouvé pour cette entreprise");
  }

  if (config.certifications.includes("RGE") && verified.rge_pertinent && !verified.rge_trouve) {
    informatifs.push("ℹ️ Aucune qualification RGE trouvée pour ce SIRET");
  }

  if (extracted.travaux.length === 0) {
    informatifs.push("ℹ️ Aucun poste de travaux détaillé détecté sur le devis");
  }

  // Devis sans prix par ligne
  if (extracted.travaux.length > 0 && extracted.travaux.every(t => t.montant === null)) {
    oranges.push("Devis sans détail de prix par poste — impossible de vérifier la ventilation des coûts");
  }

  // Auto-entrepreneur TVA non applicable
  if (extracted.tva_non_applicable === true) {
    oranges.push("TVA non applicable (art. 293 B) — vérifiez que l'artisan ne dépasse pas le seuil de franchise (77 700 €/an)");
    informatifs.push("ℹ️ Auto-entrepreneur non soumis à l'obligation de dépôt des comptes annuels — l'absence de données financières publiées est normale pour ce statut");
  }

  // Devis manuscrit
  if (extracted.devis_manuscrit === true) {
    oranges.push("Devis manuscrit — valeur juridique et traçabilité limitées, préférez un devis dactylographié");
  }

  // Devis ancien (> 12 mois)
  if (extracted.dates?.date_devis) {
    const devisDate = new Date(extracted.dates.date_devis);
    const now = new Date();
    const ageMonths = (now.getFullYear() - devisDate.getFullYear()) * 12 + (now.getMonth() - devisDate.getMonth());
    if (ageMonths > 12) {
      const anneeDevis = devisDate.getFullYear();
      oranges.push(
        `Devis daté de ${anneeDevis} (il y a ${Math.floor(ageMonths / 12)} an${Math.floor(ageMonths / 12) > 1 ? "s" : ""}) — ` +
        `les prix des matériaux et de la main d'œuvre ont évolué depuis, la comparaison au marché est à interpréter avec prudence`
      );
    }
  }

  // Matériaux fournis par le client
  if (extracted.materiaux_fournis_client === true) {
    informatifs.push("ℹ️ Matériaux fournis par le client — la comparaison aux prix marché (fourniture + pose) ne s'applique pas ici");
  }

  // VERT criteria
  if (verified.entreprise_immatriculee === true) {
    verts.push("Entreprise identifiée dans les registres officiels");
  }

  if (verified.iban_verifie && verified.iban_valide === true && verified.iban_code_pays === "FR") {
    verts.push("IBAN France valide");
  }

  const hasTraceable = extracted.paiement.modes.some(m => ["virement", "cheque", "carte_bancaire"].includes(m.toLowerCase()));
  if (hasTraceable && !hasExplicitCash) {
    verts.push("Mode de paiement traçable");
  }

  if (acompteAvantTravaux !== null && acompteAvantTravaux <= 30) {
    verts.push(`Acompte raisonnable (${acompteAvantTravaux}%)`);
  }

  for (const cert of config.certifications) {
    if (extracted.entreprise.certifications_mentionnees.some(c => c.toUpperCase().includes(cert.toUpperCase()))) {
      verts.push(`Certification ${cert} mentionnée`);
    }
  }
  if (config.certifications.includes("RGE") && verified.rge_trouve) {
    const noms = verified.rge_qualifications.slice(0, 2).map(q => q.nom).join(", ");
    verts.push(`Qualification RGE vérifiée${noms ? ` : ${noms}` : ""}`);
  }

  if (
    verified.google_trouve &&
    verified.google_note !== null &&
    verified.google_note >= 4.2 &&
    (verified.google_nb_avis === null || verified.google_nb_avis >= 5)
  ) {
    verts.push(`Bonne réputation en ligne (${verified.google_note}/5 sur Google, ${verified.google_nb_avis} avis)`);
  }

  if (verified.anciennete_annees !== null && verified.anciennete_annees >= 5) {
    verts.push(`Entreprise établie (${verified.anciennete_annees} ans d'ancienneté)`);
  }

  if (verified.finances.length > 0 && !isAutoEntrepreneur) {
    const latest = verified.finances[0];
    const anneeExVert = latest.date_cloture ? parseInt(latest.date_cloture.substring(0, 4), 10) : 0;
    const donneesRecentes3 = anneeExVert >= new Date().getFullYear() - 2;

    // Les ratios positifs ne valident l'entreprise QUE si les données sont récentes.
    // Des comptes vieux de 9 ans avec résultat positif ne disent rien de la santé actuelle.
    if (donneesRecentes3) {
      if (latest.resultat_net !== null && latest.resultat_net > 0) {
        verts.push("Résultat net positif au dernier exercice");
      }
      if (latest.autonomie_financiere !== null && latest.autonomie_financiere > 30) {
        verts.push(`Bonne autonomie financière (${latest.autonomie_financiere.toFixed(0)}%)`);
      }
    }
    // Si données périmées : on n'ajoute aucun critère vert sur la santé financière
    // (le warning périmé est déjà dans oranges ou rouges selon l'ancienneté)
  }

  if (config.insuranceChecks.primary === "assurance_decennale" && extracted.entreprise.assurance_decennale_mentionnee === true) {
    verts.push(`${config.insuranceLabels.primary} mentionnée sur le devis`);
  } else if (config.insuranceChecks.primary === "assurance_rc_pro" && extracted.entreprise.assurance_rc_pro_mentionnee === true) {
    verts.push(`${config.insuranceLabels.primary} mentionnée sur le devis`);
  }

  if (config.insuranceChecks.secondary?.includes("assurance_rc_pro") && extracted.entreprise.assurance_rc_pro_mentionnee === true) {
    verts.push(`${config.insuranceLabels.secondary || "RC Pro"} mentionnée sur le devis`);
  }

  // ── Suppression des critères verts si entreprise radiée ─────────────────────
  // Quand une entreprise est radiée, afficher des signaux verts crée une confusion
  // pour l'utilisateur (ex: "IBAN valide ✓" alors que l'entreprise n'existe plus).
  // On vide les verts et on signale explicitement que l'analyse est caduque.
  if (verified.entreprise_radiee === true) {
    verts.length = 0;
    informatifs.push("ℹ️ Analyse de devis caduque : l'entreprise est radiée des registres. Ne pas signer ce devis.");
  }

  // Calculate global score
  let score_global: ScoringColor;
  let explication: string;

  if (rouges.length > 0) {
    score_global = "ROUGE";
    explication = `${rouges.length} point(s) critique(s) détecté(s) nécessitant une attention particulière avant engagement.`;
  } else if (oranges.length > 0) {
    score_global = "ORANGE";
    explication = `${oranges.length} point(s) de vigilance à vérifier. L'ensemble des éléments analysés ne révèle pas de risque critique.`;
  } else {
    score_global = "VERT";
    explication = verts.length > 0
      ? `Aucun point de vigilance. Éléments positifs : ${verts.slice(0, 3).join(", ")}${verts.length > 3 ? "..." : ""}.`
      : "Aucun point critique ni de vigilance détecté sur ce devis.";
  }

  const scores_blocs = {
    entreprise: rouges.some(r => r.includes("Entreprise") || r.includes("Procédure") || r.includes("endettement") || r.includes("Pertes") || r.includes("Comptes non accessibles"))
      ? "ROUGE" as ScoringColor
      : oranges.some(o => o.includes("Entreprise") || o.includes("SIRET") || o.includes("récente") || o.includes("Note Google") || o.includes("avis Google") || o.includes("endettement") || o.includes("liquidité"))
        ? "ORANGE" as ScoringColor
        : "VERT" as ScoringColor,

    devis: oranges.some(o => o.includes("prix") || o.includes("travaux") || o.includes("manuscrit") || o.includes("TVA"))
      ? "ORANGE" as ScoringColor
      : "VERT" as ScoringColor,

    securite: rouges.some(r => r.includes("Acompte") || r.includes("espèces"))
      ? "ROUGE" as ScoringColor
      : oranges.some(o => o.includes("IBAN") || o.includes("Acompte") || o.includes("Assurance"))
        ? "ORANGE" as ScoringColor
        : "VERT" as ScoringColor,

    contexte: "INFORMATIF" as const,
  };

  console.log("PHASE 3 COMPLETE - Scoring:", {
    score_global,
    rouges,
    oranges,
    informatifs_count: informatifs.length,
    verts_count: verts.length,
  });

  console.log("Critères rouges:", rouges);
  console.log("Critères oranges:", oranges);

  return {
    score_global,
    criteres_rouges: rouges,
    criteres_oranges: oranges,
    criteres_verts: verts,
    criteres_informatifs: informatifs,
    explication,
    scores_blocs,
  };
}
