import { Facebook, Instagram } from "lucide-react";

// Lucide n'expose pas TikTok (marque déposée) — SVG inline minimal.
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.66a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.09z" />
  </svg>
);

const Footer = () => {
  return <footer className="bg-card border-t border-border">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo & Description */}
          <div className="md:col-span-2">
            <a href="/" className="flex items-center gap-2 mb-4">
              <img alt="VerifierMonDevis.fr" className="h-12 w-12 object-contain" src="/images/logo.webp" width={48} height={48} loading="lazy" />
              <span className="text-xl font-bold text-foreground">VerifierMonDevis.fr</span>
            </a>
            <p className="text-muted-foreground text-sm max-w-md">
              Analysez vos devis d'artisans en quelques minutes. Obtenez un score de fiabilité
              clair et des recommandations pour éviter les mauvaises surprises.
            </p>
            <div className="flex items-center gap-3 mt-4">
              <a
                href="https://www.instagram.com/verifiermondevis/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram VerifierMonDevis"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Instagram className="h-5 w-5" aria-hidden="true" />
              </a>
              <a
                href="https://www.facebook.com/profile.php?id=61567601962826"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook VerifierMonDevis"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Facebook className="h-5 w-5" aria-hidden="true" />
              </a>
              <a
                href="https://www.tiktok.com/@gerermonchantier"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok GérerMonChantier"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <TikTokIcon className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Navigation</h4>
            <ul className="space-y-2">
              <li>
                <a href="/blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Blog
                </a>
              </li>
              <li>
                <a href="/#comment-ca-marche" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Comment ça marche
                </a>
              </li>
              <li>
                <a href="/nouvelle-analyse" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Analyser un devis
                </a>
              </li>
              <li>
                <a href="/faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  FAQ
                </a>
              </li>
              <li>
                <a href="/qui-sommes-nous" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Qui sommes-nous
                </a>
              </li>
              <li>
                <a href="/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Contact
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Légal</h4>
            <ul className="space-y-2">
              <li>
                <a href="/cgu" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Conditions Générales d'Utilisation
                </a>
              </li>
              <li>
                <a href="/cgv" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Conditions Générales de Vente
                </a>
              </li>
              <li>
                <a href="/mentions-legales" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Mentions légales
                </a>
              </li>
              <li>
                <a href="/confidentialite" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Politique de confidentialité
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} VerifierMonDevis.fr. Tous droits réservés.
          </p>
          <p className="text-xs text-muted-foreground">
            Service informatif - Ne constitue pas un conseil juridique
          </p>
        </div>
      </div>
    </footer>;
};
export default Footer;
