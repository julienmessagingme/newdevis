/**
 * usePaymentEvents — hook de récupération des payment_events depuis l'API.
 * Retourne la liste triée, les états loading/error, et une fonction de refresh.
 */
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL,
  (import.meta as any).env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PaymentEvent {
  id: string;
  project_id: string;
  source_type: 'devis' | 'facture';
  source_id: string;
  amount: number | null;
  due_date: string | null;        // YYYY-MM-DD
  status: 'pending' | 'paid' | 'late' | 'cancelled';
  is_override: boolean;
  label: string;
  created_at: string;
  // Champs enrichis par l'API
  source_name: string | null;     // nom du document source (devis PDF)
  lot_nom: string | null;         // nom du lot lié
  artisan_nom: string | null;     // nom de l'artisan (depuis devis_chantier)
}

export interface UsePaymentEventsReturn {
  events: PaymentEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  markPaid: (id: string) => Promise<void>;
  markUnpaid: (id: string) => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePaymentEvents(
  chantierId: string | null,
  token: string | null | undefined,
): UsePaymentEventsReturn {
  const [events, setEvents]   = useState<PaymentEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [tick, setTick]       = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!chantierId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    // Toujours récupérer un token frais — le token prop peut être expiré
    const doFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const bearerToken = session?.access_token ?? token ?? null;
      if (!bearerToken) {
        if (!cancelled) { setError('Non authentifié'); setLoading(false); }
        return;
      }
      return fetch(`/api/chantier/${chantierId}/payment-events`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
    };

    doFetch()
      .then(r => {
        if (!r) return null;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { payment_events: PaymentEvent[] } | null) => {
        if (cancelled || !data) return;
        // Auto-escalade : passe "pending" → "late" si due_date < aujourd'hui
        const today = new Date().toISOString().slice(0, 10);
        const enriched = (data.payment_events ?? []).map(ev => ({
          ...ev,
          status: ev.status === 'pending' && ev.due_date && ev.due_date < today
            ? 'late' as const
            : ev.status,
        }));
        setEvents(enriched);
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur réseau');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [chantierId, token, tick]);

  // ── Récupère un token valide (toujours frais — bypass cache prop) ────────
  const getFreshToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? token ?? null;
  }, [token]);

  // ── Marquer un événement comme payé ──────────────────────────────────────
  const markPaid = useCallback(async (id: string) => {
    if (!chantierId) return;
    const bearerToken = await getFreshToken();
    if (!bearerToken) return;
    // Optimiste
    setEvents(prev => prev.map(ev => ev.id === id ? { ...ev, status: 'paid' as const } : ev));
    try {
      const res = await fetch(`/api/chantier/${chantierId}/payment-events`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'paid' }),
      });
      if (!res.ok) {
        // Rollback + re-fetch pour afficher l'état réel
        refresh();
        return;
      }
      const data = await res.json();
      if (!data.ok) {
        // Le serveur indique que l'update n'a pas eu lieu
        refresh();
      }
    } catch {
      refresh();
    }
  }, [chantierId, getFreshToken, refresh]);

  // ── Annuler un paiement (repasser en "À venir") ───────────────────────────
  const markUnpaid = useCallback(async (id: string) => {
    if (!chantierId) return;
    const bearerToken = await getFreshToken();
    if (!bearerToken) return;
    // Optimiste
    setEvents(prev => prev.map(ev => ev.id === id ? { ...ev, status: 'pending' as const } : ev));
    try {
      const res = await fetch(`/api/chantier/${chantierId}/payment-events`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'pending' }),
      });
      if (!res.ok) {
        refresh();
        return;
      }
      const data = await res.json();
      if (!data.ok) refresh();
    } catch {
      refresh();
    }
  }, [chantierId, getFreshToken, refresh]);

  return { events, loading, error, refresh, markPaid, markUnpaid };
}

// ── Calculs dérivés exportés (utilisables sans le hook) ─────────────────────

/** Calcule le total des paiements actifs (non annulés, non overridés). */
export function computeTotalEngaged(events: PaymentEvent[]): number {
  return events
    .filter(e => !e.is_override && e.status !== 'cancelled')
    .reduce((sum, e) => sum + (e.amount ?? 0), 0);
}

/** Projection cashflow sur 7 / 30 / 60 jours. */
export function computeCashflow(events: PaymentEvent[]): {
  next7: number;
  next30: number;
  next60: number;
} {
  const today  = new Date();
  const d7     = new Date(today); d7.setDate(today.getDate() + 7);
  const d30    = new Date(today); d30.setDate(today.getDate() + 30);
  const d60    = new Date(today); d60.setDate(today.getDate() + 60);
  const todayS = today.toISOString().slice(0, 10);

  const active = events.filter(
    e => !e.is_override && e.status !== 'cancelled' && e.status !== 'paid' && e.due_date,
  );

  const inRange = (due: string, limit: Date) =>
    due >= todayS && due <= limit.toISOString().slice(0, 10);

  return {
    next7:  active.filter(e => inRange(e.due_date!, d7)).reduce((s, e)  => s + (e.amount ?? 0), 0),
    next30: active.filter(e => inRange(e.due_date!, d30)).reduce((s, e) => s + (e.amount ?? 0), 0),
    next60: active.filter(e => inRange(e.due_date!, d60)).reduce((s, e) => s + (e.amount ?? 0), 0),
  };
}

/** Génère les alertes intelligentes. */
export interface PaymentAlert {
  type: 'late' | 'soon' | 'budget';
  message: string;
}

export function computeAlerts(
  events: PaymentEvent[],
  budgetTotal: number | null,
): PaymentAlert[] {
  const alerts: PaymentAlert[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const in3   = new Date(); in3.setDate(in3.getDate() + 3);
  const in3S  = in3.toISOString().slice(0, 10);

  const active = events.filter(e => !e.is_override && e.status !== 'cancelled');

  // Paiements en retard
  const lateEvts = active.filter(e => e.status === 'late' || (e.status === 'pending' && e.due_date && e.due_date < today));
  if (lateEvts.length === 1) {
    const e = lateEvts[0];
    alerts.push({
      type: 'late',
      message: `Paiement en retard : « ${e.label} »${e.amount ? ` — ${fmtEur(e.amount)}` : ''}`,
    });
  } else if (lateEvts.length > 1) {
    const total = lateEvts.reduce((s, e) => s + (e.amount ?? 0), 0);
    alerts.push({ type: 'late', message: `${lateEvts.length} paiements en retard — ${fmtEur(total)} à régulariser` });
  }

  // Paiements dans les 3 jours
  const soonEvts = active.filter(
    e => e.status === 'pending' && e.due_date && e.due_date >= today && e.due_date <= in3S,
  );
  if (soonEvts.length > 0) {
    const total = soonEvts.reduce((s, e) => s + (e.amount ?? 0), 0);
    alerts.push({
      type: 'soon',
      message: `${soonEvts.length} paiement${soonEvts.length > 1 ? 's' : ''} dans les 3 jours — ${fmtEur(total)}`,
    });
  }

  // Dépassement budget
  if (budgetTotal && budgetTotal > 0) {
    const engaged = computeTotalEngaged(events);
    if (engaged > budgetTotal) {
      const over = engaged - budgetTotal;
      alerts.push({ type: 'budget', message: `Dépassement de budget estimé : +${fmtEur(over)} au-dessus de l'enveloppe` });
    } else if (engaged > budgetTotal * 0.9) {
      alerts.push({ type: 'budget', message: `Vous avez engagé 90 % de votre enveloppe budget` });
    }
  }

  return alerts;
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
