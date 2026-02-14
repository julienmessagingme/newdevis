import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, Loader2, AlertCircle, CheckCircle2, AlertTriangle, MapPin } from "lucide-react";
import JobTypeSelector, { type JobTypeItem } from "./JobTypeSelector";
import { getZoneCoefficient, applyZoneCoefficient, getZoneLabel, type ZoneResult } from "@/hooks/useZoneCoefficient";
import { supabase } from "@/integrations/supabase/client";

interface PriceResult {
  label: string;
  unit: string;
  qty: number;
}

interface WeightedResult {
  priceResult: PriceResult;
  zone: ZoneResult;
  adjustedTotals: {
    min: number;
    avg: number;
    max: number;
  };
}

const DevisCalculatorSection = () => {
  const [jobType, setJobType] = useState<string>("");
  const [selectedJobData, setSelectedJobData] = useState<JobTypeItem | null>(null);
  const [quantity, setQuantity] = useState<string>("");
  const [zip, setZip] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<WeightedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Determine unit type from selected job
  const unit = selectedJobData?.unit ?? "";
  const isForfait = unit === "forfait";
  const isFormValid = jobType && (isForfait || (quantity && Number(quantity) > 0)) && zip.length === 5;

  const getUnitLabel = (u: string) => {
    switch (u) {
      case "m2": return "m²";
      case "m²": return "m²";
      case "ml": return "mètres linéaires";
      case "m3": return "m³";
      case "heure": return "heures";
      case "unité": return "unités";
      case "point": return "points";
      case "mod": return "modules";
      default: return u;
    }
  };

  const getUnitPlaceholder = (u: string) => {
    switch (u) {
      case "m2": case "m²": return "ex: 45";
      case "ml": return "ex: 12";
      case "m3": return "ex: 3";
      case "heure": return "ex: 4";
      case "unité": return "ex: 2";
      case "point": return "ex: 3";
      case "mod": return "ex: 2";
      default: return "ex: 1";
    }
  };

  const handleCalculate = async () => {
    if (!isFormValid) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      // 1. Récupérer le coefficient de zone basé sur le code postal
      const zoneResult = await getZoneCoefficient(zip);

      // 2. Requêter market_prices depuis Supabase (plusieurs lignes possibles par job_type)
      const { data: rows, error: dbError } = await supabase
        .from("market_prices")
        .select("label, unit, price_min_unit_ht, price_avg_unit_ht, price_max_unit_ht, fixed_min_ht, fixed_avg_ht, fixed_max_ht, notes")
        .eq("job_type", jobType);

      if (dbError || !rows || rows.length === 0) {
        setError("Type de travaux introuvable dans le référentiel de prix.");
        return;
      }

      // Préférer l'entrée marquée "Base" si plusieurs lignes existent
      const data = rows.find((r) => r.notes === "Base") ?? rows[0];

      // 3. Calculer les totaux localement
      const qty = isForfait ? 1 : Number(quantity);
      const totalMin = data.price_min_unit_ht * qty + data.fixed_min_ht;
      const totalAvg = data.price_avg_unit_ht * qty + data.fixed_avg_ht;
      const totalMax = data.price_max_unit_ht * qty + data.fixed_max_ht;

      // 4. Appliquer le coefficient de zone
      const adjustedTotals = applyZoneCoefficient(
        { min: totalMin, avg: totalAvg, max: totalMax },
        zoneResult.coefficient
      );

      setResult({
        priceResult: { label: data.label, unit: data.unit, qty },
        zone: zoneResult,
        adjustedTotals,
      });
    } catch (err) {
      console.error("[Calculette] Error:", err);
      setError(err instanceof Error ? err.message : "Erreur lors du calcul");
    } finally {
      setIsLoading(false);
    }
  };

  const formatNumber = (n: number | undefined) => {
    if (n === undefined || n === null) return "—";
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

            {/* Quantity Input - hidden for forfait */}
            {!isForfait && selectedJobData && (
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantité ({getUnitLabel(unit)})</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  step={unit === "m2" || unit === "m²" || unit === "ml" || unit === "m3" ? "0.1" : "1"}
                  placeholder={getUnitPlaceholder(unit)}
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

            {/* Error Display - erreurs API */}
            {error && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">Erreur</p>
                  <p className="text-sm text-destructive/80">{error}</p>
                </div>
              </div>
            )}

            {/* Result Display - AFFICHAGE avec pondération zone */}
            {result && !error && (
              <div className="p-6 rounded-lg bg-primary/5 border border-primary/20 space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-semibold">Estimation calculée</span>
                </div>

                {/* Zone géographique détectée */}
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {getZoneLabel(result.zone.zone)}
                    {result.zone.coefficient !== 1.0 && (
                      <span className="ml-1 text-xs">
                        (coef. {result.zone.coefficient.toFixed(2)})
                      </span>
                    )}
                  </span>
                </div>

                {/* Warning si zone par défaut */}
                {result.zone.isDefault && (
                  <div className="p-3 rounded-lg bg-muted/50 border border-muted flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground">
                      Zone non déterminée, estimation standard appliquée.
                    </p>
                  </div>
                )}

                {/* Label & métadonnées */}
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><span className="font-medium">Type :</span> {result.priceResult.label}</p>
                  <p><span className="font-medium">Quantité :</span> {result.priceResult.qty} {result.priceResult.unit}</p>
                </div>

                {/* Totaux PONDÉRÉS par zone */}
                {result.adjustedTotals && (result.adjustedTotals.min > 0 || result.adjustedTotals.max > 0) && (
                  <div className="pt-2 border-t border-primary/10 space-y-2">
                    <p className="text-lg font-bold text-foreground">
                      Fourchette :{" "}
                      <span className="text-primary">
                        {formatNumber(result.adjustedTotals.min)} € à {formatNumber(result.adjustedTotals.max)} € HT
                      </span>
                    </p>
                    <p className="text-base text-foreground">
                      Prix moyen estimé :{" "}
                      <span className="font-semibold text-primary">
                        {formatNumber(result.adjustedTotals.avg)} € HT
                      </span>
                    </p>
                  </div>
                )}

              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Disclaimer fixe */}
        <p className="text-xs text-muted-foreground text-center mt-4 px-4">
          Estimation basée sur des moyennes observées de main d'œuvre.<br />
          Les prix ne comprennent pas la fourniture des équipements sauf mention contraire.
        </p>
      </div>
    </section>
  );
};

export default DevisCalculatorSection;
