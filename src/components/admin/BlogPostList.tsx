import {
  Plus, Edit, Trash2, Eye, EyeOff,
  FileText, Calendar, Tag, Sparkles,
  CheckCircle, XCircle, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatArticleDate } from "@/lib/blogUtils";
import { workflowBadge, type BlogPost } from "./blogTypes";

interface BlogPostListProps {
  posts: BlogPost[];
  onNewPost: () => void;
  onEditPost: (post: BlogPost) => void;
  onToggleStatus: (post: BlogPost) => void;
  onDeletePost: (post: BlogPost) => void;
  onApprove: (post: BlogPost) => void;
  onReject: (post: BlogPost) => void;
  onScheduleOpen: (post: BlogPost) => void;
  onAiDialogOpen: () => void;
}

const BlogPostList = ({
  posts,
  onNewPost,
  onEditPost,
  onToggleStatus,
  onDeletePost,
  onApprove,
  onReject,
  onScheduleOpen,
  onAiDialogOpen,
}: BlogPostListProps) => {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gestion du Blog</h1>
          <p className="text-muted-foreground">Créez et gérez les articles du blog</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onAiDialogOpen}>
            <Sparkles className="mr-2 h-4 w-4" />
            Générer avec l'IA
          </Button>
          <Button onClick={onNewPost}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvel article
          </Button>
        </div>
      </div>

      {posts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Aucun article</h2>
            <p className="text-muted-foreground mb-4">Créez votre premier article de blog</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={onAiDialogOpen}>
                <Sparkles className="mr-2 h-4 w-4" />
                Générer avec l'IA
              </Button>
              <Button onClick={onNewPost}>
                <Plus className="mr-2 h-4 w-4" />
                Créer un article
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate">
                        {post.title}
                      </h3>
                      <Badge variant={post.status === "published" ? "default" : "secondary"}>
                        {post.status === "published" ? "Publié" : "Brouillon"}
                      </Badge>
                      {workflowBadge(post.workflow_status)}
                      {post.ai_generated && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                          <Sparkles className="mr-1 h-3 w-3" />
                          IA
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        {post.category || "Sans catégorie"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatArticleDate(post.published_at || post.created_at)}
                      </span>
                      {post.scheduled_at && post.workflow_status === "scheduled" && (
                        <span className="flex items-center gap-1 text-purple-600">
                          <Clock className="h-3 w-3" />
                          Programmé: {new Date(post.scheduled_at).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                      <span className="text-xs font-mono text-muted-foreground">
                        /blog/{post.slug}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    {/* Workflow actions for AI drafts */}
                    {post.workflow_status === "ai_draft" && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onApprove(post)}
                          title="Approuver"
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onReject(post)}
                          title="Rejeter"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {/* Schedule button for reviewed posts */}
                    {(post.workflow_status === "ai_reviewed" || post.workflow_status === "manual") &&
                     post.status !== "published" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onScheduleOpen(post)}
                        title="Programmer"
                        className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                      >
                        <Clock className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onToggleStatus(post)}
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
                      onClick={() => onEditPost(post)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeletePost(post)}
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
  );
};

export default BlogPostList;
