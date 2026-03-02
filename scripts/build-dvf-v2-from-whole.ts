import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

function splitCsvLine(line: string): string[] {
  // CSV simple (séparateur virgule), sans gestion complète des quotes (OK pour ce fichier)
  return line.split(",");
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: npx tsx scripts/build-dvf-v2-from-whole.ts <stats_whole_period.csv>");
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let headers: string[] | null = null;
  let idxCode = -1, idxName = -1, idxScale = -1;
  let idxNbMaison = -1, idxPrixMaison = -1, idxNbApp = -1, idxPrixApp = -1;

  const outDir = path.resolve("data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "dvf_prices_v2.csv");
  const out = fs.createWriteStream(outPath, { encoding: "utf8" });

  out.write("code_insee,commune,prix_m2_maison,prix_m2_appartement,nb_ventes_maison,nb_ventes_appartement,source,updated_at\n");

  let kept = 0, skipped = 0, read = 0;

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;

    if (!headers) {
      headers = splitCsvLine(line).map(h => h.trim());
      const h = headers;
      idxCode = h.indexOf("code_geo");
      idxName = h.indexOf("libelle_geo");
      idxScale = h.indexOf("echelle_geo");
      idxNbMaison = h.indexOf("nb_ventes_whole_maison");
      idxPrixMaison = h.indexOf("moy_prix_m2_whole_maison");
      idxNbApp = h.indexOf("nb_ventes_whole_appartement");
      idxPrixApp = h.indexOf("moy_prix_m2_whole_appartement");

      const ok = [idxCode, idxName, idxScale, idxNbMaison, idxPrixMaison, idxNbApp, idxPrixApp].every(i => i >= 0);
      if (!ok) {
        console.error("Colonnes manquantes. Headers trouvés:", headers);
        process.exit(1);
      }
      continue;
    }

    read++;
    const cols = splitCsvLine(line);

    const scale = cols[idxScale] ?? "";
    const scaleRaw = (cols[idxScale] ?? "").trim().toUpperCase();

// DEBUG : affiche quelques valeurs rencontrées
if (kept === 0 && read < 30) {
  console.log("DEBUG echelle_geo =", JSON.stringify(scaleRaw));
}

// On accepte COM et variantes éventuelles
if (!(scaleRaw === "COM" || scaleRaw.startsWith("COM"))) {
  skipped++;
  continue;
}

    const code = (cols[idxCode] ?? "").trim();
    const name = (cols[idxName] ?? "").trim();

    const prixMaison = Math.round(Number(cols[idxPrixMaison] || 0));
    const prixApp = Math.round(Number(cols[idxPrixApp] || 0));
    const nbMaison = Number(cols[idxNbMaison] || 0);
    const nbApp = Number(cols[idxNbApp] || 0);

    if (!code || (!prixMaison && !prixApp)) { skipped++; continue; }

    const now = new Date().toISOString();
    out.write([code, name, prixMaison || "", prixApp || "", nbMaison || 0, nbApp || 0, "DVF statistiques", now].join(",") + "\n");
    kept++;
  }

  out.end();
  console.log(`OK: ${kept} communes exportées (${skipped} ignorées). Sortie: ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
