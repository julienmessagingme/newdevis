/**
 * src/lib/seo/schemaOrg.ts
 *
 * Helpers pour générer les snippets JSON-LD Schema.org à injecter dans les
 * pages SEO. À utiliser via `<script type="application/ld+json" set:html={...} />`
 * dans BaseLayout ou directement dans une page Astro.
 *
 * Doc : https://schema.org / https://developers.google.com/search/docs/appearance/structured-data
 */

export interface ArticleSchemaInput {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  datePublished: string;   // ISO 8601
  dateModified?: string;
  authorName?: string;
}

export function articleSchema(input: ArticleSchemaInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    image: input.imageUrl ?? "https://www.verifiermondevis.fr/og-default.png",
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    author: {
      "@type": input.authorName ? "Person" : "Organization",
      name: input.authorName ?? "VerifierMonDevis.fr",
    },
    publisher: {
      "@type": "Organization",
      name: "VerifierMonDevis.fr",
      logo: {
        "@type": "ImageObject",
        url: "https://www.verifiermondevis.fr/logo.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": input.url,
    },
  };
}

export interface HowToStep {
  name: string;
  text: string;
  url?: string;
}

export function howToSchema(input: {
  name: string;
  description: string;
  steps: HowToStep[];
  totalTime?: string; // ISO 8601 duration ex: PT15M
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: input.name,
    description: input.description,
    totalTime: input.totalTime,
    step: input.steps.map((s, idx) => ({
      "@type": "HowToStep",
      position: idx + 1,
      name: s.name,
      text: s.text,
      url: s.url,
    })),
  };
}

export function faqSchema(faqs: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a,
      },
    })),
  };
}

export function breadcrumbSchema(segments: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: segments.map((s, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: s.name,
      item: s.url,
    })),
  };
}

export function softwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "VerifierMonDevis.fr",
    description:
      "Outil d'analyse de devis travaux avec IA. Compare votre devis à une base de plus de 891 prix marché et alerte sur les anomalies.",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
      description: "Analyse gratuite, Pass Sérénité 4,99 €/mois",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.7",
      ratingCount: "127",
    },
  };
}

export function productSchema(input: {
  name: string;
  description: string;
  price: string;
  priceCurrency?: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    offers: {
      "@type": "Offer",
      url: input.url,
      priceCurrency: input.priceCurrency ?? "EUR",
      price: input.price,
      availability: "https://schema.org/InStock",
    },
  };
}

/** Concatène plusieurs schemas en un seul tableau (Google accepte tableau de schemas). */
export function combineSchemas(...schemas: Array<Record<string, unknown> | null | undefined>) {
  return schemas.filter(Boolean) as Record<string, unknown>[];
}
