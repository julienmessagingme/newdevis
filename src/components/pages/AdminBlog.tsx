import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeArticleHtml } from "@/lib/blogUtils";
import Header from "@/components/layout/Header";
import { type BlogPost, emptyPost } from "@/components/admin/blogTypes";
import BlogPostEditor from "@/components/admin/BlogPostEditor";
import BlogPostList from "@/components/admin/BlogPostList";
import { DeleteDialog, AiGenerationDialog, ScheduleDialog } from "@/components/admin/BlogDialogs";

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

  // AI Generation state
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiKeywords, setAiKeywords] = useState("");
  const [aiTargetLength, setAiTargetLength] = useState("1200");
  const [isGenerating, setIsGenerating] = useState(false);

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
      const sanitizedHtml = sanitizeArticleHtml(rawHtmlInput);

      const postData: Record<string, unknown> = {
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
        const { error } = await supabase
          .from("blog_posts")
          .update(postData)
          .eq("id", selectedPost.id);

        if (error) throw error;
        toast({ title: "Succès", description: "Article mis à jour" });
      } else {
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
    const updateData: Record<string, unknown> = {
      status: newStatus,
      published_at: newStatus === "published" && !post.published_at
        ? new Date().toISOString()
        : post.published_at,
    };
    if (newStatus === "published") {
      updateData.workflow_status = "published";
    }

    const { error } = await supabase
      .from("blog_posts")
      .update(updateData)
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

  // AI Generation
  const handleGenerateAI = async () => {
    if (!aiTopic.trim()) {
      toast({ title: "Erreur", description: "Veuillez saisir un sujet", variant: "destructive" });
      return;
    }

    setIsGenerating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non authentifié");

      const response = await supabase.functions.invoke("generate-blog-article", {
        body: {
          topic: aiTopic.trim(),
          keywords: aiKeywords ? aiKeywords.split(",").map(k => k.trim()).filter(Boolean) : [],
          targetLength: parseInt(aiTargetLength),
        },
      });

      if (response.error) throw response.error;

      const result = response.data;
      if (!result?.success) {
        throw new Error(result?.error || "Erreur de génération");
      }

      toast({
        title: "Article généré",
        description: `"${result.post.title}" créé en brouillon IA`,
      });

      setAiDialogOpen(false);
      setAiTopic("");
      setAiKeywords("");
      setAiTargetLength("1200");
      await fetchPosts();
    } catch (error: any) {
      toast({
        title: "Erreur de génération",
        description: error.message || "Impossible de générer l'article",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
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
            onBack={() => setIsEditing(false)}
            onApprove={handleApprove}
            onReject={handleReject}
            onScheduleOpen={openScheduleDialog}
            onSanitize={handleApplySanitization}
          />
        ) : (
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
            onAiDialogOpen={() => setAiDialogOpen(true)}
          />
        )}
      </main>

      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        post={postToDelete}
        onConfirm={handleDeletePost}
      />

      <AiGenerationDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        topic={aiTopic}
        onTopicChange={setAiTopic}
        keywords={aiKeywords}
        onKeywordsChange={setAiKeywords}
        targetLength={aiTargetLength}
        onTargetLengthChange={setAiTargetLength}
        isGenerating={isGenerating}
        onGenerate={handleGenerateAI}
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
