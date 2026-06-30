/**
 * src/components/pages/seo/HubPage.tsx
 *
 * Template pour pages hub catégories (/guides/, /litiges/, /prix-travaux/, etc.)
 * Liste les sous-pages avec excerpts + maillage. Sert de "table des matières"
 * du cocon sémantique.
 */

import Breadcrumb, { type BreadcrumbSegment } from "@/components/seo/Breadcrumb";
import RelatedGuides from "@/components/seo/RelatedGuides";
import GmcGatewayBanner from "@/components/cta/GmcGatewayBanner";
import type { InternalLink } from "@/lib/seo/internalLinking";

interface Props {
  breadcrumb: BreadcrumbSegment[];
  title: string;
  intro: string;
  /** Sous-pages affichées comme cards */
  children: InternalLink[];
  /** Bannière GMC visible */
  showGmcGateway?: boolean;
  /** Texte introductif riche en pied de page */
  footerHtml?: string;
}

export default function HubPage(props: Props) {
  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <Breadcrumb segments={props.breadcrumb} />

      <header className="max-w-3xl mb-10">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">{props.title}</h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">{props.intro}</p>
      </header>

      <RelatedGuides items={props.children} title="" />

      {props.footerHtml && (
        <article
          className="prose prose-sm md:prose-base max-w-3xl mt-12"
          dangerouslySetInnerHTML={{ __html: props.footerHtml }}
        />
      )}

      {props.showGmcGateway && (
        <div className="mt-10 max-w-3xl">
          <GmcGatewayBanner variant="guide" />
        </div>
      )}
    </main>
  );
}
