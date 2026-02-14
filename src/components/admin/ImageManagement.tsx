import { useState, useRef } from "react";
import { Upload, Sparkles, Trash2, Image, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ImageSectionProps {
  label: string;
  type: "cover" | "mid";
  imageUrl: string | null | undefined;
  postId: string | undefined;
  onImageChange: (url: string | null) => void;
  defaultPrompt?: string;
}

const ImageSection = ({ label, type, imageUrl, postId, onImageChange, defaultPrompt }: ImageSectionProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(defaultPrompt || "");
  const [mode, setMode] = useState<"upload" | "ai">("upload");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${postId || "new"}/${type}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("blog-images")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("blog-images")
        .getPublicUrl(fileName);

      onImageChange(publicUrl);
      toast({ title: "Image uploadée", description: `${label} mise à jour` });
    } catch (error: any) {
      toast({ title: "Erreur d'upload", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast({ title: "Erreur", description: "Veuillez saisir un prompt", variant: "destructive" });
      return;
    }

    if (!postId) {
      toast({ title: "Erreur", description: "Sauvegardez d'abord l'article avant de générer une image IA", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await supabase.functions.invoke("generate-blog-image", {
        body: { postId, type, prompt: aiPrompt.trim() },
      });

      if (response.error) {
        let errorBody: Record<string, string> | null = null;
        try {
          const ctx = (response.error as any).context;
          if (ctx && typeof ctx.json === "function") errorBody = await ctx.json();
        } catch { /* ignore */ }
        console.error("Image function error:", response.error.message, "Body:", errorBody);
        throw new Error(errorBody?.error ? `${errorBody.error} — ${errorBody.details || errorBody.message || ""}` : response.error.message);
      }
      if (!response.data?.success) throw new Error(response.data?.error || "Erreur de génération");

      onImageChange(response.data.url);
      toast({ title: "Image générée", description: `${label} générée par IA` });
      setAiPrompt("");
    } catch (error: any) {
      toast({ title: "Erreur de génération", description: error.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemove = () => {
    onImageChange(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <div className="flex gap-1">
          <Button
            type="button"
            variant={mode === "upload" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("upload")}
          >
            <Upload className="h-3 w-3 mr-1" />
            Upload
          </Button>
          <Button
            type="button"
            variant={mode === "ai" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("ai")}
          >
            <Sparkles className="h-3 w-3 mr-1" />
            IA
          </Button>
        </div>
      </div>

      {/* Current image preview */}
      {imageUrl && (
        <div className="relative group">
          <img
            src={imageUrl}
            alt={label}
            className="w-full h-32 object-cover rounded-lg border"
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleRemove}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Upload mode */}
      {mode === "upload" && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Upload en cours...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Choisir un fichier
              </>
            )}
          </Button>
        </div>
      )}

      {/* AI generation mode */}
      {mode === "ai" && (
        <div className="space-y-2">
          <Textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder={`Décrivez l'image ${type === "cover" ? "de couverture" : "d'illustration"} souhaitée...`}
            rows={2}
            className="text-sm"
          />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="sm"
            onClick={handleAiGenerate}
            disabled={isGenerating || !postId}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Génération en cours...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Générer avec fal.ai
              </>
            )}
          </Button>
          {!postId && (
            <p className="text-xs text-muted-foreground">
              Sauvegardez l'article d'abord pour générer une image IA
            </p>
          )}
        </div>
      )}
    </div>
  );
};

interface ImageManagementProps {
  coverImageUrl: string | null | undefined;
  midImageUrl: string | null | undefined;
  postId: string | undefined;
  onCoverChange: (url: string | null) => void;
  onMidChange: (url: string | null) => void;
  articleTitle?: string;
  articleExcerpt?: string;
}

const ImageManagement = ({ coverImageUrl, midImageUrl, postId, onCoverChange, onMidChange, articleTitle, articleExcerpt }: ImageManagementProps) => {
  const summary = [articleTitle, articleExcerpt].filter(Boolean).join(" — ");
  const coverPrompt = summary
    ? `Professional blog cover image for an article about: ${summary}. Clean, modern, high quality illustration.`
    : "";
  const midPrompt = summary
    ? `Illustration for a blog article about: ${summary}. Informative, clean visual, modern style.`
    : "";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="h-4 w-4" />
          Images
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <ImageSection
          label="Image de couverture"
          type="cover"
          imageUrl={coverImageUrl}
          postId={postId}
          onImageChange={onCoverChange}
          defaultPrompt={coverPrompt}
        />
        <div className="border-t pt-4">
          <ImageSection
            label="Image mi-texte"
            type="mid"
            imageUrl={midImageUrl}
            postId={postId}
            onImageChange={onMidChange}
            defaultPrompt={midPrompt}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default ImageManagement;
