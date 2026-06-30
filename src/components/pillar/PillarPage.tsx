/**
 * src/components/pillar/PillarPage.tsx
 *
 * Template universel pour les pages piliers SEO de VMD :
 *   - Breadcrumb + JSON-LD breadcrumb
 *   - H1 + intro
 *   - Sommaire (sticky desktop, accordion mobile)
 *   - Sections de contenu avec ancres internes
 *   - FAQ + JSON-LD FAQPage
 *   - Related guides (3-4 liens contextuels)
 *   - Passerelle GMC
 *   - CTA primaire
 *
 * Le wrapper Astro injecte les schemas via <script type="application/ld+json">
 * en exploitant lib/seo/schemaOrg.ts. Le composant React rend le HTML visible.
 */

import type { ReactNode } from "react";
import Breadcrumb, { type BreadcrumbSegment } from "@/components/seo/Breadcrumb";
import TableOfContents, { type TocItem } from "@/components/seo/TableOfContents";
import FAQ, { type FaqItem } from "@/components/seo/FAQ";
import RelatedGuides from "@/components/seo/RelatedGuides";
import GmcGatewayBanner from "@/components/cta/GmcGatewayBanner";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { InternalLink } from "@/lib/seo/internalLinking";

export interface PillarPageProps {
  /** SEO + breadcrumb */
  breadcrumb: BreadcrumbSegment[];

  /** Titre H1 */
  title: string;
  /** Sous-titre / intro courte */
  intro: string;

  /** Sommaire généré depuis les sections */
  toc: TocItem[];

  /** Contenu : sections avec id, titre H2 et corps */
  sections: Array<{
    id: string;
    title: string;
    body: ReactNode;
    /** Insère la bannière GMC après cette section (variant "guide") */
    insertGmcAfter?: boolean;
  }>;

  /** FAQ en bas de page */
  faqs?: FaqItem[];

  /** Guides liés (3-4) */
  relatedGuides?: InternalLink[];

  /** CTA principal */
  ctaPrimary?: { href: string; label: string };

  /** Bannière GMC finale (variant "guide") */
  showGmcGateway?: boolean;
}

export default function PillarPage(props: PillarPageProps) {
  const lastUpdated = new Date().toLocaleDateString("fr-FR", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <Breadcrumb segments={props.breadcrumb} />

      <header className="max-w-3xl mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-3">
          {props.title}
        </h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">{props.intro}</p>
        <p className="text-xs text-muted-foreground mt-3">
          Mis à jour le {lastUpdated} · Par l'équipe VerifierMonDevis.fr
        </p>
      </header>

      <div className="grid md:grid-cols-[1fr_240px] lg:grid-cols-[1fr_280px] gap-8 md:gap-10">
        {/* Contenu principal */}
        <article className="max-w-3xl prose prose-sm md:prose-base max-w-none prose-headings:tracking-tight prose-headings:scroll-mt-20 prose-a:text-primary">
          {props.sections.map((s, idx) => (
            <section key={s.id} id={s.id}>
              <h2 className="text-2xl md:text-[1.65rem] font-bold tracking-tight mt-10 first:mt-0 mb-4">
                {s.title}
              </h2>
              {s.body}
              {s.insertGmcAfter && (
                <div className="my-8 not-prose">
                  <GmcGatewayBanner variant="guide" />
                </div>
              )}
            </section>
          ))}

          {props.faqs && props.faqs.length > 0 && (
            <div className="not-prose">
              <FAQ items={props.faqs} />
            </div>
          )}

          {props.relatedGuides && props.relatedGuides.length > 0 && (
            <div className="not-prose">
              <RelatedGuides items={props.relatedGuides} />
            </div>
          )}

          {props.showGmcGateway && (
            <div className="not-prose mt-10">
              <GmcGatewayBanner variant="guide" />
            </div>
          )}

          {props.ctaPrimary && (
            <div className="not-prose mt-10 flex justify-center">
              <Button asChild size="lg">
                <a href={props.ctaPrimary.href}>
                  {props.ctaPrimary.label} <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          )}
        </article>

        {/* Sommaire latéral */}
        <TableOfContents items={props.toc} />
      </div>
    </main>
  );
}
