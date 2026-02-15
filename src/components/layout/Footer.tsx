const Footer = () => {
  return <footer className="bg-card border-t border-border">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo & Description */}
          <div className="md:col-span-2">
            <a href="/" className="flex items-center gap-2 mb-4">
              <img alt="VerifierMonDevis.fr" className="h-12 w-12 object-contain" src="/images/logo-footer.png" width={48} height={48} loading="lazy" />
              <span className="text-xl font-bold text-foreground">VerifierMonDevis.fr</span>
            </a>
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
