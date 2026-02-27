import { Button } from "@/components/ui/button";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SEOHead from "@/components/SEOHead";
import { 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  Building2, 
  FileText, 
  Shield, 
  MapPin,
  ArrowLeft,
  HelpCircle
} from "lucide-react";

const scoreCards = [
  {
    level: "FEU VERT",
    color: "score-green",
    bgColor: "bg-score-green-bg",
    borderColor: "border-score-green/30",
    textColor: "text-score-green",
    icon: CheckCircle2,
    emoji: "🟢",
    title: "Rien de bloquant identifié",
    description: [
      "Le devis est globalement cohérent",
      "Les informations essentielles sont présentes"
    ],
    actions: [
      "Confirmer dates et planning",
      "Lire les conditions de paiement",
      "Conserver les échanges par écrit"
    ]
  },
  {
    level: "FEU ORANGE",
    color: "score-orange",
    bgColor: "bg-score-orange-bg",
    borderColor: "border-score-orange/30",
    textColor: "text-score-orange",
    icon: AlertCircle,
    emoji: "🟠",
    title: "À clarifier avant de signer",
    description: [
      "Certains points sont incomplets ou à vérifier"
    ],
    actions: [
      "Demander des détails (main-d'œuvre / matériaux / TVA)",
      "Vérifier acompte et modalités de paiement",
      "Demander attestation décennale/RC Pro si pertinent",
      "Comparer avec un autre devis"
    ]
  },
  {
    level: "FEU ROUGE",
    color: "score-red",
    bgColor: "bg-score-red-bg",
    borderColor: "border-score-red/30",
    textColor: "text-score-red",
    icon: XCircle,
    emoji: "🔴",
    title: "Vigilance accrue",
    description: [
      "Un ou plusieurs indicateurs forts nécessitent clarification"
    ],
    actions: [
      "Demander des preuves documentaires (attestation, SIRET…)",
      "Refuser un paiement non traçable",
      "Demander un second avis / second devis",
      "Reporter la décision tant que ce n'est pas clair"
    ]
  }
];

const analysisBlocks = [
  {
    icon: Building2,
    title: "Entreprise & Fiabilité",
    description: "Vérification de l'immatriculation, ancienneté, santé financière et réputation.",
    hasScore: true
  },
  {
    icon: FileText,
    title: "Devis & Cohérence Financière",
    description: "Comparaison des prix au marché, détail des postes, TVA et acompte.",
    hasScore: true
  },
  {
    icon: Shield,
    title: "Sécurité & Conditions de paiement",
    description: "Assurances, validité de l'IBAN, modes de paiement.",
    hasScore: true
  },
  {
    icon: MapPin,
    title: "Contexte du Chantier",
    description: "Informations sur les contraintes d'urbanisme et risques naturels.",
    hasScore: false
  }
];

const ComprendreScore = () => {
  const searchParams = new URLSearchParams(window.location.search);
  const fromAnalysis = searchParams.get("fromAnalysis") === "true";
  const analysisId = searchParams.get("analysisId");

  return (
    <div className="min-h-screen flex flex-col">
      <SEOHead 
        title="Comprendre le score de fiabilité | VerifierMonDevis.fr"
        description="Découvrez comment interpréter le score Feu Vert, Orange ou Rouge de votre devis artisan. Critères d'analyse, actions conseillées et explications."
        canonical="https://www.verifiermondevis.fr/comprendre-score"
      />
      <Header />
      <main className="flex-1 py-12 md:py-20 bg-background">
        <div className="container max-w-4xl">
          {/* Back button if coming from analysis */}
          {fromAnalysis && analysisId && (
            <a
              href={`/analyse/${analysisId}`}
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Revenir à mon analyse
            </a>
          )}

          {/* Title */}
          <div className="text-center mb-12">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <HelpCircle className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Comment interpréter votre score
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Ce score est une aide à la décision basée sur le devis transmis et des sources publiques. 
              Il met en avant des indicateurs de vigilance, <strong className="text-foreground">sans jugement sur l'artisan</strong>.
            </p>
          </div>

          {/* Score Cards */}
          <div className="space-y-6 mb-16">
            {scoreCards.map((card, index) => (
              <div 
                key={index}
                className={`${card.bgColor} ${card.borderColor} border-2 rounded-2xl p-6 md:p-8`}
              >
                <div className="flex items-start gap-4 mb-6">
                  <card.icon className={`h-10 w-10 ${card.textColor} flex-shrink-0`} />
                  <div>
                    <h2 className={`text-xl md:text-2xl font-bold ${card.textColor} mb-1`}>
                      {card.emoji} {card.level}
                    </h2>
                    <p className={`text-lg font-medium ${card.textColor}`}>
                      {card.title}
                    </p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">Ce que cela signifie</h3>
                    <ul className="space-y-2">
                      {card.description.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-foreground/80">
                          <span className="w-1.5 h-1.5 bg-foreground/50 rounded-full mt-2 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">Actions conseillées</h3>
                    <ul className="space-y-2">
                      {card.actions.map((action, i) => (
                        <li key={i} className="flex items-start gap-2 text-foreground/80">
                          <CheckCircle2 className={`h-4 w-4 ${card.textColor} mt-0.5 flex-shrink-0`} />
                          {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* How Score is Calculated */}
          <div className="bg-card border border-border rounded-2xl p-6 md:p-8 mb-8 card-shadow">
            <h2 className="text-2xl font-bold text-foreground mb-6 text-center">
              Comment le score est calculé
            </h2>
            <p className="text-muted-foreground text-center mb-8 max-w-2xl mx-auto">
              L'analyse repose sur 4 blocs distincts. Chaque bloc évalue un aspect spécifique 
              de votre devis et contribue au score global selon un principe de précaution.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {analysisBlocks.map((block, index) => (
                <div 
                  key={index} 
                  className="bg-muted/50 rounded-xl p-5 border border-border/50"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center flex-shrink-0">
                      <block.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">{block.title}</h3>
                      <p className="text-sm text-muted-foreground">{block.description}</p>
                      {block.hasScore ? (
                        <span className="inline-flex items-center gap-1 text-xs text-primary mt-2 font-medium">
                          <CheckCircle2 className="h-3 w-3" />
                          Impact sur le score
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mt-2">
                          ℹ️ Information uniquement
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-accent/50 rounded-xl p-5 border border-border/50">
              <h3 className="font-semibold text-foreground mb-3">Hiérarchie des critères</h3>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <strong className="text-score-red">Critères critiques</strong> (entreprise non immatriculée, IBAN invalide, paiement en espèces…) 
                  → entraînent automatiquement un <strong className="text-score-red">FEU ROUGE</strong>.
                </p>
                <p>
                  <strong className="text-score-orange">Critères majeurs</strong> (prix au-dessus du marché, acompte élevé, réputation faible…) 
                  → génèrent des vigilances pouvant mener à un <strong className="text-score-orange">FEU ORANGE</strong>.
                </p>
                <p>
                  <strong className="text-score-green">Critères de confort</strong> (RGE, QUALIBAT, ancienneté…) 
                  → renforcent la confiance mais ne peuvent jamais déclencher seuls un feu rouge.
                </p>
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="bg-muted/50 border border-border rounded-xl p-5 mb-8 text-center">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">⚠️ Avertissement :</strong> Analyse automatisée et indicative, non contractuelle. 
              Basée sur le devis transmis et des sources publiques. Ne remplace pas un avis professionnel.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {fromAnalysis && analysisId ? (
              <a href={`/analyse/${analysisId}`}>
                <Button size="lg">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Revenir à mon analyse
                </Button>
              </a>
            ) : (
              <>
                <a href="/nouvelle-analyse">
                  <Button size="lg">Analyser un devis</Button>
                </a>
                <a href="/">
                  <Button variant="outline" size="lg">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Retour à l'accueil
                  </Button>
                </a>
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ComprendreScore;
