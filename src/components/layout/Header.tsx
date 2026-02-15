import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";
const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isLandingPage = window.location.pathname === "/";

  return <header className={`sticky top-0 z-50 w-full border-b ${isLandingPage ? 'bg-primary border-primary/20' : 'bg-card border-border'}`}>
      <div className="container flex h-16 items-center justify-between">
        <a href="/" className="flex items-center gap-3">
          <img
            alt="VerifierMonDevis.fr"
            className="h-10 w-10 sm:h-14 sm:w-14 object-contain"
            src="/images/logo-header.png"
            width={56}
            height={56}
            loading="lazy"
          />
          <span className={`text-base sm:text-2xl font-bold ${isLandingPage ? 'text-primary-foreground' : 'text-foreground'}`}>
            VerifierMonDevis.fr
          </span>
        </a>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <a href="/blog" className={`text-sm font-medium transition-colors hover:opacity-80 ${isLandingPage ? 'text-primary-foreground/80' : 'text-muted-foreground hover:text-foreground'}`}>
            Blog
          </a>
          <a href="/comprendre-score" className={`text-sm font-medium transition-colors hover:opacity-80 ${isLandingPage ? 'text-primary-foreground/80' : 'text-muted-foreground hover:text-foreground'}`}>
            Comprendre mon score
          </a>
          <div className="flex items-center gap-3">
            <a href="/connexion">
              <Button variant={isLandingPage ? "ghost" : "outline"} className={isLandingPage ? 'text-primary-foreground hover:bg-primary-foreground/10' : ''}>
                Connexion
              </Button>
            </a>
            <a href="/nouvelle-analyse">
              <Button variant={isLandingPage ? "hero" : "default"}>
                Analyser un devis
              </Button>
            </a>
          </div>
        </nav>

        {/* Mobile Menu Button */}
        <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Ouvrir le menu de navigation">
          {mobileMenuOpen ? <X className={`h-6 w-6 ${isLandingPage ? 'text-primary-foreground' : 'text-foreground'}`} /> : <Menu className={`h-6 w-6 ${isLandingPage ? 'text-primary-foreground' : 'text-foreground'}`} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && <div className={`md:hidden border-t shadow-lg ${isLandingPage ? 'bg-primary-foreground border-primary/20' : 'bg-card border-border'}`}>
          <nav className="container py-4 flex flex-col gap-4">
            <a href="/blog" className={`text-sm font-medium ${isLandingPage ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setMobileMenuOpen(false)}>
              Blog
            </a>
            <a href="/comprendre-score" className={`text-sm font-medium ${isLandingPage ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setMobileMenuOpen(false)}>
              Comprendre mon score
            </a>
            <div className="flex flex-col gap-2 pt-2">
              <a href="/connexion" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="outline" className="w-full">
                  Connexion
                </Button>
              </a>
              <a href="/nouvelle-analyse" onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full">
                  Analyser un devis
                </Button>
              </a>
            </div>
          </nav>
        </div>}
    </header>;
};
export default Header;
