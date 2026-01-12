import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Shield, 
  Upload, 
  FileText, 
  X, 
  ArrowLeft,
  ArrowRight,
  HelpCircle,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const NewAnalysis = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [workType, setWorkType] = useState("");
  const [notes, setNotes] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Veuillez vous connecter");
        navigate("/connexion");
      } else {
        setUser(user);
      }
    };
    checkAuth();
  }, [navigate]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = (file: File) => {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/heic"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Format non supporté. Utilisez PDF, JPG ou PNG.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Fichier trop volumineux. Maximum 10 Mo.");
      return;
    }
    setFile(file);
    toast.success("Fichier prêt pour l'analyse");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user) {
      toast.error("Veuillez sélectionner un fichier");
      return;
    }

    setLoading(true);

    try {
      // Generate unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from("devis")
        .upload(filePath, file);

      if (uploadError) {
        throw new Error("Erreur lors du téléversement du fichier");
      }

      // Create analysis record
      const { data: analysis, error: insertError } = await supabase
        .from("analyses")
        .insert({
          user_id: user.id,
          file_name: file.name,
          file_path: filePath,
          status: "pending",
        })
        .select()
        .single();

      if (insertError || !analysis) {
        throw new Error("Erreur lors de la création de l'analyse");
      }

      toast.success("Fichier téléchargé ! Analyse en cours...");

      // Trigger the analysis
      const { error: functionError } = await supabase.functions.invoke("analyze-quote", {
        body: { analysisId: analysis.id },
      });

      if (functionError) {
        console.error("Function error:", functionError);
        toast.error("Erreur lors du démarrage de l'analyse. Veuillez réessayer.");
      }

      // Navigate to result page
      navigate(`/analyse/${analysis.id}`);

    } catch (error) {
      console.error("Error:", error);
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground">VerifierMonDevis.fr</span>
          </Link>
        </div>
      </header>

      <main className="container py-8 max-w-2xl">
        {/* Back Button */}
        <Link 
          to="/tableau-de-bord" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au tableau de bord
        </Link>

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
                  ${isDragging 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                  }
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.heic"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Upload className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">
                  Glissez votre devis ici
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  ou cliquez pour sélectionner un fichier
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, JPG ou PNG • Maximum 10 Mo
                </p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
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
                  onClick={() => setFile(null)}
                  disabled={loading}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            )}
          </div>

          {/* Work Type */}
          <div className="space-y-2">
            <Label htmlFor="workType" className="text-base font-semibold">
              Type de travaux (optionnel)
            </Label>
            <Input
              id="workType"
              placeholder="Ex: Plomberie, Électricité, Peinture, Toiture..."
              value={workType}
              onChange={(e) => setWorkType(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <HelpCircle className="h-3 w-3" />
              Aide à affiner la comparaison des prix du marché
            </p>
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
          <Button type="submit" size="lg" className="w-full" disabled={!file || loading}>
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Analyse en cours...
              </>
            ) : (
              <>
                Lancer l'analyse
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </Button>

          {/* Info */}
          <p className="text-xs text-center text-muted-foreground">
            Vos données sont protégées et traitées conformément au RGPD. 
            L'analyse est informative et ne constitue pas un conseil juridique.
          </p>
        </form>
      </main>
    </div>
  );
};

export default NewAnalysis;
