# TODO.md — Backlog VerifierMonDevis.fr / GérerMonChantier

Backlog = items à faire **non encore commencés**. Dès qu'on attaque un item, il bascule dans `WIP.md`.

Pour le rationnel et l'historique des audits, voir `UX-AUDIT.md`.

---

## UX/UI cockpit GMC — issus de l'audit #2 (2026-05-09)

### P0 — Frein produit majeur

- [ ] **I3 — Surface persistante Assistant IA** : aujourd'hui les alertes IA (`agent_insights`) ne sont visibles que dans l'onglet "Assistant" + badge sidebar + toasts < 5 min. Un user qui n'ouvre jamais cet onglet ne voit jamais une alerte. À faire : bandeau discret (amber, lien vers onglet) sur DashboardHome si `agentInsights.unreadCount > 0` ; idem en haut du BudgetTab si insights financiers non lus ; rouge si `hasCriticalInsight`. Décision UX préalable : où placer (Dashboard seul ? toutes les pages ?), quel wording, quel comportement de fermeture.

### P0 — Mobile

- [ ] **N5b — IntervenantsListView en cards mobile** : actuellement tableau 6 colonnes `min-w-[760px]` qui force scroll-X sur 375px (font 10px illisible). À faire : variant cartes empilées sous breakpoint `sm`, comme déjà appliqué dans `BudgetTab` (`sm:hidden` / `hidden sm:flex`). Fichier : `src/components/chantier/cockpit/lots/IntervenantsListView.tsx:185`.

- [ ] **N5c — Touch events Planning Gantt** : `PlanningTimeline` écoute uniquement `MouseEvent` (`onMouseDown/Move/Up`). Aucun `onTouchStart/Move/End` → drag/resize impossible sur mobile. Poignées de resize en `opacity-0 group-hover/bar:opacity-100` → invisibles sur touch. À faire : ajouter touch events (ou `pointerdown` qui couvre les deux), forcer poignées visibles sous `lg:hidden`, ou afficher une vue list-mode alternative sur mobile. Fichier : `src/components/chantier/cockpit/planning/PlanningTimeline.tsx:60-160`. Effort estimé : 1 j.

### P1 — UX moyens

- [ ] **I5 — Vue expert / novice en toggle** : le tableau Budget reste dense par défaut (6 colonnes). À faire : toggle "🌱 Vue simple / 🔧 Vue détaillée" dans ActionBar. En mode simple → masquer "Facturé" et "Avancement", garder Artisan/Engagé/Solde/Actions. Persistance localStorage. Refonte invasive du tableau (colgroup table-fixed + headers + cells) → planifier un sprint dédié pour éviter régressions.

- [ ] **Pencil edit durée LotDetail (touch target)** : `w-6 h-6` (24×24) — sous WCAG 44×44. À traiter dans une passe globale "touch targets" avec aussi les boutons Check/X durée (28×28). Fichier : `src/components/chantier/cockpit/lots/LotDetail.tsx:162`.

---

## Comment ce fichier fonctionne

- **Quand on ajoute un item** : description courte + fichier:ligne quand pertinent + effort estimé si on l'a.
- **Quand on attaque un item** : retirer d'ici, créer une entrée `🟡 En cours` dans `WIP.md`.
- **Quand on finit un item** : retirer du WIP, ajouter à `FEATURES.md` si user-facing.
- **Quand on bloque** : reste dans WIP.md avec `🔴` et la raison ; ne pas remettre dans TODO.md.
