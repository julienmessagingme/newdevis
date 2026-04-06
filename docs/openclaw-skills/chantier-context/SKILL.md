---
name: chantier-context
description: Hydrate le contexte complet d'un chantier (budget, planning, contacts, paiements)
---

# Skill: Contexte Chantier

Charge le contexte complet d'un chantier depuis l'API GererMonChantier.

## Quand utiliser
- Au reveil (premier heartbeat de la session)
- Quand tu as besoin de connaitre l'etat du budget, planning, contacts ou paiements
- Apres un tool call qui modifie le planning (re-fetch partiel)

## Quand NE PAS utiliser
- Si le contexte est deja en memoire de session et rien n'a change

## Endpoints

### Budget (lots + totaux + conseils IA)
```bash
curl -H "X-Agent-Key: $GERERMONCHANTIER_API_KEY" \
  "$GERERMONCHANTIER_BASE_URL/api/chantier/{chantierId}/budget"
```

### Planning (lots avec dates + cascade)
```bash
curl -H "X-Agent-Key: $GERERMONCHANTIER_API_KEY" \
  "$GERERMONCHANTIER_BASE_URL/api/chantier/{chantierId}/planning"
```

### Contacts (mapping telephone → lot)
```bash
curl -H "X-Agent-Key: $GERERMONCHANTIER_API_KEY" \
  "$GERERMONCHANTIER_BASE_URL/api/chantier/{chantierId}/contacts"
```
Reponse : `{ contacts: [...], analyseArtisans: [...], lots: [...] }`

### Paiements (echeances + retards)
```bash
curl -H "X-Agent-Key: $GERERMONCHANTIER_API_KEY" \
  "$GERERMONCHANTIER_BASE_URL/api/chantier/{chantierId}/payment-events"
```

## Strategie
1. Appelle les 4 endpoints en parallele
2. Construis un mapping telephone → contact → lot
3. Stocke en memoire de session
4. Re-fetch uniquement ce qui change apres une action
