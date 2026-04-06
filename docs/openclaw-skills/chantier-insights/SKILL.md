---
name: chantier-insights
description: Enregistre des observations et analyses de l'agent IA
---

# Skill: Insights Chantier

Enregistre les observations, alertes et analyses dans le journal de l'agent.

## Quand utiliser
- TOUJOURS en dernier apres avoir pris des actions
- Pour documenter une analyse de message
- Pour signaler un risque, un depassement budget, un retard

## Endpoint

```bash
curl -X POST \
  -H "X-Agent-Key: $GERERMONCHANTIER_API_KEY" \
  -H "Content-Type: application/json" \
  "$GERERMONCHANTIER_BASE_URL/api/chantier/{chantierId}/agent-insights" \
  -d '{
    "type": "planning_impact",
    "severity": "warning",
    "title": "Lot Plomberie reporte — plombier indisponible",
    "body": "Le plombier a annonce un retard. Lot decale du 14 au 21 avril.",
    "actions_taken": [
      {"tool": "update_planning", "summary": "Lot Plomberie decale 14→21 avril"}
    ]
  }'
```

## Types
- `planning_impact` — impact sur le planning
- `budget_alert` — alerte budget
- `payment_overdue` — paiement en retard
- `conversation_summary` — resume de conversation
- `risk_detected` — risque detecte
- `lot_status_change` — changement de statut d'un lot
- `needs_clarification` — numero inconnu, clarification requise

## Severites
- `info` — information, pas d'action requise
- `warning` — attention, action recommandee
- `critical` — probleme, action urgente requise
