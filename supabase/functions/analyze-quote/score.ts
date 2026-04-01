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
    // Une société (SARL, SAS, EURL…) a l'obligation légale de déposer ses comptes
    // chaque année. Des données > 2 ans = non-conformité répétée OU situation
    // financière masquée. Des données > 4 ans = signal orange fort. > 6 ans = rouge.
    if (latest.date_cloture) {
      const anneeExercice = parseInt(latest.date_cloture.substring(0, 4), 10);
      const anneeActuelle = new Date().getFullYear();
      const retardAns = anneeActuelle - anneeExercice;

      if (retardAns >= 6) {
        rouges.push(
          `Comptes non déposés depuis ${retardAns} ans (dernier exercice : ${anneeExercice}) — ` +
          `obligation légale non respectée, situation financière réelle inconnue et potentiellement préoccupante`
        );
      } else if (retardAns >= 4) {
        oranges.push(
          `Données financières très anciennes (dernier exercice : ${anneeExercice}, il y a ${retardAns} ans) — ` +
          `impossible d'évaluer la solvabilité actuelle de l'entreprise`
        );
      } else if (retardAns >= 2) {
        oranges.push(
          `Données financières non récentes (dernier exercice : ${anneeExercice}) — ` +
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

  const acompteAvantTravaux = extracted.paiement.acompte_avant_travaux_pct ??
    (!extracted.paiement.echeancier_detecte ? extracted.paiement.acompte_pct : null);

  if (acompteAvantTravaux !== null && acompteAvantTravaux > 50) {
    rouges.push(`Acompte supérieur à 50% demandé avant travaux (${acompteAvantTravaux}%)`);
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

  if (verified.entreprise_immatriculee === true && verified.anciennete_annees !== null && verified.anciennete_annees < 2) {
    oranges.push(`Entreprise récente (${verified.anciennete_annees} an${verified.anciennete_annees > 1 ? "s" : ""}) - ancienneté à prendre en compte`);
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

  if (verified.google_trouve && verified.google_note !== null && verified.google_note >= 4.2) {
    verts.push(`Bonne réputation en ligne (${verified.google_note}/5 sur Google)`);
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
    entreprise: rouges.some(r => r.includes("Entreprise") || r.includes("Procédure") || r.includes("endettement") || r.includes("Pertes") || r.includes("Comptes non déposés"))
      ? "ROUGE" as ScoringColor
      : oranges.some(o => o.includes("Entreprise") || o.includes("SIRET") || o.includes("récente") || o.includes("Note Google") || o.includes("endettement") || o.includes("liquidité"))
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
