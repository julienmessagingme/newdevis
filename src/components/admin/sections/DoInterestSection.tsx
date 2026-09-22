/**
 * src/components/admin/sections/DoInterestSection.tsx
 *
 * 2026-08-27/29 — suivi des TESTS D'INTÉRÊT (dommages-ouvrage, financement).
 * Le chiffre qui décide est le TAUX DE RÉPONSE — réponses rapportées aux
 * affichages RÉELLEMENT journalisés — sur la période où la question est posée
 * dans sa forme actuelle (règle Johan : aucun intérêt au terme = piste
 * abandonnée).
 *
 * 🔴 2026-09-22 — DEUX CORRECTIFS DE LECTURE, MÊME FAMILLE.
 *
 * 1. Cet écran affichait `eligibles` sous le libellé « Affichages ». C'est le
 *    compteur RECONSTITUÉ (combien de pages auraient dû montrer la question),
 *    pas le compteur RÉEL, journalisé depuis le 13/09. Les deux divergent dès
 *    qu'un utilisateur n'ouvre pas son analyse ou ne descend pas jusqu'au bloc.
 *    Un compteur qui compte autre chose que ce que son libellé annonce est la
 *    faute la plus fréquente de ce projet.
 * 2. La PÉRIODE n'était écrite nulle part. Un chiffre de décision qui bouge
 *    sans annoncer son cadre se lit comme une donnée qui s'efface — c'est
 *    exactement ce qui est arrivé au tableau des calculettes le 14/09.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export interface InterestTestKpi {
  topic: string;
  label: string;
  test_start: string;
  /** Date depuis laquelle la question est posée dans sa forme actuelle. */
  mesure_depuis: string;
  mesure_motif: string;
  echeance: string;
  jours_ecoules: number;
  jours_restants: number;
  clics: number;
  clics_hors_periode: number;
  reponses: { interesse: number; deja_equipe: number; non: number };
  eligibles: number;
  affichages: number;
  affichages_hors_periode: number;
  utilisateurs_exposes: number;
  taux_clic: number | null;
  taux_reponse: number | null;
  part_interesses: number | null;
  montant_chantiers_cumule: number;
  derniers_clics: Array<{ analysis_id: string; montant_ht: number | null; created_at: string }>;
}

/** Réponse de /api/admin/do-interest-kpis */
export interface DoInterestKpis {
  tests: InterestTestKpi[];
}

const SEUIL_DECISION_PCT = 15;

/**
 * ⚠️ Le verdict se rend sur le TAUX DE RÉPONSE (affichages réels), jamais sur
 * `taux_clic` (affichages reconstitués) — et **jamais tant qu'on n'a pas de
 * dénominateur**. « 0 % » sur 3 affichages n'est pas un résultat.
 */
const AFFICHAGES_MIN_POUR_CONCLURE = 30;

function readVerdict(k: InterestTestKpi): { label: string; cls: string } {
  if (k.affichages === 0) return { label: "En attente des premiers affichages", cls: "text-muted-foreground" };
  if (k.affichages < AFFICHAGES_MIN_POUR_CONCLURE) {
    return {
      label: `Trop peu d'observations pour conclure (${k.affichages} affichage${k.affichages > 1 ? "s" : ""}, il en faut au moins ${AFFICHAGES_MIN_POUR_CONCLURE})`,
      cls: "text-muted-foreground",
    };
  }
  if (k.clics === 0 && k.jours_restants === 0) return { label: "Verdict : aucun intérêt — piste à abandonner", cls: "text-rose-700" };
  if (k.clics === 0) return { label: "Aucune réponse pour l'instant", cls: "text-amber-700" };
  const t = k.taux_reponse ?? 0;
  if (t >= SEUIL_DECISION_PCT) return { label: "Demande réelle — démarcher un partenaire", cls: "text-emerald-700" };
  if (t >= 5) return { label: "Signal faible — à confirmer", cls: "text-amber-700" };
  return { label: "Sous le seuil — piste peu prometteuse", cls: "text-rose-700" };
}

const jour = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

function TestCard({ k }: { k: InterestTestKpi }) {
  const verdict = readVerdict(k);
  const reponduPositif = k.reponses.interesse;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{k.label}</CardTitle>
        <CardDescription>
          Mesuré depuis le <strong>{jour(k.mesure_depuis)}</strong> · jour {k.jours_ecoules} / 90 ·{" "}
          {k.jours_restants > 0 ? `échéance ${jour(k.echeance)}` : "terme atteint"}
          <span className="block mt-1 text-xs">
            Test ouvert le {jour(k.test_start)}. La mesure repart du {jour(k.mesure_depuis)} : {k.mesure_motif}.
            {k.affichages_hors_periode > 0 && (
              <> {k.affichages_hors_periode} affichage{k.affichages_hors_periode > 1 ? "s" : ""} antérieur
                {k.affichages_hors_periode > 1 ? "s" : ""} ne compte{k.affichages_hors_periode > 1 ? "nt" : ""} pas.</>
            )}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-accent/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Taux de réponse</p>
            <p className="text-2xl font-bold text-foreground">
              {k.taux_reponse !== null ? `${k.taux_reponse} %` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">seuil décision : {SEUIL_DECISION_PCT} %</p>
          </div>
          <div className="bg-accent/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Réponses</p>
            <p className="text-2xl font-bold text-foreground">{k.clics}</p>
            <p className="text-xs text-muted-foreground">
              {reponduPositif} intéressé{reponduPositif > 1 ? "s" : ""} · {k.reponses.deja_equipe} déjà équipé
              {k.reponses.deja_equipe > 1 ? "s" : ""} · {k.reponses.non} non
            </p>
          </div>
          <div className="bg-accent/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Affichages réels</p>
            <p className="text-2xl font-bold text-foreground">{k.affichages}</p>
            <p className="text-xs text-muted-foreground">
              {k.eligibles} page{k.eligibles > 1 ? "s" : ""} éligible{k.eligibles > 1 ? "s" : ""} au total
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
            <p className="text-xs font-semibold text-muted-foreground mb-2">Dernières réponses</p>
            <ul className="text-xs space-y-1">
              {k.derniers_clics.map((c) => (
                <li key={c.analysis_id} className="flex justify-between gap-3">
                  <a href={`/analyse/${c.analysis_id}`} className="text-primary hover:underline truncate">
                    {c.analysis_id.slice(0, 8)}
                  </a>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {c.montant_ht ? `${Math.round(Number(c.montant_ht)).toLocaleString("fr-FR")} € HT` : "—"} ·{" "}
                    {jour(c.created_at)}
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
