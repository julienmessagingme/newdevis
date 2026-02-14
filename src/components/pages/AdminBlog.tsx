import { useState, useEffect } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeArticleHtml } from "@/lib/blogUtils";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { type BlogPost, emptyPost } from "@/components/admin/blogTypes";
import BlogPostEditor from "@/components/admin/BlogPostEditor";
import BlogPostList from "@/components/admin/BlogPostList";
import ManualWriteEditor from "@/components/admin/ManualWriteEditor";
import AiGenerationPanel from "@/components/admin/AiGenerationPanel";
import { DeleteDialog, ScheduleDialog } from "@/components/admin/BlogDialogs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AdminBlog = () => {
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
  const [view, setView] = useState<"list" | "create">("list");

  // Scheduling state
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [postToSchedule, setPostToSchedule] = useState<BlogPost | null>(null);

  useEffect(() => {
    checkAdminAndFetch();
  }, []);

  const checkAdminAndFetch = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/connexion";
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
        window.location.href = "/";
        return;
      }

      setIsAdmin(true);
      await fetchPosts();
    } catch (error) {
      console.error("Error checking admin:", error);
      window.location.href = "/";
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
    setView("create");
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
      const sanitizedHtml = sanitizeArticleHtml(rawHtmlInput);

      const postData = {
        title: selectedPost.title!,
        slug: selectedPost.slug!,
        excerpt: selectedPost.excerpt || null,
        content_html: sanitizedHtml,
        category: selectedPost.category || null,
        tags: selectedPost.tags || [],
        cover_image_url: selectedPost.cover_image_url || null,
        mid_image_url: selectedPost.mid_image_url || null,
        status: selectedPost.status || "draft",
        seo_title: selectedPost.seo_title || null,
        seo_description: selectedPost.seo_description || null,
        published_at: selectedPost.status === "published" && !selectedPost.published_at
          ? new Date().toISOString()
          : selectedPost.published_at || null,
      };

      if (selectedPost.id) {
        const { error } = await supabase
          .from("blog_posts")
          .update(postData)
          .eq("id", selectedPost.id);

        if (error) throw error;
        toast({ title: "Succès", description: "Article mis à jour" });
      } else {
        const { error } = await supabase
          .from("blog_posts")
          .insert(postData);

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

  const handlePublishPost = async () => {
    if (!selectedPost?.id) return;

    // Check for cover image
    if (!selectedPost.cover_image_url) {
      const confirmed = window.confirm(
        "Cet article n'a pas d'image de couverture. Voulez-vous quand même le publier ?"
      );
      if (!confirmed) return;
    }

    // Save first, then publish
    setIsSaving(true);
    try {
      const sanitizedHtml = sanitizeArticleHtml(rawHtmlInput);

      const { error } = await supabase
        .from("blog_posts")
        .update({
          title: selectedPost.title,
          slug: selectedPost.slug,
          excerpt: selectedPost.excerpt || null,
          content_html: sanitizedHtml,
          category: selectedPost.category || null,
          tags: selectedPost.tags || [],
          cover_image_url: selectedPost.cover_image_url || null,
          mid_image_url: selectedPost.mid_image_url || null,
          seo_title: selectedPost.seo_title || null,
          seo_description: selectedPost.seo_description || null,
          status: "published",
          workflow_status: "published",
          published_at: selectedPost.published_at || new Date().toISOString(),
        })
        .eq("id", selectedPost.id);

      if (error) throw error;

      toast({ title: "Publié", description: "L'article est maintenant en ligne" });
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

    if (newStatus === "published" && !post.cover_image_url) {
      const confirmed = window.confirm(
        "Cet article n'a pas d'image de couverture. Voulez-vous quand même le publier ?"
      );
      if (!confirmed) return;
    }

    const { error } = await supabase
      .from("blog_posts")
      .update({
        status: newStatus,
        published_at: newStatus === "published" && !post.published_at
          ? new Date().toISOString()
          : post.published_at,
        ...(newStatus === "published" ? { workflow_status: "published" } : {}),
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

  const handleApplySanitization = () => {
    const sanitized = sanitizeArticleHtml(rawHtmlInput);
    setRawHtmlInput(sanitized);
    toast({ title: "HTML nettoyé", description: "Les règles d'import ont été appliquées" });
  };

  // Workflow actions
  const handleApprove = async (post: BlogPost) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("blog_posts")
      .update({
        workflow_status: "ai_reviewed",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", post.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    await fetchPosts();
    toast({ title: "Approuvé", description: "L'article a été validé" });
  };

  const handleReject = async (post: BlogPost) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("blog_posts")
      .update({
        workflow_status: "rejected",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", post.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    await fetchPosts();
    toast({ title: "Rejeté", description: "L'article a été rejeté" });
  };

  const handleSchedule = async () => {
    if (!postToSchedule || !scheduleDate) return;

    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();

    const { error } = await supabase
      .from("blog_posts")
      .update({
        workflow_status: "scheduled",
        scheduled_at: scheduledAt,
      })
      .eq("id", postToSchedule.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    setScheduleDialogOpen(false);
    setPostToSchedule(null);
    setScheduleDate("");
    setScheduleTime("09:00");
    await fetchPosts();
    toast({ title: "Programmé", description: `Publication prévue le ${scheduleDate} à ${scheduleTime}` });
  };

  const openScheduleDialog = (post: BlogPost) => {
    setPostToSchedule(post);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScheduleDate(tomorrow.toISOString().split("T")[0]);
    setScheduleTime("09:00");
    setScheduleDialogOpen(true);
  };

  const handleArticleCreated = async (postId: string, _slug: string, openEditor = false) => {
    await fetchPosts();
    if (openEditor) {
      const { data } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("id", postId)
        .single();

      if (data) {
        setSelectedPost(data);
        setRawHtmlInput(data.content_html || "");
        setIsEditing(true);
        setView("list");
      }
    }
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

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container px-4 py-8">
        {isEditing && selectedPost ? (
          <BlogPostEditor
            selectedPost={selectedPost}
            rawHtmlInput={rawHtmlInput}
            isSaving={isSaving}
            onPostChange={setSelectedPost}
            onRawHtmlChange={setRawHtmlInput}
            onSave={handleSavePost}
            onPublish={handlePublishPost}
            onBack={() => { setIsEditing(false); setView("list"); }}
            onApprove={handleApprove}
            onReject={handleReject}
            onScheduleOpen={openScheduleDialog}
            onSanitize={handleApplySanitization}
          />
        ) : view === "create" ? (
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold text-foreground">Nouvel article</h1>
                <p className="text-muted-foreground">Générez avec l'IA ou rédigez manuellement</p>
              </div>
              <Button variant="ghost" onClick={() => setView("list")}>
                Retour à la liste
              </Button>
            </div>

            <Tabs defaultValue="ai">
              <TabsList className="mb-6">
                <TabsTrigger value="ai">Génération IA</TabsTrigger>
                <TabsTrigger value="manual">Rédaction manuelle</TabsTrigger>
              </TabsList>

              <TabsContent value="ai">
                <AiGenerationPanel onArticleCreated={handleArticleCreated} />
              </TabsContent>

              <TabsContent value="manual">
                <ManualWriteEditor onArticleCreated={handleArticleCreated} />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
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

            <BlogPostList
              posts={posts}
              onNewPost={handleNewPost}
              onEditPost={handleEditPost}
              onToggleStatus={handleToggleStatus}
              onDeletePost={(post) => {
                setPostToDelete(post);
                setDeleteDialogOpen(true);
              }}
              onApprove={handleApprove}
              onReject={handleReject}
              onScheduleOpen={openScheduleDialog}
            />
          </div>
        )}
      </main>

      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        post={postToDelete}
        onConfirm={handleDeletePost}
      />

      <ScheduleDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        post={postToSchedule}
        date={scheduleDate}
        onDateChange={setScheduleDate}
        time={scheduleTime}
        onTimeChange={setScheduleTime}
        onConfirm={handleSchedule}
      />
    </div>
  );
};

export default AdminBlog;
