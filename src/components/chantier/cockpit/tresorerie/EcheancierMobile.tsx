/**
 * EcheancierMobile — vue mobile dédiée pour l'échéancier chantier.
 *
 * Design : timeline verticale chronologique, header sticky avec solde,
 * filtres en chips, FAB rond bas-droite pour ajout rapide.
 *
 * Réutilise :
 *  - usePaymentEvents (hook existant)
 *  - AddEntreeModal (exporté depuis Echeancier.tsx)
 *  - DepenseRapideModal (réutilisé depuis budget/)
 *  - API /api/chantier/[id]/entrees pour CRUD entrées
 *
 * Architecture mobile :
 *   1. Header sticky : "Solde estimé : XXX €" + 3 chips filtre
 *   2. Timeline verticale : 1 carte par événement (sortie rouge / entrée verte)
 *   3. FAB rond bas-droite : Dépense + Versement
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { Plus, X, Check, Trash2, Loader2 } from "lucide-react";
import { fmtEur } from "@/lib/chantier/financingUtils";
import { usePaymentEvents, type PaymentEvent } from "@/hooks/usePaymentEvents";
import DepenseRapideModal from "../budget/DepenseRapideModal";
import { AddEntreeModal } from "./Echeancier";
import type { LotChantier } from "@/types/chantier-ia";

const _sb = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL,
  (import.meta as any).env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
async function freshToken(fallback: string) {
  const { data: { session } } = await _sb.auth.getSession();
  return session?.access_token ?? fallback;
}

// ── Types alignés sur Echeancier.tsx ─────────────────────────────────────────

type SourceType =
  | "deblocage_credit" | "aide_maprime" | "aide_cee"
  | "eco_ptz" | "apport_personnel" | "remboursement" | "autre";
type StatutEntree = "recu" | "attendu";

interface EntreeChantier {
  id: string;
  montant: number;
  label: string;
  source_type: SourceType;
  date_entree: string;
  statut: StatutEntree;
  notes: string | null;
  created_at: string;
}

const SOURCE_EMOJI: Record<SourceType, string> = {
  deblocage_credit:  "🏦",
  aide_maprime:      "🏠",
  aide_cee:          "⚡",
  eco_ptz:           "🌱",
  apport_personnel:  "💰",
  remboursement:     "↩️",
  autre:             "📥",
};

// ── Helpers dates ─────────────────────────────────────────────────────────────

function fmtDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function isPast(iso: string | null): boolean {
  if (!iso) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(iso) < today;
}

// ── Type unifié pour la timeline ─────────────────────────────────────────────

type TimelineItem =
  | { kind: "entree"; entree: EntreeChantier; date: string }
  | { kind: "event";  event:   PaymentEvent;  date: string };

type Filter = "all" | "upcoming" | "past";

// ── Composant principal ──────────────────────────────────────────────────────

export default function EcheancierMobile({
  chantierId, token,
}: {
  chantierId: string;
  token:      string;
}) {
  const { events, loading: evLoading, refresh: refreshEvents, markPaid, markUnpaid } =
    usePaymentEvents(chantierId, token);

  const [entrees,        setEntrees]        = useState<EntreeChantier[]>([]);
  const [entreesLoading, setEntreesLoading] = useState(true);
  const [lots,           setLots]           = useState<LotChantier[]>([]);

  const [filter,         setFilter]         = useState<Filter>("all");
  const [showFab,        setShowFab]        = useState(false);
  const [showDepense,    setShowDepense]    = useState(false);
  const [showVersement,  setShowVersement]  = useState(false);

  // ── Fetch entrées ─────────────────────────────────────────────────────────
  const fetchEntrees = useCallback(async () => {
    setEntreesLoading(true);
    try {
      const bearer = await freshToken(token);
      const res = await fetch(`/api/chantier/${chantierId}/entrees`, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (res.ok) {
        const d = await res.json();
        setEntrees(d.entrees ?? []);
      }
    } finally { setEntreesLoading(false); }
  }, [chantierId, token]);

  useEffect(() => { fetchEntrees(); }, [fetchEntrees]);

  // Fetch lots lazy (à l'ouverture de DepenseRapideModal)
  useEffect(() => {
    if (!showDepense || lots.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const bearer = await freshToken(token);
        const res = await fetch(`/api/chantier/${chantierId}/lots`, {
          headers: { Authorization: `Bearer ${bearer}` },
        });
        if (!res.ok || cancelled) return;
        const d = await res.json();
        if (!cancelled) setLots(d.lots ?? []);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [showDepense, chantierId, token, lots.length]);

  // Sync inter-écrans
  useEffect(() => {
    function onChange() { refreshEvents(); fetchEntrees(); }
    window.addEventListener("chantierBudgetChanged", onChange);
    return () => window.removeEventListener("chantierBudgetChanged", onChange);
  }, [refreshEvents, fetchEntrees]);

  // ── Solde estimé ──────────────────────────────────────────────────────────
  const solde = useMemo(() => {
    const recu = entrees.filter(e => e.statut === "recu").reduce((s, e) => s + e.montant, 0);
    const paye = events.filter(e => e.status === "paid").reduce((s, e) => s + (e.amount ?? e.amount_estimate ?? 0), 0);
    return recu - paye;
  }, [entrees, events]);

  // ── Construction timeline ─────────────────────────────────────────────────
  const allItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [
      ...entrees.map<TimelineItem>(e => ({ kind: "entree", entree: e, date: e.date_entree })),
      ...events.map<TimelineItem>(e => ({ kind: "event",  event: e,  date: e.due_date || e.created_at })),
    ];
    items.sort((a, b) => a.date.localeCompare(b.date));
    return items;
  }, [entrees, events]);

  const timeline: TimelineItem[] = useMemo(() => {
    if (filter === "upcoming") return allItems.filter(it => !isPast(it.date));
    if (filter === "past")     return allItems.filter(it => isPast(it.date));
    return allItems;
  }, [allItems, filter]);

  const countUpcoming = useMemo(() => allItems.filter(it => !isPast(it.date)).length, [allItems]);
  const countPast     = useMemo(() => allItems.filter(it => isPast(it.date)).length,  [allItems]);

  // ── Actions entrées ───────────────────────────────────────────────────────
  const toggleEntreeStatut = useCallback(async (id: string, cur: StatutEntree) => {
    const bearer = await freshToken(token);
    await fetch(`/api/chantier/${chantierId}/entrees`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, statut: cur === "recu" ? "attendu" : "recu" }),
    });
    fetchEntrees();
  }, [chantierId, token, fetchEntrees]);

  const deleteEntree = useCallback(async (id: string) => {
    const bearer = await freshToken(token);
    await fetch(`/api/chantier/${chantierId}/entrees?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${bearer}` },
    });
    fetchEntrees();
  }, [chantierId, token, fetchEntrees]);

  const loading = evLoading || entreesLoading;

  return (
    <div className="flex flex-col bg-gray-50 min-h-full pb-[max(5rem,env(safe-area-inset-bottom))] relative">
      {/* Header sticky : solde + filtres */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="px-4 pt-3 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Solde estimé</p>
          <p className={`text-2xl font-black tabular-nums leading-tight ${solde >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {solde >= 0 ? "+" : ""}{fmtEur(solde)}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Reçu − payé · {entrees.filter(e => e.statut === "recu").length} versement(s) · {events.filter(e => e.status === "paid").length} paiement(s)
          </p>
        </div>
        <div className="flex gap-1.5 px-4 pb-3">
          <FilterChip active={filter === "all"}      onClick={() => setFilter("all")}      label="Tout"     count={allItems.length} />
          <FilterChip active={filter === "upcoming"} onClick={() => setFilter("upcoming")} label="À venir"  count={countUpcoming} />
          <FilterChip active={filter === "past"}     onClick={() => setFilter("past")}     label="Passé"    count={countPast} />
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        {loading && timeline.length === 0 ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2].map(i => <div key={i} className="h-16 bg-white rounded-xl animate-pulse" />)}
          </div>
        ) : timeline.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <ul className="p-4 space-y-2">
            {timeline.map(item => item.kind === "entree" ? (
              <EntreeCard
                key={`e-${item.entree.id}`}
                entree={item.entree}
                onToggle={() => toggleEntreeStatut(item.entree.id, item.entree.statut)}
                onDelete={() => deleteEntree(item.entree.id)}
              />
            ) : (
              <EventCard
                key={`p-${item.event.id}`}
                event={item.event}
                onMarkPaid={async () => { await markPaid(item.event.id); }}
                onMarkUnpaid={async () => { await markUnpaid(item.event.id); }}
              />
            ))}
          </ul>
        )}
      </div>

      {/* FAB rond bas-droite */}
      {!showFab && (
        <button
          onClick={() => setShowFab(true)}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-2xl flex items-center justify-center active:bg-indigo-700 transition-colors z-40"
          aria-label="Ajouter"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {showFab && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowFab(false)} />
          <div className="fixed bottom-[max(5rem,env(safe-area-inset-bottom))] right-4 z-50 flex flex-col gap-2.5 animate-in fade-in slide-in-from-bottom-4">
            <button
              onClick={() => { setShowFab(false); setShowVersement(true); }}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl font-bold text-sm active:bg-emerald-700"
            >
              <span className="text-lg">💰</span>
              Versement reçu
            </button>
            <button
              onClick={() => { setShowFab(false); setShowDepense(true); }}
              className="flex items-center gap-2 bg-rose-600 text-white px-4 py-3 rounded-2xl shadow-xl font-bold text-sm active:bg-rose-700"
            >
              <span className="text-lg">🧾</span>
              Dépense
            </button>
            <button
              onClick={() => setShowFab(false)}
              className="self-end bg-white text-gray-600 w-10 h-10 rounded-full shadow-lg flex items-center justify-center active:bg-gray-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      {/* Drawers */}
      {showDepense && (
        <DepenseRapideModal
          chantierId={chantierId}
          token={token}
          lots={lots}
          onClose={() => setShowDepense(false)}
          onSaved={() => { setShowDepense(false); refreshEvents(); fetchEntrees(); }}
        />
      )}

      {showVersement && (
        <AddEntreeModal
          chantierId={chantierId}
          token={token}
          onAdded={() => { fetchEntrees(); }}
          onClose={() => setShowVersement(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function FilterChip({ active, onClick, label, count }: {
  active: boolean; onClick: () => void; label: string; count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors active:scale-95 ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-gray-100 text-gray-600 active:bg-gray-200"
      }`}
    >
      {label}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-indigo-500" : "bg-white"}`}>
        {count}
      </span>
    </button>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  const msg =
    filter === "upcoming" ? "Aucun événement à venir"
    : filter === "past"    ? "Aucun événement passé"
    : "Aucun mouvement enregistré";
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
        <span className="text-2xl">📋</span>
      </div>
      <p className="text-sm font-semibold text-gray-700">{msg}</p>
      <p className="text-xs text-gray-400 mt-1">
        Utilisez le bouton <strong>+</strong> en bas à droite pour ajouter une dépense ou un versement.
      </p>
    </div>
  );
}

function EntreeCard({ entree, onToggle, onDelete }: {
  entree:   EntreeChantier;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const isRecu = entree.statut === "recu";

  return (
    <li className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
      isRecu ? "border-emerald-100" : "border-gray-100"
    }`}>
      <div className="px-4 py-3 flex items-center gap-3">
        <span className="text-xl shrink-0">{SOURCE_EMOJI[entree.source_type]}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{entree.label}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{fmtDateShort(entree.date_entree)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-extrabold tabular-nums ${isRecu ? "text-emerald-700" : "text-gray-700"}`}>
            +{fmtEur(entree.montant)}
          </p>
          <button
            onClick={onToggle}
            className={`text-[10px] font-bold mt-0.5 px-2 py-0.5 rounded-full border transition-colors active:scale-95 ${
              isRecu
                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : "bg-blue-50 text-blue-500 border-blue-200"
            }`}
          >
            {isRecu ? "✓ Reçu" : "⏳ Attendu"}
          </button>
        </div>
        <button
          onClick={() => { setDeleting(true); onDelete(); }}
          disabled={deleting}
          className="text-gray-300 active:text-rose-500 p-2 rounded-lg shrink-0"
          aria-label="Supprimer"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
}

function EventCard({ event, onMarkPaid, onMarkUnpaid }: {
  event:        PaymentEvent;
  onMarkPaid:   () => void;
  onMarkUnpaid: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const amount = event.amount ?? event.amount_estimate ?? 0;
  const isPaid = event.status === "paid";
  const isLate = !isPaid && event.due_date ? isPast(event.due_date) : false;

  const handleToggle = async () => {
    setBusy(true);
    try { isPaid ? await onMarkUnpaid() : await onMarkPaid(); }
    finally { setBusy(false); }
  };

  return (
    <li className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
      isPaid ? "border-emerald-100" : isLate ? "border-rose-200" : "border-gray-100"
    }`}>
      <div className="px-4 py-3 flex items-center gap-3">
        <span className="text-xl shrink-0">{event.source_type === "frais" ? "🧾" : event.source_type === "facture" ? "📑" : "📝"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{event.label}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {fmtDateShort(event.due_date)}
            {event.artisan_nom && <> · <span className="text-gray-500">{event.artisan_nom}</span></>}
            {isLate && !isPaid && <span className="text-rose-500 font-bold"> · En retard</span>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-extrabold tabular-nums ${isPaid ? "text-gray-400 line-through" : isLate ? "text-rose-700" : "text-gray-800"}`}>
            −{fmtEur(amount)}
          </p>
          <button
            onClick={handleToggle}
            disabled={busy}
            className={`text-[10px] font-bold mt-0.5 px-2 py-0.5 rounded-full border transition-colors active:scale-95 ${
              isPaid
                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : "bg-amber-50 text-amber-600 border-amber-200"
            }`}
          >
            {busy ? "…" : isPaid ? "✓ Payé" : "⏳ À payer"}
          </button>
        </div>
      </div>
    </li>
  );
}
