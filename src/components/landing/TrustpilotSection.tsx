/**
 * TrustpilotSection — Carrousel d'avis Trustpilot + CTA "Laisser un avis".
 * Avis hardcodés depuis la boîte de réception Trustpilot (8 avis, tous 5 étoiles).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Star, ExternalLink } from 'lucide-react';

// ── Données ────────────────────────────────────────────────────────────────────

const REVIEWS = [
  {
    id: 1,
    author: 'Bertrand Loney',
    initials: 'BL',
    title: 'Devis très précis et fiable',
    body: 'Devis très précis et fiable, merci!',
    date: '26 mars 2026',
    stars: 5,
  },
  {
    id: 2,
    author: 'Cécile',
    initials: 'CÉ',
    title: 'Rapide et efficace',
    body: "Outil facile d'utilisation, et super utile pour aider à notre prise de décision finale",
    date: '26 mars 2026',
    stars: 5,
  },
  {
    id: 3,
    author: 'Virginie D',
    initials: 'VD',
    title: 'Très bonne expérience',
    body: 'Très bonne expérience',
    date: '26 mars 2026',
    stars: 5,
  },
  {
    id: 4,
    author: 'patrice lamire',
    initials: 'PL',
    title: "Super simple d'utilisation !",
    body: "Super simple d'utilisation ! Permet de se faire très rapidement un avis et de rechallenger le devis. Merci",
    date: '26 mars 2026',
    stars: 5,
  },
  {
    id: 5,
    author: 'Caroline Arnaud',
    initials: 'CA',
    title: 'Excellente plateforme',
    body: "Excellente plateforme, sérieuse, rapide et fiable. Facile d'utilisation, cela m a énormément aidé dans mon projet. Je recommande à 200% !",
    date: '25 mars 2026',
    stars: 4,
  },
  {
    id: 6,
    author: 'cecile dumas',
    initials: 'CD',
    title: 'J\'étais perdue dans mes devis',
    body: "J'étais perdue dans mes devis et comme je suis peu aguerrie j avais crainte de me faire avoir. Franchement merci. Cela m a aidé à faire mon choix entre plusieurs devis",
    date: '26 mars 2026',
    stars: 5,
  },
  {
    id: 7,
    author: 'Noah B',
    initials: 'NB',
    title: 'Belle interface',
    body: "Belle interface, je suis en train de refaire ma terrasse et ce site m'a bien aidé. J'ai mis mes devis et le site m'a donné des avis très complets qui m'ont permis de prendre ma décision 🤩👍",
    date: '22 mars 2026',
    stars: 5,
  },
  {
    id: 8,
    author: 'Hélène Senaux',
    initials: 'HS',
    title: 'Utile et efficace',
    body: 'Site intuitif et fluide. Devis analysé rapidement et de manière efficace. Je recommande ce site car très utile pour détecter des anomalies !',
    date: '24 mars 2026',
    stars: 5,
  },
  {
    id: 9,
    author: 'Lionel Humbert',
    initials: 'LH',
    title: "L'interface est très fluide",
    body: "L'interface est très fluide et intuitive, on s'y retrouve en deux secondes. Il suffit de charger le devis et l'analyse arrive très rapidement. Avoir un retour sur la capacité financière de l'artisan ainsi que sur les avis de ses clients est juste essentiel avant de s'engager. Je recommande vivement",
    date: '3 mars 2026',
    stars: 5,
  },
  {
    id: 10,
    author: 'Steph Steph',
    initials: 'SS',
    title: 'Très intuitif et complet',
    body: "Très intuitif. Regorge d'informations très utiles quelque soit le contexte lié aux travaux envisagés (perso / revente / location) et aux points de vigilance à observer. Je recommande vivement.",
    date: '11 mars 2026',
    stars: 5,
  },
  {
    id: 11,
    author: 'THOMAS BREHAMET',
    initials: 'TB',
    title: "Très facile d'utilisation et très rapide",
    body: "Très facile d'utilisation et très rapide. Un outil indispensable avant de signer un devis.",
    date: '5 mars 2026',
    stars: 5,
  },
  {
    id: 12,
    author: 'Sophie H',
    initials: 'SH',
    title: 'Intéressant',
    body: "Intéressant ! Rassurant, j'hésitais à signer avec un artisan, ça m'a permis de franchir le pas. Semble sérieux.",
    date: '14 mars 2026',
    stars: 5,
  },
  {
    id: 13,
    author: 'SB',
    initials: 'SB',
    title: 'Utile pour se faire une idée rapide',
    body: "Utile pour se faire une idée rapide du montant moyen des travaux qu'on souhaite réaliser. Simple d'utilisation.",
    date: '14 mars 2026',
    stars: 5,
  },
  {
    id: 14,
    author: 'Pa Schmidt',
    initials: 'PS',
    title: "Vision complète d'une entreprise",
    body: "Les fourchettes de prix sont encore assez vastes mais l'interface est sympa et ça donne une vision complète d'une entreprise.",
    date: '13 mars 2026',
    stars: 5,
  },
];

const TRUSTPILOT_REVIEW_URL = 'https://fr.trustpilot.com/evaluate/verifiermondevis.fr';
const TRUSTPILOT_PROFILE_URL = 'https://fr.trustpilot.com/review/verifiermondevis.fr';

// ── Composant étoiles ──────────────────────────────────────────────────────────

function Stars({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < Math.floor(count);
        const half   = !filled && i < count;
        return (
          <div
            key={i}
            className={`w-5 h-5 flex items-center justify-center rounded-sm overflow-hidden relative ${
              filled ? 'bg-[#00b67a]' : 'bg-gray-200'
            }`}
          >
            {half && (
              <>
                <div className="absolute inset-0 left-0 w-1/2 bg-[#00b67a]" />
                <div className="absolute inset-0 left-1/2 w-1/2 bg-gray-200" />
              </>
            )}
            <Star className="w-3 h-3 text-white fill-white relative z-10" />
          </div>
        );
      })}
    </div>
  );
}

// ── Logo Trustpilot SVG ────────────────────────────────────────────────────────

function TrustpilotLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 130 32" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M16 0l3.09 9.51H29.5l-8.5 6.18 3.09 9.51L16 19.02l-8.09 6.18 3.09-9.51L2.5 9.51H12.91L16 0z"
        fill="#00b67a"
      />
      <text x="35" y="23" fontFamily="Arial, sans-serif" fontSize="18" fontWeight="bold" fill="#191919">
        Trustpilot
      </text>
    </svg>
  );
}

// ── Carte avis ─────────────────────────────────────────────────────────────────

function ReviewCard({ review, active }: { review: typeof REVIEWS[0]; active: boolean }) {
  return (
    <div className={active ? '' : 'hidden'}>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4 h-56">
        {/* Stars */}
        <Stars count={review.stars} />

        {/* Titre + corps */}
        <div className="flex-1">
          <p className="font-bold text-gray-900 mb-2 text-base leading-snug">{review.title}</p>
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-4">{review.body}</p>
        </div>

        {/* Auteur */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <div className="w-8 h-8 rounded-full bg-[#00b67a] flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">{review.initials}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{review.author}</p>
            <p className="text-xs text-gray-400">{review.date}</p>
          </div>
          <div className="ml-auto shrink-0">
            <TrustpilotLogo className="h-4 w-auto opacity-40" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section principale ─────────────────────────────────────────────────────────

// Nombre de cartes visibles selon le breakpoint
const VISIBLE = { mobile: 1, sm: 2, lg: 3 };

export default function TrustpilotSection() {
  const [current, setCurrent] = useState(0);
  const [fading, setFading]   = useState(false);
  const [paused, setPaused]   = useState(false);
  const timerRef              = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo = useCallback((idx: number) => {
    setFading(true);
    setTimeout(() => {
      setCurrent((idx + REVIEWS.length) % REVIEWS.length);
      setFading(false);
    }, 200);
  }, []);

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  // Auto-rotation toutes les 5 secondes — repart après interaction
  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(() => {
      setCurrent(c => (c + 1) % REVIEWS.length);
    }, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, current]);

  // Après clic bouton : reprise auto après 8 secondes
  const handleNav = (fn: () => void) => {
    setPaused(true);
    fn();
    setTimeout(() => setPaused(false), 8000);
  };

  // Cartes visibles : on affiche cols cartes à partir de current
  const getCards = (cols: number) =>
    Array.from({ length: cols }, (_, i) => REVIEWS[(current + i) % REVIEWS.length]);

  return (
    <section className="py-16 bg-gradient-to-b from-white to-slate-50 border-t border-gray-100">
      <div className="container max-w-5xl px-4 sm:px-6">

        {/* ── En-tête ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <a href={TRUSTPILOT_PROFILE_URL} target="_blank" rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity">
                <TrustpilotLogo className="h-7 w-auto" />
              </a>
            </div>
            <div className="flex items-center gap-3">
              <Stars count={4.5} />
              <span className="text-2xl font-extrabold text-gray-900 tabular-nums">4,5</span>
              <span className="text-sm text-gray-500">·</span>
              <a href={TRUSTPILOT_PROFILE_URL} target="_blank" rel="noopener noreferrer"
                className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 transition-colors">
                15 avis vérifiés
              </a>
            </div>
          </div>

          <a href={TRUSTPILOT_REVIEW_URL} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#00b67a] hover:bg-[#00a369] text-white font-semibold text-sm px-5 py-3 rounded-xl shadow-sm transition-colors shrink-0">
            <Star className="h-4 w-4 fill-white" />
            Donnez votre avis
            <ExternalLink className="h-3.5 w-3.5 opacity-75" />
          </a>
        </div>

        {/* ── Carrousel ── */}
        <div className="relative">

          {/* Grille de cartes avec fade */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity duration-200"
            style={{ opacity: fading ? 0 : 1 }}
          >
            {/* Mobile : 1 carte */}
            {getCards(VISIBLE.mobile).map((review, i) => (
              <div key={`m-${i}`} className="sm:hidden">
                <ReviewCard review={review} active />
              </div>
            ))}
            {/* SM : 2 cartes */}
            {getCards(VISIBLE.sm).map((review, i) => (
              <div key={`s-${i}`} className="hidden sm:block lg:hidden">
                <ReviewCard review={review} active />
              </div>
            ))}
            {/* LG : 3 cartes */}
            {getCards(VISIBLE.lg).map((review, i) => (
              <div key={`l-${i}`} className="hidden lg:block">
                <ReviewCard review={review} active />
              </div>
            ))}
          </div>

          {/* Contrôles */}
          <div className="flex items-center justify-center gap-3 mt-6">
            <button onClick={() => handleNav(prev)} aria-label="Avis précédent"
              className="w-9 h-9 rounded-full border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all shadow-sm">
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex gap-1.5">
              {REVIEWS.map((_, i) => (
                <button key={i} onClick={() => handleNav(() => goTo(i))} aria-label={`Avis ${i + 1}`}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i === current ? 'w-6 bg-[#00b67a]' : 'w-2 bg-gray-200 hover:bg-gray-300'
                  }`}
                />
              ))}
            </div>

            <button onClick={() => handleNav(next)} aria-label="Avis suivant"
              className="w-9 h-9 rounded-full border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-all shadow-sm">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Bandeau bas ── */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 text-sm text-gray-500">
          <span>Vous avez utilisé VerifierMonDevis.fr ?</span>
          <a href={TRUSTPILOT_REVIEW_URL} target="_blank" rel="noopener noreferrer"
            className="font-semibold text-[#00b67a] hover:text-[#00a369] underline underline-offset-2 transition-colors">
            Partagez votre expérience sur Trustpilot →
          </a>
        </div>

      </div>
    </section>
  );
}
