import { AlertTriangle } from "lucide-react";

const DisclaimerSection = () => {
  return (
    <section className="py-12 bg-muted/50">
      <div className="container max-w-4xl">
        <div className="bg-card border border-border rounded-xl p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">
                ⚠️ Avertissement important
              </h3>
              <div className="text-sm text-muted-foreground space-y-3">
                <p>
                  L'analyse fournie par VerifierMonDevis.fr est <strong className="text-foreground">automatisée</strong> et repose sur :
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>les informations figurant sur le devis transmis,</li>
                  <li>des données publiques issues de sources administratives ou institutionnelles,</li>
                  <li>des moyennes de prix observées sur le marché.</li>
                </ul>
                <p className="pt-2">
                  Cette analyse constitue une <strong className="text-foreground">aide à la décision</strong> et une <strong className="text-foreground">information indicative</strong>.
                </p>
                <p>
                  Elle <strong className="text-foreground">ne constitue ni un avis juridique, ni un conseil professionnel, ni une expertise technique</strong>.
                </p>
                <p>
                  VerifierMonDevis.fr <strong className="text-foreground">n'évalue pas les artisans</strong> et ne porte aucun jugement sur leur probité ou leur compétence.
                </p>
                <p>
                  Les résultats présentés ne sauraient se substituer à l'avis d'un professionnel du bâtiment ou à une vérification humaine approfondie.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DisclaimerSection;
