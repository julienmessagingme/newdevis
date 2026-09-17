/**
 * scripts/rapport-sourcage.mjs
 *
 * Rend lisible la sortie de `sourceur-prix-ia.mjs` pour une validation humaine.
 *
 * 🔴 CE QU'ON DEMANDE À JOHAN N'EST PAS DE JUGER UN PRIX — il a dit lui-même
 * ne pas être spécialiste, et c'est précisément pour ça que le sourceur existe.
 * On lui demande de valider que **la source est crédible et que le PÉRIMÈTRE
 * correspond à ce que le devis décrit**. C'est vérifiable sans être maçon :
 * il suffit de lire « ce prix n'inclut pas les fondations » et de regarder si
 * le devis en parle.
 *
 * ⚠️ Le périmètre est mis EN PREMIER, avant le chiffre : c'est la cause n°1
 * des faux écarts de ce projet (fourniture/pose le 10/09, fondation le 17/09,
 * installation complète contre unité seule le 15/09).
 *
 * Usage : npx tsx scripts/rapport-sourcage.mjs <entree.json> [sortie.md]
 */
import fs from "node:fs";

const [src, dst = "rapport-sourcage.md"] = process.argv.slice(2);
if (!src) { console.error("usage: npx tsx scripts/rapport-sourcage.mjs <entree.json> [sortie.md]"); process.exit(1); }

const r = JSON.parse(fs.readFileSync(src, "utf8"));
const eur = (n) => `${Math.round(Number(n) || 0).toLocaleString("fr-FR")} €`;
const out = [];

const parDevis = new Map();
for (const p of r) {
  if (!parDevis.has(p.fichier)) parDevis.set(p.fichier, []);
  parDevis.get(p.fichier).push(p);
}

const n = (v) => r.filter((x) => x.verdict === v).length;
out.push(`# Sourçage des prix — ${r.length} postes`);
out.push(``);
out.push(`Une IA a cherché le **prix de marché** de chaque prestation sur le web, sans jamais voir`);
out.push(`le prix facturé — sinon elle l'aurait justifié. Le verdict n'est pas son avis : il se`);
out.push(`**calcule** en comparant le prix facturé à la fourchette qu'elle a sourcée.`);
out.push(``);
out.push(`**${n("OK")} OK** · **${n("ÉCART")} écarts confirmés** · **${n("NON CONCLUANT")} non concluants**`);
out.push(``);
out.push(`> **Ce qu'on vous demande de vérifier** — pas le prix, mais le **périmètre** : la ligne`);
out.push(`> « ce que le prix couvre » décrit-elle bien ce que le devis dit ? C'est la cause n°1 des`);
out.push(`> faux écarts ici. Si le périmètre ne colle pas, le verdict ne vaut rien, quel qu'il soit.`);
out.push(``);
out.push(`---`);

const ordre = { "ÉCART": 0, "OK": 1, "NON CONCLUANT": 2, "ERREUR": 3 };
for (const [fichier, postes] of parDevis) {
  out.push(``);
  out.push(`## ${fichier}`);
  for (const p of postes.sort((a, b) => ordre[a.verdict] - ordre[b.verdict] || b.ecartMoteur - a.ecartMoteur)) {
    const s = p.source ?? {};
    const badge = p.verdict === "OK" ? "🟢 OK" : p.verdict === "ÉCART" ? "🔴 ÉCART" : "⚪ NON CONCLUANT";
    out.push(``);
    out.push(`### ${badge} — ${p.label}`);
    out.push(``);
    out.push(`**Le devis facture** ${eur(p.montant)} pour ${p.qty ?? "?"} ${p.unite || ""}` +
      `${p.qty ? ` (**${(p.montant / p.qty).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €** / ${p.unite})` : ""}.`);
    out.push(``);
    if (s.perimetre) {
      out.push(`**⚠️ Périmètre du prix sourcé — c'est le point à vérifier :**`);
      out.push(`> ${s.perimetre}`);
      out.push(``);
    }
    if (s.prix_max_ht != null) {
      out.push(`**Prix de marché relevé :** ${eur(s.prix_min_ht)} à **${eur(s.prix_max_ht)}** HT / ${s.unite ?? "?"}` +
        ` — certitude **${s.certitude ?? "?"}**`);
      out.push(``);
    }
    out.push(`**Verdict calculé :** ${p.motif ?? "—"}`);
    if (p.verdict === "ÉCART" && p.ecartSource != null) {
      out.push(``);
      out.push(`| | écart |`);
      out.push(`|---|---|`);
      out.push(`| notre moteur (catalogue) | ${eur(p.ecartMoteur)} |`);
      out.push(`| le sourçage web | **${eur(p.ecartSource)}** |`);
    }
    if ((s.sources ?? []).length > 0) {
      out.push(``);
      out.push(`**Sources :**`);
      for (const x of s.sources) {
        out.push(`- [${String(x.url).replace(/^https?:\/\//, "").slice(0, 60)}](${x.url}) — « ${String(x.valeur_citee ?? "").slice(0, 120)} » *(${x.ht_ou_ttc ?? "?"})*`);
      }
    }
    if (s.reserve) {
      out.push(``);
      out.push(`_Réserve : ${s.reserve}_`);
    }
    out.push(``);
    out.push(`> **Vous validez ?** \`[ oui / non ]\` · si non, pourquoi : ______________________`);
  }
  out.push(``);
  out.push(`---`);
}

fs.writeFileSync(dst, out.join("\n"), "utf8");
console.log(`✓ ${r.length} postes → ${dst}`);
