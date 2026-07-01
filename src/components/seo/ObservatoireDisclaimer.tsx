/**
 * ObservatoireDisclaimer — mention honnête en pied de page Observatoire.
 * Assume que l'échantillon est celui de VMD (pas le marché national) → crédibilité.
 */

import { Info } from "lucide-react";

export default function ObservatoireDisclaimer() {
  return (
    <aside className="my-10 border border-border/60 bg-muted/30 rounded-xl p-5 text-sm text-muted-foreground flex gap-3 items-start">
      <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary/70" aria-hidden="true" />
      <p className="leading-relaxed">
        Ces statistiques sont calculées à partir des devis analysés par
        VerifierMonDevis. Elles ne représentent pas le marché national mais un
        échantillon utile pour situer votre propre devis. Nous mettons à jour
        ces données chaque mois.
      </p>
    </aside>
  );
}
