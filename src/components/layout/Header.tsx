import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/logo.png";
const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const isLandingPage = location.pathname === "/";
  return <header className={`sticky top-0 z-50 w-full border-b ${isLandingPage ? 'bg-primary border-primary/20' : 'bg-card border-border'}`}>
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img alt="VerifierMonDevis.fr" className="h-24 w-24 object-cover border-0 rounded-full opacity-100" src="/lovable-uploads/43051609-677c-4715-b2f7-113906ecb595.png" />
          <span className={`text-xl font-bold ${isLandingPage ? 'text-primary-foreground' : 'text-foreground'}`}>
            VerifierMonDevis.fr
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link to="/blog" className={`text-sm font-medium transition-colors hover:opacity-80 ${isLandingPage ? 'text-primary-foreground/80' : 'text-muted-foreground hover:text-foreground'}`}>
            Blog
          </Link>
          <Link to="/comprendre-score" className={`text-sm font-medium transition-colors hover:opacity-80 ${isLandingPage ? 'text-primary-foreground/80' : 'text-muted-foreground hover:text-foreground'}`}>
            Comprendre mon score
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/connexion">
              <Button variant={isLandingPage ? "ghost" : "outline"} className={isLandingPage ? 'text-primary-foreground hover:bg-primary-foreground/10' : ''}>
                Connexion
              </Button>
            </Link>
            <Link to="/inscription">
              <Button variant={isLandingPage ? "hero" : "default"}>
                Créer un compte
              </Button>
            </Link>
          </div>
        </nav>

        {/* Mobile Menu Button */}
        <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className={`h-6 w-6 ${isLandingPage ? 'text-primary-foreground' : 'text-foreground'}`} /> : <Menu className={`h-6 w-6 ${isLandingPage ? 'text-primary-foreground' : 'text-foreground'}`} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && <div className={`md:hidden border-t ${isLandingPage ? 'bg-primary border-primary/20' : 'bg-card border-border'}`}>
          <nav className="container py-4 flex flex-col gap-4">
            <Link to="/blog" className={`text-sm font-medium ${isLandingPage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`} onClick={() => setMobileMenuOpen(false)}>
              Blog
            </Link>
            <Link to="/comprendre-score" className={`text-sm font-medium ${isLandingPage ? 'text-primary-foreground/80' : 'text-muted-foreground'}`} onClick={() => setMobileMenuOpen(false)}>
              Comprendre mon score
            </Link>
            <div className="flex flex-col gap-2 pt-2">
              <Link to="/connexion" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="outline" className="w-full">
                  Connexion
                </Button>
              </Link>
              <Link to="/inscription" onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full">
                  Créer un compte
                </Button>
              </Link>
            </div>
          </nav>
        </div>}
    </header>;
};
export default Header;