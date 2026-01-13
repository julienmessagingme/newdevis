import { CheckCircle2, AlertCircle, XCircle, ShieldCheck, CreditCard, FileCheck } from "lucide-react";
import AttestationUpload from "@/components/AttestationUpload";

interface AttestationComparison {
  nom_entreprise: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
  siret_siren: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
  adresse: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
  periode_validite: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
  activite_couverte: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
  coherence_globale: "OK" | "INCOMPLET" | "INCOHERENT" | "NON_DISPONIBLE";
}

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
}

const getScoreIcon = (score: string | null, className: string = "h-5 w-5") => {
  switch (score) {
    case "VERT": return <CheckCircle2 className={`${className} text-score-green`} />;
    case "ORANGE": return <AlertCircle className={`${className} text-score-orange`} />;
    case "ROUGE": return <XCircle className={`${className} text-score-red`} />;
    default: return null;
  }
};

const getScoreBgClass = (score: string | null) => {
  switch (score) {
    case "VERT": return "bg-score-green-bg border-score-green/30";
    case "ORANGE": return "bg-score-orange-bg border-score-orange/30";
    case "ROUGE": return "bg-score-red-bg border-score-red/30";
    default: return "bg-muted border-border";
  }
};

const getScoreTextClass = (score: string | null) => {
  switch (score) {
    case "VERT": return "text-score-green";
    case "ORANGE": return "text-score-orange";
    case "ROUGE": return "text-score-red";
    default: return "text-muted-foreground";
  }
};

interface SecuriteInfo {
  decennale: {
    mentionnee: boolean;
    critique: boolean;
    attestationStatus: "verified" | "incoherent" | "incomplete" | null;
    score: "VERT" | "ORANGE" | "ROUGE";
  };
  rcpro: {
    mentionnee: boolean;
    attestationStatus: "verified" | "incoherent" | "incomplete" | null;
    score: "VERT" | "ORANGE" | "ROUGE";
  };
  paiement: {
    modes: string[];
    acomptePourcentage: number | null;
    paiementIntegralAvantTravaux: boolean;
    ibanValid: boolean | null;
    ibanFrance: boolean | null;
    ibanCountry: string | null;
    especes: boolean;
    score: "VERT" | "ORANGE" | "ROUGE";
  };
  globalScore: "VERT" | "ORANGE" | "ROUGE";
  vigilanceReasons: string[];
  recommendations: string[];
}

const extractSecuriteData = (
  pointsOk: string[], 
  alertes: string[],
  attestationComparison?: { decennale?: AttestationComparison; rc_pro?: AttestationComparison },
  assuranceLevel2Score?: string | null
): SecuriteInfo => {
  const allPoints = [...pointsOk, ...alertes];
  
  const info: SecuriteInfo = {
    decennale: { mentionnee: false, critique: false, attestationStatus: null, score: "ORANGE" },
    rcpro: { mentionnee: false, attestationStatus: null, score: "ORANGE" },
    paiement: { 
      modes: [], 
      acomptePourcentage: null, 
      paiementIntegralAvantTravaux: false,
      ibanValid: null,
      ibanFrance: null,
      ibanCountry: null,
      especes: false,
      score: "ORANGE"
    },
    globalScore: "ORANGE",
    vigilanceReasons: [],
    recommendations: []
  };
  
  let alertCount = 0;
  
  for (const point of allPoints) {
    const lowerPoint = point.toLowerCase();
    
    // Assurances
    if (lowerPoint.includes("décennale") || lowerPoint.includes("decennale")) {
      if (lowerPoint.includes("mentionnée") && !lowerPoint.includes("non")) {
        info.decennale.mentionnee = true;
      }
      if (lowerPoint.includes("obligatoire") && lowerPoint.includes("non")) {
        info.decennale.critique = true;
        alertCount++;
      }
    }
    
    if (lowerPoint.includes("rc pro") || lowerPoint.includes("rc professionnelle")) {
      if (lowerPoint.includes("mentionnée") && !lowerPoint.includes("non")) {
        info.rcpro.mentionnee = true;
      }
    }
    
    // Paiement
    if (lowerPoint.includes("virement")) info.paiement.modes.push("Virement");
    if (lowerPoint.includes("chèque") || lowerPoint.includes("cheque")) info.paiement.modes.push("Chèque");
    if (lowerPoint.includes("carte")) info.paiement.modes.push("Carte bancaire");
    if (lowerPoint.includes("espèces") || lowerPoint.includes("especes") || lowerPoint.includes("cash")) {
      info.paiement.modes.push("Espèces");
      info.paiement.especes = true;
      alertCount++;
      info.vigilanceReasons.push("Paiement en espèces demandé");
    }
    
    // Acompte
    const acompteMatch = point.match(/acompte[^\d]*(\d+)\s*%/i);
    if (acompteMatch) {
      info.paiement.acomptePourcentage = parseInt(acompteMatch[1], 10);
      if (info.paiement.acomptePourcentage > 50) {
        alertCount++;
        info.vigilanceReasons.push(`Acompte élevé (${info.paiement.acomptePourcentage}%)`);
      } else if (info.paiement.acomptePourcentage > 30) {
        info.vigilanceReasons.push(`Acompte modéré (${info.paiement.acomptePourcentage}%)`);
      }
    }
    
    // Paiement intégral
    if (lowerPoint.includes("paiement intégral") && lowerPoint.includes("avant")) {
      info.paiement.paiementIntegralAvantTravaux = true;
      alertCount++;
      info.vigilanceReasons.push("Paiement intégral avant travaux");
    }
    
    // IBAN
    if (lowerPoint.includes("iban")) {
      if (lowerPoint.includes("valide") && lowerPoint.includes("france")) {
        info.paiement.ibanValid = true;
        info.paiement.ibanFrance = true;
        info.paiement.ibanCountry = "France";
      } else if (lowerPoint.includes("valide")) {
        info.paiement.ibanValid = true;
        info.paiement.ibanFrance = false;
        const countryMatch = point.match(/\(([^)]+)\)/);
        info.paiement.ibanCountry = countryMatch ? countryMatch[1] : "Étranger";
        info.vigilanceReasons.push(`IBAN étranger (${info.paiement.ibanCountry})`);
      } else if (lowerPoint.includes("non valide") || lowerPoint.includes("invalide")) {
        info.paiement.ibanValid = false;
        alertCount++;
        info.vigilanceReasons.push("IBAN non valide");
      }
    }
  }
  
  // Handle attestation comparison
  if (attestationComparison?.decennale) {
    const comp = attestationComparison.decennale;
    if (comp.coherence_globale === "OK") {
      info.decennale.attestationStatus = "verified";
      info.decennale.score = "VERT";
    } else if (comp.coherence_globale === "INCOHERENT") {
      info.decennale.attestationStatus = "incoherent";
      info.decennale.score = "ROUGE";
      alertCount++;
    } else {
      info.decennale.attestationStatus = "incomplete";
      info.decennale.score = "ORANGE";
    }
  } else if (info.decennale.mentionnee) {
    info.decennale.score = "ORANGE";
  } else if (info.decennale.critique) {
    info.decennale.score = "ROUGE";
  }
  
  if (attestationComparison?.rc_pro) {
    const comp = attestationComparison.rc_pro;
    if (comp.coherence_globale === "OK") {
      info.rcpro.attestationStatus = "verified";
      info.rcpro.score = "VERT";
    } else if (comp.coherence_globale === "INCOHERENT") {
      info.rcpro.attestationStatus = "incoherent";
      info.rcpro.score = "ROUGE";
    } else {
      info.rcpro.attestationStatus = "incomplete";
    }
  } else if (info.rcpro.mentionnee) {
    info.rcpro.score = "ORANGE";
  }
  
  // Deduplicate modes
  info.paiement.modes = [...new Set(info.paiement.modes)];
  
  // Determine paiement score
  if (info.paiement.especes || !info.paiement.ibanValid || info.paiement.paiementIntegralAvantTravaux || info.vigilanceReasons.length >= 2) {
    info.paiement.score = "ROUGE";
  } else if (info.vigilanceReasons.length > 0) {
    info.paiement.score = "ORANGE";
  } else if (info.paiement.ibanValid && info.paiement.ibanFrance) {
    info.paiement.score = "VERT";
  }
  
  // Determine global score
  const scores = [info.decennale.score, info.rcpro.score, info.paiement.score];
  if (scores.includes("ROUGE") || alertCount >= 2) {
    info.globalScore = "ROUGE";
  } else if (scores.filter(s => s === "ORANGE").length >= 2) {
    info.globalScore = "ORANGE";
  } else if (scores.every(s => s === "VERT")) {
    info.globalScore = "VERT";
  } else {
    info.globalScore = "ORANGE";
  }
  
  // Use level2 score if available
  if (assuranceLevel2Score) {
    info.globalScore = assuranceLevel2Score as "VERT" | "ORANGE" | "ROUGE";
  }
  
  // Add recommendations
  if (info.paiement.score !== "VERT") {
    info.recommendations.push("Privilégiez un mode de paiement traçable (virement, chèque).");
  }
  if (info.paiement.acomptePourcentage && info.paiement.acomptePourcentage > 30) {
    info.recommendations.push("Limitez l'acompte à 30% maximum du montant total.");
  }
  if (!info.decennale.attestationStatus && info.decennale.mentionnee) {
    info.recommendations.push("Demandez l'attestation d'assurance décennale à jour.");
  }
  
  return info;
};

// Function to filter out securite-related items from points_ok/alertes
export const filterOutSecuriteItems = (items: string[]): string[] => {
  return items.filter(item => {
    const lower = item.toLowerCase();
    return !lower.includes("assurance") && 
           !lower.includes("décennale") &&
           !lower.includes("decennale") &&
           !lower.includes("rc pro") &&
           !lower.includes("attestation") &&
           !lower.includes("conditions de paiement") &&
           !lower.includes("mode de paiement") &&
           !lower.includes("mode de règlement") &&
           !lower.includes("iban") &&
           !lower.includes("virement") &&
           !lower.includes("espèces") &&
           !lower.includes("paiement intégral") &&
           !(lower.includes("acompte") && (lower.includes("paiement") || lower.includes("%")));
  });
};

const getComparisonStatusText = (status: string) => {
  switch (status) {
    case "OK": return "✓ Conforme";
    case "INCOMPLET": return "Info manquante";
    case "INCOHERENT": return "Incohérence détectée";
    case "NON_DISPONIBLE": return "Non vérifié";
    default: return status;
  }
};

const getComparisonStatusClass = (status: string) => {
  switch (status) {
    case "OK": return "text-score-green";
    case "INCOMPLET": return "text-score-orange";
    case "INCOHERENT": return "text-score-red";
    default: return "text-muted-foreground";
  }
};

const BlockSecurite = ({ 
  pointsOk, 
  alertes, 
  analysisId,
  assuranceSource,
  assuranceLevel2Score,
  attestationComparison,
  quoteInfo,
  onUploadComplete
}: BlockSecuriteProps) => {
  const info = extractSecuriteData(pointsOk, alertes, attestationComparison, assuranceLevel2Score);
  const hasLevel2 = assuranceSource === "attestation";
  
  return (
    <div className={`border-2 rounded-2xl p-6 mb-6 ${getScoreBgClass(info.globalScore)}`}>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-background/50 rounded-xl flex-shrink-0">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-foreground text-xl">BLOC 3 — Sécurité & Conditions de paiement</h2>
            {getScoreIcon(info.globalScore, "h-6 w-6")}
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
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
                  {info.decennale.attestationStatus === "verified" && "Attestation vérifiée"}
                  {info.decennale.attestationStatus === "incoherent" && "Incohérences détectées"}
                  {info.decennale.attestationStatus === "incomplete" && "Informations incomplètes"}
                  {!info.decennale.attestationStatus && info.decennale.mentionnee && "Mentionnée sur le devis"}
                  {!info.decennale.attestationStatus && !info.decennale.mentionnee && info.decennale.critique && "Non mentionnée (obligatoire)"}
                  {!info.decennale.attestationStatus && !info.decennale.mentionnee && !info.decennale.critique && "Non mentionnée"}
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
                  {info.rcpro.attestationStatus === "verified" && "Attestation vérifiée"}
                  {info.rcpro.attestationStatus === "incoherent" && "Incohérences détectées"}
                  {info.rcpro.attestationStatus === "incomplete" && "Informations incomplètes"}
                  {!info.rcpro.attestationStatus && info.rcpro.mentionnee && "Mentionnée sur le devis"}
                  {!info.rcpro.attestationStatus && !info.rcpro.mentionnee && "Non mentionnée"}
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
                  {info.paiement.modes.length > 0 ? info.paiement.modes.join(", ") : "Non précisé"}
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
                  {info.paiement.acomptePourcentage !== null ? `${info.paiement.acomptePourcentage}%` : "Non précisé"}
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
                  {info.paiement.ibanValid === null && "Non détecté"}
                  {info.paiement.ibanValid === false && "Non valide"}
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
          
          {/* Vigilance reasons */}
          {info.vigilanceReasons.length > 0 && (
            <div className="mb-3 p-3 bg-background/50 rounded-lg border border-border">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Points de vigilance :</span>{" "}
                {info.vigilanceReasons.join(", ")}.
              </p>
            </div>
          )}
          
          {/* Recommendations */}
          {info.recommendations.length > 0 && (info.globalScore === "ORANGE" || info.globalScore === "ROUGE") && (
            <div className="mb-4 p-3 bg-background/50 rounded-lg">
              <p className="text-sm font-medium text-foreground mb-2">💡 Recommandations :</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {info.recommendations.map((rec, idx) => (
                  <li key={idx}>• {rec}</li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Score explanation */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className={`text-sm font-medium ${getScoreTextClass(info.globalScore)}`}>
              {info.globalScore === "VERT" && "✓ Les conditions de sécurité et de paiement sont satisfaisantes."}
              {info.globalScore === "ORANGE" && "⚠️ Certains éléments nécessitent une vigilance particulière."}
              {info.globalScore === "ROUGE" && "⚠️ Des alertes importantes ont été détectées. Vérification recommandée."}
            </p>
          </div>
          
          <p className="text-xs text-muted-foreground/70 mt-3 italic">
            Ces éléments sont des indicateurs de vigilance factuels. Vérification IBAN via OpenIBAN. Ce bloc ne porte aucun jugement sur l'artisan.
          </p>
        </div>
      </div>
    </div>
  );
};

export default BlockSecurite;
