import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const JOB_TYPES = [
  { value: "peinture_murs", label: "Peinture murs" },
  { value: "peinture_plafond", label: "Peinture plafond" },
  { value: "carrelage_sol", label: "Carrelage sol" },
  { value: "parquet_flottant", label: "Parquet flottant" },
  { value: "demolition", label: "Démolition" },
  { value: "enduit_lissage", label: "Enduit lissage" },
];

interface PriceResult {
  min_total: number;
  avg_total: number;
  max_total: number;
  price_min_unit_ht: number;
  price_avg_unit_ht: number;
  price_max_unit_ht: number;
  surface: number;
}

const DevisCalculatorSection = () => {
  const [jobType, setJobType] = useState<string>("");
  const [surface, setSurface] = useState<string>("");
  const [zip, setZip] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PriceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isFormValid = jobType && surface && zip && Number(surface) > 0;

  const handleCalculate = async () => {
    if (!isFormValid) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      // Build URL with job_type only
      const baseUrl = "https://n8n.messagingme.app/webhook/d1cfedb7-0ebb-44ca-bb2b-543ee84b0075";
      const queryParams = new URLSearchParams({
        job_type: jobType,
      }).toString();
      
      const { data, error: fnError } = await supabase.functions.invoke("test-webhook", {
        body: {
          url: `${baseUrl}?${queryParams}`,
          method: "GET",
        },
      });
      
      if (fnError) {
        throw new Error(fnError.message || "Erreur lors de l'appel API");
      }

      if (!data?.success) {
        throw new Error(data?.error || "L'API a retourné une erreur");
      }

      // Parse the API response
      const apiResponse = data.data;
      
      if (apiResponse && typeof apiResponse === "object" && 
          apiResponse.price_min_unit_ht !== undefined &&
          apiResponse.price_avg_unit_ht !== undefined &&
          apiResponse.price_max_unit_ht !== undefined) {
        
        const surfaceNum = Number(surface);
        const priceMinUnit = Number(apiResponse.price_min_unit_ht);
        const priceAvgUnit = Number(apiResponse.price_avg_unit_ht);
        const priceMaxUnit = Number(apiResponse.price_max_unit_ht);
        
        setResult({
          min_total: priceMinUnit * surfaceNum,
          avg_total: priceAvgUnit * surfaceNum,
          max_total: priceMaxUnit * surfaceNum,
          price_min_unit_ht: priceMinUnit,
          price_avg_unit_ht: priceAvgUnit,
          price_max_unit_ht: priceMaxUnit,
          surface: surfaceNum,
        });
      } else {
        throw new Error("Prix indisponible pour ce type de travaux");
      }
    } catch (err) {
      console.error("Devis calculation error:", err);
      setError(err instanceof Error ? err.message : "Prix indisponible pour ce type de travaux");
    } finally {
      setIsLoading(false);
    }
  };

  const getJobTypeLabel = (value: string) => {
    return JOB_TYPES.find((jt) => jt.value === value)?.label || value;
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
              <Select value={jobType} onValueChange={setJobType}>
                <SelectTrigger id="job-type" className="bg-background">
                  <SelectValue placeholder="Sélectionnez un type de travaux" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  {JOB_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Surface Input */}
            <div className="space-y-2">
              <Label htmlFor="surface">Surface (m²)</Label>
              <Input
                id="surface"
                type="number"
                min="1"
                placeholder="ex: 45"
                value={surface}
                onChange={(e) => setSurface(e.target.value)}
                className="bg-background"
              />
            </div>

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
                    {getJobTypeLabel(jobType)}
                  </p>
                  <p>
                    <span className="font-medium">Surface :</span> {result.surface} m²
                  </p>
                </div>

                {/* Price Range */}
                <div className="pt-2 border-t border-primary/10 space-y-3">
                  <p className="text-lg font-bold text-foreground">
                    Fourchette :{" "}
                    <span className="text-primary">
                      {result.min_total.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € à{" "}
                      {result.max_total.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € (HT)
                    </span>
                  </p>
                  
                  <p className="text-base text-foreground">
                    Prix moyen estimé :{" "}
                    <span className="font-semibold text-primary">
                      {result.avg_total.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € (HT)
                    </span>
                  </p>
                  
                  <p className="text-sm text-muted-foreground">
                    Détail : {result.surface} m² × {result.price_avg_unit_ht.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/m² HT
                  </p>
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
