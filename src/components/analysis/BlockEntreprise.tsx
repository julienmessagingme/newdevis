import { useState } from "react";
import { Star, Building2, Globe, ChevronDown, TrendingUp, AlertCircle } from "lucide-react";
import { getScoreIcon, getScoreBgClass, getScoreTextClass } from "@/lib/scoreUtils";
import { extractEntrepriseData, computeFinancialHealth } from "@/lib/entrepriseUtils";
import type { FinancialRatios } from "@/lib/entrepriseUtils";
import InfoTooltip from "./InfoTooltip";
import PedagogicExplanation from "./PedagogicExplanation";
import type { CompanyDisplayData } from "@/components/pages/AnalysisResult";

interface BlockEntrepriseProps {
  pointsOk: string[];
  alertes: string[];
  companyData?: CompanyDisplayData | null;
  defaultOpen?: boolean;
}

// ── Formatage montants ──────────────────────────────────────
const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);

const formatCurrencyCompact = (amount: number): string => {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−\u202f" : "+\u202f";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(".", ",")} M€`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)} k€`;
  return `${sign}${abs.toFixed(0)} €`;
};

// ── Carte ratio compacte ────────────────────────────────────
const RatioCard = ({
  label,
  value,
  colorClass,
  hint,
}: {
  label: string;
  value: string;
  colorClass: string;
  hint?: string;
}) => (
  <div className="p-2 bg-background/40 rounded-lg" title={hint}>
    <p className="text-xs text-muted-foreground leading-tight mb-0.5">{label}</p>
    <p className={`text-sm font-semibold ${colorClass}`}>{value}</p>
  </div>
);

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
  const [financesOpen, setFinancesOpen] = useState(false);
  const info = extractEntrepriseData(pointsOk, alertes);

  // Calcul santé financière à partir des données brutes (verified.finances[])
  const finances: FinancialRatios[] = companyData?.finances ?? [];
  const financialHealth = computeFinancialHealth(
    finances,
    companyData?.procedure_collective ?? null,
    companyData?.anciennete_annees ?? null,
    companyData?.entreprise_radiee ?? null
  );

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

          {/* ── Santé financière (comptes) ─────────────────── */}
          <div className="mb-4">
            {/* Ligne compacte cliquable */}
            <button
              onClick={() => setFinancesOpen(!financesOpen)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-background/30 rounded-xl border border-border/20 hover:bg-background/50 transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <TrendingUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium text-foreground">Santé financière (comptes)</span>
                {financialHealth.dernier_exercice_year && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    — Dernier exercice&nbsp;: {financialHealth.dernier_exercice_year}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {financialHealth.status === "NO_DATA" ? (
                  <span className="text-xs text-muted-foreground">Non disponible</span>
                ) : (
                  <>
                    {getScoreIcon(financialHealth.status, "h-4 w-4")}
                    <span className={`text-xs font-medium ${getScoreTextClass(financialHealth.status)}`}>
                      {financialHealth.status === "VERT" && "Indicateurs positifs"}
                      {financialHealth.status === "ORANGE" && "Signal à vérifier"}
                      {financialHealth.status === "ROUGE" && "Signal critique"}
                    </span>
                  </>
                )}
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ml-1 ${financesOpen ? "rotate-180" : ""}`}
                />
              </div>
            </button>

            {/* Accordion Détails financiers */}
            {financesOpen && (
              <div className="mt-1.5 px-4 py-4 bg-background/20 rounded-xl border border-border/20 space-y-4">

                {/* Avertissement données non récentes */}
                {financialHealth.isStale && (
                  <div className="flex items-start gap-2 p-3 bg-score-orange-bg rounded-lg border border-score-orange/30">
                    <AlertCircle className="h-4 w-4 text-score-orange flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-score-orange">
                      Données non récentes (dernier exercice&nbsp;: {financialHealth.dernier_exercice_year})
                      — les indicateurs ci-dessous sont à interpréter avec prudence.
                    </p>
                  </div>
                )}

                {/* Tableau évolution sur 3 exercices */}
                {financialHealth.exercises.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                      Évolution sur {financialHealth.exercises.length} exercice{financialHealth.exercises.length > 1 ? "s" : ""}
                    </p>
                    <div className="overflow-x-auto -mx-1">
                      <table className="w-full text-sm border-collapse min-w-[280px]">
                        <thead>
                          <tr className="border-b border-border/30">
                            <th className="text-left py-1.5 px-2 text-xs text-muted-foreground font-medium">Exercice</th>
                            <th className="text-right py-1.5 px-2 text-xs text-muted-foreground font-medium">Chiffre d'affaires</th>
                            <th className="text-right py-1.5 px-2 text-xs text-muted-foreground font-medium">Résultat net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {financialHealth.exercises.map((ex, idx) => (
                            <tr
                              key={idx}
                              className={`border-b border-border/20 ${idx === 0 ? "font-medium" : "opacity-80"}`}
                            >
                              <td className="py-1.5 px-2 text-foreground">
                                {ex.date_cloture ? ex.date_cloture.substring(0, 4) : "—"}
                                {idx === 0 && (
                                  <span className="ml-1 text-xs text-muted-foreground font-normal">(dernier)</span>
                                )}
                              </td>
                              <td className="py-1.5 px-2 text-right text-foreground">
                                {ex.chiffre_affaires !== null ? formatCurrency(ex.chiffre_affaires) : "—"}
                              </td>
                              <td className={`py-1.5 px-2 text-right font-medium ${
                                ex.resultat_net === null
                                  ? "text-muted-foreground"
                                  : ex.resultat_net >= 0
                                  ? "text-score-green"
                                  : "text-score-red"
                              }`}>
                                {ex.resultat_net !== null ? formatCurrencyCompact(ex.resultat_net) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aucun compte publié — micro-entreprise, auto-entrepreneur ou bilan non déposé.
                  </p>
                )}

                {/* Ratios de la dernière année */}
                {financialHealth.latestRatios && (
                  (() => {
                    const r = financialHealth.latestRatios!;
                    const hasRatios =
                      r.taux_endettement !== null ||
                      r.ratio_liquidite !== null ||
                      r.autonomie_financiere !== null ||
                      r.capacite_remboursement !== null ||
                      r.marge_ebe !== null;

                    return hasRatios ? (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Indicateurs {financialHealth.dernier_exercice_year}
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {r.taux_endettement !== null && (
                            <RatioCard
                              label="Taux d'endettement"
                              value={`${r.taux_endettement.toFixed(0)} %`}
                              colorClass={
                                r.taux_endettement > 200
                                  ? "text-score-red"
                                  : r.taux_endettement > 100
                                  ? "text-score-orange"
                                  : "text-score-green"
                              }
                              hint="Dettes totales / Capitaux propres. Un taux > 100 % signale un endettement supérieur aux fonds propres."
                            />
                          )}
                          {r.ratio_liquidite !== null && (
                            <RatioCard
                              label="Ratio de liquidité"
                              value={`${r.ratio_liquidite.toFixed(0)} %`}
                              colorClass={r.ratio_liquidite < 80 ? "text-score-orange" : "text-score-green"}
                              hint="Actif circulant / Passif à court terme. Un ratio < 80 % peut signaler des tensions de trésorerie."
                            />
                          )}
                          {r.autonomie_financiere !== null && (
                            <RatioCard
                              label="Autonomie financière"
                              value={`${r.autonomie_financiere.toFixed(0)} %`}
                              colorClass={r.autonomie_financiere > 30 ? "text-score-green" : "text-score-orange"}
                              hint="Capitaux propres / Total bilan. Un taux > 30 % indique une bonne indépendance financière."
                            />
                          )}
                          {r.capacite_remboursement !== null && (
                            <RatioCard
                              label="Capacité de remboursement"
                              value={`${r.capacite_remboursement.toFixed(1)} ×`}
                              colorClass={r.capacite_remboursement > 4 ? "text-score-orange" : "text-score-green"}
                              hint="Dettes financières / EBE. Un ratio > 4 peut indiquer une dette élevée par rapport à la capacité bénéficiaire."
                            />
                          )}
                          {r.marge_ebe !== null && (
                            <RatioCard
                              label="Marge EBE"
                              value={`${r.marge_ebe.toFixed(1)} %`}
                              colorClass={r.marge_ebe > 0 ? "text-score-green" : "text-score-red"}
                              hint="EBE / Chiffre d'affaires. Mesure la rentabilité d'exploitation avant charges financières et amortissements."
                            />
                          )}
                        </div>
                      </div>
                    ) : null;
                  })()
                )}

                {/* Signaux ORANGE détaillés */}
                {financialHealth.orangeSignals.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-border/20">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Signaux identifiés</p>
                    {financialHealth.orangeSignals.map((signal, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-score-orange">
                        <span className="flex-shrink-0 mt-px">•</span>
                        <span>
                          {signal === "stale" &&
                            "Données non récentes — les comptes disponibles datent de plus de 2 ans. Indicateur à interpréter avec prudence."}
                          {signal === "recent" &&
                            "Entreprise récente — l'historique financier est limité, ce qui rend l'évaluation plus incertaine."}
                          {signal === "ca_decline_2y" &&
                            "Chiffre d'affaires en baisse sur 2 exercices consécutifs — signal à surveiller, sans conclure à une fragilité."}
                          {signal === "resultat_turned_negative" &&
                            "Résultat net passé de positif à négatif sur le dernier exercice — signal à vérifier dans son contexte."}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Disclaimer */}
                <p className="text-xs text-muted-foreground/60 italic border-t border-border/20 pt-3">
                  Analyse automatisée à partir des données financières publiques (INPI / BCE via data.economie.gouv.fr, jusqu'à {financialHealth.exercises.length || 0} exercice{financialHealth.exercises.length !== 1 ? "s" : ""} disponible{financialHealth.exercises.length !== 1 ? "s" : ""}).
                  Ces indicateurs sont fournis à titre informatif et ne constituent pas un jugement sur la santé financière de l'entreprise.
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
