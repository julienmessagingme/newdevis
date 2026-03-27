/**
 * TresoreriePanel — module financier complet du cockpit chantier.
 *
 * Onglets :
 *   📅 Échéancier  — timeline de paiement triée + statuts + bouton "Marquer payé" visible
 *   📊 Trésorerie  — jauge budget (enveloppe éditable) + sources de financement
 *   💳 Financement — simulateur aides (MaPrimeRénov/CEE/Éco-PTZ) + crédit travaux
 */
import { useState, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Client léger pour récupérer un token frais lors des uploads de justificatifs
const _supabase = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL,
  (import.meta as any).env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
async function getFreshBearerToken(fallback: string): Promise<string> {
  try {
    const { data: { session } } = await _supabase.auth.getSession();
    return session?.access_token ?? fallback;
  } catch {
    return fallback;
  }
}
import {
  AlertTriangle, CheckCircle2, Clock, Calendar, TrendingUp, CreditCard,
  ChevronRight, Loader2, RefreshCw, AlertCircle, Check, X, RotateCcw,
  Info, Pencil, Euro, Paperclip, Upload, ExternalLink,
} from 'lucide-react';
import {
  usePaymentEvents,
  computeAlerts,
  computeCashflow,
  computeTotalEngaged,
  type PaymentAlert,
} from '@/hooks/usePaymentEvents';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

const fmtEurPrecis = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function fmtDateFR(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function fmtDateShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short',
  });
}

function daysUntil(iso: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(iso + 'T00:00:00');
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

type Tab = 'timeline' | 'cashflow' | 'financement';

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'timeline',    label: 'Échéancier',  icon: <Calendar  className="h-3.5 w-3.5" /> },
    { id: 'cashflow',    label: 'Trésorerie',  icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { id: 'financement', label: 'Financement', icon: <CreditCard className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-all ${
            active === t.id
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.icon}
          <span className="hidden sm:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  paid:      { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: 'Payé ✓',    icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> },
  late:      { dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700 border-red-100',             label: 'En retard', icon: <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> },
  pending:   { dot: 'bg-blue-400',    badge: 'bg-blue-50 text-blue-700 border-blue-100',           label: 'À venir',   icon: <Clock className="h-3.5 w-3.5 text-blue-500" /> },
  cancelled: { dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-400 border-gray-100',           label: 'Annulé',    icon: null },
};

function PaymentTimeline({
  chantierId,
  token,
}: {
  chantierId: string;
  token: string;
}) {
  const { events, loading, error, refresh, markPaid, markUnpaid } = usePaymentEvents(chantierId, token);
  const [confirmingId, setConfirmingId]     = useState<string | null>(null);
  // Justificatif : après confirmation de paiement, proposer l'upload
  const [proofPromptId, setProofPromptId]   = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Chargement de l'échéancier…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-gray-500">{error}</p>
        <button onClick={refresh}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-semibold">
          <RefreshCw className="h-3.5 w-3.5" /> Réessayer
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
          <Calendar className="h-5 w-5 text-blue-400" />
        </div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Aucune échéance pour l'instant</p>
        <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
          Les conditions de paiement de vos devis et factures seront analysées ici automatiquement.
        </p>
      </div>
    );
  }

  const paidTotal    = events.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amount ?? 0), 0);
  const lateTotal    = events.filter(e => e.status === 'late').reduce((s, e) => s + (e.amount ?? 0), 0);
  const pendingTotal = events.filter(e => e.status === 'pending').reduce((s, e) => s + (e.amount ?? 0), 0);

  const grouped = events.reduce<Record<string, typeof events>>((acc, ev) => {
    const key = ev.due_date
      ? new Date(ev.due_date + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      : 'Sans date';
    acc[key] = [...(acc[key] ?? []), ev];
    return acc;
  }, {});

  return (
    <div className="space-y-5">

      {/* ── Intro pédagogique ── */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex gap-2.5">
        <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 leading-relaxed">
          Cet échéancier regroupe <strong>tous les acomptes et règlements</strong> extraits de vos devis validés.
          Cliquez sur <strong>Marquer payé</strong> pour confirmer un versement.
        </p>
      </div>

      {/* ── KPI résumé ── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-0.5">Payé</p>
          <p className="text-base font-extrabold text-emerald-700">{paidTotal > 0 ? fmtEur(paidTotal) : '—'}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-0.5">À venir</p>
          <p className="text-base font-extrabold text-blue-700">{pendingTotal > 0 ? fmtEur(pendingTotal) : '—'}</p>
        </div>
        {lateTotal > 0 ? (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
            <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-0.5">En retard</p>
            <p className="text-base font-extrabold text-red-700">{fmtEur(lateTotal)}</p>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Retard</p>
            <p className="text-base font-extrabold text-gray-400">—</p>
          </div>
        )}
      </div>

      {/* ── Liste groupée par mois ── */}
      {Object.entries(grouped).map(([month, evts]) => (
        <div key={month}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
            {month}
          </p>
          <div className="bg-white border border-gray-100 rounded-2xl divide-y divide-gray-50 overflow-hidden shadow-sm">
            {evts.map(ev => {
              const cfg    = STATUS_CFG[ev.status] ?? STATUS_CFG.pending;
              const isLate = ev.status === 'late';
              const isPaid = ev.status === 'paid';
              const days   = ev.due_date ? daysUntil(ev.due_date) : null;
              const isConfirming = confirmingId === ev.id;

              let delayLabel = '';
              if (ev.due_date && !isPaid) {
                if (isLate) {
                  delayLabel = `En retard de ${Math.abs(days!)} j`;
                } else if (days === 0) {
                  delayLabel = "Aujourd'hui";
                } else if (days === 1) {
                  delayLabel = 'Demain';
                } else if (days !== null && days <= 7) {
                  delayLabel = `Dans ${days} jours`;
                }
              }

              return (
                <div key={ev.id}
                  className={`px-4 py-3.5 ${isLate ? 'bg-red-50/40' : isPaid ? 'bg-emerald-50/30' : ''}`}>

                  <div className="flex items-start gap-3">
                    {/* Dot statut */}
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${cfg.dot}`} />

                    {/* Contenu principal */}
                    <div className="flex-1 min-w-0">
                      {/* Ligne 1 : label + montant */}
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`text-sm font-semibold leading-tight ${isPaid ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                          {ev.label}
                        </p>
                        {ev.amount !== null && (
                          <span className={`text-sm font-bold tabular-nums shrink-0 ${
                            isLate ? 'text-red-700' : isPaid ? 'text-gray-400' : 'text-gray-900'
                          }`}>
                            {fmtEur(ev.amount)}
                          </span>
                        )}
                      </div>

                      {/* Ligne 2 : artisan + lot/document source */}
                      {(ev.artisan_nom || ev.lot_nom || ev.source_name) && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {ev.artisan_nom ? (
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                              isPaid ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-700'
                            }`}>
                              🔧 {ev.artisan_nom}
                            </span>
                          ) : ev.lot_nom ? (
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                              isPaid ? 'bg-gray-100 text-gray-400' : 'bg-slate-100 text-slate-600'
                            }`}>
                              🔧 {ev.lot_nom}
                            </span>
                          ) : null}
                          {ev.source_name && (
                            <span className="text-[10px] text-gray-400 truncate max-w-[160px]">
                              {ev.source_name.replace(/\.(pdf|PDF)$/, '')}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Ligne 3 : date + badge + délai */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                        {ev.due_date && (
                          <span className={`text-[11px] font-medium ${isLate ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                            {fmtDateFR(ev.due_date)}
                          </span>
                        )}
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                        {delayLabel && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            isLate
                              ? 'bg-red-100 text-red-700'
                              : days !== null && days <= 3
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-gray-100 text-gray-500'
                          }`}>
                            {delayLabel}
                          </span>
                        )}
                      </div>

                      {/* CTA "Marquer payé" — pill visible pour les non-payés */}
                      {(ev.status === 'pending' || ev.status === 'late') && !isConfirming && (
                        <button
                          onClick={() => setConfirmingId(ev.id)}
                          className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 transition-colors"
                        >
                          <Check className="h-3 w-3" />
                          Marquer payé
                        </button>
                      )}

                      {/* Confirmation marquer payé */}
                      {isConfirming && (
                        <div className="mt-2.5 flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                          <p className="text-xs font-semibold text-emerald-700 flex-1">
                            Confirmer le paiement de {ev.amount !== null ? fmtEur(ev.amount) : 'cette échéance'} ?
                          </p>
                          <button
                            onClick={async () => {
                              setConfirmingId(null);
                              const ok = await markPaid(ev.id);
                              if (ok) setProofPromptId(ev.id);
                            }}
                            className="flex items-center gap-1 text-xs font-bold bg-emerald-600 text-white rounded-lg px-2.5 py-1.5 hover:bg-emerald-700 transition-colors"
                          >
                            <Check className="h-3 w-3" /> Oui, payé
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors"
                          >
                            <X className="h-3 w-3" /> Annuler
                          </button>
                        </div>
                      )}

                      {/* Prompt justificatif — affiché juste après confirmation de paiement */}
                      {proofPromptId === ev.id && !ev.proof_doc_id && (
                        <div className="mt-2.5 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 space-y-2">
                          <p className="text-xs font-semibold text-blue-800">
                            💳 Paiement confirmé — voulez-vous joindre un justificatif ?
                          </p>
                          <p className="text-[11px] text-blue-600 leading-relaxed">
                            Virement, chèque, extrait de compte… (PDF ou image)
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => proofInputRef.current?.click()}
                              disabled={proofUploading}
                              className="flex items-center gap-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              {proofUploading
                                ? <><Loader2 className="h-3 w-3 animate-spin" /> Envoi…</>
                                : <><Upload className="h-3 w-3" /> Joindre</>}
                            </button>
                            <button
                              onClick={() => setProofPromptId(null)}
                              className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              Plus tard
                            </button>
                          </div>
                          <input
                            ref={proofInputRef}
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setProofUploading(true);
                              try {
                                const fd = new FormData();
                                fd.append('file', file);
                                fd.append('nom', `Justificatif — ${ev.label}`);
                                fd.append('documentType', 'preuve_paiement');
                                fd.append('paymentEventId', ev.id);
                                const bearer = await getFreshBearerToken(token);
                                const res = await fetch(`/api/chantier/${chantierId}/documents`, {
                                  method: 'POST',
                                  headers: { Authorization: `Bearer ${bearer}` },
                                  body: fd,
                                });
                                if (res.ok) {
                                  setProofPromptId(null);
                                  refresh(); // re-fetch pour afficher le lien justificatif
                                }
                              } finally {
                                setProofUploading(false);
                                if (proofInputRef.current) proofInputRef.current.value = '';
                              }
                            }}
                          />
                        </div>
                      )}

                      {/* Lien vers le justificatif — affiché si un proof existe */}
                      {isPaid && ev.proof_doc_id && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Paperclip className="h-3 w-3 text-gray-400 shrink-0" />
                          {ev.proof_signed_url ? (
                            <a
                              href={ev.proof_signed_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-blue-600 hover:text-blue-800 font-medium underline-offset-2 hover:underline flex items-center gap-1"
                            >
                              {ev.proof_doc_name ?? 'Justificatif'}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          ) : (
                            <span className="text-[11px] text-gray-400">{ev.proof_doc_name ?? 'Justificatif joint'}</span>
                          )}
                        </div>
                      )}

                      {/* Annuler paiement (ligne payée) */}
                      {isPaid && (
                        <button
                          onClick={() => markUnpaid(ev.id)}
                          className="mt-2 inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-amber-600 transition-colors"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Annuler ce paiement
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <button onClick={refresh}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 py-2 transition-colors">
        <RefreshCw className="h-3 w-3" /> Actualiser
      </button>
    </div>
  );
}

// ── Alertes intelligentes ─────────────────────────────────────────────────────

const ALERT_CFG: Record<PaymentAlert['type'], { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  late:   { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-800',   icon: <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" /> },
  soon:   { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: <Clock className="h-4 w-4 text-amber-500 shrink-0" /> },
  budget: { bg: 'bg-orange-50',border: 'border-orange-200',text: 'text-orange-800',icon: <AlertCircle className="h-4 w-4 text-orange-500 shrink-0" /> },
};

function AlertsPanel({ alerts }: { alerts: PaymentAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        <p className="text-sm font-medium text-emerald-800">Aucune alerte — tout est à jour ✓</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => {
        const cfg = ALERT_CFG[a.type];
        return (
          <div key={i} className={`flex items-start gap-2.5 ${cfg.bg} border ${cfg.border} rounded-xl px-4 py-3`}>
            {cfg.icon}
            <p className={`text-sm font-medium ${cfg.text} leading-snug`}>{a.message}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Jauge budget réel (enveloppe éditable) ────────────────────────────────────

function BudgetGaugeReal({
  totalEngaged,
  totalPaid,
  budgetMax,
  lateAmount,
  onBudgetOverride,
}: {
  totalEngaged: number;
  totalPaid: number;
  budgetMax: number;
  lateAmount: number;
  onBudgetOverride: (v: number | null) => void;
}) {
  const [editing, setEditing]       = useState(false);
  const [editValue, setEditValue]   = useState('');
  const [showTooltip, setShowTooltip] = useState(false);

  const ref     = budgetMax > 0 ? budgetMax : (totalEngaged || 1);
  const paidPct = Math.min((totalPaid    / ref) * 100, 100);
  const engPct  = Math.min((totalEngaged / ref) * 100, 100);
  const isOver  = totalEngaged > ref && budgetMax > 0;
  const remaining = budgetMax > 0 ? Math.max(0, budgetMax - totalEngaged) : null;

  function startEdit() {
    setEditValue(budgetMax > 0 ? String(Math.round(budgetMax)) : '');
    setEditing(true);
  }

  function confirmEdit() {
    const v = parseFloat(editValue.replace(/\s/g, '').replace(',', '.'));
    if (!isNaN(v) && v > 0) {
      onBudgetOverride(v);
    }
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function resetOverride() {
    onBudgetOverride(null);
    setEditing(false);
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900 text-sm">Budget total engagé</h3>

        {/* Badge enveloppe éditable */}
        <div className="flex items-center gap-1.5">
          {editing ? (
            <div className="flex items-center gap-1 border border-blue-300 bg-blue-50 rounded-lg px-2 py-0.5">
              <Euro className="h-3 w-3 text-blue-400 shrink-0" />
              <input
                autoFocus
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
                className="w-24 text-xs font-bold text-blue-700 bg-transparent outline-none tabular-nums"
                placeholder="99 300"
              />
              <button onClick={confirmEdit} className="text-emerald-600 hover:text-emerald-700">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                isOver
                  ? 'bg-red-50 text-red-600 border-red-100'
                  : 'bg-gray-50 text-gray-500 border-gray-100'
              }`}>
                {budgetMax > 0 ? `Enveloppe · ${fmtEur(budgetMax)}` : 'Enveloppe non définie'}
                <button
                  onClick={startEdit}
                  title="Modifier l'enveloppe"
                  className="ml-0.5 text-gray-400 hover:text-blue-600 transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </span>

              {/* Tooltip ℹ */}
              <div className="relative">
                <button
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  onClick={() => setShowTooltip(v => !v)}
                  className="text-gray-300 hover:text-blue-400 transition-colors"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                {showTooltip && (
                  <div className="absolute right-0 top-6 z-20 w-64 bg-gray-900 text-white text-[11px] leading-relaxed rounded-xl p-3 shadow-xl">
                    Il s'agit de l'<strong>estimation haute</strong> générée par l'IA à partir de vos lots.
                    Cliquez sur <strong>✏</strong> pour saisir votre propre enveloppe budgétaire.
                    <div className="absolute -top-1.5 right-2 w-3 h-3 bg-gray-900 rotate-45" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Barre */}
      <div className="space-y-1.5">
        <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="absolute left-0 h-full bg-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${paidPct}%` }}
          />
          {engPct > paidPct && (
            <div
              className={`absolute h-full rounded-full transition-all duration-700 ${isOver ? 'bg-red-400' : 'bg-blue-400'}`}
              style={{ left: `${paidPct}%`, width: `${engPct - paidPct}%` }}
            />
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Payé</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Engagé (reste à payer)</span>
          {budgetMax > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200 inline-block" /> Disponible</span>}
        </div>
      </div>

      {/* 3 KPI */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl py-2.5 px-2">
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-0.5">Payé</p>
          <p className="text-base font-extrabold text-emerald-700">{totalPaid > 0 ? fmtEur(totalPaid) : '—'}</p>
          <p className="text-[10px] text-emerald-400 mt-0.5">versé aux artisans</p>
        </div>
        <div className={`border rounded-xl py-2.5 px-2 ${isOver ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isOver ? 'text-red-500' : 'text-blue-500'}`}>
            Engagé
          </p>
          <p className={`text-base font-extrabold ${isOver ? 'text-red-700' : 'text-blue-700'}`}>
            {totalEngaged > 0 ? fmtEur(totalEngaged) : '—'}
          </p>
          <p className={`text-[10px] mt-0.5 ${isOver ? 'text-red-400' : 'text-blue-400'}`}>total devis signés</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl py-2.5 px-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Restant</p>
          <p className="text-base font-extrabold text-gray-700">
            {remaining !== null ? fmtEur(remaining) : '—'}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {remaining !== null ? 'budget non engagé' : 'budget non défini'}
          </p>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 flex gap-2">
        <Info className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-500 leading-relaxed">
          <strong className="text-gray-600">Engagé</strong> = somme de tous vos devis validés (acomptes déjà versés + ce qui reste à payer).
          {lateAmount > 0 && (
            <span className="text-red-600 font-semibold"> Dont {fmtEur(lateAmount)} en retard de paiement.</span>
          )}
        </p>
      </div>
    </div>
  );
}

// ── Projection cashflow ───────────────────────────────────────────────────────

function CashflowProjection({
  next7, next30, next60, events,
}: {
  next7: number;
  next30: number;
  next60: number;
  events: ReturnType<typeof usePaymentEvents>['events'];
}) {
  const max = Math.max(next7, next30, next60, 1);
  const [expanded, setExpanded] = useState<'7' | '30' | '60' | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const d7    = new Date(); d7.setDate(d7.getDate() + 7);
  const d30   = new Date(); d30.setDate(d30.getDate() + 30);
  const d60   = new Date(); d60.setDate(d60.getDate() + 60);

  const active = events.filter(e => !e.is_override && e.status !== 'cancelled' && e.status !== 'paid' && e.due_date);

  const evts7  = active.filter(e => e.due_date! >= today && e.due_date! <= d7.toISOString().slice(0, 10));
  const evts30 = active.filter(e => e.due_date! >= today && e.due_date! <= d30.toISOString().slice(0, 10));
  const evts60 = active.filter(e => e.due_date! >= today && e.due_date! <= d60.toISOString().slice(0, 10));

  const rows: { key: '7' | '30' | '60'; label: string; sublabel: string; value: number; color: string; bg: string; evts: typeof active }[] = [
    { key: '7',  label: '7 prochains jours',  sublabel: 'Paiements urgents', value: next7,  color: 'bg-red-400',   bg: 'bg-red-50',   evts: evts7  },
    { key: '30', label: '30 prochains jours', sublabel: 'Ce mois-ci',        value: next30, color: 'bg-amber-400', bg: 'bg-amber-50', evts: evts30 },
    { key: '60', label: '60 prochains jours', sublabel: 'Dans les 2 mois',   value: next60, color: 'bg-blue-400',  bg: 'bg-blue-50',  evts: evts60 },
  ];

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3 shadow-sm">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm">Prévision de dépenses</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">Montants restant à verser par période</p>
      </div>

      {rows.map(row => (
        <div key={row.key} className={`${row.bg} rounded-xl overflow-hidden`}>
          <button
            className="w-full px-4 py-3 space-y-1.5 text-left"
            onClick={() => setExpanded(expanded === row.key ? null : row.key)}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-gray-700">{row.label}</span>
                <span className="text-[10px] text-gray-400 ml-2">({row.sublabel})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-gray-900 tabular-nums">
                  {row.value > 0 ? fmtEur(row.value) : <span className="text-gray-300 font-normal text-xs">Rien</span>}
                </span>
                {row.evts.length > 0 && (
                  <span className="text-[10px] text-gray-400">{expanded === row.key ? '▲' : '▼'}</span>
                )}
              </div>
            </div>
            {row.value > 0 && (
              <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                <div
                  className={`h-full ${row.color} rounded-full transition-all duration-700`}
                  style={{ width: `${(row.value / max) * 100}%` }}
                />
              </div>
            )}
            {row.evts.length > 0 && (
              <p className="text-[10px] text-gray-400">
                {row.evts.length} paiement{row.evts.length > 1 ? 's' : ''} concerné{row.evts.length > 1 ? 's' : ''} — cliquez pour voir le détail
              </p>
            )}
          </button>

          {expanded === row.key && row.evts.length > 0 && (
            <div className="border-t border-white/50 divide-y divide-white/50 mx-3 mb-3">
              {row.evts.map(ev => (
                <div key={ev.id} className="flex items-center gap-2 py-2 px-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-gray-700 truncate">{ev.label}</p>
                    <p className="text-[10px] text-gray-400">
                      {ev.artisan_nom ?? ev.lot_nom ?? ev.source_name?.replace(/\.(pdf|PDF)$/, '') ?? ''}
                      {ev.due_date && ` · ${fmtDateShort(ev.due_date)}`}
                    </p>
                  </div>
                  {ev.amount !== null && (
                    <span className="text-[11px] font-bold text-gray-700 tabular-nums shrink-0">
                      {fmtEur(ev.amount)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {next60 === 0 && (
        <p className="text-xs text-gray-400 text-center pt-1">
          Aucun paiement à prévoir dans les 60 prochains jours
        </p>
      )}

      <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 flex gap-2">
        <Info className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Ces montants sont <strong className="text-gray-600">cumulatifs</strong> : "30 prochains jours" inclut aussi les paiements des 7 premiers jours.
          Seules les échéances non encore payées sont comptées.
        </p>
      </div>
    </div>
  );
}

// ── Bloc sources de financement ───────────────────────────────────────────────

const SOURCES_CFG = [
  { key: 'apport',      label: 'Apport personnel',  emoji: '💰', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  { key: 'credit',      label: 'Crédit travaux',     emoji: '🏦', color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-100'    },
  { key: 'maprime',     label: "MaPrimeRénov'",      emoji: '🟢', color: 'text-green-700',   bg: 'bg-green-50',   border: 'border-green-100'   },
  { key: 'cee',         label: 'CEE',                emoji: '💡', color: 'text-yellow-700',  bg: 'bg-yellow-50',  border: 'border-yellow-100'  },
  { key: 'eco_ptz',     label: 'Éco-PTZ',            emoji: '🏠', color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-100'  },
] as const;

type SourceKey = typeof SOURCES_CFG[number]['key'];

function FinancingSources({ budgetMax }: { budgetMax: number }) {
  const [amounts, setAmounts] = useState<Record<SourceKey, string>>({
    apport: '', credit: '', maprime: '', cee: '', eco_ptz: '',
  });

  const total = Object.values(amounts).reduce((s, v) => {
    const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
    return s + (isNaN(n) ? 0 : n);
  }, 0);

  const ref  = budgetMax > 0 ? budgetMax : null;
  const pct  = ref ? Math.min((total / ref) * 100, 100) : 0;
  const gap  = ref ? Math.max(0, ref - total) : null;
  const over = ref ? total > ref : false;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4 shadow-sm">
      <div>
        <h3 className="font-semibold text-gray-900 text-sm">Sources de financement</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">Renseignez vos apports et aides pour visualiser votre couverture</p>
      </div>

      <div className="space-y-2">
        {SOURCES_CFG.map(src => (
          <div key={src.key} className={`flex items-center gap-3 ${src.bg} border ${src.border} rounded-xl px-3 py-2.5`}>
            <span className="text-base w-6 text-center shrink-0">{src.emoji}</span>
            <span className={`text-xs font-semibold flex-1 ${src.color}`}>{src.label}</span>
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1 w-28">
              <input
                type="text"
                inputMode="decimal"
                value={amounts[src.key]}
                onChange={e => setAmounts(prev => ({ ...prev, [src.key]: e.target.value }))}
                placeholder="0"
                className={`w-full text-xs font-bold ${src.color} bg-transparent outline-none tabular-nums text-right`}
              />
              <span className="text-[10px] text-gray-400 shrink-0">€</span>
            </div>
          </div>
        ))}
      </div>

      {/* Barre de couverture */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-500 font-medium">Total financé</span>
          <span className={`font-extrabold tabular-nums ${over ? 'text-emerald-600' : total > 0 ? 'text-blue-700' : 'text-gray-300'}`}>
            {total > 0 ? fmtEur(total) : '—'}
          </span>
        </div>
        {ref && (
          <>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${over ? 'bg-emerald-400' : 'bg-blue-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-400">Couverture : <strong className="text-gray-600">{Math.round(pct)} %</strong></span>
              {gap !== null && gap > 0 && (
                <span className="text-amber-600 font-semibold">Il manque encore {fmtEur(gap)}</span>
              )}
              {over && (
                <span className="text-emerald-600 font-semibold">Budget couvert ✓</span>
              )}
            </div>
          </>
        )}
      </div>

      {gap !== null && gap > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 flex gap-2">
          <Info className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 leading-relaxed">
            Il vous manque <strong>{fmtEur(gap)}</strong> pour couvrir votre enveloppe.
            Consultez l'onglet <strong>Financement</strong> pour simuler vos aides.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Onglet Trésorerie complet ─────────────────────────────────────────────────

function CashflowTab({
  chantierId,
  token,
  budgetMax,
  onBudgetOverride,
}: {
  chantierId: string;
  token: string;
  budgetMax: number;
  onBudgetOverride: (v: number | null) => void;
}) {
  const { events, loading, error, refresh } = usePaymentEvents(chantierId, token);

  const totalEngaged = useMemo(() => computeTotalEngaged(events), [events]);
  const totalPaid    = useMemo(() => events.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amount ?? 0), 0), [events]);
  const lateAmount   = useMemo(() => events.filter(e => e.status === 'late').reduce((s, e) => s + (e.amount ?? 0), 0), [events]);
  const cashflow     = useMemo(() => computeCashflow(events), [events]);
  const alerts       = useMemo(() => computeAlerts(events, budgetMax || null), [events, budgetMax]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Calcul de la trésorerie…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-gray-500">{error}</p>
        <button onClick={refresh} className="flex items-center gap-1.5 text-xs text-blue-600 font-semibold">
          <RefreshCw className="h-3.5 w-3.5" /> Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AlertsPanel alerts={alerts} />
      <BudgetGaugeReal
        totalEngaged={totalEngaged}
        totalPaid={totalPaid}
        budgetMax={budgetMax}
        lateAmount={lateAmount}
        onBudgetOverride={onBudgetOverride}
      />
      <CashflowProjection
        next7={cashflow.next7}
        next30={cashflow.next30}
        next60={cashflow.next60}
        events={events}
      />
      <FinancingSources budgetMax={budgetMax} />
    </div>
  );
}

// ── Simulateur d'aides travaux (style EFFY) ───────────────────────────────────

const WORK_TYPES = [
  { key: 'isolation',   label: 'Isolation',          emoji: '🌡' },
  { key: 'chauffage',   label: 'Chauffage / PAC',     emoji: '🔥' },
  { key: 'fenetres',    label: 'Fenêtres / menuiseries', emoji: '🪟' },
  { key: 'ventilation', label: 'VMC / Ventilation',   emoji: '💨' },
  { key: 'autre',       label: 'Autres travaux',       emoji: '🏗' },
] as const;

type WorkTypeKey = typeof WORK_TYPES[number]['key'];

const INCOME_BRACKETS = [
  { key: 'tres_modestes',  label: 'Très modestes',    sublabel: '< 21 000 € / an' },
  { key: 'modestes',       label: 'Modestes',         sublabel: '21 000 – 30 000 €' },
  { key: 'intermediaires', label: 'Intermédiaires',   sublabel: '30 000 – 46 000 €' },
  { key: 'superieurs',     label: 'Supérieurs',       sublabel: '> 46 000 €' },
] as const;

type IncomeBracket = typeof INCOME_BRACKETS[number]['key'];

// Taux MaPrimeRénov' + plafond par type × tranche de revenu
const MAPRIME_RATES: Record<WorkTypeKey, Record<IncomeBracket, number>> = {
  isolation:   { tres_modestes: 0.75, modestes: 0.60, intermediaires: 0.40, superieurs: 0.15 },
  chauffage:   { tres_modestes: 0.80, modestes: 0.60, intermediaires: 0.40, superieurs: 0.15 },
  fenetres:    { tres_modestes: 0.50, modestes: 0.40, intermediaires: 0.20, superieurs: 0.10 },
  ventilation: { tres_modestes: 0.50, modestes: 0.40, intermediaires: 0.20, superieurs: 0.10 },
  autre:       { tres_modestes: 0,    modestes: 0,    intermediaires: 0,    superieurs: 0    },
};
const MAPRIME_CAP: Record<WorkTypeKey, number> = {
  isolation: 20000, chauffage: 12000, fenetres: 5000, ventilation: 3000, autre: 0,
};
const CEE_BASE: Record<WorkTypeKey, number> = {
  isolation: 1200, chauffage: 800, fenetres: 300, ventilation: 200, autre: 0,
};
const ECO_PTZ_MAX = 50000;

interface AidesResult {
  maprime: number;
  cee: number;
  eco_ptz_eligible: boolean;
  total: number;
  reste: number;
}

function computeAides(workType: WorkTypeKey, income: IncomeBracket, cost: number): AidesResult {
  const rate    = MAPRIME_RATES[workType][income];
  const cap     = MAPRIME_CAP[workType];
  const maprime = Math.min(Math.round(cost * rate), cap);
  const cee     = CEE_BASE[workType];
  const eligible = workType !== 'autre';
  const total   = maprime + cee;
  return { maprime, cee, eco_ptz_eligible: eligible, total, reste: Math.max(0, cost - total) };
}

function AidesTravaux() {
  const [step,     setStep]     = useState<1 | 2>(1);
  const [workType, setWorkType] = useState<WorkTypeKey | null>(null);
  const [income,   setIncome]   = useState<IncomeBracket | null>(null);
  const [cost,     setCost]     = useState('');
  const [result,   setResult]   = useState<AidesResult | null>(null);

  function calculate() {
    const c = parseFloat(cost.replace(/\s/g, '').replace(',', '.'));
    if (!workType || !income || isNaN(c) || c <= 0) return;
    setResult(computeAides(workType, income, c));
    setStep(2);
  }

  const costNum = parseFloat(cost.replace(/\s/g, '').replace(',', '.'));
  const canCalc = workType !== null && income !== null && !isNaN(costNum) && costNum > 0;

  if (step === 2 && result) {
    const wt = WORK_TYPES.find(w => w.key === workType);
    const inc = INCOME_BRACKETS.find(b => b.key === income);
    return (
      <div className="space-y-4">
        {/* En-tête résultats */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-700">
              {wt?.emoji} {wt?.label} · {fmtEur(costNum)} · {inc?.label}
            </p>
            <p className="text-[10px] text-gray-400">Simulation indicative 2025</p>
          </div>
          <button
            onClick={() => { setStep(1); setResult(null); }}
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" /> Modifier
          </button>
        </div>

        {/* Cartes aides */}
        <div className="space-y-3">
          {/* MaPrimeRénov' */}
          <div className={`rounded-xl border p-4 ${result.maprime > 0 ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-base">🟢</span>
                <span className={`text-xs font-bold ${result.maprime > 0 ? 'text-green-800' : 'text-gray-400'}`}>
                  MaPrimeRénov'
                </span>
                {result.maprime > 0 && (
                  <span className="text-[10px] font-semibold bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full">
                    Éligible
                  </span>
                )}
              </div>
              <span className={`text-base font-extrabold tabular-nums ${result.maprime > 0 ? 'text-green-700' : 'text-gray-300'}`}>
                {result.maprime > 0 ? `jusqu'à ${fmtEur(result.maprime)}` : 'Non éligible'}
              </span>
            </div>
            <p className="text-[10px] text-gray-500 leading-relaxed ml-7">
              {result.maprime > 0
                ? `Subvention de l'État — taux ${Math.round(MAPRIME_RATES[workType!][income!] * 100)} % du coût HT éligible, plafonné à ${fmtEur(MAPRIME_CAP[workType!])}.`
                : "Ce type de travaux n'est pas éligible à MaPrimeRénov' pour cette tranche de revenu."}
            </p>
          </div>

          {/* CEE */}
          <div className={`rounded-xl border p-4 ${result.cee > 0 ? 'bg-yellow-50 border-yellow-100' : 'bg-gray-50 border-gray-100'}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-base">💡</span>
                <span className={`text-xs font-bold ${result.cee > 0 ? 'text-yellow-800' : 'text-gray-400'}`}>
                  CEE (Certificats d'Économie d'Énergie)
                </span>
                {result.cee > 0 && (
                  <span className="text-[10px] font-semibold bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded-full">
                    Cumulable
                  </span>
                )}
              </div>
              <span className={`text-base font-extrabold tabular-nums ${result.cee > 0 ? 'text-yellow-700' : 'text-gray-300'}`}>
                {result.cee > 0 ? `~${fmtEur(result.cee)}` : '—'}
              </span>
            </div>
            <p className="text-[10px] text-gray-500 leading-relaxed ml-7">
              {result.cee > 0
                ? 'Prime versée par les fournisseurs d\'énergie. Cumulable avec MaPrimeRénov\'. Montant indicatif.'
                : "Ce type de travaux n'est pas concerné par les CEE."}
            </p>
          </div>

          {/* Éco-PTZ */}
          <div className={`rounded-xl border p-4 ${result.eco_ptz_eligible ? 'bg-violet-50 border-violet-100' : 'bg-gray-50 border-gray-100'}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-base">🏠</span>
                <span className={`text-xs font-bold ${result.eco_ptz_eligible ? 'text-violet-800' : 'text-gray-400'}`}>
                  Éco-PTZ
                </span>
                {result.eco_ptz_eligible && (
                  <span className="text-[10px] font-semibold bg-violet-200 text-violet-800 px-1.5 py-0.5 rounded-full">
                    Sans intérêts
                  </span>
                )}
              </div>
              <span className={`text-base font-extrabold tabular-nums ${result.eco_ptz_eligible ? 'text-violet-700' : 'text-gray-300'}`}>
                {result.eco_ptz_eligible ? `jusqu'à ${fmtEur(ECO_PTZ_MAX)}` : 'Non éligible'}
              </span>
            </div>
            <p className="text-[10px] text-gray-500 leading-relaxed ml-7">
              {result.eco_ptz_eligible
                ? 'Prêt à taux 0 % pour financer le reste à charge. Durée jusqu\'à 20 ans. Cumulable avec les aides.'
                : "Ce type de travaux n'est pas éligible à l'Éco-PTZ."}
            </p>
          </div>
        </div>

        {/* Récapitulatif */}
        <div className="bg-blue-600 rounded-2xl p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-3">Votre gain estimé</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-[10px] opacity-70 mb-0.5">Aides directes</p>
              <p className="text-xl font-extrabold">{fmtEur(result.total)}</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-[10px] opacity-70 mb-0.5">Reste à charge</p>
              <p className="text-xl font-extrabold">{fmtEur(result.reste)}</p>
            </div>
          </div>
          {result.eco_ptz_eligible && (
            <p className="text-[11px] opacity-80 text-center">
              + Éco-PTZ jusqu'à {fmtEur(ECO_PTZ_MAX)} sans intérêts pour financer le reste
            </p>
          )}
        </div>

        <p className="text-[10px] text-gray-400 text-center leading-relaxed border-t border-gray-50 pt-3">
          Simulation indicative. Montants soumis à conditions (artisan RGE, ancienneté du logement ≥ 2 ans, résidence principale, etc.).
          Consultez un conseiller France Rénov' pour une estimation personnalisée.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-green-50 border border-green-100 rounded-2xl px-4 py-3.5">
        <p className="text-xs font-bold text-green-700 mb-1">🏠 Simulateur d'aides travaux 2025</p>
        <p className="text-xs text-green-700 leading-relaxed">
          Estimez vos droits à MaPrimeRénov', CEE et Éco-PTZ en quelques secondes.
        </p>
      </div>

      {/* 1. Type de travaux */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-600">1. Type de travaux</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {WORK_TYPES.map(wt => (
            <button
              key={wt.key}
              onClick={() => setWorkType(wt.key)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
                workType === wt.key
                  ? 'bg-blue-50 border-blue-300 text-blue-800 font-semibold shadow-sm'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-blue-200 hover:bg-blue-50/50'
              }`}
            >
              <span className="text-base">{wt.emoji}</span>
              <span className="text-xs font-medium leading-tight">{wt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Revenus */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-600">2. Revenus du foyer (revenu fiscal de référence)</p>
        <div className="space-y-1.5">
          {INCOME_BRACKETS.map(b => (
            <button
              key={b.key}
              onClick={() => setIncome(b.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                income === b.key
                  ? 'bg-blue-50 border-blue-300 shadow-sm'
                  : 'bg-white border-gray-200 hover:border-blue-200 hover:bg-blue-50/50'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                income === b.key ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
              }`}>
                {income === b.key && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <div>
                <p className={`text-xs font-semibold ${income === b.key ? 'text-blue-800' : 'text-gray-700'}`}>{b.label}</p>
                <p className="text-[10px] text-gray-400">{b.sublabel}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Coût estimé */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-600">3. Coût estimé des travaux</p>
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
          <input
            type="text"
            inputMode="decimal"
            value={cost}
            onChange={e => setCost(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canCalc) calculate(); }}
            placeholder="ex : 15 000"
            className="flex-1 bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-300 placeholder:font-normal"
          />
          <span className="text-xs font-bold text-gray-400 shrink-0">€</span>
        </div>
      </div>

      <button
        onClick={calculate}
        disabled={!canCalc}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        <ChevronRight className="h-4 w-4" />
        Calculer mes aides
      </button>
    </div>
  );
}

// ── Simulateur crédit travaux ─────────────────────────────────────────────────

function SliderField({ label, value, min, max, step, onChange, display }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
        <span className="text-sm font-extrabold text-blue-700 tabular-nums bg-blue-50 px-2.5 py-1 rounded-lg">{display}</span>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="absolute w-full h-2 rounded-full bg-gray-200" />
        <div
          className="absolute h-2 rounded-full bg-blue-500 pointer-events-none"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="relative w-full h-2 appearance-none bg-transparent cursor-pointer"
          style={{ WebkitAppearance: 'none' }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-300 font-medium">
        <span>{min}{label.includes('Taux') ? ' %' : label.includes('Durée') ? ' mois' : ' €'}</span>
        <span>{max}{label.includes('Taux') ? ' %' : label.includes('Durée') ? ' mois' : ' €'}</span>
      </div>
    </div>
  );
}

function CreditSimulator() {
  const [montant, setMontant] = useState('');
  const [duree,   setDuree]   = useState(120);
  const [taux,    setTaux]    = useState(3.5);

  const result = useMemo(() => {
    const M = parseFloat(montant);
    const n = duree;
    const t = taux / 100;
    if (!M || M <= 0 || n <= 0) return null;
    if (t === 0) {
      const mensualite = M / n;
      return { mensualite, coutTotal: M, interets: 0 };
    }
    const r = t / 12;
    const mensualite = M * r / (1 - Math.pow(1 + r, -n));
    const coutTotal  = mensualite * n;
    return { mensualite, coutTotal, interets: coutTotal - M };
  }, [montant, duree, taux]);

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3.5">
        <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">🏦 Simulateur crédit travaux</p>
        <p className="text-xs text-blue-700 leading-relaxed">
          Estimez vos mensualités pour financer votre reste à charge par emprunt.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Montant à financer</label>
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
          <input
            type="number"
            value={montant}
            onChange={e => setMontant(e.target.value)}
            placeholder="ex : 30 000"
            min="1000"
            className="flex-1 bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-300 placeholder:font-normal"
          />
          <span className="text-xs font-bold text-gray-400 shrink-0">€</span>
        </div>
      </div>

      <SliderField
        label="Durée de remboursement"
        value={duree} min={1} max={360} step={1}
        onChange={setDuree} display={`${duree} mois`}
      />
      <SliderField
        label="Taux annuel"
        value={taux} min={0.5} max={12} step={0.1}
        onChange={setTaux} display={`${taux.toFixed(1)} %`}
      />

      {result ? (
        <div className="grid grid-cols-1 gap-3">
          <div className="bg-blue-600 rounded-2xl p-5 text-center text-white">
            <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">Mensualité estimée</p>
            <p className="text-4xl font-extrabold leading-none">{fmtEurPrecis(result.mensualite)}</p>
            <p className="text-xs opacity-60 mt-1">par mois pendant {duree} mois</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Coût total</p>
              <p className="text-lg font-extrabold text-gray-900">{fmtEur(result.coutTotal)}</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1">Intérêts</p>
              <p className="text-lg font-extrabold text-amber-700">{fmtEur(result.interets)}</p>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 text-center leading-relaxed border-t border-gray-50 pt-3">
            Simulation indicative. Consultez votre banque ou un courtier pour une offre personnalisée.
          </p>
        </div>
      ) : (
        <div className="text-center py-6">
          <CreditCard className="h-8 w-8 text-gray-200 mx-auto mb-2" />
          <p className="text-xs text-gray-400">Saisissez le montant pour simuler votre emprunt</p>
        </div>
      )}
    </div>
  );
}

// ── Onglet financement complet ────────────────────────────────────────────────

function FinancementTab() {
  const [sub, setSub] = useState<'aides' | 'credit'>('aides');
  return (
    <div className="space-y-4">
      {/* Sous-nav */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
        <button
          onClick={() => setSub('aides')}
          className={`flex-1 text-xs font-semibold px-3 py-2 rounded-lg transition-all ${
            sub === 'aides' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🏠 Aides travaux
        </button>
        <button
          onClick={() => setSub('credit')}
          className={`flex-1 text-xs font-semibold px-3 py-2 rounded-lg transition-all ${
            sub === 'credit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🏦 Crédit travaux
        </button>
      </div>

      {sub === 'aides'  && <AidesTravaux />}
      {sub === 'credit' && <CreditSimulator />}
    </div>
  );
}

// ── Composant principal exporté ───────────────────────────────────────────────

interface TresoreeriePanelProps {
  chantierId: string;
  token: string;
  budgetMax?: number;
}

export default function TresoreriePanel({ chantierId, token, budgetMax: budgetMaxProp = 0 }: TresoreeriePanelProps) {
  const [tab, setTab] = useState<Tab>('timeline');
  // Override utilisateur sur l'enveloppe max (null = utilise la valeur IA)
  const [budgetOverride, setBudgetOverride] = useState<number | null>(null);
  const effectiveBudget = budgetOverride ?? budgetMaxProp;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-gray-50">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </div>
          <h2 className="font-bold text-gray-900 text-base">Budget & Trésorerie</h2>
        </div>
        <TabBar active={tab} onChange={setTab} />
      </div>

      <div className="p-5">
        {tab === 'timeline'    && <PaymentTimeline chantierId={chantierId} token={token} />}
        {tab === 'cashflow'    && (
          <CashflowTab
            chantierId={chantierId}
            token={token}
            budgetMax={effectiveBudget}
            onBudgetOverride={setBudgetOverride}
          />
        )}
        {tab === 'financement' && <FinancementTab />}
      </div>
    </div>
  );
}
