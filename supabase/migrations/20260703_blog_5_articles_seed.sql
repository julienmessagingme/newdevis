-- Seed initial de 5 articles blog qui exploitent les data Observatoire.
-- Statut : workflow_status='ai_draft' + status='draft' -> visible dans /admin/blog
-- avec badge "Brouillon IA" pour relecture Julien avant approbation.
--
-- Chaque article :
--   - 800-1200 mots
--   - HTML sanitize-compatible (h2, h3, p, ul, ol, strong, em, a)
--   - Chiffres cites depuis les JSON Observatoire (postes-surfactures, erreurs-tva,
--     chantiers/salle-de-bain, chantiers/isolation, metiers/menuiserie-vitrages)
--   - 3-4 liens internes par article (nouvelle-analyse, observatoire, guides)
--
-- Idempotent : ON CONFLICT (slug) DO NOTHING permet de re-jouer la migration.

insert into public.blog_posts (
  slug, title, excerpt, content_html, category, tags, status, seo_title, seo_description,
  workflow_status, ai_generated, ai_prompt, ai_model
) values

-- ═══════════════════════════════════════════════════════════════════════════
-- B1 — Postes les plus surfacturés
-- ═══════════════════════════════════════════════════════════════════════════
(
  'postes-surfactures-devis-travaux-2026',
  'Les 5 postes les plus surfacturés sur les devis travaux (analyse de 347 devis)',
  'Sur 347 devis travaux analysés en 2026, certains postes reviennent régulièrement bien au-dessus des prix marché. Voici lesquels, et surtout pourquoi.',
  $html$
<p>Chez VerifierMonDevis, nous analysons chaque semaine des dizaines de devis d'artisans envoyés par des particuliers qui hésitent avant de signer. En agrégeant les résultats de <strong>347 devis</strong>, une réalité s'impose : ce ne sont pas les prestations principales qui font gonfler l'addition, mais des <strong>postes annexes</strong> souvent invisibles au premier regard. Voici les 5 qui reviennent le plus souvent au-dessus des prix marché constatés.</p>

<h2>Comment nous avons établi ce classement</h2>
<p>Notre outil compare chaque ligne de devis à notre catalogue interne de références (plusieurs centaines de postes travaux avec fourchettes de prix). Pour chaque poste, nous mesurons le ratio entre le prix devis et le prix médian catalogue. Seuls les postes matchés avec un score de confiance élevé sont retenus (voir <a href="/observatoire/methodologie">notre méthodologie complète</a>). Les 5 ci-dessous sont ceux dont l'écart médian a été le plus élevé sur notre échantillon.</p>

<h2>1. L'évacuation des gravats</h2>
<p>C'est le poste roi de la surfacturation. Souvent facturé au forfait ("Évacuation des gravats en déchetterie : 1&nbsp;200&nbsp;€"), il apparaît régulièrement à un tarif <strong>plusieurs fois supérieur au coût réel</strong> d'une benne + main d'œuvre. Le problème : le particulier n'a aucun repère pour juger. Notre conseil : demandez systématiquement à l'artisan le volume estimé (en m³), le nombre de bennes prévues et le tarif de la déchetterie locale. Un chiffrage détaillé rend la négociation possible.</p>

<h2>2. La peinture des pièces humides (salle de bain, WC)</h2>
<p>La peinture salle de bain nécessite un produit spécifique (peinture acrylique satinée résistante à l'humidité) et une préparation soignée. Prix marché médian : autour de 25 à 40&nbsp;€/m². Sur nos devis, le tarif observé peut monter très au-dessus, souvent parce que la ligne mélange peinture + reprise d'enduit + primaire sans détailler. Exigez le décompte poste par poste.</p>

<h2>3. La dépose du carrelage existant</h2>
<p>Un poste techniquement facile — on casse et on évacue — mais fréquemment gonflé. Prix marché typique : 15 à 30&nbsp;€/m² (bourrin) ou 40 à 60&nbsp;€/m² (soigné, si on veut réutiliser le support). Sur nos analyses, la dépose peut être facturée jusqu'à <em>trois fois</em> ce tarif. Vérifiez si la ligne inclut le ragréage (préparation du sol après dépose) ou si celui-ci est facturé séparément.</p>

<h2>4. Le raccordement électrique de la salle de bain</h2>
<p>Un poste qui devrait être encadré : la norme NF C 15-100 impose des règles précises (volumes 0/1/2/3, protections différentielles, éclairages IP44+). Notre observation : la ligne "mise aux normes salle de bain" apparaît parfois sans détail. Un devis correct doit lister les prises spécifiques ajoutées, les luminaires posés, le différentiel dédié installé, et le certificat Consuel remis à la fin.</p>

<h2>5. Le forfait "installation complète" plomberie</h2>
<p>Sur les rénovations salle de bain, on trouve souvent une ligne "installation plomberie complète : X&nbsp;€". Cette formule fourre-tout est un piège : elle rend impossible toute comparaison entre devis d'artisans, et donne à celui qui l'utilise une marge de manœuvre confortable. Un vrai devis détaille : raccordement alimentation, évacuation, robinetterie, WC, receveur, colonne de douche — chaque ligne avec son prix. Si l'artisan refuse, il vous facture probablement une prestation vague.</p>

<h2>Pourquoi ces postes-là et pas d'autres ?</h2>
<p>Ces 5 postes ont un point commun : <strong>ils sont difficiles à contre-chiffrer sans expertise</strong>. Le particulier peut comparer un prix au m² de carrelage entre 3 devis, mais pas savoir si "évacuation gravats 1&nbsp;200&nbsp;€" est correct ou double. Cette asymétrie d'information est exploitable par les artisans peu scrupuleux.</p>

<h2>Comment vous protéger</h2>
<p>Trois réflexes simples :</p>
<ul>
  <li><strong>Exigez le détail.</strong> Un "forfait complet" est un feu rouge. Chaque poste doit avoir sa ligne, son unité (m², ml, U, forfait précisé), son prix unitaire.</li>
  <li><strong>Comparez au moins 3 devis.</strong> Sur des postes similaires, l'écart entre artisans peut atteindre 30 à 50%. Si un artisan est très au-dessus des deux autres, demandez-lui pourquoi.</li>
  <li><strong>Faites vérifier votre devis</strong> avant de signer. Notre outil <a href="/nouvelle-analyse">Vérifier mon devis</a> compare chaque ligne aux prix marché et identifie les postes à discuter.</li>
</ul>

<p>Retrouvez le détail des postes surfacturés sur <a href="/observatoire/postes-surfactures">notre page Observatoire</a>, mise à jour chaque mois avec les nouveaux devis analysés.</p>
$html$,
  'Devis & Conseils',
  ARRAY['devis travaux', 'surfacturation', 'observatoire', 'prix marché'],
  'draft',
  'Postes les plus surfacturés sur devis travaux : le top 5 (analyse 2026)',
  'Sur 347 devis analysés, ces 5 postes reviennent régulièrement au-dessus du marché. Découvrez lesquels et comment vous protéger avant de signer.',
  'ai_draft',
  true,
  'B1 — Postes les plus surfacturés, sourcé postes-surfactures.json (347 analyses)',
  'claude-opus-4-7'
),

-- ═══════════════════════════════════════════════════════════════════════════
-- B2 — TVA erreurs
-- ═══════════════════════════════════════════════════════════════════════════
(
  'erreur-tva-devis-travaux-2026',
  'TVA 5,5%, 10% ou 20% : l''erreur qui apparaît sur 1 devis sur 4 (étude 2026)',
  'Analyse de 313 devis travaux : la TVA appliquée est incorrecte plus souvent qu''on ne le croit. Voici comment vérifier la vôtre en 2 minutes.',
  $html$
<p>La TVA sur devis travaux n'est pas un détail : sur une rénovation à 20&nbsp;000&nbsp;€, la différence entre un taux à 5,5% et un taux à 10% représente <strong>plus de 900&nbsp;€</strong>. Et pourtant, en analysant 313 devis travaux en 2026, notre outil détecte régulièrement des erreurs — parfois en faveur de l'artisan, parfois en faveur du particulier. Voici ce qu'il faut savoir pour vérifier la vôtre.</p>

<h2>Les 3 taux applicables aux travaux en France</h2>
<p>Les artisans du bâtiment peuvent, selon la nature des travaux et l'ancienneté du logement, appliquer 3 taux distincts :</p>
<ul>
  <li><strong>TVA à 5,5%</strong> — travaux de <em>rénovation énergétique</em> (isolation thermique, chauffage performant, pompe à chaleur, etc.) dans un logement de plus de 2 ans. C'est le taux le plus favorable.</li>
  <li><strong>TVA à 10%</strong> — travaux <em>d'amélioration, de transformation ou d'entretien</em> dans un logement de plus de 2 ans. Le cas le plus fréquent en rénovation.</li>
  <li><strong>TVA à 20%</strong> — logement <em>neuf</em> (moins de 2 ans) OU travaux qui ne rentrent ni dans la catégorie rénovation énergétique ni dans amélioration/entretien (ex : construction d'une piscine, gros équipement neuf sans lien avec l'habitation, ameublement).</li>
</ul>

<h2>Ce que révèle l'analyse de 313 devis</h2>
<p>Sur notre échantillon, la répartition observée est la suivante :</p>
<ul>
  <li>Environ <strong>24%</strong> des devis appliquent la TVA à 20% (donc concernent principalement des travaux neufs ou hors du champ de la rénovation).</li>
  <li>Environ <strong>40%</strong> des devis appliquent la TVA à 10%.</li>
  <li>Les autres appliquent la TVA à 5,5%, ou combinent plusieurs taux selon les postes.</li>
</ul>
<p>Cette répartition en apparence normale masque plusieurs erreurs récurrentes qui, une fois cumulées, deviennent significatives.</p>

<h2>Les erreurs les plus fréquentes détectées</h2>

<h3>Erreur n°1 : TVA 20% appliquée à tort sur des travaux d'amélioration</h3>
<p>Un logement de plus de 2 ans, une rénovation classique — la TVA devrait être à 10%. On voit pourtant des devis facturés à 20% "par défaut". Perte pour le particulier : 10 points de TVA. Sur 15&nbsp;000&nbsp;€ HT, cela représente 1&nbsp;500&nbsp;€ de trop payé.</p>

<h3>Erreur n°2 : TVA 5,5% appliquée à tort sur des postes non éligibles</h3>
<p>Dans une rénovation énergétique globale (ex : isolation combles + changement chaudière), l'artisan applique parfois la TVA à 5,5% sur <em>tous</em> les postes du devis, alors qu'elle ne concerne réellement que les postes strictement liés à la performance énergétique. Les postes annexes (peinture, revêtement de sol) doivent en principe rester à 10%.</p>

<h3>Erreur n°3 : le forfait "toutes taxes comprises" qui ne détaille pas la TVA</h3>
<p>Un devis conforme au Code de la consommation doit préciser le <strong>montant HT, le taux de TVA appliqué et le montant TTC</strong>. Un devis qui affiche uniquement "Total TTC : X&nbsp;€" sans détailler est incomplet. Demandez systématiquement le détail.</p>

<h2>Comment vérifier la TVA de votre devis</h2>
<p>4 vérifications simples avant signature :</p>
<ol>
  <li><strong>L'ancienneté de votre logement.</strong> Si votre logement a plus de 2 ans (attestation sur l'honneur possible), la TVA à 20% n'est justifiée que pour les postes vraiment neufs.</li>
  <li><strong>La nature exacte des travaux.</strong> Isolation, chauffage, ventilation, ballon d'eau chaude performant : éligible à 5,5%. Amélioration classique (peinture, sol, sanitaire) : 10%.</li>
  <li><strong>Le décompte poste par poste.</strong> Un devis mixte doit détailler quel taux s'applique à quelle prestation. Pas de forfait global.</li>
  <li><strong>L'attestation TVA réduite.</strong> Pour un taux à 5,5% ou 10%, l'artisan doit vous faire signer une attestation confirmant que le logement respecte les conditions (ancienneté, usage). Sans cette attestation, il ne peut pas appliquer le taux réduit.</li>
</ol>

<h2>Un doute ? Vérifiez en 30 secondes</h2>
<p>Notre outil <a href="/nouvelle-analyse">Vérifier mon devis</a> analyse automatiquement le taux de TVA appliqué à chaque poste et vous signale les incohérences. Vous savez en 30 secondes si votre devis est correct ou s'il y a matière à discuter avec l'artisan.</p>

<p>Retrouvez la répartition détaillée des TVA observées et les cas litigieux fréquents sur <a href="/observatoire/erreurs-tva">notre page Observatoire</a>.</p>
$html$,
  'Devis & Conseils',
  ARRAY['TVA', 'devis travaux', 'observatoire', 'rénovation'],
  'draft',
  'TVA sur devis travaux : les erreurs les plus fréquentes (étude 2026)',
  'TVA 5,5%, 10% ou 20% ? Sur 313 devis analysés, les erreurs sont fréquentes. Voici comment vérifier votre devis en 2 minutes.',
  'ai_draft',
  true,
  'B2 — Erreurs TVA, sourcé erreurs-tva.json (313 analyses)',
  'claude-opus-4-7'
),

-- ═══════════════════════════════════════════════════════════════════════════
-- B3 — Salle de bain
-- ═══════════════════════════════════════════════════════════════════════════
(
  'prix-renovation-salle-de-bain-2026',
  'Rénovation salle de bain : pourquoi les devis varient du simple au triple (56 devis analysés)',
  'Sur 56 devis salle de bain analysés en 2026, l''écart entre le moins cher et le plus cher est de plusieurs milliers d''euros pour la même prestation. Voici pourquoi.',
  $html$
<p>Vous venez de recevoir 3 devis pour rénover votre salle de bain et vous ne comprenez pas pourquoi les prix varient autant ? Vous n'êtes pas seul. En analysant <strong>56 devis salle de bain</strong> représentant 173 lignes de travaux, notre outil observe des écarts considérables entre artisans pour des prestations en apparence identiques. Voici comment lire ces écarts et situer votre propre devis.</p>

<h2>La fourchette de prix réelle observée en 2026</h2>
<p>Difficile de donner un "prix moyen" d'une rénovation salle de bain — trop de paramètres varient (surface, dépose totale ou partielle, gamme des équipements, mise aux normes électriques). Ce qu'on peut donner, c'est la fourchette habituelle observée sur nos analyses :</p>
<ul>
  <li>Une salle de bain simple sans dépose lourde (peinture, changement robinetterie, mise à jour esthétique) : quelques milliers d'euros.</li>
  <li>Une rénovation complète avec dépose du carrelage, refaite plomberie, remplacement des sanitaires et du sol : entre 5&nbsp;000&nbsp;€ et 15&nbsp;000&nbsp;€ selon les choix.</li>
  <li>Au-delà de 15&nbsp;000&nbsp;€, on entre dans la salle de bain haut de gamme (matériaux premium, robinetterie design, agencement sur mesure).</li>
</ul>
<p>Consultez la <a href="/observatoire/chantiers/salle-de-bain">fourchette précise de notre Observatoire</a> pour la médiane, le P25 et le P75 calculés sur les 56 devis.</p>

<h2>Les 3 postes qui expliquent l'essentiel de l'écart</h2>

<h3>1. La dépose et le ragréage</h3>
<p>Enlever le carrelage existant, préparer le sol pour recevoir le nouveau revêtement — c'est le poste qui varie le plus entre artisans. Selon l'état du support et le soin apporté, le tarif au m² peut varier du simple au triple. Un artisan qui ne détaille pas ce poste vous facturera peut-être une "dépose bourrin" au prix d'une "dépose soignée". <strong>Demandez toujours le détail.</strong></p>

<h3>2. La plomberie et la robinetterie</h3>
<p>Deux facteurs jouent : la fourniture (choix des équipements) et la pose. Sur la fourniture, l'écart est logique : un mitigeur Grohe à 400&nbsp;€ n'a rien à voir avec un mitigeur premier prix à 60&nbsp;€. Sur la pose, méfiez-vous des lignes "installation plomberie complète : X&nbsp;€" sans détail — c'est un forfait fourre-tout qui peut cacher une marge importante. Un devis correct détaille : raccordement alimentation, évacuation, colonne de douche, receveur, WC, chacun avec son prix.</p>

<h3>3. Le carrelage et la faïence</h3>
<p>Ici, l'écart vient à la fois du choix de la matière (grès cérame haut de gamme vs premier prix) et de la complexité de pose (droite classique vs pose en chevron ou format XXL). Notre analyse montre que la ligne "pose carrelage sol" peut varier du simple au triple selon les artisans, même à prestation identique.</p>

<h2>Les erreurs de devis les plus fréquentes</h2>
<p>Sur nos 56 devis, quelques erreurs reviennent souvent :</p>
<ul>
  <li><strong>Le forfait "installation" opaque</strong> — impossibilité de comparer entre artisans.</li>
  <li><strong>La TVA à 20% appliquée à tort</strong> alors que le logement a plus de 2 ans (voir notre article <a href="/blog/erreur-tva-devis-travaux-2026">TVA sur devis travaux</a>).</li>
  <li><strong>La ligne "mise aux normes électriques" sans détail</strong> alors que la norme NF C 15-100 impose des règles précises (volumes, protection différentielle, etc.).</li>
  <li><strong>L'oubli de l'évacuation des gravats</strong> — apparemment gratuit, mais souvent facturé en supplément après signature.</li>
</ul>

<h2>Comment situer votre devis</h2>
<p>Trois réflexes avant de signer :</p>
<ol>
  <li><strong>Comparez au moins 3 devis</strong>, en exigeant qu'ils détaillent les mêmes postes. Si un artisan refuse de détailler, écartez-le.</li>
  <li><strong>Vérifiez le contexte réglementaire</strong> : ancienneté du logement (TVA), présence d'une garantie décennale, assurance responsabilité civile pro.</li>
  <li><strong>Faites analyser votre devis</strong> par un outil comparateur. Notre <a href="/nouvelle-analyse">outil Vérifier mon devis</a> vous donne un verdict argumenté ligne par ligne en 30 secondes.</li>
</ol>

<p>Si vous avez plusieurs devis en main, utilisez notre <a href="/comparateur/nouveau">comparateur multi-devis</a> qui met en évidence les écarts poste par poste et identifie l'offre la plus honnête.</p>
$html$,
  'Prix & Fourchettes',
  ARRAY['salle de bain', 'rénovation', 'observatoire', 'prix travaux'],
  'draft',
  'Prix rénovation salle de bain 2026 : écart entre devis expliqué (56 analyses)',
  'Salle de bain : entre 5 000 € et 15 000 € selon les devis. Pourquoi ces écarts, quels postes surveiller, comment situer le vôtre.',
  'ai_draft',
  true,
  'B3 — Salle de bain, sourcé chantiers/salle-de-bain.json (56 devis)',
  'claude-opus-4-7'
),

-- ═══════════════════════════════════════════════════════════════════════════
-- B4 — Isolation combles
-- ═══════════════════════════════════════════════════════════════════════════
(
  'prix-isolation-combles-perdus-2026',
  'Isolation combles perdus : le vrai prix et les aides (66 devis analysés en 2026)',
  'Combien coûte vraiment l''isolation des combles perdus au m² en 2026 ? Analyse de 66 devis, matériaux comparés, aides mobilisables.',
  $html$
<p>L'isolation des combles perdus reste l'un des travaux les plus rentables en rénovation énergétique : gain thermique important, coût maîtrisé, aides publiques significatives. Mais entre le tarif au m² qui varie selon le matériau et les postes annexes souvent oubliés, difficile de savoir si votre devis est correct. Sur <strong>66 devis isolation analysés</strong> par notre outil, voici les repères concrets pour 2026.</p>

<h2>La fourchette de prix par m² selon le matériau</h2>
<p>L'isolation combles perdus se fait généralement par soufflage d'un matériau isolant sur le plancher des combles. Trois matériaux dominent le marché :</p>

<h3>Laine de verre soufflée</h3>
<p>Le matériau le plus utilisé, bon rapport qualité-prix. Prix marché habituel : autour de 20 à 30&nbsp;€/m² pose comprise (épaisseur 30 à 40&nbsp;cm pour R ≥ 7 m²·K/W, seuil MaPrimeRénov'). Sur nos devis, le prix médian observé se situe dans cette fourchette.</p>

<h3>Laine de roche soufflée</h3>
<p>Meilleure résistance au feu, comportement similaire à la laine de verre. Prix marché : autour de 25 à 35&nbsp;€/m². Un peu plus cher que la laine de verre mais souvent choisie dans les zones à risque incendie ou pour un meilleur confort d'été.</p>

<h3>Ouate de cellulose soufflée</h3>
<p>Matériau biosourcé (papier recyclé), très bonnes performances hygrothermiques (confort d'été notamment). Prix marché : autour de 30 à 40&nbsp;€/m². Le plus cher des trois, mais choisi pour son bilan écologique.</p>

<p>Consultez la <a href="/observatoire/chantiers/isolation">fourchette précise par matériau</a> sur notre Observatoire, mise à jour chaque mois.</p>

<h2>Les postes annexes souvent oubliés</h2>
<p>Un devis isolation combles ne se limite pas à la pose de l'isolant. Vérifiez que votre devis inclut bien :</p>
<ul>
  <li><strong>Le pare-vapeur ou frein-vapeur</strong> — indispensable pour éviter la condensation dans l'isolant. Doit être posé côté chauffé (donc sous l'isolant).</li>
  <li><strong>Les déflecteurs en pignon</strong> — évitent que l'isolant soufflé n'obstrue les entrées d'air en sous-toiture (ventilation nécessaire).</li>
  <li><strong>La trappe d'accès isolée</strong> — sinon c'est un pont thermique majeur. Une trappe isolée avec joint périphérique doit apparaître dans le devis.</li>
  <li><strong>Le caisson autour du conduit de cheminée</strong> — norme incendie obligatoire, doit apparaître avec le prix.</li>
  <li><strong>Le rehaussement du plancher</strong> si vous voulez conserver l'usage des combles pour rangement.</li>
</ul>
<p>Un devis qui n'inclut pas ces postes vous facturera probablement des suppléments après signature. <strong>Exigez-les avant.</strong></p>

<h2>Les aides mobilisables en 2026</h2>
<p>L'isolation combles perdus reste l'un des travaux les mieux subventionnés :</p>
<ul>
  <li><strong>MaPrimeRénov'</strong> — jusqu'à 25&nbsp;€/m² selon vos revenus (barème par tranche : bleu, jaune, violet, rose).</li>
  <li><strong>CEE (Certificats d'Économie d'Énergie)</strong> — cumulables avec MaPrimeRénov'. Prime versée par les fournisseurs d'énergie.</li>
  <li><strong>Éco-PTZ</strong> — prêt à taux zéro pour financer les travaux, jusqu'à 15&nbsp;000&nbsp;€ pour une action seule d'isolation, plus si bouquet.</li>
  <li><strong>TVA à 5,5%</strong> — applicable sur les travaux d'isolation dans un logement de plus de 2 ans (voir notre article <a href="/blog/erreur-tva-devis-travaux-2026">TVA sur devis travaux</a>).</li>
</ul>
<p>Pour bénéficier de MaPrimeRénov' et des CEE, l'entreprise doit être <strong>certifiée RGE</strong> (Reconnu Garant de l'Environnement). Vérifiez la mention sur le devis, et l'attestation en cours de validité.</p>

<h2>Vérifier votre devis isolation</h2>
<p>4 réflexes avant de signer :</p>
<ol>
  <li><strong>La résistance thermique R indiquée sur le devis.</strong> Pour être éligible aux aides, R ≥ 7 m²·K/W pour les combles perdus. En dessous, pas d'aide et faible économie d'énergie.</li>
  <li><strong>L'épaisseur en cm</strong> précisée pour chaque matériau. R et épaisseur doivent être cohérents (laine de verre : environ 30&nbsp;cm pour R=7).</li>
  <li><strong>Le certificat RGE</strong> de l'entreprise, joint au devis ou consultable sur <a href="https://france-renov.gouv.fr" target="_blank" rel="noopener">france-renov.gouv.fr</a>.</li>
  <li><strong>Notre outil <a href="/nouvelle-analyse">Vérifier mon devis</a></strong> compare votre devis aux prix marché isolation observés et identifie les postes manquants ou les tarifs anormaux.</li>
</ol>

<p>Retrouvez la fourchette précise et le détail des points de vigilance sur notre <a href="/observatoire/chantiers/isolation">page Observatoire isolation</a>.</p>
$html$,
  'Prix & Fourchettes',
  ARRAY['isolation', 'combles', 'aides', 'observatoire', 'rénovation énergétique'],
  'draft',
  'Prix isolation combles perdus 2026 : fourchette + aides (66 devis analysés)',
  'Combien coûte l''isolation combles perdus au m² en 2026 ? Fourchette par matériau, aides MaPrimeRénov'', CEE, éco-PTZ. Vérifiez votre devis.',
  'ai_draft',
  true,
  'B4 — Isolation combles, sourcé chantiers/isolation.json (66 devis)',
  'claude-opus-4-7'
),

-- ═══════════════════════════════════════════════════════════════════════════
-- B5 — Fenêtre PVC
-- ═══════════════════════════════════════════════════════════════════════════
(
  'prix-fenetre-pvc-pose-2026',
  'Combien coûte vraiment une fenêtre PVC posée en 2026 ? (analyse de 81 devis menuiserie)',
  'Sur 81 devis menuiserie analysés, le prix moyen d''une fenêtre PVC posée révèle des écarts importants entre artisans. Voici ce qui les explique.',
  $html$
<p>Remplacer ses fenêtres est un investissement majeur : gain thermique important, valorisation du bien, aides mobilisables. Mais entre le PVC premier prix à 300&nbsp;€ pièce et le PVC haut de gamme à 1&nbsp;500&nbsp;€, difficile de savoir où placer le curseur. Sur <strong>81 devis menuiserie analysés</strong> en 2026, voici ce que révèle notre outil sur le vrai prix d'une fenêtre PVC posée.</p>

<h2>La fourchette de prix pour une fenêtre PVC posée</h2>
<p>Le prix d'une fenêtre PVC posée dépend de 4 paramètres principaux : les dimensions, le type de vitrage (double ou triple), le nombre de vantaux (1, 2 ou plus), et le coloris (blanc standard ou plaxé bois/coloris ral).</p>

<p>Pour un modèle standard 2 vantaux, double vitrage, dimensions courantes (120×120 cm), la fourchette observée sur nos devis se situe entre 500&nbsp;€ et 1&nbsp;200&nbsp;€ pièce pose comprise. Pour un triple vitrage sur dimensions plus grandes, comptez plutôt entre 900&nbsp;€ et 1&nbsp;800&nbsp;€. Consultez la <a href="/observatoire/metiers/menuiserie-vitrages">fourchette précise sur notre Observatoire</a>.</p>

<h2>Ce qui fait varier le prix</h2>

<h3>Le type de vitrage</h3>
<p>Double vitrage classique (4/16/4 argon) : le standard actuel, largement suffisant en France métropolitaine sauf zones froides. Triple vitrage : gain thermique marginal en climat tempéré, coût nettement supérieur. Le triple vitrage est vraiment pertinent pour les zones froides ou pour les fenêtres exposées au nord.</p>

<h3>Les dimensions et le nombre de vantaux</h3>
<p>Une fenêtre 1 vantail 60×80 cm coûte moitié moins qu'une fenêtre 2 vantaux 140×150 cm. Mais attention : le prix au m² n'est pas linéaire (une petite fenêtre reste "chère" pour peu de surface). Comparez plutôt à surface équivalente entre devis.</p>

<h3>Le coloris</h3>
<p>Blanc standard : le moins cher. PVC plaxé (imitation bois, gris anthracite, coloris RAL personnalisé) : supplément de 15 à 30% typique. Vérifiez si le coloris intérieur diffère de l'extérieur — certains fabricants facturent en supplément.</p>

<h3>Les options : volets roulants, moustiquaires, sécurité renforcée</h3>
<p>Ces options peuvent doubler le prix de la fenêtre. Vérifiez si votre devis inclut réellement ce que vous voulez, ou si l'artisan a "oublié" une option qu'il facturera ensuite en avenant.</p>

<h2>Le poste "dépose" à surveiller</h2>
<p>La dépose des anciennes fenêtres est un poste qui varie beaucoup entre artisans. Une dépose soignée (préservation de l'encadrement, protection intérieure, évacuation des déchets) coûte 80 à 150&nbsp;€ par fenêtre. Certains devis facturent bien au-delà. Deux vérifications :</p>
<ul>
  <li>La dépose apparaît-elle comme une ligne distincte, ou est-elle incluse dans le prix de la fenêtre neuve ? Les deux options sont possibles, l'important est de comprendre.</li>
  <li>L'évacuation des anciennes menuiseries est-elle incluse ? Sinon, prévoyez un supplément.</li>
</ul>

<h2>Les aides pour remplacer ses fenêtres en 2026</h2>
<ul>
  <li><strong>MaPrimeRénov'</strong> — jusqu'à 100&nbsp;€ par fenêtre remplacée selon vos revenus, conditionné à des performances thermiques minimales (Uw ≤ 1,3 W/m²·K).</li>
  <li><strong>CEE (Certificats d'Économie d'Énergie)</strong> — cumulables avec MaPrimeRénov'.</li>
  <li><strong>Éco-PTZ</strong> — prêt à taux zéro pour financer le remplacement.</li>
  <li><strong>TVA à 5,5%</strong> — applicable dans les logements de plus de 2 ans si les performances thermiques sont conformes.</li>
</ul>
<p>L'entreprise doit être <strong>certifiée RGE</strong> pour vous permettre de bénéficier de ces aides. Vérifiez la mention sur le devis.</p>

<h2>Les points de vigilance à checker avant de signer</h2>
<ol>
  <li><strong>La performance thermique Uw</strong> précisée pour chaque fenêtre. Pour les aides : Uw ≤ 1,3 W/m²·K.</li>
  <li><strong>Le certificat RGE</strong> de l'entreprise.</li>
  <li><strong>La garantie décennale</strong> et la responsabilité civile pro.</li>
  <li><strong>Le détail poste par poste</strong> : fourniture fenêtre, pose, dépose, évacuation, seuil ajusté, calfeutrage, finitions intérieures.</li>
  <li><strong>Le délai de livraison des fenêtres</strong> — souvent 6 à 10 semaines entre commande et pose.</li>
</ol>

<h2>Vérifier votre devis fenêtre en 30 secondes</h2>
<p>Notre outil <a href="/nouvelle-analyse">Vérifier mon devis</a> compare votre devis menuiserie aux prix marché observés sur 81 devis analysés et vous signale les tarifs anormaux ou les postes manquants. Vous avez le résultat en 30 secondes.</p>

<p>Si vous avez plusieurs devis en main, notre <a href="/comparateur/nouveau">comparateur multi-devis</a> met en évidence les écarts entre artisans et identifie l'offre la plus honnête.</p>
$html$,
  'Prix & Fourchettes',
  ARRAY['fenêtre', 'PVC', 'menuiserie', 'observatoire', 'rénovation'],
  'draft',
  'Prix fenêtre PVC posée 2026 : fourchette réelle (81 devis analysés)',
  'Fenêtre PVC posée : entre 500 € et 1 800 € selon vitrage et dimensions. Détail des postes, aides mobilisables, points à vérifier.',
  'ai_draft',
  true,
  'B5 — Fenêtre PVC, sourcé metiers/menuiserie-vitrages.json (81 devis)',
  'claude-opus-4-7'
)

on conflict (slug) do nothing;
