# Setup — Rapport SEO hebdomadaire Google Search Console

Ce mode d'emploi active le rapport SEO hebdomadaire (chaque lundi 09:00 UTC,
email + stockage `seo_weekly_stats`).

## Vue d'ensemble

```
┌────────────────────┐   1×/sem   ┌──────────────────────┐   OAuth2   ┌─────────────────┐
│ pg_cron            │───────────▶│ Edge fn              │───────────▶│ Search Console  │
│ (lundi 09h UTC)    │            │ seo-weekly-report    │            │ API v3          │
└────────────────────┘            └──────────┬───────────┘            └─────────────────┘
                                             │
                                    ┌────────┴────────┐
                                    ▼                 ▼
                          ┌───────────────┐   ┌───────────────┐
                          │ seo_weekly    │   │ Resend        │
                          │ _stats (DB)   │   │ email HTML    │
                          └───────────────┘   └───────────────┘
```

## Étape 1 — Créer un Service Account Google (5 min)

1. Ouvrir la [Google Cloud Console](https://console.cloud.google.com/).
2. Créer un projet (ou en choisir un existant), par exemple **vmd-seo**.
3. Menu → **APIs & Services** → **Enabled APIs & services** → **+ ENABLE APIS AND SERVICES**.
4. Chercher **Google Search Console API** → **Enable**.
5. Menu → **IAM & Admin** → **Service Accounts** → **+ CREATE SERVICE ACCOUNT**.
   - Nom : `seo-weekly-reporter`
   - Rôle : *(aucun rôle Cloud requis)*
   - Cliquer **Done**.
6. Une fois créé, cliquer sur le service account → onglet **Keys** → **ADD KEY** → **Create new key** → **JSON**. Un fichier `.json` se télécharge.

Note l'adresse email du service account, du type :
`seo-weekly-reporter@vmd-seo.iam.gserviceaccount.com`

## Étape 2 — Autoriser le Service Account dans Search Console (2 min)

1. Ouvrir [Search Console](https://search.google.com/search-console) → sélectionner la propriété `verifiermondevis.fr` (ou `sc-domain:verifiermondevis.fr`).
2. Roue crantée **Paramètres** → **Utilisateurs et autorisations** → **AJOUTER UN UTILISATEUR**.
3. Coller l'email du service account.
4. Rôle : **Lecture seule** (suffit largement pour l'API).
5. Enregistrer.

## Étape 3 — Configurer les Function Secrets Supabase (3 min)

Depuis le JSON téléchargé à l'étape 1, extrais :
- `client_email` → variable `GSC_SERVICE_ACCOUNT_EMAIL`
- `private_key` → variable `GSC_PRIVATE_KEY` (garde les `\n` littéraux ou remplace par de vrais retours à la ligne, la fonction gère les deux)

Depuis la racine du projet :

```bash
npx supabase secrets set GSC_SERVICE_ACCOUNT_EMAIL="seo-weekly-reporter@vmd-seo.iam.gserviceaccount.com" \
  --project-ref vhrhgsqxwvouswjaiczn

# Attention aux quotes et échappements — utilise un fichier .env local temporaire si le shell râle :
npx supabase secrets set GSC_PRIVATE_KEY="$(cat private_key_value.txt)" \
  --project-ref vhrhgsqxwvouswjaiczn

npx supabase secrets set GSC_SITE_URL="sc-domain:verifiermondevis.fr" \
  --project-ref vhrhgsqxwvouswjaiczn
```

Vérifie que `RESEND_API_KEY` (ou `RESEND_API_KEY_VMD`) est déjà défini — c'est
le cas si les emails onboarding VMD marchent. Sinon :

```bash
npx supabase secrets set RESEND_API_KEY_VMD="re_xxx" --project-ref vhrhgsqxwvouswjaiczn
```

Optionnel — surcharger les destinataires :

```bash
npx supabase secrets set SEO_REPORT_TO="julien@messagingme.fr,bridey.johan@gmail.com" \
  --project-ref vhrhgsqxwvouswjaiczn
```

## Étape 4 — Déployer l'edge function

```bash
npx supabase functions deploy seo-weekly-report --project-ref vhrhgsqxwvouswjaiczn
```

## Étape 5 — Appliquer la migration DB (table + cron)

```bash
npx supabase db push --linked
```

Ce push crée `seo_weekly_stats` + schedule le cron `seo-weekly-report` (lundi 09h UTC).

## Étape 6 — Test manuel (30 s)

Déclenche la fonction manuellement pour valider la boucle end-to-end :

```bash
curl -X POST \
  "https://vhrhgsqxwvouswjaiczn.functions.supabase.co/seo-weekly-report" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Attendu :
- HTTP 200 avec `{ ok: true, week_start: "...", rows: N, elapsed_ms: XXX }`
- Un email arrive dans les inbox des destinataires
- Une ligne par cluster dans `seo_weekly_stats`

En cas de 500, les logs sont dans le Dashboard Supabase → Functions → seo-weekly-report → Logs.

## Vérifier que le cron est bien planifié

Depuis le SQL Editor Supabase :

```sql
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'seo-weekly-report';

SELECT jobname, runid, status, return_message, start_time
FROM cron.job_run_details
WHERE jobname = 'seo-weekly-report'
ORDER BY start_time DESC LIMIT 5;
```

## Que fait la fonction ?

1. S'auth sur Google via JWT RS256 signé avec la clé privée du service account.
2. Interroge Search Console API sur la semaine écoulée (lundi → dimanche N-1).
3. Récupère jusqu'à 25 000 lignes agrégées par (query, page).
4. Agrège en 5 clusters : `observatoire`, `guides`, `centre-aide`, `landing`, `autres` + total `global`.
5. Compare à la dernière ligne stockée pour chaque cluster (semaine précédente).
6. Upsert dans `seo_weekly_stats` (unique par week_start + cluster).
7. Envoie un email HTML avec vue globale + top 15 requêtes + top 10 pages.
8. Déclenche une alerte visuelle si impressions globales chutent > 20% vs semaine précédente.

## Analyse ultérieure

Toutes les données restent en base — pour un dashboard admin ou une requête ad-hoc :

```sql
-- Évolution du cluster observatoire sur 12 semaines
SELECT week_start, impressions, clicks, avg_position
FROM seo_weekly_stats
WHERE cluster = 'observatoire'
ORDER BY week_start DESC
LIMIT 12;

-- Comparaison globale entre 2 mois
SELECT date_trunc('month', week_start) AS mois,
       SUM(impressions) AS impressions,
       SUM(clicks) AS clicks,
       AVG(avg_position) AS pos_moy
FROM seo_weekly_stats
WHERE cluster = 'global'
GROUP BY mois
ORDER BY mois DESC;
```

## Coût

- Search Console API : **gratuite** (quota par défaut : 200 requêtes/jour/projet).
- Resend : ~0,001 € par email.
- Supabase edge function : quota inclus dans le plan Pro.

Coût total : **négligeable** (< 0,01 €/mois).
