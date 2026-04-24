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

  // Retard de publication des comptes — calculé directement depuis les données brutes
  // pour fonctionner même sur les analyses existantes (avant le fix render.ts).
  const retardAns = financialHealth.dernier_exercice_year
    ? new Date().getFullYear() - parseInt(financialHealth.dernier_exercice_year, 10)
    : 0;
  const isFinanciallyStaleRouge = retardAns >= 6 && finances.length > 0;

  // Score effectif du bloc : ROUGE si non-dépôt des comptes >= 6 ans,
  // sinon score calculé à partir des alertes (info.score).
  const effectiveScore = isFinanciallyStaleRouge ? "ROUGE" as const : info.score;

  // Statut affiché dans la sous-section "Santé financière"
  const financialDisplayStatus = isFinanciallyStaleRouge ? "ROUGE" as const : financialHealth.status;

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
    <div className={`border-2 rounded-2xl p-3 sm:p-6 mb-6 ${getScoreBgClass(effectiveScore)}`}>
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="p-2 sm:p-3 bg-background/50 rounded-xl flex-shrink-0">
          <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center gap-3 text-left cursor-pointer"
          >
            <h2 className="font-bold text-foreground text-xl">Entreprise & Fiabilité</h2>
            {getScoreIcon(effectiveScore, "h-6 w-6")}
            <ChevronDown className={`h-5 w-5 ml-auto text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} />
          </button>

          {isOpen && (<>
          {/* Company identification card */}
          <div className="p-3 sm:p-4 bg-background/40 rounded-xl border border-border/30 mb-4">
            <div className="mb-3">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                {nomEntreprise && (
                  <p className="font-semibold text-foreground text-base sm:text-lg leading-tight">{nomEntreprise}</p>
                )}
                {isImmatriculee === true && lookupStatus === "ok" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-green-700 bg-green-500/10 whitespace-nowrap">
                    Entreprise active
                  </span>
                )}
                {isImmatriculee === false && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-red-700 bg-red-500/10 whitespace-nowrap">
                    Radiée
                  </span>
                )}
              </div>
              {siret && (
                <p className="text-xs sm:text-sm text-muted-foreground font-mono">
                  SIRET&nbsp;: {formatSiret(siret)}
                </p>
              )}
              {!siret && (
                <p className="text-xs sm:text-sm text-amber-600">
                  SIRET non détecté sur le devis
                </p>
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
                {ancienneteAnnees !== null && ancienneteAnnees >= 0 && (
                  <div className="text-muted-foreground">
                    <span className="text-xs uppercase tracking-wide block mb-0.5">Ancienneté</span>
                    {ancienneteAnnees < 3 ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
                        <span>⚠️</span>
                        <span>
                          {ancienneteAnnees < 1
                            ? "Moins d'un an d'existence"
                            : `${ancienneteAnnees} an${ancienneteAnnees > 1 ? "s" : ""} d'existence`}
                          {dateCreation && <span className="text-amber-600/80 text-xs ml-1">(créée le {new Date(dateCreation).toLocaleDateString("fr-FR")})</span>}
                        </span>
                      </span>
                    ) : (
                      <span className="text-foreground">
                        {ancienneteAnnees} an{ancienneteAnnees > 1 ? "s" : ""} d'existence
                        {dateCreation && <span className="text-muted-foreground text-xs ml-1">(créée le {new Date(dateCreation).toLocaleDateString("fr-FR")})</span>}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Alerte entreprise jeune — affiché même si le bloc global est orange ou vert */}
            {ancienneteAnnees !== null && ancienneteAnnees < 3 && isImmatriculee === true && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                <span className="text-amber-500 text-base flex-shrink-0 mt-px">⚠️</span>
                <div className="text-xs text-amber-800 leading-relaxed">
                  <span className="font-semibold block mb-0.5">
                    Entreprise de moins de 3 ans
                  </span>
                  Sans historique financier vérifiable et avec peu ou pas d'avis clients, il est impossible d'évaluer la solidité de cette entreprise.
                  Demandez des références de chantiers récents et vérifiez ses assurances (décennale + RC Pro) avant de signer.
                </div>
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
              className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 bg-background/30 rounded-xl border border-border/20 hover:bg-background/50 transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <TrendingUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium text-foreground">Santé financière</span>
                {financialHealth.dernier_exercice_year && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    — {financialHealth.dernier_exercice_year}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {financialDisplayStatus === "NO_DATA" ? (
                  <span className="text-xs text-muted-foreground">Non disponible</span>
                ) : (
                  <>
                    {getScoreIcon(financialDisplayStatus, "h-4 w-4")}
                    <span className={`text-xs font-medium ${getScoreTextClass(financialDisplayStatus)}`}>
                      {financialDisplayStatus === "VERT" && "Positif"}
                      {financialDisplayStatus === "ORANGE" && "À vérifier"}
                      {financialDisplayStatus === "ROUGE" && "Critique"}
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

                {/* Signaux ROUGE critiques */}
                {financialHealth.rougeSignals.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-border/20">
                    <p className="text-xs font-medium text-score-red mb-1.5">Signaux critiques</p>
                    {financialHealth.rougeSignals.map((signal, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-score-red">
                        <span className="flex-shrink-0 mt-px">⚠️</span>
                        <span>
                          {signal === "endettement_critique" &&
                            `Taux d'endettement anormalement élevé (${financialHealth.latestRatios?.taux_endettement?.toFixed(0)} %) — les dettes représentent plus de 2× les capitaux propres. Ce niveau peut fragiliser la continuité d'exploitation.`}
                          {signal === "capitaux_propres_negatifs" &&
                            "Autonomie financière négative — les capitaux propres sont négatifs, ce qui signifie que les dettes excèdent l'actif total de l'entreprise."}
                          {signal === "procedure_collective" &&
                            "Entreprise en procédure collective (redressement ou liquidation judiciaire)."}
                          {signal === "entreprise_radiee" &&
                            "Entreprise radiée du registre — elle n'est plus légalement active."}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Signaux ORANGE détaillés */}
                {financialHealth.orangeSignals.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-border/20">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Signaux à surveiller</p>
                    {financialHealth.orangeSignals.map((signal, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-score-orange">
                        <span className="flex-shrink-0 mt-px">•</span>
                        <span>
                          {signal === "endettement_eleve" &&
                            `Taux d'endettement élevé (${financialHealth.latestRatios?.taux_endettement?.toFixed(0)} %) — les dettes dépassent les capitaux propres. Signal à surveiller.`}
                          {signal === "liquidite_faible" &&
                            `Ratio de liquidité faible (${financialHealth.latestRatios?.ratio_liquidite?.toFixed(0)} %) — l'entreprise peut avoir des tensions de trésorerie à court terme.`}
                          {signal === "stale" &&
                            "Données non récentes — les comptes disponibles datent de plus de 2 ans. Indicateur à interpréter avec prudence."}
                          {signal === "recent" &&
                            "Entreprise de moins de 3 ans — pas d'historique financier vérifiable, peu ou pas d'avis clients. Impossible d'évaluer sa solidité sans références."}
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

          {/* ── Qualifications RGE ─────────────────────────────── */}
          {companyData?.rge_pertinent && (
            <div className="mb-4 p-3 sm:p-4 bg-background/40 rounded-xl border border-border/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-foreground">Qualifications RGE</span>
                <InfoTooltip
                  title="Qu'est-ce que la qualification RGE ?"
                  content="Le label RGE (Reconnu Garant de l'Environnement) est attribué par l'État aux artisans qualifiés pour les travaux d'économies d'énergie. Il conditionne l'accès aux aides MaPrimeRénov' et CEE pour le client."
                />
              </div>

              {companyData.rge_trouve && companyData.rge_qualifications.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {companyData.rge_qualifications.map((q, i) => (
                    <div key={i} className="inline-flex flex-col px-2.5 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <span className="text-xs font-medium text-green-700">{q.nom}</span>
                      {q.date_fin && (
                        <span className="text-xs text-muted-foreground">
                          Valide jusqu'au {new Date(q.date_fin).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucune qualification RGE trouvée pour ce SIRET dans la base ADEME.
                  <span className="block text-xs mt-0.5 text-muted-foreground/70">
                    Cela ne remet pas en cause la compétence de l'artisan — tous les corps de métier ne sont pas concernés par cette certification.
                  </span>
                </p>
              )}
            </div>
          )}

          {/* ── Certification QUALIBAT ───────────────────────── */}
          {companyData?.qualibat_mentionne && (
            <div className="mb-4 p-3 sm:p-4 bg-background/40 rounded-xl border border-border/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-foreground">Certification QUALIBAT</span>
                <InfoTooltip
                  title="Qu'est-ce que QUALIBAT ?"
                  content="QUALIBAT est l'organisme de qualification et de certification des entreprises du bâtiment. La certification atteste des compétences techniques, de la capacité financière et des références de l'entreprise pour une activité donnée."
                />
              </div>

              {companyData.qualibat_certifie === true ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded-lg text-xs font-medium text-green-700">
                      ✓ Certification vérifiée
                    </span>
                  </div>
                  {companyData.qualibat_qualifications?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {companyData.qualibat_qualifications.map((q: any, i: number) => (
                        <div key={i} className="inline-flex flex-col px-2.5 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                          <span className="text-xs font-medium text-green-700">{q.code} — {q.libelle}</span>
                          {q.date_fin && (
                            <span className="text-xs text-muted-foreground">
                              Valide jusqu'au {new Date(q.date_fin).toLocaleDateString("fr-FR")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  QUALIBAT mentionné sur le devis — vérifiez manuellement avec le SIRET de l'entreprise :{" "}
                  <a href="https://www.qualibat.com" target="_blank" rel="noopener noreferrer" className="underline text-primary text-xs">
                    qualibat.com →
                  </a>
                </p>
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
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
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
                  <span className="text-xs text-muted-foreground/70">
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
                {/* Avertissement si peu d'avis au regard de l'ancienneté */}
                {ancienneteAnnees !== null && ancienneteAnnees >= 5 && (() => {
                  const seuilAvis = Math.max(3, Math.min(10, Math.floor(ancienneteAnnees / 3)));
                  return info.reputation.reviews_count < seuilAvis ? (
                    <p className="text-sm text-score-orange mt-2">
                      ⚠️ Seulement {info.reputation.reviews_count} avis Google pour une entreprise de {ancienneteAnnees} ans — note statistiquement peu fiable. Demandez des références de chantiers récents.
                    </p>
                  ) : null;
                })()}
                {/* Message positif si note >= 4/5 ET suffisamment d'avis */}
                {info.reputation.rating >= 4.0 && (ancienneteAnnees === null || ancienneteAnnees < 5 || info.reputation.reviews_count >= Math.max(3, Math.min(10, Math.floor((ancienneteAnnees ?? 0) / 3)))) && (
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
            <p className={`text-sm font-medium ${getScoreTextClass(effectiveScore)}`}>
              {effectiveScore === "VERT" && "✓ Entreprise avec des indicateurs de fiabilité positifs."}
              {effectiveScore === "ORANGE" && "ℹ️ Certains indicateurs invitent à une vérification complémentaire."}
              {effectiveScore === "ROUGE" && (
                isFinanciallyStaleRouge
                  ? `⚠️ Comptes annuels non déposés depuis ${retardAns} ans (dernier exercice connu\u00a0: ${financialHealth.dernier_exercice_year})\u00a0— une société commerciale a l'obligation légale de déposer ses comptes chaque année. Cette absence prolongée peut masquer une situation financière préoccupante.`
                  : financialHealth.rougeSignals.includes("endettement_critique")
                  ? `⚠️ Taux d'endettement critique (${financialHealth.latestRatios?.taux_endettement?.toFixed(0)}\u00a0%) — malgré un résultat net positif, ce niveau d'endettement représente un risque pour la pérennité de l'entreprise. Vérifiez les alertes financières avant de signer.`
                  : financialHealth.rougeSignals.includes("capitaux_propres_negatifs")
                  ? "⚠️ Capitaux propres négatifs — la situation bilancielle de l'entreprise est structurellement fragile. Vérifiez les alertes ci-dessus avant de signer."
                  : "⚠️ Des éléments critiques ont été détectés — vérifiez les alertes ci-dessus avant de signer."
              )}
            </p>
            {effectiveScore === "ORANGE" && (
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
