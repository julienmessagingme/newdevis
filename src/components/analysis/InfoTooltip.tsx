import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InfoTooltipProps {
  title: string;
  content: string;
  children?: React.ReactNode;
}

/**
 * Composant info-bulle pédagogique réutilisable
 * Affiche une icône ℹ️ avec un tooltip explicatif au survol
 */
const InfoTooltip = ({ title, content, children }: InfoTooltipProps) => {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button 
            type="button" 
            className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted hover:bg-muted/80 transition-colors cursor-help"
            aria-label={title}
          >
            {children || <Info className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          className="max-w-xs p-3 bg-popover border border-border shadow-lg"
        >
          <p className="font-medium text-foreground text-sm mb-1">{title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default InfoTooltip;
