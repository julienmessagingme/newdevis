import type { ExtractedData, VerificationResult, ScoringResult } from "./types.ts";
import type { DomainConfig } from "./domain-config.ts";
import { getCountryName } from "./utils.ts";

// ============================================================
// PHASE 4: RENDER OUTPUT
// ============================================================

export function renderOutput(
  extracted: ExtractedData,
  verified: VerificationResult,
  scoring: ScoringResult,
  config: DomainConfig
): { points_ok: string[]; alertes: string[]; recommandations: string[]; types_travaux: any[] } {

  const points_ok: string[] = [];
  const alertes: string[] = [];
  const recommandations: string[] = [];

  // BLOC 1: ENTREPRISE
  if (verified.entreprise_immatriculee === true) {
    points_ok.push(`✓ Entreprise identifiée : ${verified.nom_officiel || extracted.entreprise.nom}`);

    if (verified.anciennete_annees !== null) {
      if (verified.anciennete_annees >= 5) {
        points_ok.push(`🟢 Entreprise établie : ${verified.anciennete_annees} ans d'existence`);
      } else if (verified.anciennete_annees >= 2) {
        points_ok.push(`🟠 Entreprise établie depuis ${verified.anciennete_annees} ans`);
      } else {
        alertes.push(`🟠 Entreprise récente (${verified.anciennete_annees} an(s)). L'ancienneté est un indicateur parmi d'autres, elle ne préjuge pas de la qualité du travail.`);
      }
    }

    // Financial ratios from data.economie.gouv.fr
    if (verified.finances.length > 0) {
      const latest = verified.finances[0];
      const year = latest.date_cloture ? latest.date_cloture.substring(0, 4) : "?";
      points_ok.push(`✓ Données financières disponibles (${verified.finances.length} exercice(s), dernier : ${year})`);

      if (latest.chiffre_affaires !== null && latest.chiffre_affaires > 0) {
        const caFormatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(latest.chiffre_affaires);
        points_ok.push(`✓ Chiffre d'affaires : ${caFormatted}`);
      }

      if (latest.resultat_net !== null && latest.resultat_net > 0) {
        points_ok.push("🟢 Résultat net positif au dernier exercice");
      } else if (latest.resultat_net !== null && latest.resultat_net < 0) {
        const perteFormatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(latest.resultat_net);
        alertes.push(`🔴 Résultat net négatif au dernier exercice (${perteFormatted}). Cela peut indiquer une situation financière tendue.`);
      }

      if (latest.autonomie_financiere !== null && latest.autonomie_financiere > 30) {
        points_ok.push(`🟢 Bonne autonomie financière (${latest.autonomie_financiere.toFixed(0)}%)`);
      }

      if (latest.taux_endettement !== null && latest.taux_endettement > 200) {
        alertes.push(`🔴 Taux d'endettement très élevé (${latest.taux_endettement.toFixed(0)}%). Cet indicateur peut signaler une fragilité financière.`);
      } else if (latest.taux_endettement !== null && latest.taux_endettement > 100) {
        alertes.push(`🟠 Taux d'endettement élevé (${latest.taux_endettement.toFixed(0)}%).`);
      }

      if (latest.ratio_liquidite !== null && latest.ratio_liquidite < 80) {
        alertes.push(`🟠 Ratio de liquidité faible (${latest.ratio_liquidite.toFixed(0)}%).`);
      }
    } else if (verified.finances_status === "not_found") {
      points_ok.push("ℹ️ Aucune donnée financière publiée - la vérification financière n'a pas pu être effectuée");
    } else if (verified.finances_status === "error") {
      points_ok.push("ℹ️ Vérification financière temporairement indisponible");
    }

    if (verified.procedure_collective === true) {
      alertes.push("🔴 Procédure collective en cours (confirmée via BODACC). Cela indique une situation de redressement ou liquidation judiciaire.");
    } else if (verified.procedure_collective === false) {
      points_ok.push("✓ Aucune procédure collective en cours");
    }

  } else if (verified.lookup_status === "not_found") {
    if (extracted.entreprise.nom) {
      points_ok.push(`ℹ️ Entreprise : ${extracted.entreprise.nom}`);
    }
    points_ok.push(`ℹ️ SIRET présent : ${extracted.entreprise.siret}`);
    points_ok.push("ℹ️ Vérification registre non concluante. Cela n'indique pas un problème en soi — vous pouvez vérifier sur societe.com ou infogreffe.fr.");

  } else if (verified.lookup_status === "no_siret") {
    if (extracted.entreprise.nom) {
      points_ok.push(`ℹ️ Entreprise : ${extracted.entreprise.nom}`);
    }
    points_ok.push("ℹ️ SIRET non détecté sur le devis, vérification registre non réalisée. Vous pouvez le demander à l'artisan.");

  } else if (verified.lookup_status === "error") {
    points_ok.push(`ℹ️ SIRET présent : ${extracted.entreprise.siret}`);
    points_ok.push("ℹ️ Vérification registre indisponible temporairement. Cela n'indique pas un risque en soi.");

  } else if (extracted.entreprise.siret) {
    points_ok.push(`ℹ️ SIRET présent : ${extracted.entreprise.siret}`);
    points_ok.push("ℹ️ Vous pouvez vérifier les informations sur societe.com ou infogreffe.fr");

  } else {
    if (extracted.entreprise.nom) {
      points_ok.push(`ℹ️ Entreprise : ${extracted.entreprise.nom}`);
    }
    points_ok.push("ℹ️ Informations entreprise partielles. Demandez le SIRET à l'artisan pour une vérification complète.");
  }

  // Google reputation
  if (verified.google_trouve && verified.google_note !== null) {
    if (verified.google_note >= 4.2) {
      points_ok.push(`🟢 Bonne réputation en ligne : ${verified.google_note}/5 (${verified.google_nb_avis} avis Google)`);
    } else if (verified.google_note >= 4.0) {
      points_ok.push(`✓ Réputation en ligne correcte : ${verified.google_note}/5 (${verified.google_nb_avis} avis Google)`);
    } else {
      points_ok.push(`ℹ️ Note Google : ${verified.google_note}/5 (${verified.google_nb_avis} avis)`);
    }
  } else if (!verified.google_trouve && extracted.entreprise.nom) {
    points_ok.push("ℹ️ Aucun avis Google trouvé - cela ne préjuge pas de la qualité de l'entreprise");
  }

  // RGE (only for domains that track it)
  if (config.certifications.includes("RGE")) {
    if (verified.rge_trouve) {
      const noms = verified.rge_qualifications.slice(0, 3).map(q => q.nom).join(", ");
      points_ok.push(`🟢 Qualification RGE vérifiée : ${noms}`);
    } else if (verified.rge_pertinent) {
      points_ok.push("ℹ️ Qualification RGE non trouvée. Si vous visez des aides (MaPrimeRénov', CEE...), demandez le certificat RGE à l'artisan.");
    }
  }

  // Certifications (domain-specific)
  for (const cert of config.certifications) {
    if (cert === "RGE") continue; // already handled above
    if (extracted.entreprise.certifications_mentionnees.some(c => c.toUpperCase().includes(cert.toUpperCase()))) {
      points_ok.push(`🟢 Qualification ${cert} mentionnée sur le devis`);
    }
  }

  // BLOC 2: DEVIS
  if (verified.comparaisons_prix.length > 0) {
    const identifiedTypes = verified.comparaisons_prix.map(c => c.libelle).slice(0, 3);
    points_ok.push(`✓ Types de travaux identifiés : ${identifiedTypes.join(", ")}`);

    for (const comparison of verified.comparaisons_prix) {
      if (comparison.fourchette_min > 0 && comparison.fourchette_max > 0) {
        points_ok.push(`📊 ${comparison.libelle} : ${comparison.explication}`);
      } else {
        points_ok.push(`ℹ️ ${comparison.libelle} : prestation spécifique sans référence standardisée - comparaison non applicable`);
      }
    }
  }

  if (extracted.travaux.length > 0 && verified.comparaisons_prix.length === 0) {
    const travauxLabels = extracted.travaux.slice(0, 3).map(t => t.libelle || t.categorie).join(", ");
    points_ok.push(`ℹ️ Travaux identifiés (${travauxLabels}) - prestations spécifiques sans référence marché standardisée`);
    points_ok.push("ℹ️ L'absence de comparaison chiffrée n'indique pas un problème - elle reflète la nature sur mesure des prestations");
  }

  if (extracted.travaux.length === 0) {
    points_ok.push("ℹ️ Aucun poste de travaux détaillé détecté - vous pouvez demander un devis plus détaillé à l'artisan");
  }

  // BLOC 3: SÉCURITÉ
  const hasTraceable = extracted.paiement.modes.some(m => ["virement", "cheque", "carte_bancaire"].includes(m.toLowerCase()));
  const hasCash = extracted.paiement.modes.some(m => m.toLowerCase() === "especes");

  if (hasCash) {
    alertes.push("🔴 Paiement en espèces explicitement mentionné. Privilégiez un mode de paiement traçable (virement, chèque).");
  } else if (hasTraceable) {
    points_ok.push("✓ Mode de paiement traçable accepté");
  }

  if (verified.iban_verifie) {
    if (verified.iban_valide === true) {
      if (verified.iban_code_pays === "FR") {
        points_ok.push(`✓ IBAN valide et domicilié en France${verified.iban_banque ? ` (${verified.iban_banque})` : ""}`);
      } else {
        alertes.push(`ℹ️ IBAN étranger (${getCountryName(verified.iban_code_pays || "")}) détecté. Cela peut être normal selon le contexte. À vérifier.`);
      }
    } else if (verified.iban_valide === false) {
      alertes.push("ℹ️ Format IBAN à vérifier (possible erreur de saisie sur le devis).");
    }
  } else if (!extracted.entreprise.iban) {
    points_ok.push("ℹ️ Coordonnées bancaires non détectées sur le devis. À demander si paiement par virement.");
  }

  const acompte = extracted.paiement.acompte_avant_travaux_pct ?? extracted.paiement.acompte_pct;
  if (acompte !== null) {
    if (acompte <= 30) {
      points_ok.push(`✓ Acompte raisonnable (${acompte}%)`);
    } else if (acompte <= 50) {
      alertes.push(`ℹ️ Acompte modéré (${acompte}%). Un acompte ≤ 30% est généralement recommandé. Cela reste une pratique courante.`);
    } else {
      alertes.push(`🔴 Acompte élevé (${acompte}%). Un acompte supérieur à 50% avant travaux représente un risque en cas de problème.`);
    }
  }

  if (extracted.paiement.echeancier_detecte) {
    points_ok.push("✓ Échéancier de paiement prévu");
  }

  if (config.insuranceChecks.primary === "assurance_decennale") {
    if (extracted.entreprise.assurance_decennale_mentionnee === true) {
      points_ok.push(`✓ ${config.insuranceLabels.primary} mentionnée sur le devis`);
    } else if (extracted.entreprise.assurance_decennale_mentionnee === false) {
      points_ok.push(`ℹ️ ${config.insuranceLabels.primary} non détectée. Demandez l'attestation d'assurance pour confirmer la couverture.`);
    } else {
      points_ok.push(`ℹ️ Mention de ${config.insuranceLabels.primary.toLowerCase()} partielle ou incertaine. Demandez l'attestation pour confirmation.`);
    }
  } else if (config.insuranceChecks.primary === "assurance_rc_pro") {
    if (extracted.entreprise.assurance_rc_pro_mentionnee === true) {
      points_ok.push(`✓ ${config.insuranceLabels.primary} mentionnée sur le devis`);
    } else if (extracted.entreprise.assurance_rc_pro_mentionnee === false) {
      points_ok.push(`ℹ️ ${config.insuranceLabels.primary} non détectée. Demandez l'attestation au professionnel.`);
    } else {
      points_ok.push(`ℹ️ Mention de ${config.insuranceLabels.primary.toLowerCase()} partielle ou incertaine. Demandez l'attestation pour confirmation.`);
    }
  }

  if (config.insuranceChecks.secondary?.includes("assurance_rc_pro") && extracted.entreprise.assurance_rc_pro_mentionnee === true) {
    points_ok.push(`✓ ${config.insuranceLabels.secondary || "RC Pro"} mentionnée sur le devis`);
  }

  // BLOC 4: CONTEXTE
  if (verified.georisques_consulte) {
    if (verified.georisques_risques.length > 0) {
      points_ok.push(`📍 Contexte chantier (${verified.georisques_commune}) : ${verified.georisques_risques.length} risque(s) naturel(s) - ${verified.georisques_risques.slice(0, 3).join(", ")}`);
    } else {
      points_ok.push(`📍 Contexte chantier (${verified.georisques_commune}) : Aucune contrainte particulière identifiée`);
    }
    if (verified.georisques_zone_sismique) {
      points_ok.push(`📍 Zone sismique : ${verified.georisques_zone_sismique}`);
    }
  } else if (extracted.client.adresse_chantier || extracted.client.code_postal) {
    points_ok.push("📍 Contexte chantier : Adresse détectée mais consultation Géorisques non effectuée");
  } else {
    points_ok.push("📍 Contexte chantier : Adresse non détectée sur le devis");
  }

  if (verified.patrimoine_consulte) {
    if (verified.patrimoine_status === "possible") {
      const typesStr = verified.patrimoine_types.length > 0
        ? ` (${verified.patrimoine_types.join(", ")})`
        : "";
      points_ok.push(`📍 Patrimoine / ABF : POSSIBLE — le chantier semble situé dans une zone de protection patrimoniale${typesStr}`);
    } else if (verified.patrimoine_status === "non_detecte") {
      points_ok.push("📍 Patrimoine / ABF : NON DÉTECTÉ — aucune zone patrimoniale n'a été détectée autour de l'adresse du chantier à partir des données publiques disponibles");
    }
  } else if (extracted.client.adresse_chantier || extracted.client.code_postal) {
    points_ok.push("📍 Patrimoine / ABF : INCONNU — l'adresse du chantier n'a pas pu être géolocalisée, la vérification n'a pas pu être réalisée");
  }

  // RECOMMANDATIONS
  recommandations.push(`📊 ${scoring.explication}`);
  recommandations.push("📋 Pour confirmer les assurances, demandez les attestations d'assurance (PDF) à jour.");

  if (scoring.score_global === "ORANGE" && scoring.criteres_rouges.length === 0) {
    recommandations.push("✅ Les points de vigilance listés sont des vérifications de confort recommandées, pas des signaux d'alerte critiques.");
  }

  if (acompte !== null && acompte > 30) {
    recommandations.push("💡 Il est recommandé de limiter l'acompte à 30% maximum du montant total.");
  }

  // TYPES TRAVAUX
  const types_travaux = extracted.travaux.map(t => {
    const priceComparison = verified.comparaisons_prix.find(
      p => p.categorie.toLowerCase() === t.categorie.toLowerCase()
    );

    return {
      categorie: t.categorie,
      libelle: t.libelle || t.categorie,
      quantite: t.quantite,
      unite: t.unite || "forfait",
      montant_ht: t.montant,
      score_prix: priceComparison?.score || null,
      fourchette_min: priceComparison?.fourchette_min || null,
      fourchette_max: priceComparison?.fourchette_max || null,
      zone_type: priceComparison?.zone || null,
      explication: priceComparison?.explication || null,
    };
  });

  return { points_ok, alertes, recommandations, types_travaux };
}
