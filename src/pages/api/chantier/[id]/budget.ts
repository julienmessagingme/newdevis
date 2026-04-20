export const prerender = false;

/**
 * GET /api/chantier/[id]/budget
 *
 * Retourne les données structurées pour l'onglet Budget :
 *   - budget_ia        : budget estimé par l'IA (metadonnees.budgetTotal)
 *   - financement      : sources de financement (metadonnees.financing)
 *   - lots             : liste des lots avec devis + factures + totaux
 *   - sans_lot         : documents sans lot associé
 *   - totaux           : agrégats globaux (previsionnel, engagé, facturé, payé)
 *   - conseils         : recommandations proactives
 *   - type_projet      : type de projet (pour les conseils)
 */

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuthOrAgent } from '@/lib/apiHelpers';

const BUCKET   = 'chantier-documents';
const URL_TTL  = 3600; // 1h

// ── Types internes ────────────────────────────────────────────────────────────

interface BudgetDevis {
  id: string;
  nom: string;
  montant: number | null;
  devis_statut: string | null;
  analyse_id: string | null;
  analyse_status: string | null;
  analyse_score: number | null;
  analyse_signal: string | null;
  signed_url: string | null;
  created_at: string;
  montant_acompte_echeancier: number; // paiements Échéancier payés sur ce devis
}

interface BudgetFacture {
  id: string;
  nom: string;
  montant: number | null;
  montant_paye: number | null;
  facture_statut: string | null;
  payment_terms: {
    type_facture: string;
    pct: number;
    delai_jours: number;
    numero_facture: string | null;
  } | null;
  signed_url: string | null;
  created_at: string;
}

interface BudgetLot {
  id: string;
  nom: string;
  emoji: string | null;
  devis: BudgetDevis[];
  nb_devis_recus: number; // tous statuts (pour le contexte agent)
  factures: BudgetFacture[];
  totaux: {
    devis_recus: number;
    devis_valides: number;
    facture: number;
    paye: number;
    acompte: number;
    litige: number;
    a_payer: number;
  };
}

interface Conseil {
  type: string;
  urgency: 'info' | 'warning' | 'action';
  titre: string;
  detail: string;
}

// ── Conseils proactifs ────────────────────────────────────────────────────────

function buildConseils(opts: {
  financement: Record<string, number>;
  totaux: { devis_recus: number; devis_valides: number; facture: number; paye: number };
  budget_ia: number;
  type_projet: string;
  has_proofs: boolean;
}): Conseil[] {
  const { financement, totaux, budget_ia, type_projet } = opts;
  const conseils: Conseil[] = [];

  // 1. Intercalaires : apport + crédit → mobiliser apport en premier
  if (financement.credit > 0 && financement.apport > 0) {
    const savings = Math.round(financement.credit * (0.042 / 12) * 12);
    conseils.push({
      type: 'intercalaires',
      urgency: 'action',
      titre: 'Mobilisez votre apport en premier',
      detail: `En utilisant d'abord votre apport personnel (${financement.apport.toLocaleString('fr-FR')} €), vous réduisez la base empruntée et économisez potentiellement ~${savings.toLocaleString('fr-FR')} € d'intérêts intercalaires.`,
    });
  }

  // 2. MaPrimeRénov
  const isEnergie = ['isolation', 'toiture', 'renovation_maison', 'chauffage'].some(
    t => type_projet.includes(t),
  );
  if (isEnergie && financement.maprime === 0) {
    conseils.push({
      type: 'maprime',
      urgency: 'action',
      titre: 'Vérifiez votre éligibilité à MaPrimeRénov\'',
      detail: 'Pour des travaux de rénovation énergétique, MaPrimeRénov\' peut couvrir jusqu\'à 90 % des dépenses selon vos revenus. Renseignez-vous sur maprimerenov.gouv.fr avant de valider vos devis.',
    });
  }

  // 3. CEE (Certificats d'Économies d'Énergie)
  if (isEnergie && financement.cee === 0) {
    conseils.push({
      type: 'cee',
      urgency: 'info',
      titre: 'Prime CEE disponible',
      detail: 'Demandez à votre artisan de vous faire bénéficier des Certificats d\'Économies d\'Énergie (CEE). Une prime complémentaire souvent non réclamée, négociable directement avec le professionnel.',
    });
  }

  // 4. Dépassement budget estimé
  if (budget_ia > 0 && totaux.devis_recus > budget_ia * 1.08) {
    const ecart = Math.round(totaux.devis_recus - budget_ia);
    conseils.push({
      type: 'depassement',
      urgency: 'warning',
      titre: `Dépassement de votre budget estimé`,
      detail: `Vos devis reçus (${totaux.devis_recus.toLocaleString('fr-FR')} €) dépassent votre estimation initiale de +${ecart.toLocaleString('fr-FR')} €. Revoyez les postes ou ajustez votre plan de financement.`,
    });
  }

  // 5. PEE (Plan Épargne Entreprise)
  const isPrincipal = ['renovation_maison', 'extension', 'isolation', 'toiture', 'salle_de_bain', 'cuisine'].includes(type_projet);
  if (isPrincipal && financement.apport < totaux.devis_valides * 0.3) {
    conseils.push({
      type: 'pee',
      urgency: 'info',
      titre: 'Déblocage anticipé du PEE possible',
      detail: 'Pour des travaux sur votre résidence principale, vous pouvez débloquer votre Plan d\'Épargne Entreprise sans pénalité fiscale. Renseignez-vous auprès de votre gestionnaire d\'épargne salariale.',
    });
  }

  // 6. Justificatifs manquants
  if (totaux.paye > 0 && !opts.has_proofs) {
    conseils.push({
      type: 'preuves',
      urgency: 'warning',
      titre: 'Conservez vos preuves de paiement',
      detail: 'Vous avez des paiements enregistrés sans justificatif joint. Ajoutez vos virements ou reçus — indispensables en cas de litige, pour activer les garanties décennales ou lors d\'une revente.',
    });
  }

  return conseils;
}

// ── Route principale ──────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  try {
    // ── Phase A : 4 queries indépendantes en parallèle ─────────────────────
    // chantier, lots, docs et proofCount ne dépendent d'aucune autre query.
    // Si chantier est 404, on return early et on jette les autres résultats.
    const [chantierRes, lotsRawRes, docsRes, proofCountRes, paidEventsRes] = await Promise.all([
      ctx.supabase
        .from('chantiers')
        .select('id, nom, type_projet, metadonnees')
        .eq('id', chantierId)
        .single(),
      ctx.supabase
        .from('lots_chantier')
        .select('id, nom, emoji, ordre')
        .eq('chantier_id', chantierId)
        .order('ordre'),
      ctx.supabase
        .from('documents_chantier')
        .select('id, nom, document_type, lot_id, analyse_id, devis_statut, facture_statut, montant, montant_paye, payment_terms, bucket_path, created_at')
        .eq('chantier_id', chantierId)
        .in('document_type', ['devis', 'facture'])
        .order('created_at', { ascending: false }),
      ctx.supabase
        .from('documents_chantier')
        .select('id', { count: 'exact', head: true })
        .eq('chantier_id', chantierId)
        .eq('document_type', 'preuve_paiement'),
      // Paiements effectués dans l'Échéancier (source de vérité pour totaux.paye)
      ctx.supabase
        .from('payment_events')
        .select('source_id, amount, source_type')
        .eq('project_id', chantierId)
        .eq('status', 'paid')
        .not('source_id', 'is', null),
    ]);

    const chantier   = chantierRes.data;
    const lotsRaw    = lotsRawRes.data;
    const docs       = docsRes.data;
    const proofCount = proofCountRes.count;

    // Montants payés par document-source (payment_events = source de vérité)
    const eventsPayeByDoc: Record<string, number> = {};
    for (const ev of paidEventsRes.data ?? []) {
      if (ev.source_id && ev.amount != null) {
        eventsPayeByDoc[ev.source_id] = (eventsPayeByDoc[ev.source_id] ?? 0) + Number(ev.amount);
      }
    }

    if (!chantier) return jsonError('Chantier introuvable', 404);

    const meta       = (chantier.metadonnees as Record<string, unknown>) ?? {};
    const budget_ia  = (meta.budgetTotal as number) ?? 0;
    const fin_raw    = (meta.financing  as Record<string, string>) ?? {};
    const financement = {
      apport:  parseFloat(fin_raw.apport  ?? '0') || 0,
      credit:  parseFloat(fin_raw.credit  ?? '0') || 0,
      maprime: parseFloat(fin_raw.maprime ?? '0') || 0,
      cee:     parseFloat(fin_raw.cee     ?? '0') || 0,
      eco_ptz: parseFloat(fin_raw.eco_ptz ?? '0') || 0,
    };

    // ── Phase B : analyses scores + signed URLs en parallèle ───────────────
    // Les deux dépendent de `docs` mais sont indépendantes entre elles.
    const analyseIds = (docs ?? [])
      .map(d => d.analyse_id)
      .filter((x): x is string => !!x);

    // Parallélisation : analyses + signed URLs (indépendants entre eux)
    const [analysesRes, signedUrlEntries] = await Promise.all([
      analyseIds.length > 0
        ? ctx.supabase
            .from('analyses')
            .select('id, status, score, signal, raw_text')
            .in('id', analyseIds)
        : Promise.resolve({ data: [] as Array<{ id: string; status: string | null; score: number | null; signal: string | null; raw_text: unknown }>, error: null }),
      Promise.all(
        (docs ?? [])
          .filter(d => d.bucket_path && !d.bucket_path.startsWith('analyse/'))
          .map(async d => {
            const { data: urlData } = await ctx.supabase.storage
              .from(BUCKET)
              .createSignedUrl(d.bucket_path!, URL_TTL);
            return [d.id, urlData?.signedUrl] as const;
          })
      ),
    ]);

    if ('error' in analysesRes && analysesRes.error) {
      console.error('[GET /budget] analyses fetch error:', analysesRes.error.message);
    }

    const analysesMap = new Map<string, { status: string; score: number | null; signal: string | null; montant: number | null }>();
    let backfilledCount = 0;

    for (const a of analysesRes.data ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let raw: any = (a as any).raw_text;
      if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
      const totaux = raw?.extracted?.totaux;
      const montant = totaux?.ttc != null && !isNaN(Number(totaux.ttc)) ? Number(totaux.ttc)
                    : totaux?.ht  != null && !isNaN(Number(totaux.ht))  ? Number(totaux.ht)
                    : null;

      analysesMap.set(a.id, {
        status:  a.status ?? null,
        score:   a.score  ?? null,
        signal:  a.signal ?? null,
        montant,
      });
    }

    // ── Write-through : backfill documents_chantier.montant depuis l'analyse ──
    // Si doc.montant est null mais que l'analyse a un TTC, on le persiste
    // ET on met à jour l'objet en mémoire pour que la réponse courante soit correcte.
    const backfills: Promise<unknown>[] = [];
    for (const doc of docs ?? []) {
      if (doc.document_type !== 'devis') continue;
      if (doc.montant != null && doc.montant > 0) continue;          // déjà ok
      if (!doc.analyse_id) continue;
      const am = analysesMap.get(doc.analyse_id);
      if (!am?.montant) continue;
      // Mise à jour en mémoire pour que la réponse courante utilise le montant
      (doc as Record<string, unknown>).montant = am.montant;
      backfilledCount++;
      backfills.push(
        ctx.supabase
          .from('documents_chantier')
          .update({ montant: am.montant })
          .eq('id', doc.id)
          .eq('chantier_id', chantierId),
      );
    }
    if (backfills.length > 0) {
      Promise.allSettled(backfills).catch(() => {});
    }

    const urlMap = new Map<string, string>();
    for (const [docId, url] of signedUrlEntries) {
      if (url) urlMap.set(docId, url);
    }

    // ── 6. Groupage par lot ─────────────────────────────────────────────────
    const lotMap = new Map<string, BudgetLot>();
    const emptyTotaux = () => ({
      devis_recus: 0, devis_valides: 0,
      facture: 0, paye: 0, acompte: 0, litige: 0, a_payer: 0,
    });

    for (const lot of lotsRaw ?? []) {
      lotMap.set(lot.id, {
        id: lot.id, nom: lot.nom, emoji: lot.emoji ?? null,
        devis: [], nb_devis_recus: 0, factures: [],
        totaux: emptyTotaux(),
      });
    }

    const sanslot: BudgetLot = {
      id: 'sans_lot', nom: 'Sans intervenant', emoji: null,
      devis: [], nb_devis_recus: 0, factures: [],
      totaux: emptyTotaux(),
    };

    for (const doc of docs ?? []) {
      const analyse = doc.analyse_id ? (analysesMap.get(doc.analyse_id) ?? null) : null;
      const bucket  = (doc.lot_id && lotMap.has(doc.lot_id))
        ? lotMap.get(doc.lot_id)!
        : sanslot;

      if (doc.document_type === 'devis') {
        // Compter tous les devis reçus (pour le contexte agent)
        bucket.nb_devis_recus = (bucket.nb_devis_recus ?? 0) + 1;
        // N'afficher sur l'écran budget que les devis acceptés
        const statut = doc.devis_statut ?? 'en_cours';
        if (statut !== 'valide' && statut !== 'attente_facture') continue;

        // Montant : doc.montant (write-back pipeline) ou fallback raw_text analyse
        const montant = (doc.montant != null && doc.montant > 0)
          ? doc.montant
          : (analyse?.montant ?? null);

        // Paiements Échéancier sur ce devis (acomptes versés avant facture)
        const evDevisPaid = eventsPayeByDoc[doc.id] ?? 0;

        bucket.devis.push({
          id:             doc.id,
          nom:            doc.nom,
          montant,
          devis_statut:   statut,
          analyse_id:     doc.analyse_id    ?? null,
          analyse_status: analyse?.status   ?? null,
          analyse_score:  analyse?.score    ?? null,
          analyse_signal: analyse?.signal   ?? null,
          signed_url:     urlMap.get(doc.id) ?? null,
          created_at:     doc.created_at,
          montant_acompte_echeancier: evDevisPaid,
        });
        bucket.totaux.devis_recus   += montant ?? 0;
        bucket.totaux.devis_valides += montant ?? 0;

        // Paiements sur devis → uniquement dans acompte (pas dans paye)
        // paye = paiements complets sur factures / acompte = avances (devis + factures partielles)
        if (evDevisPaid > 0) {
          bucket.totaux.acompte += evDevisPaid;
        }
      } else if (doc.document_type === 'facture') {
        // Paiements Échéancier sur cette facture (prioritaires sur facture_statut)
        const evFacturePaid = eventsPayeByDoc[doc.id];

        // Fallback montant : si montant null, on récupère depuis payment_events ou montant_paye
        const montant = doc.montant != null
          ? doc.montant
          : (evFacturePaid ?? doc.montant_paye ?? 0);

        // Backfill en DB si montant était null et qu'on a une valeur de substitution
        if (doc.montant == null && montant > 0) {
          backfills.push(
            ctx.supabase
              .from('documents_chantier')
              .update({ montant })
              .eq('id', doc.id)
              .eq('chantier_id', chantierId),
          );
          (doc as Record<string, unknown>).montant = montant;
        }
        const paye = evFacturePaid != null
          ? evFacturePaid
          : doc.facture_statut === 'payee'               ? montant
          : doc.facture_statut === 'payee_partiellement' ? (doc.montant_paye ?? 0)
          : 0;
        const acompte = (paye > 0 && paye < montant) ? paye : 0;
        const litige  = doc.facture_statut === 'en_litige' ? montant : 0;
        const a_payer =
          doc.facture_statut === 'recue'               ? montant
          : doc.facture_statut === 'payee_partiellement' ? Math.max(0, montant - paye)
          : 0;

        bucket.factures.push({
          id:             doc.id,
          nom:            doc.nom,
          montant:        montant || null,
          montant_paye:   paye,
          facture_statut: doc.facture_statut ?? null,
          payment_terms:  (doc.payment_terms ?? null) as BudgetFacture['payment_terms'],
          signed_url:     urlMap.get(doc.id) ?? null,
          created_at:     doc.created_at,
        });
        // paye = paiements COMPLETS sur factures uniquement
        // acompte = paiements PARTIELS sur factures (exclusifs avec paye)
        bucket.totaux.facture += montant;
        bucket.totaux.paye    += acompte > 0 ? 0 : paye;
        bucket.totaux.acompte += acompte;
        bucket.totaux.litige  += litige;
        bucket.totaux.a_payer += a_payer;
      }
    }

    // ── 7. Totaux globaux ───────────────────────────────────────────────────
    const allBuckets = [...lotMap.values(), sanslot];
    const totaux = {
      devis_recus:   allBuckets.reduce((s, b) => s + b.totaux.devis_recus,   0),
      devis_valides: allBuckets.reduce((s, b) => s + b.totaux.devis_valides, 0),
      facture:       allBuckets.reduce((s, b) => s + b.totaux.facture,       0),
      paye:          allBuckets.reduce((s, b) => s + b.totaux.paye,          0),
      acompte:       allBuckets.reduce((s, b) => s + b.totaux.acompte,       0),
      litige:        allBuckets.reduce((s, b) => s + b.totaux.litige,        0),
      a_payer:       allBuckets.reduce((s, b) => s + b.totaux.a_payer,       0),
    };

    // ── 8. Preuves de paiement (proofCount déjà fetché en Phase A) ─────────

    // ── 9. Conseils ─────────────────────────────────────────────────────────
    const conseils = buildConseils({
      financement,
      totaux,
      budget_ia,
      type_projet:  chantier.type_projet ?? 'autre',
      has_proofs:   (proofCount ?? 0) > 0,
    });

    // ── 10. Réponse ─────────────────────────────────────────────────────────
    const lotsFiltered = [...lotMap.values()].filter(
      l => l.devis.length > 0 || l.factures.length > 0 || l.nb_devis_recus > 0,
    );
    const hasSansLot = sanslot.devis.length > 0 || sanslot.factures.length > 0;

    return jsonOk({
      budget_ia,
      financement,
      lots:              lotsFiltered,
      sans_lot:          hasSansLot ? sanslot : null,
      totaux,
      conseils,
      type_projet:       chantier.type_projet ?? 'autre',
      backfilled_count:  backfilledCount,
    });

  } catch (err) {
    console.error('[GET /budget]', err instanceof Error ? err.message : err);
    return jsonError('Erreur serveur', 500);
  }
};

export const OPTIONS: APIRoute = () => optionsResponse('GET,OPTIONS');
