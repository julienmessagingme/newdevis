# SEO Agent Hebdomadaire — Setup

Agent IA autonome qui analyse GA4 + GSC chaque lundi et envoie un rapport HTML par email.

## Stack
- **GitHub Actions** (cron lundi 5h UTC = 7h Paris)
- **OAuth user refresh token** (compte `julien@messagingme.fr` — bypass de la policy Workspace qui bloque les Service Accounts externes)
- **Script Node** (`googleapis`) qui pull GA4 + GSC en JSON, passe les données au prompt
- **Claude Code CLI** (modèle Haiku, ~$0.02/run)
- **Resend API** pour l'envoi email
- **GitHub Issue** comme backup du rapport

## Coûts
- GitHub Actions : gratuit (2000 min/mois inclus, 1 run = ~1m30s)
- Claude Haiku : ~$1/an (52 runs)
- Resend : gratuit (3000 mails/mois)

---

## Pourquoi pas un Service Account ?

Tentative initiale → Google Workspace `messagingme.fr` bloque l'ajout d'emails de SA externes (`*.iam.gserviceaccount.com`) sur les propriétés GA4 et GSC. L'erreur "Cette adresse e-mail ne correspond à aucun compte Google" apparaît à l'ajout. Pas accès admin Workspace pour débloquer la policy → on a basculé sur OAuth user-level. Le compte `julien@messagingme.fr` a déjà accès admin GA4 + GSC, donc on emprunte ses droits via un refresh token.

---

## Setup (à faire une fois)

### 1. OAuth Client ID dans GCP

1. https://console.cloud.google.com → projet `verifiermondevis-489918`
2. **APIs & Services → Library** → activer si pas déjà fait :
   - Google Search Console API
   - Google Analytics Data API
3. **APIs & Services → OAuth consent screen** :
   - User type : **External**
   - App name : `SEO Agent`
   - Support email : `julien@messagingme.fr`
   - Test users : ajouter `julien@messagingme.fr` ⚠️ obligatoire
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** :
   - Application type : **Desktop app**
   - Name : `seo-agent-cli`
   - Download le JSON

### 2. Récupérer un refresh token

```powershell
# Depuis la racine du repo
npm install --no-save googleapis@131

$env:GOOGLE_OAUTH_CLIENT_ID="<client_id du JSON>"
$env:GOOGLE_OAUTH_CLIENT_SECRET="<client_secret du JSON>"
node scripts/get-refresh-token.mjs
```

Le script ouvre le navigateur → login `julien@messagingme.fr` → "Continuer vers SEO Agent (non vérifié)" → accepter les 2 scopes → retour terminal avec le refresh token imprimé.

⚠️ Si rerun nécessaire : révoquer d'abord https://myaccount.google.com/permissions (chercher "SEO Agent") sinon Google ne renvoie pas de nouveau refresh token.

### 3. Secrets GitHub

```powershell
gh secret set GOOGLE_OAUTH_CLIENT_ID --body "<client_id>"
gh secret set GOOGLE_OAUTH_CLIENT_SECRET --body "<client_secret>"
gh secret set GOOGLE_OAUTH_REFRESH_TOKEN --body "<refresh_token>"
gh secret set ANTHROPIC_API_KEY --body "sk-ant-..."
gh secret set RESEND_API_KEY_APP --body "re_..."
```

⚠️ **Sur PowerShell, toujours `--body` (pas pipe)** — le pipe ajoute un `\n` final qui casse les clés.

Vérifier :
```powershell
gh secret list
```

### 4. GA4 Property ID

L'ID numérique (PAS `G-HJFMR8ST50` qui est le Measurement ID) est codé en dur dans le matrix du workflow (`ga4_id`). Pour `verifiermondevis.fr` : `526352348`. Si la propriété change, modifier `.github/workflows/seo-agent.yml`.

---

## Test

```powershell
# Dry run (pas d'issue créée)
gh workflow run seo-agent.yml -f dry_run=true

# Run réel manuel
gh workflow run seo-agent.yml

# Suivre les runs
gh run list --workflow=seo-agent.yml --limit 5
gh run view <RUN_ID> --log
```

---

## Architecture des fichiers

| Fichier | Rôle |
|---|---|
| `.github/workflows/seo-agent.yml` | Workflow cron + steps (data fetch → claude → email → archive) |
| `scripts/seo-fetch-data.mjs` | Pull GA4 + GSC via OAuth, output JSON |
| `scripts/seo-agent-prompt.md` | Prompt Claude avec instructions + format HTML email |
| `scripts/get-refresh-token.mjs` | Helper one-shot pour générer un refresh token (rerun si token expiré ~6 mois) |

---

## Pièges connus

- **Token expiré (`invalid_grant`)** : tous les ~6 mois OU si l'utilisateur révoque l'app sur https://myaccount.google.com/permissions → relancer `node scripts/get-refresh-token.mjs` et update le secret `GOOGLE_OAUTH_REFRESH_TOKEN`.
- **`prompt: 'consent'` requis dans le script** : sinon Google retourne juste un `access_token` sans `refresh_token` (puisque l'utilisateur a déjà consenti).
- **PowerShell + secrets** : toujours `gh secret set --body "..."`, jamais `printf | gh secret set` ni `echo | ...` (PowerShell ajoute un newline).
- **GA4 Property ID ≠ Measurement ID `G-XXX`** : l'ID numérique est dans Admin → Property → Property Settings.
- **Resend free tier = 1 domaine vérifié** : on réutilise le compte `auto-wa-agents` (domaine vérifié = `messagingme.app`), donc `from_address: agent@messagingme.app`. Les destinataires peuvent être n'importe où.

---

## Référence

Setup d'origine : repo `auto-wa-agents` (mais en SA, alors qu'ici on a basculé OAuth).
