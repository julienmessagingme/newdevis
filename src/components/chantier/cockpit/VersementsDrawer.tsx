/**
 * VersementsDrawer — gestion des acomptes versés pour un artisan.
 *
 * Affiche : liste datée des versements, total vs plafond, ajout/modif/suppression.
 * Règle métier : total cumulé des versements ≤ montant engagé (bloquant).
 */
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  X, Plus, Pencil, Trash2, Check, Loader2,
  AlertTriangle, Paperclip, ChevronDown, ChevronUp,
} from 'lucide-react';
import { fmtEur } from '@/lib/financingUtils';

const _sb = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL,
  (import.meta as any).env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
async function freshToken(fallback: string): Promise<string> {
  const { data: { session } } = await _sb.auth.getSession();
  return session?.access_token ?? fallback;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PaymentEvent {
  id:               string;
  label:            string | null;
  amount:           number | null;
  due_date:         string | null;
  status:           string;
  source_type:      string | null;
  source_id:        string | null;
  proof_doc_id:     string | null;
  proof_doc_name:   string | null;
  proof_signed_url: string | null;
}

interface VersementsDrawerProps {
  chantierId:   string;
  token:        string;
  artisanNom:   string;
  budget:       number;          // montant engagé artisan (plafond)
  sourceIds:    string[];        // IDs des devis de cet artisan
  knownEventIds: string[];       // IDs des payment_events déjà connus (manuel sans source_id)
  onClose:      () => void;
  onRefresh:    () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Barre de progression ───────────────────────────────────────────────────────

function BudgetBar({ total, budget }: { total: number; budget: number }) {
  if (budget <= 0) return null;
  const pct = Math.min(100, Math.round(total / budget * 100));
  const over = total > budget * 1.005;
  const close = !over && pct >= 90;
  const color = over ? 'bg-red-500' : close ? 'bg-orange-400' : 'bg-indigo-500';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[11px]">
        <span className={over ? 'text-red-600 font-semibold' : 'text-gray-500'}>
          {fmtEur(total)} versés
        </span>
        <span className="text-gray-400">sur {fmtEur(budget)} engagés</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {over && (
        <p className="text-[10px] text-red-500 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Dépassement de {fmtEur(total - budget)} — impossible d'ajouter un versement supplémentaire
        </p>
      )}
    </div>
  );
}

// ── Ligne de versement ────────────────────────────────────────────────────────

interface VersementRowProps {
  ev:           PaymentEvent;
  budget:       number;
  totalOthers:  number; // total des autres versements (pour valider plafond à l'édition)
  onSave:       (id: string, amount: number, date: string, label: string) => Promise<void>;
  onDelete:     (id: string) => Promise<void>;
  saving:       boolean;
}

function VersementRow({ ev, budget, totalOthers, onSave, onDelete, saving }: VersementRowProps) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount]   = useState(String(ev.amount ?? ''));
  const [date, setDate]       = useState(ev.due_date?.slice(0, 10) ?? todayIso());
  const [label, setLabel]     = useState(ev.label ?? '');
  const [confirmDel, setConfirmDel] = useState(false);

  const parsedAmount = parseFloat(amount.replace(',', '.'));
  const maxAllowed = budget > 0 ? budget - totalOthers : Infinity;
  const isOver = !isNaN(parsedAmount) && parsedAmount > maxAllowed * 1.005;
  const isValid = !isNaN(parsedAmount) && parsedAmount > 0 && !isOver;

  function cancelEdit() {
    setEditing(false);
    setAmount(String(ev.amount ?? ''));
    setDate(ev.due_date?.slice(0, 10) ?? todayIso());
    setLabel(ev.label ?? '');
  }

  async function handleSave() {
    if (!isValid) return;
    await onSave(ev.id, parsedAmount, date, label);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-500 font-medium">Montant (€)</label>
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className={`mt-0.5 w-full border rounded-lg px-2 py-1.5 text-sm font-semibold outline-none ${isOver ? 'border-red-400 text-red-700 bg-red-50' : 'border-indigo-300 text-gray-900'}`}
            />
            {isOver && (
              <p className="text-[10px] text-red-500 mt-0.5">Max {fmtEur(maxAllowed)}</p>
            )}
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-medium">Date du versement</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="mt-0.5 w-full border border-indigo-300 rounded-lg px-2 py-1.5 text-sm outline-none"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 font-medium">Libellé (optionnel)</label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="ex : 1er acompte, solde..."
            className="mt-0.5 w-full border border-indigo-300 rounded-lg px-2 py-1.5 text-sm outline-none"
          />
        </div>
        <div className="flex items-center gap-2 justify-end">
          <button onClick={cancelEdit} className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg border border-gray-200">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-40 flex items-center gap-1"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Enregistrer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
      {/* Date badge */}
      <div className="shrink-0 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-center min-w-[60px]">
        <span className="text-[11px] text-gray-500 font-medium leading-none">{fmtDate(ev.due_date)}</span>
      </div>

      {/* Amount + label */}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-bold text-gray-900">{ev.amount != null ? fmtEur(ev.amount) : '—'}</p>
        {ev.label && <p className="text-[11px] text-gray-400 truncate">{ev.label}</p>}
      </div>

      {/* Justificatif */}
      {ev.proof_signed_url ? (
        <a
          href={ev.proof_signed_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1 hover:bg-emerald-100 transition-colors"
          title={ev.proof_doc_name ?? 'Justificatif'}
        >
          <Paperclip className="h-3 w-3" /> Justificatif
        </a>
      ) : (
        <span className="shrink-0 text-[10px] text-gray-300 flex items-center gap-1">
          <Paperclip className="h-3 w-3" /> Aucun
        </span>
      )}

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1">
        <button
          onClick={() => setEditing(true)}
          className="p-1.5 rounded-lg text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
          title="Modifier"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {confirmDel ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onDelete(ev.id)}
              disabled={saving}
              className="text-[10px] font-semibold text-red-600 px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100"
            >
              Confirmer
            </button>
            <button onClick={() => setConfirmDel(false)} className="text-[10px] text-gray-400 px-2 py-1 rounded-lg hover:bg-gray-50">
              Annuler
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDel(true)}
            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Supprimer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Drawer principal ──────────────────────────────────────────────────────────

export default function VersementsDrawer({
  chantierId, token, artisanNom, budget,
  sourceIds, knownEventIds, onClose, onRefresh,
}: VersementsDrawerProps) {
  const [events,  setEvents]  = useState<PaymentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState<string | null>(null); // event ID or 'new'

  // Formulaire nouveau versement
  const [showForm, setShowForm]   = useState(false);
  const [newAmount, setNewAmount] = useState('');
  const [newDate,   setNewDate]   = useState(todayIso());
  const [newLabel,  setNewLabel]  = useState('');
  const [newSaved,  setNewSaved]  = useState(false); // pour inciter au justificatif

  // Pending events (échéances planifiées)
  const [showPending, setShowPending] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const bearer = await freshToken(token);
      const res = await fetch(`/api/chantier/${chantierId}/payment-events`, {
        headers: { Authorization: bearer },
      });
      const json = await res.json();
      const all: PaymentEvent[] = json.payment_events ?? [];
      // Filtrer : events liés à un devis de cet artisan OU events connus (manuels)
      const relevant = all.filter(e =>
        (e.source_id && sourceIds.includes(e.source_id)) ||
        knownEventIds.includes(e.id)
      );
      setEvents(relevant);
    } catch { /* silencieux */ }
    setLoading(false);
  }, [chantierId, token, sourceIds, knownEventIds]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const paidEvents    = events.filter(e => e.status === 'paid').sort((a, b) =>
    (a.due_date ?? '').localeCompare(b.due_date ?? '')
  );
  const pendingEvents = events.filter(e => e.status === 'pending').sort((a, b) =>
    (a.due_date ?? '').localeCompare(b.due_date ?? '')
  );
  const totalVerse = paidEvents.reduce((s, e) => s + (e.amount ?? 0), 0);

  const parsedNew = parseFloat(newAmount.replace(',', '.'));
  const maxNew = budget > 0 ? Math.max(0, budget - totalVerse) : Infinity;
  const newIsOver = !isNaN(parsedNew) && parsedNew > maxNew * 1.005;
  const newIsValid = !isNaN(parsedNew) && parsedNew > 0 && !newIsOver && newDate;

  async function addVersement() {
    if (!newIsValid) return;
    setSaving('new');
    try {
      const bearer = await freshToken(token);
      await fetch(`/api/chantier/${chantierId}/payment-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: bearer },
        body: JSON.stringify({
          manuel: true,
          paid: true,
          label: newLabel.trim() || `Versement — ${artisanNom}`,
          amount: parsedNew,
          dueDate: newDate,
        }),
      });
      setNewAmount('');
      setNewLabel('');
      setNewDate(todayIso());
      setShowForm(false);
      setNewSaved(true);
      await loadEvents();
      onRefresh();
    } catch { /* silencieux */ }
    setSaving(null);
  }

  async function editVersement(id: string, amount: number, date: string, label: string) {
    setSaving(id);
    try {
      const bearer = await freshToken(token);
      await fetch(`/api/chantier/${chantierId}/payment-events`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: bearer },
        body: JSON.stringify({ id, amount, due_date: date, label }),
      });
      await loadEvents();
      onRefresh();
    } catch { /* silencieux */ }
    setSaving(null);
  }

  async function deleteVersement(id: string) {
    setSaving(id);
    try {
      const bearer = await freshToken(token);
      await fetch(`/api/chantier/${chantierId}/payment-events`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: bearer },
        body: JSON.stringify({ id }),
      });
      await loadEvents();
      onRefresh();
    } catch { /* silencieux */ }
    setSaving(null);
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[420px] bg-white shadow-2xl z-50 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Versements</p>
            <h3 className="text-[15px] font-bold text-gray-900 truncate max-w-[280px]">{artisanNom}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Budget bar */}
        <div className="px-5 py-3 border-b border-gray-50">
          <BudgetBar total={totalVerse} budget={budget} />
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 text-indigo-400 animate-spin" />
            </div>
          ) : (
            <>
              {/* ── Versements effectués ─────────────────────────────────── */}
              <div className="px-5 pt-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Versements effectués {paidEvents.length > 0 && `(${paidEvents.length})`}
                </p>

                {paidEvents.length === 0 ? (
                  <p className="text-[13px] text-gray-300 text-center py-6">Aucun versement enregistré</p>
                ) : (
                  paidEvents.map(ev => (
                    <VersementRow
                      key={ev.id}
                      ev={ev}
                      budget={budget}
                      totalOthers={paidEvents.filter(e => e.id !== ev.id).reduce((s, e) => s + (e.amount ?? 0), 0)}
                      onSave={editVersement}
                      onDelete={deleteVersement}
                      saving={saving === ev.id}
                    />
                  ))
                )}
              </div>

              {/* ── Prompt justificatif après ajout ─────────────────────── */}
              {newSaved && (
                <div className="mx-5 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  <Paperclip className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[12px] font-semibold text-amber-800">Pensez à joindre un justificatif</p>
                    <p className="text-[11px] text-amber-600 mt-0.5">
                      Facture acompte, preuve de virement… Joignez le document depuis l'onglet Documents.
                    </p>
                  </div>
                  <button onClick={() => setNewSaved(false)} className="text-amber-300 hover:text-amber-500">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* ── Ajouter un versement ─────────────────────────────────── */}
              <div className="px-5 mt-4">
                {!showForm ? (
                  <button
                    onClick={() => { setShowForm(true); setNewSaved(false); }}
                    disabled={budget > 0 && totalVerse >= budget * 1.005}
                    className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold text-indigo-600 border border-indigo-200 rounded-xl py-3 hover:bg-indigo-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="h-4 w-4" /> Ajouter un versement
                  </button>
                ) : (
                  <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 flex flex-col gap-3">
                    <p className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wide">Nouveau versement</p>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-gray-500 font-medium">Montant (€) *</label>
                        <input
                          autoFocus
                          type="number"
                          inputMode="decimal"
                          value={newAmount}
                          onChange={e => setNewAmount(e.target.value)}
                          placeholder="0"
                          className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm font-semibold outline-none ${newIsOver ? 'border-red-400 text-red-700 bg-red-50' : 'border-indigo-300'}`}
                        />
                        {newIsOver && (
                          <p className="text-[10px] text-red-500 mt-0.5">Max {fmtEur(maxNew)}</p>
                        )}
                        {budget > 0 && !newIsOver && maxNew < budget && (
                          <p className="text-[10px] text-gray-400 mt-0.5">Restant possible : {fmtEur(maxNew)}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 font-medium">Date *</label>
                        <input
                          type="date"
                          value={newDate}
                          onChange={e => setNewDate(e.target.value)}
                          className="mt-1 w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-gray-500 font-medium">Libellé (optionnel)</label>
                      <input
                        type="text"
                        value={newLabel}
                        onChange={e => setNewLabel(e.target.value)}
                        placeholder="ex : 1er acompte, solde partiel…"
                        className="mt-1 w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <p className="text-[10px] text-gray-400 flex items-center gap-1 flex-1">
                        <Paperclip className="h-3 w-3" />
                        Pensez à joindre un justificatif après la saisie
                      </p>
                      <button
                        onClick={() => { setShowForm(false); setNewAmount(''); setNewLabel(''); setNewDate(todayIso()); }}
                        className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg border border-gray-200"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={addVersement}
                        disabled={!newIsValid || saving === 'new'}
                        className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-40 flex items-center gap-1"
                      >
                        {saving === 'new' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Enregistrer
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Échéances planifiées (collapsible) ──────────────────── */}
              {pendingEvents.length > 0 && (
                <div className="px-5 mt-5 pb-4">
                  <button
                    onClick={() => setShowPending(v => !v)}
                    className="flex items-center gap-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-full"
                  >
                    {showPending ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    Échéances planifiées ({pendingEvents.length})
                  </button>
                  {showPending && (
                    <div className="mt-2 border border-dashed border-gray-200 rounded-xl px-3 py-2">
                      {pendingEvents.map(ev => (
                        <div key={ev.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                          <span className="text-[11px] text-gray-400 shrink-0">{fmtDate(ev.due_date)}</span>
                          <span className="flex-1 text-[12px] text-gray-500 truncate">{ev.label ?? '—'}</span>
                          <span className="text-[12px] font-semibold text-gray-600 shrink-0">
                            {ev.amount != null ? fmtEur(ev.amount) : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
