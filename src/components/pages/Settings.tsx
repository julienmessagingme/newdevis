import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Shield,
  ArrowLeft,
  User,
  Phone,
  Mail,
  Lock,
  Loader2,
  MessageCircle,
  BellRing,
  CreditCard,
  CheckCircle2,
  ExternalLink,
  Crown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePremium } from "@/hooks/usePremium";
import type { User as SupabaseUser } from "@supabase/supabase-js";

const formatPhoneNumber = (value: string) => {
  const cleaned = value.replace(/\D/g, "");
  const limited = cleaned.slice(0, 10);
  return limited.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
};

const Settings = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Consent preferences
  const [consentWhatsapp, setConsentWhatsapp] = useState(false);
  const [consentEmail, setConsentEmail] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);

  // Premium
  const { isPremium, currentPeriodEnd, lifetimeAnalysisCount, isLoading: premiumLoading } = usePremium();
  const [openingPortal, setOpeningPortal] = useState(false);

  // Password form
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/connexion";
        return;
      }
      setUser(user);

      const meta = user.user_metadata;
      setFirstName(meta?.first_name || "");
      setLastName(meta?.last_name || "");
      setPhone(meta?.phone ? formatPhoneNumber(meta.phone) : "");

      // Consent defaults: if user gave phone at registration, default to true
      const hasPhone = !!meta?.phone;
      setConsentWhatsapp(meta?.consent_whatsapp ?? hasPhone);
      setConsentEmail(meta?.consent_email ?? hasPhone);

      setLoading(false);
    };

    checkAuth();
  }, []);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhoneNumber(e.target.value));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      toast.error(
        "Veuillez entrer un numéro de téléphone valide (10 chiffres)"
      );
      return;
    }

    setSavingProfile(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          first_name: firstName,
          last_name: lastName,
          phone: phoneDigits,
        },
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Informations mises à jour avec succès");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveConsent = async () => {
    setSavingConsent(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          consent_whatsapp: consentWhatsapp,
          consent_email: consentEmail,
        },
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Préférences de communication mises à jour");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setSavingConsent(false);
    }
  };

  const handleOpenPortal = async () => {
    if (!user) return;
    setOpeningPortal(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/create-portal-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erreur lors de l'accès au portail");
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setOpeningPortal(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast.error("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Mot de passe modifié avec succès");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <span className="text-base sm:text-xl font-bold text-foreground">
              VerifierMonDevis.fr
            </span>
          </a>

          <a href="/tableau-de-bord">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour au tableau de bord
            </Button>
          </a>
        </div>
      </header>

      <main className="container py-8 max-w-2xl">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-8">
          Paramètres du compte
        </h1>

        {/* Profile Card */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Informations personnelles
          </h2>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    disabled={savingProfile}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nom</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Dupont"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="pl-10"
                    required
                    disabled={savingProfile}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={user?.email || ""}
                  className="pl-10"
                  disabled
                />
              </div>
              <p className="text-xs text-muted-foreground">
                L'email ne peut pas être modifié
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone portable</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="06 12 34 56 78"
                  value={phone}
                  onChange={handlePhoneChange}
                  className="pl-10"
                  required
                  disabled={savingProfile}
                />
              </div>
            </div>

            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Enregistrement...
                </>
              ) : (
                "Enregistrer les modifications"
              )}
            </Button>
          </form>
        </div>

        {/* Consent Card */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <BellRing className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Communications
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            Autorisez VerifierMonDevis.fr à vous informer sur vos analyses, le suivi de vos devis et nos conseils personnalisés.
          </p>

          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={consentWhatsapp}
                onChange={(e) => setConsentWhatsapp(e.target.checked)}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-sm font-medium text-foreground">WhatsApp</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Notifications sur vos analyses, rappels et conseils via WhatsApp
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={consentEmail}
                onChange={(e) => setConsentEmail(e.target.checked)}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-sm font-medium text-foreground">Email</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Résultats d'analyses, suivi post-signature et conseils par email
                </p>
              </div>
            </label>
          </div>

          <p className="text-xs text-muted-foreground mt-4 italic">
            Ces communications concernent uniquement le service VerifierMonDevis.fr, pas des offres commerciales de tiers. Vous pouvez modifier ces préférences à tout moment.
          </p>

          <Button
            onClick={handleSaveConsent}
            disabled={savingConsent}
            className="mt-4"
          >
            {savingConsent ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Enregistrement...
              </>
            ) : (
              "Enregistrer les préférences"
            )}
          </Button>
        </div>

        {/* Subscription Card */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Abonnement & Facturation
            </h2>
          </div>

          {premiumLoading ? (
            <div className="flex items-center gap-2 mt-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Chargement...</span>
            </div>
          ) : isPremium ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-sm font-medium border border-green-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Pass Sérénité actif
                </span>
              </div>

              {currentPeriodEnd && (
                <p className="text-sm text-muted-foreground">
                  Prochain renouvellement le{" "}
                  <span className="font-medium text-foreground">
                    {new Date(currentPeriodEnd).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </p>
              )}

              <div>
                <Button
                  onClick={handleOpenPortal}
                  disabled={openingPortal}
                  variant="outline"
                >
                  {openingPortal ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Redirection...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Gérer mon abonnement
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Factures, moyen de paiement, annulation
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-sm font-medium border border-slate-200">
                  Version gratuite
                </span>
              </div>

              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {lifetimeAnalysisCount}/5
                </span>{" "}
                analyses utilisées
              </p>

              <a href="/pass-serenite">
                <Button variant="outline">
                  <Crown className="h-4 w-4 mr-2 text-orange-500" />
                  Découvrir le Pass Sérénité →
                </Button>
              </a>
            </div>
          )}
        </div>

        {/* Password Card */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Modifier le mot de passe
          </h2>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nouveau mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10"
                  required
                  minLength={8}
                  disabled={savingPassword}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Minimum 8 caractères
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                Confirmer le mot de passe
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  required
                  minLength={8}
                  disabled={savingPassword}
                />
              </div>
            </div>

            <Button type="submit" disabled={savingPassword}>
              {savingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Modification...
                </>
              ) : (
                "Modifier le mot de passe"
              )}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Settings;
