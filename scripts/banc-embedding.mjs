/**
 * scripts/banc-embedding.mjs
 *
 * 2026-09-10 — BANC D'ESSAI DE L'EMBEDDING : DIMENSION ET COMPOSITION DU TEXTE.
 *
 * Question posée : peut-on améliorer le rapprochement ligne de devis ↔ catalogue
 * en changeant l'embedding lui-même — sa DIMENSION (on tronque à 768 alors que
 * le modèle en produit 3 072) ou la COMPOSITION du texte qu'on lui donne (on
 * concatène « Type métier : … », « Domaine : … », « Unité de facturation : … »
 * au libellé, et « Catégorie : … », « Unité : … » à la ligne de devis) ?
 *
 * Réponse mesurée : NON pour les deux. Voir CLAUDE.md pour les chiffres.
 *
 * ── Deux points de méthode qui font toute la valeur du banc ──
 *
 * 1. UN ÉTALON INDÉPENDANT DU VECTORIEL. On ne peut pas juger un classement
 *    avec le classement lui-même. L'étalon retient les lignes de devis pour
 *    lesquelles UNE SEULE entrée du catalogue a TOUS les mots de son libellé
 *    présents dans la ligne — un critère purement lexical, donc extérieur à ce
 *    qu'on mesure. 317 paires sur le stock.
 *    ⚠️ CONSÉQUENCE À NE PAS OUBLIER : cet étalon ne peut PAS servir à valider
 *    un re-classement lexical — ce serait circulaire. Il faudra un échantillon
 *    relu à la main pour ça.
 *
 * 2. LE MODÈLE EST MATRIOCHKA, une seule passe suffit. Vérifié : tronquer un
 *    vecteur 3 072 à ses 768 premières composantes puis le renormaliser donne
 *    un cosinus de 1,000000 avec ce que l'API renvoie pour
 *    outputDimensionality=768. On embarque donc une fois en 3 072 et on dérive
 *    768 / 1 536 / 3 072 localement, sans payer trois fois.
 *
 * ── Ce qu'il mesure ──
 *   rang 1 / rang ≤ 5 : la bonne entrée sort-elle en tête, ou au moins dans les
 *   cinq premières ? C'est indépendant de tout seuil, contrairement à la
 *   similarité brute — dont l'échelle ne veut rien dire (deux textes sans aucun
 *   rapport sortent à 0,85 entre eux).
 *   marge : similarité de la bonne entrée moins celle de sa poursuivante. C'est
 *   la vraie mesure de séparation, et elle est le résultat le plus important du
 *   banc.
 *
 * Usage : node scripts/banc-embedding.mjs
 *   (nécessite scratch/cat2.json et scratch/gold.json — cf. la construction de
 *    l'étalon décrite ci-dessus ; les embeddings sont mis en cache en binaire)
 */
import fs from "node:fs";
const env=fs.readFileSync(".env.local","utf8"); const get=(k)=>env.match(new RegExp(`^${k}=(.*)$`,"m"))?.[1]?.trim();
const KEY=get("GOOGLE_API_KEY"); const M="models/gemini-embedding-001"; const DIM=3072;
const cat=JSON.parse(fs.readFileSync("scratch/cat2.json","utf8"));
const gold=JSON.parse(fs.readFileSync("scratch/gold.json","utf8"));

// ── variantes de texte ──
const DOC={
  D0:(r)=>[r.label||"",r.notes?`Précisions : ${r.notes}`:"",`Type métier : ${r.job_type}`,r.domain?`Domaine : ${r.domain}`:"",`Unité de facturation : ${r.unit}`].filter(Boolean).join(". "),
  D1:(r)=>r.label||"",
  D2:(r)=>[r.label||"",r.notes?`Précisions : ${r.notes}`:""].filter(Boolean).join(". "),
};
const REQ={
  Q0:(l)=>{const p=[l.desc.trim()]; if(l.cat&&l.cat.toLowerCase()!=="autre")p.push(`Catégorie : ${l.cat}`); if(l.unite)p.push(`Unité : ${l.unite}`); return p.join(". ");},
  Q1:(l)=>l.desc.trim(),
};

async function batch(textes,task){
  const out=[];
  for(let i=0;i<textes.length;i+=25){
    const lot=textes.slice(i,i+25);
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/${M}:batchEmbedContents?key=${KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({requests:lot.map(t=>({model:M,content:{parts:[{text:t}]},taskType:task,outputDimensionality:DIM}))})});
    if(!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0,200)}`);
    const v=((await r.json()).embeddings??[]).map(e=>Float32Array.from(e.values));
    if(v.length!==lot.length) throw new Error("retour incomplet");
    out.push(...v);
    process.stdout.write(`\r    ${Math.min(i+25,textes.length)}/${textes.length}`);
  }
  process.stdout.write("\n"); return out;
}
async function cache(nom,textes,task){
  const f=`scratch/${nom}.bin`;
  if(fs.existsSync(f)){const b=fs.readFileSync(f);const a=new Float32Array(b.buffer,b.byteOffset,b.length/4);
    return Array.from({length:textes.length},(_,i)=>a.subarray(i*DIM,(i+1)*DIM));}
  console.log(`  embeddings ${nom} (${textes.length})`);
  const v=await batch(textes,task);
  const flat=new Float32Array(v.length*DIM); v.forEach((x,i)=>flat.set(x,i*DIM));
  fs.writeFileSync(f,Buffer.from(flat.buffer)); return v;
}
const tronque=(v,d)=>{const s=v.subarray(0,d); let n=0; for(let i=0;i<d;i++)n+=s[i]*s[i]; n=Math.sqrt(n);
  const o=new Float32Array(d); for(let i=0;i<d;i++)o[i]=s[i]/n; return o;};
const dot=(a,b,d)=>{let s=0;for(let i=0;i<d;i++)s+=a[i]*b[i];return s;};

const vecDoc={}, vecReq={};
for(const k of Object.keys(DOC)) vecDoc[k]=await cache(`doc-${k}`,cat.map(DOC[k]),"RETRIEVAL_DOCUMENT");
for(const k of Object.keys(REQ)) vecReq[k]=await cache(`req-${k}`,gold.map(REQ[k]),"RETRIEVAL_QUERY");

const idxGold=gold.map(g=>cat.findIndex(r=>r.job_type===g.job));
console.log("\n" + "configuration".padEnd(16)+"rang 1".padStart(9)+"rang≤5".padStart(9)+"marge méd.".padStart(12)+"sim. étalon".padStart(13)+"sim. 2e".padStart(10));
for(const D of Object.keys(DOC)) for(const Q of Object.keys(REQ)) for(const d of [768,1536,3072]){
  const docs=vecDoc[D].map(v=>tronque(v,d));
  let r1=0,r5=0; const marges=[],simG=[],simA=[];
  for(let i=0;i<gold.length;i++){
    if(idxGold[i]<0) continue;
    const q=tronque(vecReq[Q][i],d);
    let best=-2,best2=-2,bestJ=-1;
    for(let j=0;j<docs.length;j++){const s=dot(q,docs[j],d);
      if(s>best){best2=best;best=s;bestJ=j;} else if(s>best2)best2=s;}
    const sg=dot(q,docs[idxGold[i]],d);
    // rang de l'étalon
    let rang=1; for(let j=0;j<docs.length;j++) if(j!==idxGold[i]&&dot(q,docs[j],d)>sg) rang++;
    if(rang===1)r1++; if(rang<=5)r5++;
    marges.push(sg-(bestJ===idxGold[i]?best2:best)); simG.push(sg); simA.push(bestJ===idxGold[i]?best2:best);
  }
  const med=(x)=>{const s=[...x].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
  console.log(`${D}/${Q}/${String(d).padStart(4)}`.padEnd(16)+
    `${Math.round(r1/gold.length*100)} %`.padStart(9)+`${Math.round(r5/gold.length*100)} %`.padStart(9)+
    med(marges).toFixed(4).padStart(12)+med(simG).toFixed(4).padStart(13)+med(simA).toFixed(4).padStart(10));
}
