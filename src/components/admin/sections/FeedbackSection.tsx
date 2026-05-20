/**
 * FeedbackSection — admin
 *
 * V3.4.14+ (2026-05-16) — Affiche les feedbacks utilisateur (table
 * `analysis_feedback`), filtrable par choice. Source : /api/admin/feedback.
 *
 * Compteurs : total / 👍 positive / 😐 neutral / ❌ negative.
 * Liste : 50 plus récents par défaut, jusqu'à 200 si filtre actif.
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface FeedbackItem {
  id: string;
  analysis_id: string;
  user_id: string;
  choice: "positive" | "neutral" | "negative";
  text: string | null;
  verdict_at_submission: "VERT" | "ORANGE" | "ROUGE" | null;
  tags: string[] | null;  // V3.4.20+ — chips causes du feedback négatif
  created_at: string;
  user_email: string | null;
  file_name: string | null;
}

// Mapping des tags techniques → libellés humains (aligné avec NEGATIVE_TAGS de FeedbackModal)
const TAG_LABELS: Record<string, string> = {
  mauvaise_entreprise:    "Mauvaise entreprise",
  faux_radiee:            "Faux radiée",
  siret_non_extrait:      "SIRET non lu",
  prix_marche_incorrect:  "Prix marché KO",
  verdict_incoherent:     "Verdict incohérent",
  mauvais_type_doc:       "Pas un devis",
  autre:                  "Autre",
};

interface FeedbackCounts {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
}

const CHOICE_FILTERS = [
  { id: null,         label: "Tous",         className: "bg-slate-100 text-slate-700"   },
  { id: "positive",   label: "👍 Positif",   className: "bg-emerald-50 text-emerald-700" },
  { id: "neutral",    label: "😐 Neutre",    className: "bg-amber-50 text-amber-700"     },
  { id: "negative",   label: "❌ Négatif",   className: "bg-red-50 text-red-700"         },
] as const;

const CHOICE_BADGE: Record<FeedbackItem["choice"], string> = {
  positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  neutral:  "bg-amber-50 text-amber-700 border-amber-200",
  negative: "bg-red-50 text-red-700 border-red-200",
};

const CHOICE_EMOJI: Record<FeedbackItem["choice"], string> = {
  positive: "👍",
  neutral:  "😐",
  negative: "❌",
};

const VERDICT_BADGE: Record<NonNullable<FeedbackItem["verdict_at_submission"]>, string> = {
  VERT:   "bg-emerald-50 text-emerald-700",
  ORANGE: "bg-amber-50 text-amber-700",
  ROUGE:  "bg-red-50 text-red-700",
};

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function FeedbackSection() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [counts, setCounts] = useState<FeedbackCounts>({ total: 0, positive: 0, neutral: 0, negative: 0 });
  const [filter, setFilter] = useState<FeedbackItem["choice"] | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (currentFilter: FeedbackItem["choice"] | null) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const params = new URLSearchParams();
      if (currentFilter) params.set("choice", currentFilter);
      const res = await fetch(`/api/admin/feedback?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFeedback(data.feedback ?? []);
      setCounts(data.counts ?? { total: 0, positive: 0, neutral: 0, negative: 0 });
    } catch (err) {
      console.error("[FeedbackSection] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(filter); }, [fetchData, filter]);

  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        Feedback utilisateurs
        <span className="text-sm font-normal text-muted-foreground">
          ({counts.total} au total)
        </span>
      </h2>

      {/* Filtres + compteurs */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {CHOICE_FILTERS.map((f) => {
          const count =
            f.id === null ? counts.total :
            f.id === "positive" ? counts.positive :
            f.id === "neutral" ? counts.neutral :
            counts.negative;
          const active = filter === f.id;
          return (
            <button
              key={f.label}
              onClick={() => setFilter(f.id ?? null)}
              className={`
                px-3 py-1.5 rounded-lg text-sm font-medium transition-all touch-manipulation
                ${active
                  ? `${f.className} ring-2 ring-offset-1 ring-primary/30`
                  : `${f.className} opacity-70 hover:opacity-100`}
              `}
            >
              {f.label} <span className="ml-1 opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Liste */}
      {loading ? (
        <Card>
          <CardContent className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Chargement…</span>
          </CardContent>
        </Card>
      ) : feedback.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Choix</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Verdict</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Utilisateur</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Fichier</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Commentaire</th>
                  </tr>
                </thead>
                <tbody>
                  {feedback.map((f) => (
                    <tr key={f.id} className="border-b border-border/50 hover:bg-muted/30 align-top">
                      <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(f.created_at)}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${CHOICE_BADGE[f.choice]}`}>
                          {CHOICE_EMOJI[f.choice]} {f.choice}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        {f.verdict_at_submission ? (
                          <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${VERDICT_BADGE[f.verdict_at_submission]}`}>
                            {f.verdict_at_submission}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-xs">
                        {f.user_email ? (
                          <a href={`mailto:${f.user_email}`} className="text-primary hover:underline">
                            {f.user_email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground font-mono">{f.user_id.slice(0, 8)}…</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-xs max-w-[200px] truncate">
                        {f.file_name ? (
                          <a
                            href={`/analyse/${f.analysis_id}`}
                            className="text-primary hover:underline font-mono"
                            target="_blank"
                            rel="noopener noreferrer"
                            title={f.file_name}
                          >
                            {f.file_name}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-sm text-foreground max-w-md">
                        {/* V3.4.20+ — Chips tags (causes) au-dessus du commentaire libre.
                            Affichés uniquement sur les feedbacks négatifs (les autres choices
                            n'ont jamais de tags par contrat API). */}
                        {f.tags && f.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {f.tags.map((t) => (
                              <span
                                key={t}
                                className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200"
                                title={t}
                              >
                                {TAG_LABELS[t] ?? t}
                              </span>
                            ))}
                          </div>
                        )}
                        {f.text ? (
                          <span className="italic text-slate-700">"{f.text}"</span>
                        ) : !f.tags || f.tags.length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            {filter
              ? `Aucun feedback ${filter} pour le moment.`
              : "Aucun feedback reçu pour le moment. La modal s'affiche après que l'utilisateur clique sur \"Copier le message pour négocier\"."}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
