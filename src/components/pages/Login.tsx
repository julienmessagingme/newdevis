import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SEOHead from "@/components/SEOHead";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { SESSION_ACTIVE_KEY } from "@/hooks/useSessionGuard";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
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
        const redirect = params.get("redirect");
        // Security: only allow relative paths starting with / (prevent open redirect to external sites)
        const safeRedirect = redirect && redirect.startsWith("/") && !redirect.startsWith("//")
          ? redirect
          : "/tableau-de-bord";
        window.location.href = safeRedirect;
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
        title="Connexion | VerifierMonDevis.fr"
        description="Connectez-vous à votre compte VerifierMonDevis.fr pour accéder à vos analyses de devis d'artisans et suivre vos projets de travaux."
        canonical="https://www.verifiermondevis.fr/connexion"
      />
      {/* Left Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <a href="/" className="inline-flex items-center gap-2 mb-6">
              <img src="/images/logo detouré.png" alt="VerifierMonDevis.fr" className="h-12 w-12 object-contain" />
              <span className="text-xl font-bold text-foreground">VerifierMonDevis.fr</span>
            </a>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Connexion à votre compte
            </h1>
            <p className="text-muted-foreground">
              Accédez à vos analyses de devis
            </p>
          </div>

          <div className="mb-6">
            <GoogleSignInButton redirectAfter={new URLSearchParams(window.location.search).get("redirect") || undefined} />
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
      <div className="hidden lg:flex flex-1 hero-gradient items-center justify-center p-8">
        <div className="max-w-md text-center text-primary-foreground">
          <div className="mb-8">
            <img src="/images/logo detouré.png" alt="VerifierMonDevis.fr" className="h-20 w-20 object-contain mx-auto mb-6 drop-shadow-lg" />
            <h2 className="text-2xl font-bold mb-4">
              Sécurisez vos projets de travaux
            </h2>
            <p className="text-primary-foreground/80">
              Analysez vos devis d'artisans en quelques minutes et évitez les mauvaises surprises.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
