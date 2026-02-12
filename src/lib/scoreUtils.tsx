import { CheckCircle2, AlertCircle, XCircle, Clock } from "lucide-react";

export const getScoreIcon = (score: string | null | undefined, className: string = "h-5 w-5") => {
  switch (score) {
    case "VERT": return <CheckCircle2 className={`${className} text-score-green`} />;
    case "ORANGE": return <AlertCircle className={`${className} text-score-orange`} />;
    case "ROUGE": return <XCircle className={`${className} text-score-red`} />;
    default: return null;
  }
};

export const getScoreLabel = (score: string | null | undefined) => {
  switch (score) {
    case "VERT": return "FEU VERT";
    case "ORANGE": return "FEU ORANGE";
    case "ROUGE": return "FEU ROUGE";
    default: return "-";
  }
};

export const getScoreBgClass = (score: string | null | undefined) => {
  switch (score) {
    case "VERT": return "bg-score-green-bg border-score-green/30";
    case "ORANGE": return "bg-score-orange-bg border-score-orange/30";
    case "ROUGE": return "bg-score-red-bg border-score-red/30";
    default: return "bg-muted border-border";
  }
};

export const getScoreTextClass = (score: string | null | undefined) => {
  switch (score) {
    case "VERT": return "text-score-green";
    case "ORANGE": return "text-score-orange";
    case "ROUGE": return "text-score-red";
    default: return "text-muted-foreground";
  }
};

export const getStatusIcon = (score: string | null, status: string, className = "h-5 w-5") => {
  if (status === "pending" || status === "processing") {
    return <Clock className={`${className} text-muted-foreground animate-pulse`} />;
  }
  if (status === "error") {
    return <XCircle className={`${className} text-score-red`} />;
  }
  return getScoreIcon(score, className) || <Clock className={`${className} text-muted-foreground`} />;
};

export const getScoreBadge = (score: string | null, status: string) => {
  if (status === "pending" || status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
        <span className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" />
        En cours
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-score-red-bg text-score-red-foreground">
        <span className="w-2 h-2 bg-score-red rounded-full" />
        Erreur
      </span>
    );
  }
  switch (score) {
    case "VERT":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-score-green-bg text-score-green-foreground">
          <span className="w-2 h-2 bg-score-green rounded-full" />
          Feu Vert
        </span>
      );
    case "ORANGE":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-score-orange-bg text-score-orange-foreground">
          <span className="w-2 h-2 bg-score-orange rounded-full" />
          Feu Orange
        </span>
      );
    case "ROUGE":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-score-red-bg text-score-red-foreground">
          <span className="w-2 h-2 bg-score-red rounded-full" />
          Feu Rouge
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
          <span className="w-2 h-2 bg-muted-foreground rounded-full" />
          -
        </span>
      );
  }
};
