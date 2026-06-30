/**
 * src/components/seo/Breadcrumb.tsx
 *
 * Fil d'Ariane visuel + JSON-LD BreadcrumbList associé.
 * À utiliser en haut de chaque page pilier/guide/litige.
 */

import { ChevronRight, Home } from "lucide-react";

export interface BreadcrumbSegment {
  name: string;
  href: string;
}

interface Props {
  segments: BreadcrumbSegment[];
  className?: string;
}

export default function Breadcrumb({ segments, className = "" }: Props) {
  return (
    <nav aria-label="Fil d'Ariane" className={`text-xs text-muted-foreground mb-4 ${className}`}>
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <a href="/" className="hover:text-primary inline-flex items-center" aria-label="Accueil">
            <Home className="h-3.5 w-3.5" />
          </a>
        </li>
        {segments.map((s, idx) => (
          <li key={s.href} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />
            {idx === segments.length - 1 ? (
              <span className="text-foreground font-medium" aria-current="page">{s.name}</span>
            ) : (
              <a href={s.href} className="hover:text-primary">{s.name}</a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
