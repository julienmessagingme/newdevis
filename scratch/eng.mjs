import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env=fs.readFileSync(".env.local","utf8");
const g=(k)=>(env.match(new RegExp("^"+k+"=(.*)$","m"))||[])[1]?.trim();
const sb=createClient(g("PUBLIC_SUPABASE_URL")||g("SUPABASE_URL"),g("SUPABASE_SERVICE_ROLE_KEY"));
const {data}=await sb.from("analyses").select("id,file_name,created_at,raw_text").order("created_at",{ascending:false}).limit(40);
const m=new Map();
for(const a of data){
  let r=null;try{r=typeof a.raw_text==="string"?JSON.parse(a.raw_text):a.raw_text;}catch{continue;}
  const e=(r?.extracted??{}).extract_engine ?? "—";
  m.set(e,(m.get(e)??0)+1);
  if(a.id.startsWith("2bc641da")) console.log("→ gouttière :", e, "| type:", r?.type_document);
}
console.log("\nmoteurs sur les 40 dernières analyses :");
for(const [k,v] of m) console.log("  ",k,v);
