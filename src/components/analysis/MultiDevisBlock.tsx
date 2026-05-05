/**
 * MultiDevisBlock — Dashboard pour les PDF multi-artisans
 * Affiché quand document_detection.multiple_quotes === true
 * Montre : résumé global + cards par artisan/lot avec verdicts indépendants
 */
import { useState } from "react";
import { Building2, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Package, TrendingUp, TrendingDown, Minus } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DevisSegment {
  lot_type: string;
  entreprise_nom: string;
  siret: string | null;
  total_ht: number | null;
  total_ttc: number | null;
  taux_tva: number | null;
  assurance_decennale: boolean | null;
  lignes: Array<{
    libelle: string;
    categorie: string;
    montant: number | null;
    quantite: number | null;
    unite: string | null;
  }>;
}

/** Analyse indépendante par segment (un artisan = un verdict) */
export interface SegmentAnalysis {
  lot_type:        string;
  entreprise_nom:  string;
  siret:           string | null;
  total_ht:        number | null;
  total_ttc:       number | null;
  market_min:      number;
  market_max:      number;
  market_avg:      number;
  verdict:         "signer" | "a_negocier" | "refuser";
  score_legacy:    "VERT" | "ORANGE" | "ROUGE";
  overprice:       number;
  overprice_pct:   number;
  anomalies_count: number;
  has_market_data: boolean;
  market_groups:   unknown[];
}

/** Métriques globales agrégées */
export interface GlobalMetrics {
  verdict_global:   "signer" | "a_negocier" | "refuser";
  score_legacy:     "VERT" | "ORANGE" | "ROUGE";
  total_devis_ht:   number;
  total_marche_min: number;
  total_marche_max: number;
  total_marche_avg: number;
  overprice_total:  number;
  overprice_pct:    number;
  segments_count:   number;
  segments_rouge:   number;
  segments_orange:  number;
  segments_vert:    number;
}

interface MultiDevisBlockProps {
  devisList: DevisSegment[];
  /** Analyses indépendantes par artisan (disponibles après analyse marché) */
  segmentAnalyses?: SegmentAnalysis[];
  /** Métriques globales agrégées */
  globalMetrics?: GlobalMetrics;
  /** Nom du client commun (extrait de extracted_data) */
  clientVille?: string | null;
  /** Date du premier devis */
  dateDevis?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtHT = (n: number | null) =>
  n != null ? n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " € HT" : "—";

const fmtTTC = (n: number | null) =>
  n != null ? n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " € TTC" : "—";

function formatSiret(siret: string | null): string | null {
  if (!siret) return null;
  const clean = siret.replace(/\s/g, "");
  if (clean.length === 14) return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6, 9)} ${clean.slice(9)}`;
  if (clean.length === 9) return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  return siret;
}

// Couleurs par index pour les cartes artisan
const CARD_COLORS = [
  "border-blue-200 bg-blue-50",
  "border-emerald-200 bg-emerald-50",
  "border-violet-200 bg-violet-50",
  "border-amber-200 bg-amber-50",
  "border-rose-200 bg-rose-50",
  "border-cyan-200 bg-cyan-50",
  "border-orange-200 bg-orange-50",
  "border-teal-200 bg-teal-50",
];

const DOT_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
];

// ── Helpers verdict ──────────────────────────────────────────────────────────

type VerdictDecision = "signer" | "a_negocier" | "refuser";

const VERDICT_CONFIG: Record<VerdictDecision, {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}> = {
  signer: {
    label: "✅ Conforme",
    bgClass: "bg-green-100",
    textClass: "text-green-800",
    borderClass: "border-green-200",
  },
  a_negocier: {
    label: "⚠️ À négocier",
    bgClass: "bg-amber-100",
    textClass: "text-amber-800",
    borderClass: "border-amber-200",
  },
  refuser: {
    label: "🛑 Refuser",
    bgClass: "bg-red-100",
    textClass: "text-red-800",
    borderClass: "border-red-200",
  },
};

function VerdictBadge({ verdict }: { verdict: VerdictDecision }) {
  const cfg = VERDICT_CONFIG[verdict];
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass} whitespace-nowrap`}>
      {cfg.label}
    </span>
  );
}

function DeltaBadge({ overprice, overprice_pct }: { overprice: number; overprice_pct: number }) {
  if (overprice === 0) return null;
  const pct = Math.round(Math.abs(overprice_pct) * 100);
  const isOver = overprice > 0;
  const amt = Math.abs(overprice);
  const amtFmt = amt >= 1000
    ? `${Math.round(amt / 100) / 10} k€`
    : `${Math.round(amt)} €`;

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${
      isOver
        ? "bg-red-50 text-red-700 border border-red-200"
        : "bg-green-50 text-green-700 border border-green-200"
    }`}>
      {isOver
        ? <TrendingUp className="h-2.5 w-2.5" />
        : <TrendingDown className="h-2.5 w-2.5" />}
      {isOver ? "+" : "-"}{amtFmt} ({pct}%)
    </span>
  );
}

// ── Card artisan ─────────────────────────────────────────────────────────────

function ArtisanCard({
  devis,
  index,
  analysis,
}: {
  devis: DevisSegment;
  index: number;
  analysis?: SegmentAnalysis;
}) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = CARD_COLORS[index % CARD_COLORS.length];
  const dotClass = DOT_COLORS[index % DOT_COLORS.length];
  const siretFmt = formatSiret(devis.siret);
  const hasLignes = devis.lignes.length > 0;

  return (
    <div className={`border-2 rounded-xl overflow-hidden ${colorClass}`}>
      {/* Header cliquable */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-black/3 transition-colors"
      >
        {/* Bullet couleur */}
        <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1.5 ${dotClass}`} />

        {/* Infos principales */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <p className="font-bold text-foreground text-sm leading-tight">
                {devis.lot_type}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {devis.entreprise_nom}
              </p>
              {siretFmt && (
                <p className="text-xs text-muted-foreground/70 font-mono mt-0.5">
                  {devis.siret && devis.siret.length === 14 ? "SIRET" : "RCS"}&nbsp;: {siretFmt}
                </p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-foreground text-sm">{fmtHT(devis.total_ht)}</p>
              <p className="text-xs text-muted-foreground">{fmtTTC(devis.total_ttc)}</p>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {/* Verdict par artisan — source de vérité unique depuis SegmentAnalysis */}
            {analysis && (
              <VerdictBadge verdict={analysis.verdict} />
            )}
            {analysis && analysis.has_market_data && (
              <DeltaBadge
                overprice={analysis.overprice}
                overprice_pct={analysis.overprice_pct}
              />
            )}
            {!analysis && (
              <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded-full text-gray-500 flex items-center gap-0.5">
                <Minus className="h-2.5 w-2.5" />
                En attente d'analyse
              </span>
            )}
            {devis.lignes.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-white/60 border border-border/30 rounded-full text-muted-foreground">
                {devis.lignes.length} ligne{devis.lignes.length > 1 ? "s" : ""}
              </span>
            )}
            {analysis && analysis.anomalies_count > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-red-50 border border-red-200 rounded-full text-red-700">
                {analysis.anomalies_count} anomalie{analysis.anomalies_count > 1 ? "s" : ""}
              </span>
            )}
            {devis.assurance_decennale === true && (
              <span className="text-[10px] px-1.5 py-0.5 bg-green-100 border border-green-200 rounded-full text-green-700 flex items-center gap-0.5">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Décennale
              </span>
            )}
            {devis.assurance_decennale === false && (
              <span className="text-[10px] px-1.5 py-0.5 bg-red-100 border border-red-200 rounded-full text-red-700 flex items-center gap-0.5">
                <AlertCircle className="h-2.5 w-2.5" />
                Pas de décennale
              </span>
            )}
            {devis.taux_tva != null && (
              <span className="text-[10px] px-1.5 py-0.5 bg-white/60 border border-border/30 rounded-full text-muted-foreground">
                TVA&nbsp;{devis.taux_tva}&nbsp;%
              </span>
            )}
          </div>

          {/* Fourchette marché si disponible */}
          {analysis && analysis.has_market_data && analysis.market_avg > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
              Marché estimé&nbsp;:{" "}
              <span className="font-medium text-foreground">
                {analysis.market_min.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}&nbsp;€
                &nbsp;–&nbsp;
                {analysis.market_max.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}&nbsp;€ HT
              </span>
            </p>
          )}
        </div>

        {/* Chevron expand */}
        {hasLignes && (
          <div className="flex-shrink-0 mt-1">
            {expanded
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        )}
      </button>

      {/* Lignes de travaux — expand */}
      {expanded && hasLignes && (
        <div className="border-t border-border/20 bg-white/40 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Détail des postes
          </p>
          <div className="space-y-1.5">
            {devis.lignes.map((ligne, i) => (
              <div key={i} className="flex items-start justify-between gap-2 text-xs">
                <span className="text-foreground flex-1 min-w-0 leading-snug">{ligne.libelle}</span>
                <div className="flex items-center gap-2 flex-shrink-0 text-right">
                  {ligne.quantite != null && ligne.unite && (
                    <span className="text-muted-foreground text-[10px]">
                      {ligne.quantite}&nbsp;{ligne.unite}
                    </span>
                  )}
                  {ligne.montant != null && (
                    <span className="font-medium text-foreground whitespace-nowrap">
                      {ligne.montant.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}&nbsp;€
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MultiDevisBlock({
  devisList,
  segmentAnalyses,
  globalMetrics,
  clientVille,
  dateDevis,
}: MultiDevisBlockProps) {
  // Déduplique les entreprises (certains artisans ont 2 lots)
  const uniqueEntreprises = [...new Set(devisList.map(d => d.entreprise_nom))];

  // Totaux : depuis globalMetrics si dispo, sinon depuis devisList brut
  const totalHT  = globalMetrics?.total_devis_ht
    ?? devisList.reduce((s, d) => s + (d.total_ht ?? 0), 0);
  const totalTTC = devisList.reduce((s, d) => s + (d.total_ttc ?? 0), 0);

  // Alertes assurance
  const sansDecennale = devisList.filter(d => d.assurance_decennale === false);

  // Verdict global depuis globalMetrics (source unique de vérité)
  const verdictGlobal = globalMetrics?.verdict_global;
  const hasAnalysis   = segmentAnalyses && segmentAnalyses.length > 0;

  // Build a map from entreprise_nom → SegmentAnalysis for fast lookup
  const analysisByNom = new Map<string, SegmentAnalysis>();
  if (segmentAnalyses) {
    for (const sa of segmentAnalyses) {
      analysisByNom.set(sa.entreprise_nom, sa);
    }
  }

  return (
    <div className="border-2 border-primary/20 rounded-2xl p-4 sm:p-6 mb-6 bg-card">
      {/* En-tête */}
      <div className="flex items-start gap-3 mb-5">
        <div className="p-2 bg-primary/10 rounded-xl flex-shrink-0">
          <Package className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-foreground text-lg leading-tight">
              Devis multi-artisans
            </h2>
            {verdictGlobal && (
              <VerdictBadge verdict={verdictGlobal} />
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {devisList.length}&nbsp;lot{devisList.length > 1 ? "s" : ""} détecté{devisList.length > 1 ? "s" : ""}
            {uniqueEntreprises.length !== devisList.length
              ? ` — ${uniqueEntreprises.length}&nbsp;entreprise${uniqueEntreprises.length > 1 ? "s" : ""}`
              : ""}
            {clientVille ? ` · ${clientVille}` : ""}
          </p>
        </div>
      </div>

      {/* KPI global */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <div className="p-3 bg-muted/40 rounded-xl text-center">
          <p className="text-2xl font-extrabold text-foreground leading-none">
            {totalHT > 0 ? totalHT.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Total HT (€)</p>
        </div>
        <div className="p-3 bg-muted/40 rounded-xl text-center">
          <p className="text-2xl font-extrabold text-foreground leading-none">
            {totalTTC > 0 ? totalTTC.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : "—"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Total TTC (€)</p>
        </div>
        <div className="p-3 bg-muted/40 rounded-xl text-center col-span-2 sm:col-span-1">
          <p className="text-2xl font-extrabold text-foreground leading-none">
            {uniqueEntreprises.length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Artisan{uniqueEntreprises.length > 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Récapitulatif verdicts si analyse disponible */}
      {hasAnalysis && globalMetrics && (globalMetrics.segments_rouge > 0 || globalMetrics.segments_orange > 0) && (
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          {globalMetrics.segments_vert > 0 && (
            <div className="p-2 rounded-lg bg-green-50 border border-green-200">
              <p className="text-lg font-bold text-green-700">{globalMetrics.segments_vert}</p>
              <p className="text-[10px] text-green-600">Conforme{globalMetrics.segments_vert > 1 ? "s" : ""}</p>
            </div>
          )}
          {globalMetrics.segments_orange > 0 && (
            <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-lg font-bold text-amber-700">{globalMetrics.segments_orange}</p>
              <p className="text-[10px] text-amber-600">À négocier</p>
            </div>
          )}
          {globalMetrics.segments_rouge > 0 && (
            <div className="p-2 rounded-lg bg-red-50 border border-red-200">
              <p className="text-lg font-bold text-red-700">{globalMetrics.segments_rouge}</p>
              <p className="text-[10px] text-red-600">À refuser</p>
            </div>
          )}
        </div>
      )}

      {/* Alerte assurance décennale manquante */}
      {sansDecennale.length > 0 && (
        <div className="mb-4 flex items-start gap-2 px-3 py-3 rounded-xl bg-amber-50 border border-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-snug">
            <span className="font-semibold">Assurance décennale non mentionnée</span> pour&nbsp;:&nbsp;
            {sansDecennale.map(d => d.entreprise_nom).join(", ")}.
            Exigez l'attestation avant de signer.
          </p>
        </div>
      )}

      {/* Note pédagogique */}
      <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200">
        <Building2 className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 leading-snug">
          Ce PDF regroupe plusieurs devis d'entreprises différentes.
          Chaque artisan est analysé <strong>indépendamment</strong> — le verdict de l'un n'influence pas les autres.
          Cliquez sur chaque artisan pour voir le détail de son lot.
        </p>
      </div>

      {/* Liste des artisans */}
      <div className="space-y-3">
        {devisList.map((devis, i) => (
          <ArtisanCard
            key={i}
            devis={devis}
            index={i}
            analysis={analysisByNom.get(devis.entreprise_nom)}
          />
        ))}
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-muted-foreground/60 mt-4 italic text-center">
        Données extraites automatiquement depuis le PDF · Vérifiez les montants sur les documents originaux
      </p>
    </div>
  );
}

export default MultiDevisBlock;
