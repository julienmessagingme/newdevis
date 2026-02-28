import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/landing/HeroSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import ScoringExplainedSection from "@/components/landing/ScoringExplainedSection";
import RisksSection from "@/components/landing/RisksSection";
import CTASection from "@/components/landing/CTASection";
import DisclaimerSection from "@/components/landing/DisclaimerSection";
import PostSignatureValueSection from "@/components/landing/PostSignatureValueSection";
import DevisCalculatorSection from "@/components/landing/DevisCalculatorSection";
import SEOHead from "@/components/SEOHead";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <SEOHead 
        title="Vérifier un devis artisan gratuitement | VerifierMonDevis.fr"
        description="Analysez gratuitement votre devis d'artisan en 2 minutes. Score de fiabilité, vérification entreprise, prix marché. Protégez-vous avant de signer."
        canonical="https://www.verifiermondevis.fr/"
      />
      <Header />
      <main className="flex-1">
        <HeroSection />
        <DevisCalculatorSection />
        <HowItWorksSection />
        <PostSignatureValueSection />
        <ScoringExplainedSection />
        <RisksSection />
        <DisclaimerSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
