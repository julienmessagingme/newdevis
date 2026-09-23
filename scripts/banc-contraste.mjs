/**
 * BANC DE CONTRASTE — WCAG 2.1 critère 1.4.3 (niveau AA).
 *
 * Pourquoi ce banc existe : la passe de correction du 2026-09-23 a ramené
 * 256 échecs à 0 sur 19 pages. Sans moyen de le REJOUER, le compte remonte
 * à la première classe de couleur ajoutée, et personne ne le voit — c'est
 * exactement ce que ce dépôt a déjà vécu avec les 600 tests que rien ne
 * lançait (cf. CLAUDE.md, 16/09).
 *
 *   node scripts/banc-contraste.mjs                     # local (dev server)
 *   node scripts/banc-contraste.mjs --prod              # production
 *   node scripts/banc-contraste.mjs --url=/faq --url=/  # pages choisies
 *
 * Sort en `exit 1` dès qu'un échec non exempté apparaît.
 *
 * ⚠️ AUCUNE DÉPENDANCE : pilote Chrome par CDP via le WebSocket natif de
 * Node (≥ 22). Installer Puppeteer pour ça reviendrait à poser 300 Mo pour
 * trois requêtes.
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ── Chrome ───────────────────────────────────────────────────────────────────
function trouverChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidats = process.platform === "win32"
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      ]
    : process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const t = candidats.find((c) => fs.existsSync(c));
  if (!t) throw new Error("Chrome introuvable — renseigner CHROME_PATH.");
  return t;
}

/**
 * LA RÈGLE, exécutée DANS la page.
 *
 * ⚠️ Trois pièges qui ont chacun produit une mesure fausse le 23/09 :
 *  1. `color-mix()` rend `color(srgb …)` et non `rgb()` : un motif qui ne lit
 *     que `rgb()` renvoie un ratio de 1,0 sur un bloc parfaitement conforme.
 *  2. Le fond doit être RÉSOLU en remontant jusqu'à une couleur opaque. Forcer
 *     le fond d'un ancêtre sur tous ses descendants compte comme échec le
 *     texte foncé posé sur une carte blanche.
 *  3. Les emoji sont rendus par une police couleur : `color` ne s'y applique
 *     pas. Les compter donne des ratios de 1,04 qui n'existent pas.
 */
const HARNAIS = `(() => {
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (m) { const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    const m2 = c.match(/color\\(srgb\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)/);
    if (m2) return { r: +m2[1] * 255, g: +m2[2] * 255, b: +m2[3] * 255, a: 1 };
    return null;
  };
  const hex = ({ r, g, b }) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
  const mix = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });

  const NAVY = { r: 11, g: 42, b: 107, a: 1 };            // voile opaque du hero
  const hero = document.querySelector('.vmd-hero-photo') || document.querySelector('.hero-gradient');
  const EMOJI = /[\\u{1F300}-\\u{1FAFF}\\u{1F004}\\u{2700}-\\u{27BF}\\u{FE0F}]/u;

  function fond(el) {
    let n = el, acc = null;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n), col = parse(s.backgroundColor);
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        if (n === hero) return { c: NAVY };
        return { indet: true };
      }
      if (col && col.a > 0) { acc = acc ? mix(acc, col) : col; if (acc.a >= 0.999) return { c: acc }; }
      n = n.parentElement;
    }
    return { c: { r: 255, g: 255, b: 255, a: 1 } };
  }
  const classes = (el) => {
    let c = el.className; if (typeof c !== 'string') c = el.getAttribute('class') || '';
    return c.trim().split(/\\s+/).filter(x => /^(text|bg)-/.test(x)).slice(0, 4).join(' ');
  };

  const echecs = [];
  let testes = 0, emoji = 0, indetermines = 0, decoratifs = 0;
  // ⚠️ Une exemption SILENCIEUSE est un angle mort : si l'on écarte tout
  // ce qui est aria-hidden sans regarder, il suffit d'en poser un sur du vrai
  // texte pour faire disparaître un échec du compte. On mesure donc aussi ce
  // que la décoration CACHE, et on l'affiche.
  // (Pas de backtick dans ce commentaire : il vit DANS un littéral gabarit.)
  const decoratifsEnEchec = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), vus = new Set();
  let n;
  while ((n = w.nextNode())) {
    const t = (n.nodeValue || '').trim(); if (!t) continue;
    const el = n.parentElement; if (!el || vus.has(el)) continue;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    vus.add(el); testes++;
    if (EMOJI.test(t) && t.replace(EMOJI, '').trim().length === 0) { emoji++; continue; }
    const fg = parse(s.color); if (!fg) continue;
    const px = parseFloat(s.fontSize), pds = parseInt(s.fontWeight) || 400;
    const seuil = (px >= 24 || (px >= 18.66 && pds >= 700)) ? 3 : 4.5;
    const f = fond(el); if (f.indet) { indetermines++; continue; }
    const eff = mix(fg, f.c), c = ratio(eff, f.c);
    // Décoration déclarée : exception « pure decoration » de 1.4.3 — mais on
    // note ce qu'elle écarte au lieu de la passer sous silence.
    if (el.closest('[aria-hidden="true"]')) {
      decoratifs++;
      if (c < seuil) decoratifsEnEchec.push({ ex: t.slice(0, 40), ratio: +c.toFixed(2), requis: seuil });
      continue;
    }
    if (c >= seuil) continue;
    echecs.push({ texte: hex(eff), fond: hex(f.c), ratio: +c.toFixed(2), requis: seuil,
      classes: classes(el), ex: t.slice(0, 40) });
  }
  return JSON.stringify({ page: location.pathname, testes, emoji, decoratifs, decoratifsEnEchec, indetermines, echecs });
})()`;

// ── Exemptions ───────────────────────────────────────────────────────────────
/**
 * 🔴 WCAG 1.4.3 EXEMPTE EXPLICITEMENT « le texte faisant partie d'un logo ou
 * d'un nom de marque ». L'orange #F97316 du lettrage « VerifierMonDevis.fr »
 * n'est donc pas un défaut, et le foncer changerait la marque pour un critère
 * qui ne s'applique pas.
 *
 * ⚠️ L'exemption est ANCRÉE SUR LA CLASSE, pas sur la seule couleur : le même
 * orange servait aussi aux pastilles de catégorie du blog, qui ne sont PAS un
 * logo. Exempter « tout #F97316 sur blanc » aurait masqué 18 échecs réels —
 * c'est arrivé, et seule la vérification dans le DOM l'a montré.
 */
const EXEMPTIONS = [
  { motif: (e) => e.texte === "#F97316" && /text-orange-500/.test(e.classes), raison: "logotype (1.4.3, exception « logos »)" },
];

// ── CDP minimal ──────────────────────────────────────────────────────────────
async function cdp(port) {
  let cible;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const l = await r.json();
      cible = l.find((t) => t.type === "page");
      if (cible) break;
    } catch { /* le navigateur démarre encore */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!cible) throw new Error("Chrome n'a pas exposé de page dans les 10 s.");
  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = () => ko(new Error("WebSocket CDP refusé")); });
  let id = 0;
  const attente = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && attente.has(m.id)) { attente.get(m.id)(m); attente.delete(m.id); }
  };
  const envoyer = (method, params = {}) =>
    new Promise((ok) => { const n = ++id; attente.set(n, ok); ws.send(JSON.stringify({ id: n, method, params })); });
  return { envoyer, fermer: () => ws.close() };
}

// ── Programme ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const base = args.includes("--prod") ? "https://www.verifiermondevis.fr" : "http://localhost:4321";
const choisies = args.filter((a) => a.startsWith("--url=")).map((a) => a.slice(6));

/** Un représentant par GABARIT — les 33 pages métier partagent un modèle. */
const PAGES = choisies.length ? choisies : [
  "/", "/analyser-devis-travaux", "/verifier-devis-travaux", "/comparer-devis-travaux",
  "/choisir-artisan-travaux", "/prix-travaux-maison", "/devis-piscine-prix",
  "/valorisation-travaux-immobiliers", "/simulateur-valorisation-travaux",
  "/calculette-travaux", "/exemple-analyse", "/comprendre-score", "/faq",
  "/blog", "/inscription", "/pass-serenite", "/premium",
  "/observatoire", "/observatoire/chantiers/carrelage",
];

const profil = fs.mkdtempSync(path.join(os.tmpdir(), "banc-contraste-"));
const chrome = spawn(trouverChrome(), [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--remote-debugging-port=9333", `--user-data-dir=${profil}`,
  "--window-size=1280,900", "about:blank",
], { stdio: "ignore" });

let code = 0;
try {
  const { envoyer, fermer } = await cdp(9333);
  await envoyer("Page.enable");
  await envoyer("Runtime.enable");

  const parPaire = new Map();
  let totalTestes = 0, totalEchecs = 0, totalExemptes = 0, totalDeco = 0;
  const decoMasques = [];

  console.log(`┌─ Banc de contraste — ${base}\n│`);
  for (const url of PAGES) {
    await envoyer("Page.navigate", { url: base + url });
    await new Promise((r) => setTimeout(r, 1400));
    const rep = await envoyer("Runtime.evaluate", { expression: HARNAIS, returnByValue: true, awaitPromise: true });
    const brut = rep?.result?.result?.value;
    if (!brut) { console.log(`│ ⚠️  ${url} : pas de réponse`); code = 1; continue; }
    const r = JSON.parse(brut);
    totalTestes += r.testes; totalDeco += r.decoratifs;
    for (const d of r.decoratifsEnEchec) decoMasques.push({ ...d, page: url });

    const retenus = [];
    for (const e of r.echecs) {
      const ex = EXEMPTIONS.find((x) => x.motif(e));
      if (ex) { totalExemptes++; continue; }
      retenus.push(e);
      const k = `${e.texte}|${e.fond}|${e.requis}`;
      if (!parPaire.has(k)) parPaire.set(k, { ...e, n: 0, pages: new Set() });
      const p = parPaire.get(k); p.n++; p.pages.add(url);
    }
    totalEchecs += retenus.length;
    const etat = retenus.length === 0 ? "🟢" : "🔴";
    console.log(`│ ${etat} ${url.padEnd(42)} ${String(retenus.length).padStart(3)} échec(s) / ${r.testes} textes`);
  }

  console.log("│\n├─ Textes analysés          : " + totalTestes);
  console.log("├─ Exemptés (logotype)      : " + totalExemptes);
  console.log("├─ Décoration déclarée      : " + totalDeco + "  (aria-hidden), dont " + decoMasques.length + " sous le seuil");
  console.log("└─ ÉCHECS 1.4.3 (AA)        : " + totalEchecs);

  if (decoMasques.length) {
    // On les NOMME : « décoratif » doit rester une décision relue, jamais un
    // moyen commode de faire baisser le compteur.
    console.log("\nÉcartés comme décoratifs mais sous le seuil — à relire :");
    for (const d of decoMasques.slice(0, 12))
      console.log("  " + d.ratio + ":1 (requis " + d.requis + ") « " + d.ex + " » — " + d.page);
  }

  if (totalEchecs) {
    console.log("\nPaires en échec :");
    for (const p of [...parPaire.values()].sort((a, b) => b.n - a.n)) {
      console.log(`  ${String(p.n).padStart(3)}×  ${p.texte} sur ${p.fond} = ${p.ratio}:1 (requis ${p.requis})`);
      console.log(`       ${p.classes || "(style en ligne)"} — « ${p.ex} » — ${[...p.pages].join(" ")}`);
    }
    code = 1;
  }
  fermer();
} finally {
  chrome.kill();
  try { fs.rmSync(profil, { recursive: true, force: true }); } catch { /* profil temporaire */ }
}
process.exit(code);
