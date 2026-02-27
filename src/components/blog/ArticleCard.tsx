import { Clock, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { calculateReadingTime, formatArticleDate } from "@/lib/blogUtils";

interface ArticleCardProps {
  slug: string;
  title: string;
  excerpt?: string;
  category?: string;
  coverImageUrl?: string;
  publishedAt?: string;
  contentHtml?: string;
}

const ArticleCard = ({
  slug,
  title,
  excerpt,
  category,
  coverImageUrl,
  publishedAt,
  contentHtml,
}: ArticleCardProps) => {
  // Use content_html for accurate reading time when available, otherwise estimate from excerpt
  const readingTime = contentHtml
    ? calculateReadingTime(contentHtml)
    : excerpt ? Math.max(1, Math.ceil(excerpt.split(/\s+/).length / 30)) : 3;
  
  return (
    <a
      href={`/blog/${slug}`}
      className="group block bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all duration-300"
    >
      {coverImageUrl && (
        <div className="aspect-video overflow-hidden bg-muted">
          <img 
            src={coverImageUrl} 
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}
      
      <div className="p-6">
        <div className="flex items-center gap-3 mb-3">
          {category && (
            <Badge variant="secondary" className="text-xs">
              <Tag className="h-3 w-3 mr-1" />
              {category}
            </Badge>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {readingTime} min de lecture
          </div>
        </div>
        
        <h2 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors mb-2 line-clamp-2">
          {title}
        </h2>
        
        {excerpt && (
          <p className="text-muted-foreground text-sm line-clamp-3 mb-4">
            {excerpt}
          </p>
        )}
        
        {publishedAt && (
          <p className="text-xs text-muted-foreground">
            {formatArticleDate(publishedAt)}
          </p>
        )}
      </div>
    </a>
  );
};

export default ArticleCard;
