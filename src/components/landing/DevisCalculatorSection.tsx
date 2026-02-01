import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, Loader2, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import JobTypeSelector, { type JobTypeItem } from "./JobTypeSelector";

// Types pour la réponse n8n
interface N8NLine {
  job_type: string;
  qty: number;
  unit: string;
  price_min_unit_ht: number;
  price_avg_unit_ht: number;
  price_max_unit_ht: number;
  line_total_min: number;
  line_total_avg: number;
  line_total_max: number;
}

interface N8NResponse {
  ok: boolean;
  currency: string;
  total_min: number;
  total_avg: number;
  total_max: number;
  lines: N8NLine[];
  warnings: string[];
}

interface PriceResult {
  total_min: number;
  total_avg: number;
  total_max: number;
  lines: N8NLine[];
  warnings: string[];
  displayQty: number;
  unit: string;
  jobTypeLabel: string;
}

const DevisCalculatorSection = () => {
  const [jobType, setJobType] = useState<string>("");
  const [selectedJobData, setSelectedJobData] = useState<JobTypeItem | null>(null);
  const [quantity, setQuantity] = useState<string>("");
  const [zip, setZip] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PriceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Determine unit type from selected job
  const isUnitBased = selectedJobData?.unit === "unité" || selectedJobData?.unit === "unit";
  const isForfait = selectedJobData?.unit === "forfait";
  const unitLabel = isForfait ? "forfait" : isUnitBased ? "unité(s)" : "m²";
  
  const isFormValid = jobType && (isForfait || (quantity && Number(quantity) > 0)) && zip;

  const handleCalculate = async () => {
    if (!isFormValid) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const baseUrl = "https://n8n.messagingme.app/webhook/d1cfedb7-0ebb-44ca-bb2b-543ee84b0075";
      
      // Quantité à envoyer
      const qtyToSend = isForfait ? 1 : Number(quantity);
      
      // Body JSON exact demandé par n8n
      const jsonPayload = {
        job_type: jobType,
        qty: qtyToSend,
        unit: selectedJobData?.unit || "m²",
        zip: zip,
      };
      
      console.log("Sending to n8n:", jsonPayload);
      
      const { data, error: fnError } = await supabase.functions.invoke("test-webhook", {
        body: {
          url: baseUrl,
          method: "POST",
          payload: jsonPayload,
        },
      });
      
      if (fnError) {
        throw new Error(fnError.message || "Erreur lors de l'appel API");
      }

      if (!data?.success) {
        throw new Error(data?.error || "L'API a retourné une erreur");
      }

      const apiResponse = data.data as N8NResponse;
      console.log("n8n response:", apiResponse);

      // Vérifier que la réponse est valide
      if (!apiResponse || apiResponse.ok !== true) {
        throw new Error("Prix marché indisponible pour ce type de travaux");
      }

      // Récupérer les totaux DIRECTEMENT depuis n8n - AUCUN RECALCUL
      const totalMin = Number(apiResponse.total_min);
      const totalAvg = Number(apiResponse.total_avg);
      const totalMax = Number(apiResponse.total_max);

      if (![totalMin, totalAvg, totalMax].every((n) => Number.isFinite(n) && n > 0)) {
        throw new Error("Prix marché indisponible pour ce type de travaux");
      }

      // Récupérer lines[] et warnings[] depuis n8n
      const lines = Array.isArray(apiResponse.lines) ? apiResponse.lines : [];
      const warnings = Array.isArray(apiResponse.warnings) ? apiResponse.warnings : [];

      // Calculer displayQty = somme des lines[].qty (ou qty du formulaire si 1 ligne ou pas de lines)
      let displayQty = qtyToSend;
      if (lines.length > 0) {
        const sumQty = lines.reduce((acc, line) => acc + (line.qty || 0), 0);
        if (sumQty > 0) {
          displayQty = sumQty;
        }
      }

      setResult({
        total_min: totalMin,
        total_avg: totalAvg,
        total_max: totalMax,
        lines,
        warnings,
        displayQty,
        unit: selectedJobData?.unit || "m²",
        jobTypeLabel: selectedJobData?.label || jobType,
      });
    } catch (err) {
      console.error("Devis calculation error:", err);
      setError(err instanceof Error ? err.message : "Prix indisponible pour ce type de travaux");
    } finally {
      setIsLoading(false);
    }
  };

  const formatUnitLabel = (unit: string) => {
    if (unit === "forfait") return "forfait";
    if (unit === "unité" || unit === "unit") return "unité";
    return "m²";
  };

  return (
    <section className="py-16 bg-muted/30">
      <div className="container max-w-2xl mx-auto px-4">
        <Card className="shadow-lg border-primary/10">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Calculator className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">
              Estimez le coût de vos travaux
            </CardTitle>
            <p className="text-muted-foreground mt-2">
              Obtenez une fourchette de prix en quelques clics
            </p>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {/* Job Type Select */}
            <div className="space-y-2">
              <Label htmlFor="job-type">Type de travaux</Label>
              <JobTypeSelector
                value={jobType}
                onChange={setJobType}
                onJobTypeData={setSelectedJobData}
              />
            </div>

            {/* Quantity/Surface Input - hidden for forfait */}
            {!isForfait && (
              <div className="space-y-2">
                <Label htmlFor="quantity">
                  {isUnitBased ? "Quantité (nombre)" : "Surface (m²)"}
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  placeholder={isUnitBased ? "ex: 3" : "ex: 45"}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="bg-background"
                />
              </div>
            )}

            {/* Zip Code Input */}
            <div className="space-y-2">
              <Label htmlFor="zip">Code postal</Label>
              <Input
                id="zip"
                type="text"
                maxLength={5}
                placeholder="ex: 75011"
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                className="bg-background"
              />
            </div>

            {/* Calculate Button */}
            <Button
              onClick={handleCalculate}
              disabled={!isFormValid || isLoading}
              className="w-full"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Calcul en cours...
                </>
              ) : (
                <>
                  <Calculator className="mr-2 h-4 w-4" />
                  Calculer
                </>
              )}
            </Button>

            {/* Error Display */}
            {error && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">Erreur</p>
                  <p className="text-sm text-destructive/80">{error}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Veuillez vérifier vos informations et réessayer.
                  </p>
                </div>
              </div>
            )}

            {/* Result Display */}
            {result && !error && (
              <div className="p-6 rounded-lg bg-primary/5 border border-primary/20 space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-semibold">Estimation calculée</span>
                </div>

                {/* Warnings from n8n - only if warnings.length > 0 */}
                {result.warnings && result.warnings.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-sm text-muted-foreground">
                      {result.warnings.map((warning, idx) => (
                        <p key={idx}>{warning}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recap */}
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    <span className="font-medium">Type :</span>{" "}
                    {result.jobTypeLabel}
                  </p>
                  <p>
                    <span className="font-medium">
                      {result.unit === "forfait" 
                        ? "Prestation" 
                        : result.unit === "unité" || result.unit === "unit" 
                          ? "Quantité" 
                          : "Surface"}
                      :
                    </span>{" "}
                    {result.unit === "forfait" 
                      ? "Forfait" 
                      : `${result.displayQty} ${formatUnitLabel(result.unit)}`}
                  </p>
                </div>

                {/* Price Range - Valeurs DIRECTES de n8n */}
                <div className="pt-2 border-t border-primary/10 space-y-3">
                  <p className="text-lg font-bold text-foreground">
                    Fourchette :{" "}
                    <span className="text-primary">
                      {result.total_min.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} € à{" "}
                      {result.total_max.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} € (HT)
                    </span>
                  </p>
                  
                  <p className="text-base text-foreground">
                    Prix moyen estimé :{" "}
                    <span className="font-semibold text-primary">
                      {result.total_avg.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} € (HT)
                    </span>
                  </p>
                  
                  {/* Détail lignes si disponible */}
                  {result.lines && result.lines.length > 0 && result.unit !== "forfait" && result.lines[0]?.price_avg_unit_ht && (
                    <p className="text-sm text-muted-foreground">
                      Détail : {result.displayQty} {formatUnitLabel(result.unit)} × {result.lines[0].price_avg_unit_ht.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/{formatUnitLabel(result.unit)} HT
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default DevisCalculatorSection;
