# SEO Agent Hebdomadaire — Setup

Agent IA autonome qui analyse GA4 + GSC chaque lundi et envoie un rapport HTML par email.

## Stack
- **GitHub Actions** (cron lundi 5h UTC = 7h Paris)
- **Service Account Google Cloud** (lecture GA4 + GSC)
- **MCPs** : `mcp-server-gsc` + `mcp-server-google-analytics`
- **Claude Code CLI** (modèle Haiku, ~$0.02/run)
- **Resend API** pour l'envoi email
- **GitHub Issue** comme backup du rapport

## Coûts
- GitHub Actions : gratuit (2000 min/mois inclus, 1 run = ~1m30s)
- Claude Haiku : ~$1/an (52 runs)
- Resend : gratuit (3000 mails/mois)

---

## Setup (à faire une fois)

### 1. Service Account Google Cloud

1. [Console GCP](https://console.cloud.google.com) → nouveau projet `verifiermondevis-seo-agent`
2. **APIs & Services** → activer :
   - Search Console API
   - Google Analytics Data API
3. **IAM** → Créer un Service Account : `seo-agent@verifiermondevis-seo-agent.iam.gserviceaccount.com`
4. Onglet "Keys" du SA → Add Key → JSON → télécharger
5. Donner accès lecture à ce SA :
   - **GA4** : Admin → Property Access Management → ajouter le SA en **Lecteur**
   - **GSC** : Settings → Users and permissions → ajouter le SA en **Restreinte**

### 2. Secrets GitHub

Repo Settings → Secrets and variables → Actions → New secret :

```bash
# IMPORTANT : utiliser printf (jamais echo, qui ajoute \n et casse les clés)

# 1. Anthropic API key
printf 'sk-ant-...' | gh secret set ANTHROPIC_API_KEY

# 2. Service Account JSON en base64
base64 -w0 sa.json | gh secret set GOOGLE_SA_JSON_B64

# 3. Resend API key — RÉUTILISER la même clé que le repo auto-wa-agents
# (compte Resend avec messagingme.app verified — pas besoin de re-vérifier vmd,
# le from_address utilise agent@messagingme.app, les destinataires peuvent être ailleurs)
printf 're_...' | gh secret set RESEND_API_KEY_APP
```

### 3. Fichiers à créer

#### `.github/workflows/seo-agent.yml`

Copier le workflow depuis `auto-wa-agents` et adapter la matrix :

```yaml
matrix:
  include:
    - site_name: verifiermondevis.fr
      gsc_url: sc-domain:verifiermondevis.fr
      ga4_id: "<GA4 PROPERTY ID NUMÉRIQUE>"
      resend_secret_name: RESEND_API_KEY_APP
      from_address: "SEO Agent VMD <agent@messagingme.app>"
```

Adapter aussi la liste `recipients` dans le step "Send HTML email via Resend".

#### `scripts/seo-agent-prompt.md`

Copier tel quel depuis `auto-wa-agents/scripts/seo-agent-prompt.md`.
Le workflow injecte automatiquement `${SITE_NAME}`, `${GSC_SITE_URL}`, `${GA_PROPERTY_ID}` via `envsubst`.

#### `.gitignore`

Ajouter :

```
.secrets/
report.html
claude-err.log
issue-body.md
```

### 4. Test

```bash
# Dry run (pas d'issue créée)
gh workflow run seo-agent.yml -f dry_run=true

# Run réel manuel
gh workflow run seo-agent.yml

# Vérifier les derniers runs
gh run list --workflow=seo-agent.yml --limit 5
gh run view <RUN_ID> --log
```

---

## Pièges connus

- **GA4 property ID ≠ Measurement ID (G-XXX)** — c'est l'ID numérique, visible dans GA4 Admin → Property Settings (en haut à droite)
- **Resend free tier = 1 domaine vérifié par compte** : si tu n'as qu'un seul domaine vérifié, le `from_address` doit utiliser ce domaine. Les destinataires peuvent être n'importe où.
- **GSC accès délai** : après avoir ajouté le SA en GSC, attendre 5-10 min avant de lancer le 1er run (propagation des permissions)
- **`printf` obligatoire pour les secrets** : `echo` ajoute un `\n` final qui casse les clés API
- **Le SA JSON ne doit JAMAIS être commité** — vérifier `.gitignore`

## Gestion d'erreurs

- **GSC 403** (accès pas encore donné / propagation en cours) : l'agent produit quand même un rapport GA4-only avec bandeau "GSC non disponible"
- **Pas de clé Resend** : email step skippé avec warning, rapport toujours archivé en GitHub Issue

## Référence

Setup d'origine : repo `auto-wa-agents` — fichiers `.github/workflows/seo-agent.yml` et `scripts/seo-agent-prompt.md`.

---

Quand tu seras prêt à exécuter : générer le workflow YAML adapté + copier le prompt depuis `auto-wa-agents`.
