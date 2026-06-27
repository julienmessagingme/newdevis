# Brief Claude Design : emails HTML VerifierMonDevis (onboarding nouveaux comptes)

> À coller dans Claude Design pour produire les templates HTML. Tout en français.
> Livrable attendu : 1 layout de base réutilisable + 1 corps par email (7 emails, liste en bas).
> Ces HTML seront intégrés dans notre moteur d'envoi (Resend) qui substitue les variables `{{...}}`.

## Contexte

VerifierMonDevis (VMD) = service gratuit d'analyse de devis de travaux. Le particulier upload un devis, notre IA en extrait les lignes, vérifie l'entreprise (SIRET, santé financière, RGE, avis Google via des sources publiques officielles), compare les prix au marché (base de milliers de prix réels), et rend un **verdict 🟢🟡🔴 + un surcoût en euros + des points à discuter avant de signer**. Gratuit jusqu'à 5 analyses à vie, puis le **Pass Sérénité** (4,99 €/mois) débloque les analyses illimitées + le rapport PDF + le tri par type de travaux.

**Le destinataire** : quelqu'un qui vient de créer un compte parce qu'il a un devis sous les yeux et un doute (« trop cher ? risqué ? »). Il est chaud, concret, avec un projet de travaux réel. C'est le meilleur moment pour l'accompagner.

**Ton** : concret, rassurant, du côté du particulier face à l'artisan. Pas corporate, pas startup-bullshit. On vouvoie. On joue le rôle du tiers de confiance qui aide à décider.

## Objectif de la séquence (3 leviers, dans cet ordre de priorité)

1. **Onboarder** : faire vivre la valeur de l'analyse (verdict, surcoût, récap de négociation), pousser à analyser plusieurs devis.
2. **Orienter vers GérerMonChantier (GMC)** — c'est le produit principal : une fois le devis vérifié, on aide à piloter le chantier (planning, artisans, budget, aides). Essai 1 mois offert sans CB + offre -50% sur le 1er mois pour les utilisateurs VMD.
3. **Suggérer le Pass Sérénité** : monétisation secondaire pour les utilisateurs qui analysent beaucoup de devis.

## Charte visuelle (VerifierMonDevis)

- **Logo** : icône carrée + mot « VérifierMonDevis » (le « Mon » en bleu accent). URL d'image absolue HTTPS fournie à l'intégration : `https://www.verifiermondevis.fr/email/logo-vmd-icon.png`. Sous le logo, une baseline discrète : « L'avis d'expert sur vos devis ».
- **Couleurs** : foncé titres `#0E1730`, primaire/eyebrow bleu `#1B3FA1`, **accent CTA bleu `#2563EB`** (texte blanc), texte courant `#4B5563`, fond de page `#F5F7FB`, carte `#FFFFFF`, vert succès `#1FB664`, ambre (encadrés conseils) `#F59E0B` sur `#FEF3C7`.
- **Typo** : DM Sans (fallback Arial, Helvetica, sans-serif). Titres bold ~26px, corps regular ~15px, interligne aéré (~1.78).
- **CTA** : **un seul bouton dominant** par email, bleu plein `#2563EB`, coins ~12px, large, tap-friendly (min 44px de haut), bouton « bulletproof » compatible Outlook (VML).
- **Layout** : largeur max **600px**, centré, fond `#F5F7FB`, carte blanche arrondie (~16px), padding généreux. Header = logo. Footer = identité + désinscription + mentions légales.
- Accents utiles : encadré « features » (liste à puces vertes ✓), encadré conseil ambre (💡), encadré offre bleu encadré (pour l'offre -50% GMC), bloc tarif (pour le Pass).

## Contraintes techniques (email-safe, non négociable)

- Layout en **tables HTML** (pas de flexbox/grid). **CSS inline** pour tout le critique ; `<style>` dans `<head>` toléré uniquement pour le responsive + le dark mode.
- Compatible **Outlook** (boutons table-based / VML).
- **Preheader caché** (texte d'aperçu ~50-90 caractères) en tête de chaque email.
- Le sens doit tenir **sans images** (souvent bloquées). Images avec `alt`, URL absolue HTTPS, jamais porteuses du message seul.
- **Dark mode** : prévoir `@media (prefers-color-scheme: dark)`.
- Pas de JS, pas de formulaire.
- **Footer obligatoire** sur tous : lien `{{lien_desinscription}}`, « VerifierMonDevis », lien `{{lien_mentions}}` (mentions légales).
- **Règle de rédaction** : JAMAIS de tiret cadratin « — » ni demi-cadratin « – » dans le texte. Utiliser virgule, deux-points, parenthèses ou point.

## Variables (placeholders)

`{{prenom}}` (prévoir « Bonjour, » élégant si vide), `{{lien_desinscription}}`, `{{lien_mentions}}`. Les liens des boutons (CTA) sont **fixes par email** (donnés dans chaque template ci-dessous), pas des variables.

## Structure recommandée

Faire **un layout maître** (header logo + carte + composant bouton bulletproof + footer) puis décliner **un bloc corps par email**. Garantit la cohérence et limite le travail.

---

## Templates à produire (7)

### E0 — `vmd_welcome` (immédiat, à l'inscription)
- **Objet** : Bienvenue 👋 votre devis mérite un avis d'expert
- **Preheader** : Verdict, surcoût en euros, entreprise vérifiée : votre analyse vous attend.
- **Corps** : accueil chaleureux. Le destinataire a un devis et un doute, on est là pour ça (avis d'expert indépendant en 2 min). Crédibilité : **« plus de 2 500 devis déjà analysés, et chaque nouvelle analyse enrichit notre base de prix »** (plus elle grandit, plus l'estimation est juste, le particulier n'est plus seul face à l'artisan). Bloc « Votre analyse vous donne » (4 ✓) : un verdict clair 🟢🟡🔴 (signer/négocier/se méfier) ; le surcoût en euros (combien renégocier) ; les points à discuter avant de signer ; l'entreprise vérifiée (SIRET, santé financière, RGE, avis Google). Rappeler : gratuit, jusqu'à 5 analyses.
- **CTA** : Analyser mon devis → `https://www.verifiermondevis.fr/nouvelle-analyse`

### E1 — `vmd_negociate` (J+1)
- **Objet** : Avez-vous renégocié votre devis ?
- **Preheader** : Un récap prêt à copier-coller pour discuter le prix avec votre artisan.
- **Corps** : après chaque analyse, on prépare un **récap prêt à copier-coller** (verdict + montant à renégocier + points précis à discuter). Un bouton « Copier le message pour négocier » dans l'analyse, à coller dans un mail/WhatsApp à l'artisan. Encadré conseil ambre 💡 : un artisan ajuste bien plus souvent son prix face à un client qui sait précisément ce qui cloche. Si pas encore d'analyse : relance douce, c'est gratuit.
- **CTA** : Revoir mon analyse → `https://www.verifiermondevis.fr/tableau-de-bord`

### E2 — `vmd_compare` (J+3)
- **Objet** : La règle d'or : ne signez jamais le premier devis
- **Preheader** : 3 devis minimum. On vous aide à choisir le bon, pas le moins cher.
- **Corps** : la règle d'or des travaux = 3 devis minimum, pour choisir le bon (garanties, délais, références), pas le moins cher. Inviter à analyser chacun de ses devis (gratuit jusqu'à 5). Bloc « Pour aller plus loin » (3 ★, teaser Pass) : analyses illimitées ; tri par type de travaux (plomberie, élec, toiture) ; rapport PDF partageable (banque, conjoint). Préciser que ces options font partie du Pass Sérénité (4,99 €/mois), mais d'abord profiter des analyses gratuites.
- **CTA** : Analyser un autre devis → `https://www.verifiermondevis.fr/nouvelle-analyse`

### E3 — `vmd_chantier` (J+5) — PONT GMC + OFFRE -50%
- **Objet** : Le devis vérifié. Et le chantier ?
- **Preheader** : Vos analyses pilotent la suite : planning, artisans, budget. 1 mois offert.
- **Corps** : vérifier le devis = étape 1 sur 5. Un chantier = coordonner 5 à 10 artisans, tenir le budget (7 chantiers sur 10 dérapent en coût et délai), relancer, ne rien oublier. **GérerMonChantier** pilote tout (planning des lots, messagerie WhatsApp unifiée, trésorerie, rappels), l'IA fait le suivi, vous gardez la main. Bloc « Et le mieux » (3 ✓) : vos analyses VMD s'importent direct (artisan, montant, score déjà là) ; même compte, rien à recréer ; données hébergées en France. Puis **encadré offre bleu** : « Offre utilisateurs VerifierMonDevis » = **1 mois offert (sans CB), puis -50 % sur le 1er mois** avec prix barré **12 € → 6 €** (1er mois, puis 12 €/mois).
- **CTA** : Activer mon accès GérerMonChantier → `https://www.gerermonchantier.fr/gmc-abonnement?plan=essentiel&interval=month&offer=1`

### E4 — `vmd_aides` (J+8) — PONT GMC (aides)
- **Objet** : L'argent que l'État peut payer à votre place
- **Preheader** : MaPrimeRénov', CEE, Éco-PTZ : estimez vos droits en 1 minute.
- **Corps** : avant de signer, avez-vous vérifié vos aides ? 6 ménages éligibles sur 10 ne demandent jamais MaPrimeRénov' (méconnaissance / complexité). Notre simulateur calcule MaPrimeRénov' + CEE + Éco-PTZ cumulés en 1 minute selon le profil, de quoi faire baisser la facture avant même de négocier. Encadré vert 💶 : avec GérerMonChantier, ces aides s'importent directement dans le plan de financement (vous savez exactement combien il reste à sortir de votre poche).
- **CTA** : Calculer mes aides → `https://www.verifiermondevis.fr/?aides=1`

### E5 — `vmd_pass` (J+12) — PASS SÉRÉNITÉ
- **Objet** : Ne comptez plus vos analyses
- **Preheader** : Analyses illimitées + rapport PDF partageable, 4,99 € par mois.
- **Corps** : pour qui a pris le réflexe de vérifier ses devis. Bloc « Ce que débloque le Pass » (3 ✓) : analyses illimitées ; rapport PDF partageable (banque, conjoint, courtier) ; tri par type de travaux (classer/comparer par poste). **Bloc tarif** : Pass Sérénité, **4,99 €/mois**, sans engagement, annulable en 1 clic (mise en avant). Préciser : le cœur de l'analyse (verdict, vérif entreprise, prix marché) reste gratuit ; le Pass, c'est pour ne plus jamais signer à l'aveugle.
- **CTA** : Passer au Pass Sérénité → `https://www.verifiermondevis.fr/pass-serenite`

### E6 — `vmd_chantier_final` (J+18) — DERNIÈRE INVITATION GMC
- **Objet** : Votre chantier vous attend
- **Preheader** : Vérifier le devis, c'est l'étape 1. On vous offre la suite.
- **Corps** : récap, vous savez désormais ce que valent vos devis. La dernière pièce = piloter le chantier sans y laisser vos soirées. GérerMonChantier centralise tout (planning, artisans, budget, alertes), vos analyses VMD deviennent le point de départ, l'IA fait le suivi. Essai offert, sans CB. Ton non insistant (« si ce n'est pas le moment, gardez ce mail sous le coude »).
- **CTA** : Découvrir GérerMonChantier → `https://www.gerermonchantier.fr/beta`

---

## Notes d'intégration (pour cohérence avec notre système)

- Les 7 HTML seront portés dans notre module `supabase/functions/_shared/vmd-emails.ts` (un layout maître + un corps par id `vmd_welcome`/`vmd_negociate`/…). Garder les placeholders `{{prenom}}`, `{{lien_desinscription}}`, `{{lien_mentions}}` tels quels.
- E0 est envoyé immédiatement à l'inscription ; E1 à E6 par un cron quotidien (séquence basée sur la date d'inscription).
- Brancher les CTA exactement sur les URL données (E3/E6 pointent vers gerermonchantier.fr, le reste vers verifiermondevis.fr).
- Pas de désinscription sur E0 si tu le considères transactionnel ; sinon footer identique partout.
