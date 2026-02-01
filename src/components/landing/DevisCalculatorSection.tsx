import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import JobTypeSelector, { type JobTypeItem } from "./JobTypeSelector";

interface PriceResult {
  total_min: number;
  total_avg: number;
  total_max: number;
  price_avg_unit_ht?: number;
  quantity: number;
  unit: string;
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
      // POST request to n8n webhook
      const baseUrl = "https://n8n.messagingme.app/webhook/d1cfedb7-0ebb-44ca-bb2b-543ee84b0075";
      
      // Build form data based on unit type
      const formDataFields: Record<string, unknown> = {
        job_type: jobType,
        zip,
      };
      
      if (isForfait) {
        formDataFields.qty = 1;
      } else if (isUnitBased) {
        formDataFields.qty = Number(quantity);
      } else {
        formDataFields.surface = Number(quantity);
      }
      
      const { data, error: fnError } = await supabase.functions.invoke("test-webhook", {
        body: {
          url: baseUrl,
          method: "POST",
          formDataFields,
        },
      });
      
      if (fnError) {
        throw new Error(fnError.message || "Erreur lors de l'appel API");
      }

      if (!data?.success) {
        throw new Error(data?.error || "L'API a retourné une erreur");
      }

      const apiResponse = data.data;

      // n8n renvoie total_min/total_avg/total_max (totaux déjà calculés)
      if (apiResponse && typeof apiResponse === "object" && (apiResponse as any).ok === true) {
        const quantityNum = isForfait ? 1 : Number(quantity);
        const totalMin = Number((apiResponse as any).total_min);
        const totalAvg = Number((apiResponse as any).total_avg);
        const totalMax = Number((apiResponse as any).total_max);

        if (![totalMin, totalAvg, totalMax].every((n) => Number.isFinite(n) && n > 0)) {
          throw new Error("Prix marché indisponible pour ce type de travaux");
        }

        // Optionnel : certains retours incluent un prix unitaire moyen
        const unitAvg = Number((apiResponse as any).price_avg_unit_ht);
        const hasUnitAvg = Number.isFinite(unitAvg) && unitAvg > 0;

        setResult({
          total_min: totalMin,
          total_avg: totalAvg,
          total_max: totalMax,
          price_avg_unit_ht: hasUnitAvg ? unitAvg : undefined,
          quantity: quantityNum,
          unit: selectedJobData?.unit || "m²",
        });
      } else {
        throw new Error("Prix marché indisponible pour ce type de travaux");
      }
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

                {/* Recap */}
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    <span className="font-medium">Type :</span>{" "}
                    {selectedJobData?.label || jobType}
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
                      : `${result.quantity} ${formatUnitLabel(result.unit)}`}
                  </p>
                </div>

                {/* Price Range */}
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
                  
                  {result.price_avg_unit_ht && result.unit !== "forfait" && (
                    <p className="text-sm text-muted-foreground">
                      Détail : {result.quantity} {formatUnitLabel(result.unit)} × {result.price_avg_unit_ht.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/{formatUnitLabel(result.unit)} HT
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
