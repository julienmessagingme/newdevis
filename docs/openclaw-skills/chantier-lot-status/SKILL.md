---
name: chantier-lot-status
description: Met a jour le statut d'un lot (a_faire, en_cours, termine)
---

# Skill: Statut Lot

Change le statut d'un lot de travaux quand un artisan commence ou termine.

## Quand utiliser
- Un artisan dit "on commence lundi" → en_cours
- Un artisan dit "c'est termine" → termine
- Le proprietaire confirme la fin d'un lot

## Quand NE PAS utiliser
- Si le message est ambigu (poser la question avant d'agir)
- Si le numero est inconnu

## Endpoint

```bash
curl -X PATCH \
  -H "X-Agent-Key: $GERERMONCHANTIER_API_KEY" \
  -H "Content-Type: application/json" \
  "$GERERMONCHANTIER_BASE_URL/api/chantier/{chantierId}/lots" \
  -d '{"lotId": "uuid-du-lot", "statut": "en_cours"}'
```

Statuts : `a_faire`, `en_cours`, `termine`, `ok`
