import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminHeader from "@/components/admin/sections/AdminHeader";
import { AdminLoading, AdminAccessDenied } from "@/components/admin/sections/AdminGuards";
import { CheckCircle2, AlertTriangle, X, Clock, FileText, ChevronRight, RefreshCw } from "lucide-react";

interface ReviewListItem {
  id: string;
  file_name: string;
  created_at: string;
  user_email: string | null;
  verdict_global: string | null;
  verdict_decisionnel: string | null;
  phrase_intro: string | null;
  surcout_min: number | null;
  surcout_max: number | null;
  nb_anomalies: number;
  is_foreign: boolean | null;
  is_incomplete: boolean | null;
  is_hors_scope: boolean | null;
  is_courtier: boolean | null;
}

interface ReviewDetail {
  analysis: {
    id: string;
    file_name: string;
    status: string;
    created_at: string;
    user_id: string;
    review_status: string;
    /** 2026-08-27 — avis de l'agent relecteur IA (ai-review-agent). */
    ai_review_opinion?: {
      accord_avec_ia?: string;
      verdict_recommande?: string;
      action_recommandee?: string;
      confiance?: number;
      resume?: string;
      points_verifies?: Array<{ poste?: string; prix_devis?: string; avis?: string; detail?: string; source_web?: string | null }>;
      drapeaux?: string[];
      notes_expert_proposees?: string;
      /** 2026-08-29 — texte redige POUR LE CLIENT (sans jargon interne). */
      message_client_propose?: string;
      error?: string;
    } | null;
    ai_reviewed_at?: string | null;
  };
  conclusion: any;
  raw: any;
  review_triggers: string[];
  previous_corrections: Array<{
    id: string;
    action: string;
    reviewed_at: string;
    reviewed_by_email: string;
    expert_notes: string | null;
  }>;
}

const VERDICT_GLOBAL_OPTIONS = [
  { value: "dans_la_norme", label: "🟢 Dans la norme" },
  { value: "eleve_justifie", label: "🟡 Élevé mais justifié" },
  { value: "a_negocier", label: "🟠 À négocier" },
  { value: "a_risque", label: "🔴 À risque" },
];

const VERDICT_DECISIONNEL_OPTIONS = [
  { value: "signer", label: "Signer" },
  { value: "signer_avec_negociation", label: "Signer avec négociation" },
  { value: "ne_pas_signer", label: "Ne pas signer" },
];

function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, { label: string; cls: string }> = {
    dans_la_norme: { label: "Dans la norme", cls: "bg-green-100 text-green-800 border-green-200" },
    eleve_justifie: { label: "Élevé justifié", cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    a_negocier: { label: "À négocier", cls: "bg-orange-100 text-orange-800 border-orange-200" },
    a_risque: { label: "À risque", cls: "bg-red-100 text-red-800 border-red-200" },
    signer: { label: "Signer", cls: "bg-green-100 text-green-800 border-green-200" },
    refuser: { label: "Refuser", cls: "bg-red-100 text-red-800 border-red-200" },
  };
  const e = map[verdict] ?? { label: verdict, cls: "bg-gray-100 text-gray-700 border-gray-200" };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${e.cls}`}>{e.label}</span>
  );
}

function ReviewCard({
  item,
  selected,
  onClick,
}: {
  item: ReviewListItem;
  selected: boolean;
  onClick: () => void;
}) {
  const bypasses: string[] = [];
  if (item.is_foreign) bypasses.push("🌍 étranger");
  if (item.is_incomplete) bypasses.push("⚠️ incomplet");
  if (item.is_hors_scope) bypasses.push("🚫 hors-scope");
  if (item.is_courtier) bypasses.push("🤝 courtier");

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 border rounded-lg transition hover:bg-muted/50 ${
        selected ? "bg-primary/5 border-primary" : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-start gap-2 mb-2">
        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.file_name}</p>
          <p className="text-xs text-muted-foreground truncate">{item.user_email ?? "—"}</p>
        </div>
        {selected && <ChevronRight className="h-4 w-4 text-primary flex-shrink-0" />}
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <VerdictBadge verdict={item.verdict_global} />
        {item.surcout_max != null && item.surcout_max > 0 && (
          <span className="text-xs text-red-700 font-medium">
            +{Math.round(item.surcout_max).toLocaleString("fr-FR")} €
          </span>
        )}
        {item.nb_anomalies > 0 && (
          <span className="text-xs text-orange-700">
            {item.nb_anomalies} anomalie{item.nb_anomalies > 1 ? "s" : ""}
          </span>
        )}
      </div>
      {bypasses.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-2">
          {bypasses.map((b) => (
            <span key={b} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
              {b}
            </span>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        {new Date(item.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
      </p>
    </button>
  );
}

function ReviewDetail({
  detail,
  onActionComplete,
}: {
  detail: ReviewDetail;
  onActionComplete: () => void;
}) {
  const [mode, setMode] = useState<"view" | "correct">("view");
  const [notes, setNotes] = useState("");
  const [expertMessage, setExpertMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Champs corrigeables
  const [verdictGlobal, setVerdictGlobal] = useState<string>(detail.conclusion?.verdict_global ?? "");
  const [verdictDecisionnel, setVerdictDecisionnel] = useState<string>(
    detail.conclusion?.verdict_decisionnel ?? "",
  );
  const [surcoutMin, setSurcoutMin] = useState<string>(
    String(detail.conclusion?.surcout_global?.min ?? ""),
  );
  const [surcoutMax, setSurcoutMax] = useState<string>(
    String(detail.conclusion?.surcout_global?.max ?? ""),
  );

  const anomalies: any[] = Array.isArray(detail.conclusion?.anomalies)
    ? detail.conclusion.anomalies
    : [];

  // 2026-08-29 — l'écran ne permettait de corriger QUE le verdict et le
  // surcoût : les anomalies invalidées par l'expert restaient affichées à
  // l'utilisateur (vu sur 5 analyses déjà corrigées, dont deux en verdict vert
  // avec des anomalies rouges listées dessous). L'expert décoche désormais
  // celles qu'il invalide.
  const [keptAnomalies, setKeptAnomalies] = useState<boolean[]>(() => anomalies.map(() => true));
  const toggleAnomaly = (i: number) =>
    setKeptAnomalies((prev) => prev.map((v, j) => (j === i ? !v : v)));

  async function callDecide(action: "validated" | "corrected" | "rejected") {
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Session expirée");
        return;
      }

      const body: any = {
        action,
        expert_notes: notes || null,
        review_triggers: detail.review_triggers,
      };

      if (action === "corrected") {
        if (verdictGlobal) body.corrected_verdict_global = verdictGlobal;
        if (verdictDecisionnel) body.corrected_verdict_decisionnel = verdictDecisionnel;
        const sMin = parseFloat(surcoutMin);
        const sMax = parseFloat(surcoutMax);
        if (Number.isFinite(sMin)) body.corrected_surcout_min = sMin;
        if (Number.isFinite(sMax)) body.corrected_surcout_max = sMax;
        // N'envoyer la liste que si l'expert a réellement décoché quelque
        // chose : sinon on laisse le serveur appliquer sa propre cohérence.
        if (expertMessage.trim()) body.expert_message = expertMessage.trim();
        if (keptAnomalies.some((k) => !k)) {
          body.corrected_anomalies = anomalies.filter((_, i) => keptAnomalies[i]);
        }
      }

      const res = await fetch(`/api/admin/reviews/${detail.analysis.id}/decide`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erreur inconnue" }));
        setError(err.error || "Erreur API");
        return;
      }
      onActionComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  }

  const c = detail.conclusion;
  if (!c) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Conclusion IA illisible pour cette analyse.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-1">{detail.analysis.file_name}</h2>
        <p className="text-sm text-muted-foreground">
          Créée le{" "}
          {new Date(detail.analysis.created_at).toLocaleString("fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </p>
      </div>

      {/* Triggers Piste C */}
      {detail.review_triggers.length > 0 && (
        <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded">
          <p className="text-xs font-semibold text-blue-900 mb-1">
            ⚡ Déclencheurs Piste C
          </p>
          <ul className="text-xs text-blue-800 space-y-0.5">
            {detail.review_triggers.map((t, i) => (
              <li key={i}>• {t}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Lecture IA */}
      <div className="mb-6 space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Lecture IA actuelle
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Verdict global</p>
            <VerdictBadge verdict={c.verdict_global} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Décisionnel</p>
            <p className="text-sm font-medium">{c.verdict_decisionnel ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Surcout estimé</p>
            <p className="text-sm font-medium">
              {c.surcout_global
                ? `${Math.round(c.surcout_global.min ?? 0).toLocaleString("fr-FR")} – ${Math.round(c.surcout_global.max ?? 0).toLocaleString("fr-FR")} €`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Anomalies</p>
            <p className="text-sm font-medium">{anomalies.length}</p>
          </div>
        </div>

        {c.phrase_intro && (
          <div className="p-3 bg-gray-50 rounded text-sm border">
            <p className="text-xs text-muted-foreground mb-1">Phrase d'intro</p>
            <p>{c.phrase_intro}</p>
          </div>
        )}

        {anomalies.length > 0 && (
          <details className="border rounded">
            <summary className="px-3 py-2 text-sm font-medium cursor-pointer bg-gray-50">
              Détail des {anomalies.length} anomalies
            </summary>
            <div className="px-3 py-2 space-y-2 text-xs">
              {mode === "correct" && (
                <p className="text-[11px] text-muted-foreground">
                  Décochez les anomalies que vous invalidez — elles disparaîtront de la page
                  vue par l'utilisateur.
                </p>
              )}
              {anomalies.map((a, i) => (
                <div
                  key={i}
                  className={`border-l-2 pl-2 ${
                    keptAnomalies[i] ? "border-red-300" : "border-gray-200 opacity-50"
                  }`}
                >
                  <p className="font-medium">
                    {mode === "correct" && (
                      <input
                        type="checkbox"
                        checked={keptAnomalies[i] ?? true}
                        onChange={() => toggleAnomaly(i)}
                        className="mr-2 align-middle"
                        aria-label={`Conserver l'anomalie ${a.poste ?? i + 1}`}
                      />
                    )}
                    {a.poste ?? "—"}
                  </p>
                  <p className="text-muted-foreground">
                    Devis: {a.prix_unitaire_devis ?? "—"} {a.unite ?? ""} · Marché:{" "}
                    {a.fourchette_min ?? "—"}-{a.fourchette_max ?? "—"} · Surcout: +
                    {Math.round(a.surcout_estime ?? 0).toLocaleString("fr-FR")} €
                  </p>
                  {a.explication && (
                    <p className="text-muted-foreground italic mt-1">{a.explication}</p>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Corrections antérieures */}
      {detail.previous_corrections.length > 0 && (
        <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded">
          <p className="text-xs font-semibold text-amber-900 mb-1">
            Corrections antérieures sur cette analyse ({detail.previous_corrections.length})
          </p>
          <ul className="text-xs text-amber-800 space-y-0.5">
            {detail.previous_corrections.map((p) => (
              <li key={p.id}>
                {p.action} par {p.reviewed_by_email} le{" "}
                {new Date(p.reviewed_at).toLocaleString("fr-FR", { dateStyle: "short" })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Formulaire correction (si mode=correct) */}
      {mode === "correct" && (
        <div className="mb-6 p-4 border-2 border-orange-300 rounded bg-orange-50/50 space-y-3">
          <h4 className="text-sm font-semibold">Corrections de l'expert</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Verdict global</label>
              <select
                value={verdictGlobal}
                onChange={(e) => setVerdictGlobal(e.target.value)}
                className="w-full text-sm border rounded px-2 py-1"
              >
                <option value="">— (inchangé)</option>
                {VERDICT_GLOBAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Décisionnel</label>
              <select
                value={verdictDecisionnel}
                onChange={(e) => setVerdictDecisionnel(e.target.value)}
                className="w-full text-sm border rounded px-2 py-1"
              >
                <option value="">— (inchangé)</option>
                {VERDICT_DECISIONNEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Surcout min (€)</label>
              <input
                type="number"
                value={surcoutMin}
                onChange={(e) => setSurcoutMin(e.target.value)}
                className="w-full text-sm border rounded px-2 py-1"
                inputMode="decimal"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Surcout max (€)</label>
              <input
                type="number"
                value={surcoutMax}
                onChange={(e) => setSurcoutMax(e.target.value)}
                className="w-full text-sm border rounded px-2 py-1"
                inputMode="decimal"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Laisse "—" pour garder la valeur actuelle. Les anomalies se décochent dans le bloc
            « Détail des anomalies » ci-dessus.
          </p>

          {/* 2026-08-29 — une correction RETIRE ce qui était faux ; sans ce
              message elle n'ajoute rien et la page annonce un verdict sans
              argument. Affiché à l'utilisateur, contrairement aux notes. */}
          <div>
            <label className="text-xs font-medium mb-1 block">
              Message affiché à l'utilisateur (facultatif)
            </label>
            <textarea
              value={expertMessage}
              onChange={(e) => setExpertMessage(e.target.value)}
              rows={5}
              className="w-full text-sm border rounded px-2 py-1"
              placeholder="Ce que vous avez vérifié et pourquoi votre verdict tient. Rédigé pour le client — pas de jargon interne."
            />
            <p className="text-xs text-muted-foreground mt-1">
              S'affiche sous le verdict, encadré « Vérifié par un expert ». Les notes internes
              ci-dessous ne sont, elles, jamais montrées au client.
            </p>
          </div>
        </div>
      )}

      {/* 2026-08-27 — Avis de l'agent relecteur IA (ai-review-agent, cron 10 min).
          Relecture INDÉPENDANTE : PDF source + recherche web de prix réels.
          L'humain garde le clic final. */}
      {(() => {
        const op = detail.analysis.ai_review_opinion;
        if (!op) {
          return (
            <div className="mb-6 p-3 border border-dashed rounded text-xs text-muted-foreground">
              🤖 Relecture IA en attente — l'agent passe toutes les 10 minutes.
            </div>
          );
        }
        // 2026-08-29 — état « en cours » : l'agent a pris l'analyse mais n'a
        // pas encore rendu son avis. Sans ce cas, le bloc s'affichait avec
        // « ACCORD : ? » et paraissait vide/cassé.
        if ((op as { status?: string }).status === "running") {
          const attempt = (op as { attempt?: number }).attempt ?? 1;
          return (
            <div className="mb-6 p-3 border border-dashed rounded text-xs text-muted-foreground">
              🤖 Relecture IA en cours{attempt > 1 ? ` (tentative ${attempt})` : ""} — l'avis apparaît d'ici 1 à 3 minutes.
            </div>
          );
        }
        if (op.error) {
          const detail = (op as { detail?: string }).detail;
          return (
            <div className="mb-6 p-3 border border-rose-200 bg-rose-50 rounded text-xs text-rose-800">
              🤖 Relecture IA indisponible
              {op.error === "timeout_edge"
                ? " — devis trop volumineux pour la relecture automatique."
                : ` : ${op.error}`}
              {detail ? <span className="text-rose-700/70"> ({detail})</span> : null}
            </div>
          );
        }
        const accordCls = op.accord_avec_ia === "oui"
          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
          : op.accord_avec_ia === "non"
            ? "bg-rose-100 text-rose-800 border-rose-300"
            : "bg-amber-100 text-amber-800 border-amber-300";
        const ACTION_LABEL: Record<string, string> = {
          valider: "Valider (IA juste)",
          corriger: "Corriger",
          rejeter_faux_positif: "Rejeter (faux positif Piste C)",
        };
        return (
          <div className="mb-6 p-4 border-2 border-indigo-200 bg-indigo-50/40 rounded space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">🤖 Avis de l'agent relecteur IA</span>
              <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold uppercase ${accordCls}`}>
                accord : {op.accord_avec_ia ?? "?"}
              </span>
            </div>
            {op.resume && <p className="text-xs text-foreground/80 leading-relaxed">{op.resume}</p>}
            {/* 2026-08-30 — hiérarchie inversée après le banc de test.
                L'écran mettait en avant `action_recommandee` et `confiance`,
                les deux champs MESURÉS comme non fiables : « corriger » sur
                37/37 du gold standard et 15/16 des analyses témoins jamais
                signalées, avec une confiance à 0,95 sur des désaccords. Ce qui
                porte l'information, ce sont les points vérifiés et les
                drapeaux — ils passent devant, la recommandation passe en bas
                avec sa fiabilité affichée.
                Détail : docs/refonte/RAPPORT-RELECTEUR-IA.md */}
            {Array.isArray(op.points_verifies) && op.points_verifies.length > 0 && (
              <ul className="text-xs space-y-1">
                {op.points_verifies.map((p, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="flex-shrink-0">
                      {p.avis === "cohérent" ? "🟢" : p.avis === "sans référence" ? "⚪" : "🟠"}
                    </span>
                    <span>
                      <strong>{p.poste}</strong> ({p.prix_devis}) — {p.detail}
                      {p.source_web && (
                        <>
                          {" "}
                          <a href={p.source_web} target="_blank" rel="noreferrer" className="text-indigo-700 underline">source</a>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {Array.isArray(op.drapeaux) && op.drapeaux.length > 0 && (
              <ul className="text-xs text-amber-900 space-y-0.5">
                {op.drapeaux.map((d, i) => <li key={i}>⚑ {d}</li>)}
              </ul>
            )}
            {op.action_recommandee && (
              <p className="text-[11px] text-muted-foreground border-t border-indigo-200/60 pt-2">
                Recommandation : <span className="font-medium">{ACTION_LABEL[op.action_recommandee] ?? op.action_recommandee}</span>
                {typeof op.confiance === "number" && <> · confiance annoncée {Math.round(op.confiance * 100)} %</>}
                <br />
                <span className="italic">
                  Champ peu fiable, mesuré le 30/08 : « corriger » sur 37/37 des analyses corrigées
                  ET sur 15/16 d'analyses jamais signalées. Fiez-vous aux points vérifiés et aux
                  drapeaux ci-dessus, pas à cette ligne.
                </span>
              </p>
            )}
            {op.notes_expert_proposees && (
              <button
                type="button"
                onClick={() => setNotes(op.notes_expert_proposees ?? "")}
                className="text-xs font-medium text-indigo-700 underline"
              >
                Utiliser ses notes comme Notes expert
              </button>
            )}
            {/* 2026-08-29 — deux destinataires, deux textes : les notes
                ci-dessus restent INTERNES (elles parlent de faux positifs et
                de matching), celui-ci est écrit pour le client et s'affiche
                sur sa page. Le bouton bascule en mode correction, sinon le
                champ rempli resterait invisible. */}
            {op.message_client_propose && (
              <button
                type="button"
                onClick={() => {
                  setExpertMessage(op.message_client_propose ?? "");
                  setMode("correct");
                }}
                className="ml-4 text-xs font-medium text-indigo-700 underline"
              >
                Pré-remplir le message client
              </button>
            )}
          </div>
        );
      })()}

      {/* Notes expert */}
      <div className="mb-6">
        <label className="text-sm font-medium mb-2 block">
          Notes expert (pourquoi ?)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full text-sm border rounded px-3 py-2"
          placeholder="Ex: WC à 8950€ est en réalité une dépose de cloisons (bug extraction Gemini sur tableau ALES)"
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {mode === "view" ? (
          <>
            <button
              onClick={() => callDecide("validated")}
              disabled={submitting}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded disabled:opacity-50 inline-flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" /> Valider (IA juste)
            </button>
            <button
              onClick={() => setMode("correct")}
              disabled={submitting}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded disabled:opacity-50 inline-flex items-center gap-2"
            >
              <AlertTriangle className="h-4 w-4" /> Corriger
            </button>
            <button
              onClick={() => callDecide("rejected")}
              disabled={submitting}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded disabled:opacity-50 inline-flex items-center gap-2"
            >
              <X className="h-4 w-4" /> Rejeter (faux positif Piste C)
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => callDecide("corrected")}
              disabled={submitting}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded disabled:opacity-50 inline-flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" /> Appliquer la correction
            </button>
            <button
              onClick={() => setMode("view")}
              disabled={submitting}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded"
            >
              Annuler
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminReviews() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewListItem[]>([]);
  const [count, setCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReviews = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/reviews", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Erreur API");
      const data = await res.json();
      setReviews(data.reviews ?? []);
      setCount(data.count ?? 0);
    } catch (e) {
      console.error("Fetch reviews error:", e);
      setError("Erreur de chargement des reviews");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/admin/reviews/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Erreur API");
      const data = await res.json();
      setDetail(data);
    } catch (e) {
      console.error("Fetch detail error:", e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Auth + initial load
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          window.location.href = "/connexion?redirect=/admin/reviews";
          return;
        }
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (!roleData) {
          setError("Accès réservé aux administrateurs");
          setIsAdmin(false);
          setLoading(false);
          return;
        }
        setIsAdmin(true);
        await fetchReviews();
      } catch (e) {
        console.error(e);
        setError("Erreur lors du chargement");
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchReviews]);

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
    else setDetail(null);
  }, [selectedId, fetchDetail]);

  const onActionComplete = useCallback(() => {
    // Refetch + désélection
    setSelectedId(null);
    setDetail(null);
    fetchReviews();
  }, [fetchReviews]);

  if (loading) return <AdminLoading />;
  if (!isAdmin || error) return <AdminAccessDenied />;

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader />
      <main className="container max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">Revue des analyses</h1>
            <p className="text-sm text-muted-foreground">
              {count} analyse{count !== 1 ? "s" : ""} en attente de validation expert
            </p>
          </div>
          <button
            onClick={fetchReviews}
            disabled={refreshing}
            className="px-3 py-1.5 border rounded text-sm inline-flex items-center gap-2 hover:bg-muted/50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Rafraîchir
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
          {/* Liste */}
          <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
            {reviews.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-lg">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Aucune analyse en attente</p>
                <p className="text-xs mt-1">La Piste C alerte ici dès qu'une analyse est flag.</p>
              </div>
            ) : (
              reviews.map((r) => (
                <ReviewCard
                  key={r.id}
                  item={r}
                  selected={selectedId === r.id}
                  onClick={() => setSelectedId(r.id)}
                />
              ))
            )}
          </div>

          {/* Détail */}
          <div className="bg-white border rounded-lg overflow-y-auto max-h-[calc(100vh-200px)]">
            {!selectedId ? (
              <div className="p-12 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Sélectionne une analyse à gauche pour voir le détail</p>
              </div>
            ) : detailLoading ? (
              <div className="p-12 flex justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : detail ? (
              <ReviewDetail detail={detail} onActionComplete={onActionComplete} />
            ) : (
              <div className="p-8 text-center text-red-600">Erreur de chargement du détail</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
