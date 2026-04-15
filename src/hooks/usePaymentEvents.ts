/**
 * usePaymentEvents — hook de récupération des payment_events depuis l'API.
 * Retourne la liste triée, les états loading/error, et une fonction de refresh.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
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
  // Justificatif de paiement
  proof_doc_id: string | null;
  proof_doc_name: string | null;
  proof_signed_url: string | null;
}

export interface UsePaymentEventsReturn {
  events: PaymentEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  markPaid: (id: string) => Promise<boolean>;
  markUnpaid: (id: string) => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePaymentEvents(
  chantierId: string | null,
  token: string | null | undefined,
): UsePaymentEventsReturn {
  const [events, setEvents]       = useState<PaymentEvent[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [tick, setTick]           = useState(0);
  // Distingue le premier chargement (spinner plein) des re-fetchs silencieux
  const isFirstLoad = useRef(true);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  // Protège les mises à jour optimistes contre les re-fetchs concurrents
  const pendingUpdates = useRef(new Map<string, PaymentEvent['status']>());

  useEffect(() => {
    if (!chantierId) return;

    let cancelled = false;
    // Spinner plein uniquement au premier chargement — les re-fetch après
    // markPaid/markUnpaid se font silencieusement (pas de flash de spinner)
    if (isFirstLoad.current) {
      setLoading(true);
    }
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
        // Les mises à jour optimistes en attente (pendingUpdates) prennent priorité
        const today = new Date().toISOString().slice(0, 10);
        const enriched = (data.payment_events ?? []).map(ev => {
          const autoStatus = ev.status === 'pending' && ev.due_date && ev.due_date < today
            ? 'late' as const
            : ev.status;
          const finalStatus = pendingUpdates.current.has(ev.id)
            ? pendingUpdates.current.get(ev.id)!
            : autoStatus;
          return { ...ev, status: finalStatus };
        });
        setEvents(enriched);
        isFirstLoad.current = false;
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur réseau');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  // NE PAS inclure `token` dans les deps : doFetch() appelle toujours getSession()
  // pour un token frais. Inclure token causerait un re-fetch chaque fois que le parent
  // rafraîchit sa session → race condition avec les mises à jour optimistes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chantierId, tick]);

  // ── Mise à jour statut — via PATCH API route (server-side, service_role) ──
  // On passe par l'API route plutôt que par le RPC client-side pour éviter les
  // problèmes de session : le token est toujours rafraîchi via getSession() avant
  // l'appel, et le serveur utilise la service_role_key (pas de dépendance RLS).
  // Retourne 'ok' | 'not_found' | 'error'
  const patchStatus = useCallback(async (id: string, status: 'paid' | 'pending'): Promise<'ok' | 'not_found' | 'error'> => {
    if (!chantierId) { console.error('[patchStatus] chantierId manquant'); return 'error'; }
    try {
      // Token toujours frais — évite les 401 sur session expirée
      const { data: { session } } = await supabase.auth.getSession();
      const bearerToken = session?.access_token ?? token ?? null;
      if (!bearerToken) {
        console.error('[patchStatus] aucun token disponible');
        return 'error';
      }

      const r = await fetch(`/api/chantier/${chantierId}/payment-events`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ id, status }),
      });

      if (r.status === 404) {
        console.warn('[patchStatus] 404 — event introuvable', { id, chantierId });
        return 'not_found';
      }
      if (!r.ok) {
        const msg = await r.text().catch(() => String(r.status));
        console.error(`[patchStatus] HTTP ${r.status}:`, msg);
        return 'error';
      }

      console.log(`[patchStatus] ✓ PATCH ${status} (id=${id})`);
      return 'ok';
    } catch (e) {
      console.error('[patchStatus] exception:', e instanceof Error ? e.message : e);
      return 'error';
    }
  }, [chantierId, token]);

  // ── Marquer un événement comme payé ──────────────────────────────────────
  const markPaid = useCallback(async (id: string): Promise<boolean> => {
    if (!chantierId) return false;

    // Mise à jour optimiste immédiate
    pendingUpdates.current.set(id, 'paid');
    setEvents(prev => prev.map(ev => ev.id === id ? { ...ev, status: 'paid' as const } : ev));

    const result = await patchStatus(id, 'paid');

    if (result !== 'ok') {
      // Échec API → supprimer le lock et re-synchroniser depuis le serveur.
      // 'not_found' = l'event a été dédupliqué depuis le dernier chargement :
      // le refresh va purger l'item obsolète de la liste.
      pendingUpdates.current.delete(id);
      refresh();
      return false;
    }

    // Succès : on garde pendingUpdates actif pendant le refresh silencieux
    // pour éviter le flash — la prochaine fetch retournera 'paid' côté DB.
    refresh();
    setTimeout(() => { pendingUpdates.current.delete(id); }, 4000);
    return true;
  }, [chantierId, patchStatus, refresh]);

  // ── Annuler un paiement (repasser en "À venir") ───────────────────────────
  const markUnpaid = useCallback(async (id: string) => {
    if (!chantierId) return;

    pendingUpdates.current.set(id, 'pending');
    setEvents(prev => prev.map(ev => ev.id === id ? { ...ev, status: 'pending' as const } : ev));

    const result = await patchStatus(id, 'pending');

    if (result !== 'ok') {
      pendingUpdates.current.delete(id);
      refresh();
      return;
    }

    refresh();
    setTimeout(() => { pendingUpdates.current.delete(id); }, 4000);
  }, [chantierId, patchStatus, refresh]);

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
