/**
 * VersementsDrawer — gestion des versements pour un artisan.
 *
 * Source de vérité : cashflow_terms du document source (devis ou facture).
 * Les versements créés ici apparaissent dans payment_events_v branche 2
 * et sont comptés dans la colonne "Payé" du Budget.
 *
 * Fix 2026-04-30 :
 * - Loading loop corrigé : useRef pour les props instables, loadEvents stable
 * - Authorization header corrigé : "Bearer ${token}"
 * - Variant addToDocument pour lier les versements au document source
 */
import { useState, useEffect, useCallback, useRef } from 'react';
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

// Options statut facture (ordre affiché dans le drawer)
const FACTURE_STATUT_OPTS = [
  { value: 'recue',               label: 'Reçue — à payer',    cls: 'bg-amber-50 text-amber-700 border-amber-300' },
  { value: 'payee_partiellement', label: 'Acompte versé',       cls: 'bg-blue-50 text-blue-700 border-blue-300' },
  { value: 'en_litige',           label: 'En litige',           cls: 'bg-red-50 text-red-700 border-red-300' },
  { value: 'payee',               label: 'Payée intégralement', cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
] as const;

interface VersementsDrawerProps {
  chantierId:          string;
  token:               string;
  artisanNom:          string;
  budget:              number;          // montant engagé artisan (plafond)
  sourceIds:           string[];        // IDs des devis + facture de cet artisan
  knownEventIds:       string[];        // IDs des payment_events déjà connus
  /** Document cible pour les nouveaux versements (cashflow_terms) */
  primaryDocumentId?:  string;
  primaryDocumentType?: 'devis' | 'facture';
  /**
   * Montant legacy issu de documents_chantier.montant_paye (ancien système inline).
   * Affiché comme entrée synthétique si aucun cashflow_terms n'existe encore.
   * Migration automatique côté serveur lors du premier addVersement.
   */
  legacyMontantPaye?:  number;
  /** Statut courant de la facture (si drawer ouvert depuis une facture) */
  factureStatut?:      string;
  /** Callback pour changer le statut de la facture depuis le drawer */
  onStatutChange?:     (statut: string) => void;
  /** Ouvre directement le formulaire d'ajout au montage (bouton "Paiement" rapide) */
  autoOpenForm?:       boolean;
  /** Pré-remplit le montant du formulaire (= restant dû) */
  autoFillAmount?:     number;
  /** Pré-remplit le libellé du formulaire */
  autoFillLabel?:      string;
  onClose:             () => void;
  onRefresh:           () => void;
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
  const over  = total > budget * 1.005;
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
          Dépassement de {fmtEur(total - budget)} — impossible d&apos;ajouter un versement
        </p>
      )}
    </div>
  );
}

// ── Ligne de versement ────────────────────────────────────────────────────────

interface VersementRowProps {
  ev:          PaymentEvent;
  budget:      number;
  totalOthers: number;
  onSave:      (id: string, amount: number, date: string, label: string) => Promise<void>;
  onDelete:    (id: string) => Promise<void>;
  saving:      boolean;
}

function VersementRow({ ev, budget, totalOthers, onSave, onDelete, saving }: VersementRowProps) {
  const [editing,    setEditing]    = useState(false);
  const [amount,     setAmount]     = useState(String(ev.amount ?? ''));
  const [date,       setDate]       = useState(ev.due_date?.slice(0, 10) ?? todayIso());
  const [label,      setLabel]      = useState(ev.label ?? '');
  const [confirmDel, setConfirmDel] = useState(false);

  const parsedAmount = parseFloat(amount.replace(',', '.'));
  const maxAllowed   = budget > 0 ? budget - totalOthers : Infinity;
  const isOver       = !isNaN(parsedAmount) && parsedAmount > maxAllowed * 1.005;
  const isValid      = !isNaN(parsedAmount) && parsedAmount > 0 && !isOver;

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
            {isOver && <p className="text-[10px] text-red-500 mt-0.5">Max {fmtEur(maxAllowed)}</p>}
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
      <div className="shrink-0 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-center min-w-[60px]">
        <span className="text-[11px] text-gray-500 font-medium leading-none">{fmtDate(ev.due_date)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-bold text-gray-900">{ev.amount != null ? fmtEur(ev.amount) : '—'}</p>
        {ev.label && <p className="text-[11px] text-gray-400 truncate">{ev.label}</p>}
      </div>
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
  sourceIds, knownEventIds,
  primaryDocumentId, primaryDocumentType,
  legacyMontantPaye = 0,
  factureStatut, onStatutChange,
  autoOpenForm = false,
  autoFillAmount,
  autoFillLabel,
  onClose, onRefresh,
}: VersementsDrawerProps) {
  const [events,  setEvents]  = useState<PaymentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState<string | null>(null);

  // Formulaire nouveau versement
  // autoOpenForm = true → formulaire ouvert immédiatement (bouton "Paiement" rapide)
  const [showForm,   setShowForm]   = useState(autoOpenForm);
  const [newAmount,  setNewAmount]  = useState(autoFillAmount != null && autoFillAmount > 0 ? String(autoFillAmount) : '');
  const [newDate,    setNewDate]    = useState(todayIso());
  const [newLabel,   setNewLabel]   = useState(autoFillLabel ?? '');
  const [newSaved,   setNewSaved]   = useState(false);
  const [formError,  setFormError]  = useState<string | null>(null);

  // Échéances planifiées
  const [showPending, setShowPending] = useState(false);

  // ── Stabilisation des props instables via useRef ──────────────────────────
  // NE PAS inclure sourceIds/knownEventIds dans loadEvents deps :
  // ces tableaux sont recréés à chaque render de BudgetTab → loading loop.
  // On les lit depuis un ref qui est toujours à jour.
  const propsRef = useRef({ chantierId, token, sourceIds, knownEventIds });
  propsRef.current = { chantierId, token, sourceIds, knownEventIds };

  // refreshKey = seul déclencheur explicite de loadEvents (après mutation)
  const [refreshKey, setRefreshKey] = useState(0);
  const reload = useCallback(() => setRefreshKey(k => k + 1), []);

  // ── loadEvents stable — jamais de loop ───────────────────────────────────
  const loadEvents = useCallback(async () => {
    const { chantierId, token, sourceIds, knownEventIds } = propsRef.current;
    setLoading(true);
    try {
      const bearer = await freshToken(token);
      const res = await fetch(`/api/chantier/${chantierId}/payment-events`, {
        // ⚠️ Toujours "Bearer " — sans préfixe = 401 silencieux
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const all: PaymentEvent[] = json.payment_events ?? [];
      // Filtrer : events liés aux devis de cet artisan OU events manuels connus
      const relevant = all.filter(e =>
        (e.source_id && sourceIds.includes(e.source_id)) ||
        knownEventIds.includes(e.id),
      );
      setEvents(relevant);
    } catch (err) {
      console.error('[VersementsDrawer] loadEvents error:', err instanceof Error ? err.message : err);
    }
    setLoading(false);
  }, []); // stable — lit les props via propsRef

  // Mount + refreshes manuels seulement (plus de loop sur props)
  useEffect(() => { loadEvents(); }, [loadEvents, refreshKey]);

  const paidEvents    = events.filter(e => e.status === 'paid').sort((a, b) =>
    (a.due_date ?? '').localeCompare(b.due_date ?? ''),
  );
  const pendingEvents = events.filter(e => e.status === 'pending').sort((a, b) =>
    (a.due_date ?? '').localeCompare(b.due_date ?? ''),
  );
  const cashflowTotal = paidEvents.reduce((s, e) => s + (e.amount ?? 0), 0);
  // Si aucun cashflow_term payé mais legacy montant_paye > 0 → inclure dans totalVerse
  // (la migration vers cashflow_terms se fera automatiquement au prochain addVersement)
  const totalVerse = cashflowTotal > 0
    ? cashflowTotal
    : legacyMontantPaye > 0 ? legacyMontantPaye : 0;

  const parsedNew  = parseFloat(newAmount.replace(',', '.'));
  const maxNew     = budget > 0 ? Math.max(0, budget - totalVerse) : Infinity;
  const newIsOver  = !isNaN(parsedNew) && parsedNew > maxNew * 1.005;
  const newIsValid = !isNaN(parsedNew) && parsedNew > 0 && !newIsOver && !!newDate;

  // ── Ajouter un versement ──────────────────────────────────────────────────
  async function addVersement() {
    if (!newIsValid) return;
    setFormError(null);
    setSaving('new');
    try {
      const bearer = await freshToken(token);
      const label  = newLabel.trim() || `Versement — ${artisanNom}`;

      let body: Record<string, unknown>;

      if (primaryDocumentId && primaryDocumentType) {
        // Versement lié au document source → cashflow_terms → visible dans Budget
        body = {
          addToDocument: true,
          documentId:    primaryDocumentId,
          documentType:  primaryDocumentType,
          paid:          true,
          label,
          amount:        parsedNew,
          dueDate:       newDate,
        };
      } else {
        // Versement flottant (sans document) → cashflow_extras → Échéancier seulement
        body = {
          manuel: true,
          paid:   true,
          label,
          amount: parsedNew,
          dueDate: newDate,
        };
      }

      const res = await fetch(`/api/chantier/${chantierId}/payment-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setFormError(json.error ?? 'Erreur lors de l\'enregistrement');
        setSaving(null);
        return;
      }

      setNewAmount('');
      setNewLabel('');
      setNewDate(todayIso());
      setShowForm(false);
      setNewSaved(true);
      reload();        // rafraîchit la liste interne
      onRefresh();     // rafraîchit le Budget du parent
    } catch (err) {
      setFormError('Erreur réseau. Réessayez.');
      console.error('[VersementsDrawer] addVersement error:', err instanceof Error ? err.message : err);
    }
    setSaving(null);
  }

  // ── Modifier un versement ─────────────────────────────────────────────────
  async function editVersement(id: string, amount: number, date: string, label: string) {
    setSaving(id);
    try {
      const bearer = await freshToken(token);
      const res = await fetch(`/api/chantier/${chantierId}/payment-events`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ id, amount, due_date: date, label }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        console.error('[VersementsDrawer] editVersement error:', json.error);
      }
      reload();
      onRefresh();
    } catch (err) {
      console.error('[VersementsDrawer] editVersement error:', err instanceof Error ? err.message : err);
    }
    setSaving(null);
  }

  // ── Supprimer un versement ────────────────────────────────────────────────
  async function deleteVersement(id: string) {
    setSaving(id);
    try {
      const bearer = await freshToken(token);
      const res = await fetch(`/api/chantier/${chantierId}/payment-events`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        console.error('[VersementsDrawer] deleteVersement error:', json.error);
      }
      reload();
      onRefresh();
    } catch (err) {
      console.error('[VersementsDrawer] deleteVersement error:', err instanceof Error ? err.message : err);
    }
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
            {primaryDocumentType && (
              <p className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-1">
                <Check className="h-3 w-3 shrink-0" />
                Comptabilisé dans le budget
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Statut de paiement — sélecteur (si facture) */}
        {factureStatut !== undefined && onStatutChange && (
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Statut</p>
            <div className="flex flex-wrap gap-1.5">
              {FACTURE_STATUT_OPTS.map(opt => {
                const isActive = factureStatut === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => onStatutChange(opt.value)}
                    className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-all ${
                      isActive ? opt.cls : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                    }`}
                  >
                    {isActive && <Check className="h-3 w-3 shrink-0" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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

                {/* Versement initial enregistré avant le nouveau système */}
                {paidEvents.length === 0 && legacyMontantPaye > 0 && (
                  <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
                    <div className="shrink-0 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-center min-w-[60px]">
                      <span className="text-[11px] text-gray-400 font-medium leading-none">—</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-gray-900">{fmtEur(legacyMontantPaye)}</p>
                      <p className="text-[11px] text-gray-400">Versement enregistré</p>
                    </div>
                  </div>
                )}

                {paidEvents.length === 0 && legacyMontantPaye === 0 ? (
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
                      Facture acompte, preuve de virement… Joignez le document depuis l&apos;onglet Documents.
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
                    onClick={() => { setShowForm(true); setNewSaved(false); setFormError(null); }}
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
                          <p className="text-[10px] text-gray-400 mt-0.5">Restant : {fmtEur(maxNew)}</p>
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

                    {formError && (
                      <p className="text-[11px] text-red-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {formError}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <p className="text-[10px] text-gray-400 flex items-center gap-1 flex-1">
                        <Paperclip className="h-3 w-3" />
                        Pensez à joindre un justificatif après
                      </p>
                      <button
                        onClick={() => { setShowForm(false); setNewAmount(''); setNewLabel(''); setNewDate(todayIso()); setFormError(null); }}
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
