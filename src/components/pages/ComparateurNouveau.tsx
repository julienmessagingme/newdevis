/**
 * src/components/pages/ComparateurNouveau.tsx
 *
 * Sélection des analyses à comparer (2 à 4) parmi les analyses existantes
 * de l'utilisateur. POST /api/comparison à la fin, redirige vers le résultat.
 *
 * V1 : on ne propose pas l'upload depuis cet écran — l'utilisateur upload
 * d'abord via /nouvelle-analyse, puis revient ici.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Check } from "lucide-react";

interface AnalysisRow {
  id: string;
  file_name: string | null;
  status: string;
  created_at: string;
  conclusion_ia: string | null;
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ComparateurNouveau() {
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "/connexion?next=" + encodeURIComponent(window.location.pathname);
        return;
      }
      const { data, error: e } = await supabase
        .from("analyses")
        .select("id, file_name, status, created_at, conclusion_ia")
        .eq("user_id", session.user.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(50);
      if (e) setError(e.message);
      else setAnalyses(data ?? []);
      setLoading(false);
    })();
  }, []);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else {
      if (next.size >= 4) return;
      next.add(id);
    }
    setSelected(next);
  }

  async function submit() {
    if (selected.size < 2 || selected.size > 4) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non connecté");
      const res = await fetch("/api/comparison", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ analysis_ids: [...selected] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `Erreur ${res.status}`);
      window.location.href = `/comparateur/${json.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button onClick={() => (window.location.href = "/comparateur")} className="text-sm text-primary mb-4 inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Comparateur
      </button>

      <h1 className="text-2xl font-semibold mb-2 tracking-tight">Choisissez 2 à 4 devis à comparer</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Sélectionnez les analyses qui portent sur le <strong>même chantier</strong>. Pour ajouter un nouveau devis, faites d'abord son analyse depuis <a href="/nouvelle-analyse" className="text-primary underline">nouvelle analyse</a>.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      <div className="bg-card border border-border rounded-xl divide-y divide-border mb-4">
        {analyses.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Aucune analyse complétée pour le moment. <a className="text-primary underline" href="/nouvelle-analyse">Démarrer une nouvelle analyse</a>.
          </div>
        ) : (
          analyses.map((a) => {
            const isSel = selected.has(a.id);
            const disabled = !isSel && selected.size >= 4;
            return (
              <button
                key={a.id}
                disabled={disabled}
                onClick={() => toggle(a.id)}
                className={`w-full text-left p-4 flex items-center gap-3 transition-colors ${
                  isSel ? "bg-accent" : disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-muted"
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${isSel ? "bg-primary border-primary" : "border-border"}`}>
                  {isSel && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm">{a.file_name ?? "(sans nom)"}</div>
                  <div className="text-xs text-muted-foreground">Analysé le {fmtDate(a.created_at)}</div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between bg-card border border-border rounded-xl p-4">
        <div className="text-sm">
          <strong>{selected.size}/4</strong> devis sélectionnés {selected.size > 0 && selected.size < 2 && <span className="text-amber-700">(minimum 2)</span>}
        </div>
        <Button onClick={submit} disabled={selected.size < 2 || submitting}>
          {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyse en cours…</> : "Comparer →"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-6 text-center">
        1 comparaison gratuite. Pass Sérénité (4,99 €/mois) = comparaisons illimitées + rapport PDF.
      </p>
    </div>
  );
}
