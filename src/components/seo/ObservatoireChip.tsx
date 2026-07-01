/**
 * ObservatoireChip — bandeau de fraîcheur/crédibilité affiché en haut des pages
 * Observatoire. Regroupe N devis, date de mise à jour et attribution auteur
 * (signal E-E-A-T + crédibilité honnête).
 */

import { BarChart3, Calendar, User } from "lucide-react";

interface Props {
  nbDevis: number;
  nbLignes?: number;
  lastGenerated: string;
  /** Label complémentaire optionnel (ex. "lignes matchées"). */
  linesLabel?: string;
}

export default function ObservatoireChip({
  nbDevis,
  nbLignes,
  lastGenerated,
  linesLabel = "lignes matchées",
}: Props) {
  const lastDate = new Date(lastGenerated).toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <BarChart3 className="h-3.5 w-3.5" /> {nbDevis} devis analysés
      </span>
      {typeof nbLignes === "number" && nbLignes > 0 && (
        <span className="inline-flex items-center gap-1">
          <BarChart3 className="h-3.5 w-3.5" /> {nbLignes} {linesLabel}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <Calendar className="h-3.5 w-3.5" /> Actualisé le {lastDate}
      </span>
      <span className="inline-flex items-center gap-1">
        <User className="h-3.5 w-3.5" /> Analysé par Johan BRIDEY, co-fondateur
      </span>
    </div>
  );
}
