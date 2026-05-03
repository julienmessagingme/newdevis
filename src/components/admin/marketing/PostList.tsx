import { ImageOff, Loader2 } from "lucide-react";
import {
  PERSONA_LABELS,
  PLATFORM_LABELS,
  STATUS_BADGE_CLASS,
  STATUS_LABELS,
  formatRelativeDate,
} from "./helpers";
import type { MarketingPostListItem } from "@/types/marketing";

interface PostListProps {
  posts: MarketingPostListItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (post: MarketingPostListItem) => void;
}

export default function PostList({ posts, loading, selectedId, onSelect }: PostListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 bg-card rounded-xl border">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-card rounded-xl border text-muted-foreground">
        <p className="font-medium">Aucun post à afficher</p>
        <p className="text-sm">Modifie les filtres ou attends qu'un agent en génère un.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border overflow-hidden">
      <div className="overflow-auto overscroll-x-contain">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-semibold w-16">Visu</th>
              <th className="text-left px-4 py-3 font-semibold">Hook</th>
              <th className="text-left px-4 py-3 font-semibold w-40">Plateforme · Persona</th>
              <th className="text-left px-4 py-3 font-semibold w-44">Statut</th>
              <th className="text-left px-4 py-3 font-semibold w-20">Score</th>
              <th className="text-left px-4 py-3 font-semibold w-28">Slides</th>
              <th className="text-left px-4 py-3 font-semibold w-32">Créé</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {posts.map((p) => (
              <tr
                key={p.id}
                onClick={() => onSelect(p)}
                className={`cursor-pointer hover:bg-muted/30 transition-colors ${
                  selectedId === p.id ? "bg-primary/5" : ""
                }`}
              >
                <td className="px-4 py-3">
                  {p.cover_url ? (
                    <img
                      src={p.cover_url}
                      alt=""
                      loading="lazy"
                      className="w-12 h-12 rounded object-cover bg-muted"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                      <ImageOff className="h-5 w-5 text-muted-foreground/60" />
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 max-w-md">
                  <div className="font-medium text-foreground line-clamp-2">{p.hook}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <div className="font-medium text-foreground">{PLATFORM_LABELS[p.platform]}</div>
                  <div className="text-xs">{PERSONA_LABELS[p.persona_target]}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${STATUS_BADGE_CLASS[p.status]}`}
                  >
                    {STATUS_LABELS[p.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {typeof p.quality_score === "number"
                    ? p.quality_score.toFixed(2)
                    : "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.slide_count}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {formatRelativeDate(p.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
