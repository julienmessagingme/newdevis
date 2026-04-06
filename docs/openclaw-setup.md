# OpenClaw Setup — GererMonChantier Agent

Guide pour connecter votre instance OpenClaw au Pilote de Chantier.

## Avantages vs mode edge_function

| | Edge function (gratuit) | OpenClaw (vos tokens) |
|---|---|---|
| Reactivite | Temps reel (chaque message) | Temps reel + contexte vivant |
| Contexte | Snapshot recalcule a chaque event | Memoire de session enrichie |
| Multi-tour | Non | Attend reponse artisan, relance |
| Proactif | Non (V1) | Envoie des messages WhatsApp |
| Memoire | Aucune entre les runs | MEMORY.md long terme |

Cout estime : ~$0.48/mois (20 msgs/jour avec Haiku)

## 1. Obtenir votre AGENT_SECRET_KEY

Dans les parametres de GererMonChantier, section "Agent IA", copiez la cle de service.

## 2. Configurer les variables d'environnement OpenClaw

Dans votre `openclaw.json` ou `.env` :

```
GERERMONCHANTIER_API_KEY=votre_agent_secret_key
GERERMONCHANTIER_BASE_URL=https://www.verifiermondevis.fr
```

## 3. Copier les skills

Copiez les 5 dossiers de `docs/openclaw-skills/` dans le workspace de votre instance OpenClaw :

- `chantier-context/SKILL.md`
- `chantier-update-planning/SKILL.md`
- `chantier-tasks/SKILL.md`
- `chantier-insights/SKILL.md`
- `chantier-lot-status/SKILL.md`

## 4. Activer les hooks

Dans `openclaw.json`, ajoutez :

```json
{
  "hooks": {
    "agent": {
      "enabled": true,
      "allowedSources": ["GererMonChantier"]
    }
  }
}
```

## 5. Activer le mode OpenClaw

Via l'API :

```bash
curl -X PUT https://www.verifiermondevis.fr/api/chantier/agent-config \
  -H "Authorization: Bearer VOTRE_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_mode": "openclaw",
    "openclaw_url": "https://votre-instance.openclaw.dev",
    "openclaw_token": "votre_token_openclaw",
    "openclaw_agent_id": "optionnel"
  }'
```

## 6. Configurer HEARTBEAT.md

Pour la re-synchronisation periodique du contexte :

```markdown
# HEARTBEAT.md
Toutes les heures, appelle le skill chantier-context pour re-hydrater
le contexte budget/planning si des documents ont ete uploades.
```

## 7. Tester

Envoyez un message dans un groupe WhatsApp du chantier. L'agent OpenClaw devrait reagir en temps reel via le webhook `/hooks/agent`.

## 8. Personnaliser SOUL.md

Adaptez le comportement de l'agent a votre style :

```markdown
# SOUL.md
Tu es le Pilote de Chantier pour [NOM]. Tu surveilles les messages
WhatsApp et emails, tu detectes les impacts planning, et tu agis.
Ton ton est professionnel mais accessible.
```

## Strategie de contexte OpenClaw

1. Au reveil (1er heartbeat) : appelle GET /budget + /planning + /contacts + /payment-events
2. Stocke en memoire de session (pas de re-query)
3. Chaque webhook /hooks/agent ajoute le message au contexte vivant
4. Re-hydratation selective : si un tool call modifie le planning, re-fetch /planning uniquement
5. Heartbeat periodique (1h) : check si nouveaux docs uploades, re-sync budget
