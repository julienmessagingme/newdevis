import { AlertTriangle, Ban, Wallet, FileWarning } from "lucide-react";

const risks = [
  {
    icon: Ban,
    title: "Entreprise en difficulté",
    description: "Artisan en procédure collective qui risque de ne pas terminer vos travaux",
    prevented: "Détecté avant signature"
  },
  {
    icon: FileWarning,
    title: "Assurance expirée",
    description: "Garantie décennale invalide en cas de malfaçons sur votre chantier",
    prevented: "Vérifié automatiquement"
  },
  {
    icon: Wallet,
    title: "Devis gonflé",
    description: "Prix 40% au-dessus du marché pour des travaux standards",
    prevented: "Comparé aux prix du marché"
  },
  {
    icon: AlertTriangle,
    title: "Mentions manquantes",
    description: "Devis non conforme à la loi, difficilement opposable en cas de litige",
    prevented: "Analysé point par point"
  }
];

const RisksSection = () => {
  return (
    <section className="py-20 bg-background">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Les risques que nous détectons
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Protégez-vous des mauvaises surprises avant de signer
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {risks.map((risk, index) => (
            <div 
              key={index}
              className="bg-card border border-border rounded-2xl p-6 card-shadow hover:card-shadow-lg transition-shadow duration-300 group"
            >
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-score-red-bg rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <risk.icon className="h-6 w-6 text-score-red" />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {risk.title}
                  </h3>
                  <p className="text-muted-foreground text-sm mb-3">
                    {risk.description}
                  </p>
                  <div className="inline-flex items-center gap-2 bg-score-green-bg text-score-green-foreground px-3 py-1 rounded-full text-sm font-medium">
                    <span className="w-2 h-2 bg-score-green rounded-full" />
                    {risk.prevented}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RisksSection;
