import { Badge } from "@/components/ui/badge";

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_html: string;
  category: string | null;
  tags: string[] | null;
  cover_image_url: string | null;
  mid_image_url: string | null;
  status: string | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  ai_generated: boolean | null;
  ai_prompt: string | null;
  ai_model: string | null;
  workflow_status: string | null;
  scheduled_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export const emptyPost: Partial<BlogPost> = {
  title: "",
  slug: "",
  excerpt: "",
  content_html: "",
  category: "Devis & Conseils",
  tags: [],
  cover_image_url: "",
  mid_image_url: null,
  status: "draft",
  seo_title: "",
  seo_description: "",
};

export const workflowBadge = (status: string | null | undefined) => {
  switch (status) {
    case "ai_draft":
      return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Brouillon IA</Badge>;
    case "ai_reviewed":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Validé</Badge>;
    case "scheduled":
      return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Programmé</Badge>;
    case "published":
      return <Badge variant="default">Publié</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejeté</Badge>;
    case "manual":
    default:
      return null;
  }
};
