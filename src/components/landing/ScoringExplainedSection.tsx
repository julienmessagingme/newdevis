import { CheckCircle2, AlertCircle, XCircle, Building2, FileText, Shield, MapPin } from "lucide-react";

const scoringLevels = [
  {
    level: "FEU VERT",
    color: "score-green",
    bgColor: "bg-score-green-bg",
    borderColor: "border-score-green/30",
    textColor: "text-score-green",
    icon: CheckCircle2,
    description: "Devis conforme, entreprise saine, risques faibles",
    recommendation: "Vous pouvez signer en confiance"
  },
  {
    level: "FEU ORANGE",
    color: "score-orange",
    bgColor: "bg-score-orange-bg",
    borderColor: "border-score-orange/30",
    textColor: "text-score-orange",
    icon: AlertCircle,
    description: "Éléments manquants ou risques modérés",
    recommendation: "Demandez des précisions avant de signer"
  },
  {
    level: "FEU ROUGE",
    color: "score-red",
    bgColor: "bg-score-red-bg",
    borderColor: "border-score-red/30",
    textColor: "text-score-red",
    icon: XCircle,
    description: "Risques élevés (juridiques, financiers ou techniques)",
    recommendation: "Nous vous déconseillons de signer"
  }
];

const analysisBlocks = [
  {
    icon: Building2,
    title: "Entreprise & Fiabilité",
    items: ["SIREN/SIRET", "Ancienneté de la société", "Santé financière", "Réputation en ligne"]
  },
  {
    icon: FileText,
    title: "Devis & Cohérence Financière",
    items: ["Comparaison prix marché", "Détail main-d'œuvre/matériaux", "TVA applicable", "Acompte demandé"]
  },
  {
    icon: Shield,
    title: "Sécurité & Paiement",
    items: ["Assurance décennale", "Assurance RC Pro", "Validité de l'IBAN", "Mode de paiement"]
  },
  {
    icon: MapPin,
    title: "Contexte du Chantier",
    items: ["Contraintes d'urbanisme", "Risques naturels", "Zone sismique", "Informations géorisques"]
  }
];

const ScoringExplainedSection = () => {
  return (
    <section className="py-20 bg-muted/50">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Un scoring clair et transparent
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Chaque critère est évalué et justifié. Pas de boîte noire.
          </p>
        </div>

        {/* Scoring Levels */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {scoringLevels.map((level, index) => (
            <div 
              key={index}
              className={`${level.bgColor} ${level.borderColor} border-2 rounded-2xl p-6 text-center`}
            >
              <level.icon className={`h-12 w-12 ${level.textColor} mx-auto mb-4`} />
              <h3 className={`text-xl font-bold ${level.textColor} mb-2`}>
                {level.level}
              </h3>
              <p className="text-foreground/80 text-sm mb-4">
                {level.description}
              </p>
              <p className={`text-sm font-medium ${level.textColor}`}>
                → {level.recommendation}
              </p>
            </div>
          ))}
        </div>

        {/* Analysis Blocks */}
        <div className="bg-card rounded-2xl p-8 card-shadow">
          <h3 className="text-2xl font-bold text-foreground text-center mb-8">
            4 dimensions analysées
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {analysisBlocks.map((block, index) => (
              <div key={index} className="text-center">
                <div className="w-14 h-14 bg-accent rounded-xl flex items-center justify-center mx-auto mb-4">
                  <block.icon className="h-7 w-7 text-primary" />
                </div>
                <h4 className="font-semibold text-foreground mb-3">{block.title}</h4>
                <ul className="space-y-2">
                  {block.items.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                      <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ScoringExplainedSection;
