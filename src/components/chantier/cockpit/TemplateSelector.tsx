import React, { useState, useRef, useEffect } from "react";
import { FileText } from "lucide-react";
import {
  MESSAGE_TEMPLATES,
  TEMPLATE_CATEGORIES,
  interpolateTemplate,
} from "@/data/MESSAGE_TEMPLATES";
import type { MessageTemplate } from "@/data/MESSAGE_TEMPLATES";

interface TemplateSelectorProps {
  onSelect: (subject: string, body: string) => void;
  variables: Record<string, string>;
}

export default function TemplateSelector({
  onSelect,
  variables,
}: TemplateSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const grouped = (Object.keys(TEMPLATE_CATEGORIES) as MessageTemplate["category"][]).reduce(
    (acc, cat) => {
      const items = MESSAGE_TEMPLATES.filter((t) => t.category === cat);
      if (items.length > 0) acc.push({ category: cat, items });
      return acc;
    },
    [] as { category: MessageTemplate["category"]; items: MessageTemplate[] }[],
  );

  function handleSelect(template: MessageTemplate) {
    const subject = interpolateTemplate(template.subject, variables);
    const body = interpolateTemplate(template.body, variables);
    onSelect(subject, body);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
      >
        <FileText className="h-3.5 w-3.5" />
        Template
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="max-h-80 overflow-y-auto p-2">
            {grouped.map(({ category, items }) => (
              <div key={category} className="mb-2 last:mb-0">
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {TEMPLATE_CATEGORIES[category]}
                </div>
                {items.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleSelect(template)}
                    className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
