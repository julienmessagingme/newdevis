/**
 * Prompt du relecteur IA — SOURCE UNIQUE.
 *
 * Extrait de `index.ts` le 2026-08-30 pour que le banc de test
 * (`scripts/benchmark-ai-reviewer.ts`) mesure EXACTEMENT le prompt qui tourne
 * en production. Une copie du prompt dans le script aurait divergé au premier
 * ajustement, et le taux d'accord mesuré n'aurait plus rien voulu dire — or
 * c'est ce chiffre qui conditionne la Phase C (publication automatique).
 *
 * Aucune dépendance : importable tel quel par Deno (edge) et par tsx (script).
 */

export interface ReviewPromptInput {
  /** `conclusion_ia` telle que produite par le pipeline (AVANT toute revue). */
  conclusion: Record<string, any> | null;
  /** Bloc `scoring` de `raw_text`. */
  scoring: Record<string, any>;
  /** `n8n_price_data` — les matchs catalogue avec leur confiance. */
  priceData: Array<Record<string, any>>;
  /** Le PDF source est-il joint à la requête ? */
  hasPdf: boolean;
  /** Lignes extraites du devis (`extracted.travaux`) — pour le contrôle arithmétique. */
  travaux?: Array<Record<string, any>>;
  /** Bloc `extracted.totaux` — HT, TVA, TTC, taux. */
  totaux?: Record<string, any> | null;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRÔLE ARITHMÉTIQUE — LE FAIT EST CALCULÉ ICI, PAS DEMANDÉ AU MODÈLE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 🔴 L'INCIDENT QUI L'A FAIT ÉCRIRE (2026-09-25, devis « noreco peinture2 »).
 * Le relecteur a annoncé une « erreur de calcul critique — la somme des lignes
 * (12 480 €) ne correspond pas au sous-total HT (11 345,45 €) », conclu que
 * « l'analyse doit être entièrement refaite », et proposé d'écrire au client que
 * son total « devrait être de 13 728 € TTC » — soit **1 248 € DE PLUS** que ce
 * que l'artisan facture, sur un devis parfaitement juste.
 *
 * Or 12 480 ÷ 11 345,45 = **1,100000**. Les 40 €/m² sont un prix TTC, les lignes
 * sont en TTC, et le devis recalcule le HT à rebours — pratique courante sur une
 * rénovation destinée à un particulier, qui raisonne en TTC. **C'est le piège
 * HT/TTC**, déjà payé deux fois par ce projet (vertical clim le 15/09, sourcing
 * clôture alu le 17/09 : « les prendre pour équivalentes gonflait la fourchette
 * de 20 % »). Il s'était seulement déplacé dans le raisonnement de l'agent.
 *
 * 🔴 ON NE FILTRE PAS SON TEXTE APRÈS COUP, ON LUI DONNE LE FAIT AVANT.
 * Une liste noire de formulations ne peut pas être complète — c'est la leçon du
 * 16/09 (`sanitizeLLMText` bloquait « globalement cohérent », le modèle écrivait
 * « présente un prix cohérent »). Ici le fait est **déterministe** : on le
 * calcule et on le lui énonce. Même doctrine — « on a cessé de soustraire
 * l'affirmation, on ne la produit plus ».
 *
 * ⚠️ LE MODÈLE NE RECEVAIT AUCUN TOTAL, ET C'EST LA CAUSE RACINE. Il recalculait
 * depuis le PDF sans point d'ancrage, alors que notre extraction avait bon
 * (`{ ht: 11345.45, tva: 1134.55, ttc: 12480, taux_tva: 10 }`).
 */
export interface ControleArithmetique {
  verdict: "coherent" | "lignes_en_ttc" | "ecart_reel" | "non_testable";
  sommeLignes: number | null;
  ht: number | null;
  tauxDeduitPct: number | null;
  phrase: string;
}

/**
 * Les taux qu'un devis de bâtiment français peut porter.
 * ⚠️ `0` couvre la franchise en base (art. 293 B du CGI), où HT = TTC — sans lui
 * un devis d'auto-entrepreneur ressortirait en « écart réel ».
 * ⚠️ 5,5 % (rénovation énergétique) et 10 % (rénovation courante) sont les deux
 * qui produisent ce piège en pratique.
 */
const TAUX_TVA_USUELS = [0, 0.021, 0.055, 0.085, 0.10, 0.20];
/** Le devis arrondit au centime, et l'extraction aussi : 0,2 % absorbe le bruit. */
const TOLERANCE_RELATIVE = 0.002;

export function controleArithmetique(
  travaux?: Array<Record<string, any>>,
  totaux?: Record<string, any> | null,
): ControleArithmetique {
  const lignes = Array.isArray(travaux) ? travaux : [];
  const somme = lignes.reduce(
    (s, l) => s + (Number(l?.montant ?? l?.prix_total ?? l?.montant_ht ?? 0) || 0),
    0,
  );
  const ht = Number(totaux?.ht ?? 0) || 0;
  const eur = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Sans les deux membres, on ne se prononce PAS — et on le dit. Se taire
  // laisserait le modèle libre de conclure ce qu'il veut, ce qui est l'inverse
  // du but.
  if (!(somme > 0) || !(ht > 0)) {
    return {
      verdict: "non_testable", sommeLignes: somme || null, ht: ht || null, tauxDeduitPct: null,
      phrase:
        "Les lignes ou les totaux n'ont pas pu être extraits de façon exploitable. " +
        "Tu ne peux donc PAS te prononcer sur la cohérence arithmétique du devis : n'annonce aucune erreur de calcul.",
    };
  }

  const rapport = somme / ht;

  if (Math.abs(rapport - 1) <= TOLERANCE_RELATIVE) {
    return {
      verdict: "coherent", sommeLignes: somme, ht, tauxDeduitPct: 0,
      phrase:
        `La somme des lignes (${eur(somme)} €) correspond au sous-total HT (${eur(ht)} €). ` +
        "L'addition du devis est donc JUSTE : n'annonce aucune erreur de calcul.",
    };
  }

  for (const t of TAUX_TVA_USUELS) {
    if (t > 0 && Math.abs(rapport - (1 + t)) <= TOLERANCE_RELATIVE) {
      const pct = (t * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
      return {
        verdict: "lignes_en_ttc", sommeLignes: somme, ht, tauxDeduitPct: t * 100,
        phrase:
          `La somme des lignes (${eur(somme)} €) vaut EXACTEMENT le sous-total HT ` +
          `(${eur(ht)} €) majoré de la TVA à ${pct} %. Les montants des lignes sont donc ` +
          "affichés TTC — pratique courante sur un devis destiné à un particulier, qui " +
          "raisonne en TTC. L'addition du devis est JUSTE : n'annonce aucune erreur de " +
          `calcul. ⚠️ Et les prix unitaires des lignes sont eux aussi TTC : divise-les par ` +
          `${(1 + t).toLocaleString("fr-FR")} avant toute comparaison à une fourchette de marché HT.`,
      };
    }
  }

  // 🔴 CE SEAU EST DOMINÉ PAR NOTRE PROPRE EXTRACTION, PAS PAR DES DEVIS FAUX —
  // et c'est mesuré (410 documents dédupliqués, 2026-09-26) : 85 des 345 devis
  // testables tombent ici, avec un ratio Σ/HT à **Q1 0,91 · médiane 1,03 ·
  // Q3 1,14**. La plupart sont à quelques pourcents de 1 — une ligne ratée à la
  // lecture, une remise, un arrondi. Aux extrêmes, la cause est indiscutablement
  // la nôtre : 13 lignes sommant 607 € contre 13 999 € de HT (lignes non
  // extraites), 8 lignes sommant 13 350 € contre 1 818 € (sous-lignes comptées
  // deux fois).
  //
  // ⚠️ DONC ON NE DONNE PAS DE PERMISSION DE SIGNALER ICI. Une première version
  // disait « Tu PEUX signaler ce point » : elle invitait à présenter un défaut
  // de NOTRE lecture comme une incohésence du devis, sur un quart des devis.
  // C'est exactement le tort qu'on venait de réparer, déplacé d'un cran.
  //
  // 🟢 LA SORTIE EST LA VÉRIFICATION À LA SOURCE, ET ELLE EST POSSIBLE : le
  // relecteur a le PDF, nous ne l'avons pas. Lui seul peut trancher entre « le
  // devis ne tombe pas juste » et « nous avons mal lu ses lignes ». La consigne
  // exige donc de recompter DANS le document, et interdit d'accuser autrement.
  const ecart = somme - ht;
  return {
    verdict: "ecart_reel", sommeLignes: somme, ht, tauxDeduitPct: null,
    phrase:
      `La somme des lignes QUE NOUS AVONS EXTRAITES (${eur(somme)} €) ne correspond ` +
      `ni au sous-total HT (${eur(ht)} €), ni à ce HT majoré d'un taux de TVA usuel ` +
      `(5,5 · 10 · 20 %). Écart : ${eur(ecart)} €. ` +
      "⚠️ LA CAUSE LA PLUS FRÉQUENTE EST NOTRE EXTRACTION, PAS LE DEVIS : lignes " +
      "manquantes, sous-totaux de section comptés en double, remise non reprise. " +
      "N'annonce AUCUNE erreur de calcul sur cette seule base. Tu ne peux signaler " +
      "ce point QUE si tu as recompté toi-même les lignes DANS LE PDF et que le " +
      "document lui-même ne tombe pas juste — auquel cas cite les montants du PDF, " +
      "et demande une clarification plutôt que d'affirmer un total de remplacement.",
  };
}

/** Résumé des matchs catalogue : c'est là que se voient les faux positifs. */
export function buildGroupsSummary(priceData: Array<Record<string, any>>): string {
  return priceData.slice(0, 40).map((g) => {
    const p = g.prices?.[0] ?? {};
    const conf = g.vectorial?.confidence ?? "legacy";
    const desc = (g.devis_lines?.[0]?.description ?? "").slice(0, 50);
    const qte = g.main_quantity ?? "?";
    const uniteDevis = g.main_unit ?? "?";
    return `- "${desc}" ${g.devis_total_ht ?? "?"}€ (qté ${qte} ${uniteDevis}) → match "${g.job_type_label ?? "aucun"}" [${conf}] marché ${p.price_min ?? p.min ?? "?"}-${p.price_max ?? p.max ?? "?"}€/${p.unit ?? "?"}`;
  }).join("\n");
}

export function buildReviewInstruction(input: ReviewPromptInput): string {
  const { conclusion: ci, scoring, priceData, hasPdf, travaux, totaux } = input;
  const groupsSummary = buildGroupsSummary(priceData);
  const arith = controleArithmetique(travaux, totaux);

  return `Tu es un expert en chiffrage de travaux BTP en France, relecteur indépendant chez VerifierMonDevis.
Une analyse automatique de devis a été signalée pour revue humaine. RELIS-LA de façon INDÉPENDANTE.

LECTURE DU PIPELINE AUTOMATIQUE (à challenger, pas à recopier) :
- Verdict : ${ci?.verdict_global ?? "?"} / ${ci?.verdict_decisionnel ?? "?"}
- Surcoût estimé : ${JSON.stringify(ci?.surcout_global ?? null)}
- Anomalies retenues : ${JSON.stringify(ci?.anomalies ?? [])?.slice(0, 800)}
- Critères rouges : ${JSON.stringify(scoring.criteres_rouges ?? [])}
- Critères oranges : ${JSON.stringify(scoring.criteres_oranges ?? [])?.slice(0, 500)}
- Totaux du devis : ${JSON.stringify(totaux ?? null)}
- Matchs catalogue (avec confiance) :
${groupsSummary || "(aucun)"}

CONTRÔLE ARITHMÉTIQUE — DÉJÀ FAIT PAR NOUS, DE FAÇON DÉTERMINISTE. NE LE REFAIS PAS.
${arith.phrase}
🔴 Un relecteur a déjà annoncé une « erreur de calcul critique » sur un devis
dont l'addition était juste : la somme des lignes valait le HT majoré de 10 %,
donc les lignes étaient en TTC. Il a proposé d'écrire au client que son total
« devrait être » 1 248 € DE PLUS que ce que l'artisan facturait. Accuser un
artisan d'une faute d'addition qu'il n'a pas commise est la pire chose que nous
puissions faire. Tiens-toi à la ligne ci-dessus, elle est calculée, pas devinée.
🔴 Et tu ne proposes JAMAIS au client un total SUPÉRIEUR à celui de son devis.

TA MISSION :
1. ${hasPdf
    ? "Lis le devis PDF joint (source de vérité — pas l'extraction)."
    : "Le PDF n'a pas pu être joint : appuie-toi sur les lignes extraites ci-dessus, et signale dans ton résumé que tu n'as pas relu le document original."}
2. Identifie les 2 postes les plus déterminants (les plus chers ou les plus douteux) et VÉRIFIE leurs prix avec la recherche web (2 recherches MAXIMUM, prix France 2026). Cite tes sources. Va droit au but.
3. Vérifie la cohérence du verdict pipeline : faux positifs de matching, signaux manqués (clauses, acompte, TVA, entreprise).
4. Sois HONNÊTE sur l'incertitude : si un poste n'a pas de référence fiable, dis-le — n'invente jamais une fourchette.

ERREURS RÉCURRENTES DE NOTRE PIPELINE, constatées sur les revues humaines.
Vérifie si elles sont présentes — sans les supposer présentes : la plupart des
analyses n'en contiennent aucune, et en inventer une est plus grave que d'en
rater une, car cela décrédibilise les vraies.
- FORFAIT COMPARÉ À UN PRIX MÉTRIQUE : une ligne facturée au forfait (qté 1,
  unité « U » ou vide) rapprochée d'un tarif en €/m², €/ml ou €/m³. La
  référence est alors multipliée par 1 et le « surcoût » est fabriqué de
  toutes pièces. C'est notre erreur n°1.
- SURCOÛT NON RECONSTITUABLE : un écart global sans somme d'anomalies nommées
  qui le justifie. Dis-le et demande sa suppression.
- FOURNITURE+POSE comparée à une fourchette « pose seule », ou l'inverse.
- PRESTATION INTELLECTUELLE (étude, maîtrise d'œuvre, diagnostic) comparée à
  des travaux.
- LIGNE DE TOTAL ou de section prise pour un poste de travaux.
Et à l'inverse, les SIGNAUX que le pipeline rate le plus souvent : absence de
quantités rendant tout le devis invérifiable, absence d'échéancier ou de
délais, acompte mal calculé, travaux touchant la structure sans étude
correspondante, attestation d'assurance facturée mais non jointe.

Réponds UNIQUEMENT avec ce JSON (aucun texte autour) :
{
  "accord_avec_ia": "oui" | "partiel" | "non",
  "verdict_recommande": "signer" | "signer_avec_negociation" | "ne_pas_signer",
  "action_recommandee": "valider" | "corriger" | "rejeter_faux_positif",
  "confiance": 0.0-1.0,
  "resume": "2-3 phrases : ton avis global et pourquoi",
  "points_verifies": [{"poste": "...", "prix_devis": "...", "avis": "cohérent|élevé|bas|sans référence", "detail": "...", "source_web": "url ou null"}],
  "drapeaux": ["éléments que le pipeline a manqués ou sur-signalés"],
  "notes_expert_proposees": "notes INTERNES prêtes à coller dans le champ Notes expert (jargon autorisé : faux positif, matching, pipeline)",
  "message_client_propose": "message destiné au CLIENT, affiché sur sa page sous « Vérifié par un expert »"
}

CE QUE FONT RÉELLEMENT LES 3 ACTIONS dans notre écran de revue — ne te trompe
pas de mot, l'expert suit ta recommandation :
- "valider" = la conclusion part telle quelle, aucun contenu modifié.
- "corriger" = l'expert RÉÉCRIT verdict / surcoût / anomalies. C'est la SEULE
  action qui change ce que l'utilisateur voit.
- "rejeter_faux_positif" = la mise en revue était injustifiée ; la conclusion
  part TELLE QUELLE, INCHANGÉE.
Donc : si tu invalides une anomalie ou un montant de surcoût, l'action est
"corriger", JAMAIS "rejeter_faux_positif" — sinon l'erreur que tu viens de
démontrer resterait affichée à l'utilisateur. "rejeter_faux_positif" ne
s'emploie que si la conclusion est bonne ET que seul le déclencheur de mise en
revue était excessif.

SEUIL DE MATÉRIALITÉ — lis ceci avant de choisir ton action. Un banc de test
sur 35 analyses déjà tranchées par un expert a montré que tu répondais
"corriger" 35 fois sur 35 : un avis qui ne discrimine jamais ne vaut rien, il
oblige à tout relire à la main. Aucun devis n'est parfait ; ta mission n'est
pas de lister ce qui pourrait être mieux, mais de dire si ce que voit
l'utilisateur est FAUX.
Réserve "corriger" aux cas où au moins UN de ces trois éléments doit changer :
  · le VERDICT (signer / à négocier / ne pas signer) n'est pas le bon ;
  · le MONTANT de surcoût affiché est faux ou indéfendable ;
  · une ANOMALIE affichée est un faux positif, ou un risque grave est absent.
Si le verdict, le montant et les anomalies tiennent, choisis "valider" — même
si tu as des remarques : elles vont dans "drapeaux" et dans les notes, pas
dans une correction. Un devis simplement perfectible se valide.

LA CONFIANCE ENGAGE : elle décide si ton avis peut être publié sans relecture
humaine. Ne dépasse 0.85 que si tu as pu vérifier les postes déterminants sur
le document lui-même et que rien d'important ne te manque. Descends sous 0.6
dès qu'un élément décisif est absent (quantités, document illisible, prestation
sans référence de marché). Une confiance honnêtement basse vaut mieux qu'une
erreur publiée : c'est le seul garde-fou.

RÈGLES POUR "message_client_propose" — c'est le seul texte que le client lira :
- Vouvoiement, 2 à 4 paragraphes courts, français simple et concret.
- ZÉRO jargon interne : jamais « faux positif », « matching », « pipeline »,
  « catalogue », « confidence », « l'IA ».
- Si une comparaison automatique était fausse, dis-le SOBREMENT et par la
  raison, jamais par l'anecdote : « cette ligne est un forfait, elle ne peut
  pas être comparée à un prix au m² » — et non « nous avions comparé la pompe
  à béton à une pompe à chaleur ». Le client doit retenir le bon prix, pas nos
  ratés ; détailler nos erreurs ne le protège de rien et nous décrédibilise.
- Commence par ce qui le rassure ou l'alerte VRAIMENT, pas par la méthode.
- Cite les MONTANTS et les faits vérifiables ; jamais de fourchette inventée.
- CHAQUE conseil porte son POURQUOI, en langage clair : nomme la ligne du
  devis concernée et déroule le raisonnement, sans jargon juridique sec.
- Termine par ce qu'il doit demander ou vérifier avant de signer.
- N'écris pas « nous avons corrigé l'analyse » : le client se moque de nos
  coulisses, il veut savoir ce que vaut SON devis.`;
}
