import { useEffect, useState } from 'react';
import { Clock, AlertTriangle, ArrowRight } from 'lucide-react';

// Bandeau compteur d'essai GMC. Auto-suffisant (fetch /api/gmc/status via token).
// - essai en cours : jours restants (orange si <= 7 j) + CTA abonnement
// - essai termine (pas d'acces, pas payant) : invite a se reabonner
// - payant : rien
interface Lite {
  isTrial: boolean;
  trialDaysLeft: number | null;
  isPaid: boolean;
  hasAccess: boolean;
}

export default function GmcTrialBanner({ token }: { token: string }) {
  const [info, setInfo] = useState<Lite | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/gmc/status', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setInfo(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  if (!info || info.isPaid) return null;

  if (info.isTrial) {
    const d = info.trialDaysLeft ?? 0;
    const urgent = d <= 7;
    return (
      <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 mb-6 ${
        urgent ? 'bg-[#F58A06]/10 border-[#F58A06]/30' : 'bg-blue-50 border-blue-100'
      }`}>
        <Clock className={`h-5 w-5 shrink-0 ${urgent ? 'text-[#F58A06]' : 'text-blue-600'}`} />
        <p className="text-sm text-gray-700 flex-1 min-w-[200px]">
          Essai gratuit : <span className="font-bold text-gray-900">{d} jour{d > 1 ? 's' : ''}</span> restant{d > 1 ? 's' : ''}.
        </p>
        <a
          href="/gmc-abonnement"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-[#1B3FA1] hover:bg-[#16348A] rounded-lg px-4 h-9 no-underline transition-colors"
        >
          Choisir une formule <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    );
  }

  if (!info.hasAccess) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-6">
        <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
        <p className="text-sm text-gray-700 flex-1 min-w-[200px]">
          Votre essai gratuit est terminé. Réabonnez-vous pour continuer à piloter votre chantier.
        </p>
        <a
          href="/gmc-abonnement"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg px-4 h-9 no-underline transition-colors"
        >
          S'abonner <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    );
  }

  return null;
}
