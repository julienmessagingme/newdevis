import { ArrowRight, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCTAUrl } from "@/lib/blogUtils";

interface BlogCTAProps {
  variant?: "top" | "bottom" | "inline";
}

const BlogCTA = ({ variant = "inline" }: BlogCTAProps) => {
  const ctaUrl = getCTAUrl();
  
  if (variant === "top") {
    return (
      <div className="mb-8 p-6 bg-primary/10 rounded-2xl border border-primary/20">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="p-3 bg-primary/20 rounded-xl">
            <FileCheck className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="font-semibold text-foreground">
              Vous avez un devis à analyser ?
            </p>
            <p className="text-sm text-muted-foreground">
              Notre outil gratuit vérifie les mentions obligatoires et compare les prix.
            </p>
          </div>
          <Button asChild className="shrink-0">
            <a href={ctaUrl}>
              Analyser mon devis
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    );
  }
  
  if (variant === "bottom") {
    return (
      <div className="mt-12 p-8 bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl border border-primary/20">
        <div className="text-center max-w-xl mx-auto">
          <div className="inline-flex p-4 bg-primary/20 rounded-2xl mb-4">
            <FileCheck className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-3">
            Prêt à analyser votre devis ?
          </h3>
          <p className="text-muted-foreground mb-6">
            Utilisez notre outil gratuit pour vérifier les mentions obligatoires, 
            comparer les prix du marché et vous assurer de la fiabilité de l'artisan.
          </p>
          <Button size="lg" asChild className="px-8">
            <a href={ctaUrl}>
              Analyser mon devis gratuitement
              <ArrowRight className="ml-2 h-5 w-5" />
            </a>
          </Button>
        </div>
      </div>
    );
  }
  
  // Inline variant
  return (
    <a 
      href={ctaUrl}
      className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors"
    >
      Analyser mon devis
      <ArrowRight className="h-4 w-4" />
    </a>
  );
};

export default BlogCTA;
