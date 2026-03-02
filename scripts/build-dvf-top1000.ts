import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

type TypeLocal = "Maison" | "Appartement";

interface CommuneData {
  commune: string;
  maison: number[];
  appartement: number[];
}

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function parseNum(s: string): number {
  return parseFloat(s.replace(",", ".").trim());
}

async function processFile(
  filePath: string,
  data: Map<string, CommuneData>,
  stats: { read: number; kept: number }
): Promise<void> {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let headers: string[] | null = null;
  let sep = "|";
  let idxInsee = -1;
  let idxCommune = -1;
  let idxValeur = -1;
  let idxSurface = -1;
  let idxType = -1;

  for await (const line of rl) {
    if (!line.trim()) continue;

    if (headers === null) {
      // Detect separator from header line
      sep = line.includes("|") ? "|" : ";";
      const headerLine = line.trim();
      console.log("HEADER:", headerLine);
      headers = headerLine.split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
      const headerNorm = headers.map(normalizeKey);
      console.log("HEADER_NORM:", headerNorm.slice(0, 40).join("|"));
      idxInsee    = headerNorm.indexOf("code_commune");
      idxCommune  = headerNorm.indexOf("nom_commune");
      idxValeur   = headerNorm.indexOf("valeur_fonciere");
      idxSurface  = headerNorm.indexOf("surface_reelle_bati");
      idxType     = headerNorm.indexOf("type_local");
      console.log("INDEX code_commune        :", idxInsee);
      console.log("INDEX nom_commune         :", idxCommune);
      console.log("INDEX valeur_fonciere     :", idxValeur);
      console.log("INDEX surface_reelle_bati :", idxSurface);
      console.log("INDEX type_local          :", idxType);
      if (idxInsee === -1)   throw new Error(`Colonne 'code_commune' introuvable dans ${filePath}`);
      if (idxValeur === -1)  throw new Error(`Colonne 'valeur_fonciere' introuvable dans ${filePath}`);
      if (idxSurface === -1) throw new Error(`Colonne 'surface_reelle_bati' introuvable dans ${filePath}`);
      if (idxType === -1)    throw new Error(`Colonne 'type_local' introuvable dans ${filePath}`);
      continue;
    }

    stats.read++;

    try {
      const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));

      const typeLocal = cols[idxType] as TypeLocal;
      if (typeLocal !== "Maison" && typeLocal !== "Appartement") continue;

      const valeur = parseNum(cols[idxValeur]);
      const surface = parseNum(cols[idxSurface]);
      if (!valeur || !surface || valeur <= 0 || surface <= 0) continue;

      const prixM2 = valeur / surface;
      if (prixM2 < 500 || prixM2 > 20000) continue;

      const codeInsee = cols[idxInsee];
      if (!codeInsee) continue;

      const communeName = idxCommune !== -1 && cols[idxCommune] ? cols[idxCommune] : codeInsee;

      if (!data.has(codeInsee)) {
        data.set(codeInsee, { commune: communeName, maison: [], appartement: [] });
      }

      const entry = data.get(codeInsee)!;
      if (!entry.commune && communeName) entry.commune = communeName;

      if (typeLocal === "Maison") entry.maison.push(prixM2);
      else entry.appartement.push(prixM2);

      stats.kept++;
    } catch {
      // skip invalid row
    }
  }
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("Usage: npx tsx scripts/build-dvf-top1000.ts <path1.csv> [<path2.csv> ...]");
    process.exit(1);
  }

  const data = new Map<string, CommuneData>();
  const stats = { read: 0, kept: 0 };

  for (const f of files) {
    const abs = path.resolve(f);
    if (!fs.existsSync(abs)) {
      console.error(`File not found: ${abs}`);
      process.exit(1);
    }
    console.log(`Processing: ${abs}`);
    await processFile(abs, data, stats);
  }

  console.log(`Lignes lues    : ${stats.read}`);
  console.log(`Lignes retenues: ${stats.kept}`);
  console.log(`Communes       : ${data.size}`);

  // Build rows
  const rows: {
    code_insee: string;
    commune: string;
    prix_m2_maison: number | null;
    prix_m2_appartement: number | null;
    nb_ventes_maison: number;
    nb_ventes_appartement: number;
    total: number;
  }[] = [];

  for (const [code, d] of data.entries()) {
    const nbMaison = d.maison.length;
    const nbAppart = d.appartement.length;
    const total = nbMaison + nbAppart;
    rows.push({
      code_insee: code,
      commune: d.commune,
      prix_m2_maison: median(d.maison),
      prix_m2_appartement: median(d.appartement),
      nb_ventes_maison: nbMaison,
      nb_ventes_appartement: nbAppart,
      total,
    });
  }

  rows.sort((a, b) => b.total - a.total);
  const top1000 = rows.slice(0, 1000);

  console.log("\nTop 10 communes par volume :");
  top1000.slice(0, 10).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.commune} (${r.code_insee}) — ${r.total} ventes`);
  });

  const outDir = path.resolve("data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "dvf_prices_top1000.csv");

  const updatedAt = new Date().toISOString();
  const source = "DVF (données publiques)";

  const header =
    "code_insee,commune,prix_m2_maison,prix_m2_appartement,nb_ventes_maison,nb_ventes_appartement,source,updated_at\n";

  const stream = fs.createWriteStream(outPath, { encoding: "utf8" });
  stream.write(header);

  for (const r of top1000) {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const fmt = (v: number | null) => (v !== null ? v.toFixed(2) : "");
    const line = [
      esc(r.code_insee),
      esc(r.commune),
      fmt(r.prix_m2_maison),
      fmt(r.prix_m2_appartement),
      r.nb_ventes_maison,
      r.nb_ventes_appartement,
      esc(source),
      esc(updatedAt),
    ].join(",");
    stream.write(line + "\n");
  }

  await new Promise<void>((resolve, reject) => {
    stream.end((err?: Error | null) => (err ? reject(err) : resolve()));
  });

  console.log(`\nFichier écrit : ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
