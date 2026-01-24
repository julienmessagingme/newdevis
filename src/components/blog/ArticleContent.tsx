import { sanitizeForRender } from "@/lib/blogUtils";

interface ArticleContentProps {
  html: string;
}

const ArticleContent = ({ html }: ArticleContentProps) => {
  const sanitizedHtml = sanitizeForRender(html);
  
  return (
    <div 
      className="prose prose-lg max-w-none
        prose-headings:text-foreground prose-headings:font-bold
        prose-h1:text-3xl prose-h1:mb-6
        prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
        prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
        prose-p:text-foreground/90 prose-p:leading-relaxed prose-p:mb-4
        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-strong:text-foreground prose-strong:font-semibold
        prose-ul:my-4 prose-ul:pl-6
        prose-ol:my-4 prose-ol:pl-6
        prose-li:text-foreground/90 prose-li:mb-2
        prose-img:rounded-xl prose-img:shadow-md prose-img:my-8
        prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground
        [&_.hero]:mb-8 [&_.hero]:text-center
        [&_.step]:bg-muted/30 [&_.step]:p-6 [&_.step]:rounded-xl [&_.step]:mb-6
        [&_.checklist]:bg-primary/5 [&_.checklist]:p-6 [&_.checklist]:rounded-xl
        [&_.warning]:bg-amber-500/10 [&_.warning]:border-amber-500/20 [&_.warning]:border [&_.warning]:p-4 [&_.warning]:rounded-xl
        [&_.tip]:bg-emerald-500/10 [&_.tip]:border-emerald-500/20 [&_.tip]:border [&_.tip]:p-4 [&_.tip]:rounded-xl
        [&_.cta-button]:inline-flex [&_.cta-button]:items-center [&_.cta-button]:gap-2 [&_.cta-button]:bg-primary [&_.cta-button]:text-primary-foreground [&_.cta-button]:px-6 [&_.cta-button]:py-3 [&_.cta-button]:rounded-full [&_.cta-button]:font-medium [&_.cta-button]:no-underline [&_.cta-button]:hover:bg-primary/90 [&_.cta-button]:transition-colors
      "
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
};

export default ArticleContent;
