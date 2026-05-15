import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SEOHead from "@/components/SEOHead";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import BrandLogo from "@/components/auth/BrandLogo";
import { SESSION_ACTIVE_KEY } from "@/hooks/useSessionGuard";
import { type Brand, getBrandConfig, getConfigForBrand } from "@/lib/auth/brand";
import { performPostLoginRedirect } from "@/lib/auth/postLoginRedirect";

interface Props {
  /** Brand détecté côté serveur (Astro page → wrapper App). Si absent,
   * fallback à la détection runtime via window.location. */
  brand?: Brand;
}

const Login = ({ brand }: Props) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const config = useMemo(
    () => (brand ? getConfigForBrand(brand) : getBrandConfig()),
    [brand],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(error.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect"
          : error.message
        );
      } else {
        toast.success("Connexion réussie !");
        // Marquer la session comme active dans sessionStorage (propre à cet onglet)
        // Ce marqueur est utilisé par useSessionGuard pour détecter les nouvelles sessions
        sessionStorage.setItem(SESSION_ACTIVE_KEY, "1");
        const params = new URLSearchParams(window.location.search);
        // Le helper gère le SSO handoff cross-domaine si nécessaire.
        // On passe `data.user.email` (Supabase peut normaliser l'adresse) et
        // `data.session.access_token` requis pour appeler /api/sso/handoff.
        await performPostLoginRedirect({
          currentBrand: config.brand,
          userEmail: data?.user?.email ?? email,
          accessToken: data?.session?.access_token ?? "",
          explicitRedirect: params.get("redirect"),
        });
      }
    } catch (error) {
      toast.error("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      <SEOHead
        title={`Connexion | ${config.name}`}
        description={`Connectez-vous à votre compte ${config.name}.`}
        canonical={
          config.brand === "gmc"
            ? "https://gerermonchantier.fr/connexion"
            : "https://www.verifiermondevis.fr/connexion"
        }
      />
      {/* Left Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <a href="/" className="inline-flex mb-6">
              <BrandLogo brand={config.brand} size="md" />
            </a>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {config.loginTitle}
            </h1>
            <p className="text-muted-foreground">
              {config.loginSubtitle}
            </p>
          </div>

          <div className="mb-6">
            <GoogleSignInButton
              redirectAfter={
                new URLSearchParams(window.location.search).get("redirect") ||
                new URLSearchParams(window.location.search).get("next") ||
                // Sur gmc.fr sans redirect explicite : envoyer vers /mon-chantier.
                // Sans ça, le callback URL n'a pas de ?next= → ne matche pas le
                // pattern Supabase whitelist → redirect vers la Site URL (vmd.fr).
                (config.brand === 'gmc' ? '/mon-chantier' : undefined)
              }
            />
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">ou</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="vous@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <a
                  href="/mot-de-passe-oublie"
                  className="text-sm text-primary hover:underline"
                >
                  Mot de passe oublié ?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connexion...
                </>
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Pas encore de compte ?{" "}
            <a href="/inscription" className="text-primary font-medium hover:underline">
              Créer un compte
            </a>
          </p>
        </div>
      </div>

      {/* Right Panel - Visual */}
      <div
        className={
          config.brand === "gmc"
            ? "hidden lg:flex flex-1 items-center justify-center p-8 bg-gradient-to-br from-[#1B3FA1] to-[#0E1730]"
            : "hidden lg:flex flex-1 hero-gradient items-center justify-center p-8"
        }
      >
        <div className="max-w-md text-center text-primary-foreground">
          <div className="mb-8">
            <div className="mx-auto mb-6 inline-flex">
              <BrandLogo brand={config.brand} size="lg" dark />
            </div>
            <h2 className="text-2xl font-bold mb-4 text-white">
              {config.heroPanelTitle}
            </h2>
            <p className="text-white/80">
              {config.heroPanelText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
