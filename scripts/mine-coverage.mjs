// Mining couverture catalogue — familles non couvertes depuis le stock (raw_text.n8n_price_data)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(get("PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"));

const FOREIGN_RE = /dangote|sanaga|fcfa|cfa\b|yaound|douala|cameroun|abidjan|dakar|s[ée]n[ée]gal/i;

const { data } = await supa
  .from("analyses")
  .select("id, file_name, raw_text, created_at")
  .eq("status", "completed")
  .order("created_at", { ascending: false })
  .limit(250);

const families = new Map(); // key → {occ, ht, samples:Set, analyses:Set, confs:{}}
let analysesUsed = 0, foreignSkipped = 0;

for (const a of data) {
  let raw;
  try { raw = typeof a.raw_text === "string" ? JSON.parse(a.raw_text) : a.raw_text; } catch { continue; }
  const pd = raw?.n8n_price_data;
  if (!Array.isArray(pd) || pd.length === 0) continue;
  // Skip devis étrangers non détectés (Cameroun etc.) — polluent les montants
  const allText = pd.map((g) => (g.devis_lines ?? []).map((l) => l.description ?? "").join(" ")).join(" ");
  if (FOREIGN_RE.test(allText) || raw?.extracted?.is_foreign_quote) { foreignSkipped++; continue; }
  analysesUsed++;
  for (const g of pd) {
    const conf = g?.vectorial?.confidence;
    if (!conf || conf === "high") continue; // couvert
    const desc = String(g.devis_lines?.[0]?.description ?? g.job_type_label ?? "").trim();
    if (!desc || desc.length < 4) continue;
    const ht = typeof g.devis_total_ht === "number" ? g.devis_total_ht : 0;
    // Clé de famille : minuscules, sans chiffres/dimensions, 5 premiers mots
    const key = desc.toLowerCase()
      .replace(/[\d.,]+\s*(m2|m²|ml|mm|cm|m|u|kg|t|€|x)?/g, " ")
      .replace(/[^a-zà-ÿ' ]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 5)
      .join(" ");
    if (key.length < 4) continue;
    const f = families.get(key) ?? { occ: 0, ht: 0, samples: new Set(), analyses: new Set(), confs: {} };
    f.occ++;
    f.ht += ht;
    if (f.samples.size < 2) f.samples.add(desc.slice(0, 70));
    f.analyses.add(a.id);
    f.confs[conf] = (f.confs[conf] ?? 0) + 1;
    families.set(key, f);
  }
}

const sorted = [...families.entries()]
  .map(([k, f]) => ({ k, occ: f.occ, nAnalyses: f.analyses.size, ht: Math.round(f.ht), samples: [...f.samples], confs: f.confs }))
  .filter((f) => f.occ >= 2 || f.ht >= 800) // familles récurrentes ou coûteuses
  .sort((a, b) => b.ht - a.ht);

console.log(`Analyses FR utilisées: ${analysesUsed} (étrangères écartées: ${foreignSkipped})`);
console.log(`Familles non couvertes retenues: ${sorted.length}\n`);
for (const f of sorted.slice(0, 45)) {
  console.log(`${String(f.ht).padStart(7)}€ | ${String(f.occ).padStart(2)}× sur ${f.nAnalyses} devis | ${JSON.stringify(f.confs)} | ${f.k}`);
  console.log(`         ex: ${f.samples.join(" ~~ ")}`);
}
