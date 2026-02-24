import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Shield,
  Upload,
  FileText,
  X,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAnonymousAuth } from "@/hooks/useAnonymousAuth";
import FunnelStepper from "@/components/funnel/FunnelStepper";
import { FILE_VALIDATION, UPLOAD, ANALYSIS } from "@/lib/constants";

type UploadStatus = "idle" | "uploading" | "success" | "error";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const NewAnalysis = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);

  // État upload explicite
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { user, isAnonymous, isPermanent, signInAnonymously } = useAnonymousAuth();

  useEffect(() => {
    // Auto sign-in anonymously if not logged in
    const ensureAuth = async () => {
      const { data: { user: existing } } = await supabase.auth.getUser();
      if (!existing) {
        await signInAnonymously();
      }
    };
    ensureAuth();
  }, [signInAnonymously]);

  const resetUploadState = () => {
    setUploadStatus("idle");
    setUploadedFilePath(null);
    setUploadError(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
    // Reset input pour permettre re-sélection du même fichier
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const validateAndSetFile = async (selectedFile: File) => {
    resetUploadState();

    // Vérification extension
    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (!ext || !FILE_VALIDATION.ALLOWED_EXTENSIONS.includes(ext)) {
      toast.error("Format non supporté. Utilisez PDF, JPG ou PNG.");
      return;
    }

    // Vérification type MIME (si fourni par le navigateur)
    if (selectedFile.type && !FILE_VALIDATION.ALLOWED_MIME_TYPES.includes(selectedFile.type)) {
      toast.error("Format non supporté. Utilisez PDF, JPG ou PNG.");
      return;
    }

    // Vérification taille > 0
    if (!selectedFile.size || selectedFile.size === 0) {
      toast.error("Le fichier semble vide ou corrompu. Veuillez réessayer.");
      return;
    }

    // Vérification taille max
    if (selectedFile.size > FILE_VALIDATION.MAX_SIZE_BYTES) {
      toast.error("Fichier trop volumineux. Maximum 10 Mo.");
      return;
    }

    // Vérification supplémentaire : lire le début du fichier pour s'assurer qu'il est lisible
    try {
      const slice = selectedFile.slice(0, FILE_VALIDATION.HEADER_READ_SIZE);
      await slice.arrayBuffer();
    } catch (err) {
      console.error("File read error:", err);
      toast.error("Impossible de lire le fichier. Veuillez réessayer.");
      return;
    }

    setFile(selectedFile);

    // Lancer l'upload immédiatement
    if (user) {
      await uploadFile(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  const uploadFile = async (fileToUpload: File) => {
    if (!user) return;

    setUploadStatus("uploading");
    setUploadError(null);

    const fileExt = fileToUpload.name.split(".").pop()?.toLowerCase() || "pdf";
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    // Déterminer le content-type
    let contentType = fileToUpload.type;
    if (!contentType || contentType === "application/octet-stream") {
      // Fallback basé sur extension
      const mimeMap: Record<string, string> = {
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        heic: "image/heic",
      };
      contentType = mimeMap[fileExt] || "application/pdf";
    }

    for (let i = 0; i < UPLOAD.MAX_RETRIES; i++) {
      try {
        const { data, error } = await supabase.storage.from("devis").upload(filePath, fileToUpload, {
          cacheControl: UPLOAD.CACHE_CONTROL_SECONDS,
          upsert: false,
          contentType,
        });

        if (error) {
          const msg = String((error as any)?.message ?? "");
          const status = (error as any)?.statusCode ?? (error as any)?.status;

          console.error(`Upload error attempt ${i + 1}:`, error);

          // Erreur réseau → retry
          const isNetworkError = !status && /failed to fetch/i.test(msg);

          if (isNetworkError && i < UPLOAD.MAX_RETRIES - 1) {
            await wait(UPLOAD.RETRY_BACKOFF_MS * (i + 1));
            continue;
          }

          // Erreur définitive
          let errorMessage = "Erreur lors du téléversement";

          if (!status && /failed to fetch/i.test(msg)) {
            errorMessage =
              "Connexion impossible au serveur. Vérifiez votre connexion internet, désactivez votre VPN/Adblock, ou réessayez.";
          } else if (status === 413) {
            errorMessage = "Fichier trop volumineux pour le serveur.";
          } else if (status === 403) {
            errorMessage = "Accès refusé. Veuillez vous reconnecter.";
          }

          setUploadStatus("error");
          setUploadError(errorMessage);
          toast.error(errorMessage);
          return;
        }

        // Upload réussi - vérifier que le fichier existe bien
        const { data: fileInfo } = await supabase.storage.from("devis").list(user.id, {
          search: fileName,
        });

        if (!fileInfo || fileInfo.length === 0) {
          throw new Error("Le fichier n'a pas été trouvé après upload");
        }

        const uploadedFile = fileInfo.find((f) => f.name === fileName);
        if (!uploadedFile || !uploadedFile.metadata?.size || uploadedFile.metadata.size === 0) {
          // Vérification alternative via metadata
          const checkSize = uploadedFile?.metadata?.size ?? (uploadedFile as any)?.size ?? 0;
          if (checkSize === 0) {
            throw new Error("Le fichier uploadé est vide");
          }
        }

        setUploadStatus("success");
        setUploadedFilePath(filePath);
        toast.success("Fichier téléversé avec succès !");
        return;
      } catch (err: any) {
        console.error(`Upload exception attempt ${i + 1}:`, err);

        if (i === UPLOAD.MAX_RETRIES - 1) {
          setUploadStatus("error");
          setUploadError(err.message || "Erreur inattendue lors du téléversement");
          toast.error(err.message || "Erreur inattendue lors du téléversement");
        } else {
          await wait(UPLOAD.RETRY_BACKOFF_MS * (i + 1));
        }
      }
    }
  };

  const handleRemoveFile = () => {
    // Si un fichier a été uploadé, on pourrait le supprimer du storage
    // Mais on garde simple pour l'instant
    setFile(null);
    resetUploadState();
  };

  const handleRetryUpload = async () => {
    if (file && user) {
      await uploadFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Vérifications critiques
    if (!file) {
      toast.error("Veuillez sélectionner un fichier");
      return;
    }

    if (!user) {
      toast.error("Session expirée. Veuillez réessayer.");
      return;
    }

    if (file.size === 0) {
      toast.error("Le fichier semble vide. Veuillez sélectionner un autre fichier.");
      return;
    }

    if (uploadStatus !== "success" || !uploadedFilePath) {
      toast.error("Le fichier n'a pas été téléversé. Veuillez patienter ou réessayer.");
      return;
    }

    setLoading(true);

    try {
      // Rafraîchir la session pour garantir un JWT valide
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        toast.error("Session expirée. Veuillez réessayer.");
        return;
      }

      // Créer l'enregistrement d'analyse avec le type de travaux
      const { data: analysis, error: insertError } = await supabase
        .from("analyses")
        .insert({
          user_id: user.id,
          file_name: file.name,
          file_path: uploadedFilePath,
          status: "pending",
        })
        .select()
        .single();

      if (insertError || !analysis) {
        console.error("Insert error:", insertError);
        const detail = insertError?.message || insertError?.code || "";
        if (detail.includes("row-level security") || insertError?.code === "42501") {
          throw new Error("Session expirée ou permissions insuffisantes. Veuillez vous reconnecter.");
        }
        throw new Error(detail || "Erreur lors de la création de l'analyse");
      }

      toast.success("Analyse lancée...");

      // Déclencher l'analyse (synchrone, avec timeout)
      const invokePromise = supabase.functions.invoke("analyze-quote", {
        body: { analysisId: analysis.id, skipN8N: false },
      });

      // Timeout — redirige même si la fonction n'a pas fini
      const timeoutPromise = new Promise<{ data: null; error: null }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: null }), ANALYSIS.FUNCTION_TIMEOUT_MS)
      );

      const { error: functionError } = await Promise.race([invokePromise, timeoutPromise]);

      if (functionError) {
        const anyErr = functionError as any;
        const msg = anyErr?.context?.message ?? anyErr?.message ?? JSON.stringify(functionError);
        console.error("Function error:", functionError);
        toast.error("Erreur analyse : " + msg);
      }

      window.location.href = `/analyse/${analysis.id}`;
    } catch (error) {
      console.error("Submit error:", error);
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = file && file.size > 0 && uploadStatus === "success" && uploadedFilePath && !loading;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground">VerifierMonDevis.fr</span>
          </a>
        </div>
      </header>

      <main className="container py-8 max-w-2xl">
        {/* Funnel Stepper */}
        <FunnelStepper currentStep={1} />

        {/* Back Button */}
        <a
          href={isPermanent ? "/tableau-de-bord" : "/"}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {isPermanent ? "Retour au tableau de bord" : "Retour à l'accueil"}
        </a>

        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            Nouvelle analyse de devis
          </h1>
          <p className="text-muted-foreground">
            Téléchargez votre devis et obtenez un score de fiabilité en quelques minutes
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* File Upload */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Votre devis</Label>

            {!file ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
                  border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200
                  ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  }
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.heic,application/pdf,image/jpeg,image/png,image/heic"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Upload className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Glissez votre devis ici</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  ou cliquez pour sélectionner un fichier
                </p>
                <p className="text-xs text-muted-foreground">PDF, JPG ou PNG • Maximum 10 Mo</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} Mo
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleRemoveFile}
                    disabled={loading || uploadStatus === "uploading"}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>

                {/* Statut upload */}
                <div className="mt-3 pt-3 border-t border-border">
                  {uploadStatus === "uploading" && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Téléversement en cours...</span>
                    </div>
                  )}

                  {uploadStatus === "success" && (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm">Fichier prêt pour l'analyse</span>
                    </div>
                  )}

                  {uploadStatus === "error" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm">{uploadError || "Erreur de téléversement"}</span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRetryUpload}
                        className="mt-2"
                      >
                        Réessayer le téléversement
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-base font-semibold">
              Notes complémentaires (optionnel)
            </Label>
            <Textarea
              id="notes"
              placeholder="Informations supplémentaires sur votre projet..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              disabled={loading}
            />
          </div>

          {/* Submit */}
          {loading ? (
            <div className="w-full rounded-xl overflow-hidden border border-primary/20">
              <style>{`
                @keyframes tools-scroll {
                  0%   { transform: translateX(0); }
                  100% { transform: translateX(-50%); }
                }
                .tools-ticker {
                  animation: tools-scroll 7s linear infinite;
                }
              `}</style>

              {/* Tapis roulant d'outils */}
              <div className="overflow-hidden bg-primary/10 py-2.5">
                <div className="tools-ticker flex gap-4 text-2xl whitespace-nowrap w-max">
                  {["🔨","🪚","🔧","🪛","🔩","📐","📏","🧰","🪣","💡","🔌","🪜","🧱","🔍","📋",
                    "🔨","🪚","🔧","🪛","🔩","📐","📏","🧰","🪣","💡","🔌","🪜","🧱","🔍","📋"
                  ].map((tool, i) => (
                    <span key={i} className="flex-shrink-0">{tool}</span>
                  ))}
                </div>
              </div>

              {/* Texte de statut */}
              <div className="flex items-center gap-3 py-4 px-5 bg-primary/5">
                <Loader2 className="h-5 w-5 animate-spin text-primary flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground text-sm">Analyse en cours, patience !</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Lecture du devis · Vérification entreprise · Calcul du score
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
              {uploadStatus === "uploading" ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Téléversement...
                </>
              ) : (
                <>
                  Lancer l'analyse
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </Button>
          )}

          {/* Info */}
          <p className="text-xs text-center text-muted-foreground">
            Vos données sont protégées et traitées conformément au RGPD. L'analyse est informative
            et ne constitue pas un conseil juridique.
          </p>
        </form>
      </main>
    </div>
  );
};

export default NewAnalysis;
