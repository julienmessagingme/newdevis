import { Loader2, Pencil, Play, Ban, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NARRATIVE_LABELS,
  MOOD_LABELS,
  PRODUCT_BADGE,
  MACRO_FORMAT_LABELS,
  MARKETING_PLATFORM_BADGE,
  formatRelativeDate,
} from "./helpers";
import type { TemplateListItem, NarrativeType, MacroFormat } from "@/types/marketing";

interface Props {
  templates: TemplateListItem[];
  loading: boolean;
  onEdit: (t: TemplateListItem) => void;
  onGenerate: (t: TemplateListItem) => void;
  onToggleActive: (t: TemplateListItem) => void;
  onPreview?: (t: TemplateListItem) => void;
}

/** Compte le nombre total de slides dans preview_urls (toutes plateformes confondues). */
function previewSlideCount(t: TemplateListItem): number {
  if (!t.preview_urls) return 0;
  return Object.values(t.preview_urls).reduce(
    (acc, slides) => acc + (slides ? Object.keys(slides).length : 0),
    0,
  );
}

export default function TemplateTable({
  templates,
  loading,
  onEdit,
  onGenerate,
  onToggleActive,
  onPreview,
}: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12">
        Aucun script ne correspond aux filtres.
      </p>
    );
  }

  const allInCooldown = (t: TemplateListItem) =>
    Object.values(t.cooldown_until).every(
      (v) => v !== null && new Date(v) > new Date(),
    );

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 text-left">ID</th>
            <th className="px-3 py-2 text-left">Titre</th>
            <th className="px-3 py-2 text-center">Produit</th>
            <th className="px-3 py-2 text-center">Macro V3</th>
            <th className="px-3 py-2 text-center">Plateforme</th>
            <th className="px-3 py-2 text-center">Slides</th>
            <th className="px-3 py-2 text-center">Aperçu</th>
            <th className="px-3 py-2 text-center">Mood</th>
            <th className="px-3 py-2 text-left">Dernier usage</th>
            <th className="px-3 py-2 text-center">Dispo</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {templates.map((t) => {
            const badge = PRODUCT_BADGE[t.product];
            const macroLabel = t.macro_format
              ? MACRO_FORMAT_LABELS[t.macro_format as MacroFormat] ?? t.macro_format
              : null;
            const platformBadge = t.platform ? MARKETING_PLATFORM_BADGE[t.platform] : null;
            const narrativeLabel =
              NARRATIVE_LABELS[t.narrative_type as NarrativeType] ?? t.narrative_type;
            const inCooldown = allInCooldown(t);

            return (
              <tr key={t.id} className="hover:bg-muted/30 transition">
                <td className="px-3 py-2 font-mono text-xs">{t.id}</td>
                <td className="px-3 py-2 max-w-[220px] truncate" title={t.title}>{t.title}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs border font-medium ${badge?.class ?? ""}`}>
                    {badge?.label ?? t.product}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  {t.macro_format ? (
                    <>
                      <span className="font-mono font-bold text-xs">{t.macro_format}</span>
                      <div className="text-muted-foreground text-[10px] leading-tight">{macroLabel}</div>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-xs italic" title={`legacy ${t.narrative_type} · ${narrativeLabel}`}>
                      legacy {t.narrative_type}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {platformBadge ? (
                    <span className={`inline-block px-2 py-0.5 rounded text-xs border font-medium ${platformBadge.class}`}>
                      {platformBadge.label}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">{t.format_size}</td>
                <td className="px-3 py-2 text-center">
                  {previewSlideCount(t) > 0 ? (
                    <span className="inline-block px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                      {previewSlideCount(t)} PNG
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className="text-xs">{MOOD_LABELS[t.mood] ?? t.mood}</span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {t.last_usage ? (
                    <>
                      {formatRelativeDate(t.last_usage.date)}{" "}
                      <span className="text-muted-foreground">· {t.last_usage.platform}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Jamais</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {!t.is_active ? (
                    <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">Désactivé</span>
                  ) : inCooldown ? (
                    <span className="inline-block px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">Cooldown</span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700">Dispo</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    {onPreview && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onPreview(t)}
                        disabled={previewSlideCount(t) === 0}
                        title={
                          previewSlideCount(t) === 0
                            ? "Pas encore d'aperçu rendu"
                            : "Voir l'aperçu carousel"
                        }
                      >
                        <Eye className={`h-3.5 w-3.5 ${previewSlideCount(t) === 0 ? "" : "text-blue-600"}`} />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(t)}
                      title="Éditer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onGenerate(t)}
                      disabled={inCooldown || !t.is_active}
                      title={inCooldown ? "En cooldown" : "Générer ce script"}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleActive(t)}
                      title={t.is_active ? "Désactiver" : "Réactiver"}
                    >
                      <Ban className={`h-3.5 w-3.5 ${!t.is_active ? "text-emerald-600" : "text-red-500"}`} />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
