import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, User, ArrowRight, Loader2, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SEOHead from "@/components/SEOHead";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import BrandLogo from "@/components/auth/BrandLogo";
import { type Brand, getBrandConfig, getConfigForBrand } from "@/lib/auth/brand";
import { trackEvent } from "@/lib/integrations/amplitude";

interface Props {
  brand?: Brand;
}

const COUNTRY_CODES = [
  { code: "+33", flag: "🇫🇷", label: "France", maxDigits: 9 },
  { code: "+32", flag: "🇧🇪", label: "Belgique", maxDigits: 9 },
  { code: "+41", flag: "🇨🇭", label: "Suisse", maxDigits: 9 },
  { code: "+352", flag: "🇱🇺", label: "Luxembourg", maxDigits: 9 },
  { code: "+377", flag: "🇲🇨", label: "Monaco", maxDigits: 8 },
  { code: "+1", flag: "🇨🇦", label: "Canada", maxDigits: 10 },
  { code: "+44", flag: "🇬🇧", label: "Royaume-Uni", maxDigits: 10 },
  { code: "+49", flag: "🇩🇪", label: "Allemagne", maxDigits: 11 },
  { code: "+34", flag: "🇪🇸", label: "Espagne", maxDigits: 9 },
  { code: "+39", flag: "🇮🇹", label: "Italie", maxDigits: 10 },
  { code: "+351", flag: "🇵🇹", label: "Portugal", maxDigits: 9 },
  { code: "+212", flag: "🇲🇦", label: "Maroc", maxDigits: 9 },
  { code: "+216", flag: "🇹🇳", label: "Tunisie", maxDigits: 8 },
  { code: "+213", flag: "🇩🇿", label: "Algérie", maxDigits: 9 },
];

const Register = ({ brand }: Props) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+33");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptCommercial, setAcceptCommercial] = useState(false);
  const [loading, setLoading] = useState(false);
  const config = useMemo(
    () => (brand ? getConfigForBrand(brand) : getBrandConfig()),
    [brand],
  );

  const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];

  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    const limited = cleaned.slice(0, selectedCountry.maxDigits + 1); // +1 for leading 0
    return limited.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!acceptTerms) {
      toast.error("Veuillez accepter les conditions générales");
      return;
    }

    // Validate phone number
    const phoneDigits = phone.replace(/\D/g, "");
    // Strip leading 0 for international format
    const phoneLocal = phoneDigits.startsWith("0") ? phoneDigits.slice(1) : phoneDigits;
    if (phoneLocal.length < 6 || phoneLocal.length > selectedCountry.maxDigits) {
      toast.error(`Veuillez entrer un numéro de téléphone valide (${selectedCountry.label})`);
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            phone: countryCode + phoneLocal,
            accept_commercial_offers: acceptCommercial,
          },
        },
      });

      if (error) {
        if (error.message.includes("already registered")) {
          toast.error("Cet email est déjà utilisé");
        } else {
          toast.error(error.message);
        }
      } else {
        // Send webhook via server-side API route (await to ensure it fires before redirect)
        const phoneFormatted = countryCode + phoneLocal;
        const signupSource = config.brand === "gmc" ? "gerermonchantier" : "verifiermondevis";
        try {
          await fetch("/api/webhook-registration", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              phone: phoneFormatted,
              first_name: firstName,
              last_name: lastName,
              accept_commercial: acceptCommercial,
              signup_source: signupSource,
            }),
          });
        } catch {
          // Non-blocking: don't prevent redirect if webhook fails
        }

        // V3.4.3 — tracking event critique pour mesurer la conversion top of funnel.
        // Comparé à `redirect_to_inscription` dans GA4/Amplitude, on obtient le ratio
        // visiteurs redirigés → inscriptions effectives → taux de drop précis.
        const params = new URLSearchParams(window.location.search);
        const returnTo = params.get("returnTo");
        trackEvent('account_created', {
          signup_source: signupSource,
          accept_commercial: acceptCommercial,
          return_to: returnTo || '/tableau-de-bord',
        });

        toast.success("Compte créé avec succès !");
        window.location.href = returnTo || "/tableau-de-bord";
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
        title={`Créer un compte | ${config.name}`}
        description={`Inscrivez-vous gratuitement sur ${config.name}.`}
        canonical={
          config.brand === "gmc"
            ? "https://gerermonchantier.fr/inscription"
            : "https://www.verifiermondevis.fr/inscription"
        }
      />
      {/* Left Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <a href="/" className="inline-flex mb-6">
              <BrandLogo brand={config.brand} size="md" />
            </a>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {config.registerTitle}
            </h1>
            <p className="text-muted-foreground">
              {config.registerSubtitle}
            </p>
          </div>

          {/* V2026-05-11 — Contexte returnTo + bénéfices visibles (mobile + desktop) */}
          {(() => {
            const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
            const returnTo = params?.get("returnTo");
            const isFromAnalysis = returnTo === "/nouvelle-analyse";
            return (
              <div className="mb-6 rounded-xl border border-primary/15 bg-primary/[0.04] p-4">
                {isFromAnalysis && (
                  <p className="text-sm font-semibold text-foreground mb-2">
                    ⚡ Création de compte requise pour lancer votre analyse
                  </p>
                )}
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-score-green flex-shrink-0 mt-0.5" aria-hidden="true">✓</span>
                    <span>Analyse de devis gratuite, sans CB</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-score-green flex-shrink-0 mt-0.5" aria-hidden="true">✓</span>
                    <span>Vérification SIRET, assurances, prix marché</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-score-green flex-shrink-0 mt-0.5" aria-hidden="true">✓</span>
                    <span>Vos analyses sauvegardées dans votre tableau de bord</span>
                  </li>
                </ul>
                <div className="mt-3 pt-3 border-t border-primary/10 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="text-amber-500" aria-hidden="true">★★★★★</span>
                  <span><strong className="text-foreground">4,7/5</strong> · +2 000 devis analysés</span>
                </div>
              </div>
            );
          })()}

          <div className="mb-6">
            <GoogleSignInButton />
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Prénom</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="Jean"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="pl-10"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nom</Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Dupont"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>

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
              <Label htmlFor="phone" className="flex items-center gap-1.5">
                Téléphone portable
                <span className="text-xs font-normal text-muted-foreground">— pour vous prévenir si une vérification urgente est nécessaire</span>
              </Label>
              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => { setCountryCode(e.target.value); setPhone(""); }}
                  className="h-10 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-w-[100px]"
                  disabled={loading}
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
                <div className="relative flex-1 min-w-0">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder={countryCode === "+33" ? "06 12 34 56 78" : "612 345 678"}
                    value={phone}
                    onChange={handlePhoneChange}
                    className="pl-10"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
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
                  minLength={8}
                  disabled={loading}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Minimum 8 caractères
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="terms"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-primary"
                  disabled={loading}
                />
                <label htmlFor="terms" className="text-sm text-muted-foreground font-normal cursor-pointer">
                  J'accepte les{" "}
                  <a href="/cgu" className="text-primary hover:underline">
                    conditions générales
                  </a>{" "}
                  et la{" "}
                  <a href="/confidentialite" className="text-primary hover:underline">
                    politique de confidentialité
                  </a>
                  <span className="text-destructive">*</span>
                </label>
              </div>

              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="commercial"
                  checked={acceptCommercial}
                  onChange={(e) => setAcceptCommercial(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-primary"
                  disabled={loading}
                />
                <label htmlFor="commercial" className="text-sm text-muted-foreground font-normal cursor-pointer">
                  J'accepte de recevoir des offres commerciales de nos partenaires sélectionnés (optionnel)
                </label>
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={!acceptTerms || loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  Créer mon compte gratuit
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              <span aria-hidden="true">🔒 </span>
              Données chiffrées · Aucune carte bancaire requise · RGPD
            </p>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Déjà un compte ?{" "}
            <a href="/connexion" className="text-primary font-medium hover:underline">
              Se connecter
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

export default Register;
