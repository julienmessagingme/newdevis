// Chirurgie COSTA (0d9336af + cff102b2) — alignement sur correction expert : à négocier
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const supa = createClient(get("PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"));

const IDS = ["0d9336af", "cff102b2"];
const { data: all } = await supa.from("analyses").select("id, file_name, review_status, conclusion_ia");

for (const short of IDS) {
  const a = all.find((r) => r.id.startsWith(short));
  if (!a) { console.error("introuvable:", short); continue; }
  writeFileSync(`backup-${short}.json`, JSON.stringify(a, null, 2));
  const ci = typeof a.conclusion_ia === "string" ? JSON.parse(a.conclusion_ia) : a.conclusion_ia;

  console.log("═══", short, "| review_status:", a.review_status);
  console.log("  avant:", ci.verdict_global, "/", ci.verdict_decisionnel);
  console.log("  verdict_ligne avant:", JSON.stringify(ci.verdict_ligne)?.slice(0, 250));
  console.log("  actions avant:", JSON.stringify(ci.actions_avant_signature)?.slice(0, 400));

  ci.verdict_global = "a_negocier";
  ci.verdict_decisionnel = "signer_avec_negociation";
  ci.niveau_risque = "modéré";
  ci.phrase_intro =
    "23 759,70 € TTC pour la rénovation d'une salle d'eau — devis sérieux porté par une entreprise établie (14 ans, en règle), mais deux postes dépassent les fourchettes du marché, surtout la pose de faïence : négociez avant de signer.";

  if (ci.verdict_ligne) {
    ci.verdict_ligne.decision = "signer_avec_negociation";
    ci.verdict_ligne.resume = ci.verdict_ligne.resume?.replace(/risque élevé[^.]*/i, "quelques postes dépassent les fourchettes du marché");
  }
  if (ci.verdict_reasons) {
    ci.verdict_reasons.summary = "Deux postes au-dessus du marché (pose de faïence en tête) — la négociation suffit à corriger l'écart.";
    ci.verdict_reasons.reasons = (ci.verdict_reasons.reasons ?? []).map((r) =>
      r.replace(/ne (doit|devrait) pas être signé[^.]*\.?/gi, "à négocier avant signature.")
       .replace(/risque élevé/gi, "écart à négocier"),
    );
  }

  const NEGATIVE_ACTION = /ne\s+signez\s+pas|ne\s+pas\s+signer|ne\s+donnez\s+aucune\s+suite|recherchez\s+d[''`]autres\s+professionnels/i;
  const nego =
    "Négociez la pose de faïence murale : 3 401 € pour 19 m² soit 179 €/m² en pose seule (fourniture facturée à part), contre 40-95 €/m² sur le marché — marge de négociation d'environ 1 600 €.";
  const rest = (ci.actions_avant_signature ?? []).filter((x) => !NEGATIVE_ACTION.test(x) && !/faïence/i.test(x));
  ci.actions_avant_signature = [nego, ...rest].slice(0, 3);

  const { error } = await supa.from("analyses")
    .update({ conclusion_ia: typeof a.conclusion_ia === "string" ? JSON.stringify(ci) : ci })
    .eq("id", a.id);
  console.log("  →", error ?? "aligné a_negocier / signer_avec_negociation");
}
