/**
 * src/components/pages/ComparateurAccueil.tsx
 *
 * Landing du comparateur — promesse + 3 steps + CTA. Liste aussi les
 * comparaisons existantes de l'utilisateur si connecté.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Search, Trash2 } from "lucide-react";

interface ComparisonRow {
  id: string;
  title: string;
  analysis_ids: string[];
  status: string;
  created_at: string;
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

export default function ComparateurAccueil() {
  const [comparisons, setComparisons] = useState<ComparisonRow[]>([]);
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setAuthed(false);
        setLoading(false);
        return;
      }
      setAuthed(true);
      const res = await fetch("/api/comparison", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setComparisons(Array.isArray(data?.comparisons) ? data.comparisons : []);
      }
      setLoading(false);
    })();
  }, []);

  async function deleteComparison(id: string) {
    if (!confirm("Supprimer cette comparaison ?")) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`/api/comparison/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) setComparisons((c) => c.filter((x) => x.id !== id));
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-sm text-muted-foreground mb-2">
        <a href="/tableau-de-bord" className="text-primary">Tableau de bord</a> › Comparateur
      </div>

      <div className="bg-card border border-border rounded-xl p-10 text-center shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight mb-3">
          Comparez 2 à 4 devis. Évitez les pièges cachés.
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto mb-7 leading-relaxed">
          Vous avez plusieurs devis pour le même chantier ? Notre expert détecte ce qu'un particulier ne voit pas :
          postes omis, quantités sous-estimées, matériel non précisé, clauses abusives.
          <strong className="text-foreground"> Vous savez lire un total HT. On vous montre le reste.</strong>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-8 text-left">
          <div className="bg-background rounded-lg p-4">
            <div className="w-7 h-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-sm mb-2">1</div>
            <h3 className="text-sm font-semibold mb-1">Ajoutez 2 à 4 devis</h3>
            <p className="text-xs text-muted-foreground">Parmi vos analyses existantes. Même chantier, périmètres comparables.</p>
          </div>
          <div className="bg-background rounded-lg p-4">
            <div className="w-7 h-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-sm mb-2">2</div>
            <h3 className="text-sm font-semibold mb-1">L'expert les passe au crible</h3>
            <p className="text-xs text-muted-foreground">Alignement poste à poste, détection des omissions, lecture du matériel, quantités et clauses.</p>
          </div>
          <div className="bg-background rounded-lg p-4">
            <div className="w-7 h-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-sm mb-2">3</div>
            <h3 className="text-sm font-semibold mb-1">Verdict tranché + 3 leviers</h3>
            <p className="text-xs text-muted-foreground">"Notre choix par défaut : X parce que…" + scénarios alternatifs selon vos priorités.</p>
          </div>
        </div>

        <Button size="lg" onClick={() => (window.location.href = authed ? "/comparateur/nouveau" : "/connexion?next=/comparateur/nouveau")}>
          <Search className="h-4 w-4 mr-2" /> Démarrer une comparaison
        </Button>
        <p className="text-xs text-muted-foreground mt-4">
          1 comparaison gratuite. Pass Sérénité (4,99 €/mois) = illimité + PDF.
        </p>
      </div>

      {authed && !loading && comparisons.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold mb-3">Vos comparaisons précédentes</h2>
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            {comparisons.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-4">
                <a href={`/comparateur/${c.id}`} className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{c.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.analysis_ids.length} devis · {fmtDate(c.created_at)} ·{" "}
                    <span className={
                      c.status === "ready" ? "text-green-700" :
                      c.status === "rejected_perimeter" ? "text-amber-700" :
                      "text-muted-foreground"
                    }>
                      {c.status === "ready" ? "Prête" : c.status === "rejected_perimeter" ? "Périmètres trop différents" : c.status}
                    </span>
                  </div>
                </a>
                <button onClick={() => deleteComparison(c.id)} className="p-2 hover:bg-muted rounded-md" aria-label="Supprimer cette comparaison">
                  <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
