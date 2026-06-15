import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getGmcStatus, type GmcSubInfoExt } from '@/lib/integrations/gmc-subscription';
import { toast } from 'sonner';
import { Check, ArrowRight, Loader2, Shield, Lock } from 'lucide-react';

type Billing = 'month' | 'year';
type PlanKey = 'essentiel' | 'multi';

const PLANS: {
  key: PlanKey; name: string; priceM: number; priceY: number; tagY: string;
  features: string[]; highlight: boolean;
}[] = [
  {
    key: 'essentiel', name: 'Essentiel', priceM: 12, priceY: 120, tagY: '2 mois offerts',
    features: ['1 chantier', 'Cockpit complet', 'Pilote IA : 40+ fonctions', 'Messagerie WhatsApp + email', 'Documents illimités'],
    highlight: false,
  },
  {
    key: 'multi', name: 'Multi-chantiers', priceM: 25, priceY: 210, tagY: '-30 % vs mensuel',
    features: ['Tout Essentiel', 'Chantiers illimités', 'Synthèse multi-chantiers', 'Planning détaillé', 'Journal IA quotidien', 'Support prioritaire'],
    highlight: true,
  },
];

function param(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export default function GmcAbonnement() {
  const [billing, setBilling] = useState<Billing>(param('interval') === 'year' ? 'year' : 'month');
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [status, setStatus] = useState<GmcSubInfoExt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<PlanKey | 'portal' | 'upgrade' | null>(null);

  const offer = param('offer') === '1' || param('offer') === 'true';
  // Arrivee via le gate "2e chantier" (essai/Essentiel limites a 1 chantier).
  const gated = param('reason') === 'multi';

  useEffect(() => {
    if (param('abonnement') === 'success') toast.success('Abonnement activé, bienvenue et merci !');
    if (param('canceled') === 'true') toast.info('Paiement annulé. Vous pouvez réessayer quand vous voulez.');
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setUser({ id: user.id });
        try { setStatus(await getGmcStatus(user.id)); } catch { /* ignore */ }
      }
      setLoading(false);
    });
  }, []);

  const subscribe = async (plan: PlanKey) => {
    if (!user) {
      const back = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/inscription?returnTo=${back}`;
      return;
    }
    setBusy(plan);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/gmc/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ plan, interval: billing, offer: offer && billing === 'month' }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      toast.error(data.error || 'Erreur lors de la redirection vers le paiement');
      setBusy(null);
    } catch {
      toast.error('Une erreur est survenue');
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy('portal');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/gmc/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      toast.error(data.error || "Impossible d'ouvrir le portail");
      setBusy(null);
    } catch {
      toast.error('Une erreur est survenue');
      setBusy(null);
    }
  };

  // Upgrade en place Essentiel -> Multi (abonne payant existant). Pas de checkout : on
  // modifie l'abonnement Stripe cote serveur, puis on rafraichit le statut.
  const upgradeToMulti = async () => {
    if (!user) return;
    setBusy('upgrade');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/gmc/change-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ plan: 'multi' }),
      });
      const data = await res.json();
      if (res.ok && (data.ok || data.already)) {
        toast.success('Vous êtes passé en Multi-chantiers. Vous pouvez gérer plusieurs chantiers dès maintenant.');
        if (gated) { window.location.href = '/mon-chantier/nouveau'; return; }
        try { setStatus(await getGmcStatus(user.id)); } catch { /* ignore */ }
        setBusy(null);
        return;
      }
      toast.error(data.error || 'Le changement de formule a échoué');
      setBusy(null);
    } catch {
      toast.error('Une erreur est survenue');
      setBusy(null);
    }
  };

  const isPaid = status?.isPaid ?? false;
  const isEssentielPaid = isPaid && status?.plan === 'gmc_essentiel';

  return (
    <section className="py-12 sm:py-16 px-6">
      <div className="max-w-[1100px] mx-auto">
        {/* En-tete */}
        <div className="text-center max-w-2xl mx-auto mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1B3FA1]/10 text-[#1B3FA1] text-xs font-bold mb-4">
            <Shield className="h-3.5 w-3.5" /> Abonnement GérerMonChantier
          </div>
          <h1 className="font-bold text-[#0E1730] text-3xl sm:text-4xl leading-tight tracking-tight">
            Continuez à piloter votre chantier
          </h1>
          <p className="mt-3 text-gray-600 text-base">
            {status?.isTrial && status.trialDaysLeft != null
              ? `Votre essai gratuit se termine dans ${status.trialDaysLeft} jour${status.trialDaysLeft > 1 ? 's' : ''}.`
              : 'Choisissez votre formule. Sans engagement, résiliable à tout moment.'}
          </p>
        </div>

        {/* Limite 1 chantier atteinte (arrivee via le gate 2e chantier) */}
        {gated && (
          <div className="max-w-2xl mx-auto mb-8 rounded-xl border border-[#F58A06]/40 bg-[#F58A06]/10 px-5 py-4 flex items-start gap-3">
            <Lock className="h-5 w-5 text-[#F58A06] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold text-[#0E1730]">Un seul chantier avec votre offre actuelle</p>
              <p className="text-sm text-gray-600 mt-0.5">
                L'essai gratuit et l'offre Essentiel couvrent <strong>1 chantier</strong>. Pour gérer plusieurs chantiers (en illimité), passez à <strong>Multi</strong>
                {isEssentielPaid ? ' en cliquant sur « Passer en Multi » ci-dessous.' : ' ci-dessous.'}
              </p>
            </div>
          </div>
        )}

        {/* Bandeau offre -50% */}
        {offer && !isPaid && (
          <div className="max-w-md mx-auto mb-8 text-center bg-[#F58A06]/10 border border-[#F58A06]/30 rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-[#0E1730]">Offre de bienvenue : −50 % sur votre 1er mois</p>
            <p className="text-xs text-gray-600 mt-0.5">Soit 6 € le premier mois sur l'Essentiel mensuel.</p>
          </div>
        )}

        {/* Deja abonne */}
        {isPaid && (
          <div className="max-w-md mx-auto mb-8 text-center bg-[#1FB664]/10 border border-[#1FB664]/30 rounded-xl px-4 py-4">
            <p className="text-sm font-bold text-[#0E1730]">
              Vous êtes abonné{status?.plan === 'gmc_multi' ? ' (Multi-chantiers)' : ' (Essentiel)'}.
            </p>
            {isEssentielPaid && (
              <button
                onClick={upgradeToMulti}
                disabled={busy === 'upgrade'}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-white bg-[#1B3FA1] hover:bg-[#16348A] rounded-lg px-4 h-9 no-underline transition-colors disabled:opacity-60"
              >
                {busy === 'upgrade'
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Passage en cours…</>
                  : <>Passer en Multi-chantiers <ArrowRight className="h-4 w-4" /></>}
              </button>
            )}
            {/* Portail Stripe : jamais pour un compte offert (pas de client Stripe). */}
            {status?.hasStripeCustomer && (
              <button
                onClick={openPortal}
                disabled={busy === 'portal'}
                className="mt-2 ml-1 inline-flex items-center gap-1.5 text-sm font-bold text-[#1B3FA1] hover:underline disabled:opacity-60"
              >
                {busy === 'portal' ? 'Ouverture…' : 'Gérer mon abonnement'}
              </button>
            )}
          </div>
        )}

        {/* Toggle mensuel / annuel */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center bg-white border border-gray-200 rounded-full p-1 shadow-sm">
            {(['month', 'year'] as Billing[]).map((iv) => (
              <button
                key={iv}
                type="button"
                onClick={() => setBilling(iv)}
                className={`px-5 h-9 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${
                  billing === iv ? 'bg-[#0E1730] text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {iv === 'month' ? 'Mensuel' : 'Annuel'}
                {iv === 'year' && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    billing === 'year' ? 'bg-[#F58A06] text-white' : 'bg-[#F58A06]/15 text-[#F58A06]'
                  }`}>−30 %</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Cartes */}
        <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          {PLANS.map((pl) => {
            const price = billing === 'year' ? pl.priceY : pl.priceM;
            const planDbKey = pl.key === 'multi' ? 'gmc_multi' : 'gmc_essentiel';
            const isCurrent = isPaid && status?.plan === planDbKey;
            const canUpgradeHere = isEssentielPaid && pl.key === 'multi';
            return (
              <div
                key={pl.key}
                className={`relative rounded-2xl p-7 border transition-all ${
                  pl.highlight ? 'bg-[#0E1730] border-[#1B3FA1] text-white shadow-2xl' : 'bg-white border-gray-100 hover:shadow-lg'
                }`}
              >
                {pl.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#F58A06] text-white text-[10px] font-bold px-3 py-1 rounded-full">
                    RECOMMANDÉ
                  </span>
                )}
                <p className={`text-xs font-bold uppercase tracking-wider ${pl.highlight ? 'text-[#F58A06]' : 'text-[#1B3FA1]'}`}>
                  {pl.name}
                </p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className={`font-bold text-5xl tabular-nums ${pl.highlight ? 'text-white' : 'text-[#0E1730]'}`}>{price}</span>
                  <span className="text-2xl">€</span>
                  <span className={`text-sm ml-1 ${pl.highlight ? 'text-white/60' : 'text-gray-500'}`}>/{billing === 'year' ? 'an' : 'mois'}</span>
                </div>
                {billing === 'year' && (
                  <p className={`mt-1.5 inline-block text-[10px] font-bold px-2 py-0.5 rounded ${
                    pl.highlight ? 'bg-[#F58A06]/25 text-[#F58A06]' : 'bg-[#1FB664]/15 text-[#1FB664]'
                  }`}>✓ {pl.tagY}</p>
                )}
                {offer && billing === 'month' && pl.key === 'essentiel' && (
                  <p className="mt-1.5 text-xs font-bold text-[#F58A06]">6 € le 1er mois, puis 12 €/mois</p>
                )}
                <ul className={`mt-5 space-y-2 text-sm ${pl.highlight ? 'text-white/85' : 'text-gray-700'}`}>
                  {pl.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="h-4 w-4 shrink-0 mt-0.5 text-[#1FB664]" strokeWidth={3} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={canUpgradeHere ? upgradeToMulti : () => subscribe(pl.key)}
                  disabled={canUpgradeHere ? busy === 'upgrade' : (busy === pl.key || isPaid)}
                  className={`mt-6 inline-flex items-center justify-center w-full gap-1.5 text-sm font-bold px-5 h-11 rounded-xl transition-colors disabled:opacity-60 ${
                    pl.highlight ? 'bg-[#F58A06] hover:bg-[#E47C00] text-white' : 'bg-[#1B3FA1] hover:bg-[#16348A] text-white'
                  }`}
                >
                  {canUpgradeHere ? (
                    busy === 'upgrade'
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Passage…</>
                      : <>Passer en Multi <ArrowRight className="h-4 w-4" /></>
                  ) : busy === pl.key ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Redirection…</>
                  ) : isCurrent ? (
                    'Formule active'
                  ) : isPaid ? (
                    'Inclus'
                  ) : (
                    <>S'abonner <ArrowRight className="h-4 w-4" /></>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-500 mt-8">
          Paiement sécurisé par Stripe · Sans engagement · Une offre sur mesure (MOE, architectes) ?{' '}
          <a href="/contact" className="text-[#1B3FA1] font-semibold hover:underline">Nous contacter</a>
        </p>

        {loading && <p className="sr-only">Chargement…</p>}
      </div>
    </section>
  );
}
