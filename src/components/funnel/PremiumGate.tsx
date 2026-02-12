import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Lock,
  Mail,
  Lock as LockIcon,
  User,
  Phone,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Shield,
  Clock,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";

interface PremiumGateProps {
  onAuthSuccess: () => void;
  convertToPermanent: (params: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone: string;
    acceptCommercial?: boolean;
  }) => Promise<any>;
}

const PremiumGate = ({ onAuthSuccess, convertToPermanent }: PremiumGateProps) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptCommercial, setAcceptCommercial] = useState(false);
  const [loading, setLoading] = useState(false);

  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    const limited = cleaned.slice(0, 10);
    return limited.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhoneNumber(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!acceptTerms) {
      toast.error("Veuillez accepter les conditions générales");
      return;
    }

    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      toast.error("Veuillez entrer un numéro de téléphone valide (10 chiffres)");
      return;
    }

    setLoading(true);

    try {
      await convertToPermanent({
        email,
        password,
        firstName,
        lastName,
        phone,
        acceptCommercial,
      });
      toast.success("Compte créé ! Chargement de l'analyse complète...");
      onAuthSuccess();
    } catch (error: any) {
      const msg = error?.message || "";
      if (msg.includes("already registered")) {
        toast.error("Cet email est déjà utilisé. Connectez-vous à la place.");
      } else {
        toast.error(msg || "Une erreur est survenue");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl mb-6 card-shadow overflow-hidden">
      {/* Blurred preview */}
      <div className="relative">
        <div className="p-6 blur-sm select-none pointer-events-none" aria-hidden="true">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Receipt className="h-5 w-5 text-blue-500" />
            </div>
            <h2 className="font-semibold text-foreground">Analyse Prix & Cohérence Marché</h2>
          </div>
          {/* Fake gauge */}
          <div className="h-4 rounded-full bg-gradient-to-r from-score-green via-score-orange to-score-red mb-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Prix bas</span>
            <span>Prix marché</span>
            <span>Prix élevé</span>
          </div>
        </div>

        {/* Lock overlay */}
        <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <p className="font-semibold text-foreground text-sm">Analyse verrouillée</p>
          </div>
        </div>
      </div>

      {/* Gate content */}
      <div className="p-6 border-t border-border">
        <h3 className="text-lg font-bold text-foreground mb-2 text-center">
          Débloquez l'analyse prix marché
        </h3>
        <p className="text-sm text-muted-foreground text-center mb-4">
          Créez votre compte pour comparer votre devis aux prix du marché
        </p>

        {/* Trust indicators */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5 text-score-green" />
            <span>Gratuit</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-score-green" />
            <span>2 minutes</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-score-green" />
            <span>Données préservées</span>
          </div>
        </div>

        {/* Inline registration form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gate-firstName" className="text-xs">Prénom</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="gate-firstName"
                  type="text"
                  placeholder="Jean"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="pl-9 h-9 text-sm"
                  required
                  disabled={loading}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gate-lastName" className="text-xs">Nom</Label>
              <Input
                id="gate-lastName"
                type="text"
                placeholder="Dupont"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="h-9 text-sm"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gate-email" className="text-xs">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="gate-email"
                type="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9 h-9 text-sm"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gate-phone" className="text-xs">Téléphone portable</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="gate-phone"
                type="tel"
                placeholder="06 12 34 56 78"
                value={phone}
                onChange={handlePhoneChange}
                className="pl-9 h-9 text-sm"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gate-password" className="text-xs">Mot de passe</Label>
            <div className="relative">
              <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="gate-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 h-9 text-sm"
                required
                minLength={8}
                disabled={loading}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Minimum 8 caractères</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="gate-terms"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
                disabled={loading}
              />
              <label htmlFor="gate-terms" className="text-xs text-muted-foreground cursor-pointer">
                J'accepte les{" "}
                <a href="/cgu" target="_blank" className="text-primary hover:underline">
                  conditions générales
                </a>{" "}
                et la{" "}
                <a href="/confidentialite" target="_blank" className="text-primary hover:underline">
                  politique de confidentialité
                </a>
                <span className="text-destructive">*</span>
              </label>
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="gate-commercial"
                checked={acceptCommercial}
                onChange={(e) => setAcceptCommercial(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
                disabled={loading}
              />
              <label htmlFor="gate-commercial" className="text-xs text-muted-foreground cursor-pointer">
                J'accepte de recevoir des offres commerciales (optionnel)
              </label>
            </div>
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={!acceptTerms || loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Création du compte...
              </>
            ) : (
              <>
                Débloquer l'analyse complète
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <p className="text-[10px] text-center text-muted-foreground mt-3">
          Déjà un compte ?{" "}
          <a href="/connexion" className="text-primary hover:underline">
            Se connecter
          </a>
        </p>
      </div>
    </div>
  );
};

export default PremiumGate;
