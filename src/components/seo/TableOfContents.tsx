/**
 * src/components/seo/TableOfContents.tsx
 *
 * Sommaire latéral (sticky desktop, accordion mobile).
 * Améliore le temps de lecture + signal SEO (structure claire).
 */

import { useState } from "react";
import { List, ChevronDown } from "lucide-react";

export interface TocItem {
  id: string;     // ancre (sans #)
  label: string;
  children?: TocItem[];
}

interface Props {
  items: TocItem[];
  title?: string;
}

export default function TableOfContents({ items, title = "Sommaire" }: Props) {
  const [open, setOpen] = useState(false);

  if (!items.length) return null;

  return (
    <>
      {/* Mobile : accordion */}
      <div className="md:hidden bg-card border border-border rounded-lg mb-6">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between p-4 text-sm font-semibold"
        >
          <span className="inline-flex items-center gap-2"><List className="h-4 w-4" /> {title}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <ol className="px-4 pb-4 space-y-1 text-sm">
            {items.map((it) => (
              <li key={it.id}>
                <a href={`#${it.id}`} className="text-primary hover:underline">{it.label}</a>
                {it.children && (
                  <ol className="ml-4 mt-1 space-y-1 text-xs">
                    {it.children.map((c) => (
                      <li key={c.id}>
                        <a href={`#${c.id}`} className="text-muted-foreground hover:text-primary">{c.label}</a>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Desktop : sticky sidebar */}
      <aside className="hidden md:block">
        <div className="sticky top-6 bg-card border border-border rounded-lg p-5 max-h-[calc(100vh-3rem)] overflow-y-auto">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 inline-flex items-center gap-2">
            <List className="h-3.5 w-3.5" /> {title}
          </div>
          <ol className="space-y-2 text-sm">
            {items.map((it) => (
              <li key={it.id}>
                <a href={`#${it.id}`} className="text-foreground hover:text-primary block py-0.5">{it.label}</a>
                {it.children && (
                  <ol className="ml-4 mt-1 space-y-1 text-xs">
                    {it.children.map((c) => (
                      <li key={c.id}>
                        <a href={`#${c.id}`} className="text-muted-foreground hover:text-primary block py-0.5">{c.label}</a>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </>
  );
}
