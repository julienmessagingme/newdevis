/**
 * Astro Content Collections — schemas Zod pour le contenu SEO éditorial.
 *
 * Centre d'aide : bibliothèque de ressources GérerMonChantier (SEO problem-driven).
 * Chaque article vit dans src/content/centre-aide/<categorie>/<slug>.md.
 * La catégorie est dérivée du path (dossier parent), pas du frontmatter.
 */

import { defineCollection, z } from "astro:content";

const centreAide = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    // Note : le slug de l'URL est dérivé du filename par Astro (champ système).
    // On ne le déclare pas dans le schéma. Le path du fichier détermine :
    // src/content/centre-aide/<categorie>/<slug>.md -> /centre-aide/<categorie>/<slug>
    publishedAt: z.string(),                    // ISO YYYY-MM-DD
    updatedAt: z.string().optional(),
    tags: z.array(z.string()).default([]),
    faq: z
      .array(z.object({ q: z.string(), a: z.string() }))
      .default([]),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    ogImage: z.string().optional(),
    /** Override du CTA GMC de la catégorie (accroche contextuelle article). */
    gmcCta: z
      .object({
        hook: z.string().optional(),
      })
      .optional(),
    /** Override des cross-links VMD de la catégorie. */
    vmdLinks: z
      .array(z.object({ href: z.string(), label: z.string() }))
      .optional(),
  }),
});

export const collections = {
  "centre-aide": centreAide,
};
