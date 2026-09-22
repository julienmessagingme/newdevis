/**
 * scripts/preview-avis-unifie.mts
 *
 * MAQUETTE DE LA PAGE REFONDUE, SUR TROIS ANALYSES **RÉELLES**.
 *
 * 🔴 Les données viennent de la base, pas d'un jeu construit. C'est la
 * différence avec `preview-hero-analyse.mts` : là-bas les cas illustrent des
 * états du moteur, ici on regarde ce que trois vrais clients verraient.
 *
 * 🔴 AUCUN TEXTE N'EST RECOPIÉ : titre, corps, points vérifiés, points
 * d'attention, leviers et message copiable sont rendus par les composants et
 * les fonctions de production (`renderToStaticMarkup`). Un aperçu qui a son
 * propre wording ne valide rien (leçon `preview-review-email.ts`, 11/09).
 *
 * ⚠️ La sortie contient des devis de CLIENTS RÉELS et des noms d'artisans :
 * elle est écrite dans `scripts/out/`, qui est gitignored. Ne jamais la
 * committer — le dépôt est public.
 *
 * Lancer :  npx tsx scripts/preview-avis-unifie.mts
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import AvisUnifie from "@/components/analysis/AvisUnifie";
import { porteeAnalyse } from "@/lib/analyse/porteeAnalyse";
import { decisionAffichee } from "@/lib/analyse/decisionAffichee";
import type { ConclusionData } from "@/lib/analyse/conclusionTypes";

const require = createRequire(pathToFileURL(resolve(process.cwd(), "package.json")));
const { createClient } = require("@supabase/supabase-js");

const env: Record<string, string> = {};
for (const l of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const supabase = createClient(
  env.PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

/**
 * 🔴 L'« AVANT » EST LE COMPOSANT DÉPLOYÉ, EXTRAIT DE `HEAD` — jamais une
 * version neutralisée du nouveau.
 *
 * La tentation était de rendre deux fois le composant courant en ne lui
 * passant pas les nouvelles données. Ça ne marche pas : neutraliser `alertes`
 * viderait aussi les points d'attention, donc afficherait un « avant » qui n'a
 * jamais existé, et l'aperçu ferait approuver une comparaison fausse. C'est la
 * leçon de `preview-review-email.ts` (11/09) dans l'autre sens.
 *
 * Les copies importent la version COURANTE de `decisionAffichee` — sans risque,
 * elles l'appellent à trois arguments et les paramètres ajoutés prennent leur
 * défaut, ce qui reproduit exactement l'ancien comportement.
 *
 * ⚠️ Hors de `src/`, tsx applique la transformation JSX classique : `React`
 * doit être dans la portée, d'où l'import ajouté en tête de chaque copie.
 * ⚠️ Et l'import doit être DYNAMIQUE : un `import` statique est résolu avant
 * que la moindre ligne ne s'exécute, donc avant que ces fichiers existent.
 */
const DOSSIER_AVANT = resolve(process.cwd(), "scripts/out/avant");
mkdirSync(DOSSIER_AVANT, { recursive: true });
for (const nom of ["AvisSurLeDevis", "AvisUnifie"]) {
  const source = execSync(`git show HEAD:src/components/analysis/${nom}.tsx`, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const reecrit = source.replace(/from "\.\/AvisSurLeDevis"/g, 'from "./AvisSurLeDevisAvant"');
  writeFileSync(resolve(DOSSIER_AVANT, `${nom}Avant.tsx`), `import React from "react";\n${reecrit}`);
}
const AvisUnifieAvant = (await import(pathToFileURL(resolve(DOSSIER_AVANT, "AvisUnifieAvant.tsx")).href))
  .default as typeof AvisUnifie;

/** Une analyse par décision affichée, plus le devis signalé par Johan. */
const CHOIX = [
  { id: "0213bf35-1c23-4ed7-ac9a-0d72b970d3c6", attendu: "🟢 VERT — le devis de ta capture" },
  { id: "f0104531-c2b1-4270-b1cb-0b115c044d7f", attendu: "🟠 ORANGE — une réserve, sans montant" },
  // ⚠️ LE CAS QUI VÉRIFIE QUE L'ANCIENNETÉ NE MANGE PAS LE CHIFFRE. Quand un
  // montant est rattaché à des postes nommés, il DOIT rester le titre : c'est
  // ce que le lecteur emporte. L'ancienneté redescend alors en premier point
  // vérifié, à sa place.
  { id: "8293f838-7534-4de1-a6cd-ec40645c5b87", attendu: "🟠 ORANGE — un montant chiffré et nommé" },
  { id: "3608b1d5-4955-4ffe-9459-fad768d69ce7", attendu: "🔴 ROUGE — verdict défavorable, sans fait bloquant" },
  // ⚠️ Le cas le plus exposé, et celui qui rend la décision la plus discutable :
  // sur un hard block, `AvisSurLeDevis` retourne tôt. Les leviers y sont
  // désormais rendus, les points d'attention non — à valider.
  { id: "b706085d-4161-4a5c-93d3-8a240855c74d", attendu: "🔴 ROUGE — entreprise RADIÉE (hard block)" },
];

const parse = (v: unknown): any => {
  if (v && typeof v === "object") return v;
  if (typeof v !== "string") return null;
  try { return JSON.parse(v); } catch { return null; }
};

const echapper = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const sections: string[] = [];

for (const choix of CHOIX) {
  const { data, error } = await supabase
    .from("analyses")
    .select("id, created_at, file_name, conclusion_ia, raw_text, score, points_ok, alertes, review_status")
    .eq("id", choix.id)
    .single();
  if (error || !data) { console.error(`✗ ${choix.id} : ${error?.message ?? "introuvable"}`); continue; }

  const conclusion = parse(data.conclusion_ia) as ConclusionData;
  const raw = parse(data.raw_text);
  const groupes = Array.isArray(raw?.n8n_price_data) ? raw.n8n_price_data : [];
  const materiel = Array.isArray((conclusion as any)?.materiel_verifie) ? (conclusion as any).materiel_verifie : [];
  const portee = porteeAnalyse(groupes, materiel.length, 0);

  // Exactement ce que `AnalysisResult` construit (lignes 1588-1613).
  const criticalReasons: string[] = (() => {
    const sc = parse(data.score) ?? {};
    const rouges = Array.isArray(sc?.criteres_rouges) ? sc.criteres_rouges : [];
    return rouges.length > 0 ? rouges : (raw?.scoring?.criteres_rouges ?? []);
  })();
  const entrepriseName =
    raw?.extracted?.entreprise?.nom ?? raw?.extracted_data?.entreprise?.nom ?? null;
  const totalHt = Number(raw?.extracted?.totaux?.ht ?? raw?.extracted_data?.totaux?.ht ?? 0) || null;
  const provisoire = data.review_status === "pending_review";
  // Vérifiée au registre (verify.ts), déjà affichée dans le bloc Entreprise.
  const ancienneteAnnees = raw?.verified?.anciennete_annees ?? null;

  const props = {
    conclusion,
    pointsOk: data.points_ok ?? [],
    alertes: data.alertes ?? [],
    entrepriseName,
    criticalReasons,
    portee,
    totalHt,
    provisoire,
  };

  const apres = renderToStaticMarkup(
    createElement(AvisUnifie, { ...props, ancienneteAnnees, statique: true }),
  );
  const avant = renderToStaticMarkup(createElement(AvisUnifieAvant, { ...props, statique: true }));

  const avantD = decisionAffichee(conclusion, portee, criticalReasons);
  const d = decisionAffichee(conclusion, portee, criticalReasons, props.alertes, ancienneteAnnees);
  const meta = [
    `${entrepriseName ?? "—"} · ${totalHt ? `${Math.round(totalHt).toLocaleString("fr-FR")} € HT` : "montant inconnu"}`,
    `décision : ${avantD.decision} (${avantD.ton}) → ${d.decision} (${d.ton})`,
    `ancienneté : ${ancienneteAnnees ?? "—"} an(s)`,
    `portée : ${portee ? `${portee.compares}/${portee.total} postes · ${portee.pctMontant} % du montant` : "—"}`,
    `${(data.points_ok ?? []).length} points vérifiés · ${(data.alertes ?? []).length} alertes · ${(conclusion?.leviers ?? []).length} leviers`,
    `statut : ${data.review_status ?? "—"} · déposé le ${new Date(data.created_at).toLocaleDateString("fr-FR")}`,
  ].join(" · ");

  sections.push(`
    <section class="cas">
      <h2>${echapper(choix.attendu)}</h2>
      <p class="meta">${echapper(meta)}<br><span class="fichier">${echapper(data.file_name ?? "")} · ${data.id.slice(0, 8)}</span></p>
      <div class="cols">
        <div class="col">
          <p class="lbl lbl-avant">Aujourd'hui — le premier bloc seul<br><span>suivi, plus bas, de « Avant de signer », « Préparez votre rendez-vous » et « Ce qui nous a menés à cet avis »</span></p>
          <div class="rendu">${avant}</div>
        </div>
        <div class="col">
          <p class="lbl lbl-apres">Proposition — un seul bloc<br><span>points d'attention remontés · préparation dépliable · « Ce qui nous a menés » supprimé</span></p>
          <div class="rendu">${apres}</div>
        </div>
      </div>
    </section>`);
  console.log(`✓ ${choix.attendu} — ${entrepriseName ?? "?"} (${d.decision})`);
}

const page = `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Maquette — l'analyse en un seul bloc</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  :root{--background:220 20% 97%;--foreground:220 30% 15%;--primary:220 70% 35%;
        --muted-foreground:220 15% 45%;--border:220 20% 88%;}
  .text-foreground{color:hsl(var(--foreground))}
  .text-foreground\\/80{color:hsl(var(--foreground)/.8)}
  .text-foreground\\/75{color:hsl(var(--foreground)/.75)}
  .text-foreground\\/70{color:hsl(var(--foreground)/.7)}
  .text-foreground\\/65{color:hsl(var(--foreground)/.65)}
  .text-foreground\\/60{color:hsl(var(--foreground)/.6)}
  .text-foreground\\/55{color:hsl(var(--foreground)/.55)}
  .text-foreground\\/45{color:hsl(var(--foreground)/.45)}
  .text-foreground\\/40{color:hsl(var(--foreground)/.4)}
  .text-foreground\\/30{color:hsl(var(--foreground)/.3)}
  .border-foreground\\/10{border-color:hsl(var(--foreground)/.1)}
  .border-foreground\\/15{border-color:hsl(var(--foreground)/.15)}
  .bg-background\\/60{background:hsl(var(--background)/.6)}
  .bg-background\\/70{background:hsl(var(--background)/.7)}
  .decoration-foreground\\/25{text-decoration-color:hsl(var(--foreground)/.25)}
  body{background:#eef0f4;font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;margin:0;padding:28px 20px 80px}
  .wrap{max-width:1500px;margin:0 auto}
  h1{font-size:20px;font-weight:650;color:#0f172a;margin:0 0 6px}
  .intro{font-size:13px;color:#64748b;margin:0 0 30px;line-height:1.65;max-width:760px}
  .intro strong{color:#334155}
  .cas{margin-bottom:46px;background:#fff;border-radius:14px;padding:22px;box-shadow:0 1px 3px rgba(15,23,42,.06)}
  .cas h2{font-size:15px;font-weight:650;color:#0f172a;margin:0 0 4px}
  .meta{font-size:11.5px;color:#94a3b8;margin:0 0 18px;line-height:1.6}
  .fichier{color:#cbd5e1}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  @media (max-width:1100px){.cols{grid-template-columns:1fr}}
  .lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin:0 0 9px;line-height:1.5}
  .lbl span{display:block;font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;color:#94a3b8;margin-top:2px}
  .lbl-avant{color:#94a3b8}
  .lbl-apres{color:#0f766e}
  .col{min-width:0}
  summary::-webkit-details-marker{display:none}
</style></head><body><div class="wrap">
<h1>L'analyse en un seul bloc — trois devis réels</h1>
<p class="intro">Rendu par <strong>renderToStaticMarkup</strong> sur les données de trois analyses en base.
Aucun texte n'est écrit dans cet aperçu : titres, points vérifiés, points d'attention, leviers et message copiable
sortent des composants et des fonctions de production.<br>
À gauche, le premier bloc tel qu'il est servi aujourd'hui — les trois autres sections vivent plus bas dans la page.
À droite, la proposition. <strong>Le dépli est cliquable.</strong></p>
${sections.join("\n")}
</div></body></html>`;

const sortie = resolve(process.cwd(), "scripts/out/maquette-avis-unifie.html");
mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(sortie, page, "utf8");
console.log(`\nHTML écrit : ${sortie}`);
