/**
 * paymentEvents.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Génération automatique des payment_events à partir des conditions de paiement
 * extraites par IA d'un devis ou d'une facture.
 *
 * Pipeline :
 *   1. extractConditionsFromAnalyse()       — lit raw_text dans `analyses`
 *   2. transformToPaymentEvents()            — calcule montants + dates
 *   3. insertPaymentEvents()                 — insère dans `payment_events`
 *   4. overridePreviousDevisEvents()         — pour les factures (is_override)
 *
 * Point d'entrée principal : generatePaymentEventsFromAnalyse()
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConditionPaiement {
  type: 'acompte' | 'progress' | 'solde';
  percentage: number | null;
  amount: number | null;
  due_type: 'date' | 'delay' | 'milestone' | null;
  due_date: string | null;   // YYYY-MM-DD
  delay_days: number | null;
  label: string;             // libellé exact depuis le document
}

export interface PaymentEvent {
  project_id: string;
  source_type: 'devis' | 'facture';
  source_id: string;
  amount: number | null;
  due_date: string | null;   // YYYY-MM-DD
  status: 'pending';
  is_override: boolean;
  label: string;
}

// ── Helpers date ──────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(base: string, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isValidDate(s: string | null | undefined): boolean {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// ── 1. Extraction des conditions depuis une analyse Supabase ──────────────────

/**
 * Lit `analyses.raw_text` et extrait les conditions de paiement + montant total.
 * Retourne un tableau vide si l'analyse n'existe pas, n'est pas complète,
 * ou ne contient aucune condition.
 */
export async function extractConditionsFromAnalyse(
  supabase: ReturnType<typeof createClient>,
  analyseId: string,
): Promise<{ conditions: ConditionPaiement[]; totalAmount: number | null }> {
  console.log(`[paymentEvents] extractConditions — analyseId=${analyseId}`);

  const { data, error } = await supabase
    .from('analyses')
    .select('raw_text')
    .eq('id', analyseId)
    .single();

  if (error || !data?.raw_text) {
    console.warn('[paymentEvents] extractConditions: analyse introuvable ou raw_text vide');
    return { conditions: [], totalAmount: null };
  }

  // raw_text est stocké en TEXT (JSON.stringify) — parse nécessaire
  let parsed: Record<string, unknown>;
  try {
    parsed = typeof data.raw_text === 'string'
      ? JSON.parse(data.raw_text)
      : (data.raw_text as Record<string, unknown>);
  } catch {
    console.warn('[paymentEvents] extractConditions: raw_text non parseable');
    return { conditions: [], totalAmount: null };
  }

  // Le pipeline stocke l'objet sous `extracted` ou directement à la racine
  const extracted = (parsed?.extracted ?? parsed) as Record<string, unknown>;
  const paiement  = extracted?.paiement as Record<string, unknown> | undefined;
  const totaux    = extracted?.totaux   as Record<string, unknown> | undefined;

  const conditions: ConditionPaiement[] = Array.isArray(paiement?.conditions_paiement)
    ? (paiement.conditions_paiement as ConditionPaiement[])
    : [];

  const totalAmount: number | null =
    typeof totaux?.ttc === 'number' ? totaux.ttc :
    typeof totaux?.ht  === 'number' ? totaux.ht  : null;

  console.log(`[paymentEvents] extractConditions: ${conditions.length} conditions, total=${totalAmount}`);
  return { conditions, totalAmount };
}

// ── 2. Transformation en PaymentEvent[] ──────────────────────────────────────

/**
 * Convertit les conditions de paiement extraites par IA en lignes `payment_events`.
 *
 * Règles montant :
 *   - amount explicit → pris tel quel
 *   - percentage → amount = percentage × totalAmount / 100  (arrondi 2 décimales)
 *   - sinon → amount = null
 *
 * Règles date :
 *   - due_type = "date"      → due_date exact du document (validé YYYY-MM-DD)
 *   - due_type = "delay"     → aujourd'hui + delay_days
 *   - due_type = "milestone" → heuristique basée sur le libellé :
 *       signature / commande / acceptation → aujourd'hui
 *       début / démarrage / chantier       → aujourd'hui + 7 j
 *       réception / livraison / fin / achèvement → aujourd'hui + 30 j
 *       autre milestone                    → aujourd'hui + 14 j
 *   - null                   → due_date = null
 */
export function transformToPaymentEvents(
  conditions: ConditionPaiement[],
  totalAmount: number | null,
  chantierId: string,
  sourceType: 'devis' | 'facture',
  sourceId: string,
  isOverride = false,
): PaymentEvent[] {
  if (!conditions.length) {
    console.log('[paymentEvents] transform: aucune condition — timeline vide');
    return [];
  }

  const today  = todayStr();
  const events: PaymentEvent[] = [];

  for (const cond of conditions) {
    // ── Montant ──────────────────────────────────────────────────────────────
    let amount: number | null = null;

    if (typeof cond.amount === 'number' && cond.amount > 0) {
      amount = cond.amount;
    } else if (
      typeof cond.percentage === 'number' &&
      cond.percentage > 0 &&
      totalAmount !== null
    ) {
      amount = Math.round((cond.percentage * totalAmount) / 100 * 100) / 100;
    }

    // ── Date d'échéance ───────────────────────────────────────────────────────
    let dueDate: string | null = null;

    switch (cond.due_type) {
      case 'date':
        dueDate = isValidDate(cond.due_date) ? cond.due_date : null;
        break;

      case 'delay':
        if (typeof cond.delay_days === 'number' && cond.delay_days >= 0) {
          dueDate = addDays(today, cond.delay_days);
        }
        break;

      case 'milestone': {
        const lbl = cond.label.toLowerCase();
        if (/signature|commande|acceptation|signing/.test(lbl)) {
          dueDate = today;                    // paiement immédiat à la signature
        } else if (/début|démarrage|chantier|ouverture/.test(lbl)) {
          dueDate = addDays(today, 7);        // démarrage estimé dans 7 jours
        } else if (/réception|livraison|fin\b|achèvement|completion/.test(lbl)) {
          dueDate = addDays(today, 30);       // fin de chantier estimée dans 30 jours
        } else {
          dueDate = addDays(today, 14);       // milestone inconnue → 14 jours
        }
        break;
      }

      default:
        dueDate = null;
    }

    const label = cond.label?.trim()
      || `${cond.type}${cond.percentage != null ? ` – ${cond.percentage}%` : ''}`;

    events.push({
      project_id:  chantierId,
      source_type: sourceType,
      source_id:   sourceId,
      amount,
      due_date:    dueDate,
      status:      'pending',
      is_override: isOverride,
      label,
    });
  }

  console.log(`[paymentEvents] transform: timeline générée — ${events.length} événements`);
  return events;
}

// ── 3. Insertion en base ──────────────────────────────────────────────────────

/**
 * Insère les événements dans `payment_events`.
 * Utilise la service_role key (passée via le client Supabase fourni).
 */
export async function insertPaymentEvents(
  supabase: ReturnType<typeof createClient>,
  events: PaymentEvent[],
): Promise<{ inserted: number; error: string | null }> {
  if (!events.length) {
    console.log('[paymentEvents] insert: rien à insérer');
    return { inserted: 0, error: null };
  }

  const { error } = await supabase.from('payment_events').insert(events);

  if (error) {
    console.error('[paymentEvents] insert error:', error.message);
    return { inserted: 0, error: error.message };
  }

  console.log(`[paymentEvents] insert: ${events.length} événements insérés avec succès`);
  return { inserted: events.length, error: null };
}

// ── 4. Override des anciens events liés au devis (pour une facture) ───────────

/**
 * Quand une facture est reçue pour un devis existant :
 * marque tous les payment_events du devis original comme
 * is_override = true + status = 'cancelled'.
 */
export async function overridePreviousDevisEvents(
  supabase: ReturnType<typeof createClient>,
  chantierId: string,
  originalDevisId: string,
): Promise<void> {
  const { error } = await supabase
    .from('payment_events')
    .update({ is_override: true, status: 'cancelled' })
    .eq('project_id', chantierId)
    .eq('source_type', 'devis')
    .eq('source_id', originalDevisId);

  if (error) {
    console.error('[paymentEvents] override error:', error.message);
  } else {
    console.log(
      `[paymentEvents] override: events du devis ${originalDevisId} marqués cancelled + is_override=true`,
    );
  }
}

// ── Pipeline complet (point d'entrée principal) ───────────────────────────────

/**
 * Orchestre l'ensemble du pipeline :
 *   extraction → (override si facture) → transformation → insertion.
 *
 * Fire-and-forget : cette fonction ne remonte jamais d'erreur (catch interne).
 * À utiliser après INSERT documents_chantier ou après l'edge function analyze-quote.
 *
 * @param analyseId        ID de l'analyse dans la table `analyses`
 * @param chantierId       ID du chantier (project_id dans payment_events)
 * @param sourceType       'devis' ou 'facture'
 * @param sourceId         ID du document ou devis source (UUID)
 * @param originalDevisId  Fourni uniquement si sourceType = 'facture'
 */
export async function generatePaymentEventsFromAnalyse(
  supabase: ReturnType<typeof createClient>,
  analyseId: string,
  chantierId: string,
  sourceType: 'devis' | 'facture',
  sourceId: string,
  originalDevisId?: string,
): Promise<void> {
  try {
    console.log(
      `[paymentEvents] pipeline démarré — analyseId=${analyseId}, ` +
      `sourceType=${sourceType}, sourceId=${sourceId}`,
    );

    // 1. Extraction depuis raw_text de l'analyse
    const { conditions, totalAmount } = await extractConditionsFromAnalyse(supabase, analyseId);
    if (!conditions.length) {
      console.log('[paymentEvents] pipeline terminé — aucune condition extraite');
      return;
    }

    // 2. Supprimer les events existants pour ce source_id (idempotence)
    // Évite les doublons si la génération est déclenchée plusieurs fois
    // (ex: devis re-validé, changement de statut multiple)
    const { error: delError } = await supabase
      .from('payment_events')
      .delete()
      .eq('project_id', chantierId)
      .eq('source_id', sourceId)
      .eq('is_override', false);
    if (delError) {
      console.warn('[paymentEvents] pipeline: purge avant insertion échouée:', delError.message);
    } else {
      console.log('[paymentEvents] pipeline: events existants purgés pour source_id', sourceId);
    }

    // 3. Override devis original si facture
    if (sourceType === 'facture' && originalDevisId) {
      await overridePreviousDevisEvents(supabase, chantierId, originalDevisId);
    }

    // 4. Transformation
    const events = transformToPaymentEvents(
      conditions, totalAmount, chantierId, sourceType, sourceId,
    );

    // 5. Insertion
    const { inserted, error } = await insertPaymentEvents(supabase, events);
    if (error) {
      console.error('[paymentEvents] pipeline: échec insertion', error);
    } else {
      console.log(`[paymentEvents] pipeline terminé avec succès — ${inserted} événements`);
    }
  } catch (err) {
    // Non-bloquant : ne jamais faire échouer le pipeline principal
    console.error(
      '[paymentEvents] pipeline: erreur inattendue',
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Version sans lecture depuis Supabase : les conditions sont déjà en mémoire.
 * Utilisé depuis l'edge function analyze-quote (conditions extraites = objet JS).
 */
export async function generatePaymentEventsFromConditions(
  supabase: ReturnType<typeof createClient>,
  conditions: ConditionPaiement[],
  totalAmount: number | null,
  chantierId: string,
  sourceType: 'devis' | 'facture',
  sourceId: string,
  originalDevisId?: string,
): Promise<void> {
  try {
    if (!conditions.length) return;

    // Purge des events existants pour ce source_id (idempotence)
    await supabase
      .from('payment_events')
      .delete()
      .eq('project_id', chantierId)
      .eq('source_id', sourceId)
      .eq('is_override', false);

    if (sourceType === 'facture' && originalDevisId) {
      await overridePreviousDevisEvents(supabase, chantierId, originalDevisId);
    }

    const events = transformToPaymentEvents(
      conditions, totalAmount, chantierId, sourceType, sourceId,
    );

    await insertPaymentEvents(supabase, events);
  } catch (err) {
    console.error(
      '[paymentEvents] generateFromConditions: erreur inattendue',
      err instanceof Error ? err.message : err,
    );
  }
}
