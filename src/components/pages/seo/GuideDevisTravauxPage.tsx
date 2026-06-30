/**
 * src/components/pages/seo/GuideDevisTravauxPage.tsx
 *
 * Page pilier "Le guide complet du devis travaux".
 * Route : /guides/devis-travaux/
 *
 * C'est la page d'autorité maximale du cocon "devis". Tous les guides
 * satellites (comprendre, comparer, signer, négocier, refuser) pointent
 * ici, et celle-ci pointe vers eux.
 *
 * Wording : pédagogique, factuel, basé sur l'expertise VMD (891 prix marché,
 * 348 devis analysés). Pas de bullshit, pas d'IA générée — du contenu écrit
 * par/avec l'équipe.
 */

import PillarPage from "@/components/pillar/PillarPage";
import { getRelatedLinks } from "@/lib/seo/internalLinking";

export default function GuideDevisTravauxPage() {
  const related = getRelatedLinks(
    ["devis", "verifier", "comparateur", "negociation"],
    "/guides/devis-travaux",
    { count: 6 },
  );

  return (
    <PillarPage
      breadcrumb={[
        { name: "Guides", href: "/guides" },
        { name: "Guide complet du devis travaux", href: "/guides/devis-travaux" },
      ]}
      title="Le guide complet du devis travaux"
      intro="Comprendre un devis ligne à ligne, comparer plusieurs propositions, négocier, signer en sécurité, refuser un mauvais devis. Tout ce qu'un particulier doit savoir avant de s'engager — basé sur l'analyse de centaines de devis réels."
      toc={[
        { id: "definition", label: "Qu'est-ce qu'un devis travaux ?" },
        { id: "mentions-obligatoires", label: "Les mentions légales obligatoires" },
        { id: "structure", label: "La structure d'un bon devis" },
        { id: "pieges", label: "Les 7 pièges classiques à repérer" },
        { id: "comparer", label: "Comment comparer plusieurs devis" },
        { id: "negocier", label: "Négocier sans froisser l'artisan" },
        { id: "signer", label: "Avant de signer : checklist en 7 points" },
        { id: "refuser", label: "Refuser un devis (sans frais)" },
        { id: "outils-vmd", label: "Comment VMD vous aide" },
      ]}
      sections={[
        {
          id: "definition",
          title: "Qu'est-ce qu'un devis travaux ?",
          body: (
            <>
              <p>
                Un devis travaux est un <strong>document contractuel</strong> qui détaille les
                travaux à réaliser, leur prix unitaire, leur quantité, et le montant total.
                Une fois signé par les deux parties, il devient un <em>contrat de prestation</em>
                {" "}qui engage l'artisan sur le périmètre, le prix et les délais.
              </p>
              <p>
                C'est <strong>la pièce contractuelle la plus importante</strong> d'un chantier.
                Un devis mal lu ou mal négocié, c'est plusieurs milliers d'euros qui peuvent
                vous échapper — sur des forfaits gonflés, des postes oubliés ajoutés en cours
                de chantier, ou des clauses abusives.
              </p>
              <p>
                <strong>Pour les travaux BTP, le devis est obligatoire</strong> dès que le
                montant dépasse 1 500 € TTC (arrêté du 2 mars 1990). En-dessous, il reste
                vivement recommandé — pour la traçabilité et en cas de litige.
              </p>
            </>
          ),
        },
        {
          id: "mentions-obligatoires",
          title: "Les mentions légales obligatoires sur un devis",
          body: (
            <>
              <p>
                Un devis sans certaines mentions n'engage légalement personne. Voici la
                checklist minimale (code de la consommation, art. L111-1) :
              </p>
              <ul>
                <li><strong>Identité de l'entreprise</strong> : nom, forme juridique, SIRET, adresse, téléphone, email, numéro de TVA intracom.</li>
                <li><strong>Identité du client</strong> : nom et adresse du destinataire des travaux.</li>
                <li><strong>Date d'établissement et durée de validité</strong> du devis (en général 3 mois).</li>
                <li><strong>Description précise des travaux</strong> : libellé, quantité, unité, prix unitaire HT, total HT, TVA, total TTC.</li>
                <li><strong>Délai estimé d'exécution</strong> ou date de démarrage.</li>
                <li><strong>Modalités de paiement</strong> : acompte, échéancier, mode de règlement, pénalités de retard éventuelles.</li>
                <li><strong>Mention "devis gratuit"</strong> si c'est le cas (sinon les frais doivent être annoncés).</li>
                <li><strong>Assurance décennale et RC Pro</strong> (références et coordonnées de l'assureur).</li>
              </ul>
              <p>
                <strong>Si une de ces mentions manque, demandez explicitement leur ajout
                avant signature.</strong> Un devis sans SIRET ou sans assurance décennale =
                refus immédiat.
              </p>
            </>
          ),
        },
        {
          id: "structure",
          title: "La structure d'un bon devis travaux",
          body: (
            <>
              <p>
                Un bon devis n'est pas juste "un total HT à 12 450 €". Il est <strong>structuré
                en postes</strong> avec quantités précises et prix unitaires. C'est ce qui
                permet de comparer plusieurs devis poste à poste, et d'identifier les surcharges.
              </p>
              <p>Voici les blocs qu'un devis sérieux doit contenir :</p>
              <ol>
                <li><strong>Préparation et logistique</strong> : protection des sols, accès chantier, livraisons.</li>
                <li><strong>Dépose / démolition</strong> : retrait de l'existant, évacuation des gravats.</li>
                <li><strong>Travaux par corps de métier</strong> : plomberie, électricité, peinture, carrelage, etc. — chaque corps en bloc distinct.</li>
                <li><strong>Fournitures vs main d'œuvre</strong> : précisez ce qui est inclus.</li>
                <li><strong>Finitions et nettoyage</strong> : nettoyage fin de chantier, recettes.</li>
                <li><strong>Garanties et assurances</strong> : décennale, biennale, parfait achèvement.</li>
              </ol>
              <p>
                Sur le pavé "total" en bas, vous devez voir : <strong>total HT, taux TVA appliqué,
                montant TVA, total TTC, échéancier de paiement détaillé</strong>.
              </p>
            </>
          ),
          insertGmcAfter: true,
        },
        {
          id: "pieges",
          title: "Les 7 pièges classiques à repérer",
          body: (
            <>
              <p>
                Sur les centaines de devis que nous avons analysés, voici les <strong>7 pièges
                les plus fréquents</strong> — ceux qui coûtent le plus aux particuliers :
              </p>
              <ol>
                <li>
                  <strong>Postes "oubliés"</strong> : la dépose de l'existant, l'évacuation des
                  gravats, le nettoyage fin de chantier. Souvent absents pour faire baisser le total HT
                  affiché. Vous les retrouverez sur la facture en "supplément".
                </li>
                <li>
                  <strong>Forfaits opaques</strong> : "Salle de bain complète : 8 500 € forfait". Sans
                  détail des fournitures et de la main d'œuvre, impossible de comparer ni de négocier.
                </li>
                <li>
                  <strong>Quantités sous-estimées</strong> : 28 m² de carrelage alors que la pièce
                  fait 35 m². Le surplus sera facturé en avenant à un tarif plus élevé.
                </li>
                <li>
                  <strong>Acompte excessif</strong> : 40, 50, 60% à la signature. La norme du métier
                  est 30%. Au-delà, vous prenez un risque financier majeur.
                </li>
                <li>
                  <strong>Clauses abusives</strong> : "pas de droit de rétractation" (illégal,
                  loi Hamon), "le prix peut être modifié unilatéralement" (illégal, L113-3), "le
                  client paie en cas d'annulation" (à plafonner).
                </li>
                <li>
                  <strong>Marques de matériel non précisées</strong> : "WC suspendu" vs "WC suspendu
                  Geberit Sigma 70". Sans la marque, le bas de gamme est probable.
                </li>
                <li>
                  <strong>Mauvais taux de TVA</strong> : 20% appliqué sur un logement de plus de 2 ans
                  alors que le 10% (voire 5,5% en rénovation énergétique) est applicable.
                </li>
              </ol>
              <p>
                Vous pouvez <a href="/nouvelle-analyse">lancer notre analyse IA gratuite</a> pour
                vérifier votre devis sur ces 7 points + une trentaine d'autres en 30 secondes.
              </p>
            </>
          ),
        },
        {
          id: "comparer",
          title: "Comment comparer plusieurs devis",
          body: (
            <>
              <p>
                Le réflexe de comparer 3 devis est sain. Mais comparer <strong>le total HT</strong>
                {" "}est trompeur : un devis "moins cher" peut être plus cher en réalité s'il oublie des
                postes essentiels.
              </p>
              <p>La méthode experte en 4 étapes :</p>
              <ol>
                <li>
                  <strong>Alignez les périmètres</strong> : listez tous les postes uniques mentionnés
                  par chacun. Repérez ceux qui manquent chez un mais sont chez les autres.
                </li>
                <li>
                  <strong>Vérifiez les quantités déclarées</strong> : un écart de 15%+ sur un même poste
                  entre deux devis = anomalie. Mètre laser en main, vous trancherez.
                </li>
                <li>
                  <strong>Lisez les marques de matériel</strong> : un devis qui précise (Geberit, Grohe,
                  Tollens, Velux) est plus fiable qu'un devis vague.
                </li>
                <li>
                  <strong>Comparez les clauses contractuelles</strong> : acompte, échéancier, garanties,
                  pénalités. Pas seulement les prix.
                </li>
              </ol>
              <p>
                Notre <a href="/comparateur">comparateur de devis</a> fait ces 4 étapes automatiquement
                sur 2 à 4 devis.
              </p>
            </>
          ),
        },
        {
          id: "negocier",
          title: "Négocier sans froisser l'artisan",
          body: (
            <>
              <p>
                Négocier un devis n'est pas vexer un artisan. C'est <strong>respecter votre budget</strong>
                {" "}et engager une discussion transparente. Voici les 5 leviers qui fonctionnent :
              </p>
              <ol>
                <li>
                  <strong>Présenter un devis concurrent</strong> chiffré : "j'ai un autre devis à 11 800 €,
                  votre prix est à 12 450 €, est-ce que vous pouvez vous aligner ?". Marge typique : 3 à 7%.
                </li>
                <li>
                  <strong>Demander un découpage</strong> des forfaits opaques. Un forfait qui se découpe
                  en main d'œuvre + matériaux + frais est plus négociable qu'un bloc à 8 500 €.
                </li>
                <li>
                  <strong>Proposer du paiement comptant</strong> sans escompte officielle (3-5% souvent
                  accepté pour économiser les frais bancaires).
                </li>
                <li>
                  <strong>Élargir la période</strong> : "si je signe en janvier (creux), pouvez-vous
                  faire un geste ?". Beaucoup d'artisans préfèrent un chantier garanti à un planning vide.
                </li>
                <li>
                  <strong>Négocier les fournitures</strong> : proposez d'acheter vous-même certains
                  matériaux (carrelage, robinetterie) que vous trouverez moins cher en grande surface.
                </li>
              </ol>
            </>
          ),
        },
        {
          id: "signer",
          title: "Avant de signer : checklist en 7 points",
          body: (
            <>
              <ol>
                <li>SIRET vérifié sur <a href="https://annuaire-entreprises.data.gouv.fr/" target="_blank" rel="nofollow">annuaire-entreprises.data.gouv.fr</a></li>
                <li>Assurance décennale et RC Pro mentionnées (références + assureur)</li>
                <li>Avis Google ≥ 4 / 5 sur 10+ avis OU 3 références chantier récentes fournies</li>
                <li>Acompte ≤ 30% à la signature</li>
                <li>Échéancier en 3-4 étapes maxi avec solde à la réception ≥ 10%</li>
                <li>Aucune clause "modification unilatérale du prix" ou "pas de rétractation"</li>
                <li>Délais explicités (date de démarrage, durée estimée)</li>
              </ol>
              <p>
                Si vous cochez ces 7 points, vous pouvez signer en confiance. À défaut, demandez
                la correction <strong>avant</strong> de signer, jamais après.
              </p>
            </>
          ),
        },
        {
          id: "refuser",
          title: "Refuser un devis (sans frais)",
          body: (
            <>
              <p>
                Un devis non signé <strong>n'engage à rien</strong>. Vous pouvez le refuser sans
                justification ni frais, sauf si le devis lui-même mentionne des frais d'établissement
                (rare).
              </p>
              <p>
                Si vous avez signé puis changez d'avis : la loi Hamon 2014 vous donne <strong>14 jours
                de rétractation</strong> pour les contrats signés à distance ou hors établissement
                (au domicile par exemple). En agence, ce droit ne s'applique pas — d'où l'importance
                de ne signer qu'après mûre réflexion.
              </p>
              <p>
                Pour refuser proprement : un email court suffit. Modèle :
              </p>
              <blockquote>
                <em>"Bonjour, après réflexion, je ne donne pas suite à votre devis n°XYZ
                  du JJ/MM/AAAA. Merci pour votre proposition et bon courage pour la suite."</em>
              </blockquote>
            </>
          ),
        },
        {
          id: "outils-vmd",
          title: "Comment VerifierMonDevis vous aide concrètement",
          body: (
            <>
              <p>
                VerifierMonDevis est <strong>l'outil le plus complet</strong> pour vérifier un
                devis travaux en France. Concrètement, vous uploadez votre PDF, et en 30 secondes
                vous obtenez :
              </p>
              <ul>
                <li>Un <strong>verdict tranché</strong> : signer / négocier / ne pas signer</li>
                <li>Une <strong>comparaison à 891 prix marché</strong> poste par poste</li>
                <li>La <strong>vérification entreprise</strong> (SIRET, ancienneté, assurance, avis Google)</li>
                <li>La <strong>détection automatique des clauses litigieuses</strong> dans le PDF</li>
                <li>Un <strong>message prêt à copier</strong> pour négocier avec votre artisan</li>
              </ul>
              <p>
                C'est gratuit (analyses individuelles) et utilisé par des milliers de particuliers
                chaque mois. <a href="/nouvelle-analyse">Lancez votre analyse maintenant</a>.
              </p>
            </>
          ),
        },
      ]}
      faqs={[
        {
          q: "Un devis est-il obligatoire pour des travaux ?",
          a: "Oui, pour tous les travaux BTP dont le montant dépasse <strong>1 500 € TTC</strong> (arrêté du 2 mars 1990). En-dessous, il est vivement recommandé pour la traçabilité et en cas de litige.",
        },
        {
          q: "Combien de temps un devis est-il valable ?",
          a: "<strong>3 mois en général</strong>. La durée de validité doit être explicitement mentionnée sur le devis (article L111-1 du Code de la consommation). Au-delà, l'artisan peut refuser d'honorer le prix indiqué.",
        },
        {
          q: "Quel acompte maximum demander ?",
          a: "La norme du métier est <strong>30% maximum</strong> à la signature. Au-delà, c'est un signal d'alerte : risque financier en cas de défaillance de l'artisan, et signal de trésorerie tendue. Légalement, il n'y a pas de plafond explicite, mais l'usage est très clair.",
        },
        {
          q: "Comment vérifier si un artisan est sérieux ?",
          a: "4 vérifications minimum : (1) SIRET valide sur annuaire-entreprises.data.gouv.fr ; (2) Assurance décennale et RC Pro (références sur le devis) ; (3) Avis Google ≥ 4/5 sur 10+ avis ; (4) Demande de 3 références de chantiers récents avec coordonnées de clients. Notre outil VMD fait ces 4 vérifications automatiquement.",
        },
        {
          q: "Puis-je négocier le prix après signature ?",
          a: "Non, une fois signé le devis devient un contrat ferme. Vous ne pouvez plus négocier le prix. C'est pourquoi <strong>il faut négocier AVANT la signature</strong>, pas après. Si l'artisan vous demande un avenant en cours de chantier (travaux supplémentaires), vous pouvez négocier cet avenant comme un nouveau devis.",
        },
        {
          q: "Que faire si mon devis a une clause illégale ?",
          a: "Demandez explicitement son retrait à l'artisan, par email, avant signature. Les clauses comme \"pas de rétractation\" (illégale loi Hamon 2014) ou \"modification unilatérale du prix\" (illégale L113-3) sont nulles légalement, mais leur présence est un signal très négatif sur le sérieux de l'entreprise.",
        },
      ]}
      relatedGuides={related}
      showGmcGateway
      ctaPrimary={{ href: "/nouvelle-analyse", label: "Vérifier mon devis gratuitement" }}
    />
  );
}
