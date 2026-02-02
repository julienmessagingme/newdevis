import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, Loader2, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import JobTypeSelector, { type JobTypeItem } from "./JobTypeSelector";

// Types STRICTS pour la réponse API - contrat exact
interface APIResponse {
  ok: boolean;
  errors?: string[];
  currency?: string;
  input?: {
    job_type: string;
    qty: number;
    zip: string;
    unit: string;
  };
  sheet?: {
    label: string;
    unit: string;
    price_min_unit_ht: number;
    price_avg_unit_ht: number;
    price_max_unit_ht: number;
  };
  totals?: {
    total_min_ht: number;
    total_avg_ht: number;
    total_max_ht: number;
  };
  explain?: string;
  warnings?: string[];
}

const API_ENDPOINT = "https://n8n.messagingme.app/webhook/Calculette";

const DevisCalculatorSection = () => {
  const [jobType, setJobType] = useState<string>("");
  const [selectedJobData, setSelectedJobData] = useState<JobTypeItem | null>(null);
  const [quantity, setQuantity] = useState<string>("");
  const [zip, setZip] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<APIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Determine unit type from selected job
  const isForfait = selectedJobData?.unit === "forfait";
  const isFormValid = jobType && (isForfait || (quantity && Number(quantity) > 0)) && zip.length === 5;

  const handleCalculate = async () => {
    if (!isFormValid) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      // Body JSON strict : job_type, qty, zip
      const body = {
        job_type: jobType,
        qty: isForfait ? 1 : Number(quantity),
        zip: zip,
      };

      console.log("[Calculette] POST →", API_ENDPOINT, body);

      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: APIResponse = await response.json();
      console.log("[Calculette] Response ←", data);

      // Si ok=false, afficher les erreurs de l'API
      if (data.ok === false) {
        const errorMessages = data.errors?.join(", ") || "Erreur inconnue de l'API";
        setError(errorMessages);
        return;
      }

      // ok=true : stocker la réponse complète pour affichage
      setResult(data);
    } catch (err) {
      console.error("[Calculette] Error:", err);
      setError(err instanceof Error ? err.message : "Erreur de connexion à l'API");
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
            {!isForfait && (
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantité</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  placeholder="ex: 45"
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

            {/* Result Display - AFFICHAGE STRICT de la réponse API */}
            {result && !error && (
              <div className="p-6 rounded-lg bg-primary/5 border border-primary/20 space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-semibold">Estimation calculée</span>
                </div>

                {/* Warnings de l'API */}
                {result.warnings && result.warnings.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-sm text-muted-foreground space-y-1">
                      {result.warnings.map((warning, idx) => (
                        <p key={idx}>{warning}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Label & métadonnées de l'API (depuis sheet et input) */}
                <div className="text-sm text-muted-foreground space-y-1">
                  {result.sheet?.label && (
                    <p><span className="font-medium">Type :</span> {result.sheet.label}</p>
                  )}
                  {result.input && (
                    <p><span className="font-medium">Quantité :</span> {result.input.qty} {result.input.unit}</p>
                  )}
                </div>

                {/* Totals de l'API - AFFICHAGE STRICT */}
                {result.totals && (
                  <div className="pt-2 border-t border-primary/10 space-y-2">
                    <p className="text-lg font-bold text-foreground">
                      Fourchette :{" "}
                      <span className="text-primary">
                        {formatNumber(result.totals.total_min_ht)} € à {formatNumber(result.totals.total_max_ht)} € HT
                      </span>
                    </p>
                    <p className="text-base text-foreground">
                      Prix moyen estimé :{" "}
                      <span className="font-semibold text-primary">
                        {formatNumber(result.totals.total_avg_ht)} € HT
                      </span>
                    </p>
                  </div>
                )}

                {/* Détail pédagogique - explain de l'API */}
                {result.explain && (
                  <div className="pt-2 border-t border-primary/10">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Détail :</span> {result.explain}
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
