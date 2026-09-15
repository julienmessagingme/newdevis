/** Régénère une conclusion en local pour vérifier le rendu réel. Jetable. */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = fs.readFileSync(".env.local", "utf8");
const lire = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const url = lire("PUBLIC_SUPABASE_URL");
const supa = createClient(url, lire("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const cible = process.argv[2];
const { data } = await supa.from("analyses")
  .select("id, user_id, file_name, review_status")
  .eq("file_name", cible).order("created_at", { ascending: false }).limit(1);
if (!data?.length) { console.error("analyse introuvable :", cible); process.exit(1); }
const a = data[0];
console.log("analyse:", a.id, "| review:", a.review_status);
// 🔴 `force: true` écrase le contenu d'une conclusion réécrite par un humain.
if (a.review_status === "corrected") { console.error("REFUS : conclusion corrigée par un expert."); process.exit(1); }

const { data: u } = await supa.auth.admin.getUserById(a.user_id);
const { data: link, error: e2 } = await supa.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
if (e2) { console.error(e2); process.exit(1); }
const anon = createClient(url, lire("PUBLIC_SUPABASE_PUBLISHABLE_KEY"), { auth: { persistSession: false } });
const { data: sess, error: e3 } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (e3) { console.error(e3); process.exit(1); }

const t0 = Date.now();
const res = await fetch(`http://localhost:4321/api/analyse/${a.id}/conclusion`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.session.access_token}` },
  body: JSON.stringify({ force: true }),
});
const txt = await res.text();
console.log("HTTP", res.status, "en", ((Date.now() - t0) / 1000).toFixed(1), "s");
try {
  const j = JSON.parse(txt);
  const c = typeof j.conclusion === "string" ? JSON.parse(j.conclusion) : j.conclusion ?? j;
  console.log("surcout_global :", JSON.stringify(c.surcout_global));
  console.log("verdict        :", c.verdict_global, "/", c.verdict_decisionnel);
  console.log("arbitrage      :", JSON.stringify(c.arbitrage_rapprochement, null, 1));
} catch { console.log(txt.slice(0, 1000)); }
const { data: apres } = await supa.from("analyses").select("review_status").eq("id", a.id).single();
console.log("review_status après :", apres?.review_status);
console.log("URL : http://localhost:4321/analyse/" + a.id);
fs.writeFileSync("public/tmp-session.json", JSON.stringify(sess.session));
