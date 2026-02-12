import { Star, Building2, Globe } from "lucide-react";
import { getScoreIcon, getScoreBgClass, getScoreTextClass } from "@/lib/scoreUtils";
import { extractEntrepriseData } from "@/lib/entrepriseUtils";
import InfoTooltip from "./InfoTooltip";
import PedagogicExplanation from "./PedagogicExplanation";

interface BlockEntrepriseProps {
  pointsOk: string[];
  alertes: string[];
}

const BlockEntreprise = ({ pointsOk, alertes }: BlockEntrepriseProps) => {
  const info = extractEntrepriseData(pointsOk, alertes);

  // Check if we have any meaningful data
  const hasData = info.siren_siret || info.anciennete || info.bilansDisponibles !== null ||
                  info.capitauxPropres || info.procedureCollective !== null || info.reputation;

  if (!hasData) return null;

  return (
    <div className={`border-2 rounded-2xl p-6 mb-6 ${getScoreBgClass(info.score)}`}>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-foreground text-xl">Entreprise & Fiabilité</h2>
            {getScoreIcon(info.score, "h-6 w-6")}
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Identifier à qui vous avez affaire.
          </p>

          {/* Info grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* SIREN/SIRET */}
            {info.siren_siret && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Immatriculation</p>
                <p className="font-medium text-foreground">{info.siren_siret}</p>
              </div>
            )}

            {/* Ancienneté */}
            {info.anciennete && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Ancienneté</p>
                <p className="font-medium text-foreground">{info.anciennete}</p>
              </div>
            )}

            {/* Bilans */}
            {info.bilansDisponibles !== null && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Bilans</p>
                <p className={`font-medium ${info.bilansDisponibles ? "text-score-green" : "text-score-orange"}`}>
                  {info.bilansDisponibles ? "Disponibles" : "Non disponibles"}
                </p>
              </div>
            )}

            {/* Capitaux propres */}
            {info.capitauxPropres && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Capitaux propres</p>
                <p className="font-medium text-foreground">{info.capitauxPropres}</p>
              </div>
            )}

            {/* Procédure collective */}
            {info.procedureCollective !== null && (
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Procédure collective</p>
                <p className={`font-medium ${info.procedureCollective ? "text-score-red" : "text-score-green"}`}>
                  {info.procedureCollective ? "En cours" : "Aucune"}
                </p>
              </div>
            )}
          </div>

          {/* Réputation en ligne - ALWAYS VISIBLE */}
          <div className={`p-4 rounded-lg border ${getScoreBgClass(info.reputation?.score || "ORANGE")}`}>
            <div className="flex items-center gap-3 mb-2">
              <Globe className="h-5 w-5 text-primary" />
              <span className="font-medium text-foreground">Réputation en ligne (Google)</span>
              <InfoTooltip
                title="Pourquoi la note Google est prise en compte ?"
                content="Les avis clients permettent d'identifier des tendances générales (ponctualité, relation client, SAV, communication), sans jamais constituer une preuve à eux seuls. Une note inférieure au seuil de confort invite simplement à consulter le détail des avis pour se faire sa propre opinion."
              />
              {getScoreIcon(info.reputation?.score || "ORANGE")}
            </div>

            {/* Case A: Rating found */}
            {info.reputation?.status === "found" && info.reputation.rating !== undefined && info.reputation.reviews_count !== undefined ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${
                          star <= Math.round(info.reputation!.rating!)
                            ? "text-yellow-400 fill-yellow-400"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-bold text-foreground">
                    {info.reputation.rating.toFixed(1).replace('.', ',')}/5
                  </span>
                  <span className="text-muted-foreground text-sm">
                    ({info.reputation.reviews_count} avis)
                  </span>
                  <span className="text-xs text-muted-foreground/70 ml-2">
                    Source: Google
                  </span>
                </div>
                {/* Explication si note < 4/5 - factual */}
                {info.reputation.rating < 4.0 && (
                  <PedagogicExplanation type="info" className="mt-3">
                    <p className="mb-2">
                      La note moyenne observée est de {info.reputation.rating.toFixed(1).replace('.', ',')}/5.
                    </p>
                    <p className="mb-2">
                      <strong>Observation :</strong> Cette note est un indicateur parmi d'autres. Elle reflète les retours publics disponibles sur Google.
                    </p>
                    <p className="mb-2">
                      <strong>Détail :</strong> Le contenu des avis, leur ancienneté et leur récurrence donnent plus de contexte que la note seule.
                    </p>
                    <p className="text-xs text-muted-foreground/80 italic">
                      La réputation en ligne est utilisée comme un indicateur complémentaire parmi d'autres critères objectifs.
                    </p>
                  </PedagogicExplanation>
                )}
                {/* Message positif si note >= 4/5 */}
                {info.reputation.rating >= 4.0 && (
                  <p className="text-sm text-score-green mt-2">
                    ✓ La note Google est au-dessus du seuil de confort habituellement observé.
                  </p>
                )}
              </div>
            ) : info.reputation?.status === "uncertain" ? (
              /* Case B: Uncertain match */
              <PedagogicExplanation type="info">
                <p className="font-medium text-foreground mb-1">
                  Note Google : non affichée (correspondance à confirmer)
                </p>
                <p>
                  La recherche Google a été effectuée mais l'établissement trouvé ne correspond peut-être pas exactement à cette entreprise.
                  Ce critère n'est pas pris en compte dans le score.
                </p>
              </PedagogicExplanation>
            ) : (
              /* Case C: Not found or not searched */
              <PedagogicExplanation type="info">
                <p className="font-medium text-foreground mb-1">
                  Note Google : information non exploitée automatiquement
                </p>
                <p>
                  {info.reputation?.status === "not_found"
                    ? "La recherche d'avis a été effectuée mais aucun résultat exploitable n'a été trouvé pour cet établissement. Cela n'indique pas un problème en soi — de nombreux artisans fiables n'ont pas de présence en ligne."
                    : "La recherche d'avis a été effectuée. L'absence de données en ligne n'affecte pas le score global."}
                </p>
              </PedagogicExplanation>
            )}
          </div>

          {/* Score explanation with pedagogic message */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className={`text-sm font-medium ${getScoreTextClass(info.score)}`}>
              {info.score === "VERT" && "✓ Entreprise avec des indicateurs de fiabilité positifs."}
              {info.score === "ORANGE" && "ℹ️ Certains indicateurs invitent à une vérification complémentaire."}
              {info.score === "ROUGE" && "⚠️ Certains indicateurs nécessitent une attention particulière."}
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
              ℹ️ Analyse automatisée à partir de sources publiques (Infogreffe, BODACC, Google).
              Ces informations constituent une aide à la décision et ne portent aucun jugement sur l'artisan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockEntreprise;
