import { useState } from "react";
import { Sparkles, RefreshCw, Plus, X, Link, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AiGenerationPanelProps {
  onArticleCreated: (postId: string, slug: string, openEditor?: boolean) => void;
}

const AiGenerationPanel = ({ onArticleCreated }: AiGenerationPanelProps) => {
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [targetLength, setTargetLength] = useState("1200");
  const [sourceUrls, setSourceUrls] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPost, setGeneratedPost] = useState<{ id: string; title: string; slug: string } | null>(null);

  const addUrl = () => {
    const url = newUrl.trim();
    if (!url) return;
    try {
      new URL(url);
      if (!sourceUrls.includes(url)) {
        setSourceUrls(prev => [...prev, url]);
      }
      setNewUrl("");
    } catch {
      toast({ title: "URL invalide", description: "Veuillez saisir une URL valide", variant: "destructive" });
    }
  };

  const removeUrl = (index: number) => {
    setSourceUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addUrl();
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast({ title: "Erreur", description: "Veuillez saisir un sujet", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setGeneratedPost(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non authentifié");

      const response = await supabase.functions.invoke("generate-blog-article", {
        body: {
          topic: topic.trim(),
          keywords: keywords ? keywords.split(",").map(k => k.trim()).filter(Boolean) : [],
          targetLength: parseInt(targetLength),
          sourceUrls: sourceUrls.length > 0 ? sourceUrls : undefined,
        },
      });

      if (response.error) {
        let errorBody: Record<string, string> | null = null;
        try {
          const ctx = (response.error as any).context;
          if (ctx && typeof ctx.json === "function") {
            errorBody = await ctx.json();
          }
        } catch { /* ignore parse errors */ }
        console.error("Function error:", response.error.message, "Error body:", errorBody);
        const msg = errorBody?.error || response.error.message || "Erreur inconnue";
        const details = errorBody?.details || errorBody?.message || "";
        throw new Error(`${msg}${details ? ` — ${details}` : ""}`);
      }

      const result = response.data;
      console.log("Function result:", result);
      if (!result?.success) {
        throw new Error(result?.error ? `${result.error} (${result.details || ''} ${result.message || ''})` : "Erreur de génération");
      }

      setGeneratedPost({
        id: result.post.id,
        title: result.post.title,
        slug: result.post.slug,
      });

      toast({
        title: "Article généré",
        description: `"${result.post.title}" créé en brouillon IA`,
      });

      onArticleCreated(result.post.id, result.post.slug, true);
    } catch (error: any) {
      toast({
        title: "Erreur de génération",
        description: error.message || "Impossible de générer l'article",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const resetForm = () => {
    setTopic("");
    setKeywords("");
    setTargetLength("1200");
    setSourceUrls([]);
    setNewUrl("");
    setGeneratedPost(null);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Générer un article avec l'IA
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            L'article sera créé en brouillon et devra être relu avant publication.
            Propulsé par Claude (Anthropic).
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Topic */}
          <div>
            <Label htmlFor="ai-topic">Sujet / Pitch de l'article</Label>
            <Textarea
              id="ai-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex: Comment vérifier les assurances d'un artisan avant de signer un devis. Expliquer les différents types d'assurances, les vérifications à faire, et les pièges à éviter."
              rows={4}
              className="mt-1"
            />
          </div>

          {/* Keywords */}
          <div>
            <Label htmlFor="ai-keywords">Mots-clés SEO (optionnel)</Label>
            <Input
              id="ai-keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="devis artisan, assurance décennale, garantie"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Séparés par des virgules
            </p>
          </div>

          {/* Target length */}
          <div>
            <Label>Longueur cible</Label>
            <Select value={targetLength} onValueChange={setTargetLength}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="800">Court (~800 mots)</SelectItem>
                <SelectItem value="1200">Moyen (~1200 mots)</SelectItem>
                <SelectItem value="1500">Long (~1500 mots)</SelectItem>
                <SelectItem value="2000">Très long (~2000 mots)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Source URLs */}
          <div>
            <Label className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              URLs sources (optionnel)
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              Ajoutez des URLs que Claude utilisera comme références pour enrichir l'article.
            </p>

            {/* URL list */}
            {sourceUrls.length > 0 && (
              <div className="space-y-1 mb-3">
                {sourceUrls.map((url, index) => (
                  <div key={index} className="flex items-center gap-2 bg-muted/50 rounded px-3 py-1.5">
                    <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate flex-1">{url}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0"
                      onClick={() => removeUrl(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add URL input */}
            <div className="flex gap-2">
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={handleUrlKeyDown}
                placeholder="https://example.com/article-source"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addUrl}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Generate button */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !topic.trim()}
              className="flex-1"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Génération en cours...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Générer l'article
                </>
              )}
            </Button>
            {(topic || keywords || sourceUrls.length > 0) && !isGenerating && (
              <Button variant="outline" onClick={resetForm}>
                Réinitialiser
              </Button>
            )}
          </div>

          {/* Generated post result */}
          {generatedPost && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-green-600" />
                <span className="font-medium text-green-800">Article créé avec succès</span>
              </div>
              <p className="text-sm text-green-700 mb-3">
                "{generatedPost.title}" a été créé en brouillon IA.
              </p>
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                  Brouillon IA
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">
                  /blog/{generatedPost.slug}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AiGenerationPanel;
