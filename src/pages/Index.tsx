import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import HeroSection from "@/components/landing/HeroSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import ScoringExplainedSection from "@/components/landing/ScoringExplainedSection";
import RisksSection from "@/components/landing/RisksSection";
import CTASection from "@/components/landing/CTASection";
import DisclaimerSection from "@/components/landing/DisclaimerSection";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <HowItWorksSection />
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
