import {
  ArrowLeft, Save, Eye, EyeOff, Code, RefreshCw,
  Sparkles, CheckCircle, XCircle, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sanitizeArticleHtml, generateSlug } from "@/lib/blogUtils";
import ArticleContent from "@/components/blog/ArticleContent";
import { workflowBadge, type BlogPost } from "./blogTypes";

interface BlogPostEditorProps {
  selectedPost: Partial<BlogPost>;
  rawHtmlInput: string;
  isSaving: boolean;
  onPostChange: (updater: (prev: Partial<BlogPost> | null) => Partial<BlogPost> | null) => void;
  onRawHtmlChange: (html: string) => void;
  onSave: () => void;
  onBack: () => void;
  onApprove: (post: BlogPost) => void;
  onReject: (post: BlogPost) => void;
  onScheduleOpen: (post: BlogPost) => void;
  onSanitize: () => void;
}

const BlogPostEditor = ({
  selectedPost,
  rawHtmlInput,
  isSaving,
  onPostChange,
  onRawHtmlChange,
  onSave,
  onBack,
  onApprove,
  onReject,
  onScheduleOpen,
  onSanitize,
}: BlogPostEditorProps) => {
  const isAiDraft = selectedPost.workflow_status === "ai_draft";

  const handleTitleChange = (title: string) => {
    onPostChange(prev => ({
      ...prev,
      title,
      slug: prev?.slug || generateSlug(title),
    }));
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* AI Draft banner */}
      {isAiDraft && (
        <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-orange-600" />
            <span className="text-orange-800 font-medium">
              Article généré par IA — à relire avant publication
            </span>
            {selectedPost.ai_model && (
              <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">
                {selectedPost.ai_model}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => selectedPost.id && onReject(selectedPost as BlogPost)}
            >
              <XCircle className="mr-1 h-4 w-4" />
              Rejeter
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => selectedPost.id && onApprove(selectedPost as BlogPost)}
            >
              <CheckCircle className="mr-1 h-4 w-4" />
              Approuver
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour à la liste
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onSanitize}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Nettoyer HTML
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contenu de l'article</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Titre</Label>
                <Input
                  id="title"
                  value={selectedPost.title || ""}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Titre de l'article"
                />
              </div>

              <div>
                <Label htmlFor="slug">Slug (URL)</Label>
                <Input
                  id="slug"
                  value={selectedPost.slug || ""}
                  onChange={(e) => onPostChange(prev => ({ ...prev, slug: e.target.value }))}
                  placeholder="mon-article"
                />
              </div>

              <div>
                <Label htmlFor="excerpt">Extrait</Label>
                <Textarea
                  id="excerpt"
                  value={selectedPost.excerpt || ""}
                  onChange={(e) => onPostChange(prev => ({ ...prev, excerpt: e.target.value }))}
                  placeholder="Résumé court de l'article"
                  rows={2}
                />
              </div>

              <Tabs defaultValue="html" className="w-full">
                <TabsList>
                  <TabsTrigger value="html">
                    <Code className="mr-2 h-4 w-4" />
                    HTML
                  </TabsTrigger>
                  <TabsTrigger value="preview">
                    <Eye className="mr-2 h-4 w-4" />
                    Prévisualisation
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="html">
                  <div className="space-y-2">
                    <Label>Contenu HTML (coller le HTML brut)</Label>
                    <Textarea
                      value={rawHtmlInput}
                      onChange={(e) => onRawHtmlChange(e.target.value)}
                      placeholder="<div class='container'>...</div>"
                      className="font-mono text-sm min-h-[400px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Collez le HTML complet de l'article. Le bouton "Nettoyer HTML" appliquera les règles d'import automatiquement.
                    </p>
                  </div>
                </TabsContent>
                <TabsContent value="preview">
                  <div className="border rounded-lg p-6 bg-card min-h-[400px] overflow-auto">
                    <ArticleContent html={sanitizeArticleHtml(rawHtmlInput)} />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Publication</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Statut</Label>
                <div className="flex gap-2">
                  <Badge variant={selectedPost.status === "published" ? "default" : "secondary"}>
                    {selectedPost.status === "published" ? "Publié" : "Brouillon"}
                  </Badge>
                  {workflowBadge(selectedPost.workflow_status)}
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onPostChange(prev => ({
                  ...prev,
                  status: prev?.status === "published" ? "draft" : "published"
                }))}
              >
                {selectedPost.status === "published" ? (
                  <>
                    <EyeOff className="mr-2 h-4 w-4" />
                    Passer en brouillon
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    Publier
                  </>
                )}
              </Button>

              {/* Schedule button */}
              {selectedPost.id && selectedPost.status !== "published" &&
               (selectedPost.workflow_status === "ai_reviewed" || selectedPost.workflow_status === "manual") && (
                <Button
                  variant="outline"
                  className="w-full border-purple-300 text-purple-700 hover:bg-purple-50"
                  onClick={() => onScheduleOpen(selectedPost as BlogPost)}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  Programmer la publication
                </Button>
              )}

              {/* Show scheduled date */}
              {selectedPost.scheduled_at && selectedPost.workflow_status === "scheduled" && (
                <div className="text-sm text-purple-700 bg-purple-50 p-2 rounded">
                  Publication prévue le{" "}
                  {new Date(selectedPost.scheduled_at).toLocaleDateString("fr-FR", {
                    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Métadonnées</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="category">Catégorie</Label>
                <Input
                  id="category"
                  value={selectedPost.category || ""}
                  onChange={(e) => onPostChange(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="Devis & Conseils"
                />
              </div>

              <div>
                <Label htmlFor="cover">URL image de couverture</Label>
                <Input
                  id="cover"
                  value={selectedPost.cover_image_url || ""}
                  onChange={(e) => onPostChange(prev => ({ ...prev, cover_image_url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>

              <div>
                <Label htmlFor="tags">Tags (séparés par des virgules)</Label>
                <Input
                  id="tags"
                  value={(selectedPost.tags || []).join(", ")}
                  onChange={(e) => onPostChange(prev => ({
                    ...prev,
                    tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean)
                  }))}
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
                <Label htmlFor="seo_title">Titre SEO</Label>
                <Input
                  id="seo_title"
                  value={selectedPost.seo_title || ""}
                  onChange={(e) => onPostChange(prev => ({ ...prev, seo_title: e.target.value }))}
                  placeholder="Titre pour les moteurs de recherche"
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {(selectedPost.seo_title || "").length}/60 caractères
                </p>
              </div>

              <div>
                <Label htmlFor="seo_desc">Description SEO</Label>
                <Textarea
                  id="seo_desc"
                  value={selectedPost.seo_description || ""}
                  onChange={(e) => onPostChange(prev => ({ ...prev, seo_description: e.target.value }))}
                  placeholder="Description pour les moteurs de recherche"
                  rows={3}
                  maxLength={160}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {(selectedPost.seo_description || "").length}/160 caractères
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default BlogPostEditor;
