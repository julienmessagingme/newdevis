import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Clock, Lock } from "lucide-react";

const CTASection = () => {
  return (
    <section className="py-20 hero-gradient relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-10 right-20 w-64 h-64 bg-primary-foreground rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-20 w-80 h-80 bg-primary-foreground rounded-full blur-3xl" />
      </div>

      <div className="container relative">
        <div className="max-w-3xl mx-auto text-center">
          {/* 🔴 TEXTE BLANC, ET C'EST UN CORRECTIF DE RÉGRESSION (2026-09-25).
              La passe de contraste du 23/09 a remplacé `text-score-green` par
              `text-score-green-foreground` partout — or ce jeton (25 % de
              luminosité) est fait pour du texte sur BLANC. Ici le fond est le
              dégradé navy : mesuré **1,21:1**, quasi illisible.
              ⚠️ Le vert reste porté par le fond et la bordure ; seul le texte
              passe en blanc (7,8:1). Un vert clair type #4ADE80 tomberait à
              4,50:1 — pile sur le seuil, donc sans marge. */}
          <div className="inline-flex items-center gap-2 bg-score-green/20 border border-score-green/40 rounded-full px-4 py-2 mb-6">
            <span className="text-sm font-bold text-primary-foreground">
              🎉 100% GRATUIT pour les particuliers
            </span>
          </div>
          
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-primary-foreground mb-6">
            Prêt à sécuriser vos travaux ?
          </h2>
          <p className="text-lg md:text-xl text-primary-foreground/80 mb-8">
            Rejoignez les particuliers qui font confiance à VerifierMonDevis.fr.
          </p>

          <a href="/nouvelle-analyse">
            <Button variant="hero" size="xl" className="group mb-10">
              Commencer gratuitement
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </a>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-primary-foreground/70 text-sm">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              <span>Données sécurisées</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <span>Résultat en 2 minutes</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              <span>Conforme RGPD</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
