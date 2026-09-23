# TODO.md — Backlog VerifierMonDevis.fr / GérerMonChantier

Backlog = items à faire **non encore commencés**. Dès qu'on attaque un item, il bascule dans `WIP.md`.

Pour le rationnel et l'historique des audits UX, voir `UX-AUDIT.md`.

---

## 🟡 Suites de la refonte du verdict affiché (2026-09-22)

Le hero porte désormais la DÉCISION (signer / négocier / ne pas signer) et non plus notre niveau de certitude (cf. `CLAUDE.md` § Verdict expert, entrées du 22/09). Résidus côté SERVEUR, non traités parce qu'ils ne se voient plus à l'écran — mais ils restent dans la donnée :

- 🔴 **CORRECTION DU 22/09 AU SOIR — J'AVAIS ÉCRIT QUE `comparison_indicative` ESCALADAIT LE VERDICT. C'EST FAUX.** Vérifié dans le code : il est calculé ~ligne 3471 de `conclusion.ts`, soit **bien après** que `verdict_decisionnel` ait été posé depuis `preEngine.verdict` (ligne 2232). Il ne peut pas l'escalader.
  ⚠️ **L'erreur vient de ma méthode, pas du code** : mon script de diagnostic attribuait une cause **par élimination** (`else if (c.comparison_indicative) cause = …`) et je l'ai rapportée comme une causalité établie. Une cause trouvée par ordre de test dans un `if` n'est pas une preuve — c'est le même défaut que les six indicateurs faux de septembre.
- **Ce qui reste vrai, et qui est le vrai point** : le verdict STOCKÉ peut dire `a_negocier` sur un devis que la page présente désormais en vert (« rien ne s'oppose »). C'est voulu — l'admin doit voir le moteur — mais l'écran de revue et les KPI sont donc plus alarmistes que ce que le client lit. **À décider : aligner, ou documenter la divergence dans l'écran admin.**
- **`leviersBuilder` écrit toujours « quelques prestations méritent une clarification avec l'artisan avant signature »** dans `verdict_ligne.resume` (branche « décision non-signer sans signal dominant identifié », l. ~675). Le hero l'ignore en état gris, mais le texte reste dans la conclusion et peut ressortir ailleurs. À composer côté serveur comme `phraseIntroSansReference` le fait depuis le 16/09.
- ✅ **FAIT le 22/09 — 2 conclusions réparées** ([`reparer-double-montant.mjs`](scripts/reparer-double-montant.mjs)). ⚠️ Deux des « trois » annoncées étaient des faux positifs (retenue de garantie face à un écart de prix), et une quatrième manquait à ma liste. Détail dans `CLAUDE.md`.
- ✅ **TRANCHÉ le 22/09 (Johan) : on garde le CHIFFRE UNIQUE.** La fourchette « autour » du montant est refusée — elle serait décorative, donc un chiffre faux (règle du 15/09, c'est le ×1,3 supprimé ce jour-là). La fourchette CALCULÉE (écart au plafond du marché face à l'écart au plancher) reste techniquement possible mais **durcit** le message (sur Vilette : 3 880 € contre 5 416 €) : à ne rouvrir que si l'objectif devient d'accuser davantage, ce qui n'est pas le cas.
- 🔴 **LE TITRE CONTREDIT LE MESSAGE DE L'EXPERT SUR 5 CONCLUSIONS SUR 24 (21 %) — MESURÉ LE 2026-09-23, DEUX CAUSES DISTINCTES.** Banc : rendu du composant de production sur les 200 cartes du stock, recommandation lue dans le message.

  | | |
  |---|---:|
  | conclusions portant un message d'expert | **24** |
  | 🟢 titre et message d'accord | 19 |
  | 🔴 **l'expert REFUSE, la page propose de négocier** | **2** |
  | 🔴 **la page REFUSE, l'expert ne refuse pas** | **3** |

  - ✅ **CAUSE 1 CORRIGÉE le 23/09** (`motifsBloquants` dans `decisionAffichee`, cf. `CLAUDE.md`) : quand un expert a relu ET posé un verdict qui n'est pas un refus, sa décision prime sur les critères du moteur. **1 carte change sur 200, 37 hard blocks sur 38 conservés, zéro perte.** ⚠️ Et la mesure ci-dessous **surestimait** : en lisant la DÉCISION de l'expert et non le ton de son texte, il n'y avait qu'**un** cas (SOLTANI), pas trois — les deux autres portent un `verdict_decisionnel = "ne_pas_signer"` posé par l'expert, donc le titre leur est fidèle.
  - 🔴 **CAUSE 1 — LES `criteres_rouges` SURVIVENT À LA CORRECTION, ET ILS ÉCRASENT TOUT (3 cas).** Vérifié dans le code : `decide.ts` n'écrit que `review_status`, `review_notes`, `reviewed_at`, `reviewed_by` et `conclusion_ia` — **jamais `score` ni `raw_text.scoring`**. Or `AvisSurLeDevis` retourne en **hard block** dès que `criticalReasons.length > 0`, avant toute autre branche. Le pire cas est **`c7ddb3a4` (devis SOLTANI)** : l'expert a mis `verdict_decisionnel = "signer"` et écrit *« prix cohérents… conforme aux prix du marché… particulièrement compétitif »*, et la page titre **« Nous vous invitons à ne pas signer sans clarification »**. Les deux autres (`9b138b15` devis automobile, `28f87518` ELITE ENERGIES) portent un critère « acompte cumulé » que l'expert a **explicitement invalidé par écrit** (*« L'alerte automatique concernant les conditions de paiement n'est pas pertinente… échéancier tout à fait standard et sécurisant »*).
  - ✅ **CAUSE 2 CORRIGÉE le 23/09** — garde de cohérence dans `decide.ts` (`verdictContreditLeMessage`, cf. `CLAUDE.md`) : une correction dont le message refuse alors que le verdict ne refuse pas est **rejetée en 400**, l'expert tranche. Les **2 conclusions du stock sont alignées** (`aligner-verdict-sur-message-expert.mjs`) : elles affichent désormais « Ne signez pas en l'état ».
    - ✅ **Wording corrigé le 23/09** : sous un refus, « Marge de négociation estimée » devient **« Écart estimé sur les prix »** (`libelleMontant`, cf. `CLAUDE.md`). **9 des 48 refus étaient concernés → 0**, zéro montant perdu. On reformule et on ne masque pas : sur ces cartes le titre ne porte aucun chiffre, masquer l'aurait fait disparaître de la page.
  - 🔴 **CAUSE 2 — L'EXPERT REFUSE DANS SON TEXTE SANS FAIRE BASCULER LE VERDICT (2 cas).** `c2158401` (ALES) : *« nous vous recommandons de ne pas signer ce document en l'état »* sous un titre « Environ 1 332 € à discuter ». `360f2991` (J.P. ROUX) : le message se termine par *« En résumé, ne signez pas ce devis en l'état »*, titre « Un point à sécuriser avant de signer ». Dans les deux cas `verdict_decisionnel` vaut `signer_avec_negociation` et aucun critère rouge n'existe.
  - **À TRANCHER, et les deux causes n'appellent pas la même réponse.** Cause 1 : donner à l'écran de revue le moyen de **retirer un critère rouge** (aujourd'hui l'expert peut décocher une anomalie, pas un critère) — c'est la plus urgente, elle fait dire à la page l'inverse de ce que l'expert a validé. Cause 2 : soit l'écran impose de trancher le verdict quand un message est écrit, soit `resyncVerdictLigne` dérive le verdict du message (il en extrait déjà la première phrase depuis le 05/09).
  - ⚠️ **LE DÉTECTEUR A SON TÉMOIN DOUBLE, ET IL EST INDISPENSABLE** : 5 refus réels doivent être reconnus, 6 formules **conditionnelles** doivent être écartées. Le piège est qu'elles se ressemblent et disent l'inverse — *« ne signer aucun document AVANT d'avoir obtenu les mentions »* est un conseil de sécurisation (le devis reste signable), *« ne pas signer ce devis EN L'ÉTAT »* est un refus. Un motif qui les confond fabrique des contradictions qui n'existent pas.
  - ⚠️ **ET DEUX DES CINQ « À RELIRE » SONT COHÉRENTES** (`3608b1d5` ATARAXIA, `512e4c62` Damien Dubourg) : le message y est sévère ou décrit une entreprise cessée sans employer la formule. **Un message neutre n'est pas un feu vert** — c'est pourquoi le banc les sort en « à relire » et non en contradiction.
- 🟡 **`comprendre-score.astro` est en `prerender = false` alors qu'elle est entièrement statique** — contenu écrit en dur, aucun accès fichier, aucun état runtime. Elle impose un rendu serveur à chaque requête pour un HTML qui ne change jamais, sur une page indexée. Même défaut que les deux pages guides corrigées le 21/09.

---

## 🟡 Trouvé en mesurant « où porte l'effort » (2026-09-22)

Issus de [`scripts/banc-familles-non-chiffrees.mts`](scripts/banc-familles-non-chiffrees.mts) (cf. `CLAUDE.md` § « OÙ PORTE L'EFFORT ? »). Aucun n'est traité.

- 🔴 **L'EXTRACTION REND PARFOIS LE MONTANT COMME DESCRIPTION.** Trois lignes du seau « aucune entrée » ont pour libellé **« 17250 euro »**, **« 9600 euro »**, **« 12 000 euro »** — pour 38 850 € cumulés. Rien ne peut être rapproché d'une ligne qui ne dit pas ce qu'elle facture, et ces montants sont loin d'être négligeables. À instruire côté `extract_v2.ts` : d'où vient la confusion (colonne mal lue ? ligne de total ?).
- 🟡 **UN DEVIS DE MAISON CCMI ENTIÈRE (145 286 €) TOMBE DANS LE FOURRE-TOUT** — « Modèle Plain pied », 60 % du seau (A) à lui seul. Le catalogue chiffre des OUVRAGES, pas une maison complète, et il n'a pas vocation à le faire. La question est produit : dit-on à ce lecteur que nous ne savons pas comparer un CCMI (comme pour l'étranger ou le courtier), plutôt que de le laisser dans le cas général ?
- 🔴 **NE PAS SOURCER LE VERTICAL CLIM PAR RÉFÉRENCES — mesuré, ça ne paie pas.** 13 références manquantes, **une seule vue sur 2 devis ou plus**, ~7 300 €/mois débloqués pour 13 sourcings qui ne serviront chacun qu'une fois ([`scripts/banc-clim-references-manquantes.mts`](scripts/banc-clim-references-manquantes.mts)). Même conclusion que le chauffage le 15/09. **Si la question revient, relancer le banc avant de s'engager** — elle ne redeviendra intéressante que si une référence se met à concentrer.
- 🟡 **`prix_materiel` porte 19 références dont `perime_le` au 15/12/2026.** Le relevé date du 15/09 et la règle prévoit une re-vérification trimestrielle. **Passé cette date, `estPerimee` les écarte** et les 34 % de couverture clim tombent à zéro — en silence. À relever avant décembre, ou à mesurer pour décider si la date doit être repoussée.

---

## 🟢 PLAN D'ACTION ISSU DU GOLD STANDARD (2026-09-16, consigne Johan)

> *« Il suffit de collecter tout ce qui a été fait et transformer cette information en actions. Plus de fuite en avant, on capitalise l'existant. »*

**Constat de départ, mesuré** : 28 outils de mesure écrits en 6 jours, 119 items ouverts ici, et **55 décisions d'expert que rien ne rejouait**. On produit, on ne consolide pas.

**La récolte** : les 44 notes d'expert de `analysis_corrections` ont été classées par cause citée. Une famille écrase toutes les autres :

| Cause citée par l'expert dans ses notes | Fois |
|---|---:|
| **Faux rapprochement (matching)** | **28 / 44** |
| ** · dont explicitement « forfait vs métrique »** | **13** |
| Acompte / échéancier | 18 |
| Faux ROUGE (verdict trop dur) | 10 |
| Entreprise / statut juridique | 10 |
| Fourchette catalogue fausse | 3 |

⚠️ Classification par mots-clés sur du texte libre : **c'est un indicateur, pas une vérité**, et une note peut compter dans deux familles. Ce qu'on en retient est l'ordre de grandeur, pas le chiffre exact.

🔴 **Johan a écrit « forfait vs métrique » TREIZE FOIS EN UN MOIS** — et c'est exactement le devis DESMARIS du 16/09 au soir. Le signal était dans les données depuis des semaines ; il n'avait jamais été agrégé.

### Les actions, dans l'ordre — chacune s'appuie sur du matériel qui existe déjà

- [x] ~~**1. NE JAMAIS ADDITIONNER UN TARIF UNITAIRE ET UN FORFAIT**~~ — ✅ **FAIT le 2026-09-16** : `bornesMarche()` dans [`surcoutServeur.ts`](src/lib/analyse/surcoutServeur.ts), branchée aux **4 sites** qui produisent un chiffre affiché (2 serveur, 2 client), 9 tests dédiés. Le choix dépend de l'unité de la LIGNE : tarif métrique + quantité métrique → unitaire, sinon → forfait. Mesuré : **53 groupes changent sur 21 devis · 2 postes deviennent accusés · 0 cesse de l'être**, les 2 relus (2 en confiance non haute donc sans verdict affiché, 1 légitime à 71 €/ml contre un marché 15-50).
  - 🔴 **ET LE REJEU DES 55 DÉCISIONS N'A PAS BOUGÉ : toujours 31 accords / 11 défauts vivants.** Le correctif est juste et ne referme aucun cas de l'étalon — leurs causes sont ailleurs. À dire tel quel plutôt que de le présenter comme un progrès de l'étalon.
  - ⚠️ Piège rencontré, documenté dans CLAUDE.md : ma 1re version comparait « u » et « unité » **littéralement** → 5 postes accusés à tort. Vu par la mesure, pas par la relecture.

- [ ] 🟡 **1bis. DEUX SITES ADDITIONNENT ENCORE, DÉLIBÉRÉMENT** — `supabase/functions/analyze-quote/verdict-utils.ts:297` (edge **Deno**, ne peut pas importer depuis `src/` — recopier la règle serait exactement l'erreur qu'on évite : il faudrait la déplacer dans un module partagé ou l'importer via `_shared/`) et `src/components/landing/DevisCalculatorSection.tsx:96-98` (calculette de la landing, aucun verdict opposable — impact cosmétique). Aucun des deux ne produit un montant affiché sur une page d'analyse.

- [x] ~~**2. REJOUER LES 55 DÉCISIONS D'EXPERT**~~ — ✅ **FAIT le 2026-09-16**, banc [`banc-rejeu-decisions-expert.mjs`](scripts/banc-rejeu-decisions-expert.mjs). Résultat : **31 accords · 11 défauts encore vivants (9 jamais corrigés + 2 RÉGRESSIONS après validation) · 11 écarts à relire · 2 correctifs effectifs**. Les 2 régressions (*Renov’Toitures* validé, *Mélier Cognac* rejeté) inventent 1 504 € et 2 161 € là où l'expert avait endossé 0 €. Détail dans CLAUDE.md. **À relancer après chaque correctif du chiffrage.**

- [x] ~~**2bis. TRAITER LES 11 DÉFAUTS ENCORE VIVANTS**~~ — ⚠️ **LE CHIFFRE ÉTAIT FAUX, corrigé le 2026-09-17.** Le banc comparait des MONTANTS quand l'expert avait jugé des POSTES : **24 des 31 postes accusés (77 %, 19 226 €) n'ont jamais été soumis à un humain** — l'expert avait annulé un montant anonyme, d'avant le correctif du 05/09. Les « 2 régressions » annoncées (*Renov'Toitures*, *Mélier*) **n'en sont pas**. Banc corrigé (`memes-postes.mjs` partagé) ; détail dans CLAUDE.md.

- [ ] 🔴 **2bis-A. LES 8 POSTES RÉELLEMENT RÉACCUSÉS — le seul compteur d'anti-régression qui tienne** : **4 devis · 8 postes · 6 857 €**, tous vérifiés un par un contre les anomalies annulées (zéro faux positif). Deux causes, nommées par l'expert lui-même :
  - **Fourchettes catalogue trop basses** (*Maison Bois*, 2 postes, 2 642 €) — « alu CETAL 20 ans **250 €/ml OK**, muret **180 €/m² OK** » quand le catalogue plafonne à 145 et 115. C'est du **sourcing**, pas du moteur : instruire `cloture_aluminium_lames` et `mur_parpaing_20` (⚠️ cette dernière est déjà signalée en doublon vivant avec `mur_parpaing_20_construction`).
  - **Un dépassement de 18 à 25 % du plafond n'est pas une surfacturation** (*Grosbois*, 3 postes, 314 € = **1,5 % du devis** ; et la porte Bel'm de *25030* à ×2,0, « moitié haute mais normal »).
  - ✅ **LES TROIS SEUILS SONT MESURÉS ET RÉFUTÉS (17/09)** — `banc-seuil-poste.mjs`, 142 analyses / 335 postes. Les deux populations se **superposent** : *Faux plafond* ×1,20 endossé contre *Robinetterie* ×1,18 annulée ; 168 € endossés contre 39 € annulés ; 0,15 % du devis endossé contre 0,18 % annulé. Sauf au plancher 150 € (troc 2:1 sur 27 observations), **chaque seuil coûte plus qu'il ne rapporte**. Détail et tableau dans CLAUDE.md. **Le discriminant est la qualité de la RÉFÉRENCE, pas la taille de l'écart.**
  - [x] ~~**Fourchette `cloture_alu_lames`**~~ — ✅ **SOURCÉE ET CORRIGÉE le 17/09** (migration `20260917100000`) : 55-92-145 → **150-230-330 €/ml HT**, deux sources nommables, plafond retenu = le plus bas des deux. Notre plafond était **sous le plancher du marché**. Mesuré avant application : −3 528 €, **0 poste nouvellement accusé**. ⚠️ Piège HT/TTC au cœur du sourcing : les deux pages annoncent « 175-400 », l'une en HT l'autre en TTC.
  - [x] ~~**Fourchette `mur_parpaing_20`**~~ — ✅ **SOURCÉE : elle est JUSTE, on n'y touche pas.** travauxavenue.com donne « élévation parpaings 20 cm : **55 à 115 €/m²** » — mot pour mot notre fourchette. **Le sourcing donne tort à l'expert sur ce poste** (sa note disait « muret 180 €/m² OK »). Le vrai sujet est un écart de **PÉRIMÈTRE** : notre entrée chiffre l'élévation seule, le devis comprend fondation + arase. Détail dans CLAUDE.md.
  - [ ] 🟡 **Trou de catalogue à instruire : « muret de clôture en parpaing (fondation comprise) »** — au même titre que le trou « enduit chaux » du 11/09. Recalculé au bon périmètre (élévation + semelle 45-95 €/ml, même source), le devis Maison Bois tombe au milieu de 1 499-3 149 €. ⚠️ **Ne PAS remonter `mur_parpaing_20`** pour y arriver : ce serait fausser une entrée correcte et absoudre tous les murs de bâtiment. ⚠️ Vérifier le risque d'aimant (`banc-entrees-aimant`) avant de livrer : « muret » et « clôture » sont assez spécifiques, mais ça se mesure.
  - [ ] 🟡 **Quasi-doublon repéré au passage** : `mur_parpaing` « Mur parpaing (hors enduit) » **78-120-162 €/m²** contre `mur_parpaing_20` « Mur parpaing 20 cm (fourni+posé) » **55-80-115**. Même ouvrage, même unité, fourchettes divergentes — à trancher **sur sources**, comme les deux doublons du 10/09. ⚠️ L'usage ne fait pas la justesse.

- [ ] 🟡 **2bis-B. LES 7 DEVIS « JAMAIS JUGÉS » — feuille de relecture ENVOYÉE à Johan le 17/09** : 23 postes, générés par [`feuille-relecture-postes.mjs`](scripts/feuille-relecture-postes.mjs) (prix unitaire facturé face à notre fourchette + la ligne telle que l'artisan l'a écrite + la note d'époque en repli). ⚠️ **La feuille ne va JAMAIS dans le dépôt** — lignes de clients réels et tarifs d'artisans identifiables, dépôt public (même règle que l'étalon du 10/09) ; la sortie par défaut est dans `.gitignore`.
  - ✅ **SOURÇAGE IA LIVRÉ le 17/09** (`sourceur-prix-ia.mjs`) — Johan n'étant pas spécialiste des prix, une IA les **source** (elle ne juge pas ; le verdict se calcule). Témoin à double sens : **74 % d'accord, et il discrimine**. Résultat sur les 21 postes restants : **8 OK · 8 écarts confirmés · 5 non concluants**. Rapport envoyé pour validation du **PÉRIMÈTRE** (pas du prix).
  - [x] ~~**Validation + injection**~~ — ✅ **FAIT le 17/09**. Johan a tranché 14 postes sur 21 (7 restent hors étalon : sourçage récusé ou « je ne sais pas »). Versés dans `analysis_corrections.corrected_anomalies` par [`injecter-postes-tranches.mjs`](scripts/injecter-postes-tranches.mjs). ⚠️ **AUCUNE ligne créée, 4 lignes ENRICHIES** : la table compte exactement 55 décisions, et ce nombre est lu comme « 55 revues humaines » (seuil Phase C) — y ajouter des lignes le fausserait. ⚠️ **Seul le VERDICT est validé, pas le montant** : Johan a dit « il y a un écart », il n'a pas validé le chiffre qu'en tire l'IA (sur *Étude thermique* le sourçage donne 1 350 € contre 558 € au moteur). `ecart_valide` n'est renseigné que pour les OK (0) et quand l'expert donne lui-même le barème (bordurette).
  - 🟢 **LE BANC LIT DÉSORMAIS CES VERDICTS PAR POSTE** (`postesTranchesApresCoup`) et rend la mesure la plus directe qu'on ait : **4 postes accusés à tort (1 945 €) · 1 poste manqué**. C'est ce chiffre qui doit baisser.
  - 🔴 **MAIS CE COMPTEUR EST AVEUGLE À UNE CORRECTION DE CATALOGUE** (relance du 17/09 après deux jours de sourcing : **inchangé**, 1 945 €). Les prix sont figés dans chaque analyse. Le second banc [`banc-rejeu-catalogue-actuel.mjs`](scripts/banc-rejeu-catalogue-actuel.mjs) répond à l'autre moitié : avec le catalogue d'aujourd'hui, **5 857 € → 2 960 €**, 3 postes éteints, le parquet ramené à 509 €, et *Pose faïence murale* classée « non re-tarifable » (son entrée a été supprimée le 10/09). **Les deux bancs se lisent ensemble** — l'un mesure le stock tel qu'il est, l'autre ce que produirait le catalogue actuel.
  - [ ] 🟡 **Les 6 postes encore accusés après rafraîchissement du catalogue** : *Pose porte entrée* 1 259 € · *Mur parpaing 20 cm* 878 € · *Parquet stratifié* 509 € (résidu légitime : 8 mm à 75,66 €/m² au-dessus du plafond standard de 70) · *Isolation sous rampant* 175 € · *Robinetterie* 100 € · *Raccordement lave-linge* 39 €. ⚠️ Le parpaing est un écart de **PÉRIMÈTRE** (fondation), pas de fourchette — entrée « muret de clôture » à créer, déjà au backlog ci-dessus. Les trois petits (Grosbois, 314 € = 1,5 % du devis) sont ceux dont les trois seuils ont été **mesurés et réfutés** le 17/09 : ne pas y revenir par un seuil.

- [x] ~~**2bis-C. LES 4 POSTES ACCUSÉS À TORT**~~ — ✅ **LES 4 FOURCHETTES SOURCÉES le 17/09** (migration `20260917160000`). *Parquet stratifié* 31-58 → **33/48/70** · *Faïence SDB* 45-120 → **45/90/140** · *Isolation plancher polystyrène* 12-32 → **15/26/40** · *Pose panneaux OSB* 10-26 → **18/32/50**. Plus `parquet_stratifie_premium` 43-79 → **44/65/90** (cohérence de gamme, effet mesuré NUL : aucune analyse ne la porte) ; `faience_mur_pose` **vérifiée et laissée telle quelle**. Mesuré avant application : **0 poste nouvellement accusé** sur les 5. Détail et sources dans CLAUDE.md.
  - 🔴 **CE QUE CE SOURCING A SURTOUT APPRIS : « deux sources nommables » validait des URL INVENTÉES.** Le contrôle testait la FORME (`url.startsWith("http")`). Vérification faite, **21 URL citées sur 21 ne répondaient pas** — 404 sur des domaines réels, et `www.vertex-ai.fr`, un domaine inexistant. La règle vit maintenant dans [`source-vivante.mjs`](scripts/source-vivante.mjs), partagée par les deux sourceurs : chaque URL est interrogée (403 accepté, 404 et domaine introuvable refusés). ⚠️ **Les fourchettes retenues ne sont PAS celles proposées par l'IA** : chaque page a été ouverte et relue à la main.
  - ⚠️ **ET LE SOURCEUR IA EST INSTABLE** : sur le témoin `mur_parpaing_20`, deux passages successifs donnent 75-110 puis 58-167 €/m². Il sert à trouver OÙ chercher, jamais à fixer une valeur.
  - ⚠️ **LE COMPTEUR DU BANC NE BOUGERA PAS**, et ce n'est pas un échec : les prix du catalogue sont **figés dans chaque analyse**. Rejeu du rapprochement contre le catalogue d'aujourd'hui (RPC réelle + embedding de production) : **3 postes sur 4 tombent à 0 €**, reste *Parquet stratifié* à **509 €** (1 589 avant) — un stratifié 8 mm à 75,66 €/m² dépasse légitimement le plafond « standard » de 70.
  - 🔴 **Le poste *Pose faïence murale* reposait sur une entrée SUPPRIMÉE du catalogue** (`carrelage_mural` 30-95, retirée le 10/09 comme doublon). Rejeu : la ligne part aujourd'hui sur `faience_mur_pose` (**pose seule**, 0,826) devant `faience_salle_de_bain` (fourni+posé, 0,790) — mais la garde `tarif_main_doeuvre` du 15/09 l'écarte et rend 0 €. **Vérifié en rejouant la garde, pas en la relisant.**
  - [x] ~~**Trou de catalogue : « isolant polyuréthane sous dalle/chape »**~~ — ✅ **CRÉÉE le 17/09** (migration `20260917180000`, catalogue **925 → 926**) : `isolation_plancher_polyurethane` **28 / 38 / 50 €/m² HT**, fourni+posé, l'isolant seul. Les **3 gestes** sont faits : INSERT + `seed_market_prices_embeddings.mjs` + vérification en direct. Source principale = **le produit exact du devis** (panneau TMS Soprema 80 mm R=3,70, chausson.fr, 26,34 €/m² TTC = 21,95 HT).
    - 🔴 **Vérification refaite au SEUIL DE PRODUCTION (0,77), pas sur le top-1** : ma première passe annonçait « 1 ligne volée à tort » ; reclassée comme la prod, **1 seule des 8 lignes candidates est capturée ET chiffrée — la cible, à 0,805**, marge 0,0212 (3,5× le bruit). Les 2 autres captures sont à 0,767 et 0,730, **sous le seuil donc sans verdict**. Écart de la ligne : **1 589 € → 0 €**.
    - ⚠️ **Aimant vérifié sur TOUTE la famille** : les deux lignes d'isolant PU **extérieur** 40 mm du même devis restent sur `isolation_mousse_projetée` (0,782 vs 0,774). Marge de 0,008 seulement — à re-mesurer si on ajoute une entrée voisine.
    - 🟡 **À surveiller** : « Chape liquide avec isolant mousse projetée » (81 m²) est captée à **0,767**, à trois millièmes du seuil, et départagée sous le bruit. Périmètre faux (chape comprise, mousse projetée et non panneaux) mais **effet nul aujourd'hui** (43,75 €/m² sous le plafond de 50). Si elle franchit le seuil un jour, elle restera sans écart — risque borné.
  - [ ] 🟡 **Le libellé `pose_plaque_osb` dit « Pose » alors que le prix est fourni+posé** — le piège `nature_prix` du 10/09. ⚠️ **Ne PAS le renommer en retirant « Pose »** : c'est exactement le renommage annulé le 10/09 sur le carrelage (l'entrée devient plus GÉNÉRIQUE et capte les lignes qui disent le contraire). À instruire autrement (entrée jumelle « pose seule » ?).
  - 🟡 **Et 1 poste que le moteur N'ACCUSE PAS alors que l'expert dit surfacturé** : *Étude thermique RE2020* — il est en confiance `medium`, donc jamais chiffré en production.
  - 🟡 **Déjà visible sans attendre la relecture** : sur *25030*, « **Plancher poutrelles hourdis** » est rapproché d'« *Isolation plancher haut entre logements* » (4 158 €, confiance `medium`) — or la note d'époque dit « plancher hourdis ~88 €/m², cohérent ». Faux rapprochement probable.

- [ ] 🟡 **2ter. RELIRE LES 11 ÉCARTS SIGNIFICATIFS** — ni accord ni accusation franche : le moteur et l'expert divergent de plus de 10 %. À relire un par un avant d'en tirer une règle.

- [ ] ~~ancien libellé~~ - [ ] 🔴 **2. REJOUER LES 55 DÉCISIONS D'EXPERT CONTRE LE MOTEUR D'AUJOURD'HUI** — c'est le filet anti-régression promis depuis juin, et **la matière existe déjà** : `analysis_corrections` contient `original_conclusion` (ce que la machine disait) ET `corrected_verdict_*` / `corrected_surcout_*` (ce que l'expert a tranché). Aucun script ne les compare.
  - **Ce que ça donnerait** : pour chaque défaut corrigé à la main, le moteur actuel le reproduit-il encore ? C'est LA réponse à « a-t-on appris ? », et elle se calcule sans rien réécrire.
  - ⚠️ Attention au piège : les 36 conclusions `corrected` ne sont **pas** régénérées (filet du 04/09), donc leur conclusion stockée EST celle de l'expert. La comparaison utile est `original_conclusion` (machine d'alors) contre le rejeu du moteur d'aujourd'hui, pas contre le stocké.

- [ ] 🟡 **3. `forfait` NE DOIT PAS NEUTRALISER TOUTES LES CARTES — mesuré et écarté** — basculer `forfait` dans `MOTIFS_SANS_VERDICT_DE_PRIX` retirerait le verdict de **290 cartes sur 1 271 (23 %)**, pour **1,6 M€ de devis**. Or beaucoup sont légitimes : *fosse septique 8 823 € forfait* ou *PAC multi-split 3 300 € forfait* sont comparées à des entrées **qui sont elles-mêmes des forfaits**. **L'action 1 traite la vraie cause ; celle-ci est refermée.**

- [ ] 🟡 **4. FAIRE VIVRE LES 28 BANCS AU LIEU D'EN ÉCRIRE UN 29ᵉ** — chaque banc a répondu une fois à une question, puis plus personne ne l'a relancé. CLAUDE.md le dit déjà : *« tout chiffre de couverture tiré du stock est un chiffre d'archive »*. Les numéros cités dans la doc datent pour la plupart du 10-15/09.
  - **Ne PAS construire un orchestrateur** (ce serait la fuite en avant). Le geste utile est plus petit : quand une règle change, **relancer le banc qui l'a justifiée** et mettre le chiffre à jour dans CLAUDE.md, comme on l'a fait le 16/09 pour l'invariant d'affirmation.

---

## Scoring V3.x — qualité d'analyse (suite de la stabilisation 2026-05-11)

### P0 — Crédibilité produit critique

- [x] ~~**LES GARDES DE CHIFFRAGE NE TOUCHENT PAS LES CARTES DE POSTE (2026-09-15)**~~ — ✅ corrigé le jour même. La règle vit désormais une seule fois (motifNonChiffrable), appelée par le serveur ET par les cartes. Mesuré : 50 cartes sur 1 033 perdent leur accusation (4,8 %), toutes relues, zéro accusation légitime perdue. Détail et le piège de la fourchette résiduelle dans CLAUDE.md. ⚠️ Reste ouvert : `groupe_heterogene` garde sa rétrogradation en « légèrement élevé » plutôt que le doute total — à mesurer à part.

- [ ] 🟡 **DEUX DOUBLONS VIVANTS DU CATALOGUE, RÉVÉLÉS PAR L'ARBITRE IA (2026-09-15)** — même ouvrage, même unité, fourchettes divergentes :
  - `mur_parpaing_20` « Mur parpaing 20 cm (fourni+posé) » **55-115 €/m²** contre `mur_parpaing_20_construction` « Construction mur parpaing 20 cm (fourni+posé) » **55-128**
  - `cloison_placo` « Cloison placo » **40-95 €/m²** contre `cloison_placoplatre` « Cloison plâtre BA13 (fourni+posé) » **35-88**

  ⚠️ **La passe de déduplication du 10/09 les avait ratés**, et la raison est réutilisable : elle comparait des LIBELLÉS, or ceux-ci ne diffèrent que par un mot de tête (« Construction », « plâtre BA13 »). Un détecteur de doublons doit regarder le périmètre et l'unité, pas la chaîne de caractères. ⚠️ Trancher **sur sources**, jamais à l'usage : le 10/09 a montré que l'entrée la plus utilisée du stock était la fausse. ⚠️ Vérifier aussi si l'entrée est **éditoriale** (publiée sur le site via `generate-reference.ts`) avant de toucher à sa fourchette.

- [ ] 🟢 **LE SEUIL DE LA PHASE C EST FRANCHI, ET PERSONNE NE L'AVAIT VU (2026-09-16)** — `analysis_corrections` compte **55 décisions d'expert** ; la Phase C (validation automatique contrôlée) est conditionnée depuis juin à « 50+ revues humaines accumulées ». **La condition est remplie.** À arbitrer : ouvre-t-on la calibration confiance-IA-validatrice contre l'humain, ou le seuil était-il un proxy qu'il faut réévaluer ? ⚠️ Rappel de la mesure du 30/08 : le relecteur IA **ne discrimine pas** (« corriger » sur 37/37 du gold standard ET 15/16 des témoins) — rouvrir la Phase C exige de lui demander des **affirmations vérifiables en code**, pas un jugement global.

- [ ] 🔴 **NOTRE PROPRE REJEU A NOYÉ LA FILE DE REVUE (2026-09-16, correction Johan)** — 76 analyses en `pending_review`, mais **72 ont vu leur conclusion régénérée le 15/09** par la passe de masse, et **65 des 76 devis datent d'avant août**. Ce n'est PAS un arriéré d'utilisateurs : c'est l'effet documenté de la Piste C (« les analyses à signaux risqués repassent en `pending_review` à leur première revisite »). **La vraie file actionnable, ce sont les ~11 analyses de septembre**, et elles sont invisibles au milieu du reste.
  - 🔴 **Le mode silencieux du 15/09 a résolu le mauvais problème.** Il évitait de RÉVEILLER Johan et Julien par e-mail — ce qu'il a bien fait. Il n'évitait pas de **polluer la file**, qui est précisément l'outil de travail de la revue. `/admin/reviews` est aujourd'hui inexploitable pour ce à quoi il sert.
  - **Deux options** : (a) distinguer en base « signalée à la première analyse » de « re-signalée par un rejeu » (colonne ou marqueur dans le déclencheur) et filtrer l'écran par défaut sur la première ; (b) repasser en masse les 72 rejeux à `auto_approved` — ⚠️ mais on perdrait les vrais signaux qu'ils portent peut-être, puisqu'on ne sait pas lesquels étaient déjà `pending_review` avant le 15/09.
  - ⚠️ **Et la leçon vaut au-delà de cette file** : `count(review_status='pending_review')` est un chiffre exact et trompeur — il mélange deux populations. **Tout compteur de file doit être ventilé par date de (re)génération avant d'être interprété.** J'ai moi-même lu ces 76 comme un arriéré alors que je les avais créées la veille.

- [ ] 🔴 **BRANCHER (OU ENTERRER) `BUGS-A-CORRIGER.md` (2026-09-16)** — le fichier est cité **uniquement dans des commentaires** ; **aucun test ne le lit**, dernière modification **27 août**, et aucun incident de septembre n'y figure. Or ce fichier prescrit depuis juin : « chaque bug → entrée dans `BUGS-A-CORRIGER.md` qui devient un cas test du filet anti-régression ».
  - **Deux options honnêtes** : (a) en faire une vraie table de cas (un JSON lu par un test qui rejoue chaque incident), (b) le supprimer et assumer que le filet, ce sont les tests unitaires par module — qui existent et qui sont désormais lancés en CI. **Ce qu'il ne faut plus, c'est une règle écrite que rien n'applique.**

- [ ] 🟡 **`gmc-stripe-config.ts` LIT ENCORE DES SECRETS SERVEUR VIA `import.meta.env` (2026-09-16)** — la règle du 08/09 dit : « côté serveur, un secret se lit au RUNTIME via `process.env` ». Ce module est explicitement « importé côté SERVEUR uniquement » et lit 5 variables Stripe via `import.meta.env`. Les lectures ont été rendues **paresseuses** le 16/09 (ce qui a réparé le test cassé), mais **le fond n'est pas corrigé** : si une variable est ajoutée ou tournée sans rebuild, `gmcPaymentsLive()` repasse à faux et le checkout GMC se désactive **en silence**.
  - ⚠️ **Ne pas corriger à la va-vite** : il faut vérifier les 4 routes dépendantes et l'environnement de build Vercel. Et **ne jamais indexer dynamiquement** `import.meta.env[cle]` — Vite n'inline que les accès littéraux.

- [ ] 🟡 **`package-lock.json` A DÉRIVÉ — `npm ci` ÉCHOUE (2026-09-16)** — il manque les paquets optionnels d'esbuild des autres plateformes (`@esbuild/linux-x64`, `win32-x64`, `darwin-arm64`…), le verrou ayant été généré sous Windows. Constaté à la première mise en service de la CI : `npm ci` échoue en 9 s, avant le moindre test. Contourné par `npm install` dans [`tests.yml`](.github/workflows/tests.yml), ce qui fait perdre la reproductibilité exacte des installations.
  - **À régénérer proprement** : supprimer `node_modules` + `package-lock.json`, `npm install`, vérifier que le build et les 560+ tests passent, committer le verrou seul. ⚠️ Toucher aux dépendances mérite son propre commit — pas un fourre-tout de CI.

- [ ] 🟡 **FAIRE BLOQUER LA CI, OU ASSUMER QU'ELLE N'EST QU'UN SIGNAL (2026-09-16)** — [`tests.yml`](.github/workflows/tests.yml) produit une pastille rouge sur le commit, mais **ne bloque pas le déploiement** : celui-ci vient de l'intégration Git de Vercel, indépendante des Actions. Pour bloquer réellement : branch protection rule sur `main`, ou « Ignored Build Step » côté Vercel. ⚠️ Décision à prendre en connaissance de cause — le workflow `vercel-ci-deploy.yml` ne déploie rien (ses secrets `VERCEL_*` ne sont pas configurés, mesuré le 08/09).

- [ ] 🟡 **`forfait` DOIT-IL COUPER LE VERDICT DE LA CARTE ? — décision produit (2026-09-16, devis DESMARIS)** — le 15/09 on a choisi que NON, au motif que « le forfait a déjà son libellé propre, plus précis que *non vérifiable* ». Le devis DESMARIS montre le coût de ce choix : **le libellé « forfait » n'apparaît nulle part sur la carte, c'est « Anomalie marché » qui s'affiche**, au-dessus d'un titre qui dit l'inverse. Le correctif de couverture du 16/09 supprime la contradiction côté TITRE (on ne dira plus « cohérent »), mais la carte continuera d'accuser sur un poste que le serveur refuse de chiffrer.
  - ⚠️ **À MESURER AVANT DE TRANCHER** : basculer `forfait` dans `MOTIFS_SANS_VERDICT_DE_PRIX` changerait le badge de dizaines de postes. Le banc existe ([`banc-cartes-non-chiffrables.mjs`](scripts/banc-cartes-non-chiffrables.mjs)) — il avait mesuré 50 cartes sur 1 033 pour les trois autres motifs.
  - ⚠️ **Et la vraie question est peut-être en amont** : sur ce devis, la fourchette affichée (280-1 080 €) est une **somme absurde** — prix au ml × « 1 Ens » + forfait. Une entrée catalogue qui porte À LA FOIS un tarif unitaire et un forfait ne devrait jamais voir les deux additionnés.

- [ ] 🟡 **LA PROPOSITION DE COMPARAISON RATE LES DEVIS DÉPOSÉS À QUELQUES MINUTES D'INTERVALLE (2026-09-16, retour Johan)** — le même soir, un utilisateur dépose un devis DESMARIS (2 395 € HT, sortie de cheminée) puis, **6 minutes plus tard**, un devis ISLER (2 910 € HT, tubage/gaine inox Ø150, débistrage, évacuation poêle) — deux fois. **Aucune proposition de comparaison.**
  - **Vérifié en rejouant la règle réelle** (`trouverDevisApparente`) : entreprises différentes ✓, rapport de montants **×1,22** (≤ 2) ✓, fenêtre de 30 jours ✓ — mais **recouvrement lexical 0,26 contre un seuil de 0,40**. Seuls 5 mots sur 19 sont communs (`evacuation, conduit, inox, coude, nettoyage`).
  - 🔴 **LA CAUSE EST CONNUE ET DÉJÀ DOCUMENTÉE AILLEURS : le lexical est un signal faible** (« le lexical est épuisé comme levier de rapprochement », 11/09). Les deux devis décrivent le même ouvrage avec des vocabulaires disjoints — DESMARIS dit *sortie, solin, chapeau pare-pluie, support mural* ; ISLER dit *gaine, bride, tampon, longueur noire, plaque de propreté*. ⚠️ La formule divise déjà par le PLUS PETIT ensemble : l'asymétrie 1 ligne / 18 lignes n'est pas en cause.
  - 🟢 **LE SIGNAL LE PLUS FORT N'EST PAS UTILISÉ** : deux devis déposés par la même personne **à 6 minutes d'intervalle** ne sont presque jamais sans rapport. Aujourd'hui la proximité temporelle sert de FILTRE (fenêtre 30 jours), jamais de PREUVE. Piste : abaisser le seuil de recouvrement quand l'écart est de quelques minutes — ⚠️ **à mesurer sur les 585 paires du stock** avant de livrer, la règle du 08/09 ayant été calibrée dessus et le coût d'une fausse proposition étant explicitement documenté.
  - ⚠️ **Et ce n'est pas certain que ce soit la même prestation** : ISLER inclut un débistrage et l'évacuation d'un poêle au RDC que DESMARIS n'a pas. La proposition doit rester une QUESTION, jamais une affirmation.

- [ ] 🟡 **LE LEVIER « DEVIS > 12 MOIS » NE SE DÉCLENCHE PAS SUR DES DEVIS DE 2024 (2026-09-16)** — trouvé par [`banc-perte-phrase-intro.mjs`](scripts/banc-perte-phrase-intro.mjs), qui cherchait autre chose. Sur **3 analyses** dont le devis date de 2024, l'âge n'était mentionné QUE dans la phrase d'intro écrite par Gemini : aucun levier `devis_ancien`, alors que `leviersBuilder` en prévoit un. Vérifié sur `Devis_DUBOIS_store.pdf` et `devis demo.pdf` — leviers identiques (`clause_rouge, acompte, second_avis`), pas d'entrée d'âge.
  - **Parade posée le jour même** : `phraseIntroSansReference` reprend l'année, donc le fait ne disparaît plus de la page. **Mais la cause n'est pas traitée** — le levier devrait se déclencher, et il ne le fait pas sur le chemin normal.
  - ⚠️ À instruire depuis `leviersBuilder` : quel signal alimente `devis_ancien`, et pourquoi est-il vide ici alors que `devisAgeWarning` est bien calculé côté `conclusion.ts` ?

- [ ] 🟡 **5 CONCLUSIONS DU STOCK AFFIRMENT ENCORE UN PRIX CORRECT SANS RÉFÉRENCE (2026-09-16)** — le correctif `phraseIntroSansReference` ne vaut que pour les analyses À VENIR : `ENGINE_VERSION` est délibérément inchangée (on ne bumpe pas pour un correctif de texte, et un bump écraserait les 33 conclusions `corrected` — filet du 04/09). Les cinq pages concernées portent donc toujours leur phrase d'origine, dont `Devis-DEV-202608-1.pdf` (« un devis qui se situe dans la norme », 0 % de couverture) et le CCMI `DEVIS DALENCON 2 (1).pdf` (« présente un prix cohérent », 4,38 %).
  - **Deux options, à trancher par Johan** : (a) un script de réparation chirurgical sur le modèle de [`retirer-marges-sans-levier-prix.mjs`](scripts/retirer-marges-sans-levier-prix.mjs) — à blanc par défaut, ne touche QUE `phrase_intro`, garde `corrected` ; (b) ne rien faire, le stock se régénérant au prochain bump de phase.
  - ⚠️ La liste exacte se réobtient par `npx tsx scripts/banc-perte-phrase-intro.mjs`.

- [ ] 🔴 **LA GARDE HORS-SCOPE EST UNE LISTE D'EXCLUSIONS — À REFAIRE EN CRITÈRE POSITIF (2026-09-16, retour Johan)** — mesuré : **13 documents sur 373 (3,5 %) hors périmètre, dont 10 automobiles**, et l'extraction n'en attrape que 3. Deux devis de sonorisation auto occupent la file de revue. Banc : [`banc-hors-scope.mjs`](scripts/banc-hors-scope.mjs), témoin 5/5 dans les deux sens.
  - **Le correctif de fond** : remplacer dans `extract_v2.ts` (~l.398) l'énumération « réparation véhicule / électroménager / achat de biens / … » par la question **positive** — *les prestations portent-elles sur un bâtiment ou son terrain ?* — avec les faux amis nommés (« câblage », « caisson », « installation », « sur mesure » existent dans les deux mondes ; ce qui tranche est l'OBJET, pas le verbe).
  - ⚠️ **À MESURER AVANT DE LIVRER, ET LE BANC DIT DÉJÀ POURQUOI** : le juge, avec cette consigne positive, écarte quand même **~17 documents qui sont dans notre périmètre** (paysagisme, piscine, clôture, pergola, ANC — tous ont leur métier au catalogue). Livrer sans mesurer ferait refuser des devis de piscine. Le banc fournit la liste.
  - ⚠️ **La garde se trompe aussi dans l'autre sens** : un devis de rail d'éclairage TRACK UNO a été classé `achat_biens` et refusé — la fourniture seule est un cas légitime (`supply-only.ts`).
  - **Et le disclaimer de dépôt ne parle que des FICHIERS** (« PDF, JPG ou PNG • Maximum 10 Mo »), jamais du CONTENU. À compléter dans `NewAnalysis.tsx` — décision Johan.

- [ ] 🟡 **TROIS AUTRES PAIRES REDONDANTES, ET UNE ENTRÉE MAL CLASSÉE (2026-09-16)** — trouvées par [`banc-prix-sur-un-fil.mjs --juger-doublons`](scripts/banc-prix-sur-un-fil.mjs), qui détecte les doublons **par ce qu'ils attirent** et non par leur nom. Elles coûtent **12 747 €** de devis aujourd'hui, sur des postes dont le prix est AFFICHÉ :
  - *Ponçage vitrification* **25-70 €/m²** contre *Traitement parquet vitrification* **10-28** (×2,5 — 3 postes, 9 080 €)
  - *Nettoyage fin de chantier professionnel* **3-14 €/m²** contre *Nettoyage fin de chantier* **2-8** (8 postes)
  - *Pose porte intérieure* **120-450 €/u** contre *Pose porte intérieure (hors fourniture)* **120-280** (1 poste) — ⚠️ vérifier le libellé ET les notes, `nature_prix` est une présomption (règle du 10/09)
  - **`depose_cloture_forfait`** (150-600 € forfait) est classée **`metier=electricite`** — manifestement faux — et porte encore « fourchette initiale à ajuster (Julien) » du mining du 2026-08-27, jamais relue. Elle fait doublon avec `depose_cloture` (12-35 €/ml).

  ⚠️ **Trancher sur SOURCES** ; le juge n'a produit qu'une liste courte. ⚠️ Et ne pas généraliser : le même banc trouve **8 paires réellement différentes** (24 027 €) où le catalogue a raison — là le problème est le départage, pas la redondance.

- [ ] 🟡 **7 % DES PRIX AFFICHÉS REPOSENT SUR UN DÉPARTAGE IMPOSSIBLE (2026-09-16)** — 39 postes sur 598, **78 676 €**, où l'écart de similarité entre la 1re et la 2e entrée est **sous le plancher de bruit de l'espace vectoriel** (0,006, mesuré le 10/09) alors que leurs plafonds divergent d'au moins 50 %. Le montant affiché y est tiré au sort entre deux valeurs.
  ⚠️ **Ce n'est PAS une invitation à toucher au seuil de confiance** : il s'agit de la marge entre deux candidats, pas de leur similarité absolue. Le seuil de marge a été mesuré et refusé le 11/09 (124 prix retirés sur 537). Ce qui reste ouvert est la déduplication (ci-dessus) et, pour les 8 paires réellement distinctes, un départage par un signal non vectoriel — piste fermée sur le lexical, le prix et l'unité le 11/09.
  🟢 Contrepartie à garder en tête avant d'y investir : la marge médiane sur les prix affichés est de **0,0137**, soit plus du double du bruit — **93 % des prix sont proprement départagés**.

- [ ] 🟡 **`/api/analyse/[id]/conclusion` NE VÉRIFIE PAS LA PROPRIÉTÉ (constaté 2026-09-15)** — n'importe quel jeton valide plus l'UUID d'une analyse suffit à la lire et à la régénérer. La seule protection est l'imprévisibilité des UUID. C'est ce qui rend le rejeu de masse possible avec un seul jeton admin, donc le corriger demande de **préserver l'accès admin aux analyses de tiers** (cf. le correctif `AnalysisResult.tsx` du 2026-05, même sujet) : vérifier `user_id` OU rôle admin, jamais `user_id` seul — sinon on casse l'écran de revue.

- [ ] **V3.4 Niveau 2 — Scoring d'hétérogénéité des groupes (1 j dev)** : remplacer le bool brut `isLikelyHeterogeneousGroup` (Niveau 1, déjà déployé V3.3.4) par un score 0-1 basé sur l'analyse linguistique des descriptions. Algorithme : extraire les mots-clés du `job_type_label`, calculer pour chaque devis_line le `matchScore = |keywords ∩ description| / |keywords|`, moyenne pondérée par montant → `homogeneityScore`. Construire en parallèle le référentiel mots-clés par job_type (carrelage_* : carrelage, dalle, céramique, faïence, carreau, joint, colle ; chape_* : chape, ciment, mortier, ragréage ; etc.). Avantage : graduation au lieu de binaire, couvre les cas où le prix unitaire est élevé mais légitime (carrelage premium dans un groupe homogène). Stub déjà documenté en commentaire dans `src/pages/api/analyse/[id]/conclusion.ts`.

- [ ] ⚠️ **À RE-SCOPER — probablement obsolète (2026-06-15)** : depuis l'écriture de cet item, le pipeline est passé au matching VECTORIEL ligne-par-ligne (`MARKET_MATCHER_VECTORIAL`, « 1 ligne = 1 match », `ENGINE_VERSION` 3.5.13) qui **court-circuite le groupement Gemini multi-lignes** visé ci-dessous. Les faux positifs actuels viennent de la confiance du match vectoriel (gardes V3.5.11/.13), pas du groupement. Avant tout dev : confirmer le flag prod + auditer les vraies sources de faux positifs du vectoriel. **Item d'origine conservé pour contexte :** **V3.5 Niveau 3 — Refonte du prompt Gemini de groupement (2-3 j dev)** : auditer `supabase/functions/analyze-quote/market-prices.ts` (prompt actuel de groupement), renforcer les règles d'exclusivité : chape ciment JAMAIS dans groupe carrelage, primaire JAMAIS dans groupe revêtement, IP14/IPE/IPN = structure acier (jamais dans revêtement), coupe dalles OK avec carrelage forfait du même poste. Ajouter exemples few-shot. Tester sur les 4 PDFs Desktop (Kern, Zitelec, multi-devis, SDB). Test de non-régression sur les 200+ analyses passées (chercher les groupes qui changent de composition). À sortir en feature flag pour rollback facile. **Vraie solution de fond** — élimine la cause RACINE des faux positifs, pas juste les symptômes. Niveau 1 et 2 deviennent moins critiques (mais restent comme défense en profondeur).

- [x] ~~**RÉÉCRIRE LES LIBELLÉS DU CATALOGUE (2026-09-10)**~~ — **mesuré et abandonné**. Deux formulations construites et rejouées sur les 1 929 lignes du stock : « Objet — action » perd (0 gain, 18 pertes, toutes les similarités baissent) ; « Objet (action) » gagne 0,7 % de la bande moyenne au prix de 4 faux rapprochements sur 28. Détail et chiffres dans `CLAUDE.md`. **Ne pas rouvrir sans une idée neuve** : le harnais [`scripts/rejeu-rapprochement.mjs`](scripts/rejeu-rapprochement.mjs) permet de tester n'importe quelle proposition en une commande.

- [x] ~~**PERSISTER L'ÉTALON HUMAIN EN BASE (2026-09-10)**~~ — ✅ fait le 2026-09-10 : table `match_gold_standard` (migration `20260910120000`, appliquée), 150 lignes importées dont **77 de consensus**, plus les scripts d'import et de notation. Repères à battre et détail : `DOCUMENTATION.md`. ⚠️ Deux migrations restent en attente et n'ont PAS été appliquées au passage (`20260907200000_observatoire_lignes`, `20260907220000_site_events`) — le CLI refonctionne, elles peuvent l'être quand on le décide. Item d'origine : — les 150 jugements de Johan vivent dans deux fichiers sur son poste (`relecture-reponses.json`, `relecture-rapprochement.cle.json`), ignorés par git parce qu'ils contiennent des lignes de devis de clients et que le dépôt est **public**. C'est le seul actif qui permette de mesurer la qualité du rapprochement : le perdre, c'est refaire un après-midi de relecture. **Table Supabase** (`match_gold_standard` : ligne de devis, texte de requête, candidats, réponse humaine, date, relecteur), plus un script d'import et un script de scoring. À faire avant toute modification du matcher.

- [x] ~~**RE-SOUMETTRE 11 LIGNES AU RELECTEUR (2026-09-10)**~~ — ✅ fait : 9 lignes sur 11 sont comblées, l'étalon passe de 55 % à **43 %** de lignes sans entrée valable et de 77 % à **81 %** de bonnes réponses en tête. ⚠️ **Réflexe à garder** : tout ajout au catalogue périme l'étalon sur les lignes qu'il comble — les re-soumettre, sinon le score sous-estime durablement. Item d'origine : — les 8 entrées ajoutées comblent 11 lignes que l'étalon classe encore « aucune entrée valable » : c'était vrai des cinq candidats de l'époque, faux depuis. Le score ne peut pas s'en apercevoir seul, donc il sous-estime le catalogue actuel. Les 11 : L007, L015, L021, L028, L051, L058, L061, L064, L098, L130, L141. Une seule question chacune, cinq minutes — après quoi le « 55 % de lignes sans entrée valable » redevient un chiffre juste.

- [x] ~~**COMPLÉTER LE CATALOGUE SUR LES TROIS FAMILLES NOMMÉES PAR LA RELECTURE (2026-09-10)**~~ — ✅ fait le 2026-09-10 pour les deux premières familles : 8 entrées ajoutées (migration `20260910140000`, catalogue 919 → 925), embeddings générés, remontée vérifiée en direct sur les lignes réelles, aucune régression au score. Les **prestations intellectuelles** sont écartées par une garde plutôt que tarifées (décision Johan). **Reste la 3ᵉ famille** : les autres lignes de chantier non-travaux — livraison, amenée-repli, location de matériel, pompe à béton, éco-participation, Dommage-Ouvrage. À décider séparément : les tarifer, ou les écarter comme les prestations intellectuelles. Item d'origine : — 36 % des lignes jugées n'ont **aucune** bonne réponse parmi les cinq candidats, et le relecteur a nommé les manques : (a) **les déposes** — 5 occurrences sur 150, le catalogue n'a presque que des poses ; (b) les **lignes de chantier non-travaux** (démarches administratives, Consuel, Dommage-Ouvrage, éco-participation, suivi de travaux, livraison, location de matériel) — une quinzaine d'occurrences : à décider si on les couvre ou si on les EXCLUT explicitement du chiffrage, ce qui serait plus honnête ; (c) des **variantes matière** absentes — gouttière aluminium (×2), menuiserie avec volet roulant intégré (×2). ⚠️ Chaque ajout se vérifie ensuite sur l'étalon, pas au jugé.

- [x] ~~**DEMANDER À L'UTILISATEUR SI LE MATÉRIEL EST FOURNI (2026-09-10)**~~ — **mesuré et abandonné.** La question n'atteint que **3,7 % des lignes** (58 sur 1 587, 54 278 €) : il faut que la ligne taise son périmètre, qu'elle touche une entrée existant en deux lectures, et que les deux lectures diffèrent. Une friction sur 100 % du parcours pour 3,7 % des comparaisons. **Ne pas rouvrir sans un chiffre neuf.** ✅ Ce que l'instruction a déterré a été corrigé : 8 des 17 paires étaient impossibles (fourni+posé ≤ pose seule), 44 lignes du stock et 46 468 € s'y comparaient en confiance haute → migrations `20260910180000` + `20260910190000`, **8 → 0**, catalogue 924 → 918. Détail et deux leçons réutilisables (le tag `nature_prix` est une présomption ; renommer une entrée la rend plus générique) dans `CLAUDE.md`.

- [ ] 🟡 **RESTES DE LA REPRISE DES PAIRES FOURNITURE/POSE (2026-09-10)** — trois points volontairement laissés hors du correctif, pour ne pas transformer une reprise bornée en chantier ouvert :
  - **« Faïence salle de bain (fourni+posé) » est à 45-120 €/m²** quand les sources publiques donnent 80-150 pour de la faïence fournie et posée. C'est désormais la seule entrée fourni+posé de la famille (son doublon a été supprimé) : elle mérite d'être re-sourcée. Même question pour « Carrelage standard (fourni+posé) » 46-94, qui est **publiée sur le site**.
  - **« Parquet collé » n'a plus d'entrée fourni+posé** : seules restent « Pose parquet collé (hors fourniture) » 25-55 et, pour d'autres produits, « Pose parquet contrecollé (fourni+posé) » 50-135 et « Pose parquet massif (fourni+posé) » 80-200. À combler si des lignes le réclament.
  - **Les lignes génériquement ambiguës restent un pari** : « Pose carrelage sol », sans quantité ni mention de fourniture, est rapprochée du tarif main-d'œuvre. Si la ligne comprenait en fait les carreaux, elle paraîtra chère — c'est la direction dangereuse (fausse accusation). Le filet actuel est `hasIncomparableUnit` (un tarif au m² n'est pas chiffré quand la ligne n'a pas de m²). **C'est exactement le doute que la question fourniture/pose devait lever, et qu'on assume de ne pas lever.**

- [x] ~~**RE-CLASSER LE TOP-5 AU LIEU DE PRENDRE LE TOP-1 (2026-09-10)**~~ — **mesuré le 2026-09-11 sur les quatre signaux annoncés, et refermé.** Banc livré : [`scripts/banc-reclassement.ts`](scripts/banc-reclassement.ts). Sur l'étalon humain la bonne entrée est dans le top-5 à **100 %** et en tête à **80 %** — neuf lignes à récupérer. Aucun signal ne les récupère : le lexical en sépare 3 sur 9 et pointe le mauvais candidat dans 2 (scoreur mesuré : **+2/−3** à poids 0,02, **+1/−5** à 0,05) ; l'unité n'en sépare aucune ; le prix en sépare 2 mais est **refusé sur le principe** — classer par « la fourchette contient le prix de la ligne », c'est choisir la référence qui flatte le devis. La marge 1er/2e sépare bien les distributions (0,0179 contre 0,0062) mais un seuil coûterait **23 % des prix affichés** sur le stock réel. Rien livré en production. Détail et leçons dans `CLAUDE.md`. **Rouvrable si l'étalon grandit** (le mode `--marge` est prêt) ou si un signal NOUVEAU apparaît — pas en re-réglant ceux-là.

- [x] ~~**RE-SOUMETTRE SIX LIGNES DE L'ÉTALON (2026-09-11)**~~ — ✅ fait pour cinq (L028, L097, L109, L150, L152) via [`scripts/resoumettre-etalon.mjs`](scripts/resoumettre-etalon.mjs), livré pour l'occasion. Résultat : lignes sans entrée valable **44 % → 38 %**, bonne réponse en tête **35/44 → 39/48**, témoins **13/17 → 14/18**. Quatre consensus, un désaccord assumé (L150). ⚠️ Réflexe à garder : tout ajout au catalogue périme l'étalon sur les lignes qu'il comble, et **re-soumettre = réécrire `candidats` + `reponse_ia` + `reponse_humaine` ensemble** (détail et piège dans `CLAUDE.md`). **Reste L114** ci-dessous.

- [x] ~~**L114 — RÉPONSE DE L'ÉTALON À CONFIRMER (2026-09-11)**~~ — ✅ tranché : Johan confirme **« aucune »**, l'IA aussi (« aucun poste ne correspond au scellement de tuiles en bas de pente ») → consensus. ⚠️ **Sa première réponse désignait un tarif de toiture entière au m² pour une ligne facturée au ml** ; ne pas l'enregistrer d'office a évité d'inscrire une bonne réponse fausse dans l'étalon, ce qui aurait faussé toutes les mesures suivantes. **Demander plutôt que supposer, quand la réponse contredit l'unité.** La famille qu'elle désignait est désormais couverte à moitié (cf. entrée ci-dessous).

- [ ] 🟡 **CATALOGUE — CE QUI RESTE APRÈS LA PASSE DU 2026-09-11** : trois familles écartées volontairement, à rouvrir si elles se répètent. **Coffret de communication VDI** (2 lignes) — le prix de pose n'est pas sourçable et « Coffret GTL » (150-480 €) couvre un périmètre très proche, risque de doublon. **Planelle de coffrage / about de plancher** (1 ligne, 809 €) — une occurrence ne fait pas une famille. **Scellement d'égout au ml** (L114, 15 €/ml) — la rive est désormais couverte (« Tuile de rive scellée au mortier », 40-90 €/ml), mais le scellement au mortier de tuiles DÉJÀ posées ne se source pas autrement que par un taux horaire. Trou assumé : la ligne sort à 0,749, donc « Prix non vérifiable » — honnête, mais non chiffré. ⚠️ Et trois des six fourchettes livrées sont signalées comme les moins sûres dans la migration (`sortie_cable`, `tuile_chatiere_douille`, `enduit_dressage_chaux`) : `last_reviewed_at` est NULL, elles attendent Julien.

- [x] ~~**MESURER L'IMPACT DE LA CATÉGORIE D'EXTRACTION (2026-09-11)**~~ — **mesuré, et rien n'est livré.** Retirer le suffixe « Catégorie : X » de la requête donne **39/48 contre 39/48** sur l'étalon de consensus : net nul. La règle affinée (garder la catégorie quand c'est une famille de métier, la retirer quand c'est un titre de section recopié du devis) gagnait **+2/−0** sur l'étalon — et le rejeu du stock la **réfute** : sur les 20 prix affichés qu'elle changerait, gemini-2.5-pro juge que la catégorie donne le meilleur poste 10 fois et le pire 4 fois. Banc : [`scripts/banc-categorie.mjs`](scripts/banc-categorie.mjs). Détail et leçons dans `CLAUDE.md`. **Ne pas rouvrir côté matcher.**

- [x] ~~**VOCABULAIRE FERMÉ POUR LA CATÉGORIE D'EXTRACTION (2026-09-11)**~~ — **mesuré le jour même, réfuté trois fois, rien livré.** Banc : [`scripts/banc-vocabulaire-categorie.mjs`](scripts/banc-vocabulaire-categorie.mjs). La liste fermée (33 métiers du catalogue) est parfaitement suivie mais **deux fois plus fausse** que ce qu'elle corrigeait (20 % contre 10 %) — parce que `market_prices.metier` est une clé de rangement qui agrège deux métiers (`placo_isolation` sur un plafond « sans isolant »), et que la catégorie est concaténée au texte embarqué. Sur le rapprochement : 7 contre 3 en faveur de la production. Contre l'étalon : 38/48 contre 39, et deux bonnes réponses sorties du top-5. ⚠️ **Et le résultat qui ferme le sujet** : une passe dédiée porte la justesse de 68 % à **95 %** et ne change que 10 références sur 100, arbitrées **3-3**. **Le contenu de la catégorie ne déplace pas le rapprochement** — seule sa présence compte. Détail et leçons dans `CLAUDE.md`.

- [ ] 🟡 **UNE CATÉGORIE PLUS JUSTE SERT AILLEURS QU'AU MATCHER (2026-09-11)** — retombée de la mesure ci-dessus, à ne pas perdre : une passe de classification dédiée fait passer la justesse de la catégorie de **68 % à 95 %**. Sans intérêt pour le rapprochement de prix (mesuré), mais `categorie` alimente [`detectChantierType.ts`](src/lib/analyse/detectChantierType.ts) — donc le `work_type` et les **pages chantier de l'observatoire**, dont la classification a déjà dû être corrigée le 07/09 (12 % du corpus mal classé). À mesurer **là-bas** avant tout développement : combien de devis changeraient de type de chantier, et dans quel sens. ⚠️ Ne pas justifier ce chantier par le matching : la mesure dit qu'il n'y gagnerait rien.

- [ ] 🟡 **UNE MARGE À RETIRER SUR UNE CONCLUSION `corrected` — DÉCISION JOHAN (2026-09-11)** — *DevisToiture Boxes.pdf* affiche encore « Marge de négociation estimée : 3 à 5 % en négociation courtoise » sous un motif qui parle d'acompte (35 %). Le correctif du jour l'a laissée intacte : la conclusion est en `review_status = "corrected"`, donc **réécrite par un humain**, et la règle du 04/09 les déclare intouchables — même quand la phrase fautive est manifestement un reste de la machine. Une commande si tu tranches : `node scripts/retirer-marges-sans-levier-prix.mjs --inclure-corrigees --appliquer`. ⚠️ Vérifier d'abord que l'expert n'a pas voulu cette marge.

- [ ] 🟡 **LE DÉCLENCHEUR PISTE C « ratio aberrant » IGNORE LA CONFIANCE (2026-09-11, revue NB-Al-Ajhoury)** — `detectReviewTriggers` arme une revue dès qu'un groupe dépasse 5× sa fourchette, **sans regarder si le rapprochement est fiable**. Sur le devis d'étanchéité signalé, le ratio de 7,6× était calculé contre *Nettoyage haute pression canalisations*, rapproché à **0,728 — donc sous le seuil de 0,77 et déjà écarté de tout affichage**. On met un devis en file d'attente humaine à cause d'un chiffre qu'on refuse par ailleurs de montrer. Correctif évident : ne compter que les groupes en confiance haute, comme le font déjà `computeServerSurcout` et le verdict expert depuis V3.5.13. ⚠️ **À mesurer avant de livrer** : combien de `pending_review` disparaîtraient, et vérifier qu'aucune revue utile n'est perdue — une garde se mesure contre les cas connus, jamais au jugé.

- [x] ~~**LE REPLI PAR NOM N'UTILISE PAS LE CODE POSTAL (2026-09-13)**~~ — **mesuré, réfuté deux fois, rien livré.** Sur les 17 cas réels du stock où le repli par nom a joué : **0 réparé, 0 cassé, 17 inchangés**, que le code postal vienne de l'entreprise ou du chantier. 9 requêtes filtrées sur 12 ne rendent aucun résultat. Banc : [`scripts/banc-repli-nom.mjs`](scripts/banc-repli-nom.mjs). ⚠️ Et le cas qui a lancé l'idée montre que le filtre aurait été **contre-productif** : l'artisan est immatriculé à 100 km de son chantier. Détail dans `CLAUDE.md`.

- [x] ~~**CHERCHER LA PERSONNE QUAND LE NOM COMMERCIAL NE DONNE RIEN (2026-09-13)**~~ — ✅ **livré le jour même**. Quatrième repli, après SIRET → SIREN → nom commercial. Mesuré sur les 17 cas réels : **2 des 7 ambiguïtés résolues, 0 contredite** (*Entreprise Fk* → KURTIS FORGEAS ; *HDH batiment* → ABDELKARIM BOUCHEIKH). Module [`repli-personne.ts`](supabase/functions/analyze-quote/repli-personne.ts) + 20 tests, banc [`scripts/banc-recherche-personne.mjs`](scripts/banc-recherche-personne.mjs). Deux gardes qui portent tout : **l'ordre** (placé trop tôt, il contredit la production sur un devis PORCELANOSA) et **le refus des homonymes cessés**. Détail et pièges dans `CLAUDE.md`.

- [x] ~~**RÉCUPÉRER UN SIREN DANS UN NUMÉRO DE LONGUEUR INATTENDUE (2026-09-13)**~~ — ✅ **livré le jour même**. `sirenParTroncature` retient les 9 premiers chiffres de toute longueur ≥ 10, **à condition qu'ils passent la clé de Luhn**. Mesuré sur 365 documents ([`scripts/mesure-siren-longueurs.mjs`](scripts/mesure-siren-longueurs.mjs)) : 4 numéros concernés (1×10, 1×11, 2×12), **1 récupéré** (HDH batiment → SIREN 851 828 566, entreprise réelle et active), 2 écartés à raison, 1 bien formé mais absent du registre. Les 5 numéros de 13 chiffres passent tous la clé : le durcissement du rattrapage historique ne retire rien. ⚠️ **Gain net NUL en nombre** sur le stock actuel — ce cas était déjà résolu par le repli « par personne » ; ce qui change est la qualité de la preuve (identifier par le numéro plutôt que par le nom). ⚠️ La clé ne s'applique **qu'à la troncature**, jamais à un numéro de 9 chiffres pris tel quel. Détail dans `CLAUDE.md`.

- [ ] 🟢 **RÉCUPÉRER LE CODE APE — ET NE PAS EN FAIRE UN VERDICT (2026-09-13, demande Johan)** — `activite_principale` n'est **jamais récupéré** par `verify.ts`, alors que [`detectPrestationIntellectuelle.ts:39`](src/lib/analyse/detectPrestationIntellectuelle.ts:39) le lit déjà : **signal mort depuis toujours**. L'API `recherche-entreprises` le renvoie dans la même réponse — coût zéro. Demande d'origine : vérifier la cohérence entre l'APE et la nature du devis (ex. 4399A « autres travaux de finition » sur un devis d'étanchéité). ⚠️ **Réserve à lever avant d'en tirer quoi que ce soit** : l'APE est **déclaratif**, souvent générique ou périmé, et l'INSEE précise qu'il ne prouve pas l'activité réelle ; un artisan fait légitimement de l'adjacent. L'afficher comme un fait : oui. En faire un critère de score : à mesurer d'abord sur le stock (combien de devis auraient un APE « incohérent » avec leur contenu, et combien de ces incohérences sont de vrais signaux).

- [ ] 🟡 **LIRE UN PRIX ÉCRIT EN TEXTE LIBRE, HORS DU TABLEAU DES TOTAUX (2026-09-13, devis « Entreprise Fk »)** — sur ce devis, le tableau affiche « TOTAL (EUR) : 0,00 € » et le vrai prix n'existe qu'en trois lignes de texte libre plus bas : *« Prix forfaitaire 2830€ttc · Acompte de 30 % 900€ttc · Reste du 1930€ttc »*. L'extraction a lu le total structuré — ce que le document affiche — et rendu 0 €. Les deux gardes livrées le 13/09 empêchent désormais d'en tirer un verdict, mais on ne récupère toujours pas le montant. Piste : demander à l'extraction, **quand les totaux sortent à zéro**, de chercher un montant dans le corps du texte (« prix forfaitaire », « montant total », « à payer ») et de le rendre dans un champ SÉPARÉ (`total_hors_tableau`), jamais en écrasant `totaux` — un chiffre lu dans une phrase n'a pas le même statut qu'un total de tableau. ⚠️ À mesurer sur les devis dont les totaux valent 0 avant d'élargir : le risque est de capter un acompte ou un « reste dû » et de l'appeler total.

- [ ] 🟡 **L'ACOMPTE ANNONCÉ NE CORRESPOND PAS AU POURCENTAGE ÉCRIT (2026-09-13)** — le devis « Entreprise Fk » annonce « Acompte de 30 % » et demande **900 € sur 2 830 €, soit 31,8 %** (30 % feraient 849 €). Vérification arithmétique gratuite dès qu'on a les deux : le pourcentage écrit et le montant écrit. ⚠️ Tolérance à définir (arrondi à la dizaine ? au chiffre rond ?) — sans elle, tous les devis arrondis à 900 ou 1 000 € deviendraient des anomalies. À mesurer sur le stock avant d'en faire un signal.

- [x] ✅ **« OFFRES COMMERCIALES DE NOS PARTENAIRES SÉLECTIONNÉS » — RETIRÉE le 2026-09-13 (décision Johan)** — aucun partenariat n'existe, aucun lead n'est transmis à un tiers : la case décrivait une intention, pas la réalité. Retirée des **deux** formulaires qui la portaient — `Register.tsx` et `PremiumGate.tsx` (« J'accepte de recevoir des offres commerciales », même fausse promesse sur la conversion des comptes anonymes hérités). Détail et garde-fou dans `CLAUDE.md`.

- [ ] 🟡 **FAIRE PASSER LE DEVIS D'EXEMPLE DANS LE VRAI PIPELINE — pour mériter le mot « réelle » (2026-09-14)** — la page démo [`/exemple-analyse`](src/pages/exemple-analyse.astro) est livrée, mais son contenu est **écrit à la main** à partir des vraies fourchettes et des vraies règles : le bouton du hero dit donc « Voir un exemple d'analyse », sans « réelle » (Johan avait demandé le mot). Pour l'obtenir : produire le PDF du devis fictif, le faire analyser par le **vrai** pipeline, et alimenter la page depuis la sortie stockée plutôt que depuis des constantes.
  ⚠️ **Décision à prendre AVANT de créer cette analyse** : elle entrerait dans `ANALYSES_TOTAL` et dans les statistiques de l'observatoire — **notre propre devis fabriqué compterait comme un devis de marché**. Soit on le marque pour l'exclure des deux (générateur + vues matérialisées), soit on assume. Ne pas la créer sans avoir tranché ça, sinon on pollue des chiffres publics avec un document que nous avons écrit nous-mêmes.
  🟢 Bénéfice secondaire, le jour où ce sera fait : la page ne pourra plus dériver de ce que le moteur produit vraiment.

- [ ] 🔴 **LIRE LA PROVENANCE DU TRAFIC — vers le 21/09, une semaine après la mise en service (2026-09-14)** — la mesure du 14/09 dit que **toute** la perte du funnel tient sur l'accueil (806 visiteurs, 31 clics, 3,8 %) et que tout ce qui suit convertit entre 68 et 100 %. Mais elle ne dit pas si c'est la PAGE ou le TRAFIC : les deux donnent le même chiffre. La provenance est collectée depuis le 14/09 (`referrer_host` + `utm_source`, tableau « D'où vient le trafic » dans `/admin`). **La lecture tranche le chantier suivant** : si l'accueil reçoit surtout du trafic non qualifié, le levier est l'ACQUISITION ; s'il reçoit de l'intention qui ne clique pas, le levier est le HERO. ⚠️ Ne pas conclure avant une semaine pleine, et se souvenir que l'unité est le visiteur-jour (borne basse).

- [ ] 🟡 **« 5 ANALYSES GRATUITES PAR COMPTE » — AUCUN PLAFOND N'EXISTE (2026-09-14, à trancher par Johan)** — `/comparer-devis-travaux` l'annonce deux fois. Vérifié en base : **10 comptes dépassent 5 analyses, le maximum observé est 55**, et aucune limite n'est appliquée dans le code. C'est donc une promesse plus STRICTE que la réalité — l'inverse du défaut « sans inscription », mais inexacte quand même. ⚠️ Décision commerciale, pas correctif : soit on retire la mention (l'usage est illimité aujourd'hui), soit on implémente réellement le plafond. Ne pas laisser en l'état indéfiniment — une page qui annonce une limite inexistante sera prise au mot le jour où on en posera une.

- [ ] 🟡 **LE BLOG NE MÈNE NULLE PART — 2ᵉ POINT D'ENTRÉE, 0 % DE CONVERSION (2026-09-14)** — 45-50 visiteurs sur 11 jours, **aucun** n'atteint l'analyse, alors que les articles portent **trois** CTA. Ce n'est donc pas un problème de bouton : le lecteur arrive sur une requête d'information. ⚠️ Deux réponses possibles et opposées — assumer que le blog est un actif de référencement sans mission de conversion (et cesser d'en attendre), ou lier chaque article à l'action que SON sujet appelle. À trancher avec la provenance en main : si ce trafic vient de requêtes très générales, la première réponse est la bonne.

- [ ] 🟢 **DÉCIDER SI LES CHAMPS DU FORMULAIRE COMPTENT — verdict attendu ~fin septembre (2026-09-13)** — l'événement `inscription_formulaire_commence` est en place depuis le 13/09. Il sépare enfin les deux abandons qu'on confondait : « reparti devant le mur » (n'a rien saisi) et « a renoncé devant les champs » (a commencé puis abandonné). Repères du 13/09 : 51 arrivées sur `/inscription`, **22 comptes créés**, dont **19 via Google**. ⚠️ Si presque personne ne commence à saisir, retoucher les champs ne servira à rien — c'est la page et le mur qu'il faudra travailler, pas le formulaire. Attendre une dizaine de jours de données avant de conclure.

- [ ] 🟢 **ARBITRE LLM SUR LE TOP-5 — DÉCISION PRODUIT EN ATTENTE (2026-09-11)** : maintenant que le re-classement déterministe est fermé, c'est la seule piste chiffrée qui reste pour réduire les références fausses, et elle est déjà mesurée (10/09). Sur les lignes que l'outil chiffre, **une référence sur cinq est fausse**. Un arbitre LLM sur les cinq candidats en bloquerait **9 sur 19 (47 %)** au prix de **7 des 29 justes (24 %)** — meilleur troc que le seuil de marge, mais il transforme des prix affichés en « Prix non vérifiable ». ⚠️ **À trancher par Johan, pas en technique** : c'est un arbitrage entre se taire plus souvent et se tromper moins souvent. Coût à chiffrer aussi (un appel LLM par ligne incertaine).

- [ ] 🟢 **NOS CHIFFRES DE COUVERTURE SONT DES CHIFFRES D'ARCHIVE (2026-09-10)** : rejoué sur le catalogue d'aujourd'hui, le même stock donne **56 % du montant vérifiable au lieu de 37 %**, une couverture médiane par devis de **63 % au lieu de 29 %**, et 17 devis sans aucun poste chiffrable au lieu de 30 sur 100. Tout ce qui est calculé depuis `raw_text.n8n_price_data` — l'observatoire, les KPI catalogue, l'audit de couverture du 30/08 — mesure donc l'état du catalogue au MOMENT de chaque analyse, pas celui d'aujourd'hui. **À faire** : (a) rejouer avant de citer un taux de couverture, avec le script ci-dessus ; (b) décider si le stock doit être re-rapproché — 440 lignes y gagneraient la confiance haute, mais ce sont des analyses anciennes que les utilisateurs ne revisitent pas, donc l'intérêt est surtout de ne plus se mentir sur nos propres tableaux de bord. ⚠️ Le 56 % est un plafond : le rejeu local n'applique pas les gardes de rejet de la production.

- [ ] 🔴 **Couverture catalogue — le chiffre est désormais VISIBLE par l'utilisateur (2026-09-10)** : depuis l'alignement des trois affichages sur `referenceOpposable`, un poste non rapproché en confiance haute s'affiche « Prix non vérifiable » au lieu d'être compté « Prix correct » en vert. Mesuré sur les 123 analyses du pipeline vectoriel : **59 % des cartes** basculent, et **36 analyses n'affichent plus aucun prix**. La page est honnête, mais elle expose maintenant en clair ce que le catalogue ne couvre pas — la priorisation de l'enrichissement devient un sujet produit, plus seulement technique. **Prochain pas** : sortir le classement des libellés de devis les plus fréquents parmi les postes « non vérifiables » (par montant cumulé), puis sourcer ces familles-là en premier. ⚠️ **La tentation à écarter explicitement** : élargir le seuil à `medium` pour « réafficher » des prix. La bande 0,75–0,77 est fausse une fois sur deux (mesure ci-dessous) — on rachèterait de l'affichage avec des verdicts faux.

- [ ] **Couverture catalogue — suite (2026-08-30)** — ⚠️ **relire la mesure avant d'agir** : la médiane de 31 % portait sur un stock majoritairement ANTÉRIEUR à l'enrichissement du 27/08. Sur les analyses postérieures, la médiane est de **41 %**. Et la promotion lexicale livrée le 30/08 doit encore faire gagner ~11 % du montant classé « moyen ». **Re-mesurer d'abord** (`scripts/mine-coverage.mjs` + comparaison avant/après 27/08) : le reste à gagner est peut-être bien plus faible qu'il n'y paraissait. ✅ **3 des 4 trous comblés le 2026-08-30** (migration `20260830120000`, fourchettes sourcées web, embeddings générés, rapprochement vérifié en direct) : plancher poutrelles-hourdis (85-170 €/m², retrouvé à 0,794), bardage métallique double peau bac acier (80-170 €/m², à 0,824), lot plomberie complet d'un logement (forfait 7 300-18 200 €, à 0,764). ✅ **Les 3 fourchettes ont été relues et validées par Johan le 2026-08-30** (`last_reviewed_at` renseigné).
  Reste **ossature bois de murs** : volontairement NON ajoutée — les sources publiques ne donnent que des prix de maison complète au m² habitable (1 150-2 300 €/m²), rien qui corresponde à une ligne de mur au ml. À sourcer autrement (barème d'un charpentier, retour Julien) plutôt qu'à inventer. ⚠️ Et il ne faut PAS baisser la barre : l'inspection de la bande 0,75–0,77 (389 groupes, 365 k€) montre qu'environ **la moitié des rapprochements y sont faux** (ossature bois → clôture bois, bardage industriel → bardage HPL, « plomberie suivant plan » 9 182 € → « plomberie petite intervention »). Cause racine identifiée : **notre catalogue est plus granulaire que la façon dont les devis sont écrits** — beaucoup de lignes sont des forfaits composites rapprochés d'entrées unitaires, d'où similarité moyenne ET ordre de grandeur incompatible. Travail à faire : (a) lister les familles composites récurrentes depuis `scripts/mine-coverage.mjs` (les plus lourdes vues ce jour : enduit/ratissage mural 63 k€ sur 10 devis, préparation + 2 couches de peinture, ponçage plafond et mur, création de cloisons, lot plomberie complet, installation électrique complète, ossature bois, bardage industriel double peau, plancher poutrelles-hourdis, VMC) ; (b) **sourcer les fourchettes** — jamais inventer, c'est la règle ; (c) mesurer l'effet réel sur la couverture ET sur le taux de faux positifs avant/après. Une comparaison fausse vaut moins que pas de comparaison.

- [ ] **Confiance du matcher vectoriel surévaluée — corpus fourni par le relecteur IA (2026-08-29)** : sur le devis 25030, le relecteur a listé des matchs franchement aberrants sortis avec une confiance qui ne le reflète pas — *pompe à béton → pompe à chaleur*, *ossature bois → clôture bois*, *poutre I (acier) → poutre béton armé*, *pose des chaises (armatures) → pose WC*. Deux faux positifs coûteux en découlent : un forfait (`U=1`) comparé à une fourchette au m², et une ligne fourniture+pose comparée à une fourchette pose seule. Piste concrète : ajouter à `market-matcher-vectorial.ts` une garde d'**unité** (forfait vs unité métrique = rejet ou dégradation en `low_confidence`) en complément des 3 gardes sémantiques existantes, et exploiter `match_audit_log` + les `drapeaux` du relecteur comme corpus de calibration. C'est le premier gisement de faux positifs identifié depuis la bascule vectorielle.

- [ ] **V3.x — Enrichir le catalogue `market_prices` par niveau de gamme** : aujourd'hui le catalogue donne une fourchette unique par `job_type` (ex: carrelage 46-94 €/m²). Cette fourchette ne couvre que le standard et fait sortir en "anomalie" des prestations légitimes haut de gamme (dalle céramique premium à 160 €/m² posée). Plan : ajouter une dimension `qualite: "entree_gamme" | "standard" | "premium"` au catalogue, permettre au LLM de la déduire des descriptions (mots-clés "premium", "haut de gamme", "grand format", noms de fabricants comme Kann, Cinca, Florim…), et ajuster les fourchettes en conséquence. Estimation : 1 semaine + collecte de prix premium par domaine.

- [ ] **V3.x — Audit qualité externe** : faire valider 100 devis par un panel de 3 experts BTP indépendants, mesurer le taux de concordance avec nos verdicts (cible : >85%). Publier le "Rapport de fiabilité 2026" comme argument commercial principal face aux prescripteurs B2B (courtiers, agents immo, marchands de biens). Sans cette caution externe, nos verdicts restent du "trust me bro" attaquable juridiquement.

---

## Marketing / tracking (2026-06-05)

- [ ] **Devis de sous-traitance de main d'œuvre B2B — hors périmètre à trancher (2026-09-04, cas DEV-202608-1)** : le devis analysé est *22 jours × 100 €/jour, « Constructeur Bois », « Ce devis concerne uniquement de la prestation de service », TVA non applicable art. 293 B*, adressé par un indépendant à une **entreprise** (TINY LAB, NAF 16.23Z charpentes, à Cambes). Ce n'est pas un devis de travaux adressé à un particulier : c'est de la mise à disposition de main d'œuvre entre professionnels. Le pipeline l'a classé `devis_travaux` et a rendu « dans la norme — signer » alors que la seule comparaison produite était une fourchette **0-0 €** (« prestation spécifique, pas de référence standardisée »). Le libellé « Chantier ESR » est une référence interne de projet, pas un type de travaux. Les catégories `hors_scope` existantes (véhicule, électroménager, achat de biens, service à la personne, médical, vétérinaire) ne couvrent pas ce cas. **Décision produit attendue** : (a) nouveau `type_document="prestation_service_b2b"` avec bypass et bannière dédiée, sur des signaux convergents (facturation au jour/à l'heure, mention « prestation de service », client = personne morale, zéro fourniture) ; ou (b) élargir le garde existant `is_incomplete_quote` ; ou (c) ne rien faire et assumer. ⚠️ Ne PAS se contenter d'un verdict prudent : le problème n'est pas le verdict, c'est qu'on affirme « dans la norme » sur un document qu'aucun référentiel ne couvre.

- [ ] **SEO « comparer devis travaux » — la suite est du contenu, pas de la technique (2026-09-04)** : diagnostic fait, rien n'est cassé (page 200, indexable, canonical, sitemap, FAQ schema). Deux causes réelles : (a) **cannibalisation** — /verifier et /analyser promettaient la même chose et Google les préférait ; titre différencié + liens internes corrigés le 04/09, à re-mesurer dans 3-4 semaines dans la Search Console ; (b) **autorité** — la première page est tenue par Saint-Gobain, travaux.com, hemea, habitatpresto et des noms de domaine exacts (comparedevistravaux.com, travaux-comparateur.com). Aucun réglage on-page ne prend cette requête à court terme. **Le terrain gagnable est la longue traîne par métier** : l'article « 2 devis fenêtres, comment choisir » ressort DÉJÀ. Décliner ce format (2 devis toiture / salle de bains / isolation / pompe à chaleur…) vaut mieux que de s'acharner sur la requête générique.

- [ ] **Brancher la purge des visites sur un cron (2026-09-04)** : `purge_site_visits()` supprime les lignes de `site_visits` de plus de 13 mois (durée max CNIL pour la mesure d'audience) mais **rien ne l'appelle**. Sans échéance réelle avant octobre 2027, mais à ne pas oublier — c'est une obligation de conservation, pas un confort. ⚠️ Utiliser le motif de cron validé (URL en dur, pas de `current_setting`) et vérifier avec `admin_cron_status`.

- [ ] **Vérifier les 2 domaines dans Meta Business** : Events Manager → Sécurité de la marque → Domaines (ou Business Settings → Domaines). Ajouter `verifiermondevis.fr` ET `gerermonchantier.fr`. Obligatoire pour l'Aggregated Event Measurement (iOS 14.5+) et la priorisation d'événements. Méthode balise meta : Claude ajoute les 2 `<meta name="facebook-domain-verification">` au `BaseLayout` en 2 min (les fournir). Sinon méthode DNS chez OVH.
- [ ] **Créer les Custom Audiences segmentées par URL** : `contient verifiermondevis.fr` vs `contient gerermonchantier.fr` (un seul pixel mutualisé, on segmente côté Ads Manager).
- [ ] **Événements de conversion GMC restants** : `Lead` (fin d'analyse VMD, `AnalysisResult.tsx:1272`) et `CompleteRegistration` (inscription, `Register.tsx:136`) sont **déjà câblés** via le helper `src/lib/integrations/metaPixel.ts`. Reste à câbler **côté GMC** : `StartTrial` (démarrage du trial 15 j) et `Subscribe` (passage payant Stripe). Note : les events déjà câblés n'apparaissent pas encore dans Events Manager faute de volume (pixel créé le 5 juin, ~85 visites) — c'est normal, pas un bug.
- [ ] **Auditer la passerelle CAPI stape.de** (`capig.stape.de`) : confirmer qui l'a configurée, si on la garde, et quels events elle envoie côté serveur (le tag « Multiple » sur PageView dans Events Manager = pixel navigateur + CAPI serveur). Vérifier la déduplication navigateur↔serveur quand le volume sera suffisant (au 8 juin, Meta affiche « analyse de dédup en cours », pas assez de données). Bonus : envoyer `CompleteRegistration` via cette CAPI = la solution robuste (le délai 400 ms dans `Register.tsx`/`callback.astro` n'est qu'un stopgap navigateur). **MAJ 12 juin** : la CAPI était CSP-bloquée jusqu'au commit `3351077` → maintenant `POST capig.stape.de → 200` prouvé live (GMC + VMD). Le diagnostic Events Manager « Improve rate of events covered by CAPI » (serveur -215 events vs pixel /7 j) = **artefact du blocage, pas une panne** ; re-vérifier ~19 juin que l'écart se résorbe (sinon creuser : stape forwarde-t-il 100 % à Meta ?).
- [ ] **Identifier l'event `Prospect`** (Events Manager → source « Site web », navigateur, 1 event, hors code VMD, hors GTM/stape/conversion-perso). Inspection live 2026-06-08 : très probablement déclenché par le **widget chat MessagingMe** (`ai.messagingme.app/widget/...`, partage le `fbq` de la page). À confirmer en capturant le réseau pendant une interaction chat, puis décider si on le garde / le renomme.
- [ ] **Landing `/beta` — captures produit dédiées mobile (optionnel, mineur)** : les 4 captures (planning/devis/aides/journal) sont du 1920×1080 dense affiché à ~340px → lisibles dans les grandes lignes (prix, barres, badges) mais pas dans le détail. Pour un vrai « zoom » mobile, produire des captures cadrées serré sur l'essentiel de chaque écran. ⚠️ NE PAS recadrer en dur le **devis** (perdrait son comparatif 3 colonnes).

---

## UX/UI cockpit GMC — issus de l'audit #2 (2026-05-09)

### P0 — Frein produit majeur

- [x] ~~**I3 — Surface persistante Assistant IA**~~ — fait 2026-06-14 (commit `87bed3a`). `InsightsBanner` monté au niveau cockpit (au-dessus du contenu, visible sur toutes les pages sauf l'onglet Assistant), ambre si `agentInsights.unreadCount > 0`, rouge si `hasCriticalInsight`, clic → onglet Assistant. Desktop (`lg:`) ; mobile garde la bannière basse existante au-dessus du BottomNav. Décision de placement : cockpit-level (toutes pages) plutôt que Dashboard+Budget séparés, plus simple et plus large.

### P0 — Mobile

- [x] ~~**N5b — IntervenantsListView en cards mobile**~~ — fait 2026-06-14 (commit `87bed3a`). Cartes empilées sous `sm` (`sm:hidden`), tableau en `hidden sm:block`. Logique de prix extraite dans `lotPricing()` partagée table + cartes. `src/components/chantier/cockpit/lots/IntervenantsListView.tsx`.

- [x] ~~**N5c — Touch events Planning Gantt**~~ — déjà fait (Vague A1, antérieur). `GanttBar` + `SubphaseBar` utilisent `PointerEvent` (`onPointerDown` + `pointermove/up/cancel`), `touchAction:'none'`, poignées visibles sur tactile (`opacity-60 sm:opacity-0 sm:group-hover/bar:opacity-100`). Zéro handler `onMouse*` restant (vérifié 2026-06-14). TODO périmé.

### P1 — UX moyens

- [ ] **I5 — Vue expert / novice en toggle** : le tableau Budget reste dense par défaut (6 colonnes). À faire : toggle "🌱 Vue simple / 🔧 Vue détaillée" dans ActionBar. En mode simple → masquer "Facturé" et "Avancement", garder Artisan/Engagé/Solde/Actions. Persistance localStorage. Refonte invasive du tableau (colgroup table-fixed + headers + cells) → planifier un sprint dédié pour éviter régressions.

- [ ] **BudgetTabMobile split complet** : la Vague C polish (2026-05-16) a ajouté `useIsMobile()` pour amplifier les zones tactiles dans ActionBar (search h-11, CTAs min-h-44px) et les drawers (safe-area-inset-bottom + role dialog). Mais ~25-30% du JSX bénéficierait d'un composant mobile dédié (pattern `TresorerieMobile` / `EcheancierMobile`) plutôt que des classes Tailwind responsive imbriquées. Sections cibles : ActionBar single-col stack + filtres en bottom-sheet, Devis rows / Facture rows en cards empilées (déjà partiel via `ArtisanCardMobile`), Drawer artisan en bottom-sheet plein écran. À attaquer si feedback user "le tableau est illisible sur mobile" remonte ou si on observe un drop-off mobile sur l'onglet Budget. Fichier cible : `src/components/chantier/cockpit/budget/BudgetTabMobile.tsx` + wrapper d'export default avec routing isMobile + state shared via props.

- [ ] **Audit a11y messagerie + assistant** : la Vague C polish (2026-05-16) a fixé les aria-label sur BudgetTab/Echeancier/DepenseRapideModal/BottomNav/ScreenQualification mais n'a PAS audité `ConversationThread` ni `WhatsAppThread` (panneau messagerie). Tour rapide à programmer : send button, search clear, scroll-to-bottom, attach paperclip — vérifier qu'ils ont tous `aria-label` + icônes `aria-hidden`. Effort ~30 min.

- [x] ~~**Pencil edit durée LotDetail (touch target)**~~ — fait 2026-05-09. Pencil + Check + X durée passés à `w-11 h-11 lg:w-7 lg:h-7` (44 mobile, 28 desktop) avec `aria-label` + `touch-manipulation`. `LotDetail.tsx:143,148,162`.

---

## Refacto code (suite de l'audit structure 2026-05-08/09)

Étapes 1-4 livrées. Reste à programmer, priorisé par ROI.

- [ ] **Étape 5 — Casser `BudgetTab.tsx` (2581 lignes 🔥)**
  Le pire fichier du repo. Effort : ~1j. Risque : moyen (fichier critique, plusieurs flux paiement).
  Plan minimal : extraire 4-5 sous-composants (`IntervenantsList`, `PaymentSummary`, `MissingDocAlerts`, `LineItemRow`) en gardant `BudgetTab.tsx` comme orchestrateur < 500 lignes.

- [ ] **Étape 6 — Consolider Trésorerie ×3**
  `tresorerie/{TresoreriePanel, TresorerieView, BudgetTresorerie}` = 4 niveaux de cascade pour afficher un même domaine. Effort : ~1j. Risque : moyen — `showBudgetDetail` flag dans ChantierCockpit suggère 2 modes distincts. **Audit avant de fusionner**.

- [x] ~~**Étape 7 — Partition `lib/` par domaine**~~ — fait 2026-05-09 (commits `5d6ff19` + `8b07ec1`).
  38 fichiers plats → 6 sous-dossiers : `analyse/` (11), `chantier/` (11), `auth/` (7), `integrations/` (4), `api/` (1), `blog/` (1). Restent à la racine : `utils.ts`, `constants.ts`, `prompts/`. 249 imports mis à jour automatiquement via sed dans 164 fichiers consommateurs. 0 nouvelle erreur TS introduite.

- [ ] **Étape 8 — Header ×3 sync**
  3 variantes (`layout/Header.tsx` React + `astro/Header.astro` + `gmc-landing/Header.astro`) imposent de modifier 3 fichiers à chaque changement d'auth state. Extraire un `<HeaderUserMenu />` partagé client:only — les 3 Headers se réduisent à layout + branding + import du même menu.
  Effort : 2-3h. Risque : moyen.

- [ ] **Étape 9 — Découper `AnalysisResult.tsx` (1341 lignes)**
  Page principale d'analyse de devis. Les sections `Block*` sont déjà extraites — reste 1341 lignes d'orchestrateur dont gros useMemo (`effectiveScore`, `weightedAnomalies`) à sortir en hooks dédiés (`useEffectiveScore.ts`, `useWeightedAnomalies.ts`). Cible : ~600 lignes.
  Effort : ~1j. Risque : moyen (page critique, beaucoup de logique TDZ-sensible — cf. règle "TDZ in edge functions and React").

- [ ] **Étape 10 — Tests unitaires (couverture critique)**
  Au minimum couvrir avec Vitest :
  - `lib/planningUtils.ts` (CPM forward pass — bug zone historique)
  - `lib/market-prices.ts` (matching 5 niveaux + emergency fallback)
  - `pages/api/analyse/[id]/conclusion.ts` (`extractKnownSurface`, `hasSurfaceUnitMismatch`)
  - `verdictEngine.ts` ✅ déjà couvert (27 cas)

  Effort : 2-3j. Risque : bas. Filet de sécurité critique vu que l'agent IA prend des actions destructives.

---

## Dette technique

- [ ] **Cron timeout — fan-out pattern**
  Le cron quotidien `agent-orchestrator-evening-digest` traite les chantiers actifs en batches de 3. Au-delà de ~10 chantiers actifs, on risque le timeout edge function 60s.
  **Solution** : edge function "dispatcher" qui fire N appels indépendants à l'edge function `agent-orchestrator` (1 par chantier). Pas bloquant — juste à anticiper avant que la base utilisateur grossisse.

- [ ] **Migration `useInsights` legacy → `agent_insights`**
  6 composants utilisent encore `cockpit/useInsights.ts` (ancien système Gemini MOE — appel éphémère sans persistance) :
  - `BudgetTresorerie.tsx`
  - `AnalyseDevisSection.tsx`
  - `LotCard.tsx`
  - `LotIntervenantCard.tsx`
  - `BudgetKpiCard.tsx`
  - `dashboardHelpers.ts`

  À terme : remplacer par lecture des `agent_insights` persistants (mêmes données mais cachées + traçables). Pas urgent — ça marche aujourd'hui.

---

## Architecture agent IA — évolutions à programmer (issu de WIP § 12)

- [ ] **P4 — Fan-out cron evening**
  Aujourd'hui batch 3 séquentiels → > 30-50 chantiers actifs = timeout edge function 60s.
  Edge function "dispatcher" qui fire N invocations indépendantes (1 par chantier) au lieu de boucler. Chaque invocation = 1 chantier, timeout indépendant.
  *(Recouvre partiellement "Cron timeout fan-out pattern" ci-dessus — fusionner les deux quand on attaque.)*

- [ ] **P5 — POC Claude Sonnet 4.7 + prompt caching**
  **Hypothèse à valider** : Claude + prompt caching réduit le TCO total malgré un prix au token brut plus élevé, parce que :
  - Prompt caching = -90% sur le contexte (notre `context.ts` rebuild ~6-10k tokens à chaque appel — gain énorme)
  - Taux de succès tool_call plus élevé = moins de retries
  - Moins d'hallucinations = moins de "défaire ce qu'a fait l'agent" côté user
  - Suppression progressive des hacks Gemini

  **À mesurer sur 1 chantier de test, 1 mois** : taux tool_calls qui aboutissent, coût par run (avec cache hit rate visible), latence (avec streaming Anthropic), qualité subjective des messages générés.

  **Quand le faire** : > 100 chantiers actifs OU dès qu'un user signale un comportement bizarre récurrent qu'on ne peut pas patcher facilement.

  **Risque** : compatibilité tool calling (Anthropic format ≠ OpenAI format Gemini). Réécriture du dispatcher tools. Mais après P2 modularisation (livré), c'est isolé.

- [ ] **P6 — Multi-agents chaînés (planner + executors)**
  **Hypothèse** : splitter l'orchestrator en 2 niveaux :
  - 1 agent **planner** (full context) qui décide quoi faire
  - N agents **executors** spécialisés (planning, finance, comm) avec prompt minimal et tools restreints

  **Bénéfices attendus** : -40 à -60% sur les tokens cumulés, prompts plus précis par domaine, meilleure observabilité (chaque sous-agent loggé séparément).

  **Coût** : latence cumulée (2-3 calls Gemini/Claude par tour), complexité du dispatcher.

  **Quand le faire** : si après P5 on a encore des problèmes de qualité tool_call sur les workflows à 6+ étapes. Pas avant.

- [ ] **P7 — Évaluer un framework agent (Vercel AI SDK / Mastra)**
  **Contexte** : aujourd'hui dispatcher, retry logic, history compaction = 100% custom artisanal.

  **Hypothèse** : Vercel AI SDK (déjà sur Vercel, intégration TS native) ou Mastra (TS-first, workflows + memory natifs) pourrait remplacer 60% du code custom.

  **Bénéfices potentiels** : streaming natif (UX chat améliorée), observabilité native (LangSmith, Helicone), memory long terme (résumés glissants automatiques), workflows multi-step sans bricolage.

  **Coût** : courbe d'apprentissage, dépendance externe (lock-in, breaking changes), perte de contrôle fin (ex: nos hacks Gemini).

  **Quand le faire** : POC à 6 mois (mi-2026) sur 1 fonctionnalité périphérique avant de migrer le coeur.

  **À NE PAS faire** : 🔴 LangGraph en Python — ajoute Python à notre stack (Astro + Deno + Python = 3 runtimes), trop de friction pour le bénéfice.

- [ ] **P8 — State machine explicite pour workflows critiques**
  Si la complexité des workflows pending explose (>3 états avec branches conditionnelles), envisager XState ou home-made. Aujourd'hui : pending → resolved/expired suffit, donc pas pertinent. À reconsidérer si on ajoute des workflows multi-acteurs (ex: validation simultanée artisan + comptable).

- [ ] **P10 — Canaux proactifs alternatifs (Web Push / email)**
  ⚠️ **À ne pas confondre avec la vague 3** qui livre le canal proactif principal **via WhatsApp privé** (groupe "Mon Chantier — X" avec uniquement le user dedans). P10 = canaux **alternatifs** pour les users qui ne veulent pas / ne peuvent pas WhatsApp.

  Pistes :
  - **Web Push API** (notif browser) : permission demandée au premier login, push depuis edge function via VAPID. Fonctionne même app fermée si browser ouvert.
  - **Email transactionnel SendGrid** : digest quotidien ou notif immédiate sur les triggers critiques (alertes, clarifications urgentes).

  Settings UI à enrichir : checkboxes par canal (WhatsApp / Web Push / Email) × par catégorie de trigger (clarifications / alertes critiques / rappels / etc.). Sinon spam.

  Pas urgent : à activer si on identifie une cohorte significative de users sans WhatsApp.

---

## Tools agent IA — vague 3 reste à câbler

Vagues 1, 2, 3 livrées (cf. WIP § 13 historique). Sous-items non commencés :

- [x] ~~**UI activation canal owner WhatsApp**~~ — fait 2026-05-09. Composant `OwnerChannelToggle.tsx` ajouté dans la section Settings de `ChantierCockpit`. Bouton "Activer le canal WhatsApp IA" qui POST `is_owner_channel: true`. Gère 4 états : idle / loading / success (avec `already_existed` flag + invite_link) / error. Touch target 44×44 sur mobile. Le user qui ne passe jamais par le chat peut maintenant activer le canal via UI.

- [ ] **8 triggers proactifs à câbler**
  Définis dans `WIP § 12` round précédent. Pas encore tous implémentés. À faire après stabilisation de la vague 3 :
  1. Clarification urgente (`request_clarification`) — déjà routé via `agent_insights`
  2. Alerte critique (`severity=critical`) — à câbler vers WA owner channel
  3. Paiement en retard — déjà détecté par `agent-checks`, à router vers WA owner
  4. Lot bloqué sans devis depuis 14j — à ajouter dans `agent-checks`
  5. Rappel programmé (`schedule_reminder`) — ✅ implémenté via `agent-scheduled-tick`
  6. Déblocage attendu non reçu — nécessite tracking sur `payment_events` type entrée
  7. Action automatique prise (debrief) — à câbler dans `log_insight`
  8. Décision à prendre — ✅ implémenté via `notify_owner_for_decision`

  UI Settings : checkboxes par catégorie pour activer/désactiver chaque trigger. Sinon risque de spam owner.

---

## Vue mobile — passes restantes (suite de WIP § 9)

Étapes 1-6+8 livrées (cf. WIP § 9). Reste :

- [x] ~~**ÉTAPE 7 — Touch targets 44px min**~~ — fait 2026-05-09 sur DocumentsView mobile (boutons Analyse + Supprimer 44×44 avec aria-label). Pencil/Check/X dur ée LotDetail aussi. **Reste à finir** : ContactsSection icon buttons, chevrons divers — à compléter dans une passe globale.
- [ ] **ÉTAPE 9 — AnalysisResult blocs secondaires collapsés par défaut sur mobile** : aujourd'hui tous les blocs (Entreprise, Sécurité, Urbanisme…) sont déroulés → page très longue sur mobile. Collapse les blocs secondaires, garder l'essentiel ouvert (Conclusion + Prix marché).
- [ ] **ÉTAPE 10 — Homepage : résultat visuel + exemple concret** : la homepage parle au mobile mais ne montre pas un exemple concret de résultat d'analyse. Ajouter un screenshot annoté ou un mini-flow interactif.
- [ ] **PlanningTimeline mobile** (gros chantier) — le Gantt est galère sur petit écran. Recouvre N5c de l'audit UX #2.
- [ ] **ContactsSection + DocumentsView mobile** (LotBadge dropdown débordant, KPIs lisibles) — issues #16 du précédent audit.

---

## Cohérence Budget initial (estimation IA) ↔ Budget/Trésorerie (suivi réel)

UX à repenser — fracture entre les 2 phases du chantier.

Aujourd'hui on a deux mondes parallèles autour du budget :

- **Phase 1 — "Avant travaux"** : Accueil → Budget chantier → bouton "Affiner". Logique vague d'estimation IA (`market_prices`, qualification), l'utilisateur ne sait pas vraiment combien ça va coûter, on lui donne une fourchette. Réfine progressivement par questions (surface précise, choix matériaux, etc.).
- **Phase 2 — "On a lancé"** : Budget & Trésorerie. Logique de suivi de dépenses réelles. On a des devis signés, des factures, des paiements. Échéancier prévisionnel et réel. Cashflow.

### Le problème
Pas de **passerelle UX** entre les deux. Quand l'utilisateur passe de "j'ai mon estimation IA" à "j'ai mes devis et je commence à payer", il y a une rupture :
- Le budget IA initial n'apparaît plus en référence dans Budget & Trésorerie (sauf un encadré statique "budget cible XXX €").
- Pas de comparaison "estimation IA vs devis reçus" mise en avant — l'écart n'est visible qu'à travers les conseils proactifs (`buildConseils` "dépassement budget").
- L'utilisateur n'est pas guidé vers "tu peux maintenant figer ton budget réel à partir des devis validés" — on reste sur l'estimation initiale.

### Pistes de hitch / passerelle
- **Étape de transition explicite** : quand X% des lots ont un devis validé, proposer "Bascule vers le suivi réel — fige ton budget cible à partir des devis signés". Stocke un nouveau `budget_real` distinct du `budget_ia` initial.
- **Vue comparée side-by-side** dans Budget & Trésorerie : "Estimation IA initiale | Devis validés | Écart | % engagement". Visible en haut de l'onglet.
- **Sur l'écran Affiner** : à la fin du flow d'affinage, CTA explicite "Tu as ton estimation. Maintenant uploade tes devis pour passer en suivi de dépenses réelles" → routage vers tab Budget.
- **Ligne du temps narrative** dans l'Accueil : "Phase 1 estimation → Phase 2 suivi → Phase 3 bilan" avec progression visible (pourcentage de devis validés).

### À décider avant d'attaquer
- Faut-il créer un champ `budget_real_locked` distinct de `budget_ia` ?
- Le passage Phase 1 → Phase 2 est-il automatique (heuristique sur nb devis validés) ou manuel (CTA user) ?
- Faut-il garder l'estimation IA visible en permanence comme "rétroviseur" ou la masquer après bascule ?

---

## Idées produit en réflexion (pas codées)

- [ ] **"Joindre une preuve a posteriori"**
  Quand un frais est déclaré au chat, l'utilisateur reçoit le ticket plusieurs jours après. Pouvoir uploader le ticket et "promouvoir" le frais en `ticket_caisse` rattaché au document. Évite la double saisie.

- [ ] **Notification push proactive**
  Aujourd'hui les insights critical apparaissent dans le fil d'activité + WhatsApp digest. Pour des alertes vraiment urgentes (paiement à faire dans 24h, retard critique chantier), envisager push browser ou email immédiat. *(Recouvre P10 ci-dessus — à fusionner.)*

- [ ] **Rapport PDF chantier**
  À la fin du chantier, générer un PDF récap : timeline, lots, devis, factures, photos, total dépensé vs budget initial. Genre "livret de fin de chantier" remis au propriétaire.

- [ ] **Mode "invité collaborateur"**
  Inviter un conjoint / un proche à voir le chantier sans pouvoir tout modifier. Lecture + commentaires uniquement.

- [ ] **Recommandation artisan**
  Quand un lot a 0 devis depuis X jours, proposer une short-list d'artisans RGE / proches géographiquement / bien notés Google.

---

## Audit scalabilité + dette technique (2026-05-09)

Audit en 4 axes (DB/Supabase, edge functions/agent IA, dette code, coûts/observabilité). Les items déjà listés ailleurs dans ce TODO ne sont pas dupliqués — référencés inline.

**Verdict global** : aujourd'hui le projet scale bien jusqu'à ~30 chantiers actifs. Plafonds identifiés à 50-100 chantiers : (1) timeouts edge functions Supabase 60s sur extraction PDF gros, (2) cap Gemini 1k req/min sur batch evening, (3) queries DB en cascade sur views complexes (`payment_events_v`, `admin_kpis_*` non matérialisées). **Coût marginal estimé : ~€0.65-1.65/chantier actif/mois variable + ~€25-50/mois fixe (Supabase Pro + Vercel)**.

### P0 — Critique (à traiter avant 50 chantiers actifs)

- [ ] **Sentry / error tracking centralisé** — pas de Sentry installé. Silent failures détectés : whapi photo download (`webhooks/whapi.ts:69`), JSON truncation extraction (CLAUDE.md piège connu), agent tool_calls aborted, edge functions catch sans alerte. À faire : `npm i @sentry/node` + init dans edge functions Deno + serverless routes Vercel. ROI très haut, effort ~M (½ j).

- [x] ~~**Webhook idempotence whapi**~~ — vérifié 2026-05-09 : `whapi.ts` utilise déjà `upsert({ onConflict: 'id' })` ligne 264 ✅. **Reste à faire** : idempotence pour `inbound-email.ts` (SendGrid) qui fait un `.insert()` simple ligne 189 — nécessite migration DB pour stocker `message-id` SendGrid externe.

- [x] ~~**Timeouts explicites + retry backoff sur fetch Gemini**~~ — fait 2026-05-09. Helper partagé `supabase/functions/_shared/gemini-fetch.ts` avec `fetchWithTimeout` + `fetchGeminiWithRetry` (timeout dur, retry 429/5xx avec backoff exponentiel + jitter). Appliqué sur `market-prices.ts:359` et `summarize.ts:44` (3 tentatives, timeout 20s). **Reste à étendre** sur `agent-orchestrator/index.ts` (5 fetchs Gemini, scope laissé en TODO car critique — appliquer prudemment avec maxAttempts=2 pour respecter le budget time 60s par tour).

- [x] ~~**Sanitize XSS sur `dangerouslySetInnerHTML`**~~ — fait 2026-05-09. `ChatDrawer.tsx`, `ScreenAmeliorations.tsx` (contenu LLM) et `ConversationThread.tsx` (body_html email entrant) passent désormais par `sanitizeForRender()` (DOMPurify allowlist-based). `ArticleContent.tsx` était déjà sanitizé. `BlogArticle.tsx` JSON-LD = `JSON.stringify` direct (script type=application/ld+json) → safe.

- [~] **Gemini timeout sur gros PDF (>50 pages)** — **EN GRANDE PARTIE FAIT (vérifié 2026-06-15)** : `extract.ts` utilise déjà la Files API (upload binaire, pas de base64), `thinkingBudget:0` (gain 15-30s gros docs), timeout 80s sur le generateContent + 10s sur l'upload (donc **n'atteint PAS le plafond 240s**, il abort avant) + retry + erreurs gracieuses (402/429/502). Reste UNIQUEMENT le chunking async d'un PDF qui ne s'extrait pas en 80s — spéculatif, complexe (re-assemblage des lignes), à ne faire QUE si l'error-tracking montre de vrais échecs. À re-scoper/fermer. *(Ancien texte : chunk async + multi-part upload Files API, ~½ j.)*

### P1 — Important (entre 50 et 100 chantiers)

- [x] ~~**Retry avec backoff exponentiel sur Gemini 429/500**~~ — fait 2026-05-09 sur market-prices et summarize via le helper partagé. Pour extract.ts : laissé sans retry car chaque tentative ~40s vs budget Supabase 60s (commentaire historique respecté). Pour agent-orchestrator : à étendre dans une prochaine session (5 fetchs Gemini, prudence requise).

- [ ] **Prompt caching côté agent orchestrator** — supprimé 2026-04-23 pour garantir sync, mais `context.ts` rebuild ~6-10k tokens à chaque appel (cf. CLAUDE.md). Réimplémenter via Gemini `cache_control={"type":"ephemeral", "ttl_seconds": 3600}` sur le system prompt + portion stable du contexte. Gain : ~30-40% sur LLM agent ≈ -€0.05-0.06/chantier/mois. *Recouvre P5 backlog archi agent IA*. Effort ~M (1 j).

- [x] ~~**Audit RLS systématique**~~ — fait 2026-05-09 via Supabase advisor. Vérité plus précise que l'audit initial : 102 policies au total (pas 152), 0 `IN (SELECT)`, 23 `EXISTS` (acceptable avec FK indexées). **18 policies non wrappées** identifiées sur 6 tables (chantiers, subscriptions, journal_entries, relances, lots_chantier, chantier_whatsapp_messages) + **7 policies doublons** (`multiple_permissive_policies` sur analyses ×4, analysis_work_items ×1, chantier_whatsapp_messages ×1, subscriptions ×1). Migration corrective écrite : `supabase/migrations/20260509133525_rls_wrap_remaining_auth_uid_and_drop_duplicates.sql`. **Pas appliquée auto** — à exécuter via `supabase db push` ou Studio quand validé. Vérification post-apply : query SQL en bas de la migration doit retourner 0. **Reste** : tables price_observations, post_signature_tracking, blog_posts, document_extractions, dvf_prices, user_roles ont des `multiple_permissive_policies` non triviaux (besoin décision RESTRICTIVE vs PERMISSIVE) — à examiner case par case dans une prochaine session.

- [ ] **`payment_events_v` — vue UNION 3 branches sur JSONB** — `cashflow_terms` JSONB sans index, CROSS JOIN LATERAL + UNION ALL = O(N²) à O(N³). Risque timeout sur admin KPIs à 1M+ events. Refacto : table matérialisée incrémentale (refresh sur trigger) ou MATERIALIZED VIEW avec refresh cron 15min. Fichier : migration `20260428230000_drop_payment_events_legacy.sql:34-115`. Effort ~M (½-1 j).

- [ ] **Partitionnement temporel `agent_insights` / `agent_scheduled_actions`** — tables à croissance explosive (10-100k rows/jour à terme). Sans range partitioning par mois, WAL + VACUUM vont paralyser à 10M rows. Ajouter partitioning + politique d'archivage (insights > 90 j → cold storage). Effort ~M (½-1 j).

- [ ] **Fan-out cron evening — throttle + backoff** — `agent-orchestrator` MAX_FAN_OUT=200 hardcoded sans throttling Google Gemini (1k req/min cap). 200 invocations parallèles + 8 tool_rounds = pic 1600 req/min. Fix : queue + adaptive throttle si 429 détecté. *Recouvre P4 backlog archi agent IA*. Effort ~M (1 j).

- [ ] **Réduire 118 `as any` sans justification** — concentrés dans TresorerieView.tsx (10), ConclusionIA.tsx (8), budget.ts (7), TresoreriePanel.tsx (7), ChantierCockpit.tsx (7). Audit 2026-05-09 : un fix superficiel (replace `as any` → `as unknown`) casserait facilement la TS. Approche structurée requise : (1) helpers typés réutilisables pour les casts Supabase (`SupabaseClient<Database>`), (2) audit des handlers d'événements DOM (event.target as HTMLInputElement), (3) migrer fichier par fichier en testant. Effort 2 j, ne pas faire en quick win.

- [x] ~~**SendGrid 5/contact/24h cap non tracké**~~ — fait 2026-05-09. Vérité plus précise : le cap **existait déjà** côté agent (`tools/comm.ts:252-267`) mais **manquait sur l'API REST `messages.ts`** (utilisée par la Messagerie UI ET indirectement par l'agent). Fix : check ajouté dans `src/pages/api/chantier/[id]/messages.ts` avant l'INSERT — count outbound dans `chantier_messages` filtré sur les 24h via `created_at`. Retourne 429 + message clair si cap atteint. Pas besoin de nouvelle table — source unique de vérité = `chantier_messages` qui persiste déjà tout. **À noter** : l'agent et l'API utilisent maintenant le même check sémantiquement, donc plus de drift possible.

### P2 — Polish observabilité + qualité

- [ ] **Logger centralisé (268 console.log/error/warn non filtrés)** — risque fuite données sensibles en prod (CLAUDE.md règle "fuites de secrets"). Fix : `lib/logger.ts` avec `isDev ? console.log : noop`, et masquage automatique des `Bearer\s+[a-zA-Z0-9_.-]+`. Effort 4h.

- [x] ~~**`/api/health` endpoint**~~ — fait 2026-05-09. `src/pages/api/health.ts` retourne 200 si DB Supabase ping OK + variables d'env présentes, 503 sinon. Pas de check externe (Gemini, whapi, SendGrid) pour ne pas gonfler la latence — ces APIs ont leurs propres SLA. Réponse JSON avec `status` + `checks` détaillés.

- [x] ~~**Code mort — partiel**~~ — fait 2026-05-09 sur 2 items. **`skipN8N` supprimé** de `analyze-quote/index.ts` + des 2 callers (`NewAnalysis.tsx`, `documents/[docId]/analyser.ts`) — confirmé jamais `true` en prod. **Fichier `n8n.ts` supprimé** — aucun import dans le repo, complètement orphelin. **Pas supprimé** : `score_legacy` (encore actif dans verdictEngine + types + 4 consumers — migration progressive nécessaire) ; `register_avenant` (vrai tool actif dans `tools/finance.ts:60`, pas obsolète) ; hacks Gemini 2.5-flash (workarounds nécessaires pour bugs documentés CLAUDE.md).

- [x] ~~**`lot_dependencies` batch delete/insert**~~ — fait 2026-05-09. Refacto `planning.ts:194-249` : 1 SELECT global (au lieu de N) + 1 DELETE batch sur ids (au lieu de N) + 1 INSERT batch (au lieu de N). 3 round trips DB max quel que soit le nombre de lots, contre 3N avant.

- [ ] **MATERIALIZED VIEWS pour `admin_kpis_*`** — 8+ vues temps-réel non matérialisées (daily_evolution, retention_weekly, documents safe_json) avec CTE complexes sur tables volumineuses. Cron `REFRESH MATERIALIZED VIEW` 15 min → gain ~100x sur dashboards admin. Fichier : `20260227200000_optimize_rls_views_constraints.sql:58-175`. Effort ~M (½ j).

- [ ] **Logs trop verbeux (1 MB/min en batch evening)** — 60+ console.log dans `analyze-quote` + agent-orchestrator log raw_body 2k chars sliced. Couper 80% des logs verbeux, garder WARN/ERROR + opt-in DEBUG. Effort 4h.

- [ ] **Stripe webhook CORS restreint** — `*` aujourd'hui (vercel.json header global). Restreindre à signature-only en prod (déjà signé mais belt-and-suspenders). Effort ~S (1h).

- [x] ~~**Hook CI types Supabase drift**~~ — fait 2026-05-09. Workflow `.github/workflows/supabase-types-drift.yml` qui run sur PR touchant `supabase/migrations/**` ou `types.ts`. Compare la régen distante avec le fichier committé, fail avec instruction de régénération si drift. **Pré-requis** : configurer le secret `SUPABASE_ACCESS_TOKEN` dans GitHub Settings → Secrets → Actions (token perso depuis https://supabase.com/dashboard/account/tokens). Sans le secret, le workflow skip avec un warning (pas un fail).

### P3 — Nice to have

- [ ] **Correlation IDs end-to-end** — aucun trace ID partagé entre agent-orchestrator + tools + APIs. Debug en prod = matching manuel sur chantier_id + timestamp. Fix : injecter UUID au start de chaque run + propager via `X-Correlation-ID` sur tous les fetch. Effort ~M (½ j).

- [x] ~~**Tools dispatcher — runtime monitoring "Unknown tool"**~~ — fait 2026-05-09. `console.error("[tools] ${chantierId} unknown tool '${toolName}' (run_type=...)")` ajouté dans `tools/index.ts:85`. Trace désormais les hallucinations LLM côté Supabase logs.

- [ ] **RLS `chantier_whatsapp_messages` optimisation** — triple subquery (chantier_id → groups → user_id). Index sur `group_id` créé récemment mais pattern reste lourd. Évaluer denormalization de `user_id` sur la table messages directement. Effort ~M (½ j).

### Quick wins isolables (< 4h, sans risque régression)

1. **`/api/health` endpoint** (15 min) — visibilité ops, pas d'effet de bord
2. **Logger centralisé** (4h) — supprime risque fuite secrets en logs
3. **DOMPurify sur dangerouslySetInnerHTML** (4h) — élimine 5 vecteurs XSS potentiels
4. **Sentry init basique** (1h sur edge fns + 30min sur API routes) — capture les silent fails immédiatement
5. **Webhook UPSERT idempotence** (2h) — évite double WhatsApp / double facturation
6. **Stripe CORS restreint** (1h) — durcissement low-effort

### Coûts marginaux estimés

| Composant | Par chantier actif / mois |
|---|---|
| Gemini extraction (1-2 devis) | €0.06-0.16 |
| Gemini agent (2-3 runs/jour) | €0.18-0.45 |
| Supabase (DB + edge fn marginal) | €0.05-0.10 |
| Vercel functions (Hobby = 0, Pro = ~€0.05) | €0-0.05 |
| WhatsApp (whapi, ~20-30 msg) | €0.40-1.20 |
| SendGrid + Google Places | €0-0.05 |
| **Total variable** | **€0.65-1.65** |
| **Fixe (Supabase Pro + Vercel Pro)** | **~€25-50/mois total** |

**Gains potentiels du prompt caching agent** : -30 à -40% sur LLM agent ≈ **-€0.05-0.06/chantier/mois** + meilleure latence.

**Plafonds identifiés** :
- Gemini free tier 1k req/min → ~100+ chantiers en batch evening = saturation
- Supabase edge function 60s timeout → extraction PDF >50 pages risquée
- Supabase free tier 5k queries/sec → fan-out 200 chantiers × 8 queries context = 1600 req/min spike OK mais sans marge

**Recommandation** : avant 30 chantiers, attaquer P0 (Sentry + idempotence + timeouts). Avant 50 chantiers, P1 (caching + RLS audit + payment_events_v + retry backoff). P2/P3 = polish à mesure que la base grossit.

---

## GMC — Monétisation : essai gratuit 1 mois + gate paywall

> ⚠️ **MAJ 2026-06-12 : l'implémentation a DIVERGÉ du plan figé ci-dessous.** Fondation
> activation construite, déployée, testée de bout en bout. Source de vérité à jour =
> [`docs/plans/2026-06-12-activation-gmc.md`](docs/plans/2026-06-12-activation-gmc.md) +
> brief emails [`docs/plans/2026-06-12-brief-emails-claude-design.md`](docs/plans/2026-06-12-brief-emails-claude-design.md).
> Décisions qui SUPERSÈDENT le plan figé : essai = **1 mois (30 j)** ; **table dédiée
> `gmc_subscriptions`** (séparée de `subscriptions` VMD, avec `trial_started_at`) ; **trigger**
> `auth.users → gmc_create_trial_on_signup` (essai créé au signup si `signup_source=gerermonchantier`) ;
> **edge function `gmc-on-signup`** (Resend : welcome + notif admin) ; domaine `gerermonchantier.fr`
> **vérifié sur Resend** (`bonjour@`). Le plan figé (15 j, ancre `created_at`) est obsolète pour
> l'archi essai/trigger ; les **SKU Stripe + le paywall** restent valides.
>
> ⚠️ **MAJ 2026-06-14 : MONÉTISATION LIVRÉE + LIVE EN PROD** (commits cfa3845..bb708fa). Stripe complet
> (checkout/portail/webhook routé `metadata.product`/`/api/gmc/status`), **coupon -50% retenu** (`duration:once`,
> Live `Nb2ITi2O`, mensuel via `?offer=1` — PAS code promo), page `/gmc-abonnement`, **gate 2e chantier** (3
> couches, flag `GMC_PAYMENTS_LIVE` = présence des price env vars), bloc « Mon abonnement » + bandeau essai,
> **Phase B emails** (scheduler cycle de vie : conversion/winback/payant). `paymentsLive:true` confirmé. E2E
> sandbox OK. **Reste** : lecture seule J30 (mutations), confirmer prix Multi annuel 210, `RESEND_API_KEY`
> Vercel, test webhook auto, cron trial→expired. Le « plan figé Phase 2 » ci-dessous est **superseded** pour la
> partie Stripe/SKU ; sa partie **read-only/quota reste la réf pour la lecture seule J30**.
>
> ✅ **MAJ 2026-06-14 (suite)** : **lecture seule J30 FAITE** (écritures bloquées via `hasGmcWriteAccess`
> + bandeau cockpit), **timeline de suivi** (`gmc_subscription_events` + carte « Mon abonnement »),
> **comptes offerts** Julien + Johan en Multi.
>
> ✅ **MAJ 2026-06-14 (clôture monétisation)** : **cron `gmc-trial-expire-daily`** (07:50, flip trial→expired
> à J30, jobid 32) ; **test webhook auto** (Vitest, helpers purs `subPeriodEndISO`/`gmcStatusFromStripe`/
> `planFromPriceId`, 12 tests verts, `npm test`) ; **upgrade Essentiel→Multi en place** (`/api/gmc/change-plan`
> via `stripe.subscriptions.update` + proration, câblé sur `/gmc-abonnement`, pas de config portail Stripe) ;
> **portail masqué pour comptes offerts** (`/api/gmc/status` expose `isComp` + `hasStripeCustomer`) ; **reengage**
> sur `auth.users.last_sign_in_at` (vrai last-seen). **Prix Multi annuel 210 € CONFIRMÉ** par Julien.
> **Reste** : (1) `RESEND_API_KEY` sur **Vercel** (clé fournie 2026-06-14, à coller par Julien → emails payants
> temps réel via webhook + notif /avis) ; (2) corriger `invoice.subscription` dans `stripe-webhook.ts` (types
> Stripe v20, branche past_due/dunning — voir revue, 🔴).

### 🟠 Paramètres agent : auto-réponse artisans + activation OpenClaw (gros TODO, 2026-06-14)

Donner à l'utilisateur, dans les Paramètres du cockpit, le contrôle de l'agent IA :
- [ ] **Toggle « L'IA répond toute seule aux artisans sur WhatsApp »** — états à définir (off / suggère seulement / répond auto). Le mode vit dans `agent_config.agent_mode` (`edge` cron vs `openclaw`) ; prévoir le réglage user-facing + l'impact sur le webhook whapi (répondre auto ou non) + un opt-in clair (réponse auto = risqué).
- [ ] **Activer OpenClaw depuis là** + afficher le **mode d'emploi** : l'utilisateur branche son instance (`openclaw_url`, `openclaw_token`, `openclaw_agent_id` dans `agent_config` ; cf. `triggerAgentIfOpenClaw` dans `apiHelpers`).
- Design à faire : emplacement (onglet « Agent » dans les paramètres ?), états du toggle, garde-fous.
- ✅ FAIT 2026-06-14 : bug du toggle « Canal WhatsApp IA » (ne reflétait pas l'état actif au montage) corrigé — GET sur la route whatsapp + lecture de l'état au montage.
>
> ### 🔴 GROS TODO À NE PAS LOUPER (2026-06-12)
>
> ✅ **GATE MULTI-CHANTIER — FAIT + LIVE (2026-06-14)** : gratuit/essai/Essentiel = 1 chantier, Multi payant = illimité. 3 couches (garde backend `sauvegarder.ts` → 403 `code:multi_required` ; carte `AddChantierCard` verrouillée → `/gmc-abonnement?plan=multi` ; garde au montage `NouveauChantier` ; `/api/gmc/status` expose `isMulti`+`paymentsLive`). Conditionné à `GMC_PAYMENTS_LIVE` (présence des price env vars) → actif depuis le go-live. Q1 tunnel (mono/multi) gardée comme signal d'intention.
> 1. ✅ **FAIT (2026-06-13)** : tunnel **auth-first**. Au clic "Tester gratuitement" (déconnecté) → écran
>    **inscription** (plus connexion) → après création du compte, les 3 questions du tunnel s'affichent
>    **une seule fois** (réponses préservées au retour). CTA header → `/mon-chantier/nouveau`. Inscriptions
>    Google embarquées aussi (essai + welcome). Détail : `WIP.md` § Activation GMC.
> 2. **STRIPE -50% (1er mois : 6 € au lieu de 12 €)** : trancher l'implémentation. Reco = **coupon Stripe
>    `duration: once`** appliqué via la checkout (même prix 12 €/mois + coupon, PAS un produit séparé).
>    Julien penche pour un **code réduction sur le produit** (à évaluer : plus simple ?). L'offre -50% est
>    portée par les emails J-3, J-1, trial_ended + relance J+60 (cf. brief Claude Design).
> 3. **Reste activation (Phase B, Stripe)** : intégration **Stripe** + **gates** (lecture seule J30, gate 2e
>    chantier) ; **emails conversion/winback/payant** (J-7/J-3/J-1/fin, winback, paid_welcome/renewal/dunning/
>    goodbye) déclenchés par le scheduler/webhooks Stripe ; `getGmcStatus` + compteur essai visible ;
>    `RESEND_API_KEY` sur **Vercel** (notif /avis) ; nettoyer `AddIntervenantModal` + `migration repair`
>    (lot 12/13/14/15 + 0613090000). ✅ FAIT cette session : scheduler engagement (J1/J3/J7/J14) live, OAuth
>    Google, tunnel auth-first + cohérent, budget estimation affiché, enquête /avis.

> Plan d'implémentation **figé Phase 2 (2026-05-20)** — décisions ci-dessous validées par Johan, à confirmer par Julien avant attaque code (cf. message en bas du document). ⚠️ Voir MAJ ci-dessus : archi essai/trigger superseded, SKU/paywall encore valides.

### Décisions Phase 2 — non-négociables sans validation explicite

- [ ] **Trial 15 jours sans CB** — ancre = `auth.users.created_at` (pas de colonne dédiée `trial_started_at`). Trial actif si `(NOW() - users.created_at) < 15 days`. Aucun field à ajouter sur `subscriptions` pour ça. ⚠️ Conséquence assumée : un user qui s'inscrit VMD et arrive sur GMC > 15j après n'a plus de trial GMC. Acceptable car flux VMD→GMC marginal en V1.
- [ ] **Trial row** = `status='trial'`, `plan='trial'` (générique). Le vrai plan (Essentiel/Multi) est choisi au checkout Stripe.
- [ ] **4 SKU Stripe** alignés avec la landing GMC (`Pricing.astro`) :
  - `gmc_essentiel_monthly` 12 €/mois (1 chantier)
  - `gmc_essentiel_annual` 120 €/an
  - `gmc_multi_monthly` 25 €/mois (chantiers illimités)
  - `gmc_multi_annual` 210 €/an
  - 4 nouvelles env vars : `GMC_STRIPE_PRICE_ESSENTIEL_{MONTHLY,ANNUAL}_ID`, `GMC_STRIPE_PRICE_MULTI_{MONTHLY,ANNUAL}_ID`
- [ ] **Post-trial = read-only + paywall sur écritures** (PAS blocage total). Endpoints GET = 200 OK. Endpoints POST/PATCH/DELETE premium = 403 + payload `{ accessState: 'trial_expired', upgrade_url }`. Justification : conformité RGPD (data hostage = mauvaise pratique B2C) + meilleure conversion (l'user voit ce qu'il rate).
- [ ] **Grace period past_due** = 7 jours (Stripe `past_due` après échec de paiement → l'user garde l'accès 7j le temps de mettre sa carte à jour, puis bascule en `trial_expired`).
- [ ] **Quota IA pendant trial** = appels coûteux uniquement, 30/mois calendaire (UTC) :
  - **Comptabilisé** : `chantier/generer`, `chantier/ameliorer`, `chantier/[id]/regenerer`, `documents/[docId]/analyser`, `assistant/message` (agent-orchestrator)
  - **Gratuit pendant trial** : `chantier/conseils`, `chantier/qualifier`, `documents/[docId]/describe`, `documents/[docId]/extract-invoice`
  - Subscribed = 500/mois (anti-abus). Beta = illimité. Admin = illimité.
  - Indicateur quota visible dans le header cockpit ("12/30 analyses IA ce mois", devient orange < 5 restantes).
- [ ] **Analytics segmentation stricte** : tous les events Amplitude/tracking incluent `userTier: 'trial' | 'beta' | 'active' | 'expired' | 'admin'`. Aucun mélange. Permet de mesurer conversion trial→active séparément par segment.
- [ ] **Grandfathering** : INSERT explicite Johan + Julien par email dans la migration Phase A (`is_beta_tester=true`, `beta_expires_at=NULL`). Pas de trigger auto.
- [ ] **Réponse HTTP paywall** = 403 Forbidden (pas 402). Payload JSON explicite `{ error: 'trial_expired', upgrade_url, accessState }`.

### Hors scope Phase 3 (à coder plus tard)

- [ ] **Limite chantier Essentiel** : pendant V1 paywall, tous les plans = chantiers illimités. La limite "1 chantier" du tier Essentiel sera codée dans une phase ultérieure (upsell modal "Passer en Multi" à la création du 2e chantier).
- [ ] **Pré-câblage onboarding** : la question "un seul / plusieurs chantiers" de `ScreenOnboarding` est posée mais n'est PAS encore persistée. À ajouter quand on codera la limite chantier (point précédent).
- [ ] **Notification email "trial expire dans 3j"** : pas en V1, à ajouter Phase 5+ si besoin retention.
- [ ] **Coupons/promos** : pas en V1.

### Bandeau J restants pendant trial

- [ ] **Composant `TrialBanner`** dans le header cockpit : affiche "Il vous reste X jours d'essai" + CTA "Choisir une formule". Discret, sticky top. Caché pour beta/admin/active.

---

## Portefeuille multi-chantier — durcissements (🟡, issus de la revue finale 2026-06-24)

Feature livrée (cf. `WIP.md` + `FEATURES.md § 2bis`). Aucun bloquant ; ces points sont des durcissements / clarté, à faire si le besoin remonte.

- [ ] **Dégradation silencieuse du fan-out self-call** : les routes `/api/portfolio/{summary,cashflow}` appellent les endpoints publics du serveur avec le Bearer du user. Si ce self-call est bloqué (Vercel **Deployment Protection sur les previews**, WAF, challenge Cloudflare), tous les chantiers tombent en `fetchError` → lignes "Indisponible" + totaux à 0, mais la route répond quand même 200. OK en prod publique. *Fix* : bannière "données temporairement indisponibles" si **tous** les chantiers sont en fetchError ; à terme, appeler la logique directement plutôt qu'en HTTP.
- [x] ~~**Coût/timeout du fan-out à >15 chantiers**~~ — fait 2026-06-24. Mode `?fields=totaux` sur `/budget` (skippe la génération des signed URLs = le gros du coût ; `summary` le passe) + mode `?lite=1` sur `/payment-events` (skippe preuves/signed URLs/enrichissement, garde `montant` pour `amount_estimate` ; `cashflow` le passe). Comportement par défaut du cockpit inchangé (gated sur query param absent). Reste possible si besoin : table de cache portefeuille.
- [x] ~~**Deux chiffres "ce que je dois"**~~ — fait 2026-06-24. Sous-libellé sur le bloc trésorerie : « Basé sur l'échéancier prévisionnel (distinct du « À régler » facturé du tableau ci-dessous) ».
- [x] ~~**Sécurité fan-out porteur de token**~~ — fait 2026-06-24. Nouveau helper `internalFanoutBase(request)` (`apiHelpers.ts`) qui valide le Host contre une allowlist (+ localhost + `*.vercel.app`) avant de forwarder le Bearer ; Host inconnu → domaine canonique de prod (jamais un domaine arbitraire). Remplace `originFromRequest` dans `summary`/`cashflow`.
- [x] ~~**Chevauchement de conflits inclusif**~~ — fait 2026-06-24. `overlaps` passé en strict (`<`) : deux lots qui se touchent (fin = début) ne sont plus un conflit (l'artisan enchaîne). Test ajouté.
- [ ] **Polish v2 (faible valeur)** : aperçu "flouté" pour non-Multi au lieu de l'écran verrouillé ; pull-to-refresh ; cache des résumés ; expansion lot-par-lot de la frise Planning.

---

## Observatoire — suites de la refonte « publier un prix » (2026-09-07)

Le socle est livré (`src/lib/observatoire/statsPrix.ts` + pages métier, cf. `CLAUDE.md` § Observatoire). Ce qui reste :

- [x] ✅ **FAIT LE 2026-09-21 — les 7 dernières pages SEO muettes sont en rendu statique** (5 études + `/guides/` + `/guides/devis-travaux`, les chantiers l'étaient déjà). Mesuré sur les 102 URLs du sitemap **servi** : 13 rendaient une coquille vide ; la page pilier passe de 23 Ko sans un mot à **50,6 Ko indexables**. Détail et pièges (le wrapper `lazy()` qui ferait rendre le spinner, la vérification sur la chaîne d'imports) : `CLAUDE.md`.
- [ ] 🟡 **Deux pages produit restent muettes dans le sitemap** — `/premium` et `/calculette-travaux` servent une coquille vide (île `client:only`), mais `Premium` est **réellement interactive** (9 occurrences d'état) : elle ne peut pas être basculée en rendu statique. Le choix est **de la sortir du sitemap** (on ne demande pas l'indexation d'une page qu'on sait vide) ou d'en extraire une coquille statique avec l'île à l'intérieur. ⚠️ **`/suivi-budget` n'est plus du lot** : elle portait `noindex` et a été retirée du sitemap le 21/09 — le troisième cas s'est réglé tout seul, pour une raison qui n'avait rien à voir avec le rendu.
- [x] ✅ **FAIT LE 2026-09-21 — le troisième sitemap est supprimé** (décision Johan). `src/pages/sitemap.xml.ts` portait une liste écrite à la main, soumise dans Search Console à côté de `sitemap-index.xml` : `lastmod` figés (accueil au **10 avril** alors qu'elle a été refondue le 14/09), 92 de ses 107 URLs déjà couvertes ailleurs, 15 restantes sur **un autre domaine**. ⚠️ **Reste à faire côté Johan : le supprimer DANS Search Console** — la route répond 404, mais la ligne persiste dans le rapport tant qu'elle n'est pas retirée à la main. Détail : `CLAUDE.md`.
- [x] ✅ **FAIT LE 2026-09-21 — le sitemap et le canonical désignent enfin la même URL** (mesuré puis corrigé, décision Johan). La duplication était **réelle** : 97 pages sur 97 rendaient 200 dans les deux formes, contenu identique à l'octet près, aucune redirection. Le canonical (78/78) et nos **325 liens internes** disaient « sans slash », le sitemap était seul à dire l'inverse. La règle vit maintenant une seule fois dans [`urlCanonique.mjs`](src/lib/seo/urlCanonique.mjs), importée par `astro.config.mjs` et `BaseLayout`. Témoin après build : **0 divergence** sur les 98 URLs. Détail et pièges : `CLAUDE.md`.
- [x] ✅ **FAIT LE 2026-09-21 — `/suivi-budget` sort du sitemap** (décision Johan). ⚠️ **Mon diagnostic initial désignait le mauvais défaut** : j'avais annoncé « elle annonce `localhost` à Google, donc inindexable, correctif = lui passer un canonical explicite ». En ouvrant le fichier : la page porte **`noindex={true}`** depuis toujours. Le canonical `localhost` est réel mais sans portée ; le vrai défaut était qu'on **demandait l'indexation d'une page à laquelle on l'interdit** — la ligne « Exclue par la balise noindex » de Search Console, que nous fabriquions nous-mêmes. Mesuré : **une seule page** du sitemap dans ce cas. Sitemap 98 → 97. Détail : `CLAUDE.md`.
- [ ] 🟡 **Le piège `Astro.url` → `https://localhost` reste armé pour toute future page SSR** (constaté le 21/09). Une page en `prerender = false` qui ne passe **pas** de `canonical` explicite à `BaseLayout` produit `<link rel="canonical" href="https://localhost/...">` en production — `Astro.url` porte l'origine interne du runtime Vercel. `/premium` et `/calculette-travaux` y échappent parce qu'elles fournissent leur canonical. **Aucune page du sitemap n'est concernée aujourd'hui.** On n'ajoute PAS de garde (ce serait la « garde n°X inline » que `CLAUDE.md` proscrit) : c'est à savoir en créant une page SSR destinée à l'indexation. ⚠️ `originFromRequest` (`apiHelpers`) fait déjà ce travail côté API — si une garde devient nécessaire un jour, c'est de là qu'elle doit venir, pas d'une seconde implémentation.
- [x] ✅ **FAIT LE 2026-09-21 — chaque domaine a son sitemap** (décision Johan). Nouvelle intégration [`sitemapDeuxDomaines.mjs`](src/lib/seo/sitemapDeuxDomaines.mjs) : elle relit le sitemap produit par `@astrojs/sitemap` et le répartit d'après le **canonical** de chaque page — 97 → **79 URLs pour VMD + 18 pour GMC**, zéro fuite dans les deux sens. ⚠️ Deux signaux plus simples mesurés puis écartés : l'import `gmc-landing/Header` **rate les 10 pages `/centre-aide`**, et une liste écrite à la main serait ce qu'on venait de supprimer. `robots.txt` déclare les trois sitemaps en URL absolue. Détail et pièges : `CLAUDE.md`.
- [ ] 🟡 **PROPRIÉTÉ SEARCH CONSOLE POUR `gerermonchantier.fr` — commencée le 21/09, mise de côté, à reprendre.** Le sitemap GMC existe et est déclaré dans `robots.txt`, donc Google le lira en explorant le domaine ; mais **sans propriété GSC on ne verra jamais ce qu'il en fait** (ni pages indexées, ni requêtes, ni erreurs). État exact au moment de la pause :
  - Johan était sur l'écran **« Valider la propriété du domaine via l'enregistrement DNS »**, type **TXT**, valeur demandée commençant par `google-site-verification=eJ5qpgxUH5gbUh6VC2UoDPwjLbqvfMVSo7r…` (tronquée à l'écran — **utiliser le bouton COPIER**, pas la recopier).
  - 🔴 **LE DOMAINE PORTE DÉJÀ UN AUTRE ENREGISTREMENT DE VÉRIFICATION** : `google-site-verification=M7cTVBor7Sl_17JNEibzL7Tn6Z5TfdCYVJMv5NkhIxs`. **Ne pas l'écraser** — Google accepte plusieurs TXT de ce type, et remplacer celui-là casserait en silence la vérification à laquelle il sert. **Avant tout, regarder si une propriété GMC existe déjà** dans le sélecteur de Search Console : si oui, il n'y a rien à valider, juste le sitemap à soumettre.
  - **Marche à suivre chez OVH** (les NS sont bien `ns14.ovh.net`) : Espace client → Noms de domaine → `gerermonchantier.fr` → **Zone DNS** → Ajouter une entrée → **TXT** → **sous-domaine laissé VIDE** (la vérification porte sur la racine, pas sur `www`) → coller la valeur → TTL par défaut → puis **Valider** dans Search Console. La propagation prend de quelques minutes à quelques heures ; l'écran propose « Valider ultérieurement ».
  - Une fois validée : y soumettre `https://www.gerermonchantier.fr/sitemap-gmc.xml` (18 URLs, vérifié en 200 le 21/09).
- [ ] 🟡 **`robots.txt` est STATIQUE et servi sur les deux domaines** — il déclare donc, sur chaque domaine, des sitemaps de l'autre. Les robots les ignorent (un sitemap d'un autre hôte n'est pas une erreur), et c'est le compromis assumé le 21/09 : le rendre conditionnel demande une route SSR, donc un risque sur le fichier qui gouverne tout le crawl. **À rouvrir seulement si un outil s'en plaint** — pas par principe.
- [ ] 🟡 **Les 74 articles de blog sont en `prerender = false`** — un rendu serveur + une requête Supabase à **chaque** visite, pour un contenu qui change rarement. Ça marche (51 Ko servis, H1 présent, vérifié le 21/09) mais c'est du temps de réponse offert à chaque crawl. Les passer en `getStaticPaths` allongerait le build : **à mesurer avant de décider**, pas à faire par principe.
- [x] ✅ **FAIT LE 2026-09-21 — la taille du catalogue vient partout de `CATALOGUE_TAILLE`** (décision Johan). La demande portait sur `/guides` ; le défaut couvrait **six fichiers et dix occurrences**, avec **deux valeurs fausses** (891 ×4, 911 ×6) contre 926. ⚠️ **Deux des pages fautives importaient déjà la source unique** et gardaient des chiffres en dur dans le même fichier — le branchement du 08/09 avait traité ce que son motif voyait, pas ce que la page dit. Témoin sur le build servi : 0 occurrence fausse, 12 correctes, aucune fuite de gabarit. Détail et pièges : `CLAUDE.md`.
- [ ] **Rendre `mv_observatoire_postes_surfactures` publiable** ou la supprimer : aujourd'hui rien ne l'affiche (elle sortait « +503 % » sur 3 devis, et « Pose fenêtre +222 % » qui mesurait notre propre défaut de rapprochement). Pour la republier il faut comparer à périmètre égal — même unité ET même nature de prix (fourni+posé vs pose seule) — et exiger 8 observations.
- [ ] **Migration `20260907200000_observatoire_lignes.sql` non appliquée** (CLI `supabase` en `spawn UNKNOWN` ce jour-là). Elle unifie la classification du type de chantier dans une fonction SQL appelée par les deux vues. Non bloquante : le générateur des pages chantier calcule la classification côté TypeScript. À appliquer pour supprimer la définition SQL dupliquée dans `mv_observatoire_chantiers`.
- [ ] **Comparaison géographique** (Paris / grandes villes / province) demandée par Johan : **non publiable aujourd'hui**, seuls 3 couples (poste, unité) atteignent le seuil d'observations dans plus d'une zone. À reprendre quand le corpus aura doublé — la colonne `adresse_entreprise` existe déjà dans `mv_observatoire_base`.
- [ ] **Caractéristiques produit** (marque, double/triple vitrage, épaisseur d'isolant) : expliquées en texte sur les pages métier, mais **jamais mesurées** — il faudrait les extraire des descriptions libres des lignes de devis. Ce serait la vraie valeur ajoutée d'un observatoire ; à chiffrer avant de s'y engager.
---

## Audit des prix affichés sur le site — relevé du 2026-09-07

Demande Johan : « vérifie dans l'ensemble du site qu'il n'y ait pas de contradictions sur les fourchettes de prix (calculatrice vs blog vs base de prix) ». **59 fourchettes au m²** relevées dans les sources (hors observatoire).

**Ce qui est SAIN** — la calculette `/calculette-travaux` interroge `market_prices` en direct (catalogue + coefficient de zone) : elle ne peut pas diverger. Les cartes matériaux de `useMaterialSuggestions.ts` sont cohérentes avec le catalogue (carrelage 50-110 vs 46-94 ; bardage bois 60-120 vs 55-140). Les ratios « €/m² de logement » (250-400 rafraîchissement, 600-1 000 moyenne, 1 200-2 000 lourde…) sont identiques entre `budget-renovation` et `suivi-budget-travaux` : ce sont des coûts de PROJET par m² habitable, à ne pas confondre avec des prix de poste — ils ne contredisent pas le catalogue.

**Les contradictions réelles**, avec les trois sources en regard (catalogue = `market_prices` ; mesuré = observatoire, P10-P90) :

| Poste | `prix-travaux-maison` | `budget-renovation` | Catalogue | Mesuré (médiane) |
|---|---|---|---|---|
| Peinture murs/plafonds | **15-35** | **30-60** | 18-65 | 7-50 (**17**, 13 devis) |
| Carrelage posé | **50-130** (pose + fourniture) | **90-170** (sol + faïence) | 46-94 (fourni+posé) | 87-132 (112, 6 devis) |
| Parquet | 45-130 | — | 31-58 stratifié · 80-200 massif | — |
| Isolation intérieure | 40-120 | 60-110 (placo + isolation) | 35-110 | — |
| ITE | **90-220** | — | **90-180** | — |

- [ ] **Peinture — le plancher varie du simple au double entre deux de nos pages** (15 vs 30 €/m²), et la mesure donne une médiane de 17 €/m² : c'est `budget-renovation` (30-60) qui est haut, pas l'inverse.
- [ ] **Carrelage — 50-130 contre 90-170**, alors que le catalogue plafonne à 94 € pour du standard fourni+posé. Les deux pages dépassent le référentiel par le haut.
- [ ] **ITE 90-220 contre 90-180 au catalogue** : +22 % sur le plafond.
- [ ] **Parquet 45-130 mélange trois produits** (stratifié 31-58, contrecollé 50-135, massif 80-200) : la fourchette n'est pas fausse, elle n'est simplement comparable à rien.
- [ ] **`analyser-devis-travaux.astro:283` annonce « marché 65-75 €/m² » pour un carrelage standard** — une précision qui ne vient d'aucune de nos sources (catalogue 46-94). C'est une capture d'exemple, mais elle affiche le mot « marché ».
- [ ] **Formulation ambiguë** (pas une erreur) : `budget-renovation` L12 donne « Rénovation moyenne : 600-1 000 €/m² » et L22 « Rénovation moyenne : 800-1 300 €/m² ». Le second est qualifié « maison ancienne » — défendable, mais le libellé identique se lit comme une contradiction.

✅ **Source unique livrée le 2026-09-08** (`src/lib/prix/reference.ts` + `scripts/prix/generate-reference.ts`, 18 postes, 9 tests). Les tableaux et FAQ de `prix-travaux-maison`, `budget-renovation` et l'exemple d'`analyser-devis-travaux` lisent désormais le catalogue au build. Cf. `CLAUDE.md` § « Une seule valorisation ». Ce qui reste :

- [ ] **Décompositions de FAQ encore écrites à la main** dans `budget-renovation.astro` : « Combien coûte une rénovation de salle de bain ? » annonce un total de **6 400-16 800 €** et la cuisine **10 000-37 000 €**, quand le référentiel donne 3 900-9 100 € HT pour une SDB standard et 5 100-11 900 € HT pour une cuisine. L'écart s'explique sans doute par la TVA et l'équipement inclus — mais il n'est écrit nulle part, et les deux chiffres cohabitent sur le site. À reprendre avec un périmètre explicite (HT/TTC, équipement compris ou non).
- [ ] **Ratios « €/m² de logement »** (250-400 rafraîchissement, 600-1 000 moyenne, 1 200-2 000 lourde, 1 500-2 500 neuf) : cohérents entre `budget-renovation` et `suivi-budget-travaux`, mais sans source citée. Soit on les source, soit on les présente comme un ordre de grandeur d'origine éditoriale.
- [ ] **`budget-renovation` L13 vs L26** : « Rénovation moyenne 600-1 000 €/m² » puis « Rénovation moyenne 800-1 300 €/m² ». Le second est qualifié « maison ancienne » — défendable, mais le libellé identique se lit comme une contradiction. Renommer le second.
- [x] ~~**Regénérer `reference.json` après chaque enrichissement du catalogue**~~ — fait 2026-09-08 : [`.github/workflows/refresh-donnees-publiees.yml`](.github/workflows/refresh-donnees-publiees.yml), tous les lundis 05:00 UTC (après le cron Postgres de 04:00), avec les JSON de l'observatoire. ⚠️ **Reste à faire par Johan** : ajouter le secret `SUPABASE_SERVICE_ROLE_KEY` dans Settings → Secrets → Actions, sans quoi le workflow s'arrête proprement sans rien rafraîchir.

---

## Comment ce fichier fonctionne

- **Quand on ajoute un item** : description courte + fichier:ligne quand pertinent + effort estimé si on l'a.
- **Quand on attaque un item** : retirer d'ici, créer une entrée `🟡 En cours` dans `WIP.md`.
- **Quand on finit un item** : retirer du WIP, ajouter à `FEATURES.md` si user-facing.
- **Quand on bloque** : reste dans WIP.md avec `🔴` et la raison ; ne pas remettre dans TODO.md.

- [ ] **Relecture des fourchettes — 1er rendez-vous le 1er février 2027** : le cron `catalog-review-alert` (jobid 45, `0 8 1 2,8 *`) enverra à Johan + Julien les 25 entrées catalogue les plus utilisées dont la fourchette n'a pas été relue depuis 6 mois. À ce jour **916 des 919 entrées n'ont jamais été relues** — la liste sera donc pleine au premier envoi, mais classée par montant réellement rapproché : traiter les 5 à 10 premières suffit. Après correction : renseigner `last_reviewed_at` ET `source` (sinon l'entrée revient au tour suivant). ⚠️ Une fourchette se **source** (relevé public, barème de fédération, devis d'artisan) — jamais depuis nos propres analyses, ce serait circulaire. Test à la demande sans envoi : `POST /functions/v1/catalog-review-alert?dry_run=1`.


- [ ] **Centraliser la note Trustpilot (2026-09-07)** : `4,7` et `24 avis` sont répétés **en dur dans six fichiers** — `BaseLayout.astro`, `index.astro`, `verifier-devis-travaux.astro`, `analyser-devis-travaux.astro`, `comparer-devis-travaux.astro`, `logiciel-suivi-chantier.astro` (celui-ci annonce d'ailleurs `4,8 / 42`, à vérifier contre le profil GMC) — plus le helper `schemaOrg.ts` qui affichait `127` avant correction. Un seul constant partagé, ou mieux une lecture de l'API Trustpilot. **Enjeu** : un balisage `aggregateRating` qui ne correspond plus au profil devient un balisage faux, avec un risque de sanction manuelle Google. À chaque nouvel avis, six fichiers dérivent. ⚠️ Vérifié le 2026-09-07 : le profil public affiche bien 4,7 sur 24 — les valeurs actuelles sont JUSTES, c'est leur duplication qui est le risque.

- [ ] 🟡 **POSER UNE QUESTION À L'UTILISATEUR POUR LEVER UN DOUTE (2026-09-10, idée Johan — à trancher)** — mesuré sur les 150 lignes de l'étalon : **21 lignes (14 %) seraient tranchées par une question ciblée**, dont **15 sur le seul axe FOURNITURE vs POSE** (« le carrelage est-il fourni ? »), 5 sur une caractéristique non précisée (matière, mur porteur), 1 sur un périmètre. **8 de ces 21 sont chiffrées aujourd'hui** : un prix potentiellement faux est déjà affiché dessus. Portée bien plus large sur les quantités : **133 devis sur 220 (60 %) n'ont aucune quantité exploitable** (mesure du 30/08).
  **Recommandation : oui, mais APRÈS le verdict, jamais avant, et seulement là où la réponse change un montant.** Le funnel est la contrainte absolue (151 visiteurs → 1 analyse, mesuré le 06/09) : tout ce qui se met entre le dépôt et le verdict le tue. Placée après, sur la ligne concernée, en un clic, la question devient un signal de sérieux au lieu d'un péage.
  ⚠️ **Quatre règles sans lesquelles ça se retourne contre nous** : (1) **ne JAMAIS demander ce que le devis dit déjà** — le garde existe (`surfaceEcriteNonExtraite`, `diagnostiquerQuantites`) et il a été écrit pour ça ; (2) **deux ou trois questions maximum**, et seulement si le montant en jeu le justifie — une question sur une ligne à 57 € coûte plus qu'elle ne rapporte ; (3) **questions fermées uniquement**, avec « je ne sais pas » comme réponse de plein droit qui ne dégrade RIEN — beaucoup d'utilisateurs ne savent pas, c'est même pour ça qu'ils sont là ; (4) jamais de champ libre.
  🟢 **Bénéfice second, peut-être le plus important** : chaque réponse est un exemple étiqueté. C'est ainsi qu'on construit l'étalon à l'échelle, au lieu d'un après-midi de relecture à la fois.
  **Mais ça ne remplace pas le catalogue** : 42 des 77 lignes de consensus n'ont AUCUNE entrée valable, et aucune question n'y changera quoi que ce soit. Les questions traitent 14 % des lignes, le catalogue 55 %.

## File de revue — ce qui reste après le tri du 2026-09-17

- [x] ✅ **TRANCHÉ LE 2026-09-17 — les 65 différées sont passées en `auto_approved`** (décision Johan, option (c) ci-dessous). Elles promettaient « une réponse sous 24 h ouvrées » depuis quatre mois et masquaient leur montant : laisser le bandeau revenait à maintenir une promesse fausse. Script [`clore-revues-differees.mjs`](scripts/clore-revues-differees.mjs) — 65/65, conclusions inchangées, aucun e-mail envoyé.
  - **Ce que ça a changé pour les clients, mesuré AVANT d'appliquer** : 27 analyses affichent un montant jusqu'ici masqué (**117 595 €**, dont un devis à 26 099 €), 38 ne changent rien visuellement (écart sous le plancher de 300 €), et **20 verdicts « à risque » s'affichent désormais sans mention de relecture**.
  - Les options étaient : (a) laisser en l'état, (b) reformuler le bandeau au-delà de 30 jours, **(c) repasser en `auto_approved`** et assumer que le moteur d'aujourd'hui vaut mieux que celui qui les a flaggées.
  - ⚠️ **Ne pas confondre avec le rattrapage du 10/09** : celui-là écrivait à des gens qu'on avait vraiment laissés sans réponse après une VRAIE décision d'expert. Ici, personne n'a tranché.
- [ ] 🟡 **Instruire les 30 analyses qui portent encore des postes accusés** — 67 postes, **116 974 €**, dont un seul devis (`DV0003541`, 02/06) en porte 17 : c'est la matière la plus dense du stock pour le gold standard. Elles sont désormais `auto_approved`, donc **leur montant est PUBLIÉ sans qu'aucun humain ne l'ait relu**. Pour les remettre en file : `update public.analyses set review_status = 'pending_review', review_differe_le = null where id in (…);` ⚠️ **cela RE-MASQUE leur montant sur la page du client** (règle du 30/08) — ne le faire que sur celles qu'on compte trancher dans la foulée.
- [x] ✅ **FAIT LE 2026-09-21 — les 3 jeux de gabarits e-mail parlent d'une seule voix** (décision Johan). Les 7 gabarits de `_shared/vmd-emails.ts` (welcome, négociation, comparaison, chantier, aides, pass, chantier_final) embarquaient le logo en **base64, que Gmail ne rend pas** : ils utilisent désormais l'URL du logo du site, avec l'écriture du site (`VerifierMon` + `Devis` orange + `.fr`). Fichier allégé de 14 Ko. Détail : `CLAUDE.md`.
- [x] ✅ **FAIT LE 2026-09-21 — plus aucune teinte hors charte dans les 9 gabarits e-mail** (décision Johan). Les 3 accents orange du corps (bordure d'encadré, label « Offre réservée », prix) passent de `#F58A06` à `#F97316`. Mesuré avant : l'orange du site **améliore** le contraste sur le fond ambre (2,52:1 contre 2,21:1). ⚠️ **Les deux restent sous le seuil WCAG AA** (4,5:1) — défaut préexistant, non corrigé. Le fond ambre est conservé : le site emploie amber pour ses encadrés et orange-500 pour la marque seule. Détail : `CLAUDE.md`.
- [x] ✅ **FAIT LE 2026-09-21 — un correctif dans `_shared/` redéploie enfin les fonctions qui en dépendent.** Le workflow `deploy-edge-functions` filtrait `_shared` (à raison : ce n'est pas une fonction) **sans rattraper les fonctions qui l'importent** — or **24 des 29** en importent un fichier. Modifier `_shared/vmd-emails.ts` affichait « Functions to deploy: » vide, **workflow VERT, rien de déployé**. ⚠️ Le cas était documenté dans le workflow depuis juin, mais interprété comme un faux échec rouge à neutraliser : personne n'a vu que **le succès vert était faux aussi**. Un `workflow_dispatch` accepte désormais une liste de fonctions à forcer (validée contre les répertoires réels, passée par l'environnement et non par `${{ }}` — sinon injection shell).
- [x] ✅ **MESURÉ LE 2026-09-21 — aucun correctif partagé n'est resté dormant définitivement** (demande Johan). Depuis le 21/05, **14 commits** ont touché `_shared/` : **7 ne déployaient rien**, 7 ne déployaient que la fonction touchée. Mais tous ont été **rattrapés** par une modification ultérieure d'une fonction dépendante — délai médian **3 jours**, maximum **17 jours** (`paid_welcome` GMC). ⚠️ Le rattrapage ne doit rien à une garde : il tient au fait que `vmd-email-scheduler`, `gmc-email-scheduler` et `agent-orchestrator` sont souvent modifiées. **Sur une fonction rarement touchée, le correctif serait resté dormant indéfiniment.** Détail : `CLAUDE.md`.

## Section Guides travaux — photos sources trop petites pour Retina (2026-09-23)

Trois des quatre photos du handoff sont insuffisantes pour l'affichage en
portrait 3/4 sur un écran à haute densité. La carte fait 274×365 px, donc
548×730 en DPR 2 ; en `object-fit: cover`, le facteur d'agrandissement est :

| photo | source | agrandissement |
|---|---|---:|
| comparer | 768×768 | **×0,95 — net** |
| prix | 1080×476 | ×1,53 |
| verifier | 626×417 | ×1,75 |
| artisan | 626×417 | ×1,75 |

⚠️ **Ce n'est pas bloquant** : net en DPR 1, et le voile sombre du bas de carte
masque la zone la plus regardée. Mais si le flou gêne sur un écran récent, il
faut redemander au client des fichiers d'au moins **550×730** — recadrés en
portrait, pas des panoramiques dont on jette les deux tiers.

## Hero — photo source trop petite pour un fond pleine largeur (2026-09-23)

La photo du handoff fait **896×1200**. En fond de hero `cover`, elle est
agrandie de **×1,4 (1280 px) à ×2,1 (1920 px)** — et le double sur un écran
à haute densité.

⚠️ **Atténué, pas résolu** : le voile navy couvre 34 % à gauche et se referme
dès 82 % à droite, donc le flou ne porte que sur la bande centrale, là où le
sujet apparaît. Si cela gêne, demander au client une source d'au moins
**1920 px de large**, cadrée en paysage — la photo actuelle est en portrait,
et `cover` n'en montre qu'un tiers de la hauteur.

🔴 **ET LE FORMAT PORTRAIT REND LE CADRAGE HORIZONTAL IMPOSSIBLE — mesuré sur
le rendu de production (capture 1440×920, 2026-09-23).** `cover` cale sur la
largeur, l'image occupe exactement les 100 %, il n'y a **aucun débord
horizontal à faire glisser** : le `background-position: 62%` du handoff est
**inerte**. Pour qu'il reprenne un sens, le hero devrait faire plus de
**1 928 px de haut** à 1 440 de large. Le commentaire du code qui affirmait
l'inverse a été corrigé.

**Conséquence, et elle est visible** : le sujet tombe entre **36 % et 52 %** de
la largeur, alors que le texte va jusqu'à **47,6 %** (la ligne « Entreprise
vérifiée — … certifications RGE »). Les deux se recouvrent sur 11 points, et
c'est le voile qui arbitre : à 36 % il est à ~0,95 d'opacité, à 52 % à ~0,32.
**La moitié gauche du visage est donc volontairement noyée pour que le H1
reste lisible** — ce n'est pas un défaut de réglage, c'est le prix du
recouvrement. Éclaircir les arrêts du voile rendrait le titre illisible.
La carte, elle, démarre à 756 px : elle affleure la main sans la couper.

**Le seul vrai remède est la source paysage** ci-dessus, avec le sujet cadré à
droite. Tant qu'elle n'existe pas, ne pas « régler » le voile ni le `62 %`.

## Accessibilité — ce que la passe contraste du 2026-09-23 n'a PAS traité

Le critère **1.4.3 (contraste)** est à zéro échec sur 19 pages publiques, vérifiable
par [`scripts/banc-contraste.mjs`](scripts/banc-contraste.mjs). Le site reste
**non conforme AA** : la conformité WCAG est tout-ou-rien par niveau, et trois
autres critères échouent — mesurés le 23/09, non corrigés.

- [ ] 🔴 **1.3.1 (niveau A) — structure.** Sauts de titres `h2 → h4` (« Navigation »)
      sur `/exemple-analyse` et `/analyser-devis-travaux` ; et le **sélecteur
      d'indicatif pays de `/inscription` n'a aucune étiquette**.
- [ ] 🔴 **2.4.1 (niveau A) — contournement de blocs.** `/inscription` ne rend
      **aucun landmark** : ni `<main>`, ni `<nav>`, ni `<footer>`, et pas de lien
      d'évitement. C'est une page React `client:only`. Les pages Astro, elles,
      ont leurs landmarks.
- [ ] 🟠 **2.5.8 (niveau AA, WCAG 2.2) — taille des cibles.** 40 cibles sous
      24 px sur les 4 pages mesurées, dont les **puces du carrousel du hero à
      8 px**. Un `padding` suffit dans la plupart des cas (la zone tactile peut
      dépasser le visuel).
- [ ] 🟡 **Le cockpit GMC n'a jamais été mesuré.** Ses surfaces sont SOMBRES :
      `text-slate-400` y vaut 5,71:1 et y est conforme. ⚠️ **Ne surtout pas y
      appliquer les règles de la passe publique** — la mesure du 23/09 a montré
      trois régressions de ce type, rattrapées une par une. Mesurer d'abord.
- [ ] 🟡 **Décision produit — le CTA orange.** `#F97316` ne peut pas porter du
      texte blanc à 4,5:1 (2,80). Il est passé en `#C2410C`. Alternative si le
      rendu déplaît : garder l'orange de marque avec un **texte navy** (5,76:1).
- [ ] 🟡 **Reste à trancher : jusqu'où viser.** Une déclaration de conformité
      RGAA suppose d'auditer les ~50 critères, dont les 70 % que l'automatique
      ne voit pas (ordre de lecture, pièges clavier, qualité des messages
      d'erreur). ⚠️ Vérifier d'abord si l'European Accessibility Act s'applique
      (services de commerce électronique depuis le 28/06/2025, **exemption
      microentreprise** < 10 salariés et ≤ 2 M€) — c'est ce qui décide du
      niveau d'effort, et ce n'est pas à moi de le trancher.
