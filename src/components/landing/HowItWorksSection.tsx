import { Upload, ScanSearch, BadgeCheck, ArrowRight } from "lucide-react";

const steps = [
  {
    icon: Upload,
    title: "Déposez votre devis",
    description: "PDF, photo ou scan. L'IA lit tout — pas besoin de ressaisir quoi que ce soit.",
    step: "01",
    tags: null,
  },
  {
    icon: ScanSearch,
    title: "Analyse complète en 3 dimensions",
    description: "Prix marché, fiabilité de l'entreprise, conformité du devis.",
    step: "02",
    tags: ["Prix marché", "Entreprise", "Conformité"],
  },
  {
    icon: BadgeCheck,
    title: "Verdict clair + arguments prêts",
    description: "Signer, négocier ou refuser — avec les éléments exacts à dire à votre artisan.",
    step: "03",
    tags: ["Signer", "Négocier", "Refuser"],
  }
];

const HowItWorksSection = () => {
  return (
    <section id="comment-ca-marche" className="py-8 bg-background border-b border-border">
      <div className="container">
        <div className="text-center mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-foreground mb-1">
            Comment ça marche ?
          </h2>
          <p className="text-sm text-muted-foreground">
            3 étapes. Moins d'une minute. Un verdict clair.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {steps.map((step, index) => (
            <div key={index} className="relative group">
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-10 left-full w-full h-0.5 bg-border -translate-x-1/2 z-0">
                  <ArrowRight className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                </div>
              )}

              <div className="relative bg-card rounded-xl p-5 card-shadow hover:card-shadow-lg transition-shadow duration-300 flex items-start gap-4">
                {/* Step number */}
                <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0">
                  {step.step}
                </span>

                {/* Icon */}
                <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center flex-shrink-0">
                  <step.icon className="h-5 w-5 text-primary" />
                </div>

                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    {step.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                    {step.description}
                  </p>
                  {step.tags && (
                    <div className="flex flex-wrap gap-1">
                      {step.tags.map(tag => (
                        <span key={tag} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent text-primary border border-primary/10">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
