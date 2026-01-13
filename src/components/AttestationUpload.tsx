import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileCheck, Loader2, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AttestationUploadProps {
  analysisId: string;
  quoteInfo: {
    nom_entreprise?: string;
    siret?: string;
    adresse?: string;
    categorie_travaux?: string;
  };
  onUploadComplete: () => void;
}

interface UploadState {
  decennale: {
    uploading: boolean;
    uploaded: boolean;
    score?: "VERT" | "ORANGE" | "ROUGE";
  };
  rc_pro: {
    uploading: boolean;
    uploaded: boolean;
    score?: "VERT" | "ORANGE" | "ROUGE";
  };
}

const AttestationUpload = ({ analysisId, quoteInfo, onUploadComplete }: AttestationUploadProps) => {
  const [uploadState, setUploadState] = useState<UploadState>({
    decennale: { uploading: false, uploaded: false },
    rc_pro: { uploading: false, uploaded: false },
  });
  
  const decennaleInputRef = useRef<HTMLInputElement>(null);
  const rcproInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    type: "decennale" | "rc_pro"
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error("Format non supporté. Veuillez utiliser un PDF ou une image (JPG, PNG).");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Le fichier est trop volumineux. Taille maximale : 10 Mo.");
      return;
    }

    setUploadState(prev => ({
      ...prev,
      [type]: { ...prev[type], uploading: true },
    }));

    try {
      // Convert file to base64
      const base64 = await fileToBase64(file);
      
      // Call edge function to analyze attestation
      const { data, error } = await supabase.functions.invoke("analyze-attestation", {
        body: {
          analysisId,
          attestationType: type,
          fileBase64: base64,
          mimeType: file.type,
          quoteInfo,
        },
      });

      if (error) {
        throw error;
      }

      setUploadState(prev => ({
        ...prev,
        [type]: {
          uploading: false,
          uploaded: true,
          score: data.score,
        },
      }));

      const typeLabel = type === "decennale" ? "décennale" : "RC Pro";
      
      if (data.score === "VERT") {
        toast.success(`Attestation ${typeLabel} : cohérente avec le devis`);
      } else if (data.score === "ORANGE") {
        toast.warning(`Attestation ${typeLabel} : informations incomplètes`);
      } else {
        toast.error(`Attestation ${typeLabel} : incohérences détectées`);
      }

      onUploadComplete();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Erreur lors de l'analyse de l'attestation");
      setUploadState(prev => ({
        ...prev,
        [type]: { ...prev[type], uploading: false },
      }));
    }

    // Reset input
    event.target.value = "";
  };

  const getScoreIcon = (score?: "VERT" | "ORANGE" | "ROUGE") => {
    switch (score) {
      case "VERT":
        return <CheckCircle2 className="h-5 w-5 text-score-green" />;
      case "ORANGE":
        return <AlertCircle className="h-5 w-5 text-score-orange" />;
      case "ROUGE":
        return <XCircle className="h-5 w-5 text-score-red" />;
      default:
        return null;
    }
  };

  const getScoreLabel = (score?: "VERT" | "ORANGE" | "ROUGE") => {
    switch (score) {
      case "VERT":
        return "Cohérente";
      case "ORANGE":
        return "À vérifier";
      case "ROUGE":
        return "Incohérente";
      default:
        return "";
    }
  };

  return (
    <div className="bg-muted/30 rounded-lg p-4 mt-4">
      <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
        <Upload className="h-4 w-4" />
        Vérification renforcée (optionnel)
      </h4>
      <p className="text-sm text-muted-foreground mb-4">
        Téléversez les attestations d'assurance pour une vérification approfondie des cohérences.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Décennale Upload */}
        <div className="bg-background rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-sm">Attestation Décennale</span>
            {uploadState.decennale.uploaded && getScoreIcon(uploadState.decennale.score)}
          </div>
          
          {uploadState.decennale.uploaded ? (
            <div className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-primary" />
              <span className={`text-sm ${
                uploadState.decennale.score === "VERT" ? "text-score-green" :
                uploadState.decennale.score === "ORANGE" ? "text-score-orange" :
                "text-score-red"
              }`}>
                {getScoreLabel(uploadState.decennale.score)}
              </span>
            </div>
          ) : (
            <>
              <input
                type="file"
                ref={decennaleInputRef}
                onChange={(e) => handleFileUpload(e, "decennale")}
                accept=".pdf,image/jpeg,image/png,image/webp"
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => decennaleInputRef.current?.click()}
                disabled={uploadState.decennale.uploading}
                className="w-full"
              >
                {uploadState.decennale.uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyse en cours...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Téléverser
                  </>
                )}
              </Button>
            </>
          )}
        </div>

        {/* RC Pro Upload */}
        <div className="bg-background rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-sm">Attestation RC Pro</span>
            {uploadState.rc_pro.uploaded && getScoreIcon(uploadState.rc_pro.score)}
          </div>
          
          {uploadState.rc_pro.uploaded ? (
            <div className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-primary" />
              <span className={`text-sm ${
                uploadState.rc_pro.score === "VERT" ? "text-score-green" :
                uploadState.rc_pro.score === "ORANGE" ? "text-score-orange" :
                "text-score-red"
              }`}>
                {getScoreLabel(uploadState.rc_pro.score)}
              </span>
            </div>
          ) : (
            <>
              <input
                type="file"
                ref={rcproInputRef}
                onChange={(e) => handleFileUpload(e, "rc_pro")}
                accept=".pdf,image/jpeg,image/png,image/webp"
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => rcproInputRef.current?.click()}
                disabled={uploadState.rc_pro.uploading}
                className="w-full"
              >
                {uploadState.rc_pro.uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyse en cours...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Téléverser
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-3 italic">
        Formats acceptés : PDF, JPG, PNG. Taille max : 10 Mo.
      </p>
    </div>
  );
};

// Helper to convert file to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data:xxx;base64, prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default AttestationUpload;
