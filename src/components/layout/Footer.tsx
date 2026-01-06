import { Link } from "react-router-dom";
import { Shield } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-card border-t border-border">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo & Description */}
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <span className="text-xl font-bold text-foreground">VerifierMonDevis.fr</span>
            </Link>
            <p className="text-muted-foreground text-sm max-w-md">
              Analysez vos devis d'artisans en quelques minutes. Obtenez un score de fiabilité 
              clair et des recommandations pour éviter les mauvaises surprises.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Navigation</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/comment-ca-marche" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Comment ça marche
                </Link>
              </li>
              <li>
                <Link to="/tarifs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Tarifs
                </Link>
              </li>
              <li>
                <Link to="/inscription" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Créer un compte
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Légal</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/mentions-legales" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Mentions légales
                </Link>
              </li>
              <li>
                <Link to="/confidentialite" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Politique de confidentialité
                </Link>
              </li>
              <li>
                <Link to="/cgv" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  CGV
                </Link>
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
    </footer>
  );
};

export default Footer;
