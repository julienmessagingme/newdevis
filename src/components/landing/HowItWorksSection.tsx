import { Upload, Search, FileCheck, ArrowRight } from "lucide-react";

const steps = [
  {
    icon: Upload,
    title: "Téléversez votre devis",
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
    <section className="py-20 bg-background">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Comment ça marche ?
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Un processus simple et rapide pour sécuriser vos travaux
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <div key={index} className="relative group">
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-16 left-full w-full h-0.5 bg-border -translate-x-1/2 z-0">
                  <ArrowRight className="absolute right-0 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              )}

              <div className="relative bg-card rounded-2xl p-8 card-shadow hover:card-shadow-lg transition-shadow duration-300">
                {/* Step number */}
                <span className="absolute -top-3 -right-3 bg-primary text-primary-foreground text-sm font-bold w-10 h-10 rounded-full flex items-center justify-center">
                  {step.step}
                </span>

                {/* Icon */}
                <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <step.icon className="h-8 w-8 text-primary" />
                </div>

                <h3 className="text-xl font-semibold text-foreground mb-3">
                  {step.title}
                </h3>
                <p className="text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
