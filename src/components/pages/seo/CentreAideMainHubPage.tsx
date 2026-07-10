/**
 * src/components/pages/seo/CentreAideMainHubPage.tsx
 *
 * Hub principal du centre d'aide GérerMonChantier.
 * Affiche les 8 catégories avec leur statut (live / coming_soon).
 * Composant SSR pur — pas d'interactivité, rendu HTML statique côté serveur.
 */

import Breadcrumb from "@/components/seo/Breadcrumb";
import type { CategoryConfig } from "@/lib/seo/centreAideConfig";
import { ArrowRight, Sparkles } from "lucide-react";

interface Props {
  categories: CategoryConfig[];
}

export default function CentreAideMainHubPage({ categories }: Props) {
  const live = categories.filter((c) => c.status === "live");
  const soon = categories.filter((c) => c.status === "coming_soon");

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <Breadcrumb segments={[{ name: "Centre d'aide", href: "/centre-aide" }]} />

      <header className="mb-10 md:mb-14 max-w-3xl">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-primary mb-3">
          <Sparkles className="h-3.5 w-3.5" /> Centre d'aide chantier
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
          Résoudre les vrais problèmes de chantier
        </h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
          Chaque particulier qui rénove ou construit tombe sur les mêmes situations : un artisan qui
          ne répond plus, un budget qui dérape, un planning qui se décale, un litige qui s'installe.
          Le centre d'aide GérerMonChantier documente les procédures concrètes — amiables et
          juridiques — pour reprendre la main.
        </p>
      </header>

      {live.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-4">
            Disponible
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((cat) => (
              <a
                key={cat.slug}
                href={`/centre-aide/${cat.slug}`}
                className="group block bg-card border border-border rounded-xl p-5 hover:border-primary hover:shadow-md transition-all"
              >
                <div className="text-3xl mb-3" aria-hidden="true">
                  {cat.icon}
                </div>
                <h3 className="font-bold text-base text-foreground mb-1.5 group-hover:text-primary transition-colors">
                  {cat.label}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">{cat.intro}</p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Voir les articles <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {soon.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-4">
            Bientôt disponible
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {soon.map((cat) => (
              <a
                key={cat.slug}
                href={`/centre-aide/${cat.slug}`}
                className="group block bg-muted/40 border border-border/60 rounded-xl p-5 hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl opacity-70" aria-hidden="true">
                    {cat.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm text-foreground/80">{cat.label}</h3>
                      <span className="text-[10px] uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                        Bientôt
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{cat.intro}</p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="mt-16 bg-accent/50 border border-border rounded-xl p-6 md:p-8">
        <h2 className="text-lg md:text-xl font-bold text-foreground mb-2">
          Ce centre d'aide est écrit par des opérationnels
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Nous animons GérerMonChantier et VerifierMonDevis depuis plusieurs années. Chaque article
          documente une procédure que nous avons vue mille fois — pas un contenu généré à la chaîne.
          Les cas concrets, les références légales et les modèles fournis sont ceux que nous
          utiliserions nous-mêmes.
        </p>
      </section>
    </main>
  );
}
