/**
 * src/components/admin/sections/VisitsFunnelSection.tsx
 *
 * 2026-09-04 (demande Johan) — le funnel « visites → analyses », avec la
 * courbe quotidienne des visiteurs.
 *
 * Les deux chiffres sont mesurés de la même façon, chez nous : GA4 ne compte
 * que les visiteurs ayant accepté les cookies, un taux calculé sur ce
 * dénominateur serait faussement flatteur. Les visites de l'équipe sont
 * exclues à la source (flag `vmd_internal`, posé dès la première visite
 * d'`/admin`).
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calculator, Compass } from "lucide-react";
import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface JourKpi {
  jour: string;
  visiteurs: number;
  pages_vues: number;
  analyses: number;
}

interface OutilKpi {
  cle: string;
  libelle: string;
  path: string | null;
  visiteurs: number | null;
  calculs: number;
  personnes: number;
}

interface ProvenanceKpi {
  provenance: string;
  visiteurs: number;
  pages_vues: number;
  vers_analyse: number;
  taux_pct: number | null;
}

interface VisitsKpis {
  days: number;
  serie: JourKpi[];
  outils?: OutilKpi[];
  provenance?: ProvenanceKpi[];
  totaux: {
    visiteurs: number;
    pages_vues: number;
    analyses: number;
    taux_conversion_pct: number | null;
  };
  collecte_depuis: string | null;
}

const jourCourt = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

export default function VisitsFunnelSection() {
  const [kpis, setKpis] = useState<VisitsKpis | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [jours, setJours] = useState(30);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(`/api/admin/visits-kpis?days=${jours}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!annule) setKpis(json.data ?? json);
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : "erreur");
      }
    })();
    return () => { annule = true; };
  }, [jours]);

  if (erreur) {
    return (
      <section className="mb-10">
        <p className="text-sm text-rose-700">Visites indisponibles : {erreur}</p>
      </section>
    );
  }
  if (!kpis) return null;

  const { totaux, serie } = kpis;
  const aucuneDonnee = totaux.visiteurs === 0;

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Visites et conversion
        </h2>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setJours(d)}
              className={`text-xs px-2 py-1 rounded border ${
                jours === d ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
              }`}
            >
              {d} j
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Visiteurs uniques</CardDescription>
            <CardTitle className="text-3xl">{totaux.visiteurs.toLocaleString("fr-FR")}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {totaux.pages_vues.toLocaleString("fr-FR")} pages vues · équipe exclue
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Analyses lancées</CardDescription>
            <CardTitle className="text-3xl">{totaux.analyses.toLocaleString("fr-FR")}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">sur la même période</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Taux de conversion</CardDescription>
            <CardTitle className="text-3xl">
              {totaux.taux_conversion_pct === null ? "—" : `${totaux.taux_conversion_pct} %`}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {totaux.taux_conversion_pct === null
              ? "en attente des premières visites"
              : "analyses / visiteurs uniques"}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visiteurs par jour</CardTitle>
          <CardDescription>
            {aucuneDonnee
              ? "La collecte démarre au déploiement — aucune visite antérieure n'existe en base."
              : `Depuis le ${kpis.collecte_depuis ?? "?"} · visites de l'équipe exclues à la source`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={serie.map((j) => ({ ...j, label: jourCourt(j.jour) }))}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis yAxisId="g" fontSize={11} />
              <YAxis yAxisId="d" orientation="right" fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Area yAxisId="g" type="monotone" dataKey="visiteurs" name="Visiteurs" stroke="#2563eb" fill="#93c5fd" />
              <Bar yAxisId="d" dataKey="analyses" name="Analyses" fill="#f97316" barSize={14} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Provenance du trafic (2026-09-14, demande Johan) ────────────────
       *
       * Mesuré le 14/09 : 87 % du trafic entre par l'accueil et 3,8 % y
       * cliquent, alors que tout ce qui suit convertit entre 68 et 100 %.
       * Sans la provenance, ce 3,8 % ne se travaille pas — une mauvaise page
       * et un mauvais trafic donnent exactement le même chiffre.
       *
       * ⚠️ Les trois libellés entre parenthèses veulent dire des choses
       * différentes et il ne faut pas les confondre : « (aucun) » n'est PAS
       * de l'accès direct.
       */}
      {kpis.provenance && kpis.provenance.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Compass className="h-4 w-4 text-primary" />
              D'où vient le trafic
            </CardTitle>
            <CardDescription>
              Collecte démarrée le 14/09/2026 — tout ce qui précède est « non mesuré ».
              L'unité est le visiteur-jour : quelqu'un qui revient un autre jour compte
              deux fois, donc les taux ci-dessous sont une borne basse.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-semibold">Provenance</th>
                    <th className="py-2 px-3 font-semibold text-right">Visiteurs</th>
                    <th className="py-2 px-3 font-semibold text-right">Pages vues</th>
                    <th className="py-2 px-3 font-semibold text-right">→ Analyse</th>
                    <th className="py-2 pl-3 font-semibold text-right">Taux</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.provenance.map((p) => (
                    <tr key={p.provenance} className="border-b border-border/60">
                      <td className="py-2.5 pr-3 font-medium">
                        {p.provenance}
                        {p.provenance === "(aucun)" && (
                          <div className="text-xs text-muted-foreground font-normal">
                            direct, applications et navigateurs qui masquent le référent — mélangés
                          </div>
                        )}
                        {p.provenance === "(non mesuré)" && (
                          <div className="text-xs text-muted-foreground font-normal">
                            visites antérieures au 14/09/2026
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {p.visiteurs.toLocaleString("fr-FR")}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                        {p.pages_vues.toLocaleString("fr-FR")}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {p.vers_analyse.toLocaleString("fr-FR")}
                      </td>
                      <td className="py-2.5 pl-3 text-right tabular-nums font-semibold">
                        {p.taux_pct === null ? "—" : `${p.taux_pct.toLocaleString("fr-FR")} %`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Seul l'hôte du site référent est conservé, jamais l'URL complète — elle porte
              souvent la recherche tapée par la personne. Une campagne apparaît sous son
              <code className="mx-1">utm_source</code>, seul paramètre lu dans une query string
              qui n'est par ailleurs jamais enregistrée.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Usage des calculettes (2026-09-07, décision Johan) ──────────────
       *
       * On les garde 30 jours et on tranche sur ce tableau. Deux colonnes, et
       * il faut les deux : « visiteurs » dit si on arrive sur l'outil,
       * « calculs » s'il sert. Une page visitée sans aucun calcul et une page
       * jamais atteinte appellent des décisions opposées.
       *
       * 🔴 2026-09-14 (retour Johan : « j'avais vu 4 et après ça repasse à 3 »)
       * — LA PÉRIODE EST ÉCRITE, PARCE QUE CE TABLEAU LA SUIT.
       * Ces chiffres passent par le MÊME paramètre `days` que le reste de
       * l'écran : cliquer « 7 jours » en haut fait tomber la calculette de 4
       * à 3 visiteurs, simplement parce que la visite du 05/09 sort de la
       * fenêtre. Rien ne le disait — un chiffre de décision qui bouge sans
       * annoncer sur quoi il porte se lit comme une donnée qui se perd.
       *
       * ⚠️ ET L'ÉCHÉANCE ANNONCÉE ÉTAIT FAUSSE. Elle disait le 07/10, soit
       * 30 jours après la mise en service du CODE. Mais la migration
       * `site_events` est restée trois jours en attente : la table n'existe
       * que depuis le 10/09, et tout ce qui a été envoyé avant s'est perdu
       * contre une table absente (cf. CLAUDE.md). La fenêtre court donc du
       * 10/09 — l'échéance est le 10/10.
       */}
      {kpis.outils && kpis.outils.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              Usage des calculettes
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {jours} derniers jours
              </span>
            </CardTitle>
            <CardDescription>
              Les deux colonnes suivent le sélecteur de période ci-dessus — un outil peut
              donc perdre un visiteur en passant de 30 à 7 jours, sans que rien ne se soit
              perdu. Un calcul = un résultat réellement affiché, pas une ouverture de page.
              Les essais de l'équipe sont exclus.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-semibold">Outil</th>
                    <th className="py-2 px-3 font-semibold text-right">Visiteurs</th>
                    <th className="py-2 px-3 font-semibold text-right">Calculs</th>
                    <th className="py-2 pl-3 font-semibold text-right">Personnes</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.outils.map((o) => (
                    <tr key={o.cle} className="border-b border-border/60">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium">{o.libelle}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.path ?? "carte de la page d'accueil"}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {/* `null` = pas de page dédiée : non mesuré, pas zéro. */}
                        {o.visiteurs === null ? (
                          <span className="text-muted-foreground" title="Pas de page dédiée : la carte ouvre une fenêtre, il n'y a pas de visite à compter.">
                            n/a
                          </span>
                        ) : (
                          o.visiteurs.toLocaleString("fr-FR")
                        )}
                      </td>
                      <td
                        className={
                          "py-2.5 px-3 text-right tabular-nums font-semibold " +
                          (o.calculs === 0 ? "text-rose-600" : "")
                        }
                      >
                        {o.calculs.toLocaleString("fr-FR")}
                      </td>
                      <td className="py-2.5 pl-3 text-right tabular-nums">
                        {o.personnes.toLocaleString("fr-FR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Mesuré du côté serveur, sans cookie ni identifiant persistant : aucune donnée
              saisie dans les calculettes n'est enregistrée, seulement le fait qu'un calcul a eu
              lieu.
            </p>
            {/* L'échéance est datée du démarrage RÉEL de la mesure, pas de la
                mise en service du code — trois jours les séparent, la table
                n'ayant été créée que le 10/09. */}
            <p className="text-xs text-muted-foreground mt-2">
              Comptage des calculs actif depuis le <strong>10/09/2026</strong> — décision
              prévue au <strong>10/10/2026</strong>. Un outil visité sans aucun calcul et un
              outil jamais atteint appellent des décisions opposées : il faut lire les deux
              colonnes ensemble.
            </p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
