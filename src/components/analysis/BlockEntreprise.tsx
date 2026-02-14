import { useState } from "react";
import { Star, Building2, Globe, ChevronDown } from "lucide-react";
import { getScoreIcon, getScoreBgClass, getScoreTextClass } from "@/lib/scoreUtils";
import { extractEntrepriseData } from "@/lib/entrepriseUtils";
import InfoTooltip from "./InfoTooltip";
import PedagogicExplanation from "./PedagogicExplanation";
import type { CompanyDisplayData } from "@/components/pages/AnalysisResult";

interface BlockEntrepriseProps {
  pointsOk: string[];
  alertes: string[];
  companyData?: CompanyDisplayData | null;
  defaultOpen?: boolean;
}

const formatSiret = (siret: string): string => {
  const clean = siret.replace(/\s/g, "");
  if (clean.length === 14) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6, 9)} ${clean.slice(9)}`;
  }
  if (clean.length === 9) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  return siret;
};

const BlockEntreprise = ({ pointsOk, alertes, companyData, defaultOpen = true }: BlockEntrepriseProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const info = extractEntrepriseData(pointsOk, alertes);

  // Check if we have any meaningful data
  const hasData = info.siren_siret || info.anciennete || info.financesDisponibles !== null ||
                  info.chiffreAffaires || info.procedureCollective !== null || info.reputation || companyData;

  if (!hasData) return null;

  // Build structured company info — prefer companyData (from raw_text JSON) over parsed strings
  const siret = companyData?.siret || info.siren_siret || null;
  const nomEntreprise = companyData?.nom_officiel || companyData?.nom_devis || null;
  const adresse = companyData?.adresse_officielle || null;
  const ville = companyData?.ville_officielle || null;
  const dateCreation = companyData?.date_creation || null;
  const ancienneteAnnees = companyData?.anciennete_annees ?? null;
  const isImmatriculee = companyData?.entreprise_immatriculee ?? null;
  const lookupStatus = companyData?.lookup_status || null;

  return (
    <div className={`border-2 rounded-2xl p-6 mb-6 ${getScoreBgClass(info.score)}`}>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center gap-3 text-left cursor-pointer"
          >
            <h2 className="font-bold text-foreground text-xl">Entreprise & Fiabilité</h2>
            {getScoreIcon(info.score, "h-6 w-6")}
            <ChevronDown className={`h-5 w-5 ml-auto text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} />
          </button>

          {isOpen && (<>
          {/* Company identification card */}
          <div className="p-4 bg-background/40 rounded-xl border border-border/30 mb-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                {nomEntreprise && (
                  <p className="font-semibold text-foreground text-lg leading-tight truncate">{nomEntreprise}</p>
                )}
                {siret && (
                  <p className="text-sm text-muted-foreground mt-1 font-mono">
                    SIRET : {formatSiret(siret)}
                  </p>
                )}
                {!siret && (
                  <p className="text-sm text-amber-600 mt-1">
                    SIRET non détecté sur le devis
                  </p>
                )}
              </div>
              {isImmatriculee === true && lookupStatus === "ok" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-green-700 bg-green-500/10 whitespace-nowrap flex-shrink-0">
                  Entreprise active
                </span>
              )}
              {isImmatriculee === false && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-red-700 bg-red-500/10 whitespace-nowrap flex-shrink-0">
                  Radiée
                </span>
              )}
            </div>

            {/* Details grid */}
            {(adresse || ville || dateCreation || ancienneteAnnees !== null) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {(adresse || ville) && (
                  <div className="text-muted-foreground">
                    <span className="text-xs uppercase tracking-wide block mb-0.5">Adresse officielle</span>
                    <span className="text-foreground">{[adresse, ville].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                {ancienneteAnnees !== null && ancienneteAnnees > 0 && (
                  <div className="text-muted-foreground">
                    <span className="text-xs uppercase tracking-wide block mb-0.5">Ancienneté</span>
                    <span className="text-foreground">
                      {ancienneteAnnees} an{ancienneteAnnees > 1 ? "s" : ""} d'existence
                      {dateCreation && <span className="text-muted-foreground text-xs ml-1">(créée le {new Date(dateCreation).toLocaleDateString("fr-FR")})</span>}
                    </span>
                  </div>
                )}
              </div>
            )}

            {lookupStatus === "not_found" && siret && (
              <p className="text-xs text-amber-600 mt-2">
                SIRET non trouvé dans les registres publics. Vous pouvez vérifier sur societe.com ou infogreffe.fr.
              </p>
            )}
            {lookupStatus === "no_siret" && (
              <p className="text-xs text-muted-foreground mt-2">
                Demandez le SIRET à l'artisan pour une vérification complète.
              </p>
            )}
          </div>

          {/* Financial indicators grid — only shown when data is available */}
          {(info.chiffreAffaires || info.resultatNet || info.autonomieFinanciere || info.tauxEndettement || info.ratioLiquidite || info.procedureCollective !== null) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              {info.chiffreAffaires && (
                <div className="p-3 bg-background/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Chiffre d'affaires</p>
                  <p className="font-medium text-foreground">{info.chiffreAffaires}</p>
                </div>
              )}

              {info.resultatNet && (
                <div className="p-3 bg-background/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Résultat net</p>
                  <p className={`font-medium ${info.resultatNet === "Négatif" ? "text-score-red" : "text-score-green"}`}>
                    {info.resultatNet}
                  </p>
                </div>
              )}

              {info.autonomieFinanciere && (
                <div className="p-3 bg-background/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Autonomie financière</p>
                  <p className="font-medium text-score-green">{info.autonomieFinanciere}</p>
                </div>
              )}

              {info.tauxEndettement && (
                <div className="p-3 bg-background/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Taux d'endettement</p>
                  <p className={`font-medium ${parseInt(info.tauxEndettement) > 200 ? "text-score-red" : parseInt(info.tauxEndettement) > 100 ? "text-score-orange" : "text-score-green"}`}>
                    {info.tauxEndettement}
                  </p>
                </div>
              )}

              {info.ratioLiquidite && (
                <div className="p-3 bg-background/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Ratio de liquidité</p>
                  <p className={`font-medium ${parseInt(info.ratioLiquidite) < 80 ? "text-score-orange" : "text-score-green"}`}>
                    {info.ratioLiquidite}
                  </p>
                </div>
              )}

              {info.procedureCollective !== null && (
                <div className="p-3 bg-background/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Procédure collective</p>
                  <p className={`font-medium ${info.procedureCollective ? "text-score-red" : "text-score-green"}`}>
                    {info.procedureCollective ? "En cours" : "Aucune"}
                  </p>
                </div>
              )}
            </div>
          )}

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
              ℹ️ Analyse automatisée à partir de sources publiques (registres officiels, Google).
              Ces informations constituent une aide à la décision et ne portent aucun jugement sur l'artisan.
            </p>
          </div>
          </>)}
        </div>
      </div>
    </div>
  );
};

export default BlockEntreprise;
