import { renderers } from './renderers.mjs';
import { c as createExports, s as serverEntrypointModule } from './chunks/_@astrojs-ssr-adapter_CXoHINGz.mjs';
import { manifest } from './manifest_Dr5LLUUf.mjs';

const serverIslandMap = new Map();;

const _page0 = () => import('./pages/_image.astro.mjs');
const _page1 = () => import('./pages/404.astro.mjs');
const _page2 = () => import('./pages/admin/blog.astro.mjs');
const _page3 = () => import('./pages/admin.astro.mjs');
const _page4 = () => import('./pages/analyse/_id_.astro.mjs');
const _page5 = () => import('./pages/api/chantier/ameliorer.astro.mjs');
const _page6 = () => import('./pages/api/chantier/conseils.astro.mjs');
const _page7 = () => import('./pages/api/chantier/generer.astro.mjs');
const _page8 = () => import('./pages/api/chantier/qualifier.astro.mjs');
const _page9 = () => import('./pages/api/chantier/sauvegarder.astro.mjs');
const _page10 = () => import('./pages/api/chantier/synthese.astro.mjs');
const _page11 = () => import('./pages/api/chantier/_id_/devis/_devisid_.astro.mjs');
const _page12 = () => import('./pages/api/chantier/_id_/devis.astro.mjs');
const _page13 = () => import('./pages/api/chantier/_id_/documents/_docid_/analyser.astro.mjs');
const _page14 = () => import('./pages/api/chantier/_id_/documents/_docid_.astro.mjs');
const _page15 = () => import('./pages/api/chantier/_id_/documents.astro.mjs');
const _page16 = () => import('./pages/api/chantier/_id_.astro.mjs');
const _page17 = () => import('./pages/api/chantier.astro.mjs');
const _page18 = () => import('./pages/api/create-checkout-session.astro.mjs');
const _page19 = () => import('./pages/api/create-portal-session.astro.mjs');
const _page20 = () => import('./pages/api/geo-communes.astro.mjs');
const _page21 = () => import('./pages/api/market-prices.astro.mjs');
const _page22 = () => import('./pages/api/newsletter.astro.mjs');
const _page23 = () => import('./pages/api/postal-lookup.astro.mjs');
const _page24 = () => import('./pages/api/premium/start-trial.astro.mjs');
const _page25 = () => import('./pages/api/premium/status.astro.mjs');
const _page26 = () => import('./pages/api/rental-prices.astro.mjs');
const _page27 = () => import('./pages/api/strategic-scores.astro.mjs');
const _page28 = () => import('./pages/api/stripe-webhook.astro.mjs');
const _page29 = () => import('./pages/api/transfer-analysis.astro.mjs');
const _page30 = () => import('./pages/api/webhook-registration.astro.mjs');
const _page31 = () => import('./pages/auth/callback.astro.mjs');
const _page32 = () => import('./pages/blog/_slug_.astro.mjs');
const _page33 = () => import('./pages/blog.astro.mjs');
const _page34 = () => import('./pages/cgu.astro.mjs');
const _page35 = () => import('./pages/comprendre-score.astro.mjs');
const _page36 = () => import('./pages/confidentialite.astro.mjs');
const _page37 = () => import('./pages/connexion.astro.mjs');
const _page38 = () => import('./pages/contact.astro.mjs');
const _page39 = () => import('./pages/faq.astro.mjs');
const _page40 = () => import('./pages/inscription.astro.mjs');
const _page41 = () => import('./pages/mentions-legales.astro.mjs');
const _page42 = () => import('./pages/mon-chantier/nouveau.astro.mjs');
const _page43 = () => import('./pages/mon-chantier/_id_.astro.mjs');
const _page44 = () => import('./pages/mon-chantier.astro.mjs');
const _page45 = () => import('./pages/mon-chantier-old.astro.mjs');
const _page46 = () => import('./pages/mot-de-passe-oublie.astro.mjs');
const _page47 = () => import('./pages/nouvelle-analyse.astro.mjs');
const _page48 = () => import('./pages/parametres.astro.mjs');
const _page49 = () => import('./pages/pass-serenite.astro.mjs');
const _page50 = () => import('./pages/premium.astro.mjs');
const _page51 = () => import('./pages/qui-sommes-nous.astro.mjs');
const _page52 = () => import('./pages/reset-password.astro.mjs');
const _page53 = () => import('./pages/simulateur-valorisation-travaux.astro.mjs');
const _page54 = () => import('./pages/sitemap-blog.xml.astro.mjs');
const _page55 = () => import('./pages/tableau-de-bord.astro.mjs');
const _page56 = () => import('./pages/valorisation-travaux-immobiliers.astro.mjs');
const _page57 = () => import('./pages/index.astro.mjs');
const pageMap = new Map([
    ["node_modules/astro/dist/assets/endpoint/generic.js", _page0],
    ["src/pages/404.astro", _page1],
    ["src/pages/admin/blog.astro", _page2],
    ["src/pages/admin/index.astro", _page3],
    ["src/pages/analyse/[id].astro", _page4],
    ["src/pages/api/chantier/ameliorer.ts", _page5],
    ["src/pages/api/chantier/conseils.ts", _page6],
    ["src/pages/api/chantier/generer.ts", _page7],
    ["src/pages/api/chantier/qualifier.ts", _page8],
    ["src/pages/api/chantier/sauvegarder.ts", _page9],
    ["src/pages/api/chantier/synthese.ts", _page10],
    ["src/pages/api/chantier/[id]/devis/[devisId].ts", _page11],
    ["src/pages/api/chantier/[id]/devis/index.ts", _page12],
    ["src/pages/api/chantier/[id]/documents/[docId]/analyser.ts", _page13],
    ["src/pages/api/chantier/[id]/documents/[docId].ts", _page14],
    ["src/pages/api/chantier/[id]/documents.ts", _page15],
    ["src/pages/api/chantier/[id].ts", _page16],
    ["src/pages/api/chantier/index.ts", _page17],
    ["src/pages/api/create-checkout-session.ts", _page18],
    ["src/pages/api/create-portal-session.ts", _page19],
    ["src/pages/api/geo-communes.ts", _page20],
    ["src/pages/api/market-prices.ts", _page21],
    ["src/pages/api/newsletter.ts", _page22],
    ["src/pages/api/postal-lookup.ts", _page23],
    ["src/pages/api/premium/start-trial.ts", _page24],
    ["src/pages/api/premium/status.ts", _page25],
    ["src/pages/api/rental-prices.ts", _page26],
    ["src/pages/api/strategic-scores.ts", _page27],
    ["src/pages/api/stripe-webhook.ts", _page28],
    ["src/pages/api/transfer-analysis.ts", _page29],
    ["src/pages/api/webhook-registration.ts", _page30],
    ["src/pages/auth/callback.astro", _page31],
    ["src/pages/blog/[slug].astro", _page32],
    ["src/pages/blog/index.astro", _page33],
    ["src/pages/cgu.astro", _page34],
    ["src/pages/comprendre-score.astro", _page35],
    ["src/pages/confidentialite.astro", _page36],
    ["src/pages/connexion.astro", _page37],
    ["src/pages/contact.astro", _page38],
    ["src/pages/faq.astro", _page39],
    ["src/pages/inscription.astro", _page40],
    ["src/pages/mentions-legales.astro", _page41],
    ["src/pages/mon-chantier/nouveau.astro", _page42],
    ["src/pages/mon-chantier/[id].astro", _page43],
    ["src/pages/mon-chantier.astro", _page44],
    ["src/pages/mon-chantier-old.astro", _page45],
    ["src/pages/mot-de-passe-oublie.astro", _page46],
    ["src/pages/nouvelle-analyse.astro", _page47],
    ["src/pages/parametres.astro", _page48],
    ["src/pages/pass-serenite.astro", _page49],
    ["src/pages/premium.astro", _page50],
    ["src/pages/qui-sommes-nous.astro", _page51],
    ["src/pages/reset-password.astro", _page52],
    ["src/pages/simulateur-valorisation-travaux.astro", _page53],
    ["src/pages/sitemap-blog.xml.ts", _page54],
    ["src/pages/tableau-de-bord.astro", _page55],
    ["src/pages/valorisation-travaux-immobiliers.astro", _page56],
    ["src/pages/index.astro", _page57]
]);

const _manifest = Object.assign(manifest, {
    pageMap,
    serverIslandMap,
    renderers,
    actions: () => import('./noop-entrypoint.mjs'),
    middleware: () => import('./_noop-middleware.mjs')
});
const _args = {
    "middlewareSecret": "d57cd0ce-0e95-404e-a32b-d0309b4fe6d8",
    "skewProtection": false
};
const _exports = createExports(_manifest, _args);
const __astrojsSsrVirtualEntry = _exports.default;
const _start = 'start';
if (Object.prototype.hasOwnProperty.call(serverEntrypointModule, _start)) ;

export { __astrojsSsrVirtualEntry as default, pageMap };
