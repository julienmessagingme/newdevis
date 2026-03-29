import { useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  AlertTriangle, CheckCircle2, Clock, Calendar,
  Loader2, RefreshCw, AlertCircle, Check, X, RotateCcw,
  Info, Paperclip, Upload, ExternalLink,
} from 'lucide-react';
import { usePaymentEvents } from '@/hooks/usePaymentEvents';
import { fmtEur, fmtDateFR, fmtDateShort, daysUntil } from '@/lib/financingUtils';

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

export const STATUS_CFG = {
  paid:      { dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', label: 'Payé ✓',    icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> },
  late:      { dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700 border-red-100',             label: 'En retard', icon: <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> },
  pending:   { dot: 'bg-blue-400',    badge: 'bg-blue-50 text-blue-700 border-blue-100',           label: 'À venir',   icon: <Clock className="h-3.5 w-3.5 text-blue-500" /> },
  cancelled: { dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-400 border-gray-100',           label: 'Annulé',    icon: null },
};

export default function PaymentTimeline({
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
        <button type="button" onClick={refresh}
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
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmingId(ev.id); }}
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
                            type="button"
                            onClick={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setConfirmingId(null);
                              const ok = await markPaid(ev.id);
                              if (ok) setProofPromptId(ev.id);
                            }}
                            className="flex items-center gap-1 text-xs font-bold bg-emerald-600 text-white rounded-lg px-2.5 py-1.5 hover:bg-emerald-700 transition-colors"
                          >
                            <Check className="h-3 w-3" /> Oui, payé
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmingId(null); }}
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
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); markUnpaid(ev.id); }}
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

      <button type="button" onClick={refresh}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 py-2 transition-colors">
        <RefreshCw className="h-3 w-3" /> Actualiser
      </button>
    </div>
  );
}
