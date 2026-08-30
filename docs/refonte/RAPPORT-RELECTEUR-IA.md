# Le relecteur IA peut-il publier sans nous ? — banc de test du 2026-08-30

Question posée par Johan : entraîner le relecteur sur le gold standard, puis le
laisser publier directement auprès de l'utilisateur, avec un garde-fou humain
« s'il a un doute ». **Réponse mesurée : non, et pas pour la raison attendue.**

Méthode : chaque analyse déjà tranchée par un expert est rejouée sur son
**snapshot d'avant correction** (`analysis_corrections.original_conclusion`),
c'est-à-dire exactement ce que l'agent voit en production. Rejouer sur la
conclusion corrigée reviendrait à lui montrer la réponse.
Outil : `scripts/benchmark-ai-reviewer.ts`. Fournisseur : Gemini 2.5-pro, PDF
joint, grounding Google. Coût des trois passes : ~1,50 €.

## Les trois passes

| Passe | Corpus | Exploitables | Accord avec l'expert | Faux OK | Fausses alarmes |
|---|---|---|---|---|---|
| 1 | 37 analyses du gold standard | 35/37 | 60 % | **0** | 40 % |
| 2 | idem, après ajout d'un seuil de matérialité au prompt + correctif MIME | 37/37 | 59 % | **0** | 41 % |
| 3 | **16 analyses TÉMOINS**, jamais signalées ni touchées | 16/16 | — | — | **15/16 « corriger »** |

## Ce que ça dit

**Il ne rate rien.** Sur les 22 analyses que l'expert a corrigées, l'agent n'a
jamais dit « publier tel quel ». Zéro faux OK sur les deux passes. Comme
détecteur, il est excellent : sur le devis ALES il a trouvé les trois erreurs
que Johan avait relevées, plus deux qu'aucun de nous n'avait vues (mur porteur
sans étude de structure, absence totale de quantités).

**Mais il ne discrimine pas.** Il a répondu « corriger » sur **37 cas sur 37**
du gold standard — et sur **15 des 16 analyses témoins**, qui n'avaient jamais
été signalées par personne. Le « 0 % de faux OK » n'est donc pas une propriété
de sécurité : c'est l'artefact d'un détecteur bloqué en position alarme. Un
avis qui dit « à corriger » sur tout ne porte aucune information.

**Sa confiance ne discrimine pas non plus.** Elle vaut 0,75 à 0,95 aussi bien
sur les cas où il rejoint l'expert que sur ceux où il le contredit — 0,95 sur
quatre désaccords. Le garde-fou « publier seulement si confiance élevée » ne
tient donc pas : au seuil 0,9, 22 analyses sur 37 seraient publiées
automatiquement, dont plusieurs réécritures d'analyses que l'expert avait
jugées bonnes.

**Le prompt n'y change rien.** La passe 2 ajoutait un seuil de matérialité
explicite (« ne corrige que si le verdict, le montant ou une anomalie doivent
changer ; un devis simplement perfectible se valide »). Résultat identique.
C'est un comportement de fond sous la consigne « relis cette analyse », pas un
défaut d'instruction.

## Ce qu'on en fait

1. **Pas de publication automatique du verdict.** L'humain garde le clic. Le
   risque n'est pas qu'il laisse passer une erreur — il n'en laisse passer
   aucune — mais qu'il réécrive 4 analyses sur 10 qui n'en avaient pas besoin.
2. **On l'utilise là où il est fort** : détecter, hiérarchiser la file, et
   pré-rédiger les notes expert et le message client. C'est déjà en place.
3. **Son vrai rendement est ailleurs** : ses drapeaux nomment nos bugs
   récurrents. Le « forfait comparé à un prix au m² », signalé sur plusieurs
   devis, a été corrigé en dur le 2026-08-30 (garde d'unité dans
   `computeServerSurcout`) — sur le devis ALES, l'écart annoncé est passé de
   8 868–12 669 € à 1 070–1 528 €. Une famille entière de faux positifs
   éliminée, à coût marginal nul, là où une relecture par analyse se paie à
   chaque devis.
4. **Piste pour rouvrir la question** : ne pas lui demander un jugement, mais
   des **affirmations vérifiables**. « Cette anomalie compare un forfait à un
   prix au m² » se contrôle en code ; « ce devis mérite une correction » ne se
   contrôle pas. Une correction automatique restreinte à des motifs typés et
   revérifiés déterministiquement serait défendable — un verdict global, non.

## Reproduire

```bash
npx tsx scripts/benchmark-ai-reviewer.ts                  # gold standard complet
npx tsx scripts/benchmark-ai-reviewer.ts --controle 16    # groupe témoin
npx tsx scripts/benchmark-ai-reviewer.ts --provider claude # comparer les fournisseurs
```

À relancer quand le gold standard aura doublé, ou après toute modification du
prompt : c'est le seul chiffre qui autorise ou interdit la Phase C.
