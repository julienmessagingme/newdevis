import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Plus, Edit, Trash2, Eye, EyeOff, ArrowLeft, Save, 
  FileText, Calendar, Tag, Image, Code, RefreshCw 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/layout/Header";
import { sanitizeArticleHtml, generateSlug, formatArticleDate } from "@/lib/blogUtils";
import ArticleContent from "@/components/blog/ArticleContent";

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_html: string;
  category: string | null;
  tags: string[] | null;
  cover_image_url: string | null;
  status: string;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const emptyPost: Partial<BlogPost> = {
  title: "",
  slug: "",
  excerpt: "",
  content_html: "",
  category: "Devis & Conseils",
  tags: [],
  cover_image_url: "",
  status: "draft",
  seo_title: "",
  seo_description: "",
};

const AdminBlog = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<Partial<BlogPost> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [postToDelete, setPostToDelete] = useState<BlogPost | null>(null);
  const [rawHtmlInput, setRawHtmlInput] = useState("");

  useEffect(() => {
    checkAdminAndFetch();
  }, []);

  const checkAdminAndFetch = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/connexion");
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();

      if (!roleData) {
        toast({ title: "Accès refusé", description: "Vous n'êtes pas administrateur.", variant: "destructive" });
        navigate("/");
        return;
      }

      setIsAdmin(true);
      await fetchPosts();
    } catch (error) {
      console.error("Error checking admin:", error);
      navigate("/");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPosts = async () => {
    const { data, error } = await supabase
      .from("blog_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les articles", variant: "destructive" });
      return;
    }

    setPosts(data || []);
  };

  const handleNewPost = () => {
    setSelectedPost({ ...emptyPost });
    setRawHtmlInput("");
    setIsEditing(true);
  };

  const handleEditPost = (post: BlogPost) => {
    setSelectedPost(post);
    setRawHtmlInput(post.content_html);
    setIsEditing(true);
  };

  const handleSavePost = async () => {
    if (!selectedPost?.title || !selectedPost?.slug) {
      toast({ title: "Erreur", description: "Titre et slug obligatoires", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    try {
      // Sanitize the HTML before saving
      const sanitizedHtml = sanitizeArticleHtml(rawHtmlInput);
      
      const postData = {
        title: selectedPost.title!,
        slug: selectedPost.slug!,
        excerpt: selectedPost.excerpt || null,
        content_html: sanitizedHtml,
        category: selectedPost.category || null,
        tags: selectedPost.tags || [],
        cover_image_url: selectedPost.cover_image_url || null,
        status: selectedPost.status || "draft",
        seo_title: selectedPost.seo_title || null,
        seo_description: selectedPost.seo_description || null,
        published_at: selectedPost.status === "published" && !selectedPost.published_at 
          ? new Date().toISOString() 
          : selectedPost.published_at || null,
      };

      if (selectedPost.id) {
        // Update
        const { error } = await supabase
          .from("blog_posts")
          .update(postData)
          .eq("id", selectedPost.id);

        if (error) throw error;
        toast({ title: "Succès", description: "Article mis à jour" });
      } else {
        // Create
        const { error } = await supabase
          .from("blog_posts")
          .insert([postData]);

        if (error) throw error;
        toast({ title: "Succès", description: "Article créé" });
      }

      await fetchPosts();
      setIsEditing(false);
      setSelectedPost(null);
    } catch (error: any) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (post: BlogPost) => {
    const newStatus = post.status === "published" ? "draft" : "published";
    const { error } = await supabase
      .from("blog_posts")
      .update({ 
        status: newStatus,
        published_at: newStatus === "published" && !post.published_at 
          ? new Date().toISOString() 
          : post.published_at 
      })
      .eq("id", post.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    await fetchPosts();
    toast({ 
      title: "Succès", 
      description: newStatus === "published" ? "Article publié" : "Article dépublié" 
    });
  };

  const handleDeletePost = async () => {
    if (!postToDelete) return;

    const { error } = await supabase
      .from("blog_posts")
      .delete()
      .eq("id", postToDelete.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    await fetchPosts();
    setDeleteDialogOpen(false);
    setPostToDelete(null);
    toast({ title: "Succès", description: "Article supprimé" });
  };

  const handleTitleChange = (title: string) => {
    setSelectedPost(prev => ({
      ...prev,
      title,
      slug: prev?.slug || generateSlug(title),
    }));
  };

  const handleApplySanitization = () => {
    const sanitized = sanitizeArticleHtml(rawHtmlInput);
    setRawHtmlInput(sanitized);
    toast({ title: "HTML nettoyé", description: "Les règles d'import ont été appliquées" });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  if (isEditing && selectedPost) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container px-4 py-8">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <Button variant="ghost" onClick={() => setIsEditing(false)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour à la liste
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleApplySanitization}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Nettoyer HTML
                </Button>
                <Button onClick={handleSavePost} disabled={isSaving}>
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
                        onChange={(e) => setSelectedPost(prev => ({ ...prev, slug: e.target.value }))}
                        placeholder="mon-article"
                      />
                    </div>

                    <div>
                      <Label htmlFor="excerpt">Extrait</Label>
                      <Textarea
                        id="excerpt"
                        value={selectedPost.excerpt || ""}
                        onChange={(e) => setSelectedPost(prev => ({ ...prev, excerpt: e.target.value }))}
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
                            onChange={(e) => setRawHtmlInput(e.target.value)}
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
                      <Badge variant={selectedPost.status === "published" ? "default" : "secondary"}>
                        {selectedPost.status === "published" ? "Publié" : "Brouillon"}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setSelectedPost(prev => ({
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
                        onChange={(e) => setSelectedPost(prev => ({ ...prev, category: e.target.value }))}
                        placeholder="Devis & Conseils"
                      />
                    </div>

                    <div>
                      <Label htmlFor="cover">URL image de couverture</Label>
                      <Input
                        id="cover"
                        value={selectedPost.cover_image_url || ""}
                        onChange={(e) => setSelectedPost(prev => ({ ...prev, cover_image_url: e.target.value }))}
                        placeholder="https://..."
                      />
                    </div>

                    <div>
                      <Label htmlFor="tags">Tags (séparés par des virgules)</Label>
                      <Input
                        id="tags"
                        value={(selectedPost.tags || []).join(", ")}
                        onChange={(e) => setSelectedPost(prev => ({
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
                        onChange={(e) => setSelectedPost(prev => ({ ...prev, seo_title: e.target.value }))}
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
                        onChange={(e) => setSelectedPost(prev => ({ ...prev, seo_description: e.target.value }))}
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
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Gestion du Blog</h1>
              <p className="text-muted-foreground">Créez et gérez les articles du blog</p>
            </div>
            <Button onClick={handleNewPost}>
              <Plus className="mr-2 h-4 w-4" />
              Nouvel article
            </Button>
          </div>

          {posts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Aucun article</h2>
                <p className="text-muted-foreground mb-4">Créez votre premier article de blog</p>
                <Button onClick={handleNewPost}>
                  <Plus className="mr-2 h-4 w-4" />
                  Créer un article
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <Card key={post.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-foreground truncate">
                            {post.title}
                          </h3>
                          <Badge variant={post.status === "published" ? "default" : "secondary"}>
                            {post.status === "published" ? "Publié" : "Brouillon"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            {post.category || "Sans catégorie"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatArticleDate(post.published_at || post.created_at)}
                          </span>
                          <span className="text-xs font-mono text-muted-foreground">
                            /blog/{post.slug}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleStatus(post)}
                          title={post.status === "published" ? "Dépublier" : "Publier"}
                        >
                          {post.status === "published" ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditPost(post)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setPostToDelete(post);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer l'article</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer "{postToDelete?.title}" ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDeletePost}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminBlog;
