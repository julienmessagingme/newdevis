/**
 * scripts/relecture-ia.mjs
 *
 * 2026-09-10 (idee Johan) — FAIT RELIRE LES 150 MEMES LIGNES PAR L IA.
 *
 * Elle recoit EXACTEMENT ce que le relecteur humain a eu : meme ligne, meme
 * contexte, memes cinq candidats SANS leurs prix, meme consigne. A une
 * difference pres, qui est le coeur du protocole : **l ordre des candidats est
 * tire au hasard pour chaque ligne**. Sans ce melange, un modele qui repondrait
 * "1" systematiquement afficherait un score flatteur sans rien juger — et on ne
 * pourrait pas le distinguer d un vrai raisonnement. Les reponses sont remises
 * dans la numerotation vue par l humain avant comparaison.
 *
 * Resultat de la premiere passe : accord 55 %% avec l humain (contre 39 %% pour
 * le top-1 vectoriel), et surtout 55 %% des lignes ou les DEUX disent qu aucune
 * entree du catalogue ne convient. Cf. CLAUDE.md.
 *
 * Usage : node scripts/relecture-ia.mjs   (reprend ou il s est arrete)
 */
import fs from "node:fs";
const env=fs.readFileSync(".env.local","utf8"); const g=(k)=>env.match(new RegExp(`^${k}=(.*)$`,"m"))?.[1]?.trim();
const KEY=g("GOOGLE_API_KEY"); const MODELE="gemini-2.5-pro";
const cle=JSON.parse(fs.readFileSync("relecture-rapprochement.cle.json","utf8"));
// La feuille porte le contexte (qté, unité, montant) montré à Johan.
const csv=fs.readFileSync("relecture-rapprochement.csv","utf8").replace(/^\uFEFF/,"");
const ch=(l)=>{const o=[];let c="",q=false;for(const x of l){if(x==='"')q=!q;else if(x===";"&&!q){o.push(c);c="";}else c+=x;}o.push(c);return o;};
const ctx=new Map(csv.split("\r\n").slice(1).map(ch).map(r=>[r[0],{qte:r[2],unite:r[3],ht:r[4]}]));

const CONSIGNE=`Tu relis le rapprochement entre une LIGNE DE DEVIS d'artisan et notre catalogue de prix de référence.

Question : lequel des postes proposés décrit LA MÊME PRESTATION que la ligne de devis ?
Réponds par son numéro. Réponds 0 si AUCUN ne convient — c'est une réponse aussi utile que les autres, elle signale qu'il manque une entrée au catalogue. Réponds -1 si la ligne du devis est trop mal rédigée pour être jugée.

Ce n'est PAS une question de prix : les fourchettes ne te sont pas montrées. On veut savoir si la comparaison a un sens.

Repères :
- un tarif "pose" ou "MO" ne convient pas à une ligne qui fournit le matériel, et inversement ;
- l'unité compte : un tarif au m² ne convient pas à une ligne facturée au forfait sans surface ;
- un tarif qui décrit UN COMPOSANT ne convient pas à une ligne qui couvre TOUT UN LOT ;
- une DÉPOSE n'est pas une POSE.

Réponds uniquement en JSON : {"choix": <entier>, "raison": "<15 mots max>"}`;

// Mélange déterministe par ligne : l'ordre vu par l'IA n'est pas l'ordre du vectoriel.
const melange=(arr,graine)=>{const a=[...arr];let x=graine;const r=()=>{x=(x*1103515245+12345)%2147483648;return x/2147483648;};
  for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};

async function juger(c){
  const k=ctx.get(c.id)??{};
  const ordre=melange(c.candidats.map((x,i)=>({...x,rangVectoriel:i+1})), parseInt(c.id.slice(1))*7919);
  const contexte=[k.qte&&`${k.qte} ${k.unite}`,k.ht&&`${k.ht} € HT`].filter(Boolean).join(" · ");
  const prompt=`${CONSIGNE}\n\nLIGNE DE DEVIS : ${c.desc}\nContexte : ${contexte||"non précisé"}\n\nPOSTES PROPOSÉS :\n`+
    ordre.map((o,i)=>`${i+1}. ${o.label}`).join("\n");
  for(let essai=0;essai<3;essai++){
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent?key=${KEY}`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],
        generationConfig:{temperature:0,maxOutputTokens:8192,responseMimeType:"application/json"}})});
    if(!r.ok){ if(r.status===429||r.status>=500){await new Promise(s=>setTimeout(s,3000*(essai+1)));continue;}
      throw new Error(`${r.status} ${(await r.text()).slice(0,200)}`);}
    const j=await r.json();
    const t=j.candidates?.[0]?.content?.parts?.[0]?.text;
    if(!t){await new Promise(s=>setTimeout(s,2000));continue;}
    let p; try{p=JSON.parse(t);}catch{continue;}
    const choixPresente=Number(p.choix);
    // remise dans la numérotation vue par Johan (= rang vectoriel)
    const choix = choixPresente>=1&&choixPresente<=5 ? ordre[choixPresente-1].rangVectoriel : choixPresente;
    return {id:c.id,choix,raison:String(p.raison??"").slice(0,120),presente:choixPresente};
  }
  return {id:c.id,choix:null,raison:"échec"};
}

const F="relecture-ia.json";
const out=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,"utf8")):{};
const aFaire=cle.filter(c=>!out[c.id]);
console.log(`à juger : ${aFaire.length}/${cle.length}`);
for(let i=0;i<aFaire.length;i+=5){
  const lot=aFaire.slice(i,i+5);
  const res=await Promise.all(lot.map(juger));
  for(const r of res) out[r.id]=r;
  fs.writeFileSync(F,JSON.stringify(out,null,1),"utf8");
  process.stdout.write(`\r  ${Math.min(i+5,aFaire.length)}/${aFaire.length}`);
}
console.log(`\nterminé — ${Object.keys(out).length} jugements`);
