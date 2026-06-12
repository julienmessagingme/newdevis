# Expérience d'activation GMC : tunnel + essai + emails

> Statut : plan validé (décisions tranchées le 2026-06-12). À exécuter par phases.
> Périmètre : le parcours complet entre "je découvre GMC" et "je suis client payant".

## 1. Objectif

Transformer le visiteur en utilisateur actif puis en client payant, via :
1. un **tunnel d'onboarding** clair (création du 1er chantier),
2. un **essai gratuit d'1 mois sans CB** (1 chantier), avec compteur visible,
3. une **séquence d'emails** de cycle de vie (gratuit puis payant) qui pousse à la conversion et à la rétention.

## 2. Décisions verrouillées

| # | Décision |
|---|---|
| 1 | Essai + email de bienvenue déclenchés **au signup**, côté serveur (`webhook-registration.ts`, couvre email + Google OAuth). |
| 2 | Essai = **tout GMC sur 1 seul chantier**, 30 jours. 2e chantier = offre Multi payante. À J30, le chantier passe en **lecture seule** + bandeau S'abonner (Essentiel 12 €), pas de blocage total. |
| 3 | Produits **séparés** GMC / VMD : ajout d'un champ `product` ('gmc' / 'vmd') sur `subscriptions`. |
| 4 | Email = **Resend** (déjà branché, `RESEND_API_KEY` sur Supabase), après **vérification du domaine gerermonchantier.fr**. Séquences pilotées par un **scheduler maison** (fonction Supabase planifiée). |
| 5 | Tunnel = crée **toujours 1 chantier** ; "plusieurs chantiers" = note d'info + flag d'intention. |

## 3. Modèle d'abonnement / essai

Table `subscriptions` existante : `user_id, status ('active'|'inactive'|'trial'), plan, trial_ends_at, current_period_end, lifetime_analysis_count`. `getPremiumStatus()` calcule déjà `trialDaysLeft`.

**Changements :**
- Ajouter `product text not null default 'vmd'` (clé logique : `(user_id, product)` unique au lieu de `user_id` seul). Un user peut avoir une ligne GMC ET une ligne VMD indépendantes.
- Ajouter `trial_started_at timestamptz` (pour cadencer les emails par offset de jour ; aujourd'hui on n'a que `trial_ends_at`).
- Essai GMC : `status='trial'`, `plan='gmc_essentiel'`, `trial_started_at=now()`, `trial_ends_at=now()+30j`.
- `start-trial.ts` : passer 14j → 30j et accepter un `product`.

**Deux gates de paywall :**
1. **2e chantier** (à tout moment) : créer un chantier alors qu'il en a déjà 1 et n'est pas en plan Multi → écran d'upsell Multi (25 €).
2. **Fin d'essai J30** : `status='trial'` et `now > trial_ends_at` → cockpit en **lecture seule** (lecture OK, actions premium bloquées : nouveau chantier, génération IA, envois WhatsApp/email) + bandeau S'abonner Essentiel (12 €).

Gating côté front via `usePremium` + un garde serveur sur les routes d'action (`requireActiveOrTrial`).

**Offre de conversion -50% (emails J-3 et J-1)** : on pousse une réduction de 50% sur le 1er mois (6 € au lieu de 12 €). Côté Stripe, le plus propre = **un seul prix récurrent (12 €/mois) + un coupon "1er mois -50%"** (`duration: once`, appliqué sur la facture initiale via la checkout session), PAS un produit/prix séparé. Donc ce n'est pas "des produits Stripe différents" : c'est le même prix + un coupon. Le CTA des emails J-3/J-1 pointe vers une checkout qui applique ce coupon. À câbler dans la partie Stripe.

## 4. Tunnel d'onboarding (refactor)

Aujourd'hui : 1 seul écran (`ScreenOnboarding.tsx`) avec 3 questions, et la réponse mono/multi est **collectée mais jamais utilisée**. Flux réel : Onboarding → Prompt (description + budget) → Generating → Cockpit.

**Cible : une question par écran, machine à états, branchement dynamique.**

Écran d'état dans l'orchestrateur (`NouveauChantier.tsx`), config déclarative des étapes :

1. **Q1 : Vous gérez ?** `un seul chantier` / `plusieurs chantiers`.
   - Si `plusieurs` → afficher une **note douce inline** : "L'essai gratuit couvre 1 chantier ; le multi-chantiers fait partie de l'offre Multi, activable quand vous voulez." Puis on continue exactement comme un mono. Stocker `multiIntent=true`.
2. **Q2 : Avez-vous déjà un budget ?** (reformulation de l'ancienne question "devis")
   - `Oui, budget défini / j'ai des devis` → on pourra proposer l'upload des devis ensuite.
   - `Non, pas encore défini` → le parcours **commence par l'estimation de budget** (l'IA propose un budget de départ).
3. **Q3 : Où en êtes-vous du démarrage ?** `date de début` / `date de fin souhaitée` / `pas encore`. Champ date si besoin. Alimente `qualificationAnswers` (date_debut / date_fin) consommé par `chantier-generer`.
4. → Écran **Prompt** (description du projet, sans la mention "en français" déjà retirée) puis génération.

Note : les écrans legacy non utilisés (`ScreenModeSelection`, `ScreenQualification`, `ScreenWow`, `ScreenAmeliorations`, `ScreenEditPrompt`) sont à nettoyer ou à réintégrer explicitement.

## 5. Déclencheurs serveur

- **Signup** (`api/webhook-registration.ts`, déjà existant) : à la création d'un compte → (a) créer la ligne `subscriptions` GMC en `trial` 30j, (b) envoyer l'email de **bienvenue** immédiatement (Resend). Couvre email + Google OAuth car c'est un hook serveur, pas le front.
- **Stripe webhook** (`api/stripe-webhook.ts`, existant) : 
  - `checkout.session.completed` / `subscription active` → `status='active'` + email **confirmation/bienvenue premium** + **stoppe la séquence gratuit**.
  - `invoice.payment_failed` → email **dunning**.
  - `customer.subscription.deleted` → email **au revoir + win-back**.

## 6. Plan email (le cœur)

### Principe anti-doublon / suppression
Un user est dans **un seul état** : `trial` → puis `active` OU `expired`. Le scheduler tourne **une fois par jour**, et **re-vérifie l'état courant avant chaque envoi** (pas de file pré-remplie). Conséquence : dès que `status` passe à `active`, les emails de la séquence gratuit ne sont plus sélectionnés → **ils s'arrêtent automatiquement**. Idempotence via une table `email_log(user_id, email_key, sent_at)` : on n'envoie jamais deux fois le même `email_key`.

Le **welcome (J0)** et les emails **événementiels** (confirmation paiement, échec paiement, annulation) sont envoyés en **temps réel par les webhooks**, pas par le cron.

### Séquence ESSAI GRATUIT (status=trial, product=gmc) — J0 = jour du signup

| Jour | email_key | Objet (exemple) | But | CTA |
|---|---|---|---|---|
| J0 (webhook, immédiat) | `gmc_welcome` | Bienvenue sur GérerMonChantier, votre mois offert démarre | Accueillir, poser le cadre (1 mois, 1 chantier), 1re action | Accéder à mon chantier |
| J1 | `gmc_activate` | Votre Pilote est prêt, décrivez votre chantier | Atteindre le "aha" (structuration auto par l'IA) | Ouvrir le cockpit |
| J3 | `gmc_value_features` | 3 choses que votre Pilote fait pour vous | Adoption (WhatsApp, budget, planning) | Voir mes lots |
| J7 | `gmc_trust` | Comment piloter ses travaux sans stress | Confiance, réengagement | Découvrir |
| J14 | `gmc_midtrial` | Vous êtes à mi-essai, voici votre chantier en chiffres | Recap valeur + features non utilisées | Compléter mon chantier |
| J23 (J-7) | `gmc_trial_j7` | Plus que 7 jours d'essai gratuit | Annoncer la fin, montrer l'offre (12 €) | Choisir mon offre |
| J27 (J-3) | `gmc_trial_j3` | Votre essai se termine dans 3 jours | Pousser la conversion, lever les objections (sans engagement, résiliable) | S'abonner |
| J29 (J-1) | `gmc_trial_j1` | Dernier jour : gardez votre chantier actif | Rappeler ce qu'il perd (lecture seule) | S'abonner |
| J30 | `gmc_trial_ended` | Votre essai est terminé, reprenez à -50% | Convertir à l'expiration (offre -50%) | Réactiver à -50% |
| J33 (J+3) | `gmc_winback_1` | Votre chantier vous attend | Récupérer | Réactiver |
| J37 (J+7) | `gmc_winback_2` | On garde votre chantier encore un peu | Relance | Réactiver |
| J60 (~1 mois apres fin d'essai) | `gmc_winback_offer` | On vous remet -50% sur votre 1er mois | Derniere relance commerciale (offre -50%) | Reprendre a -50% |

**Triggers comportementaux (en plus du calendrier, événementiels) :**
- 2e chantier tenté → `gmc_upsell_multi` : "Pilotez tous vos chantiers avec l'offre Multi" (25 €).
- `multiIntent=true` (coché au tunnel) → `gmc_multi_nudge` vers J10 : valoriser le multi-chantiers.
- Inactif 5 jours (pas de connexion) → `gmc_reengage` : "Votre chantier n'attend que vous".

### Séquence PAYANT (status=active, product=gmc) — déclenchée par Stripe

| Moment | email_key | Objet | But | CTA |
|---|---|---|---|---|
| Immédiat (webhook) | `gmc_paid_welcome` | C'est officiel, votre abonnement GMC est actif | Reçu, rassurer, débloquer la suite | Ouvrir le cockpit |
| J2 | `gmc_paid_onboard` | Débloquez tout le potentiel de votre Pilote | Features premium (multi, journal IA, intégrations) | Explorer |
| J14 | `gmc_paid_checkin` | Votre chantier, 2 semaines après | Rétention, conseils | Voir mon avancement |
| J-3 avant `current_period_end` | `gmc_renewal_notice` | Votre abonnement se renouvelle le {date} | Transparence anti-litige | Gérer mon abonnement |
| Stripe `payment_failed` | `gmc_dunning` | Action requise : votre paiement n'a pas abouti | Récupérer le paiement | Mettre à jour le moyen de paiement |
| Stripe `subscription.deleted` | `gmc_goodbye` | Votre chantier reste accessible, dites-nous tout | Récupérer + collecter du feedback | Réactiver / Donner mon avis |

### Brief par email (pour Claude Design, HTML)
Chaque template suit la même charte : logo GMC en tête, fond clair, 1 message + 1 CTA orange (#F58A06) dominant, ton chantier/artisan (concret, pas corporate), responsive, footer avec lien de désabonnement (obligatoire RGPD) + adresse. Variables disponibles : `{prenom}`, `{nom_chantier}`, `{jours_restants}`, `{date_fin_essai}`, `{lien_cta}`, `{lien_desinscription}`. Le détail "but + contenu clé + CTA" de chaque `email_key` est dans les tableaux ci-dessus : à transmettre tel quel à Claude Design, un template par `email_key`.

## 7. Resend : mode opératoire

**Ce que Julien fait (une fois) :**
1. Dans Resend → Domains → ajouter `gerermonchantier.fr` → copier les enregistrements DNS fournis (SPF TXT, DKIM CNAME(s), un enregistrement `send`/return-path, DMARC recommandé).
2. Ajouter ces records sur Cloudflare (DNS du domaine), puis cliquer **Verify** dans Resend.
3. Choisir l'expéditeur : `bonjour@gerermonchantier.fr` (lifecycle) + un reply-to surveillé (alias forwardé, ex: `support@gerermonchantier.fr`).
4. Fournir les **templates HTML** (faits par Claude Design d'après les briefs ci-dessus).

> Aujourd'hui Resend envoie depuis `onboarding@resend.dev` (sandbox, alertes admin uniquement). Tant que le domaine n'est pas vérifié, impossible d'écrire aux clients.

**Ce que je code (moi, une fois domaine vérifié + HTML en main) :**
- Util d'envoi `sendEmail(template, to, vars)` (appel API Resend, `Idempotency-Key`).
- Welcome dans `webhook-registration.ts` ; emails événementiels dans `stripe-webhook.ts`.
- Fonction planifiée `lifecycle-emails` (Supabase scheduled / pg_cron, 1×/jour) : calcule l'offset de jour depuis `trial_started_at`, sélectionne les users par état + jour, envoie le bon `email_key` s'il n'est pas dans `email_log`.
- Table `email_log` (dédup) + table/const de cadence.
- Pas d'automation côté Resend : toute la logique de cadence et de suppression vit dans notre scheduler (on gate sur `subscriptions.status`).

## 8. Architecture technique (fichiers)

À créer/modifier :
- Migration SQL : `subscriptions.product`, `subscriptions.trial_started_at`, table `email_log`, unique `(user_id, product)`.
- `lib/integrations/subscription.ts` : prise en compte de `product`.
- `api/premium/start-trial.ts` : 30j + `product`.
- `api/webhook-registration.ts` : créer trial GMC + welcome.
- `api/stripe-webhook.ts` : transitions active / payment_failed / canceled + emails.
- `lib/email/` (nouveau) : `sendEmail.ts` (Resend), `templates/`, `cadence.ts`.
- `supabase/functions/lifecycle-emails/` (nouveau) : le cron quotidien.
- Tunnel : `NouveauChantier.tsx` (machine à états) + un écran par question dans `chantier/nouveau/`.
- Garde paywall : `lib/auth/requireActiveOrTrial` + intégration `usePremium` (lecture seule J30, gate 2e chantier).

## 9. Exécution par phases

- **Phase 1 — Tunnel** : refactor un-écran-par-question + branchement mono/multi + reformulation budget. (Indépendant, livrable seul.)
- **Phase 2 — Essai & gates** : `product` + 30j + déclenche au signup + compteur visible (bandeau + Settings) + lecture seule J30 + gate 2e chantier. 
- **Phase 3 — Emails** : domaine Resend vérifié → util + welcome + webhooks Stripe + cron lifecycle + dédup. (Dépend des HTML de Claude Design.)

## 10. Ce qui bloque / dépendances

- **Julien** : (1) vérifier `gerermonchantier.fr` sur Resend (DNS Cloudflare) ; (2) fournir les templates HTML (briefs §6) ; (3) trancher l'expéditeur + reply-to.
- **Moi** : tout le reste (SQL, tunnel, gates, util email, webhooks, cron) est implémentable sans dépendance externe, et le câblage Resend dès que (1) et (2) sont là.
