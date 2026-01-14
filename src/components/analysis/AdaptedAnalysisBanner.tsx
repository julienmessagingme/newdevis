import { Info, Lightbulb, AlertTriangle, FileSearch } from "lucide-react";

type AnalysisMode = "diagnostic" | "prestation_technique" | "standard";

interface AdaptedAnalysisBannerProps {
  mode: AnalysisMode;
  className?: string;
}

/**
 * Bandeau d'explication pour les analyses adaptées
 * Affiché en tête de rapport pour les diagnostics ou prestations techniques
 */
const AdaptedAnalysisBanner = ({ mode, className = "" }: AdaptedAnalysisBannerProps) => {
  if (mode === "standard") return null;
  
  const getContent = () => {
    switch (mode) {
      case "diagnostic":
        return {
          title: "Analyse adaptée — Diagnostic immobilier",
          icon: <FileSearch className="h-5 w-5 text-primary flex-shrink-0" />,
          mainMessage: (
            <>
              Le document transmis concerne un <strong>diagnostic immobilier</strong> (DPE, amiante, plomb, électricité, gaz, etc.).
              L'analyse a été <strong>adaptée à la nature de cette mission</strong>, qui diffère d'un devis de travaux.
            </>
          ),
          explanationItems: [
            "Il n'existe pas de prix de référence standardisé pour les diagnostics (tarifs libres)",
            "Les assurances obligatoires ne sont pas les mêmes que pour des travaux",
            "La mission est principalement technique et intellectuelle"
          ],
          analysisScope: [
            "La fiabilité de l'entreprise",
            "La clarté des diagnostics inclus dans la prestation",
            "La cohérence indicative du tarif",
            "Les conditions de paiement"
          ],
          priceNote: "Les tarifs des diagnostics immobiliers sont libres et peuvent varier selon la taille du bien, sa localisation et le nombre de diagnostics requis. Les comparaisons de prix sont fournies à titre indicatif afin d'aider à situer le devis par rapport aux pratiques courantes."
        };
        
      case "prestation_technique":
      default:
        return {
          title: "Analyse adaptée à la nature du document",
          icon: <FileSearch className="h-5 w-5 text-primary flex-shrink-0" />,
          mainMessage: (
            <>
              Le document transmis concerne une <strong>prestation technique liée au bâtiment</strong> (diagnostic, audit, étude ou expertise).
              L'analyse a été <strong>adaptée à la nature de cette mission</strong>, qui diffère d'un devis de travaux.
            </>
          ),
          explanationItems: [
            "Il n'existe généralement pas de prix de référence standardisé",
            "Les assurances obligatoires ne sont pas les mêmes que pour des travaux",
            "La mission est principalement technique ou intellectuelle"
          ],
          analysisScope: [
            "La fiabilité de l'entreprise",
            "La clarté de la mission décrite",
            "Les conditions de paiement"
          ],
          priceNote: null
        };
    }
  };
  
  const content = getContent();
  
  return (
    <div className={`space-y-4 mb-8 ${className}`}>
      {/* Main banner */}
      <div className="bg-primary/5 border-2 border-primary/20 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          {content.icon}
          <div>
            <h2 className="font-semibold text-foreground text-lg mb-1">
              {content.title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {content.mainMessage}
            </p>
          </div>
        </div>
        
        {/* Explanation block */}
        <div className="bg-background/60 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            Pour ce type de prestation :
          </h3>
          <ul className="space-y-2">
            {content.explanationItems.map((item, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="text-primary mt-0.5">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        
        {/* Analysis scope */}
        <div className="bg-background/60 rounded-lg p-4">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            L'analyse porte donc principalement sur :
          </h3>
          <ul className="space-y-2">
            {content.analysisScope.map((item, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="text-score-green mt-0.5">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
      
      {/* Price note for diagnostics */}
      {content.priceNote && (
        <div className="bg-muted/50 border border-border rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {content.priceNote}
            </p>
          </div>
        </div>
      )}
      
      {/* Credibility note */}
      <div className="text-xs text-muted-foreground text-center px-4">
        <p>
          Cette adaptation vise à fournir une <strong className="text-foreground">analyse pertinente</strong> et éviter toute comparaison inappropriée.
        </p>
      </div>
    </div>
  );
};

export default AdaptedAnalysisBanner;
