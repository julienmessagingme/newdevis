/**
 * src/components/admin/sections/DoInterestSection.tsx
 *
 * 2026-08-27/29 — suivi des TESTS D'INTÉRÊT (dommages-ouvrage, financement).
 * Le chiffre qui décide est le TAUX DE CLIC, pas le compteur brut : chaque
 * test affiche clics / affichages réels, avec une lecture explicite du seuil
 * (règle Johan : aucun clic au bout de 3 mois = piste abandonnée).
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export interface InterestTestKpi {
  topic: string;
  label: string;
  test_start: string;
  jours_ecoules: number;
  jours_restants: number;
  clics: number;
  eligibles: number;
  utilisateurs_exposes: number;
  taux_clic: number | null;
  montant_chantiers_cumule: number;
  derniers_clics: Array<{ analysis_id: string; montant_ht: number | null; created_at: string }>;
}

/** Réponse de /api/admin/do-interest-kpis */
export interface DoInterestKpis {
  tests: InterestTestKpi[];
}

function readVerdict(k: InterestTestKpi): { label: string; cls: string } {
  if (k.eligibles === 0) return { label: "En attente des premiers affichages", cls: "text-muted-foreground" };
  if (k.clics === 0 && k.jours_restants === 0) return { label: "Verdict : aucun intérêt — piste à abandonner", cls: "text-rose-700" };
  if (k.clics === 0) return { label: "Aucun clic pour l'instant", cls: "text-amber-700" };
  const t = k.taux_clic ?? 0;
  if (t >= 15) return { label: "Demande réelle — démarcher un partenaire", cls: "text-emerald-700" };
  if (t >= 5) return { label: "Signal faible — à confirmer", cls: "text-amber-700" };
  return { label: "Sous le seuil — piste peu prometteuse", cls: "text-rose-700" };
}

function TestCard({ k }: { k: InterestTestKpi }) {
  const verdict = readVerdict(k);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{k.label}</CardTitle>
        <CardDescription>
          Ouvert le {new Date(k.test_start).toLocaleDateString("fr-FR")} · jour {k.jours_ecoules} / 90
          {k.jours_restants > 0 ? ` · ${k.jours_restants} j restants` : " · test terminé"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-accent/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Taux de clic</p>
            <p className="text-2xl font-bold text-foreground">
              {k.taux_clic !== null ? `${k.taux_clic} %` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">seuil décision : 15 %</p>
          </div>
          <div className="bg-accent/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Clics</p>
            <p className="text-2xl font-bold text-foreground">{k.clics}</p>
            <p className="text-xs text-muted-foreground">utilisateurs intéressés</p>
          </div>
          <div className="bg-accent/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Affichages</p>
            <p className="text-2xl font-bold text-foreground">{k.eligibles}</p>
            <p className="text-xs text-muted-foreground">
              {k.utilisateurs_exposes} utilisateur{k.utilisateurs_exposes > 1 ? "s" : ""} exposé
              {k.utilisateurs_exposes > 1 ? "s" : ""}
            </p>
          </div>
          <div className="bg-accent/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Chantiers concernés</p>
            <p className="text-2xl font-bold text-foreground">
              {k.montant_chantiers_cumule.toLocaleString("fr-FR")} €
            </p>
            <p className="text-xs text-muted-foreground">assiette de la commission</p>
          </div>
        </div>

        <p className={`mt-4 text-sm font-medium ${verdict.cls}`}>{verdict.label}</p>

        {k.derniers_clics.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Derniers intérêts</p>
            <ul className="text-xs space-y-1">
              {k.derniers_clics.map((c) => (
                <li key={c.analysis_id} className="flex justify-between gap-3">
                  <a href={`/analyse/${c.analysis_id}`} className="text-primary hover:underline truncate">
                    {c.analysis_id.slice(0, 8)}
                  </a>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {c.montant_ht ? `${Math.round(Number(c.montant_ht)).toLocaleString("fr-FR")} € HT` : "—"} ·{" "}
                    {new Date(c.created_at).toLocaleDateString("fr-FR")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DoInterestSection({ kpis, loading }: { kpis: DoInterestKpis | null; loading?: boolean }) {
  if (loading) {
    return (
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Tests d'intérêt (3 mois)
        </h2>
        <Card><CardContent className="py-6 text-sm text-muted-foreground">Chargement…</CardContent></Card>
      </section>
    );
  }
  if (!kpis?.tests?.length) return null;

  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        Tests d'intérêt (3 mois)
      </h2>
      <div className="grid gap-6">
        {kpis.tests.map((t) => <TestCard key={t.topic} k={t} />)}
      </div>
    </section>
  );
}
