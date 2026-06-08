import { useEffect, useState, useRef } from 'react';

/**
 * Widget social proof affiché juste sous le Hero de la home VMD.
 *
 * Objectif : booster le taux de conversion home → /nouvelle-analyse (actuellement
 * ~16% mesuré GA4) en montrant que d'autres particuliers utilisent le service
 * EN CE MOMENT — friction abaissée + crédibilité immédiate.
 *
 * Structure visuelle :
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │   🟢 EN DIRECT       250+ devis analysés                    │
 *   │                                                              │
 *   │   il y a 12 min  ·  Rénovation salle de bain        ✓ Vert │
 *   │   il y a 1h 27   ·  Cuisine équipée                ⚠ Orange│
 *   │   il y a 3h      ·  Peinture appartement            ✓ Vert │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Données via GET /api/social-proof (cache 60s côté Vercel + côté client).
 * Auto-refresh client toutes les 60s (visibility-aware — pause si tab hidden).
 *
 * Anti-mensonge produit : le compteur affiche le VRAI total des analyses
 * completed depuis la création (pas de chiffre inventé). Si Julien veut
 * arrondir bas pour social proof (ex: "250+" au lieu de 312 exact), c'est
 * géré via la prop `floor` (défaut 100, voir formatCount).
 */

type Item = { minutes_ago: number; work_type: string; verdict: 'VERT' | 'ORANGE' | 'ROUGE' };
type ApiResp = { total_count: number; recent: Item[] };

const REFRESH_MS = 60_000;

function formatAge(min: number): string {
  if (min < 1) return 'à l\'instant';
  if (min < 60) return `il y a ${min} min`;
  const hours = Math.floor(min / 60);
  const remMin = min % 60;
  if (hours < 24) {
    return remMin === 0 ? `il y a ${hours}h` : `il y a ${hours}h ${remMin}`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hier' : `il y a ${days} jours`;
}

/** Arrondi visuel pour le compteur : 250+ / 300+ / 500+ / 1k+ etc. */
function formatCount(n: number): string {
  if (n < 50) return `${n}`;
  if (n < 100) return '50+';
  if (n < 250) return '100+';
  if (n < 500) return '250+';
  if (n < 1000) return '500+';
  if (n < 5000) return `${Math.floor(n / 1000)}k+`;
  return `${(n / 1000).toFixed(1)}k+`;
}

const VERDICT_CONFIG: Record<Item['verdict'], { label: string; dot: string; text: string; bg: string }> = {
  VERT: { label: 'Vert', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  ORANGE: { label: 'Orange', dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  ROUGE: { label: 'Rouge', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
};

export default function SocialProofTicker() {
  const [data, setData] = useState<ApiResp | null>(null);
  const [animatedCount, setAnimatedCount] = useState(0);
  const animatedRef = useRef<number | null>(null);

  // ── Fetch + auto-refresh toutes les 60s (pause si tab hidden)
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/social-proof', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as ApiResp;
        if (!cancelled) setData(json);
      } catch {
        /* silencieux — pas de UI d'erreur (widget non bloquant) */
      }
    };

    load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // ── Count-up animation au premier load
  useEffect(() => {
    if (!data?.total_count) return;
    const target = data.total_count;
    const start = animatedRef.current ?? 0;
    if (start === target) return;
    const duration = 1500;
    const startTs = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTs) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(start + (target - start) * eased);
      setAnimatedCount(val);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        animatedRef.current = target;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data?.total_count]);

  // ── Skeleton si pas de data
  if (!data || data.recent.length === 0) {
    return (
      <section className="py-8 bg-gradient-to-b from-slate-50 to-white border-y border-slate-100">
        <div className="container">
          <div className="max-w-3xl mx-auto h-32 animate-pulse bg-slate-100 rounded-2xl" aria-hidden="true" />
        </div>
      </section>
    );
  }

  const displayedTotal = animatedCount > 0 ? animatedCount : data.total_count;

  return (
    <section
      className="py-8 sm:py-10 bg-gradient-to-b from-slate-50 to-white border-y border-slate-100"
      aria-label="Activité récente sur VerifierMonDevis"
    >
      <div className="container">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

            {/* Header — pulse live + compteur */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                  En direct
                </span>
              </div>
              <p className="text-sm sm:text-base font-semibold text-slate-900">
                <span className="text-xl sm:text-2xl font-bold text-indigo-600 tabular-nums">
                  {formatCount(displayedTotal)}
                </span>
                {' '}
                <span className="text-slate-600 font-normal">devis analysés</span>
              </p>
            </div>

            {/* Ticker — 3 dernières analyses (4 sur mobile masque sur les + larges écrans) */}
            <ul className="divide-y divide-slate-50" aria-live="polite">
              {data.recent.slice(0, 3).map((item, i) => {
                const conf = VERDICT_CONFIG[item.verdict];
                return (
                  <li
                    key={`${item.minutes_ago}-${i}`}
                    className="px-5 sm:px-6 py-3 flex items-center gap-3 sm:gap-4"
                  >
                    <span className="text-[11px] sm:text-xs text-slate-500 font-medium tabular-nums whitespace-nowrap shrink-0 w-[80px] sm:w-[100px]">
                      {formatAge(item.minutes_ago)}
                    </span>
                    <span className="text-sm text-slate-700 flex-1 truncate" title={item.work_type}>
                      {item.work_type}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${conf.bg} ${conf.text} shrink-0`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${conf.dot}`} aria-hidden="true" />
                      {conf.label}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* Footer — CTA discret */}
            <div className="px-5 sm:px-6 py-3 bg-slate-50/50 border-t border-slate-100 text-center">
              <a
                href="/nouvelle-analyse"
                className="text-xs sm:text-sm font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 transition-colors"
              >
                Analyser mon devis gratuitement
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </a>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
