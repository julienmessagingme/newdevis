---
name: chantier-update-planning
description: Met a jour les dates de planning d'un lot avec cascade automatique
---

# Skill: Mise a jour Planning

Modifie les dates de debut/fin d'un lot. Le systeme recalcule automatiquement les dates des lots suivants (cascade).

## Quand utiliser
- Un artisan annonce un retard ou un avancement
- L'architecte repousse le demarrage
- Un lot est termine plus tot que prevu

## Quand NE PAS utiliser
- Si le message vient d'un numero inconnu (utilise request_clarification)
- Si le message est une simple question sans impact planning

## Endpoint

```bash
curl -X PATCH \
  -H "X-Agent-Key: $GERERMONCHANTIER_API_KEY" \
  -H "Content-Type: application/json" \
  "$GERERMONCHANTIER_BASE_URL/api/chantier/{chantierId}/planning" \
  -d '{
    "lot_id": "uuid-du-lot",
    "date_debut": "2026-04-21",
    "duree_jours": 5
  }'
```

Le PATCH recalcule automatiquement les dates de tous les lots en cascade.

## Regles
- Toujours log_insight apres une modification de planning
- Si c'est l'architecte/MOE qui parle, il a autorite sur tout le chantier
- Si c'est un artisan, il n'a autorite que sur son lot
