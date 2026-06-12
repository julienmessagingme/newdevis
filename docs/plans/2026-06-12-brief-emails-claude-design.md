# Brief Claude Design : emails HTML GérerMonChantier

> À coller dans Claude Design pour produire les templates HTML. Tout en français.
> Livrable attendu : 1 layout de base réutilisable + 1 corps par email (liste en bas).

## Contexte

GérerMonChantier (GMC) = copilote IA de chantier : on décrit son projet de travaux, le Pilote structure les lots, le planning, le budget, et gère la communication avec les artisans (WhatsApp/email). Cible : particuliers et maîtres d'ouvrage, petits pros. Ton : **concret, rassurant, orienté chantier** (pas corporate, pas startup-bullshit). On vouvoie.

Ces emails couvrent : transactionnels (bienvenue, confirmation paiement, échec paiement) + cycle de vie (relances pendant l'essai gratuit d'1 mois, conversion, rétention).

## Charte visuelle

- **Logo** : carré bleu (icône maison + grue) + mot "GérerMonChantier". (URL d'image absolue HTTPS à fournir au moment de l'intégration.)
- **Couleurs** : primaire `#1B3FA1`, foncé `#0E1730` (titres/texte fort), **accent CTA `#F58A06`** (orange), texte courant `#4B5563`, fond de page `#F5F7FB`, carte `#FFFFFF`, vert succès `#1FB664`.
- **Typo** : DM Sans (fallback Arial, Helvetica, sans-serif). Titres bold, corps regular ~15-16px, interligne aéré.
- **CTA** : **un seul bouton dominant** par email, orange plein `#F58A06`, texte blanc, coins ~12px, large, tap-friendly (min 44px de haut). Bouton "bulletproof" compatible Outlook.
- **Layout** : largeur max **600px**, centré, fond de page `#F5F7FB`, carte blanche arrondie (~16px) avec padding généreux. Header = logo en haut. Footer = mentions + désinscription + adresse.

## Contraintes techniques (email-safe, non négociable)

- Layout en **tables HTML** (pas de flexbox/grid). **CSS inline** pour tout le critique ; un `<style>` dans `<head>` toléré uniquement pour le responsive et le dark mode.
- Compatible **Outlook** (boutons table-based / VML).
- **Preheader caché** (texte d'aperçu ~50-90 caractères) en tête de chaque email.
- Le sens doit tenir **sans images** (beaucoup de clients les bloquent). Images avec `alt`, URL absolue HTTPS, jamais porteuses du message seul.
- **Dark mode** : couleurs qui tiennent sur fond sombre (prévoir `@media (prefers-color-scheme: dark)` ou éviter texte foncé sur transparent).
- Pas de JS, pas de formulaire, pas de police lourde.
- **Footer obligatoire** sur tous : lien `{{lien_desinscription}}`, "GérerMonChantier", adresse société, lien mentions légales. (Les transactionnels purs type confirmation paiement peuvent ne pas avoir de désinscription, mais garder le footer identité.)

## Variables (placeholders)

`{{prenom}}`, `{{nom_chantier}}`, `{{jours_restants}}`, `{{date_fin_essai}}`, `{{date_renouvellement}}`, `{{montant}}`, `{{lien_cta}}`, `{{lien_desinscription}}`. Prévoir des valeurs par défaut élégantes si une variable est vide (ex : "votre chantier" si `{{nom_chantier}}` manque).

## Recommandation de structure

Faire **un layout maître** (header logo + carte + composant bouton + footer) puis décliner **un bloc corps par email**. Ça garantit la cohérence et limite le travail.

---

## Templates à produire

### Série ESSAI GRATUIT (ton : accompagnant, puis incitatif en fin d'essai)

1. **`gmc_welcome`** (J0, immédiat)
   - Objet : Bienvenue sur GérerMonChantier, votre mois offert démarre
   - Preheader : Votre Pilote IA est prêt à structurer votre chantier.
   - Corps : accueil chaleureux ; rappeler "1 mois offert, sans carte bancaire, 1 chantier inclus" ; 1 phrase sur ce que le Pilote fait (lots, planning, budget, suivi artisans) ; inviter à la 1re action.
   - CTA : Accéder à mon chantier

2. **`gmc_activate`** (J1)
   - Objet : Votre Pilote attend votre chantier
   - Preheader : Décrivez votre projet, recevez lots, planning et budget en 60 secondes.
   - Corps : pousser à décrire le projet pour obtenir le plan structuré ; montrer le bénéfice immédiat.
   - CTA : Décrire mon chantier

3. **`gmc_value_features`** (J3)
   - Objet : 3 choses que votre Pilote fait pour vous
   - Preheader : Messagerie artisans, suivi budget, planning qui se recalcule tout seul.
   - Corps : 3 bénéfices concrets (répondre aux artisans sur WhatsApp, suivre la trésorerie, planning auto), 1 ligne chacun.
   - CTA : Explorer mon cockpit

4. **`gmc_trust`** (J7)
   - Objet : Piloter ses travaux sans stress, c'est possible
   - Preheader : Comment d'autres gardent le contrôle de leur chantier.
   - Corps : réassurance, court témoignage ou cas d'usage, ce que GMC évite (retards, surcoûts, oublis).
   - CTA : Reprendre mon chantier

5. **`gmc_midtrial`** (J14)
   - Objet : Vous êtes à mi-parcours de votre essai
   - Preheader : Voici votre chantier en chiffres, et ce qu'il reste à explorer.
   - Corps : recap de la valeur (lots planifiés, budget estimé) ; pointer 1-2 fonctions non utilisées.
   - CTA : Compléter mon chantier

6. **`gmc_trial_j7`** (J-7)
   - Objet : Plus que 7 jours d'essai gratuit
   - Preheader : Gardez votre chantier actif, à partir de 12 € par mois.
   - Corps : annoncer la fin approche ; présenter l'offre Essentiel (12 €) ; sans engagement, résiliable en 1 clic.
   - CTA : Choisir mon offre

7. **`gmc_trial_j3`** (J-3)
   - Objet : Votre essai se termine dans 3 jours
   - Preheader : 12 € par mois, sans engagement, résiliable quand vous voulez.
   - Corps : urgence douce ; lever les objections (prix d'un café par semaine, sans engagement) ; rappeler ce qui est en jeu.
   - CTA : S'abonner

8. **`gmc_trial_j1`** (J-1)
   - Objet : Dernier jour : gardez votre chantier actif
   - Preheader : Demain, votre chantier passe en lecture seule.
   - Corps : dernier rappel ; expliquer factuellement ce qui se passe demain (lecture seule, données conservées).
   - CTA : S'abonner maintenant

9. **`gmc_trial_ended`** (J0 de fin / J30)
   - Objet : Votre essai est terminé, réactivez en 1 clic
   - Preheader : Vos données sont conservées, votre chantier vous attend.
   - Corps : ton non culpabilisant ; chantier en lecture seule, tout est sauvegardé ; réactivation immédiate.
   - CTA : Réactiver mon chantier

10. **`gmc_winback_1`** (J+3)
    - Objet : Votre chantier vous attend
    - Preheader : Tout est encore là, reprenez où vous en étiez.
    - Corps : relance légère ; rappeler la valeur ; réactivation simple.
    - CTA : Réactiver

11. **`gmc_winback_2`** (J+7, dernier)
    - Objet : On garde votre chantier encore un peu
    - Preheader : Dernière occasion de reprendre votre suivi.
    - Corps : dernière relance honnête ; éventuellement demander un retour (pourquoi pas convaincu).
    - CTA : Réactiver / Donner mon avis

**Comportementaux (événementiels) :**

12. **`gmc_upsell_multi`** (tentative 2e chantier)
    - Objet : Pilotez tous vos chantiers au même endroit
    - Preheader : L'offre Multi débloque les chantiers illimités.
    - Corps : expliquer que l'essai couvre 1 chantier ; l'offre Multi (25 €) débloque l'illimité + journal IA + intégrations.
    - CTA : Passer à Multi

13. **`gmc_multi_nudge`** (~J10 si intention multi cochée)
    - Objet : Vous gérez plusieurs chantiers ? On a ce qu'il faut
    - Preheader : Vue agrégée, bascule en un clic, un seul cockpit.
    - Corps : valoriser le multi-chantiers pour ceux qui l'ont signalé.
    - CTA : Découvrir l'offre Multi

14. **`gmc_reengage`** (inactif 5 jours)
    - Objet : Votre chantier n'attend que vous
    - Preheader : Quelques minutes suffisent pour avancer.
    - Corps : réengagement doux ; proposer une action rapide concrète.
    - CTA : Reprendre mon chantier

### Série PAYANT (ton : premium, rassurant, rétention)

15. **`gmc_paid_welcome`** (immédiat à la conversion)
    - Objet : C'est officiel, votre abonnement GMC est actif
    - Preheader : Merci, voici ce que vous débloquez.
    - Corps : remerciement ; confirmer l'offre choisie ; ce qui est débloqué ; rassurer (gestion/résiliation dans les réglages).
    - CTA : Ouvrir mon cockpit

16. **`gmc_paid_onboard`** (J+2 après conversion)
    - Objet : Débloquez tout le potentiel de votre Pilote
    - Preheader : Multi-chantiers, journal IA quotidien, intégrations.
    - Corps : 2-3 fonctions premium à activer, avec le bénéfice.
    - CTA : Explorer

17. **`gmc_paid_checkin`** (J+14 après conversion)
    - Objet : Votre chantier, deux semaines après
    - Preheader : Un point d'avancement et quelques astuces.
    - Corps : valoriser le progrès ; 1-2 conseils ; canal de support.
    - CTA : Voir mon avancement

18. **`gmc_renewal_notice`** (J-3 avant renouvellement)
    - Objet : Votre abonnement se renouvelle le {{date_renouvellement}}
    - Preheader : {{montant}}, rien à faire, tout est géré.
    - Corps : transparence anti-litige ; montant + date ; comment gérer/résilier.
    - CTA : Gérer mon abonnement

19. **`gmc_dunning`** (échec paiement Stripe)
    - Objet : Action requise : votre paiement n'a pas abouti
    - Preheader : Mettez à jour votre moyen de paiement pour garder l'accès.
    - Corps : factuel, non alarmiste ; expliquer la conséquence si non résolu ; étapes pour corriger.
    - CTA : Mettre à jour mon paiement

20. **`gmc_goodbye`** (annulation Stripe)
    - Objet : Votre chantier reste accessible, dites-nous tout
    - Preheader : On aimerait comprendre, et vous laisser la porte ouverte.
    - Corps : remerciement ; ce qui reste accessible et combien de temps ; demande de feedback ; réactivation possible.
    - CTA : Réactiver / Donner mon avis
