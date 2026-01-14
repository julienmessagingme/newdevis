import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, ArrowLeft, FileText, FileWarning, Info, AlertTriangle } from "lucide-react";

type RejectionType = "facture" | "autre" | "unknown";

interface DocumentRejectionScreenProps {
  fileName: string;
  rejectionMessage?: string;
  rejectionType?: RejectionType;
}

/**
 * Écran de refus de document - Affiche un message pédagogique
 * lorsqu'un document n'est pas analysable (facture, bon de commande, etc.)
 */
const DocumentRejectionScreen = ({ 
  fileName, 
  rejectionMessage,
  rejectionType = "unknown"
}: DocumentRejectionScreenProps) => {
  
  // Déterminer le type de rejet basé sur le message si non fourni
  const detectRejectionType = (): RejectionType => {
    if (rejectionType !== "unknown") return rejectionType;
    if (!rejectionMessage) return "unknown";
    
    const lowerMessage = rejectionMessage.toLowerCase();
    if (lowerMessage.includes("facture")) return "facture";
    if (lowerMessage.includes("bon de commande") || lowerMessage.includes("commercial")) return "autre";
    return "autre";
  };
  
  const type = detectRejectionType();
  
  // Configuration des messages selon le type
  const getContent = () => {
    switch (type) {
      case "facture":
        return {
          icon: <FileWarning className="h-10 w-10 text-score-orange" />,
          iconBg: "bg-score-orange/10",
          title: "Document non analysable",
          mainMessage: (
            <>
              <p className="mb-4">
                Le document transmis est une <strong className="text-foreground">facture</strong>, c'est-à-dire un document émis <strong className="text-foreground">après la réalisation des travaux</strong> ou de la prestation.
              </p>
              <p className="mb-4">
                VerifierMonDevis.fr analyse uniquement des <strong className="text-foreground">devis</strong>, qui sont des documents émis <strong className="text-foreground">avant engagement</strong>, afin de vous aider à sécuriser votre décision.
              </p>
              <p>
                Pour bénéficier de l'analyse, merci de transmettre un <strong className="text-foreground">devis correspondant à votre projet</strong>.
              </p>
            </>
          ),
          secondaryMessage: "Cette limitation permet d'éviter toute interprétation incorrecte et garantit la fiabilité des analyses proposées.",
          ctaText: "Analyser un devis"
        };
        
      case "autre":
      default:
        return {
          icon: <FileText className="h-10 w-10 text-muted-foreground" />,
          iconBg: "bg-muted",
          title: "Document non conforme pour l'analyse",
          mainMessage: (
            <>
              <p className="mb-4">
                Le document transmis ne correspond pas à un <strong className="text-foreground">devis de travaux</strong> ou de <strong className="text-foreground">prestation technique</strong> analysable par VerifierMonDevis.fr.
              </p>
              <p className="mb-4">
                Exemples de documents non analysables : bon de commande, appel de fonds, document commercial, contrat signé, etc.
              </p>
              <p>
                Afin de garantir la <strong className="text-foreground">pertinence et la fiabilité</strong> de l'analyse, seuls certains types de documents peuvent être traités.
              </p>
            </>
          ),
          secondaryMessage: "Merci de transmettre un devis détaillé correspondant à votre projet.",
          ctaText: "Transmettre un devis"
        };
    }
  };
  
  const content = getContent();
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground">VerifierMonDevis.fr</span>
          </Link>
        </div>
      </header>
      
      <main className="container py-12 max-w-2xl">
        {/* Icon */}
        <div className={`w-20 h-20 ${content.iconBg} rounded-2xl flex items-center justify-center mx-auto mb-6`}>
          {content.icon}
        </div>
        
        {/* Title */}
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2 text-center">
          {content.title}
        </h1>
        
        {/* File info */}
        <p className="text-sm text-muted-foreground text-center mb-8">
          Document : <span className="font-medium text-foreground">{fileName}</span>
        </p>
        
        {/* Main message card */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="text-muted-foreground leading-relaxed">
            {content.mainMessage}
          </div>
        </div>
        
        {/* Secondary info */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              {content.secondaryMessage}
            </p>
          </div>
        </div>
        
        {/* Credibility message */}
        <div className="bg-muted/50 border border-border rounded-xl p-5 mb-8">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            Pourquoi certaines analyses sont limitées ou refusées ?
          </h3>
          <div className="text-xs text-muted-foreground space-y-2">
            <p>
              VerifierMonDevis.fr a fait le choix de <strong className="text-foreground">limiter volontairement</strong> certaines analyses afin d'éviter toute interprétation incorrecte.
            </p>
            <p>
              Cette approche garantit une <strong className="text-foreground">information plus fiable et plus utile</strong> pour les particuliers.
            </p>
          </div>
        </div>
        
        {/* Legal disclaimer */}
        <div className="text-xs text-muted-foreground text-center mb-8 px-4">
          <p>
            L'analyse fournie est automatisée et repose sur les informations figurant dans le document transmis.
            Elle constitue une aide à la décision et ne remplace pas une analyse humaine ou juridique.
          </p>
        </div>
        
        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/tableau-de-bord">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour au tableau de bord
            </Button>
          </Link>
          <Link to="/nouvelle-analyse">
            <Button size="lg" className="w-full sm:w-auto">
              {content.ctaText}
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
};

export default DocumentRejectionScreen;
