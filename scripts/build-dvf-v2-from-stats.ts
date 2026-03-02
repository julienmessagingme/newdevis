/**
 * build-dvf-v2-from-stats.ts
 *
 * Lit un fichier CSV "Statistiques DVF" (data.gouv.fr) et produit
 * data/dvf_prices_v2.csv prêt à importer dans Supabase (table dvf_prices_v2).
 *
 * Formats supportés automatiquement :
 *   - WIDE  : 1 ligne par commune+annee — colonnes nb_maisons / prix_moyen_m2_maison
 *             (ex: "Statistiques des mutations immobilières à la commune")
 *   - LONG  : 1 ligne par commune+type_local+annee — colonnes type_local / nb_ventes / prix_m2_median
 *             (ex: "Indicateurs DVF par commune", "DVF+ open data Cerema")
 *
 * Usage :
 *   npx tsx scripts/build-dvf-v2-from-stats.ts <fichier.csv>
 *
 * Sortie : data/dvf_prices_v2.csv
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// ── Output types ──────────────────────────────────────────────────────────────

interface OutRow {
  code_insee: string;
  commune: string;
  prix_m2_maison: number | null;
  prix_m2_appartement: number | null;
  nb_ventes_maison: number | null;
  nb_ventes_appartement: number | null;
  source: string;
  updated_at: string;
}

// ── Column normaliser ─────────────────────────────────────────────────────────

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// ── Column candidates — ordered by priority ───────────────────────────────────

const COLS = {
  code_insee: [
    "code_commune", "codecommune",
    "code_geo", "codegeo",
    "geo_code", "geocode",
    "code_insee", "codeinsee",
    "insee", "code_commune_insee",
    "com", "codcom",
  ],
  commune: [
    "libelle_geo", "libellego",
    "lib_geo", "libgeo",
    "nom_commune", "nomcommune",
    "commune", "libelle", "libelle_commune",
    "geo_name", "geoname",
    "name", "nom",
  ],
  echelle: [
    "echelle_geo", "echellegeo",
    "niveau_geo", "niveaugeo",
    "geo_scale", "geoscale",
    "type_geo", "typegeo",
    "echelle", "niveau", "scale", "level",
  ],
  type_local: [
    "type_local", "typelocal",
    "type_bien", "typebien",
    "type_de_bien", "typelogement",
    "nature_mutation",
  ],
  annee: [
    "annee", "year",
    "annee_mutation", "millesime",
    "periode", "period",
    "annee_dvf", "year_dvf",
  ],
  // LONG format
  nb_ventes: [
    "nb_ventes", "nbventes",
    "nb_mutation", "nbmutation",
    "nb_mutations", "nbmutations",
    "nombre_ventes", "nombreventes",
    "nombre_mutations", "nombremutations",
    "nb_transactions", "nbtransactions",
    "nb_ventes_par_annee",
  ],
  prix_m2: [
    "med_prix_m2", "medprixm2",
    "prix_m2_median", "prixm2median",
    "mediane_prix_m2", "medianeprixm2",
    "prix_median_m2", "prixmedianm2",
    "px_med_m2", "pxmedm2",
    "prix_m2_moyen", "prixm2moyen",
    "prix_moyen_m2", "prixmoyenm2",
    "moy_prix_m2", "moyprixm2",
    "prix_m2",
  ],
  // WIDE format — maison
  nb_maisons: [
    "nb_maisons", "nbmaisons",
    "nb_ventes_maison", "nbventesmaison",
    "nombre_maisons", "nombremaisons",
    "n_maison",
  ],
  prix_maison: [
    "prix_moyen_m2_maison", "prixmoyenm2maison",
    "prix_m2_maison", "prixm2maison",
    "prix_median_m2_maison", "prixmedianm2maison",
    "med_prix_m2_maison", "medprixm2maison",
    "px_med_m2_maison", "pxmedm2maison",
  ],
  // WIDE format — appartement
  nb_apparts: [
    "nb_apparts", "nbapparts",
    "nb_appartements", "nbappartements",
    "nb_ventes_appart", "nbventesappart",
    "nb_ventes_appartement", "nbventesappartement",
    "nombre_appartements", "nombreappartements",
    "n_appart",
  ],
  prix_appart: [
    "prix_moyen_m2_appart", "prixmoyenm2appart",
    "prix_moyen_m2_appartement", "prixmoyenm2appartement",
    "prix_m2_appart", "prixm2appart",
    "prix_m2_appartement", "prixm2appartement",
    "prix_median_m2_appart", "prixmedianm2appart",
    "med_prix_m2_appart", "medprixm2appart",
    "px_med_m2_appart", "pxmedm2appart",
  ],
} as const;

type ColKey = keyof typeof COLS;

function findCol(headersNorm: string[], key: string): number {
  // 1) mapping éventuel (COLS) sinon fallback sur key
  const raw = (COLS as any)?.[key];
  const candidates: string[] = Array.isArray(raw) ? raw : [key];

  // 2) essaie chaque candidat normalisé
  for (const cand of candidates) {
    const idx = headersNorm.indexOf(norm(cand));
    if (idx !== -1) return idx;
  }
  return -1;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseNum(s: string): number {
  if (!s || s.trim() === "" || s.trim() === "NA" || s.trim() === "null") return NaN;
  return parseFloat(s.replace(",", ".").trim());
}

function detectSep(line: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  for (const c of line) if (c in counts) counts[c]++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function splitLine(line: string, sep: string): string[] {
  // Simple CSV split — handles double-quoted fields
  const cols: string[] = [];
  let inQuote = false;
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === sep && !inQuote) {
      cols.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

function esc(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ── Type matching ─────────────────────────────────────────────────────────────

const MAISON_VALS  = new Set(["maison", "maisons", "house"]);
const APPART_VALS  = new Set(["appartement", "appartements", "appart", "apartment", "apartments"]);

function matchType(val: string): "maison" | "appartement" | null {
  const v = norm(val);
  if (MAISON_VALS.has(v))  return "maison";
  if (APPART_VALS.has(v))  return "appartement";
  return null;
}

// ── Scale filter values (keep "commune" level) ────────────────────────────────

const COMMUNE_VALS = new Set([
  "commune", "communes", "com",
  "municipal", "municipality", "mun",
]);

function isCommune(val: string): boolean {
  return COMMUNE_VALS.has(norm(val));
}

// ── Accumulators ──────────────────────────────────────────────────────────────

interface AccEntry {
  commune: string;
  annee: number;
  nb_maisons: number | null;
  prix_maison: number | null;
  nb_apparts: number | null;
  prix_appart: number | null;
}

// key = code_insee
const acc = new Map<string, AccEntry>();

function upsert(
  codeInsee: string,
  communeName: string,
  annee: number,
  nb_maisons: number | null,
  prix_maison: number | null,
  nb_apparts: number | null,
  prix_appart: number | null,
): void {
  const existing = acc.get(codeInsee);
  if (!existing || annee > existing.annee) {
    acc.set(codeInsee, { commune: communeName, annee, nb_maisons, prix_maison, nb_apparts, prix_appart });
  }
}

// ── LONG-format accumulator ───────────────────────────────────────────────────
// key = `${codeInsee}::${annee}`, value = partial AccEntry
const longAcc = new Map<string, Partial<AccEntry> & { codeInsee: string }>();

function upsertLong(
  codeInsee: string,
  communeName: string,
  annee: number,
  type: "maison" | "appartement",
  nb: number | null,
  prix: number | null,
): void {
  const k = `${codeInsee}::${annee}`;
  if (!longAcc.has(k)) {
    longAcc.set(k, { codeInsee, commune: communeName, annee, nb_maisons: null, prix_maison: null, nb_apparts: null, prix_appart: null });
  }
  const e = longAcc.get(k)!;
  if (type === "maison") {
    e.nb_maisons  = nb;
    e.prix_maison = prix;
  } else {
    e.nb_apparts  = nb;
    e.prix_appart = prix;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("Usage: npx tsx scripts/build-dvf-v2-from-stats.ts <fichier.csv>");
    process.exit(1);
  }

  for (const filePath of files) {
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs)) {
      console.error(`Fichier introuvable : ${abs}`);
      process.exit(1);
    }
    console.log(`\n═══════════════════════════════════════════════`);
    console.log(`Fichier : ${abs}`);
    await processFile(abs);
  }

  // ── Consolidate LONG-format data ─────────────────────────────────────────
  if (longAcc.size > 0) {
    console.log(`\n[long] Consolidation de ${longAcc.size} lignes (code_insee × annee)...`);
    for (const [, e] of longAcc) {
      if (!e.codeInsee) continue;
      upsert(
        e.codeInsee,
        e.commune ?? e.codeInsee,
        e.annee ?? 0,
        e.nb_maisons ?? null,
        e.prix_maison ?? null,
        e.nb_apparts ?? null,
        e.prix_appart ?? null,
      );
    }
  }

  // ── Build output rows ─────────────────────────────────────────────────────
  const updatedAt = new Date().toISOString();
  const source = "DVF statistiques";

  const rows: OutRow[] = [];
  let skippedNoPrice = 0;

  for (const [code, e] of acc) {
    const prixM  = e.prix_maison   != null && !isNaN(e.prix_maison)  && e.prix_maison  > 0 ? Math.round(e.prix_maison)  : null;
    const prixA  = e.prix_appart   != null && !isNaN(e.prix_appart)  && e.prix_appart  > 0 ? Math.round(e.prix_appart)  : null;

    if (prixM === null && prixA === null) { skippedNoPrice++; continue; }

    rows.push({
      code_insee:           code,
      commune:              e.commune,
      prix_m2_maison:       prixM,
      prix_m2_appartement:  prixA,
      nb_ventes_maison:     e.nb_maisons != null && !isNaN(e.nb_maisons)  ? Math.round(e.nb_maisons)  : null,
      nb_ventes_appartement: e.nb_apparts != null && !isNaN(e.nb_apparts) ? Math.round(e.nb_apparts) : null,
      source,
      updated_at: updatedAt,
    });
  }

  rows.sort((a, b) => a.code_insee.localeCompare(b.code_insee));

  // ── Write CSV ─────────────────────────────────────────────────────────────
  const outDir  = path.resolve("data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "dvf_prices_v2.csv");

  const HEADER = "code_insee,commune,prix_m2_maison,prix_m2_appartement,nb_ventes_maison,nb_ventes_appartement,source,updated_at\n";
  const stream = fs.createWriteStream(outPath, { encoding: "utf8" });
  stream.write(HEADER);

  for (const r of rows) {
    const line = [
      esc(r.code_insee),
      esc(r.commune),
      r.prix_m2_maison        != null ? r.prix_m2_maison        : "",
      r.prix_m2_appartement   != null ? r.prix_m2_appartement   : "",
      r.nb_ventes_maison      != null ? r.nb_ventes_maison      : "",
      r.nb_ventes_appartement != null ? r.nb_ventes_appartement : "",
      esc(r.source),
      esc(r.updated_at),
    ].join(",");
    stream.write(line + "\n");
  }

  await new Promise<void>((resolve, reject) =>
    stream.end((err?: Error | null) => (err ? reject(err) : resolve()))
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  RÉSULTAT                                    ║`);
  console.log(`╚══════════════════════════════════════════════╝`);
  console.log(`  Communes exportées     : ${rows.length}`);
  console.log(`  Skipped (prix nuls)    : ${skippedNoPrice}`);
  console.log(`  Fichier écrit          : ${outPath}`);
  console.log(`\n  Aperçu des 5 premières lignes :`);
  rows.slice(0, 5).forEach(r =>
    console.log(`    ${r.code_insee.padEnd(6)} ${r.commune.padEnd(30)} M=${r.prix_m2_maison ?? "—"} A=${r.prix_m2_appartement ?? "—"}`)
  );
}

// ── File processor ────────────────────────────────────────────────────────────

async function processFile(filePath: string): Promise<void> {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let sep = ",";
  let headers: string[] | null = null;
  let headersNorm: string[] = [];
  let format: "wide" | "long" | "whole" | "unknown" = "unknown";

  // Column indices
  let idxInsee    = -1;
  let idxCommune  = -1;
  let idxEchelle  = -1;
  let idxAnnee    = -1;
  // LONG
  let idxTypeLocal   = -1;
  let idxNbVentes    = -1;
  let idxPrixM2      = -1;// WHOLE_PERIOD
  let idxCodeGeo = -1;
  let idxLibelleGeo = -1;
  let idxEchelleGeo = -1;
  let idxNbMaisonWhole = -1;
  let idxPrixMaisonWhole = -1;
  let idxNbAppartWhole = -1;
  let idxPrixAppartWhole = -1;
  // WIDE
  let idxNbMaisons   = -1;
  let idxPrixMaison  = -1;
  let idxNbApparts   = -1;
  let idxPrixAppart  = -1;

  let linesRead  = 0;
  let linesKept  = 0;
  let linesSkipped = 0;

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;

    // ── Header line ─────────────────────────────────────────────────────────
    if (headers === null) {
      sep = detectSep(line);
      headers     = splitLine(line, sep);
      headersNorm = headers.map(norm);

      console.log(`\nSéparateur détecté   : "${sep === "\t" ? "\\t" : sep}"`);
      console.log(`Colonnes             : ${headers.length}`);
      console.log(`Headers (raw)        : ${headers.slice(0, 20).join(" | ")}`);
      console.log(`Headers (normalisés) : ${headersNorm.slice(0, 20).join(" | ")}`);

      // Detect column indices
      idxInsee   = findCol(headersNorm, "code_insee");
      idxCommune = findCol(headersNorm, "commune");
      idxEchelle = findCol(headersNorm, "echelle");
      idxAnnee   = findCol(headersNorm, "annee");
      // Try WHOLE_PERIOD (stats_whole_period.csv)
      idxCodeGeo = findCol(headersNorm, "code_geo");
      idxLibelleGeo = findCol(headersNorm, "libelle_geo");
      idxEchelleGeo = findCol(headersNorm, "echelle_geo");
      idxNbMaisonWhole = findCol(headersNorm, "nb_ventes_whole_maison");
      idxPrixMaisonWhole = findCol(headersNorm, "moy_prix_m2_whole_maison");
      idxNbAppartWhole = findCol(headersNorm, "nb_ventes_whole_appartement");
      idxPrixAppartWhole = findCol(headersNorm, "moy_prix_m2_whole_appartement");

      const isWhole =
      idxCodeGeo !== -1 &&
      idxLibelleGeo !== -1 &&
      idxEchelleGeo !== -1 &&
      idxNbMaisonWhole !== -1 &&
      idxPrixMaisonWhole !== -1 &&
      idxNbAppartWhole !== -1 &&
      idxPrixAppartWhole !== -1;
      // Try WIDE first
      idxNbMaisons  = findCol(headersNorm, "nb_maisons");
      idxPrixMaison = findCol(headersNorm, "prix_maison");
      idxNbApparts  = findCol(headersNorm, "nb_apparts");
      idxPrixAppart = findCol(headersNorm, "prix_appart");

      // Try LONG
      idxTypeLocal = findCol(headersNorm, "type_local");
      idxNbVentes  = findCol(headersNorm, "nb_ventes");
      idxPrixM2    = findCol(headersNorm, "prix_m2");

      const isWide = idxPrixMaison !== -1 || idxPrixAppart !== -1;
      const isLong = idxTypeLocal !== -1 && idxPrixM2 !== -1;

      format = isWhole ? "whole" : isWide ? "wide" : isLong ? "long" : "unknown";console.log("Format détecté :", format);


      // Reporting
      console.log(`\nDétection colonnes :`);
      console.log(`  code_insee   → col #${idxInsee  >=0 ? idxInsee   : "NON TROUVÉ"} (${idxInsee  >=0 ? headers[idxInsee]   : "?"})`);
      console.log(`  commune      → col #${idxCommune>=0 ? idxCommune : "NON TROUVÉ"} (${idxCommune>=0 ? headers[idxCommune] : "?"})`);
      console.log(`  echelle_geo  → col #${idxEchelle>=0 ? idxEchelle : "absent"      } (${idxEchelle>=0 ? headers[idxEchelle] : "pas de filtre"})`);
      console.log(`  annee        → col #${idxAnnee  >=0 ? idxAnnee   : "NON TROUVÉ"} (${idxAnnee  >=0 ? headers[idxAnnee]   : "?"})`);

      if (format === "wide") {
        console.log(`\nFormat : WIDE (colonnes maison/appartement séparées)`);
        console.log(`  nb_maisons   → col #${idxNbMaisons >=0 ? idxNbMaisons  : "absent"} (${idxNbMaisons >=0 ? headers[idxNbMaisons]  : "—"})`);
        console.log(`  prix_maison  → col #${idxPrixMaison>=0 ? idxPrixMaison : "absent"} (${idxPrixMaison>=0 ? headers[idxPrixMaison] : "—"})`);
        console.log(`  nb_apparts   → col #${idxNbApparts >=0 ? idxNbApparts  : "absent"} (${idxNbApparts >=0 ? headers[idxNbApparts]  : "—"})`);
        console.log(`  prix_appart  → col #${idxPrixAppart>=0 ? idxPrixAppart : "absent"} (${idxPrixAppart>=0 ? headers[idxPrixAppart] : "—"})`);
      } else if (format === "long") {
        console.log(`\nFormat : LONG (une ligne par commune × type_local × annee)`);
        console.log(`  type_local   → col #${idxTypeLocal>=0 ? idxTypeLocal : "absent"} (${idxTypeLocal>=0 ? headers[idxTypeLocal] : "—"})`);
        console.log(`  nb_ventes    → col #${idxNbVentes >=0 ? idxNbVentes  : "absent"} (${idxNbVentes >=0 ? headers[idxNbVentes]  : "—"})`);
        console.log(`  prix_m2      → col #${idxPrixM2   >=0 ? idxPrixM2    : "absent"} (${idxPrixM2   >=0 ? headers[idxPrixM2]    : "—"})`);
      } else {
        console.error(`\n⚠️  Format inconnu — ni wide ni long détecté.`);
        console.error(`   Vérifiez que le fichier contient bien :`);
        console.error(`   - Format WIDE : colonnes prix_moyen_m2_maison / prix_moyen_m2_appart`);
        console.error(`   - Format LONG : colonnes type_local / nb_ventes / prix_m2_median`);
        console.error(`   Headers disponibles :\n   ${headers.join("\n   ")}`);
        process.exit(1);
      }

      if (idxInsee < 0) {
        console.error(`\n⚠️  Colonne code_insee introuvable. Headers disponibles :\n${headers.join("\n")}`);
        process.exit(1);
      }

      console.log(`\nTraitement des données...`);
      continue;
    }

    // ── Data lines ───────────────────────────────────────────────────────────
    linesRead++;

    const cols = splitLine(line, sep);
    if (format === "whole") {
  const echelle = cols[idxEchelleGeo] ?? "";
  if (echelle !== "COM") { linesSkipped++; continue; }

  const code = cols[idxCodeGeo] ?? "";
  const nom = cols[idxLibelleGeo] ?? "";

  const prixMaison = Math.round(Number(cols[idxPrixMaisonWhole] || 0));
  const prixAppart = Math.round(Number(cols[idxPrixAppartWhole] || 0));
  const nbMaison = Number(cols[idxNbMaisonWhole] || 0);
  const nbAppart = Number(cols[idxNbAppartWhole] || 0);

  if (!code || (!prixMaison && !prixAppart)) { linesSkipped++; continue; }

  if (format === "whole") {
  const echelle = cols[idxEchelleGeo] ?? "";
  if (echelle !== "COM") { linesSkipped++; continue; }

  const code = cols[idxCodeGeo] ?? "";
  const nom = cols[idxLibelleGeo] ?? "";

  const prixMaison = Math.round(Number(cols[idxPrixMaisonWhole] || 0));
  const prixAppart = Math.round(Number(cols[idxPrixAppartWhole] || 0));
  const nbMaison = Number(cols[idxNbMaisonWhole] || 0);
  const nbAppart = Number(cols[idxNbAppartWhole] || 0);

  if (!code || (!prixMaison && !prixAppart)) { linesSkipped++; continue; }

  rows.push({
    code_insee: code,
    commune: nom,
    prix_m2_maison: prixMaison || null,
    prix_m2_appartement: prixAppart || null,
    nb_ventes_maison: nbMaison || 0,
    nb_ventes_appartement: nbAppart || 0,
  });

  linesKept++;
continue;
}
if (cols.length < 3) continue;

    // Scale filter
    if (idxEchelle >= 0) {
      const scale = cols[idxEchelle] ?? "";
      if (!isCommune(scale)) { linesSkipped++; continue; }
    }

    const codeInsee   = (cols[idxInsee] ?? "").trim();
    const communeName = idxCommune >= 0 ? (cols[idxCommune] ?? codeInsee).trim() : codeInsee;
    const anneeRaw    = idxAnnee >= 0 ? cols[idxAnnee] : "";
    const annee       = anneeRaw ? (parseInt(anneeRaw, 10) || 0) : 0;

    if (!codeInsee) continue;

    if (format === "wide") {
      const nbM  = idxNbMaisons  >= 0 ? parseNum(cols[idxNbMaisons]  ?? "") : null;
      const prM  = idxPrixMaison >= 0 ? parseNum(cols[idxPrixMaison]  ?? "") : null;
      const nbA  = idxNbApparts  >= 0 ? parseNum(cols[idxNbApparts]  ?? "") : null;
      const prA  = idxPrixAppart >= 0 ? parseNum(cols[idxPrixAppart] ?? "") : null;

      upsert(codeInsee, communeName, annee,
        !isNaN(nbM ?? NaN) ? nbM : null,
        !isNaN(prM ?? NaN) ? prM : null,
        !isNaN(nbA ?? NaN) ? nbA : null,
        !isNaN(prA ?? NaN) ? prA : null,
      );
      linesKept++;
    } else {
      // LONG format
      const typeRaw  = idxTypeLocal >= 0 ? (cols[idxTypeLocal] ?? "").trim() : "";
      const typeMatch = matchType(typeRaw);
      if (!typeMatch) { linesSkipped++; continue; }

      const nbV  = idxNbVentes >= 0 ? parseNum(cols[idxNbVentes] ?? "") : null;
      const prM2 = idxPrixM2   >= 0 ? parseNum(cols[idxPrixM2]   ?? "") : null;

      upsertLong(codeInsee, communeName, annee, typeMatch,
        !isNaN(nbV  ?? NaN) ? nbV  : null,
        !isNaN(prM2 ?? NaN) ? prM2 : null,
      );
      linesKept++;
    }

    if (linesRead % 100_000 === 0) {
      process.stdout.write(`  ${linesRead.toLocaleString()} lignes lues...\r`);
    }
  }

  console.log(`\n  Lignes lues    : ${linesRead.toLocaleString()}`);
  console.log(`  Lignes retenues: ${linesKept.toLocaleString()}`);
  console.log(`  Lignes filtrées: ${linesSkipped.toLocaleString()}`);
}

// ── Run ───────────────────────────────────────────────────────────────────────

main().catch((e) => { console.error(e); process.exit(1); });
