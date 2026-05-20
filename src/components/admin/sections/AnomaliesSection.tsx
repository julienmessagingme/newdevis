/**
 * AnomaliesSection — admin
 *
 * V3.4.20+ (2026-05-20) — Compteurs des "anomalies bloquantes" détectées
 * par le pipeline d'analyse, pour surveiller en prod les bugs structurels
 * (faux ROUGE radiée, courtiers travaux mal traités, faux positifs marché).
 *
 * Source : /api/admin/anomalies?days=30
 *
 * Conçu après le bug Renovation Man (V3.4.20) qu'on n'aurait pas détecté
 * sans le feedback Julien. L'idée : si un nouveau pattern de bug arrive en
 * prod, il doit apparaître ici dans les 24h via les feedback tags + le
 * pic d'une catégorie d'anomalie.
 */

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle,
  Globe2,
  ClipboardList,
  HelpCircle,
  Loader2,
  TrendingDown,
  XOctagon,
  Tag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AnomaliesResponse {
  period: { days: number; since: string; until: string };
  total_analyses: number;
  anomalies: {
    foreign_quote:         { count: number; pct: number };
    estimation_courtier:   { count: number; pct: number };
    lookup_ambiguous:      { count: number; pct: number };
    comparison_indicative: { count: number; pct: number };
    radiee_confirmed:      { count: number; pct: number };
    hard_block_refuser:    { count: number; pct: number };
  };
  recent_negative_feedback_tags: Record<string, number>;
}

const TAG_LABELS: Record<string, string> = {
  mauvaise_entreprise:    "Mauvaise entreprise affichée",
  faux_radiee:            "Entreprise dite radiée à tort",
  siret_non_extrait:      "SIRET pas lu sur le PDF",
  prix_marche_incorrect:  "Prix marché incohérent",
  verdict_incoherent:     "Verdict ne reflète pas la réalité",
  mauvais_type_doc:       "Pas un devis classique",
  autre:                  "Autre",
};

// Cartes ordonnées par "criticité de surveillance" — les bugs structurels en haut
const CARDS: Array<{
  key: keyof AnomaliesResponse["anomalies"];
  icon: typeof Globe2;
  label: string;
  desc: string;
  color: string;
  bgColor: string;
}> = [
  {
    key: "lookup_ambiguous",
    icon: HelpCircle,
    label: "Identifications ambiguës (V3.4.19)",
    desc: "Fallback nom avec homonymes — V3.4.19 évite le faux ROUGE",
    color: "text-amber-700",
    bgColor: "bg-amber-50 border-amber-200",
  },
  {
    key: "estimation_courtier",
    icon: ClipboardList,
    label: "Estimations courtier (V3.4.20)",
    desc: "Renovation Man, Ootravaux, Hellio, etc.",
    color: "text-sky-700",
    bgColor: "bg-sky-50 border-sky-200",
  },
  {
    key: "foreign_quote",
    icon: Globe2,
    label: "Devis étrangers (V3.4.14)",
    desc: "Belgique, Luxembourg, Suisse, Allemagne",
    color: "text-indigo-700",
    bgColor: "bg-indigo-50 border-indigo-200",
  },
  {
    key: "comparison_indicative",
    icon: TrendingDown,
    label: "Comparaison indicative",
    desc: "Catalogue marché sous-couvrant (ANC, MOE, prestations spéciales)",
    color: "text-purple-700",
    bgColor: "bg-purple-50 border-purple-200",
  },
  {
    key: "radiee_confirmed",
    icon: XOctagon,
    label: "Radiations confirmées",
    desc: "Vrais cas via SIRET direct (≠ faux positifs V3.4.19)",
    color: "text-red-700",
    bgColor: "bg-red-50 border-red-200",
  },
  {
    key: "hard_block_refuser",
    icon: AlertTriangle,
    label: "Verdicts REFUSER (hard block)",
    desc: "Toutes causes confondues — à surveiller si pic anormal",
    color: "text-slate-700",
    bgColor: "bg-slate-50 border-slate-200",
  },
];

export default function AnomaliesSection() {
  const [data,    setData]    = useState<AnomaliesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [days,    setDays]    = useState(30);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await fetch(`/api/admin/anomalies?days=${days}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Anomalies bloquantes détectées
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Surveillance des bugs structurels et faux positifs en prod — pour
            détecter rapidement un nouveau pattern qui dérape.
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value, 10))}
          className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background"
        >
          <option value={7}>7 derniers jours</option>
          <option value={30}>30 derniers jours</option>
          <option value={90}>90 derniers jours</option>
          <option value={365}>1 an</option>
        </select>
      </div>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {error && !loading && (
        <Card>
          <CardContent className="py-6 text-sm text-red-600">
            Erreur : {error}
          </CardContent>
        </Card>
      )}

      {data && !loading && (
        <>
          <div className="text-xs text-muted-foreground mb-3">
            <strong className="text-foreground">{data.total_analyses}</strong> analyses
            sur la période — les pourcentages sont rapportés à ce total.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {CARDS.map(({ key, icon: Icon, label, desc, color, bgColor }) => {
              const stat = data.anomalies[key];
              return (
                <div
                  key={key}
                  className={`rounded-xl border p-4 ${bgColor}`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${color}`} aria-hidden />
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${color}`}>{label}</p>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{desc}</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">
                        {stat.count}
                        <span className="text-sm font-normal text-slate-500 ml-2">
                          ({stat.pct}%)
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tags feedback négatif — signal externe utilisateur */}
          {Object.keys(data.recent_negative_feedback_tags).length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="h-4 w-4 text-amber-700" aria-hidden />
                <p className="text-sm font-semibold text-amber-900">
                  Causes signalées par les utilisateurs (feedback négatif)
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.recent_negative_feedback_tags)
                  .sort((a, b) => b[1] - a[1])
                  .map(([tag, count]) => (
                    <div
                      key={tag}
                      className="inline-flex items-center gap-1.5 bg-white border border-amber-200 rounded-full px-3 py-1.5 text-xs"
                    >
                      <span className="text-slate-700">
                        {TAG_LABELS[tag] ?? tag}
                      </span>
                      <span className="font-bold text-amber-900 bg-amber-100 rounded-full px-2 py-0.5">
                        {count}
                      </span>
                    </div>
                  ))}
              </div>
              <p className="text-[11px] text-amber-800/80 mt-3 leading-relaxed">
                Croiser ces tags avec les pics d'anomalies ci-dessus pour identifier
                rapidement les bugs structurels. Ex : pic "Mauvaise entreprise affichée"
                + pic "Identifications ambiguës" → un nouveau type de doc / nom commercial
                fréquent qu'on ne couvre pas encore.
              </p>
            </div>
          )}

          {Object.keys(data.recent_negative_feedback_tags).length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 text-xs text-slate-600">
              Aucun feedback négatif tagué sur la période — soit aucun bug structurel
              détecté côté user, soit les utilisateurs ne remontent pas leurs problèmes
              (auquel cas, vérifier l'incitation à donner du feedback dans la modal).
            </div>
          )}
        </>
      )}
    </section>
  );
}
