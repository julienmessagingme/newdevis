/**
 * src/components/pages/seo/CentreAideCategoryHubPage.tsx
 *
 * Hub d'une catégorie du centre d'aide.
 *   - Si `articles` non vide : liste des articles + intro catégorie + CTA GMC.
 *   - Si `articles` vide (catégorie coming_soon) : landing "Bientôt disponible"
 *     avec liens vers les catégories live + CTA GMC contextuel.
 *
 * Composant SSR pur.
 */

import Breadcrumb from "@/components/seo/Breadcrumb";
import type { CategoryConfig } from "@/lib/seo/centreAideConfig";
import { ArrowRight, CalendarDays, Clock } from "lucide-react";

export interface ArticleTeaser {
  slug: string;
  title: string;
  excerpt: string;
  updatedAt: string;
  readingTime: number;
  tags: string[];
}

interface Props {
  category: CategoryConfig;
  articles: ArticleTeaser[];
  liveCategories: CategoryConfig[];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function CentreAideCategoryHubPage({ category, articles, liveCategories }: Props) {
  const isComingSoon = category.status === "coming_soon";

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <Breadcrumb
        segments={[
          { name: "Centre d'aide", href: "/centre-aide" },
          { name: category.label, href: `/centre-aide/${category.slug}` },
        ]}
      />

      <header className="mb-10 max-w-3xl">
        <div className="text-4xl mb-3" aria-hidden="true">
          {category.icon}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-3">
          {category.label}
        </h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">{category.intro}</p>
      </header>

      {isComingSoon ? (
        <ComingSoonView category={category} liveCategories={liveCategories} />
      ) : (
        <ArticlesGrid articles={articles} categorySlug={category.slug} />
      )}

      <section className="mt-14 bg-gradient-to-br from-primary/5 via-accent to-primary/10 border border-primary/20 rounded-xl p-6 md:p-8">
        <div className="grid md:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <div className="text-xs uppercase tracking-wider font-bold text-primary mb-2">
              Module associé — GérerMonChantier
            </div>
            <p className="text-base font-medium text-foreground leading-relaxed">
              {category.gmcModule.hook}
            </p>
          </div>
          <a
            href={category.gmcModule.href}
            className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg px-5 py-3 font-semibold text-sm hover:opacity-90 whitespace-nowrap"
          >
            {category.gmcModule.cta} <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      {category.vmdCrossLinks.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">
            Ressources VerifierMonDevis
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {category.vmdCrossLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="block bg-card border border-border rounded-lg px-4 py-3 text-sm hover:border-primary transition-colors"
                >
                  <span className="text-foreground font-medium">{link.label}</span>
                  <span className="text-muted-foreground"> ↗</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function ArticlesGrid({
  articles,
  categorySlug,
}: {
  articles: ArticleTeaser[];
  categorySlug: string;
}) {
  if (articles.length === 0) {
    return (
      <div className="bg-muted/50 border border-border rounded-xl p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Les premiers articles arrivent très prochainement.
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="articles-heading">
      <h2 id="articles-heading" className="sr-only">
        Articles de la catégorie
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        {articles.map((a) => (
          <a
            key={a.slug}
            href={`/centre-aide/${categorySlug}/${a.slug}`}
            className="group block bg-card border border-border rounded-xl p-5 hover:border-primary hover:shadow-md transition-all"
          >
            <h3 className="font-bold text-lg text-foreground mb-2 group-hover:text-primary transition-colors leading-snug">
              {a.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-3">
              {a.excerpt}
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> {formatDate(a.updatedAt)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {a.readingTime} min
              </span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function ComingSoonView({
  category,
  liveCategories,
}: {
  category: CategoryConfig;
  liveCategories: CategoryConfig[];
}) {
  return (
    <section className="bg-amber-50/50 border border-amber-200 rounded-xl p-6 md:p-8">
      <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 text-xs uppercase tracking-wider font-bold px-2 py-1 rounded mb-4">
        Section en préparation
      </div>
      <p className="text-base text-foreground leading-relaxed mb-4">
        Cette catégorie « {category.label} » est en cours de rédaction. Nous publions les articles
        au fur et à mesure, sans compromis sur la qualité — chaque procédure est vérifiée avant
        publication.
      </p>
      {liveCategories.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-foreground mb-2">
            En attendant, explorez les catégories déjà publiées :
          </p>
          <ul className="flex flex-wrap gap-2">
            {liveCategories.map((c) => (
              <li key={c.slug}>
                <a
                  href={`/centre-aide/${c.slug}`}
                  className="inline-flex items-center gap-1 bg-card border border-border rounded-full px-3 py-1.5 text-xs font-medium hover:border-primary transition-colors"
                >
                  <span aria-hidden="true">{c.icon}</span> {c.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
