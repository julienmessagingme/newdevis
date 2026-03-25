import { Upload, Search, FileCheck, ArrowRight } from "lucide-react";

const steps = [
  {
    icon: Upload,
    title: "Téléchargez votre devis",
    description: "Importez votre devis au format PDF ou photo. Notre système sécurisé protège vos données.",
    step: "01"
  },
  {
    icon: Search,
    title: "Analyse automatique",
    description: "Notre IA analyse l'entreprise, le devis, les garanties et compare les prix du marché.",
    step: "02"
  },
  {
    icon: FileCheck,
    title: "Recevez votre score",
    description: "Obtenez un rapport détaillé avec un score clair : Feu Vert, Orange ou Rouge.",
    step: "03"
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
            Un processus simple et rapide pour sécuriser vos travaux
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

                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    {step.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
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
