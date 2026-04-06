import { useState, useEffect, useRef } from 'react';
import {
  Bot, MessageCircle, Loader2, CheckCircle2, XCircle,
} from 'lucide-react';
import type { ChantierIAResult, DocumentChantier, LotChantier } from '@/types/chantier-ia';
import { ExpertAvatar } from '@/components/chantier/MATERIAL_IMAGES';
import { useChantierAssistant } from '@/hooks/useChantierAssistant';
import { supabase } from '@/integrations/supabase/client';

// ── Section Assistant chantier (Gemini 2.0-flash) ────────────────────────────

export const ALERTE_STYLE: Record<string, { bg: string; border: string; text: string; accent: string; btn: string }> = {
  critique:     { bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-800',    accent: 'border-l-red-500',    btn: 'bg-red-600 hover:bg-red-700 text-white'     },
  risque:       { bg: 'bg-amber-50',  border: 'border-amber-100',  text: 'text-amber-800',  accent: 'border-l-amber-400',  btn: 'bg-amber-500 hover:bg-amber-600 text-white'  },
  opportunité:  { bg: 'bg-emerald-50',border: 'border-emerald-100',text: 'text-emerald-800',accent: 'border-l-emerald-400',btn: 'bg-emerald-600 hover:bg-emerald-700 text-white'},
};

export const ALERTE_ICON: Record<string, string> = {
  critique: '🔴', risque: '⚠️', opportunité: '✅',
};

// ── Types état analyse inline ─────────────────────────────────────────────────

type AnalyseInlineState =
  | { phase: 'idle' }
  | { phase: 'launching' }
  | { phase: 'polling'; jobs: { docId: string; analyseId: string; docName: string }[] }
  | { phase: 'done'; results: { docId: string; analyseId: string; docName: string; score: string | null; scoreLabel: string }[] }
  | { phase: 'error'; message: string };

const SCORE_CFG: Record<string, { bg: string; text: string; label: string }> = {
  VERT:   { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Favorable' },
  ORANGE: { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Mitigé' },
  ROUGE:  { bg: 'bg-red-100',     text: 'text-red-700',     label: 'Vigilance' },
};

// ── Hook polling analyses ─────────────────────────────────────────────────────

function usePollAnalyses(
  jobs: { docId: string; analyseId: string; docName: string }[],
  onDone: (results: { docId: string; analyseId: string; docName: string; score: string | null; scoreLabel: string }[]) => void,
) {
  const doneRef = useRef(false);

  useEffect(() => {
    if (!jobs.length) return;
    doneRef.current = false;

    const interval = setInterval(async () => {
      if (doneRef.current) return;

      const ids = jobs.map(j => j.analyseId);
      const { data: rows } = await supabase
        .from('analyses')
        .select('id, status, score')
        .in('id', ids);

      if (!rows) return;

      const allDone = rows.every(r => r.status === 'completed' || r.status === 'error');
      if (allDone) {
        doneRef.current = true;
        clearInterval(interval);

        const byId: Record<string, { status: string; score: string | null }> = {};
        rows.forEach(r => { byId[r.id] = { status: r.status, score: r.score }; });

        const results = jobs.map(j => {
          const row = byId[j.analyseId];
          const score = row?.score ?? null;
          const cfg = score ? SCORE_CFG[score] : null;
          return {
            ...j,
            score,
            scoreLabel: row?.status === 'error' ? 'Erreur' : cfg?.label ?? 'En cours',
          };
        });

        onDone(results);
      }
    }, 5000);

    return () => { doneRef.current = true; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.map(j => j.analyseId).join(',')]);
}

// ── Carte proposition analyse inline ─────────────────────────────────────────

function AnalyseDevisCard({
  prop,
  documents,
  chantierId,
  token,
  onDecline,
}: {
  prop: { id: string; titre: string; description: string; cta_oui: string; cta_non: string };
  documents: DocumentChantier[];
  chantierId: string | null;
  token: string | null | undefined;
  onDecline: () => void;
}) {
  const [state, setState] = useState<AnalyseInlineState>({ phase: 'idle' });

  // Devis sans analyse
  const pendingDevis = documents.filter(
    d => d.document_type === 'devis' && !d.analyse_id
  );

  async function handleLancer() {
    if (!chantierId || !token || !pendingDevis.length) return;
    setState({ phase: 'launching' });

    const jobs: { docId: string; analyseId: string; docName: string }[] = [];

    for (const doc of pendingDevis) {
      try {
        const res = await fetch(`/api/chantier/${chantierId}/documents/${doc.id}/analyser`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if ((res.ok || res.status === 409) && data.analysisId) {
          jobs.push({ docId: doc.id, analyseId: data.analysisId, docName: doc.nom });
        }
      } catch {
        // continue les autres
      }
    }

    if (!jobs.length) {
      setState({ phase: 'error', message: 'Impossible de lancer l\'analyse.' });
      return;
    }

    setState({ phase: 'polling', jobs });
  }

  // Polling quand on est en phase "polling"
  usePollAnalyses(
    state.phase === 'polling' ? state.jobs : [],
    (results) => setState({ phase: 'done', results }),
  );

  // ── Phase idle ──────────────────────────────────────────────────────────────
  if (state.phase === 'idle') {
    return (
      <div className="bg-violet-50 border border-violet-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex items-start gap-3 mb-3">
            <span className="text-lg shrink-0">🤝</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-violet-900 leading-snug mb-0.5">{prop.titre}</p>
              <p className="text-sm text-violet-700 leading-relaxed">{prop.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLancer}
              disabled={!pendingDevis.length}
              className="flex-1 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 rounded-xl px-4 py-2 transition-colors"
            >
              {prop.cta_oui} →
            </button>
            <button
              onClick={onDecline}
              className="flex-1 text-sm font-medium text-violet-500 hover:text-violet-700 bg-white border border-violet-200 rounded-xl px-4 py-2 transition-colors"
            >
              {prop.cta_non}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase launching ─────────────────────────────────────────────────────────
  if (state.phase === 'launching') {
    return (
      <div className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-4 flex items-center gap-3">
        <Loader2 className="h-5 w-5 text-violet-500 animate-spin shrink-0" />
        <div>
          <p className="text-sm font-bold text-violet-900">Lancement de l'analyse…</p>
          <p className="text-xs text-violet-500">Préparation des documents</p>
        </div>
      </div>
    );
  }

  // ── Phase polling ───────────────────────────────────────────────────────────
  if (state.phase === 'polling') {
    return (
      <div className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Loader2 className="h-5 w-5 text-violet-500 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-bold text-violet-900">Analyse en cours…</p>
            <p className="text-xs text-violet-500">Résultat dans 30 à 60 secondes</p>
          </div>
        </div>
        <ul className="space-y-1.5">
          {state.jobs.map(j => (
            <li key={j.docId} className="flex items-center gap-2 text-xs text-violet-700">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              <span className="truncate">{j.docName}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // ── Phase done ──────────────────────────────────────────────────────────────
  if (state.phase === 'done') {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <p className="text-sm font-bold text-gray-900">Analyse terminée</p>
        </div>
        <ul className="space-y-2">
          {state.results.map(r => {
            const cfg = r.score ? SCORE_CFG[r.score] : null;
            return (
              <li key={r.docId} className="flex items-center gap-2">
                {cfg ? (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                    {cfg.label}
                  </span>
                ) : (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    {r.scoreLabel}
                  </span>
                )}
                <span className="text-sm text-gray-700 truncate flex-1 min-w-0">{r.docName}</span>
                <a
                  href={`/analyse/${r.analyseId}?from=chantier`}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 shrink-0"
                >
                  Voir →
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // ── Phase error ─────────────────────────────────────────────────────────────
  return (
    <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-4 flex items-start gap-3">
      <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-red-800">Erreur</p>
        <p className="text-xs text-red-600">{state.message}</p>
      </div>
      <button
        onClick={() => setState({ phase: 'idle' })}
        className="text-xs font-medium text-red-600 hover:text-red-700 shrink-0"
      >
        Réessayer
      </button>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

function AssistantChantierSection({ result, documents, lots, chantierId, token, agentInsights, onAddDoc, onGoToLots, onGoToAnalyse, onGoToBudget, onGoToJournal, onOpenChat }: {
  result: ChantierIAResult;
  documents: DocumentChantier[];
  lots: LotChantier[];
  chantierId: string | null;
  token: string | null | undefined;
  agentInsights?: {
    insights: Array<{
      id: string; type: string; severity: string; title: string; body: string;
      actions_taken: Array<{ tool: string; summary: string }>;
      needs_confirmation: boolean; read_by_user: boolean; created_at: string;
    }>;
    unreadCount: number;
    loading: boolean;
    markAsRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
  };
  onAddDoc: () => void;
  onGoToLots: () => void;
  onGoToAnalyse: () => void;
  onGoToBudget: () => void;
  onGoToJournal?: () => void;
  onOpenChat: () => void;
}) {
  const { data, loading, error, refresh } = useChantierAssistant({
    chantierId, token, result, documents, lots, enabled: true,
  });

  const [propositionStates, setPropositionStates] = useState<Record<string, 'pending' | 'declined'>>({});

  function resolveCtaAction(cta: string) {
    const c = cta.toLowerCase();
    if (c.includes('devis') && (c.includes('voir') || c.includes('lot'))) return onGoToLots;
    if (c.includes('analys') || c.includes('devis')) return onGoToAnalyse;
    if (c.includes('budget') || c.includes('affin')) return onGoToBudget;
    if (c.includes('import') || c.includes('ajout') || c.includes('factur') || c.includes('photo')) return onAddDoc;
    return onGoToLots;
  }

  function resolvePropositionAction(actionType: string) {
    if (actionType === 'budget_review') return onGoToBudget;
    if (actionType === 'add_devis') return onAddDoc;
    return onGoToLots;
  }

  function handleAccept(prop: { id: string; action_type: string }) {
    setPropositionStates(s => ({ ...s, [prop.id]: 'declined' }));
    resolvePropositionAction(prop.action_type)();
  }

  function handleDecline(id: string) {
    setPropositionStates(s => ({ ...s, [id]: 'declined' }));
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-7 space-y-4">

      {/* ── En-tête avatar ──────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <ExpertAvatar size={52} showBadge />
        <div>
          <h2 className="font-bold text-gray-900">Votre maître d'œuvre</h2>
          <p className="text-xs text-gray-400">Analyse propulsée par Gemini 2.0</p>
        </div>
        <button
          onClick={refresh}
          className="ml-auto text-xs text-gray-400 hover:text-blue-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-50"
        >
          Actualiser
        </button>
      </div>

      {/* ── Agent Insights temps réel ─────────────────────── */}
      {agentInsights && !agentInsights.loading && agentInsights.insights.length > 0 && (
        <AgentInsightsBlock
          insights={agentInsights.insights}
          markAsRead={agentInsights.markAsRead}
          markAllRead={agentInsights.markAllRead}
          onGoToLots={onGoToLots}
          onGoToJournal={onGoToJournal}
        />
      )}

      {/* ── Loading ─────────────────────────────────────────── */}
      {loading && !data && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-2xl bg-white border border-gray-100 animate-pulse" />
          ))}
          <p className="text-xs text-center text-gray-400">Analyse en cours…</p>
        </div>
      )}

      {/* ── Erreur ─────────────────────────────────────────── */}
      {error && !data && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-5 text-center">
          <Bot className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 mb-3">{error}</p>
          <button onClick={refresh} className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Réessayer →
          </button>
        </div>
      )}

      {/* ── Résultat IA ─────────────────────────────────────── */}
      {data && (
        <>
          {/* Action prioritaire */}
          <div className="bg-white rounded-2xl border-l-4 border-l-blue-500 border border-blue-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-1">Action prioritaire</p>
              <p className="font-bold text-gray-900 leading-snug mb-1">{data.action_prioritaire.titre}</p>
              <p className="text-sm text-gray-500 leading-relaxed mb-3">{data.action_prioritaire.raison}</p>
              <button
                onClick={resolveCtaAction(data.action_prioritaire.cta)}
                className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl px-4 py-2 transition-colors"
              >
                {data.action_prioritaire.cta} →
              </button>
            </div>
          </div>

          {/* Alertes */}
          {data.alertes.length > 0 && (
            <div className="space-y-2">
              {data.alertes.map((alerte, i) => {
                const s = ALERTE_STYLE[alerte.type] ?? ALERTE_STYLE.risque;
                return (
                  <div key={i} className={`rounded-2xl border-l-4 ${s.accent} ${s.border} ${s.bg} overflow-hidden`}>
                    <div className="px-5 py-3.5 flex items-start gap-3">
                      <span className="text-sm leading-none shrink-0 mt-0.5">{ALERTE_ICON[alerte.type] ?? '⚠️'}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${s.text} leading-snug`}>{alerte.message}</p>
                      </div>
                      <button
                        onClick={resolveCtaAction(alerte.cta)}
                        className={`shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${s.btn}`}
                      >
                        {alerte.cta} →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Propositions interactives */}
          {data.propositions && data.propositions.length > 0 && (
            <div className="space-y-2">
              {data.propositions.map(prop => {
                if (propositionStates[prop.id] === 'declined') return null;

                // Proposition analyse devis → carte inline avec polling
                if (prop.action_type === 'analyse_devis') {
                  return (
                    <AnalyseDevisCard
                      key={prop.id}
                      prop={prop}
                      documents={documents}
                      chantierId={chantierId}
                      token={token}
                      onDecline={() => handleDecline(prop.id)}
                    />
                  );
                }

                // Autres propositions → navigation classique
                return (
                  <div key={prop.id} className="bg-violet-50 border border-violet-200 rounded-2xl overflow-hidden">
                    <div className="px-5 py-4">
                      <div className="flex items-start gap-3 mb-3">
                        <span className="text-lg shrink-0">🤝</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-violet-900 leading-snug mb-0.5">{prop.titre}</p>
                          <p className="text-sm text-violet-700 leading-relaxed">{prop.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAccept(prop)}
                          className="flex-1 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl px-4 py-2 transition-colors"
                        >
                          {prop.cta_oui} →
                        </button>
                        <button
                          onClick={() => handleDecline(prop.id)}
                          className="flex-1 text-sm font-medium text-violet-500 hover:text-violet-700 bg-white border border-violet-200 rounded-xl px-4 py-2 transition-colors"
                        >
                          {prop.cta_non}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Insights */}
          {data.insights.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Observations</p>
              <ul className="space-y-2">
                {data.insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-400 shrink-0 mt-0.5">›</span>
                    <span className="text-sm text-gray-700 leading-snug">{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Conseil métier */}
          {data.conseil_metier && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4 flex items-start gap-3">
              <span className="text-lg shrink-0">💡</span>
              <p className="text-sm text-blue-800 font-medium leading-relaxed">{data.conseil_metier}</p>
            </div>
          )}

          {/* Accès chat */}
          <div className="pt-2 flex justify-center">
            <button
              onClick={onOpenChat}
              className="flex items-center gap-2 text-sm font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl px-5 py-2.5 transition-all shadow-sm"
            >
              <MessageCircle className="h-4 w-4" />
              Poser une question au maître d'œuvre →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-component: Agent Insights Block (extracted from IIFE for hooks safety) ─

const SEVERITY_STYLE: Record<string, { bg: string; border: string; dot: string }> = {
  critical: { bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500' },
  warning:  { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-400' },
  info:     { bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-400' },
};

const TYPE_ICON: Record<string, string> = {
  planning_impact: '\uD83D\uDCC5', budget_alert: '\uD83D\uDCB0', payment_overdue: '\u23F0',
  conversation_summary: '\uD83D\uDCAC', risk_detected: '\u26A0\uFE0F', lot_status_change: '\uD83D\uDD04',
  needs_clarification: '\u2753', digest: '\uD83D\uDCD6',
};

function AgentInsightsBlock({ insights, markAsRead, markAllRead, onGoToLots, onGoToJournal }: {
  insights: Array<{
    id: string; type: string; severity: string; title: string; body: string;
    actions_taken: Array<{ tool: string; summary: string }>;
    needs_confirmation: boolean; read_by_user: boolean; created_at: string;
  }>;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  onGoToLots: () => void;
  onGoToJournal?: () => void;
}) {
  const clarifications = insights.filter(i => i.needs_confirmation && !i.read_by_user);
  const unread = insights.filter(i => !i.read_by_user && !i.needs_confirmation);

  return (
    <>
      {/* Clarifications urgentes */}
      {clarifications.length > 0 && (
        <div className="space-y-2">
          {clarifications.map(c => (
            <div key={c.id} className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4">
              <div className="flex items-start gap-2">
                <span className="text-lg leading-none">{'\u2753'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-orange-500 mb-1">Clarification demandée</p>
                  <p className="text-sm font-semibold text-gray-900 mb-1">{c.title}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{c.body}</p>
                  <div className="flex gap-2 mt-3">
                    <button onClick={onGoToLots} className="text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-xl px-3 py-1.5 transition-colors">
                      Affecter à un lot
                    </button>
                    <button onClick={() => markAsRead(c.id)} className="text-xs font-medium text-gray-400 hover:text-gray-600 px-3 py-1.5 transition-colors">
                      Ignorer
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Insights non lus */}
      {unread.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Activité agent IA ({unread.length})</p>
            <button onClick={markAllRead} className="text-[10px] text-gray-400 hover:text-blue-600 transition-colors">
              Tout marquer comme lu
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {unread.slice(0, 5).map(ins => {
              const sev = SEVERITY_STYLE[ins.severity] ?? SEVERITY_STYLE.info;
              return (
                <button key={ins.id} onClick={() => markAsRead(ins.id)} className={`w-full text-left px-5 py-3 hover:bg-gray-50/50 transition-colors ${sev.bg}`}>
                  <div className="flex items-start gap-2.5">
                    <span className="text-sm leading-none mt-0.5">{TYPE_ICON[ins.type] ?? '\uD83D\uDD14'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                        <p className="text-sm font-semibold text-gray-900 truncate">{ins.title}</p>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ins.body}</p>
                      {ins.actions_taken.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {ins.actions_taken.map((a, j) => (
                            <p key={j} className="text-[10px] text-primary flex items-center gap-1">
                              <Bot className="h-3 w-3 inline-block" /> {a.summary}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-300 whitespace-nowrap mt-0.5">
                      {new Date(ins.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Lien journal */}
      {onGoToJournal && (
        <button onClick={onGoToJournal} className="w-full text-center py-2.5 text-xs text-primary hover:text-primary/80 hover:bg-primary/5 rounded-xl transition-colors">
          Voir le journal de chantier du jour →
        </button>
      )}
    </>
  );
}

export default AssistantChantierSection;
