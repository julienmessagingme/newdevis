import { useState } from "react";
import { ShieldCheck, CreditCard, FileCheck, ChevronDown } from "lucide-react";
import { getScoreIcon, getScoreBgClass, getScoreTextClass } from "@/lib/scoreUtils";
import {
  extractSecuriteData,
  getComparisonStatusText,
  getComparisonStatusClass,
  type AttestationComparison,
} from "@/lib/securiteUtils";
import AttestationUpload from "@/components/AttestationUpload";
import PedagogicExplanation from "./PedagogicExplanation";

interface BlockSecuriteProps {
  pointsOk: string[];
  alertes: string[];
  analysisId: string;
  assuranceSource?: string;
  assuranceLevel2Score?: string | null;
  attestationComparison?: {
    decennale?: AttestationComparison;
    rc_pro?: AttestationComparison;
  };
  quoteInfo: {
    nom_entreprise: string;
    siret: string;
    adresse: string;
    categorie_travaux: string;
  };
  onUploadComplete: () => void;
  defaultOpen?: boolean;
}

const BlockSecurite = ({
  pointsOk,
  alertes,
  analysisId,
  assuranceSource,
  assuranceLevel2Score,
  attestationComparison,
  quoteInfo,
  onUploadComplete,
  defaultOpen = true
}: BlockSecuriteProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const info = extractSecuriteData(pointsOk, alertes, attestationComparison, assuranceLevel2Score);
  const hasLevel2 = assuranceSource === "attestation";

  return (
    <div className={`border-2 rounded-2xl p-6 mb-6 ${getScoreBgClass(info.globalScore)}`}>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center gap-3 text-left cursor-pointer"
          >
            <h2 className="font-bold text-foreground text-xl">Sécurité & Conditions de paiement</h2>
            {getScoreIcon(info.globalScore, "h-6 w-6")}
            <ChevronDown className={`h-5 w-5 ml-auto text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} />
          </button>

          {isOpen && (<>
          <p className="text-sm text-muted-foreground mb-4 mt-4">
            Évaluer les risques liés au paiement et aux assurances.
          </p>

          {/* Assurances section */}
          <div className="mb-6">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Assurances
              {hasLevel2 && (
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                  <FileCheck className="h-3 w-3 inline mr-1" />
                  Attestation vérifiée
                </span>
              )}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Décennale */}
              <div className="p-3 bg-background/30 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-foreground">Garantie décennale</span>
                  {getScoreIcon(info.decennale.score)}
                </div>
                <p className={`text-sm ${getScoreTextClass(info.decennale.score)}`}>
                  {info.decennale.attestationStatus === "verified" && "Attestation vérifiée ✓"}
                  {info.decennale.attestationStatus === "incoherent" && "Incohérences détectées (attestation)"}
                  {info.decennale.attestationStatus === "incomplete" && "Attestation incomplète"}
                  {!info.decennale.attestationStatus && info.decennale.mentionnee && "Mentionnée sur le devis"}
                  {!info.decennale.attestationStatus && !info.decennale.mentionnee && "Non disponible dans le devis transmis"}
                </p>

                {/* Attestation comparison details */}
                {hasLevel2 && attestationComparison?.decennale && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-1">Comparaison attestation ↔ devis :</p>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <span>Entreprise :</span>
                      <span className={getComparisonStatusClass(attestationComparison.decennale.nom_entreprise)}>
                        {getComparisonStatusText(attestationComparison.decennale.nom_entreprise)}
                      </span>
                      <span>SIRET :</span>
                      <span className={getComparisonStatusClass(attestationComparison.decennale.siret_siren)}>
                        {getComparisonStatusText(attestationComparison.decennale.siret_siren)}
                      </span>
                      <span>Validité :</span>
                      <span className={getComparisonStatusClass(attestationComparison.decennale.periode_validite)}>
                        {getComparisonStatusText(attestationComparison.decennale.periode_validite)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* RC Pro */}
              <div className="p-3 bg-background/30 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-foreground">RC Professionnelle</span>
                  {getScoreIcon(info.rcpro.score)}
                </div>
                <p className={`text-sm ${getScoreTextClass(info.rcpro.score)}`}>
                  {info.rcpro.attestationStatus === "verified" && "Attestation vérifiée ✓"}
                  {info.rcpro.attestationStatus === "incoherent" && "Incohérences détectées (attestation)"}
                  {info.rcpro.attestationStatus === "incomplete" && "Attestation incomplète"}
                  {!info.rcpro.attestationStatus && info.rcpro.mentionnee && "Mentionnée sur le devis"}
                  {!info.rcpro.attestationStatus && !info.rcpro.mentionnee && "Non disponible dans le devis transmis"}
                </p>

                {/* Attestation comparison details */}
                {hasLevel2 && attestationComparison?.rc_pro && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-1">Comparaison attestation ↔ devis :</p>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <span>Entreprise :</span>
                      <span className={getComparisonStatusClass(attestationComparison.rc_pro.nom_entreprise)}>
                        {getComparisonStatusText(attestationComparison.rc_pro.nom_entreprise)}
                      </span>
                      <span>SIRET :</span>
                      <span className={getComparisonStatusClass(attestationComparison.rc_pro.siret_siren)}>
                        {getComparisonStatusText(attestationComparison.rc_pro.siret_siren)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Upload attestation if not level 2 */}
            {!hasLevel2 && (
              <div className="mt-4">
                <AttestationUpload
                  analysisId={analysisId}
                  quoteInfo={quoteInfo}
                  onUploadComplete={onUploadComplete}
                />
              </div>
            )}
          </div>

          {/* Conditions de paiement section */}
          <div className="mb-4">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Conditions de paiement
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Mode de paiement */}
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Mode de paiement</p>
                <p className={`font-medium ${info.paiement.especes ? "text-score-red" : "text-foreground"}`}>
                  {info.paiement.modes.length > 0 ? info.paiement.modes.join(", ") : "Non disponible dans le devis"}
                </p>
              </div>

              {/* Acompte */}
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Acompte demandé</p>
                <p className={`font-medium ${
                  info.paiement.acomptePourcentage === null ? "text-muted-foreground" :
                  info.paiement.acomptePourcentage <= 30 ? "text-score-green" :
                  info.paiement.acomptePourcentage <= 50 ? "text-score-orange" : "text-score-red"
                }`}>
                  {info.paiement.acomptePourcentage !== null ? `${info.paiement.acomptePourcentage}%` : "Non disponible dans le devis"}
                </p>
              </div>

              {/* IBAN */}
              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Statut IBAN</p>
                <p className={`font-medium ${
                  info.paiement.ibanValid === null ? "text-muted-foreground" :
                  !info.paiement.ibanValid ? "text-score-red" :
                  info.paiement.ibanFrance ? "text-score-green" : "text-score-orange"
                }`}>
                  {info.paiement.ibanValid === null && "Aucun IBAN n'a été détecté dans le devis"}
                  {info.paiement.ibanValid === false && "IBAN non valide"}
                  {info.paiement.ibanValid && info.paiement.ibanFrance && "Valide - France"}
                  {info.paiement.ibanValid && !info.paiement.ibanFrance && `Valide - ${info.paiement.ibanCountry || "Étranger"}`}
                </p>
              </div>
            </div>

            {/* Paiement intégral warning */}
            {info.paiement.paiementIntegralAvantTravaux && (
              <div className="mt-3 p-2 bg-score-red/10 rounded-lg border border-score-red/20">
                <p className="text-sm text-score-red font-medium">
                  ⚠️ Paiement intégral demandé avant le début des travaux
                </p>
              </div>
            )}
          </div>

          {/* Vigilance reasons - factual observations */}
          {info.vigilanceReasons.length > 0 && (
            <PedagogicExplanation type="info" title="Observations factuelles" className="mb-3">
              <ul className="space-y-1">
                {info.vigilanceReasons.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground/80 mt-2 italic">
                Ces éléments sont des observations factuelles extraites du devis.
              </p>
            </PedagogicExplanation>
          )}

          {/* Recommendations with positive framing */}
          {info.recommendations.length > 0 && (info.globalScore === "ORANGE" || info.globalScore === "ROUGE") && (
            <PedagogicExplanation type="tip" title="Suggestions" className="mb-4">
              <ul className="space-y-1">
                {info.recommendations.map((rec, idx) => (
                  <li key={idx}>• {rec}</li>
                ))}
              </ul>
            </PedagogicExplanation>
          )}

          {/* Score explanation - factual */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className={`text-sm font-medium ${getScoreTextClass(info.globalScore)}`}>
              {info.globalScore === "VERT" && "✓ Les conditions de sécurité et de paiement sont satisfaisantes."}
              {info.globalScore === "ORANGE" && "ℹ️ Certaines informations n'ont pas été trouvées dans le devis transmis."}
              {info.globalScore === "ROUGE" && "⚠️ Des éléments critiques ont été détectés."}
            </p>
            {info.globalScore === "ORANGE" && (
              <p className="text-xs text-muted-foreground mt-2">
                Aucun élément critique n'a été détecté. Les informations manquantes peuvent être ajoutées ci-dessus.
              </p>
            )}
          </div>

          {/* Disclaimer - harmonized */}
          <div className="mt-3 p-2 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground/70 italic">
              ℹ️ Analyse automatisée à partir des informations du devis. Vérification IBAN via OpenIBAN.
              Ces informations constituent une aide à la décision et ne portent aucun jugement sur l'artisan.
            </p>
          </div>
          </>)}
        </div>
      </div>
    </div>
  );
};

export default BlockSecurite;
