import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, AlertTriangle, TrendingUp, ShieldCheck } from "lucide-react";
const HeroSection = () => {
  return <section className="hero-gradient relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary-foreground rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
      </div>

      <div className="container relative py-12 px-4 sm:px-6 lg:py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div className="text-center lg:text-left">
            
            <h1 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold text-primary-foreground mb-4 sm:mb-6 leading-tight px-2">
              Analyser un devis travaux{" "}
              <span className="relative inline-block">
                gratuitement
                <svg className="absolute -bottom-1 sm:-bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                  <path d="M2 10C50 4 150 4 198 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-score-green animate-underline-draw" strokeDasharray="200" strokeDashoffset="200" />
                </svg>
              </span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-primary-foreground/80 mb-6 sm:mb-8 max-w-xl mx-auto lg:mx-0 px-2">
              Téléchargez votre devis et obtenez instantanément un score de fiabilité.
              Feu vert, orange ou rouge : sachez si vous pouvez faire confiance à l'artisan et si les prix proposés sont cohérents.
            </p>

            <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row justify-center lg:justify-start mb-8 sm:mb-10 px-2">
              <a href="/nouvelle-analyse" className="w-full sm:w-auto">
                <Button variant="hero" size="xl" className="w-full group text-sm sm:text-base">
                  Analyser mon devis gratuitement
                  <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </a>
              <a href="#comment-ca-marche" className="w-full sm:w-auto">
                <Button variant="ghost" size="xl" className="w-full text-primary-foreground hover:bg-primary-foreground/10 text-sm sm:text-base">
                  Comment ça marche ?
                </Button>
              </a>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-col gap-2 sm:gap-4 sm:flex-row items-center justify-center lg:justify-start text-primary-foreground/70 text-xs sm:text-sm px-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-score-green flex-shrink-0" />
                <span>Analyse en 2 minutes</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-score-green flex-shrink-0" />
                <span>100% confidentiel</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-score-green flex-shrink-0" />
                <span>Suivi post-signature</span>
              </div>
            </div>
          </div>

          {/*
            VISUAL — hero photo investigation devis (2026-05-20)
            Photo réelle (devis loupe acompte 50%) + 3 overlays SaaS premium.
            Remplace l'ancienne carte score mockée. Image WebP 181 Ko @1289×1600,
            hidden sous lg:1024px (mobile inchangé).
          */}
          <div className="hidden lg:block relative">
            <div className="relative max-w-md mx-auto">
              {/* Photo centrale — animation float douce existante (animate-float) */}
              <div className="relative animate-float">
                <img
                  src="/images/hero-devis-investigation.webp"
                  alt="Analyse d'un devis travaux : loupe sur un acompte de 50% pointé comme drapeau rouge"
                  width={1289}
                  height={1600}
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                  className="w-full h-auto rounded-2xl shadow-2xl object-cover ring-1 ring-black/5"
                />
              </div>

              {/* Overlay 1 — Badge ROUGE : acompte 50% (top-right) */}
              <div
                className="absolute -top-3 -right-3 sm:-top-4 sm:-right-4 max-w-[200px]
                           bg-white/95 backdrop-blur-md
                           border border-red-200 border-l-4 border-l-red-500
                           rounded-xl shadow-xl shadow-red-500/10
                           px-3.5 py-2.5
                           animate-fade-in-overlay"
                style={{ animationDelay: '0.2s', animationFillMode: 'both' }}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-red-600 font-semibold leading-none">
                      Drapeau rouge
                    </p>
                    <p className="text-sm font-bold text-foreground leading-tight mt-0.5">
                      Acompte&nbsp;50%
                    </p>
                  </div>
                </div>
              </div>

              {/* Overlay 2 — Badge ORANGE : prix marché +18% (middle-left)
                  Wrapper externe = positionnement vertical centré (top-1/2 -translate-y-1/2).
                  Le badge interne anime sans casser le transform du wrapper. */}
              <div className="absolute top-1/2 -left-3 sm:-left-6 -translate-y-1/2 max-w-[200px]">
                <div
                  className="bg-white/95 backdrop-blur-md
                             border border-amber-200 border-l-4 border-l-amber-500
                             rounded-xl shadow-xl shadow-amber-500/10
                             px-3.5 py-2.5
                             animate-fade-in-overlay"
                  style={{ animationDelay: '0.4s', animationFillMode: 'both' }}
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-amber-600 flex-shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold leading-none">
                        Prix marché
                      </p>
                      <p className="text-sm font-bold text-foreground leading-tight mt-0.5">
                        +18% vs moyenne
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Overlay 3 — Badge VERT : entreprise vérifiée (bottom-right) */}
              <div
                className="absolute -bottom-3 -right-2 sm:-bottom-4 sm:-right-4 max-w-[220px]
                           bg-white/95 backdrop-blur-md
                           border border-emerald-200 border-l-4 border-l-emerald-500
                           rounded-xl shadow-xl shadow-emerald-500/10
                           px-3.5 py-2.5
                           animate-fade-in-overlay"
                style={{ animationDelay: '0.6s', animationFillMode: 'both' }}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold leading-none">
                      Vérifié SIRENE
                    </p>
                    <p className="text-sm font-bold text-foreground leading-tight mt-0.5">
                      Entreprise active
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>;
};
export default HeroSection;