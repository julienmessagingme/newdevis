import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

function parseLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // handle escaped quotes ""
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

type Row = {
  code_insee: string;
  commune: string;
  loyer_m2_appartement?: number | null;
  loyer_m2_maison?: number | null;
  nb_obs_appartement?: number | null;
  nb_obs_maison?: number | null;
};

async function readFileIntoMap(filePath: string, kind: "appartement" | "maison", map: Map<string, Row>) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let headers: string[] | null = null;
  let sep = ";";

  let idxInsee = -1, idxCommune = -1, idxLoyer = -1, idxTyp = -1, idxNb = -1;

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;

    if (!headers) {
      // detect separator
      sep = line.includes(";") ? ";" : ",";
      headers = parseLine(line, sep).map(stripQuotes);

      idxInsee = headers.indexOf("INSEE_C");
      idxCommune = headers.indexOf("LIBGEO");
      idxLoyer = headers.indexOf("loypredm2");
      idxTyp = headers.indexOf("TYPPRED");
      if (idxTyp === -1) idxTyp = headers.indexOf("TYPPRED"); // safety
      idxNb = headers.indexOf("nbobs_com");

      const ok = [idxInsee, idxCommune, idxLoyer, idxTyp, idxNb].every(i => i >= 0);
      if (!ok) {
        console.error("Headers trouvés:", headers);
        throw new Error(`Colonnes manquantes dans ${filePath}`);
      }
      continue;
    }

    const cols = parseLine(line, sep).map(stripQuotes);

    const typ = (cols[idxTyp] ?? "").trim().toLowerCase();
    if (typ !== "commune") continue; // on garde uniquement le niveau commune

    const code = (cols[idxInsee] ?? "").trim();
    if (!code) continue;

    const commune = (cols[idxCommune] ?? "").trim();
    const loyer = Number((cols[idxLoyer] ?? "").replace(",", "."));
    const nb = Number((cols[idxNb] ?? "").replace(",", "."));

    if (!map.has(code)) {
      map.set(code, { code_insee: code, commune });
    }

    const rec = map.get(code)!;
    // garde la commune si vide
    if (!rec.commune && commune) rec.commune = commune;

    if (kind === "appartement") {
      rec.loyer_m2_appartement = Number.isFinite(loyer) ? Math.round(loyer) : null;
      rec.nb_obs_appartement = Number.isFinite(nb) ? Math.trunc(nb) : 0;
    } else {
      rec.loyer_m2_maison = Number.isFinite(loyer) ? Math.round(loyer) : null;
      rec.nb_obs_maison = Number.isFinite(nb) ? Math.trunc(nb) : 0;
    }
  }
}

async function main() {
  const appartPath = process.argv[2];
  const maisonPath = process.argv[3];
  if (!appartPath || !maisonPath) {
    console.error("Usage: npx tsx scripts/build-rental-v1.ts <loyers_appartements.csv> <loyers_maisons.csv>");
    process.exit(1);
  }

  const map = new Map<string, Row>();
  await readFileIntoMap(appartPath, "appartement", map);
  await readFileIntoMap(maisonPath, "maison", map);

  const outDir = path.resolve("data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, "rental_prices_v1.csv");
  const out = fs.createWriteStream(outPath, { encoding: "utf8" });

  out.write("code_insee,commune,loyer_m2_maison,loyer_m2_appartement,nb_obs_maison,nb_obs_appartement,source,updated_at\n");

  const now = new Date().toISOString();

  const rows = Array.from(map.values()).sort((a,b) => a.code_insee.localeCompare(b.code_insee));
  let kept = 0;

  for (const r of rows) {
    // garde si au moins un des deux loyers existe
    const hasAny = (r.loyer_m2_maison && r.loyer_m2_maison > 0) || (r.loyer_m2_appartement && r.loyer_m2_appartement > 0);
    if (!hasAny) continue;

    const line = [
      r.code_insee,
      (r.commune ?? "").replaceAll(",", " "), // éviter de casser le CSV
      r.loyer_m2_maison ?? "",
      r.loyer_m2_appartement ?? "",
      r.nb_obs_maison ?? 0,
      r.nb_obs_appartement ?? 0,
      "Loyers (données publiques)",
      now,
    ].join(",");

    out.write(line + "\n");
    kept++;
  }

  out.end();
  console.log(`OK: ${kept} communes exportées. Sortie: ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
