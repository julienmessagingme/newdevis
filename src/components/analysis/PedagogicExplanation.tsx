import { Info, CheckCircle2, AlertCircle, LightbulbIcon } from "lucide-react";

interface PedagogicExplanationProps {
  type: "info" | "vigilance" | "positive" | "tip";
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Composant d'explication pédagogique réutilisable
 * Affiche un bloc explicatif avec différents styles selon le type
 */
const PedagogicExplanation = ({ type, title, children, className = "" }: PedagogicExplanationProps) => {
  const getStyles = () => {
    switch (type) {
      case "positive":
        return {
          bg: "bg-score-green-bg/50",
          border: "border-score-green/20",
          icon: <CheckCircle2 className="h-5 w-5 text-score-green flex-shrink-0" />,
        };
      case "vigilance":
        return {
          bg: "bg-score-orange-bg/50",
          border: "border-score-orange/20",
          icon: <AlertCircle className="h-5 w-5 text-score-orange flex-shrink-0" />,
        };
      case "tip":
        return {
          bg: "bg-primary/5",
          border: "border-primary/20",
          icon: <LightbulbIcon className="h-5 w-5 text-primary flex-shrink-0" />,
        };
      default:
        return {
          bg: "bg-muted/50",
          border: "border-border",
          icon: <Info className="h-5 w-5 text-muted-foreground flex-shrink-0" />,
        };
    }
  };

  const styles = getStyles();

  return (
    <div className={`p-4 rounded-lg border ${styles.bg} ${styles.border} ${className}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{styles.icon}</div>
        <div className="flex-1">
          {title && (
            <p className="font-medium text-foreground text-sm mb-2">{title}</p>
          )}
          <div className="text-sm text-muted-foreground leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PedagogicExplanation;
