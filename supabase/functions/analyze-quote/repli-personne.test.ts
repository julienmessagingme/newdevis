// ============================================================
// Tests — candidatsPersonne / resultatPersonneAcceptable
// Lancer : npx tsx supabase/functions/analyze-quote/repli-personne.test.ts
// ============================================================

import { candidatsPersonne, resultatPersonneAcceptable } from "./repli-personne.ts";

let passed = 0, failed = 0;
function check(nom: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${nom}`); }
  else { failed++; console.error(`  ✗ ${nom}\n      attendu ${e}\n      obtenu  ${a}`); }
}

console.log("── candidatsPersonne ──");

// ── Les deux cas RÉELS que le banc a résolus ───────────────────────────────
check(
  "cas Entreprise Fk — prénom en contact + nom dans l'e-mail",
  candidatsPersonne("kurtis.forgeas@icloud.com", "Kurtis"),
  ["kurtis forgeas"],
);
check(
  "cas HDH batiment — deux fragments dans l'e-mail",
  candidatsPersonne("hdh.batiment@gmail.com", "Boucheikh"),
  ["hdh batiment"],
);

// ── Nom de contact complet : le meilleur candidat, en premier ──────────────
check(
  "contact en deux mots → candidat prioritaire",
  candidatsPersonne("contact@sarl-dupont.fr", "Jean-Pierre Dupont"),
  ["Jean-Pierre Dupont"],
);

// ── Mots de fonction : jamais un nom ───────────────────────────────────────
for (const mail of ["contact@entreprise.fr", "devis@batiment-sud.com", "info@travaux.fr", "secretariat@sarl.fr"]) {
  check(`mot de fonction ignoré — ${mail}`, candidatsPersonne(mail, null), []);
}

// ⚠️ ANTI-RÉGRESSION du piège rencontré en écrivant ce module : « batiment »,
// « travaux », « renovation » sont des mots de MÉTIER, pas de fonction. Les
// exclure cassait le cas réel hdh.batiment@ (raison sociale HDH BATIMENT).
check("mot de métier conservé — travaux", candidatsPersonne("dupont.travaux@x.fr", null), ["dupont travaux"]);
check("mot de métier conservé — renovation", candidatsPersonne("martin.renovation@x.fr", null), ["martin renovation"]);

// ⚠️ Le cas qui a failli passer : « contact.dupont@ » — un seul fragment utile
// et aucun contact nommé → on ne cherche PAS « dupont » seul.
check("un seul fragment utile, pas de contact → rien", candidatsPersonne("contact.dupont@x.fr", null), []);

// ── Un prénom seul ne sort jamais ──────────────────────────────────────────
check("prénom de contact seul, e-mail inexploitable → rien", candidatsPersonne("info@x.fr", "Kurtis"), []);
check("aucune donnée → rien", candidatsPersonne(null, null), []);
check("e-mail sans arobase → rien", candidatsPersonne("pas-un-email", null), []);

// ── Bruit et ponctuation ───────────────────────────────────────────────────
check("chiffres séparateurs", candidatsPersonne("jean2martin@free.fr", null), ["jean martin"]);
// Le tiret est un séparateur au même titre que le point : « jean-dupont@ » est
// une adresse aussi courante que « jean.dupont@ ». Un prénom composé y perd son
// tiret — sans conséquence, la recherche au registre est en texte libre.
check("tirets", candidatsPersonne("marie-claire.bernard@orange.fr", null), ["marie claire bernard"]);
check("casse normalisée", candidatsPersonne("Pierre.DURAND@Wanadoo.FR", null), ["pierre durand"]);
// Deux fragments dont un trop court : « a.dupont@ » ne fait pas un nom.
check("initiale + nom → trop peu pour chercher", candidatsPersonne("a.dupont@x.fr", null), []);

console.log("\n── resultatPersonneAcceptable ──");
check("entreprise active → retenue", resultatPersonneAcceptable("A"), true);
// 🔴 Le cas PORCELANOSA : l'homonyme trouvé est CESSÉ. Le retenir produirait un
// « entreprise radiée » faux sur un devis parfaitement légitime.
check("entreprise cessée → JAMAIS retenue", resultatPersonneAcceptable("C"), false);
check("état inconnu → pas retenue", resultatPersonneAcceptable(null), false);

console.log(`\n${passed} passés, ${failed} échoués`);
if (failed > 0) process.exit(1);
