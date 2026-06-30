/**
 * src/components/seo/RelatedGuides.tsx
 *
 * Liste de 3-4 guides liés, calés sur le maillage interne.
 * À utiliser en fin de page pilier/guide/litige.
 */

import { ArrowRight, BookOpen } from "lucide-react";
import type { InternalLink } from "@/lib/seo/internalLinking";

interface Props {
  items: InternalLink[];
  title?: string;
  className?: string;
}

const TYPE_LABEL: Record<InternalLink["type"], string> = {
  pillar: "Guide complet",
  guide: "Guide",
  tool: "Outil",
  study: "Étude VMD",
  litige: "Litige",
};

export default function RelatedGuides({ items, title = "Pour aller plus loin", className = "" }: Props) {
  if (!items.length) return null;

  return (
    <section className={`my-10 ${className}`}>
      <h2 className="text-2xl font-bold tracking-tight mb-6 inline-flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" /> {title}
      </h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((g) => (
          <a
            key={g.href}
            href={g.href}
            className="block bg-card border border-border hover:border-primary/50 rounded-xl p-5 transition-colors group"
          >
            <div className="text-[10px] uppercase tracking-wider text-primary font-bold mb-2">
              {TYPE_LABEL[g.type]}
            </div>
            <h3 className="font-semibold text-base mb-1 group-hover:text-primary transition-colors">{g.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">{g.excerpt}</p>
            <span className="text-sm text-primary font-medium inline-flex items-center gap-1">
              Lire <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
