/**
 * src/components/pages/ComparateurResult.tsx
 *
 * Vue résultat d'une comparaison (route /comparateur/[id]).
 *
 * Lit la comparaison via GET /api/comparison/[id] et affiche :
 *   1. Verdict expert + 3 leviers conditionnels
 *   2. Section PRIX (4 mini-cards)
 *   3. Section ENTREPRISE
 *   4. Section POINTS CLEFS (œil expert)
 *   5. Section POINTS DE VIGILANCE
 *   6. Détail postes (accordion replié)
 *   7. Disclaimer honnêteté
 *
 * Posture : si info manquante → "Information non disponible" en gris.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, FileDown, Mail } from "lucide-react";

interface ComparatorVerdict {
  status: "ready" | "rejected_perimeter";
  rejection_reason?: string;
  analyses: Array<{
    id: string;
    file_name: string | null;
    artisan_nom: string | null;
    total_ht: number;
    total_ttc: number;
    confiance: "certifie" | "indicatif" | "non_comparable";
    rank: number;
    is_recommended: boolean;
  }>;
  perimeter: Array<{
    job_type: string;
    label: string;
    presence: Record<string, number | null>;
  }>;
  recommended_analysis_id: string;
  verdict_summary: string;
  key_findings: Array<{ icon: string; title: string; detail: string; impacted_analyses: string[] }>;
  vigilance: Array<{ level: "warning" | "danger"; icon: string; title: string; detail: string; impacted_analyses: string[] }>;
  levers: Array<{ title: string; winner_analysis_id: string; detail: string }>;
  details: Record<
    string,
    {
      prix: { total_ht: number; total_ttc: number; verdict_marche: string; acompte_pct: number | null };
      entreprise: {
        anciennete_ans: number | null;
        google_note: number | null;
        google_reviews: number | null;
        assurance: boolean | null;
        clauses_litigieuses: string[];
      };
      transparence: {
        quantites_pct: number;
        materiel_marques: string[];
        echeancier_clair: boolean;
      };
    }
  >;
}

interface ComparisonData {
  id: string;
  title: string;
  analysis_ids: string[];
  verdict: ComparatorVerdict | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("fr-FR");
}

function rankLabel(r: number): string {
  return r === 1 ? "🥇 1er" : r === 2 ? "🥈 2e" : r === 3 ? "🥉 3e" : "4e";
}

function colorVerdictPrix(v: string): string {
  if (v === "Bas") return "text-green-700";
  if (v === "Élevé") return "text-amber-700";
  if (v === "Inconnu") return "text-muted-foreground italic";
  return "text-foreground";
}

export default function ComparateurResult() {
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = (path: string) => { window.location.href = path; };

  useEffect(() => {
    const id = window.location.pathname.split("/").pop();
    if (!id) {
      setError("ID manquant dans l'URL");
      setLoading(false);
      return;
    }
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "/connexion?next=" + encodeURIComponent(window.location.pathname);
        return;
      }
      const res = await fetch(`/api/comparison/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setError(`Erreur ${res.status}`);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setComparison(data);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-destructive">{error}</p>
        <Button onClick={() => navigate("/comparateur")}>Retour au comparateur</Button>
      </div>
    );
  }
  if (!comparison) return null;

  if (comparison.status === "rejected_perimeter") {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <button onClick={() => navigate("/comparateur")} className="text-sm text-primary mb-4 inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Comparateur
        </button>
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-6">
          <h2 className="font-semibold text-amber-900 mb-2">Comparaison impossible</h2>
          <p className="text-sm text-amber-800">{comparison.error_message ?? "Vos devis ne semblent pas porter sur les mêmes travaux."}</p>
          <p className="text-xs text-amber-700 mt-3">Le comparateur V1 ne traite que les devis qui couvrent le même chantier (cas A). Si vos devis ont des périmètres très différents, comparez-les individuellement via leur analyse.</p>
        </div>
      </div>
    );
  }

  const v = comparison.verdict;
  if (!v) return null;

  const recommended = v.analyses.find((a) => a.is_recommended)!;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <button onClick={() => navigate("/comparateur")} className="text-sm text-primary mb-4 inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Comparateur
      </button>

      <h1 className="text-2xl font-semibold mb-2 tracking-tight">{comparison.title}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {v.analyses.length} artisans consultés pour le même chantier. Voici notre analyse experte.
      </p>

      {/* VERDICT HERO */}
      <div className="bg-card border-2 border-primary rounded-xl p-6 mb-7 shadow-sm">
        <span className="inline-block bg-primary text-primary-foreground px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
          Verdict expert
        </span>
        <h2 className="text-xl font-semibold mt-3 mb-1">
          Notre choix par défaut : <span className="text-primary">{recommended.artisan_nom ?? "ce devis"}</span>
        </h2>
        <p className="text-sm text-muted-foreground mb-4">{v.verdict_summary}</p>

        {/* 3 différences clefs */}
        {v.key_findings.length > 0 && (
          <div className="bg-muted rounded-lg p-4 mb-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
              {v.key_findings.length} différence{v.key_findings.length > 1 ? "s" : ""} clé{v.key_findings.length > 1 ? "s" : ""} détectée{v.key_findings.length > 1 ? "s" : ""}
            </h3>
            <div className="space-y-3">
              {v.key_findings.map((f, idx) => (
                <div key={idx} className="flex gap-3 pt-3 first:pt-0 border-t first:border-0 border-border">
                  <div className="text-lg leading-6">{f.icon}</div>
                  <div className="flex-1 text-sm leading-relaxed">
                    <strong>{f.title}</strong>
                    <div dangerouslySetInnerHTML={{ __html: f.detail }} className="text-foreground/80 mt-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3 leviers */}
        {v.levers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            {v.levers.map((l, idx) => {
              const winner = v.analyses.find((a) => a.id === l.winner_analysis_id);
              return (
                <div key={idx} className="bg-card border border-border rounded-lg p-4">
                  <div className="text-xs font-semibold mb-1">{l.title}</div>
                  <div className="text-sm text-primary font-semibold mb-1">→ {winner?.artisan_nom ?? "Ce devis"}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{l.detail}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION PRIX */}
      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary"></span>Prix
        </h3>
        <div className={`grid gap-3 grid-cols-2 md:grid-cols-${v.analyses.length}`}>
          {v.analyses.map((a) => {
            const d = v.details[a.id]?.prix;
            return (
              <div key={a.id} className={`rounded-lg p-3 border ${a.is_recommended ? "border-primary bg-accent" : "border-transparent bg-background"}`}>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">{rankLabel(a.rank)} · {a.artisan_nom ?? "—"}</div>
                <div className="text-lg font-bold">{fmt(a.total_ht)} € <span className="text-xs text-muted-foreground font-normal">HT</span></div>
                <div className={`text-xs font-medium ${colorVerdictPrix(d?.verdict_marche ?? "Inconnu")}`}>{d?.verdict_marche ?? "—"}</div>
                {d?.acompte_pct !== null && d?.acompte_pct !== undefined && (
                  <div className={`text-[11px] mt-1 ${d.acompte_pct > 35 ? "text-amber-700 font-semibold" : "text-muted-foreground"}`}>
                    Acompte {d.acompte_pct}% {d.acompte_pct > 35 ? "⚠️" : "✓"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION ENTREPRISE */}
      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary"></span>Entreprise
        </h3>
        <div className={`grid gap-3 grid-cols-2 md:grid-cols-${v.analyses.length}`}>
          {v.analyses.map((a) => {
            const e = v.details[a.id]?.entreprise;
            return (
              <div key={a.id} className={`rounded-lg p-3 border ${a.is_recommended ? "border-primary bg-accent" : "border-transparent bg-background"}`}>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">{a.artisan_nom ?? "—"}</div>
                <div className="text-sm font-semibold">{e?.anciennete_ans ?? "?"} ans d'activité</div>
                {e?.google_note !== null && e?.google_note !== undefined ? (
                  <div className="text-sm">{e.google_note}/5 <span className="text-xs text-muted-foreground">({e.google_reviews ?? 0})</span></div>
                ) : (
                  <div className="text-sm italic text-muted-foreground">Info Google non disponible</div>
                )}
                <div className="text-[11px] text-muted-foreground mt-1">{e?.assurance ? "✓ Assurance" : "Assurance non confirmée"}</div>
                <div className={`text-[11px] ${e?.clauses_litigieuses?.length ? "text-destructive font-semibold" : "text-green-700"}`}>
                  {e?.clauses_litigieuses?.length ? `⚠️ ${e.clauses_litigieuses.length} clause litigieuse` : "✓ Contrat propre"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION POINTS CLEFS */}
      {v.key_findings.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 mb-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary"></span>Points clefs (différences expertes)
          </h3>
          <div className="space-y-2">
            {v.key_findings.map((f, idx) => (
              <div key={idx} className="flex gap-3 p-3 bg-background rounded-lg">
                <div className="text-xl leading-6">{f.icon}</div>
                <div className="flex-1 text-sm leading-relaxed">
                  <strong>{f.title}</strong>
                  <div dangerouslySetInnerHTML={{ __html: f.detail }} className="text-foreground/80 mt-1" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION VIGILANCE */}
      {v.vigilance.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 mb-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary"></span>Points de vigilance
          </h3>
          <div className="space-y-2">
            {v.vigilance.map((vg, idx) => (
              <div key={idx} className={`flex gap-3 p-3 rounded-lg ${vg.level === "danger" ? "bg-red-50" : "bg-amber-50"}`}>
                <div className="text-xl leading-6">{vg.icon}</div>
                <div className="flex-1 text-sm leading-relaxed">
                  <strong>{vg.title}</strong>
                  <div dangerouslySetInnerHTML={{ __html: vg.detail }} className="text-foreground/80 mt-1" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DÉTAIL POSTES (accordion) */}
      <details className="bg-card border border-border rounded-xl group">
        <summary className="px-5 py-4 cursor-pointer select-none font-semibold text-sm flex items-center justify-between">
          <span>Détail poste par poste ({v.perimeter.length} postes) — cliquez pour ouvrir</span>
          <span className="text-xs text-muted-foreground group-open:hidden">▼</span>
          <span className="text-xs text-muted-foreground hidden group-open:inline">▲</span>
        </summary>
        <div className="px-5 pb-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-xs text-muted-foreground font-semibold">Poste</th>
                {v.analyses.map((a) => (
                  <th key={a.id} className={`text-center py-2 text-xs font-semibold ${a.is_recommended ? "text-primary" : "text-muted-foreground"}`}>
                    {a.artisan_nom ?? a.id.slice(0, 4)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.perimeter.map((p) => (
                <tr key={p.job_type} className="border-b border-border/50">
                  <td className="py-2 text-muted-foreground">{p.label}</td>
                  {v.analyses.map((a) => {
                    const val = p.presence[a.id];
                    return (
                      <td key={a.id} className={`text-center py-2 ${a.is_recommended ? "bg-accent/50" : ""}`}>
                        {val === null ? <span className="text-destructive text-xs font-semibold">non inclus ⚠️</span> : <span className="text-sm">{fmt(val)} €</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* Disclaimer */}
      <div className="bg-muted rounded-lg p-4 mt-6 text-xs text-muted-foreground leading-relaxed border-l-4 border-muted-foreground/30">
        💡 <strong>Note sur la méthode :</strong> nous comparons ce qui est lisible dans les devis fournis.
        Pour les informations manquantes, nous affichons explicitement <em>"Information non disponible"</em> plutôt que d'inventer une approximation.
        Le verdict est une aide à la décision, pas un ordre de signature — vérifiez toujours les éléments en visite physique avant de signer.
      </div>

      <div className="flex justify-center gap-3 mt-6">
        <Button variant="outline" disabled>
          <FileDown className="h-4 w-4 mr-2" /> Exporter en PDF (bientôt)
        </Button>
        {recommended.artisan_nom && (
          <Button>
            <Mail className="h-4 w-4 mr-2" /> Contacter {recommended.artisan_nom}
          </Button>
        )}
      </div>

      {/* Pour aller plus loin — cocon post-comparateur */}
      <section className="mt-10 border-t border-border pt-8">
        <h2 className="text-lg font-bold mb-4">Pour aller plus loin</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <a href="/observatoire" className="group block p-4 rounded-xl bg-card border border-border hover:border-primary/40 transition-colors">
            <div className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">Voir les prix marché</div>
            <div className="text-xs text-muted-foreground">Fourchettes par métier et chantier</div>
          </a>
          <a href="/guides/devis-travaux" className="group block p-4 rounded-xl bg-card border border-border hover:border-primary/40 transition-colors">
            <div className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">Le guide du devis travaux</div>
            <div className="text-xs text-muted-foreground">Comprendre, négocier, signer</div>
          </a>
          <a href="/nouvelle-analyse" className="group block p-4 rounded-xl bg-card border border-border hover:border-primary/40 transition-colors">
            <div className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">Analyser un autre devis</div>
            <div className="text-xs text-muted-foreground">Vérification gratuite en 30 s</div>
          </a>
          <a href="https://www.gerermonchantier.fr/mon-chantier" className="group block p-4 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <div className="font-semibold text-sm mb-1">Piloter mon chantier</div>
            <div className="text-xs opacity-80">Budget, planning, artisans</div>
          </a>
        </div>
      </section>
    </div>
  );
}
