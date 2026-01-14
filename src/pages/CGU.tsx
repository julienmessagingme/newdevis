import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SEOHead from "@/components/SEOHead";

const CGU = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <SEOHead 
        title="Conditions Générales d'Utilisation | VerifierMonDevis.fr"
        description="Consultez les CGU de VerifierMonDevis.fr : nature du service, responsabilités, données utilisées. Service d'analyse indicatif et non contractuel."
        canonical="https://verifiermondevis.fr/cgu"
      />
      <Header />
      <main className="flex-1 py-12">
        <div className="container max-w-3xl">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à l'accueil
          </Link>

          <h1 className="text-3xl font-bold text-foreground mb-8">
            Conditions Générales d'Utilisation
          </h1>
          <p className="text-muted-foreground mb-8">VerifierMonDevis.fr</p>

          <div className="space-y-8">
            {/* Section 1 */}
            <section className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">
                1. Objet du service
              </h2>
              <div className="text-muted-foreground space-y-3">
                <p>
                  VerifierMonDevis.fr propose un service d'analyse automatisée de devis d'artisans à destination des particuliers.
                </p>
                <p>
                  Le service a pour unique vocation de fournir des <strong className="text-foreground">indicateurs de vigilance</strong> et d'<strong className="text-foreground">information</strong>.
                </p>
              </div>
            </section>

            {/* Section 2 */}
            <section className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">
                2. Nature des informations fournies
              </h2>
              <div className="text-muted-foreground space-y-3">
                <p>Les résultats affichés sont :</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong className="text-foreground">indicatifs</strong>,</li>
                  <li><strong className="text-foreground">non contractuels</strong>,</li>
                  <li>basés sur des <strong className="text-foreground">données publiques et déclaratives</strong>.</li>
                </ul>
                <p className="pt-2">
                  VerifierMonDevis.fr ne garantit ni l'exactitude, ni l'exhaustivité des informations analysées.
                </p>
              </div>
            </section>

            {/* Section 3 */}
            <section className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">
                3. Absence de responsabilité
              </h2>
              <div className="text-muted-foreground space-y-3">
                <p>
                  L'utilisateur demeure <strong className="text-foreground">seul décisionnaire</strong> quant au choix de l'artisan et à la réalisation des travaux.
                </p>
                <p>
                  VerifierMonDevis.fr ne saurait être tenu responsable des conséquences financières, techniques ou juridiques résultant de l'utilisation du service.
                </p>
              </div>
            </section>

            {/* Section 4 */}
            <section className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">
                4. Absence de notation des artisans
              </h2>
              <div className="text-muted-foreground space-y-3">
                <p>
                  VerifierMonDevis.fr <strong className="text-foreground">n'attribue aucune note, classement ou appréciation</strong> aux artisans ou entreprises analysés.
                </p>
                <p>
                  Le service porte exclusivement sur l'analyse d'un devis à un instant donné.
                </p>
              </div>
            </section>

            {/* Section 5 */}
            <section className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">
                5. Données et sources
              </h2>
              <p className="text-muted-foreground">
                Les données utilisées proviennent de <strong className="text-foreground">sources publiques</strong> (INSEE, BODACC, ADEME, etc.) et des documents transmis par l'utilisateur.
              </p>
            </section>

            {/* Section 6 */}
            <section className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">
                6. Réclamations et signalements
              </h2>
              <p className="text-muted-foreground">
                Tout professionnel estimant qu'une information est inexacte peut demander une rectification via le <Link to="/contact" className="text-primary hover:underline">formulaire de contact</Link>.
              </p>
            </section>
          </div>

          <p className="text-sm text-muted-foreground text-center mt-12">
            Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CGU;
