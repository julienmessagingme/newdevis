import { Receipt } from "lucide-react";
import { getScoreIcon, getScoreBgClass, getScoreTextClass } from "@/lib/scoreUtils";
import { extractDevisData } from "@/lib/devisUtils";
import MarketComparisonGauge from "./MarketComparisonGauge";
import PedagogicExplanation from "./PedagogicExplanation";

interface BlockDevisProps {
  pointsOk: string[];
  alertes: string[];
}

const BlockDevis = ({ pointsOk, alertes }: BlockDevisProps) => {
  const info = extractDevisData(pointsOk, alertes);

  // Check if we have any meaningful data or devis-related info in alerts
  const hasData = info.prixTotal || info.comparaisonMarche || info.detailMoDoeuvre !== null ||
                  info.detailMateriaux !== null || info.tvaApplicable || info.acomptePourcentage !== null ||
                  info.hasDevisRelatedInfo || info.explanations.length > 0;

  if (!hasData) return null;

  return (
    <div className={`border-2 rounded-2xl p-6 mb-6 ${getScoreBgClass(info.score)}`}>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
          <Receipt className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-foreground text-xl">Devis & Cohérence financière</h2>
            {getScoreIcon(info.score, "h-6 w-6")}
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Vérifier la clarté et la cohérence du devis par rapport au marché.
          </p>

          {/* Market Comparison Gauge */}
          {info.ecart && (
            <div className="mb-4">
              <MarketComparisonGauge
                ecart={info.ecart}
                prixDevis={info.prixTotalNumber}
                prixMinMarche={info.prixMinMarche}
                prixMaxMarche={info.prixMaxMarche}
              />
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Prix total */}
            {info.prixTotal && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Prix total TTC</p>
                <p className="font-medium text-foreground text-lg">{info.prixTotal}</p>
              </div>
            )}

            {/* Détail main d'oeuvre */}
            {info.detailMoDoeuvre !== null && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Détail main d'œuvre</p>
                <p className={`font-medium ${info.detailMoDoeuvre ? "text-score-green" : "text-score-orange"}`}>
                  {info.detailMoDoeuvre ? "Détaillé" : "Non détaillé"}
                </p>
              </div>
            )}

            {/* Détail matériaux */}
            {info.detailMateriaux !== null && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Détail matériaux</p>
                <p className={`font-medium ${info.detailMateriaux ? "text-score-green" : "text-score-orange"}`}>
                  {info.detailMateriaux ? "Détaillé" : "Non détaillé"}
                </p>
              </div>
            )}

            {/* TVA */}
            {info.tvaApplicable && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">TVA applicable</p>
                <p className="font-medium text-foreground">{info.tvaApplicable}</p>
              </div>
            )}

            {/* Acompte */}
            {info.acomptePourcentage !== null && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Acompte demandé</p>
                <p className={`font-medium ${
                  info.acomptePourcentage <= 30 ? "text-score-green" :
                  info.acomptePourcentage <= 50 ? "text-score-orange" : "text-score-red"
                }`}>
                  {info.acomptePourcentage}%
                </p>
              </div>
            )}
          </div>

          {/* Explanations for ORANGE/ROUGE - factual */}
          {info.explanations.length > 0 && (info.score === "ORANGE" || info.score === "ROUGE") && (
            <PedagogicExplanation type="info" title="Observations factuelles" className="mb-4">
              {info.explanations.map((exp, idx) => (
                <p key={idx} className="mb-1">{exp}</p>
              ))}
              <p className="text-xs text-muted-foreground/80 mt-2 italic">
                Ces éléments sont des observations extraites du devis transmis.
              </p>
            </PedagogicExplanation>
          )}

          {/* Score explanation - factual */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className={`text-sm font-medium ${getScoreTextClass(info.score)}`}>
              {info.score === "VERT" && "✓ Le devis présente une cohérence financière satisfaisante."}
              {info.score === "ORANGE" && "ℹ️ Certaines informations n'ont pas été trouvées dans le devis transmis."}
              {info.score === "ROUGE" && "⚠️ Des écarts significatifs ont été détectés."}
            </p>
            {info.score === "ORANGE" && (
              <p className="text-xs text-muted-foreground mt-2">
                Aucun élément critique n'a été détecté. Vous pouvez compléter les informations manquantes directement.
              </p>
            )}
          </div>

          {/* Disclaimer - harmonized */}
          <div className="mt-3 p-2 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground/70 italic">
              ℹ️ Analyse automatisée. Les comparaisons de prix sont indicatives et ajustées selon la zone géographique.
              L'objectif est d'aider à la compréhension et à la vigilance, pas de fixer un "bon prix".
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockDevis;
