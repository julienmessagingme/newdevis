import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, FileSearch } from "lucide-react";
const HeroSection = () => {
  return <section className="hero-gradient relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary-foreground rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
      </div>

      <div className="container relative py-12 px-4 sm:px-6 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div className="text-center lg:text-left">
            
            <h1 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold text-primary-foreground mb-4 sm:mb-6 leading-tight px-2">
              Vérifier un devis artisan{" "}
              <span className="relative inline-block">
                gratuitement
                <svg className="absolute -bottom-1 sm:-bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                  <path d="M2 10C50 4 150 4 198 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-score-green" />
                </svg>
              </span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-primary-foreground/80 mb-6 sm:mb-8 max-w-xl mx-auto lg:mx-0 px-2">
              Téléchargez votre devis et obtenez instantanément un score de fiabilité. 
              Feu vert, orange ou rouge : sachez si vous pouvez faire confiance à l'artisan.
            </p>

            <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row justify-center lg:justify-start mb-8 sm:mb-10 px-2">
              <Link to="/inscription" className="w-full sm:w-auto">
                <Button variant="hero" size="xl" className="w-full group text-sm sm:text-base">
                  Analyser mon devis gratuitement
                  <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link to="/comment-ca-marche" className="w-full sm:w-auto">
                <Button variant="ghost" size="xl" className="w-full text-primary-foreground hover:bg-primary-foreground/10 text-sm sm:text-base">
                  Comment ça marche ?
                </Button>
              </Link>
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

          {/* Visual */}
          <div className="hidden lg:block relative">
            <div className="relative animate-float">
              {/* Main Card */}
              <div className="bg-card rounded-2xl shadow-2xl p-6 max-w-md mx-auto">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-primary/10 rounded-xl">
                    <FileSearch className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Devis Plomberie</h3>
                    <p className="text-sm text-muted-foreground">Analysé le 06/01/2026</p>
                  </div>
                </div>

                {/* Score Display */}
                <div className="bg-score-green-bg border border-score-green/20 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-score-green-foreground">Score de fiabilité</span>
                    <span className="text-2xl font-bold text-score-green">FEU VERT</span>
                  </div>
                  <div className="mt-2 h-2 bg-score-green/20 rounded-full overflow-hidden">
                    <div className="h-full bg-score-green rounded-full" style={{
                    width: '85%'
                  }} />
                  </div>
                </div>

                {/* Criteria */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Entreprise vérifiée</span>
                    <CheckCircle2 className="h-5 w-5 text-score-green" />
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Mentions légales</span>
                    <CheckCircle2 className="h-5 w-5 text-score-green" />
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-muted-foreground">Prix cohérent</span>
                    <CheckCircle2 className="h-5 w-5 text-score-green" />
                  </div>
                </div>
              </div>

              {/* Floating badges */}
              <div className="absolute -top-4 -right-4 bg-score-green text-primary-foreground px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
                ✓ Conforme
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>;
};
export default HeroSection;