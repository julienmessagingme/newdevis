import { useState } from "react";
import { Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { generateSlug, sanitizeArticleHtml } from "@/lib/blogUtils";
import RichTextToolbar from "./RichTextToolbar";
import ImageManagement from "./ImageManagement";
import ArticleContent from "@/components/blog/ArticleContent";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Code } from "lucide-react";

interface ManualWriteEditorProps {
  onArticleCreated: (postId: string, slug: string) => void;
}

const ManualWriteEditor = ({ onArticleCreated }: ManualWriteEditorProps) => {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [category, setCategory] = useState("Devis & Conseils");
  const [tags, setTags] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [midImageUrl, setMidImageUrl] = useState<string | null>(null);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedPostId, setSavedPostId] = useState<string | undefined>(undefined);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slug || slug === generateSlug(title)) {
      setSlug(generateSlug(value));
    }
  };

  const handleSave = async () => {
    if (!title || !slug) {
      toast({ title: "Erreur", description: "Titre et slug obligatoires", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    try {
      const sanitizedHtml = sanitizeArticleHtml(contentHtml);

      const postData = {
        title,
        slug,
        excerpt: excerpt || null,
        content_html: sanitizedHtml,
        category: category || null,
        tags: tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        cover_image_url: coverImageUrl || null,
        mid_image_url: midImageUrl || null,
        status: "draft" as const,
        workflow_status: "manual",
        seo_title: seoTitle || null,
        seo_description: seoDescription || null,
      };

      if (savedPostId) {
        const { error } = await supabase
          .from("blog_posts")
          .update(postData)
          .eq("id", savedPostId);

        if (error) throw error;
        toast({ title: "Succès", description: "Article mis à jour" });
      } else {
        const { data, error } = await supabase
          .from("blog_posts")
          .insert(postData)
          .select("id")
          .single();

        if (error) throw error;
        setSavedPostId(data.id);
        toast({ title: "Succès", description: "Article créé en brouillon" });
        onArticleCreated(data.id, slug);
      }
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Rédaction manuelle</h2>
          <p className="text-sm text-muted-foreground">Créez un article depuis zéro</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Enregistrement...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {savedPostId ? "Mettre à jour" : "Sauvegarder le brouillon"}
            </>
          )}
        </Button>
      </div>

      {savedPostId && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Sauvegardé</Badge>
          <span className="text-sm text-green-700">
            Article sauvegardé — vous pouvez maintenant générer des images IA
          </span>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contenu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="manual-title">Titre</Label>
                <Input
                  id="manual-title"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Titre de l'article"
                />
              </div>

              <div>
                <Label htmlFor="manual-slug">Slug (URL)</Label>
                <Input
                  id="manual-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="mon-article"
                />
              </div>

              <div>
                <Label htmlFor="manual-excerpt">Extrait</Label>
                <Textarea
                  id="manual-excerpt"
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="Résumé court de l'article"
                  rows={2}
                />
              </div>

              <div>
                <Label>Contenu de l'article</Label>
                <Tabs defaultValue="editor" className="mt-1">
                  <TabsList>
                    <TabsTrigger value="editor">Éditeur</TabsTrigger>
                    <TabsTrigger value="preview">
                      <Eye className="mr-1 h-4 w-4" />
                      Aperçu
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="editor">
                    <RichTextToolbar
                      value={contentHtml}
                      onChange={setContentHtml}
                    />
                  </TabsContent>
                  <TabsContent value="preview">
                    <div className="border rounded-lg p-6 bg-card min-h-[400px] overflow-auto">
                      <ArticleContent html={sanitizeArticleHtml(contentHtml)} />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Sidebar */}
        <div className="space-y-6">
          <ImageManagement
            coverImageUrl={coverImageUrl}
            midImageUrl={midImageUrl}
            postId={savedPostId}
            onCoverChange={setCoverImageUrl}
            onMidChange={setMidImageUrl}
          />

          <Card>
            <CardHeader>
              <CardTitle>Métadonnées</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="manual-category">Catégorie</Label>
                <Input
                  id="manual-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Devis & Conseils"
                />
              </div>

              <div>
                <Label htmlFor="manual-tags">Tags (séparés par des virgules)</Label>
                <Input
                  id="manual-tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="devis, artisan, rénovation"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SEO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="manual-seo-title">Titre SEO</Label>
                <Input
                  id="manual-seo-title"
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  placeholder="Titre pour les moteurs de recherche"
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {seoTitle.length}/60 caractères
                </p>
              </div>

              <div>
                <Label htmlFor="manual-seo-desc">Description SEO</Label>
                <Textarea
                  id="manual-seo-desc"
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  placeholder="Description pour les moteurs de recherche"
                  rows={3}
                  maxLength={160}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {seoDescription.length}/160 caractères
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ManualWriteEditor;
