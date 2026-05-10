export const prerender = false;

/**
 * GET /api/chantier/[id]/funding-consumption
 *
 * Source de vérité unique pour la jauge "Consommation par source de
 * financement" (Apport / Crédit / Aides).
 *
 * Modèle d'allocation (Fix #6 + #7, 2026-05-10) :
 *   1. Si un cashflow_term ou cashflow_extras a un array `allocations:
 *      [{entree_id, amount}, ...]` → c'est l'autorité (Fix #6 split).
 *   2. Sinon si un `funding_source_id` est défini → 1 allocation 100% sur
 *      cette source (compat-rétro avec Fix #5).
 *   3. Sinon → AUTO-ALLOCATION FIFO (Fix #7) : on remplit Apport d'abord,
 *      puis Crédit, puis Aides, dans l'ordre chronologique des paiements,
 *      jusqu'à épuisement de chaque enveloppe.
 *
 * Retour : `{ consumed: { apport, credit, aides }, breakdown: [...] }`
 *   - `consumed.*` = somme par catégorie (manuelle + auto)
 *   - `breakdown` = détail par paiement (utile pour audit / UI "ajuster")
 *
 * Read-only — aucune écriture, juste un agrégat calculé.
 */

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth } from '@/lib/api/apiHelpers';

type Cat = 'apport' | 'credit' | 'aides';

const SRC_TO_CAT: Record<string, Cat> = {
  apport_personnel:  'apport',
  deblocage_credit:  'credit',
  aide_maprime:      'aides',
  aide_cee:          'aides',
  eco_ptz:           'aides',
  remboursement:     'apport',
  autre:             'apport',
};

interface Allocation {
  entree_id: string;
  amount:    number;
}

interface PaidEvent {
  /** Identifiant stable pour debug / "ajuster" UI */
  ref:         string;
  amount:      number;
  paid_at:     string;
  /** Allocations explicites (Fix #6) */
  allocations: Allocation[] | null;
  /** Fallback legacy (Fix #5) */
  funding_source_id: string | null;
}

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  try {
    // Fetch entries (sources) + tous les paiements PAID
    const [entreesRes, docsRes, extrasRes] = await Promise.all([
      ctx.supabase
        .from('chantier_entrees')
        .select('id, source_type, montant')
        .eq('chantier_id', chantierId),
      ctx.supabase
        .from('documents_chantier')
        .select('id, cashflow_terms, depense_type, montant, created_at')
        .eq('chantier_id', chantierId),
      ctx.supabase
        .from('cashflow_extras')
        .select('id, amount, due_date, status, funding_source_id, created_at')
        .eq('project_id', chantierId)
        .neq('status', 'cancelled'),
    ]);

    const entrees = entreesRes.data ?? [];
    const docs    = docsRes.data    ?? [];
    const extras  = extrasRes.data  ?? [];

    // Map entree.id → catégorie + montant total disponible
    const idToCat: Record<string, Cat>     = {};
    const idAvail: Record<string, number>  = {};
    const catTotals = { apport: 0, credit: 0, aides: 0 };
    for (const e of entrees) {
      const cat = SRC_TO_CAT[e.source_type] ?? 'apport';
      idToCat[e.id] = cat;
      idAvail[e.id] = Number(e.montant ?? 0);
      catTotals[cat] += Number(e.montant ?? 0);
    }

    // Collecte tous les paiements PAID (cashflow_terms + frais auto + extras)
    const events: PaidEvent[] = [];

    for (const d of docs) {
      // Branche 1 : frais / ticket_caisse → 1 paiement auto-paid (sans allocation possible)
      if (d.depense_type === 'frais' || d.depense_type === 'ticket_caisse') {
        if (d.montant != null && d.montant > 0) {
          events.push({
            ref:               `doc:${d.id}:auto`,
            amount:            Number(d.montant),
            paid_at:           d.created_at as string,
            allocations:       null,
            funding_source_id: null,
          });
        }
      }
      // Branche 2 : cashflow_terms array
      const terms: any[] = Array.isArray(d.cashflow_terms) ? d.cashflow_terms : [];
      for (let i = 0; i < terms.length; i++) {
        const t = terms[i];
        if (!t || t.status !== 'paid' || typeof t.amount !== 'number' || t.amount <= 0) continue;
        events.push({
          ref:               `doc:${d.id}:${i}`,
          amount:            Number(t.amount),
          paid_at:           t.due_date ?? (d.created_at as string),
          allocations:       Array.isArray(t.allocations)
            ? t.allocations
                .map((a: any) => ({
                  entree_id: typeof a?.entree_id === 'string' ? a.entree_id : null,
                  amount:    typeof a?.amount === 'number'    ? a.amount    : 0,
                }))
                .filter((a: any) => a.entree_id && a.amount > 0)
            : null,
          funding_source_id: typeof t.funding_source_id === 'string' ? t.funding_source_id : null,
        });
      }
    }

    // Branche 3 : cashflow_extras (PAID seulement)
    for (const e of extras) {
      if (e.status !== 'paid') continue;
      const amt = Number(e.amount ?? 0);
      if (amt <= 0) continue;
      events.push({
        ref:               `extra:${e.id}`,
        amount:            amt,
        paid_at:           (e.due_date ?? e.created_at) as string,
        allocations:       null, // table cashflow_extras n'a pas d'allocations array (mono via funding_source_id)
        funding_source_id: e.funding_source_id ?? null,
      });
    }

    // Tri chronologique pour le FIFO (Fix #7) : on rempli Apport d'abord
    events.sort((a, b) => (a.paid_at ?? '').localeCompare(b.paid_at ?? ''));

    // Agrégateurs
    const consumed = { apport: 0, credit: 0, aides: 0 };
    /** Solde restant par enveloppe pour le FIFO virtuel */
    const remaining: Record<Cat, number> = {
      apport: catTotals.apport,
      credit: catTotals.credit,
      aides:  catTotals.aides,
    };
    /** Pour ne pas double-compter une allocation explicite avec le FIFO */
    const breakdown: Array<{
      ref:    string;
      amount: number;
      mode:   'manual' | 'auto' | 'unallocated';
      splits: Array<{ cat: Cat; amount: number }>;
    }> = [];

    for (const ev of events) {
      const splits: Array<{ cat: Cat; amount: number }> = [];
      let mode: 'manual' | 'auto' | 'unallocated' = 'unallocated';

      // 1. Allocations explicites (Fix #6)
      if (ev.allocations && ev.allocations.length > 0) {
        mode = 'manual';
        for (const a of ev.allocations) {
          const cat = idToCat[a.entree_id];
          if (!cat) continue;
          consumed[cat] += a.amount;
          remaining[cat] = Math.max(0, remaining[cat] - a.amount);
          splits.push({ cat, amount: a.amount });
        }
      }
      // 2. Fallback funding_source_id (Fix #5)
      else if (ev.funding_source_id && idToCat[ev.funding_source_id]) {
        mode = 'manual';
        const cat = idToCat[ev.funding_source_id];
        consumed[cat] += ev.amount;
        remaining[cat] = Math.max(0, remaining[cat] - ev.amount);
        splits.push({ cat, amount: ev.amount });
      }
      // 3. Auto-allocation FIFO (Fix #7) — Apport → Crédit → Aides
      else {
        let toAllocate = ev.amount;
        for (const cat of ['apport', 'credit', 'aides'] as Cat[]) {
          if (toAllocate <= 0) break;
          if (remaining[cat] <= 0) continue;
          const used = Math.min(remaining[cat], toAllocate);
          consumed[cat] += used;
          remaining[cat] -= used;
          toAllocate -= used;
          splits.push({ cat, amount: used });
        }
        // Si toAllocate > 0 → dépassement budget cible (paiement non couvert
        // par les enveloppes configurées). On compte quand même en "apport"
        // pour ne pas perdre l'argent, et la jauge montrera 100%+.
        if (toAllocate > 0) {
          consumed.apport += toAllocate;
          splits.push({ cat: 'apport', amount: toAllocate });
        }
        mode = splits.length > 0 ? 'auto' : 'unallocated';
      }

      breakdown.push({ ref: ev.ref, amount: ev.amount, mode, splits });
    }

    return jsonOk({
      consumed,
      remaining,
      totals: catTotals,
      breakdown,
      // Compteurs utiles à l'UI (pour le badge "X paiements auto-alloués")
      counts: {
        manual:      breakdown.filter(b => b.mode === 'manual').length,
        auto:        breakdown.filter(b => b.mode === 'auto').length,
        unallocated: breakdown.filter(b => b.mode === 'unallocated').length,
      },
    });
  } catch (err) {
    console.error('[GET /funding-consumption]', err instanceof Error ? err.message : err);
    return jsonError('Erreur serveur', 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
