---
name: chantier-tasks
description: Cree ou complete des taches dans la checklist du chantier
---

# Skill: Taches Chantier

Gere la checklist de taches du chantier (todo_chantier).

## Quand utiliser
- Une action a faire est identifiee dans un message
- Un numero inconnu necessite une clarification (tache urgente)
- Une question du proprietaire est restee sans reponse 48h (tache relance)

## Endpoints

### Creer une tache
```bash
curl -X POST \
  -H "X-Agent-Key: $GERERMONCHANTIER_API_KEY" \
  -H "Content-Type: application/json" \
  "$GERERMONCHANTIER_BASE_URL/api/chantier/{chantierId}/taches" \
  -d '{"titre": "Relancer plombier pour livraison baignoire", "priorite": "urgent"}'
```

Priorites : `urgent`, `important`, `normal`

### Completer une tache
```bash
curl -X PATCH \
  -H "X-Agent-Key: $GERERMONCHANTIER_API_KEY" \
  -H "Content-Type: application/json" \
  "$GERERMONCHANTIER_BASE_URL/api/chantier/{chantierId}/taches" \
  -d '{"id": "uuid-tache", "done": true}'
```
