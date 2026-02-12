import { CheckCircle2, AlertCircle, Ruler, Building2, ClipboardCheck, HardHat } from "lucide-react";
import { getScoreIcon, getScoreBgClass, getScoreTextClass } from "@/lib/scoreUtils";
import { extractArchitecteInfo } from "@/lib/architecteUtils";
import PedagogicExplanation from "./PedagogicExplanation";

interface BlockArchitecteProps {
  pointsOk: string[];
  alertes: string[];
  recommandations: string[];
}

const getMissionIcon = (mission: string) => {
  switch (mission) {
    case "conception":
      return <Ruler className="h-4 w-4 text-primary" />;
    case "suivi_chantier":
      return <HardHat className="h-4 w-4 text-primary" />;
    case "coordination":
      return <ClipboardCheck className="h-4 w-4 text-primary" />;
    default:
      return null;
  }
};

const getMissionLabel = (mission: string) => {
  switch (mission) {
    case "conception":
      return "Conception";
    case "suivi_chantier":
      return "Suivi de chantier";
    case "coordination":
      return "Coordination";
    default:
      return mission;
  }
};

const BlockArchitecte = ({ pointsOk, alertes, recommandations }: BlockArchitecteProps) => {
  const info = extractArchitecteInfo(pointsOk, alertes, recommandations);

  // Don't render if no architect/MOE detected
  if (!info.detecte) return null;

  const typeLabel = info.type === "architecte" ? "Architecte" : "Maître d'œuvre";
  const typeDescription = info.type === "architecte"
    ? "Ce devis est émis par un architecte, professionnel réglementé inscrit à l'Ordre des Architectes."
    : "Ce devis est émis par un maître d'œuvre, professionnel coordonnant les travaux.";

  return (
    <div className={`border-2 rounded-2xl p-6 mb-6 ${getScoreBgClass(info.score)}`}>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-foreground text-xl">
              {info.type === "architecte" ? "Devis d'Architecte" : "Devis de Maître d'œuvre"}
            </h2>
            {getScoreIcon(info.score, "h-6 w-6")}
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            {typeDescription}
          </p>

          {/* Info grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Professional info */}
            <div className="p-3 bg-background/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Professionnel</p>
              <p className="font-medium text-foreground">
                {info.nom ? `${typeLabel} - ${info.nom}` : typeLabel}
              </p>
            </div>

            {/* Honoraires */}
            {info.pourcentage_honoraires !== null && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Honoraires</p>
                <p className={`font-medium ${getScoreTextClass(info.score)}`}>
                  {info.pourcentage_honoraires}% du montant des travaux
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {info.type === "architecte"
                    ? "Fourchette habituelle : 8-15%"
                    : "Fourchette habituelle : 5-12%"
                  }
                </p>
              </div>
            )}
          </div>

          {/* Missions */}
          {info.missions.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-2">Missions identifiées</p>
              <div className="flex flex-wrap gap-2">
                {info.missions.map((mission, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-background/50 rounded-lg border border-border"
                  >
                    {getMissionIcon(mission)}
                    <span className="text-sm font-medium text-foreground">{getMissionLabel(mission)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Specific points */}
          {info.specificPoints.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-2">Points positifs</p>
              <ul className="space-y-2">
                {info.specificPoints.slice(0, 3).map((point, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-score-green mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Specific alertes with pedagogic framing */}
          {info.specificAlertes.length > 0 && (
            <PedagogicExplanation type="info" title="Points observés" className="mb-4">
              <ul className="space-y-2">
                {info.specificAlertes.map((alerte, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-score-orange mt-0.5 flex-shrink-0" />
                    <span className="text-foreground">{alerte}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground/80 mt-2 italic">
                Ces éléments sont des observations qui invitent à une vérification, non des alertes critiques.
              </p>
            </PedagogicExplanation>
          )}

          {/* Specific recommendations */}
          {info.specificRecommandations.length > 0 && (
            <PedagogicExplanation type="tip" title="Suggestions spécifiques" className="mt-4">
              <ul className="space-y-1">
                {info.specificRecommandations.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </PedagogicExplanation>
          )}

          {/* Score explanation - harmonized */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className={`text-sm font-medium ${getScoreTextClass(info.score)}`}>
              {info.score === "VERT" && `✓ Le devis ${info.type === "architecte" ? "d'architecte" : "de maître d'œuvre"} présente des conditions conformes aux usages de la profession.`}
              {info.score === "ORANGE" && `ℹ️ Certains éléments du devis invitent à une vérification complémentaire.`}
              {info.score === "ROUGE" && `⚠️ Certains éléments nécessitent une attention particulière.`}
            </p>
            {info.score === "ORANGE" && (
              <p className="text-xs text-muted-foreground mt-2">
                Aucun élément critique n'a été détecté. Les points signalés sont des invitations à vérifier, non des alertes.
              </p>
            )}
          </div>

          {/* Disclaimer - harmonized */}
          <div className="mt-3 p-2 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground/70 italic">
              ℹ️ Analyse automatisée à partir des informations du devis.
              Ces informations constituent une aide à la décision et ne portent aucun jugement sur le professionnel.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockArchitecte;
