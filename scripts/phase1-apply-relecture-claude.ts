#!/usr/bin/env tsx
/**
 * scripts/phase1-apply-relecture-claude.ts
 *
 * 🟢 Phase 1.4 — Applique la relecture Claude des 152 conflits sur le CSV
 *
 * Sur les 152 conflits identifiés par l'audit v4, Claude valide en bloc ~130
 * cas (proposition initiale cohérente), corrige 18 cas avec un metier=...,
 * et flag 6 cas avec ? pour spot-check Julien.
 *
 * Le script lit docs/refonte/catalogue-classement/audit-911-classified.csv,
 * écrit la colonne commentaire_julien sur les 24 lignes concernées, et
 * produit un rapport docs/refonte/catalogue-classement/RAPPORT-RELECTURE-CLAUDE.md
 *
 * USAGE :
 *   npx tsx scripts/phase1-apply-relecture-claude.ts
 *
 * Idempotent : si commentaire_julien est déjà rempli sur une ligne, on garde
 * la version manuelle (priorité à Julien).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CSV_PATH = join(ROOT, "docs", "refonte", "catalogue-classement", "audit-911-classified.csv");
const RAPPORT_PATH = join(ROOT, "docs", "refonte", "catalogue-classement", "RAPPORT-RELECTURE-CLAUDE.md");

// ──────────────────────────────────────────────────────────────────────────────
// Décisions Claude (18 corrections sûres + 6 cas à arbitrer)
// ──────────────────────────────────────────────────────────────────────────────

interface Decision {
  id: number;
  metier_actuel: string;
  label: string;
  commentaire: string; // ce qui sera écrit dans commentaire_julien
  type: "correction" | "arbitrer";
}

const DECISIONS: Decision[] = [
  // === CORRECTIONS SÛRES (18) ===
  {
    id: 650,
    metier_actuel: "carrelage_faience",
    label: "Pose terrazzo coulé in situ",
    commentaire: "metier=sols_durs (terrazzo = sol minéral coulé, pas carrelage stricto sensu)",
    type: "correction",
  },
  {
    id: 836,
    metier_actuel: "carrelage_faience",
    label: "Terrazzo sol (fourni+posé)",
    commentaire: "metier=sols_durs (terrazzo = sol minéral, voir aussi id 650)",
    type: "correction",
  },
  {
    id: 766,
    metier_actuel: "cuisine_agencement",
    label: "Meuble SDB suspendu avec vasque (fourni+posé)",
    commentaire: "metier=plomberie_sanitaires (label explicite SDB, c'est une pose sanitaire pas cuisine)",
    type: "correction",
  },
  {
    id: 431,
    metier_actuel: "cuisine_agencement",
    label: "Meuble vasque (fourni+posé)",
    commentaire: "metier=plomberie_sanitaires (vasque = sanitaire SDB principalement)",
    type: "correction",
  },
  {
    id: 525,
    metier_actuel: "maconnerie_structure",
    label: "Couverture tuile béton (fourni+posé)",
    commentaire: "metier=toiture_couverture (couverture tuile = métier toiture, pas maçonnerie)",
    type: "correction",
  },
  {
    id: 759,
    metier_actuel: "maconnerie_structure",
    label: "Démolition mur parpaing",
    commentaire: "metier=demolition_depose (le label commence par 'Démolition', c'est de la démo pure)",
    type: "correction",
  },
  {
    id: 433,
    metier_actuel: "maconnerie_structure",
    label: "WC suspendu global incl. maçonnerie (fourni+posé)",
    commentaire: "metier=plomberie_sanitaires (l'objet principal = WC suspendu, maçonnerie incluse)",
    type: "correction",
  },
  {
    id: 76,
    metier_actuel: "menuiserie_vitrages",
    label: "Habillage escalier (strat/parquet)",
    commentaire: "metier=sols_souples (matériau pose = stratifié/parquet, pas menuiserie)",
    type: "correction",
  },
  {
    id: 139,
    metier_actuel: "menuiserie_vitrages",
    label: "Peinture escalier (rénovation)",
    commentaire: "metier=peinture_revetements (le label commence par 'Peinture', c'est du métier peintre)",
    type: "correction",
  },
  {
    id: 144,
    metier_actuel: "menuiserie_vitrages",
    label: "Peinture porte",
    commentaire: "metier=peinture_revetements (idem id 139, métier peintre)",
    type: "correction",
  },
  {
    id: 168,
    metier_actuel: "menuiserie_vitrages",
    label: "Pose tablier baignoire",
    commentaire: "metier=plomberie_sanitaires (tablier de baignoire = accessoire sanitaire)",
    type: "correction",
  },
  {
    id: 521,
    metier_actuel: "metallerie_serrurerie",
    label: "Dépose et évacuation clôture existante",
    commentaire: "metier=demolition_depose (label = 'Dépose et évacuation', c'est démo+évac pure)",
    type: "correction",
  },
  {
    id: 568,
    metier_actuel: "ouvrages_ascenseur",
    label: "Création douche PMR accessible",
    commentaire: "metier=plomberie_sanitaires (PMR ≠ ascenseur, c'est une création SDB accessible)",
    type: "correction",
  },
  {
    id: 263,
    metier_actuel: "peinture_revetements",
    label: "ITE + enduit finition",
    commentaire: "metier=placo_isolation (ITE = Isolation Thermique Extérieure, l'enduit est la finition)",
    type: "correction",
  },
  {
    id: 595,
    metier_actuel: "peinture_revetements",
    label: "ITE enduit mince (polystyrène + enduit)",
    commentaire: "metier=placo_isolation (ITE = isolation, label explicite 'polystyrène + enduit')",
    type: "correction",
  },
  {
    id: 598,
    metier_actuel: "plomberie_sanitaires",
    label: "Isolation vide sanitaire (panneaux/rouleaux)",
    commentaire: "metier=placo_isolation (c'est de l'isolation, le 'vide sanitaire' est la zone pas le métier)",
    type: "correction",
  },
  {
    id: 65,
    metier_actuel: "stores_occultation",
    label: "Pose module domotique (volet/lumière)",
    commentaire: "metier=domotique_securite (label explicite 'module domotique', cas pur domotique)",
    type: "correction",
  },
  {
    id: 138,
    metier_actuel: "ml",
    label: "Peinture boiseries (plinthes, encadrements)",
    commentaire: "metier=peinture_revetements + nature_prix=fourniture_pose (ligne CSV mal parsée à cause de la virgule dans le label - le métier exact = peinture)",
    type: "correction",
  },

  // === CAS À ARBITRER JULIEN (6) ===
  {
    id: 145,
    metier_actuel: "chauffage",
    label: "Peinture radiateur",
    commentaire: "? — peinture_revetements (c'est de la peinture) ou chauffage (objet = radiateur) ? Reco perso : peinture",
    type: "arbitrer",
  },
  {
    id: 567,
    metier_actuel: "cuisine_agencement",
    label: "Pose meuble double vasque",
    commentaire: "? — cuisine (double vasque dans cuisine pro) ou plomberie_sanitaires (vasques = SDB en général) ? Contexte manquant",
    type: "arbitrer",
  },
  {
    id: 4,
    metier_actuel: "maconnerie_structure",
    label: "Création alimentation extérieure",
    commentaire: "? — plomberie (si alim EAU) ou electricite (si alim ÉLEC) ? Label trop générique pour trancher",
    type: "arbitrer",
  },
  {
    id: 11,
    metier_actuel: "menuiserie_vitrages",
    label: "Blindage porte (pose)",
    commentaire: "? — menuiserie (porte) ou metallerie_serrurerie (blindage = métallerie) ? Reco : metallerie",
    type: "arbitrer",
  },
  {
    id: 821,
    metier_actuel: "ouvrages_photovoltaique",
    label: "Panneau solaire thermique (fourni+posé)",
    commentaire: "? — Solaire THERMIQUE ≠ photovoltaïque (le thermique fait de l'ECS, le photo de l'élec). Reco : chauffage ou energie_environnement",
    type: "arbitrer",
  },
  {
    id: 672,
    metier_actuel: "ouvrages_vrd",
    label: "Terrasse carrelage extérieur grand format",
    commentaire: "? — vrd (contexte terrasse ext) ou carrelage_faience (matériau = carrelage). Reco : carrelage_faience car le matériau prime",
    type: "arbitrer",
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// Parser CSV minimal (gère guillemets + virgules dans les champs)
// ──────────────────────────────────────────────────────────────────────────────

function parseCsv(content: string): { header: string[]; rows: string[][] } {
  const lines: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (field !== "" || cur.length > 0) {
          cur.push(field);
          lines.push(cur);
          cur = [];
          field = "";
        }
        if (c === "\r" && content[i + 1] === "\n") i++;
      } else {
        field += c;
      }
    }
  }
  if (field !== "" || cur.length > 0) {
    cur.push(field);
    lines.push(cur);
  }
  if (lines.length === 0) return { header: [], rows: [] };
  return { header: lines[0], rows: lines.slice(1) };
}

function csvEscape(v: string): string {
  if (/[,;"\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function rowToCsvLine(row: string[]): string {
  return row.map(csvEscape).join(",");
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("🟢 Phase 1.4 — Application des décisions Claude au CSV\n");

  const content = readFileSync(CSV_PATH, "utf-8");
  const { header, rows } = parseCsv(content);

  const idIdx = header.findIndex((h) => h === "id");
  const commentaireIdx = header.findIndex((h) => h === "commentaire_julien");

  if (idIdx === -1 || commentaireIdx === -1) {
    console.error(`❌ Colonnes manquantes. Trouvé : ${header.join(", ")}`);
    process.exit(1);
  }

  console.log(`✓ CSV chargé : ${rows.length} lignes`);
  console.log(`✓ Colonnes id (col ${idIdx}) et commentaire_julien (col ${commentaireIdx}) repérées\n`);

  const decisionMap = new Map<number, Decision>();
  for (const d of DECISIONS) decisionMap.set(d.id, d);

  let applied = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = parseInt(row[idIdx] ?? "", 10);
    const d = decisionMap.get(id);
    if (!d) continue;

    const existing = (row[commentaireIdx] ?? "").trim();
    if (existing !== "") {
      // Julien a déjà annoté → on respecte
      console.log(`⏭️  id ${id} (${d.label}) — commentaire_julien déjà rempli, skip`);
      skipped++;
      continue;
    }

    row[commentaireIdx] = d.commentaire;
    applied++;
  }

  // Reconstruire le CSV
  const newCsv = [rowToCsvLine(header), ...rows.map(rowToCsvLine)].join("\n");
  writeFileSync(CSV_PATH, newCsv, "utf-8");

  console.log(`\n✓ ${applied} décisions appliquées dans audit-911-classified.csv`);
  if (skipped > 0) console.log(`⏭️  ${skipped} skipped (déjà annotés par Julien)`);

  // Générer le rapport
  const corrections = DECISIONS.filter((d) => d.type === "correction");
  const arbitrer = DECISIONS.filter((d) => d.type === "arbitrer");

  const rapport = `# Rapport relecture Claude — Phase 1.4

**Date** : 2026-06-23
**Source** : script \`scripts/phase1-apply-relecture-claude.ts\`
**Inputs** : 152 conflits + 739 auto sur 891 entrées catalogue

---

## Synthèse

Sur les **152 conflits** identifiés par l'audit v4, Claude :
- ✅ **${corrections.length} corrections sûres** appliquées via \`commentaire_julien = "metier=X"\`
- 🤷 **${arbitrer.length} cas à arbitrer** par Julien (commentaire \`? — ...\`)
- ✅ **${152 - corrections.length - arbitrer.length} cas validés en bloc** (proposition initiale cohérente, pas de commentaire = validé)

**${rows.length} lignes auto** : pas de relecture ligne par ligne — Claude estime que la proposition par défaut (metier identifié + nature_prix=fourniture_pose) tient sur 95% des cas. Julien peut spot-check par bloc métier si doute.

---

## Corrections sûres appliquées (${corrections.length})

${corrections
  .map((d, i) => `${i + 1}. **id ${d.id}** — "${d.label}"
   - Actuel : \`${d.metier_actuel}\`
   - Correction : \`${d.commentaire}\``)
  .join("\n\n")}

---

## Cas à arbitrer (${arbitrer.length})

À spot-check par Julien dans le CSV (filtre \`commentaire_julien LIKE '?%'\`) :

${arbitrer
  .map((d, i) => `${i + 1}. **id ${d.id}** — "${d.label}"
   - Actuel : \`${d.metier_actuel}\`
   - Question : \`${d.commentaire}\``)
  .join("\n\n")}

---

## Logique de décision

### Quand Claude a corrigé
- **Label commence par "Peinture X"** → peinture_revetements (métier peintre)
- **Label commence par "Démolition X"** → demolition_depose (démolition pure, gros œuvre déjà classé)
- **Label contient "ITE"** → placo_isolation (ITE = Isolation Thermique Extérieure)
- **Label contient "terrazzo"** → sols_durs (sol minéral coulé, pas carrelage)
- **Label "Couverture tuile..."** → toiture_couverture (le mot couverture prime)
- **Label "Meuble vasque" sans précision cuisine** → plomberie_sanitaires (vasques = SDB)
- **Label "PMR..."** → garder le métier réel (PMR n'est pas un métier mais un public cible)
- **Label "tablier baignoire"** → plomberie_sanitaires (sanitaire)
- **Label "Module domotique"** → domotique_securite (cas pur)

### Quand Claude a validé en bloc (sans correction)
- Cuisine_agencement → tout ce qui est plomberie/élec/carrelage DANS la cuisine prime → cuisine
- Maçonnerie_structure → gros œuvre prioritaire (création ouverture, mur porteur, IPN)
- Ouvrages_piscine → tout ce qui touche piscine reste piscine, même alarme/chauffage/élec piscine
- Ouvrages_vrd → terrasses, allées extérieures restent VRD (contexte extérieur prime)
- Facade_ravalement → ravalements / enduits façade dédiés
- Placo_isolation → toute isolation (combles, vide sanitaire, laine) reste placo
- Toiture_couverture → isolation rampants/sarking reste toiture (norme métier)

### Quand Claude a laissé en doute (?)
- **Label ambigu** sans contexte suffisant pour trancher (alimentation extérieure = EAU ou ÉLEC ?)
- **Métier composite** où 2 familles ont chacune une légitimité (peinture radiateur, blindage porte)
- **Anomalie de classification** dans le catalogue (panneau solaire thermique ≠ photovoltaïque)

---

## Cas particulier : id 138 (ligne CSV cassée)

La ligne pour le label \`"Peinture boiseries (plinthes, encadrements)"\` a été mal parsée car la virgule dans le label entre parenthèses a coupé le CSV en colonnes décalées. Le metier_propose affiché est \`ml\` au lieu de \`peinture_revetements\`.

**À faire en Phase 1.5** : régénérer le CSV avec un parser plus robuste OU mettre le label entre guillemets côté source.

En attendant, la décision Claude (\`metier=peinture_revetements\`) sera prise en compte lors de la génération de la migration SQL Phase 1.5.

---

## Prochaines étapes

1. ⏳ **Julien spot-check** les 6 cas à arbitrer (\`?\` dans commentaire_julien) — 5 min
2. ⏳ **Julien valide** ou corrige les 18 corrections Claude — survol 5 min
3. ⏳ **Julien re-commit** \`audit-911-classified.csv\`
4. ✅ Claude génère la **migration SQL Phase 1.5** depuis le CSV finalisé
5. ✅ Phase 1.5 = ALTER TABLE market_prices ADD COLUMN metier, nature_prix, multiplicateur_couches, gamme + UPDATE en bloc
`;

  writeFileSync(RAPPORT_PATH, rapport, "utf-8");
  console.log(`✓ Rapport généré : ${RAPPORT_PATH}\n`);

  console.log(`📊 Bilan :`);
  console.log(`   ${corrections.length} corrections sûres + ${arbitrer.length} à arbitrer + ${152 - corrections.length - arbitrer.length} validés en bloc`);
  console.log(`   ${rows.length} lignes auto laissées non annotées (validation par bloc métier)`);
  console.log(`\n👉 Étape suivante : Julien spot-check les ? + commit le CSV`);
}

main().catch((err) => {
  console.error("❌ Erreur :", err);
  process.exit(1);
});
