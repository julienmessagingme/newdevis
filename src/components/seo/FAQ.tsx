/**
 * src/components/seo/FAQ.tsx
 *
 * Section FAQ avec accordions natifs <details>/<summary>.
 * Le JSON-LD FAQPage est généré séparément côté Astro via faqSchema().
 */

export interface FaqItem {
  q: string;
  a: string; // HTML autorisé via dangerouslySetInnerHTML
}

interface Props {
  items: FaqItem[];
  title?: string;
  className?: string;
}

export default function FAQ({ items, title = "Questions fréquentes", className = "" }: Props) {
  if (!items.length) return null;

  return (
    <section className={`my-10 ${className}`} aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="text-2xl font-bold tracking-tight mb-6">{title}</h2>
      <div className="space-y-3">
        {items.map((f, idx) => (
          <details key={idx} className="bg-card border border-border rounded-lg group">
            <summary className="cursor-pointer select-none p-4 font-semibold text-sm flex items-center justify-between">
              <span className="pr-4">{f.q}</span>
              <span className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true">▼</span>
            </summary>
            <div
              className="px-4 pb-4 text-sm text-foreground/80 leading-relaxed prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: f.a }}
            />
          </details>
        ))}
      </div>
    </section>
  );
}
