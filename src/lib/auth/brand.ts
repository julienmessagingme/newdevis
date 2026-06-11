/**
 * Détection du host pour les pages partagées entre VMD et GMC
 * (connexion, inscription, callback OAuth).
 *
 * Le projet newdevis sert deux domaines :
 * - verifiermondevis.fr        → brand "vmd" (défaut historique)
 * - (www.)gerermonchantier.fr  → brand "gmc"
 *
 * Toutes les pages d'auth sont uniques (un seul `/connexion`, un seul
 * `/inscription`) et adaptent leur rendu à `getBrand()`.
 */
export type Brand = 'vmd' | 'gmc';

const GMC_HOST_RE = /^(www\.)?gerermonchantier\.fr$/i;

export function getBrand(): Brand {
  if (typeof window === 'undefined') return 'vmd';
  return GMC_HOST_RE.test(window.location.hostname) ? 'gmc' : 'vmd';
}

export function isGmcBrand(): boolean {
  return getBrand() === 'gmc';
}

export interface BrandConfig {
  brand: Brand;
  name: string;
  loginTitle: string;
  loginSubtitle: string;
  registerTitle: string;
  registerSubtitle: string;
  heroPanelTitle: string;
  heroPanelText: string;
  /** Redirect par défaut post-login si pas de `?redirect=…` dans l'URL. */
  defaultRedirect: string;
  /** Liens internes pour les pages connexes (CGU, etc.). */
  homeUrl: string;
}

export const VMD_CONFIG: BrandConfig = {
  brand: 'vmd',
  name: 'VerifierMonDevis.fr',
  loginTitle: 'Connexion à votre compte',
  loginSubtitle: 'Accédez à vos analyses de devis',
  registerTitle: 'Créer votre compte',
  registerSubtitle: 'Analysez vos devis en quelques minutes',
  heroPanelTitle: 'Sécurisez vos projets de travaux',
  heroPanelText: "Analysez vos devis d'artisans en quelques minutes et évitez les mauvaises surprises.",
  defaultRedirect: '/tableau-de-bord',
  homeUrl: '/',
};

export const GMC_CONFIG: BrandConfig = {
  brand: 'gmc',
  name: 'GérerMonChantier',
  loginTitle: 'Connexion à votre Pilote IA',
  loginSubtitle: 'Reprenez votre chantier là où vous en étiez',
  registerTitle: 'Créer votre compte GérerMonChantier',
  registerSubtitle: 'Démarrez votre chantier piloté en 2 minutes',
  heroPanelTitle: 'Le copilote de vos chantiers',
  heroPanelText: 'Planning, artisans, devis, trésorerie : le Pilote IA orchestre tout. Vous arbitrez, il exécute.',
  defaultRedirect: '/mon-chantier',
  homeUrl: '/',
};

export function getBrandConfig(): BrandConfig {
  return getBrand() === 'gmc' ? GMC_CONFIG : VMD_CONFIG;
}

/** Server-side helper : à appeler depuis une page Astro avec le résultat de
 * `detectBrandFromHost()`. */
export function getConfigForBrand(brand: Brand): BrandConfig {
  return brand === 'gmc' ? GMC_CONFIG : VMD_CONFIG;
}

/** Détection du brand côté serveur (pages Astro). À appeler avec
 * `Astro.request.headers.get('host')`. */
export function detectBrandFromHost(host: string | null): Brand {
  if (!host) return 'vmd';
  return GMC_HOST_RE.test(host) ? 'gmc' : 'vmd';
}
