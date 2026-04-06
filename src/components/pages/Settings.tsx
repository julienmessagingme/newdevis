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
  Bot,
  ChevronDown,
  Zap,
  Globe,
  Key,
  Info,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePremium } from "@/hooks/usePremium";
import { useAgentConfig } from "@/hooks/useAgentConfig";
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

        {/* ── Agent IA ──────────────────────────────────────────────── */}
        <AgentConfigCard />
      </main>
    </div>
  );
};

// ── Agent IA Configuration Card ─────────────────────────────────────────────

function AgentConfigCard() {
  const { config, isLoading, isSaving, error, save } = useAgentConfig();
  const [mode, setMode] = useState<string>('edge_function');
  const [openclawUrl, setOpenclawUrl] = useState('');
  const [openclawToken, setOpenclawToken] = useState('');
  const [openclawAgentId, setOpenclawAgentId] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Sync local state from fetched config
  useEffect(() => {
    if (!isLoading && !initialized) {
      setMode(config.agent_mode);
      setOpenclawUrl(config.openclaw_url ?? '');
      setOpenclawAgentId(config.openclaw_agent_id ?? '');
      setInitialized(true);
    }
  }, [isLoading, config, initialized]);

  async function handleSave() {
    const updates: Record<string, unknown> = { agent_mode: mode };
    if (mode === 'openclaw') {
      updates.openclaw_url = openclawUrl;
      updates.openclaw_token = openclawToken;
      updates.openclaw_agent_id = openclawAgentId || undefined;
    }
    const ok = await save(updates as any);
    if (ok) toast.success('Configuration agent sauvegardee');
    // Error is displayed inline below the button via {error && ...}
  }

  async function handleToggle() {
    const newMode = config.agent_mode === 'disabled' ? 'edge_function' : 'disabled';
    const ok = await save({ agent_mode: newMode as any });
    if (ok) {
      setMode(newMode);
      toast.success(newMode === 'disabled' ? 'Agent desactive' : 'Agent active');
    }
  }

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Agent IA</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Agent IA — Pilote de Chantier</h2>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
          config.agent_mode === 'disabled'
            ? 'bg-gray-100 text-gray-500'
            : config.agent_mode === 'openclaw'
              ? 'bg-purple-100 text-purple-700'
              : 'bg-green-100 text-green-700'
        }`}>
          {config.agent_mode === 'disabled' ? 'Desactive' : config.agent_mode === 'openclaw' ? 'OpenClaw' : 'Actif'}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground mb-5">
        L'agent IA surveille vos messages WhatsApp et emails, detecte les impacts sur le planning et le budget, et produit un journal de chantier quotidien.
      </p>

      {/* Toggle actif/inactif */}
      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl mb-5">
        <div>
          <p className="text-sm font-medium">Activer l'agent</p>
          <p className="text-xs text-muted-foreground">Analyse automatique des messages et documents</p>
        </div>
        <button
          onClick={handleToggle}
          disabled={isSaving}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            config.agent_mode !== 'disabled' ? 'bg-primary' : 'bg-gray-300'
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            config.agent_mode !== 'disabled' ? 'translate-x-5' : ''
          }`} />
        </button>
      </div>

      {/* Mode selector (only when active) */}
      {config.agent_mode !== 'disabled' && (
        <>
          <div className="space-y-3 mb-5">
            <Label className="text-sm font-medium">Mode de fonctionnement</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Edge function */}
              <button
                type="button"
                onClick={() => setMode('edge_function')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  mode === 'edge_function' ? 'border-primary bg-primary/5' : 'border-border hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Standard</span>
                  <span className="text-[10px] font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Gratuit</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Analyse temps reel de chaque message. Digest quotidien a 19h. Nous payons les tokens.
                </p>
              </button>

              {/* OpenClaw */}
              <button
                type="button"
                onClick={() => setMode('openclaw')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  mode === 'openclaw' ? 'border-purple-500 bg-purple-50' : 'border-border hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-semibold">OpenClaw</span>
                  <span className="text-[10px] font-medium bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Avance</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Votre instance OpenClaw. Contexte vivant, multi-tour, proactif. Vous payez vos tokens.
                </p>
              </button>
            </div>
          </div>

          {/* OpenClaw fields */}
          {mode === 'openclaw' && (
            <div className="space-y-4 p-4 bg-purple-50/50 rounded-xl border border-purple-100 mb-5">
              <div className="space-y-2">
                <Label htmlFor="openclaw-url" className="text-sm">URL de votre instance</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="openclaw-url"
                    type="url"
                    placeholder="https://mon-openclaw.example.com"
                    value={openclawUrl}
                    onChange={e => setOpenclawUrl(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="openclaw-token" className="text-sm">Token d'authentification</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="openclaw-token"
                    type="password"
                    placeholder="Votre token OpenClaw"
                    value={openclawToken}
                    onChange={e => setOpenclawToken(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="openclaw-agent" className="text-sm">Agent ID <span className="text-muted-foreground">(optionnel)</span></Label>
                <Input
                  id="openclaw-agent"
                  type="text"
                  placeholder="ID de l'agent (laisser vide pour defaut)"
                  value={openclawAgentId}
                  onChange={e => setOpenclawAgentId(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Save button */}
          {mode !== config.agent_mode || (mode === 'openclaw' && (openclawUrl !== (config.openclaw_url ?? '') || openclawToken || openclawAgentId !== (config.openclaw_agent_id ?? ''))) ? (
            <Button onClick={handleSave} disabled={isSaving} className="mb-5">
              {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sauvegarde...</> : 'Sauvegarder'}
            </Button>
          ) : null}

          {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

          {/* Guide OpenClaw (accordion) */}
          {mode === 'openclaw' && (
            <div className="border border-border rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Guide de configuration OpenClaw</span>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showGuide ? 'rotate-180' : ''}`} />
              </button>

              {showGuide && (
                <div className="px-4 pb-4 space-y-3 text-sm text-muted-foreground">
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">1</span>
                    <p>Installez OpenClaw sur votre serveur ou utilisez une instance cloud.</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">2</span>
                    <p>Copiez les 5 skills depuis <code className="text-xs bg-muted px-1 py-0.5 rounded">docs/openclaw-skills/</code> dans votre workspace OpenClaw.</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">3</span>
                    <p>Activez les hooks dans <code className="text-xs bg-muted px-1 py-0.5 rounded">openclaw.json</code> avec la source <code className="text-xs bg-muted px-1 py-0.5 rounded">GererMonChantier</code>.</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">4</span>
                    <p>Renseignez l'URL et le token ci-dessus, puis sauvegardez.</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">5</span>
                    <p>Envoyez un message dans un groupe WhatsApp pour tester. L'agent reagira en temps reel.</p>
                  </div>

                  <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-100">
                    <p className="font-medium text-purple-700 text-xs mb-1">Avantages OpenClaw vs Standard :</p>
                    <ul className="text-xs space-y-1 text-purple-600">
                      <li>Contexte vivant qui s'enrichit message apres message</li>
                      <li>Multi-tour : attend la reponse d'un artisan, relance si besoin</li>
                      <li>Proactif : peut envoyer des messages WhatsApp de sa propre initiative</li>
                      <li>Memoire long terme entre les sessions</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Settings;
