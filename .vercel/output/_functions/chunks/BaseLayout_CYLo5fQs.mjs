import { e as createAstro, f as createComponent, r as renderTemplate, p as renderScript, q as renderSlot, v as renderHead, u as unescapeHTML, h as addAttribute } from './astro/server_B_0KBrgj.mjs';
import 'piccolore';
import 'clsx';
/* empty css                        */

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a, _b, _c;
const $$Astro = createAstro("https://www.verifiermondevis.fr");
const $$BaseLayout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$BaseLayout;
  const {
    title,
    description,
    canonical,
    ogType = "website",
    ogImage = "https://www.verifiermondevis.fr/og-image.png",
    jsonLd,
    breadcrumbs,
    noindex = false
  } = Astro2.props;
  const breadcrumbLd = breadcrumbs && breadcrumbs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbs.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url
    }))
  } : null;
  return renderTemplate(_c || (_c = __template(['<html lang="fr"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>', '</title><meta name="description"', '><meta name="author" content="VerifierMonDevis.fr"><meta name="robots"', '><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png"><link rel="icon" type="image/x-icon" href="/favicon.ico"><link rel="apple-touch-icon" sizes="192x192" href="/favicon-192.png"><link rel="preload" href="/_astro/dm-sans-latin-400-normal.CW0RaeGs.woff2" as="font" type="font/woff2" crossorigin>', '<meta property="og:title"', '><meta property="og:description"', '><meta property="og:type"', ">", '<meta property="og:image"', '><meta property="og:locale" content="fr_FR"><meta property="og:site_name" content="VerifierMonDevis.fr"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title"', '><meta name="twitter:description"', '><meta name="twitter:image"', ">", "", '<script type="application/ld+json">', `<\/script><script src="https://ai.messagingme.app/widget/f236879w135897.js" async="async"><\/script><!-- TrustBox script --><script type="text/javascript" src="//widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js" async><\/script><!-- End TrustBox script --><!-- Google Analytics 4 \u2014 Consent Mode v2 --><script async src="https://www.googletagmanager.com/gtag/js?id=G-HJFMR8ST50"><\/script><script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){window.dataLayer.push(arguments);}
      // Consent par d\xE9faut : refus\xE9 jusqu'\xE0 l'accord de l'utilisateur
      gtag('consent', 'default', {
        'analytics_storage': 'denied',
        'ad_storage': 'denied',
        'wait_for_update': 500
      });
      gtag('js', new Date());
      gtag('config', 'G-HJFMR8ST50', { 'anonymize_ip': true });
    <\/script>`, "</head> <body> ", ` <!-- Cookie consent banner --> <div id="cookie-banner" style="display:none" class="fixed bottom-0 left-0 right-0 z-[9999] p-4 sm:p-0"> <div class="max-w-2xl mx-auto sm:mb-6 bg-card border border-border rounded-xl shadow-lg p-4 sm:p-5"> <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4"> <div class="flex-1 min-w-0"> <p class="text-sm text-foreground font-medium mb-1">Cookies et confidentialit&eacute;</p> <p class="text-xs text-muted-foreground">
Ce site utilise des cookies techniques (n&eacute;cessaires au fonctionnement) et, avec votre accord, des cookies d'analyse <strong>Google Analytics</strong> pour mesurer l'audience et am&eacute;liorer nos services. Aucun cookie de tracking n'est d&eacute;pos&eacute; sans votre accord.
<a href="/confidentialite" class="text-primary hover:underline ml-1">Politique de confidentialit&eacute;</a> </p> </div> <div class="flex items-center gap-2 flex-shrink-0"> <button id="cookie-reject" class="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 text-sm font-medium">
Refuser
</button> <button id="cookie-accept" class="inline-flex items-center justify-center whitespace-nowrap rounded-md bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 text-sm font-medium">
Accepter
</button> </div> </div> </div> </div> <!-- Newsletter popup --> <div id="newsletter-popup" style="display:none" class="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/40"> <div class="bg-white border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 relative"> <button id="nl-close" class="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors p-1" aria-label="Fermer"> <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path> </svg> </button> <div class="text-center mb-4"> <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-100 mb-3"> <svg class="h-6 w-6 text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"></path> </svg> </div> <h2 class="text-lg font-bold text-foreground">Restez inform&eacute;</h2> <p class="text-sm text-muted-foreground mt-1">Recevez nos conseils pour &eacute;viter les pi&egrave;ges dans vos devis de travaux.</p> </div> <form id="nl-form" class="space-y-3"> <input id="nl-email" type="email" required placeholder="votre@email.com" class="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"> <button type="submit" id="nl-submit" class="w-full inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 text-sm font-medium transition-colors">
S'inscrire
</button> </form> <button id="nl-dismiss" class="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-3 transition-colors">
Non merci
</button> <div id="nl-success" style="display:none" class="text-center py-4"> <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3"> <svg class="h-6 w-6 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"></path> </svg> </div> <p class="text-sm font-medium text-foreground">Merci pour votre inscription !</p> </div> </div> </div> `, " ", " </body> </html>"])), title, addAttribute(description, "content"), addAttribute(noindex ? "noindex, nofollow" : "index, follow", "content"), canonical && renderTemplate`<link rel="canonical"${addAttribute(canonical, "href")}>`, addAttribute(title, "content"), addAttribute(description, "content"), addAttribute(ogType, "content"), canonical && renderTemplate`<meta property="og:url"${addAttribute(canonical, "content")}>`, addAttribute(ogImage, "content"), addAttribute(title, "content"), addAttribute(description, "content"), addAttribute(ogImage, "content"), jsonLd && renderTemplate(_a || (_a = __template(['<script type="application/ld+json">', "<\/script>"])), unescapeHTML(JSON.stringify(jsonLd))), breadcrumbLd && renderTemplate(_b || (_b = __template(['<script type="application/ld+json">', "<\/script>"])), unescapeHTML(JSON.stringify(breadcrumbLd))), unescapeHTML(JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://www.verifiermondevis.fr/#organization",
    "name": "VerifierMonDevis.fr",
    "url": "https://www.verifiermondevis.fr",
    "logo": {
      "@type": "ImageObject",
      "url": "https://www.verifiermondevis.fr/images/logo-header.png",
      "width": 128,
      "height": 128
    },
    "email": "contact@verifiermondevis.fr",
    "description": "Service gratuit d'analyse de devis d'artisans. Score de fiabilit\xE9, v\xE9rification entreprise, comparaison prix march\xE9."
  })), renderHead(), renderSlot($$result, $$slots["default"]), renderScript($$result, "C:/Users/bride/projets/newdevis/src/layouts/BaseLayout.astro?astro&type=script&index=0&lang.ts"), renderScript($$result, "C:/Users/bride/projets/newdevis/src/layouts/BaseLayout.astro?astro&type=script&index=1&lang.ts"));
}, "C:/Users/bride/projets/newdevis/src/layouts/BaseLayout.astro", void 0);

export { $$BaseLayout as $ };
