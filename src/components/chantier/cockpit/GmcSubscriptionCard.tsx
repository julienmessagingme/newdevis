import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CreditCard, Loader2, ArrowRight, CheckCircle2, Clock } from 'lucide-react';

// Bloc "Mon abonnement" des parametres du cockpit. Lit /api/gmc/status (autoritaire) :
// etat courant + action adaptee (portail Stripe / page d'abonnement) + une timeline
// de suivi (date de demarrage, passages de statut, prochaine echeance).

interface GmcEvent { event: string; detail: string | null; at: string }
interface GmcStatusResp {
  status: string;
  plan: 'gmc_essentiel' | 'gmc_multi' | null;
  isTrial: boolean;
  trialDaysLeft: number | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  isPaid: boolean;
  isMulti: boolean;
  currentPeriodEnd: string | null;
  hasAccess: boolean;
  events: GmcEvent[];
}

const PLAN_LABEL: Record<string, string> = {
  gmc_essentiel: 'Essentiel',
  gmc_multi: 'Multi-chantiers',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '—';
  }
}

type Tone = 'neutral' | 'good' | 'warn' | 'future';
type TimelineItem = { label: string; date: string; tone: Tone };

const DOT: Record<Tone, string> = {
  neutral: 'bg-gray-300',
  good: 'bg-[#1FB664]',
  warn: 'bg-[#F58A06]',
  future: 'bg-[#1B3FA1]',
};

function buildTimeline(info: GmcStatusResp): TimelineItem[] {
  const items: TimelineItem[] = [];
  if (info.trialStartedAt) items.push({ label: 'Essai gratuit démarré', date: info.trialStartedAt, tone: 'neutral' });
  if (info.trialEndsAt) items.push({ label: "Fin de l'essai gratuit", date: info.trialEndsAt, tone: 'neutral' });
  for (const e of info.events ?? []) {
    if (e.event === 'subscribed') items.push({ label: `Abonnement activé${e.detail ? ` (${e.detail})` : ''}`, date: e.at, tone: 'good' });
    else if (e.event === 'payment_failed') items.push({ label: 'Paiement échoué', date: e.at, tone: 'warn' });
    else if (e.event === 'canceled') items.push({ label: 'Abonnement résilié', date: e.at, tone: 'warn' });
  }
  if (info.isPaid && info.currentPeriodEnd) items.push({ label: 'Prochaine échéance', date: info.currentPeriodEnd, tone: 'future' });
  return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  );
}

export default function GmcSubscriptionCard({ token }: { token: string }) {
  const [info, setInfo] = useState<GmcStatusResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalBusy, setPortalBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/gmc/status', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) { setInfo(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const openPortal = async () => {
    setPortalBusy(true);
    try {
      const res = await fetch('/api/gmc/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      toast.error(data.error || "Impossible d'ouvrir le portail");
      setPortalBusy(false);
    } catch {
      toast.error('Une erreur est survenue');
      setPortalBusy(false);
    }
  };

  const timeline = info ? buildTimeline(info) : [];

  return (
    <div>
      <h2 className="font-semibold text-gray-900 mb-3">Mon abonnement</h2>
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-1">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : (
          <>
            {/* État courant + action */}
            {info?.isPaid ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="h-5 w-5 text-[#1FB664]" />
                  <span className="font-bold text-gray-900">
                    {PLAN_LABEL[info.plan ?? ''] ?? 'Abonnement actif'}
                    {info.status === 'past_due' && ' (paiement en attente)'}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <Row label="Formule" value={PLAN_LABEL[info.plan ?? ''] ?? '—'} />
                  <Row label="Prochaine échéance" value={fmtDate(info.currentPeriodEnd)} />
                  <Row label="Engagement" value="Sans engagement" />
                </div>
                <button
                  onClick={openPortal}
                  disabled={portalBusy}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1B3FA1] hover:underline disabled:opacity-60"
                >
                  {portalBusy
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Ouverture…</>
                    : <><CreditCard className="h-4 w-4" /> Gérer ou résilier mon abonnement</>}
                </button>
              </>
            ) : info?.isTrial ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-5 w-5 text-[#F58A06]" />
                  <span className="font-bold text-gray-900">Essai gratuit</span>
                </div>
                <div className="space-y-2 text-sm">
                  <Row label="Formule" value="Gratuite (essai)" />
                  <Row label="Jours restants" value={`${info.trialDaysLeft ?? 0} jour${(info.trialDaysLeft ?? 0) > 1 ? 's' : ''}`} />
                  <Row label="Fin de l'essai" value={fmtDate(info.trialEndsAt)} />
                </div>
                <a
                  href="/gmc-abonnement"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-white bg-[#1B3FA1] hover:bg-[#16348A] rounded-xl px-4 h-10 no-underline transition-colors"
                >
                  Choisir une formule <ArrowRight className="h-4 w-4" />
                </a>
              </>
            ) : (
              <>
                <p className="font-bold text-gray-900 mb-1">Aucun abonnement actif</p>
                <p className="text-sm text-gray-500 mb-4">
                  Votre essai est terminé. Choisissez une formule pour continuer à piloter votre chantier.
                </p>
                <a
                  href="/gmc-abonnement"
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-[#1B3FA1] hover:bg-[#16348A] rounded-xl px-4 h-10 no-underline transition-colors"
                >
                  S'abonner <ArrowRight className="h-4 w-4" />
                </a>
              </>
            )}

            {/* Suivi — chronologie (démarrage, passages de statut, échéance) */}
            {timeline.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Suivi</p>
                <ol className="space-y-2.5">
                  {timeline.map((t, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[t.tone]}`} aria-hidden="true" />
                      <span className="text-gray-700 flex-1">{t.label}</span>
                      <span className="text-gray-400 tabular-nums shrink-0">{fmtDate(t.date)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
