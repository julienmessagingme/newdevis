import { e as createAstro, f as createComponent, m as maybeRenderHead, p as renderScript, r as renderTemplate } from './astro/server_B_0KBrgj.mjs';
import 'piccolore';
import 'clsx';

const $$Astro = createAstro("https://www.verifiermondevis.fr");
const $$Header = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Header;
  Astro2.url.pathname;
  return renderTemplate`${maybeRenderHead()}<header class="sticky top-0 z-50 w-full border-b bg-white border-border"> <div class="container flex h-16 items-center justify-between"> <a href="/" class="flex items-center gap-2 sm:gap-3"> <img alt="VerifierMonDevis.fr" class="h-12 w-12 sm:h-16 sm:w-16 object-contain drop-shadow-md" src="/images/logo detouré.png" width="64" height="64"> <span class="text-base sm:text-2xl font-bold leading-none"> <span class="text-foreground">VerifierMon</span><span class="text-orange-500">Devis</span><span class="text-sm sm:text-lg font-semibold text-orange-500">.fr</span> </span> </a> <!-- Desktop Navigation --> <nav class="hidden md:flex items-center gap-6"> <!-- Dropdown "En savoir plus" --> <div class="relative" id="desktop-dropdown"> <button class="flex items-center gap-1 text-sm font-medium transition-colors text-muted-foreground hover:text-foreground" id="dropdown-trigger">
En savoir plus
<svg class="h-3.5 w-3.5 transition-transform" id="dropdown-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"></path> </svg> </button> <div class="absolute top-full left-0 mt-1 w-48 rounded-lg border bg-white shadow-lg py-1 z-50 hidden" id="dropdown-menu"> <a href="/blog" class="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
Blog
</a> <a href="/faq" class="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
FAQ
</a> <a href="/qui-sommes-nous" class="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
Qui sommes-nous
</a> <a href="/contact" class="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
Contact
</a> </div> </div> <a href="/valorisation-travaux-immobiliers" class="text-sm font-medium transition-colors text-muted-foreground hover:text-foreground">
Valorisation des travaux
</a> <a href="/simulateur-valorisation-travaux" class="text-sm font-medium transition-colors text-muted-foreground hover:text-foreground">
Arbitrage travaux
</a> <div class="flex items-center gap-3"> <a id="mon-chantier-desktop" href="/mon-chantier" class="hidden items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors text-sm font-medium text-primary"> <span>🏗️</span>
Mon Chantier
<span class="text-[10px] font-bold bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded-full leading-none">NOUVEAU</span> </a> <!-- Connexion (visiteur) ou Espace NOM (connecté) --> <a id="login-btn-desktop" href="/connexion"> <button class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
Connexion
</button> </a> <div id="user-dropdown-desktop" class="relative hidden"> <button id="user-dropdown-trigger" class="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5"> <span id="user-name-desktop"></span> <svg class="h-3.5 w-3.5 transition-transform" id="user-dropdown-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"></path> </svg> </button> <div class="absolute top-full right-0 mt-1 w-48 rounded-lg border bg-white shadow-lg py-1 z-50 hidden" id="user-dropdown-menu"> <a href="/tableau-de-bord" class="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
Tableau de bord
</a> <a href="/parametres" class="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
Paramètres
</a> <a id="pass-serenite-desktop" href="/pass-serenite" class="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
Pass Sérénité
<svg id="premium-check-desktop" class="h-3.5 w-3.5 text-green-500 hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path> </svg> </a> <a id="admin-link-desktop" href="/admin" class="hidden px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
Administration
</a> <hr class="my-1 border-border"> <button id="signout-btn-desktop" class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
Se déconnecter
</button> </div> </div> <a href="/nouvelle-analyse"> <button class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
Analyser un devis
</button> </a> </div> </nav> <!-- Mobile Menu Button --> <button class="md:hidden p-3" id="mobile-menu-toggle" aria-label="Ouvrir le menu de navigation"> <svg class="h-6 w-6 text-foreground" id="menu-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"></path> </svg> <svg class="h-6 w-6 hidden text-foreground" id="close-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path> </svg> </button> </div> <!-- Mobile Menu --> <div class="md:hidden border-t hidden shadow-lg bg-white border-border" id="mobile-menu"> <nav class="container py-4 flex flex-col gap-4"> <!-- Sous-menu "En savoir plus" --> <div> <button class="flex items-center gap-1 text-sm font-medium text-muted-foreground w-full" id="mobile-sub-toggle">
En savoir plus
<svg class="h-3.5 w-3.5 transition-transform" id="mobile-sub-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"></path> </svg> </button> <div class="flex flex-col gap-3 pl-4 mt-3 hidden" id="mobile-sub-menu"> <a href="/blog" class="text-sm text-muted-foreground">Blog</a> <a href="/faq" class="text-sm text-muted-foreground">FAQ</a> <a href="/qui-sommes-nous" class="text-sm text-muted-foreground">Qui sommes-nous</a> <a href="/contact" class="text-sm text-muted-foreground">Contact</a> </div> </div> <a href="/valorisation-travaux-immobiliers" class="text-sm font-medium text-muted-foreground">
Valorisation des travaux
</a> <a href="/simulateur-valorisation-travaux" class="text-sm font-medium text-muted-foreground">
Arbitrage travaux
</a> <a id="mon-chantier-mobile" href="/mon-chantier" class="hidden items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium"> <span>🏗️</span>
Mon Chantier
<span class="text-[10px] font-bold bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded-full leading-none ml-auto">NOUVEAU</span> </a> <div class="flex flex-col gap-2 pt-2"> <!-- Connexion (visiteur) ou Espace NOM (connecté) — mobile --> <a id="login-btn-mobile" href="/connexion"> <button class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 w-full">
Connexion
</button> </a> <div id="user-menu-mobile" class="hidden flex-col gap-2"> <a href="/tableau-de-bord" class="text-sm font-medium text-muted-foreground px-2 py-1.5 hover:text-foreground transition-colors">
Tableau de bord
</a> <a href="/parametres" class="text-sm font-medium text-muted-foreground px-2 py-1.5 hover:text-foreground transition-colors">
Paramètres
</a> <a id="pass-serenite-mobile" href="/pass-serenite" class="flex items-center gap-2 text-sm font-medium text-muted-foreground px-2 py-1.5 hover:text-foreground transition-colors">
Pass Sérénité
<svg id="premium-check-mobile" class="h-3.5 w-3.5 text-green-500 hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path> </svg> </a> <a id="admin-link-mobile" href="/admin" class="hidden text-sm font-medium text-muted-foreground px-2 py-1.5 hover:text-foreground transition-colors">
Administration
</a> <button id="signout-btn-mobile" class="text-sm font-medium text-red-600 px-2 py-1.5 text-left hover:text-red-700 transition-colors">
Se déconnecter
</button> </div> <a href="/nouvelle-analyse"> <button class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full">
Analyser un devis
</button> </a> </div> </nav> </div> </header> ${renderScript($$result, "C:/Users/bride/projets/newdevis/src/components/astro/Header.astro?astro&type=script&index=0&lang.ts")}`;
}, "C:/Users/bride/projets/newdevis/src/components/astro/Header.astro", void 0);

const $$Footer = createComponent(($$result, $$props, $$slots) => {
  const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
  return renderTemplate`${maybeRenderHead()}<footer class="bg-card border-t border-border"> <div class="container py-12"> <div class="grid grid-cols-1 md:grid-cols-4 gap-8"> <!-- Logo & Description --> <div class="md:col-span-2"> <a href="/" class="flex items-center gap-2 mb-4"> <img alt="VerifierMonDevis.fr" class="h-12 w-12 object-contain" src="/images/logo-footer.png" width="48" height="48" loading="lazy"> <span class="text-xl font-bold text-foreground">VerifierMonDevis.fr</span> </a> <p class="text-muted-foreground text-sm max-w-md">
Analysez vos devis d'artisans en quelques minutes. Obtenez un score de fiabilité
          clair et des recommandations pour éviter les mauvaises surprises.
</p> </div> <!-- Links --> <div> <h4 class="font-semibold text-foreground mb-4">Navigation</h4> <ul class="space-y-2"> <li> <a href="/blog" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
Blog
</a> </li> <li> <a href="/#comment-ca-marche" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
Comment ça marche
</a> </li> <li> <a href="/nouvelle-analyse" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
Analyser un devis
</a> </li> <li> <a href="/faq" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
FAQ
</a> </li> <li> <a href="/qui-sommes-nous" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
Qui sommes-nous
</a> </li> <li> <a href="/contact" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
Contact
</a> </li> <li> <a href="/valorisation-travaux-immobiliers" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
Valorisation des travaux
</a> </li> </ul> </div> <!-- Legal --> <div> <h4 class="font-semibold text-foreground mb-4">Légal</h4> <ul class="space-y-2"> <li> <a href="/cgu" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
Conditions Générales d'Utilisation
</a> </li> <li> <a href="/mentions-legales" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
Mentions légales
</a> </li> <li> <a href="/confidentialite" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
Politique de confidentialité
</a> </li> </ul> </div> </div> <div class="border-t border-border mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4"> <p class="text-sm text-muted-foreground">
&copy; ${currentYear} VerifierMonDevis.fr. Tous droits réservés.
</p> <p class="text-xs text-muted-foreground">
Service informatif - Ne constitue pas un conseil juridique
</p> </div> </div> </footer>`;
}, "C:/Users/bride/projets/newdevis/src/components/astro/Footer.astro", void 0);

export { $$Header as $, $$Footer as a };
