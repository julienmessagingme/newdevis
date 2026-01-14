import { Bell, Calendar, Building2, Shield, CheckCircle2 } from "lucide-react";

const PostSignatureValueSection = () => {
  return (
    <section className="py-16 bg-accent/30">
      <div className="container">
        <div className="max-w-4xl mx-auto">
          {/* Main value proposition */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Bell className="h-4 w-4" />
              Nouvelle fonctionnalité
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              Un suivi utile, même après la signature
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Avec votre accord, VerifierMonDevis.fr peut vous envoyer des rappels et alertes informatives 
              pendant la durée de votre chantier, afin de vous aider à suivre votre projet en toute sérénité.
            </p>
          </div>

          {/* Features grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-card rounded-xl p-6 card-shadow">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Calendar className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">
                    Rappels sur les délais
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Recevez une notification à l'approche de la date de fin prévue sur votre devis. 
                    Un rappel purement informatif pour suivre l'avancement de votre projet.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl p-6 card-shadow">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">
                    Alertes administratives
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Soyez informé en cas d'évolution administrative importante concernant l'entreprise 
                    (source publique officielle), comme une radiation ou une procédure collective.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Trust indicators */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Engagement de transparence</h3>
            </div>
            
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-score-green mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Service optionnel, activé uniquement avec votre accord explicite
                </p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-score-green mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Informations factuelles issues du devis ou de sources publiques
                </p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-score-green mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Aucun jugement sur l'artisan ou l'exécution des travaux
                </p>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-score-green mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Désactivable à tout moment depuis votre espace
                </p>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs text-muted-foreground">
                <strong>Pourquoi cette fonctionnalité ?</strong> VerifierMonDevis.fr a fait le choix de 
                fournir une information utile et factuelle, même après la signature du devis. 
                Cette approche garantit un accompagnement pertinent sans jamais porter de jugement 
                sur les artisans ou leur travail.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PostSignatureValueSection;
