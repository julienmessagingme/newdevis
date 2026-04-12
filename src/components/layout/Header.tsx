import { Button } from "@/components/ui/button";
import { Menu, X, ChevronDown, CheckCircle2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePremium } from "@/hooks/usePremium";

const ADMIN_EMAILS = ["julien@messagingme.fr", "bridey.johan@gmail.com"];

const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [mobileSubOpen, setMobileSubOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const { isPremium } = usePremium();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const userTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (userTimeoutRef.current) clearTimeout(userTimeoutRef.current);
    };
  }, []);

  const openDropdown = () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); setDropdownOpen(true); };
  const closeDropdown = () => { timeoutRef.current = setTimeout(() => setDropdownOpen(false), 150); };
  const openUserDropdown = () => { if (userTimeoutRef.current) clearTimeout(userTimeoutRef.current); setUserDropdownOpen(true); };
  const closeUserDropdown = () => { userTimeoutRef.current = setTimeout(() => setUserDropdownOpen(false), 150); };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    sessionStorage.removeItem("vmd_session_active");
    window.location.href = "/";
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        if (user.email && ADMIN_EMAILS.includes(user.email)) setIsAdmin(true);
        const firstName = (user.user_metadata?.first_name as string) || "";
        const lastName = (user.user_metadata?.last_name as string) || "";
        const name = [firstName, lastName].filter(Boolean).join(" ");
        setUserDisplayName(name || user.email?.split("@")[0] || null);
      }
    });
  }, []);

  return <header className="sticky top-0 z-50 w-full border-b bg-white border-border">
      <div className="container flex h-16 items-center justify-between">
        <a href="/" className="flex items-center gap-2 sm:gap-3">
          <img
            alt="VerifierMonDevis.fr"
            className="h-12 w-12 sm:h-16 sm:w-16 object-contain drop-shadow-md"
            src="/images/logo-detoure.webp"
            width={64}
            height={64}
          />
          <span className="text-base sm:text-2xl font-bold leading-none">
            <span className="text-foreground">VerifierMon</span><span className="text-orange-500">Devis</span><span className="text-sm sm:text-lg font-semibold text-orange-500">.fr</span>
          </span>
        </a>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {/* Dropdown "En savoir plus" */}
          <div className="relative" ref={dropdownRef} onMouseEnter={openDropdown} onMouseLeave={closeDropdown}>
            <button className="flex items-center gap-1 text-sm font-medium transition-colors text-muted-foreground hover:text-foreground">
              En savoir plus
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {dropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 rounded-lg border bg-white shadow-lg py-1 z-50">
                <a href="/blog" className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
                  Blog
                </a>
                <a href="/faq" className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
                  FAQ
                </a>
                <a href="/qui-sommes-nous" className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
                  Qui sommes-nous
                </a>
                <a href="/contact" className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
                  Contact
                </a>
              </div>
            )}
          </div>
          <a href="/valorisation-travaux-immobiliers" className="text-sm font-medium transition-colors text-muted-foreground hover:text-foreground">
            Valorisation des travaux
          </a>
          <a href="/simulateur-valorisation-travaux" className="text-sm font-medium transition-colors text-muted-foreground hover:text-foreground">
            Arbitrage travaux
          </a>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <a href={typeof window !== 'undefined' && localStorage.getItem('lastChantierId') ? `/mon-chantier/${localStorage.getItem('lastChantierId')}` : '/mon-chantier'} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors text-sm font-medium text-primary">
                <span>🏗️</span>
                Mon Chantier
              </a>
            )}
            {userDisplayName ? (
              <div className="relative" ref={userDropdownRef} onMouseEnter={openUserDropdown} onMouseLeave={closeUserDropdown}>
                <button className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5">
                  Espace {userDisplayName}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${userDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {userDropdownOpen && (
                  <div className="absolute top-full right-0 mt-1 w-48 rounded-lg border bg-white shadow-lg py-1 z-50">
                    <a href="/tableau-de-bord" className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
                      Tableau de bord
                    </a>
                    <a href="/parametres" className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
                      Paramètres
                    </a>
                    <a href="/pass-serenite" className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
                      Pass Sérénité
                      {isPremium && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                    </a>
                    {isAdmin && (
                      <a href="/admin" className="block px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors">
                        Administration
                      </a>
                    )}
                    <hr className="my-1 border-border" />
                    <button onClick={handleSignOut} className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                      Se déconnecter
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <a href="/connexion">
                <Button variant="outline">
                  Connexion
                </Button>
              </a>
            )}
            <a href="/nouvelle-analyse">
              <Button variant="default">
                Analyser un devis
              </Button>
            </a>
          </div>
        </nav>

        {/* Mobile Menu Button */}
        <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Ouvrir le menu de navigation">
          {mobileMenuOpen ? <X className="h-6 w-6 text-foreground" /> : <Menu className="h-6 w-6 text-foreground" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && <div className="md:hidden border-t shadow-lg bg-white border-border">
          <nav className="container py-4 flex flex-col gap-4">
            {/* Sous-menu "En savoir plus" */}
            <div>
              <button
                className="flex items-center gap-1 text-sm font-medium text-muted-foreground w-full"
                onClick={() => setMobileSubOpen(!mobileSubOpen)}
              >
                En savoir plus
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mobileSubOpen ? 'rotate-180' : ''}`} />
              </button>
              {mobileSubOpen && (
                <div className="flex flex-col gap-3 pl-4 mt-3">
                  <a href="/blog" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
                    Blog
                  </a>
                  <a href="/faq" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
                    FAQ
                  </a>
                  <a href="/qui-sommes-nous" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
                    Qui sommes-nous
                  </a>
                  <a href="/contact" className="text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
                    Contact
                  </a>
                </div>
              )}
            </div>
            <a href="/valorisation-travaux-immobiliers" className="text-sm font-medium text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
              Valorisation des travaux
            </a>
            <a href="/simulateur-valorisation-travaux" className="text-sm font-medium text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>
              Arbitrage travaux
            </a>
            {isAdmin && (
              <a href={typeof window !== 'undefined' && localStorage.getItem('lastChantierId') ? `/mon-chantier/${localStorage.getItem('lastChantierId')}` : '/mon-chantier'} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium">
                <span>🏗️</span>
                Mon Chantier
              </a>
            )}
            <div className="flex flex-col gap-2 pt-2">
              {userDisplayName ? (
                <>
                  <a href="/tableau-de-bord" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-muted-foreground px-2 py-1.5 hover:text-foreground transition-colors">
                    Tableau de bord
                  </a>
                  <a href="/parametres" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-muted-foreground px-2 py-1.5 hover:text-foreground transition-colors">
                    Paramètres
                  </a>
                  <a href="/pass-serenite" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-2 py-1.5 hover:text-foreground transition-colors">
                    Pass Sérénité
                    {isPremium && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                  </a>
                  {isAdmin && (
                    <a href="/admin" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-muted-foreground px-2 py-1.5 hover:text-foreground transition-colors">
                      Administration
                    </a>
                  )}
                  <button onClick={handleSignOut} className="text-sm font-medium text-red-600 px-2 py-1.5 text-left hover:text-red-700 transition-colors">
                    Se déconnecter
                  </button>
                </>
              ) : (
                <a href="/connexion" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full">
                    Connexion
                  </Button>
                </a>
              )}
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
