import { useState, useEffect, useRef, useMemo } from 'react';
import type { DocumentChantier, LotChantier } from '@/types/chantier-ia';
import PaiementDrawer from './tresorerie/PaiementDrawer';
import { fmtK } from '@/lib/chantier/dashboardHelpers';
import type { BreakdownItem } from './tresorerie/BudgetTresorerie';
import '@/styles/cockpit-refonte.css';

/** Facture réconciliée renvoyée par l'API budget (a_payer = reste à régler réel). */
export interface BudgetFactureLite {
  id: string;
  nom: string;
  montant: number | null;
  montant_paye: number | null;
  a_payer: number;
  facture_statut: string | null;
  depense_type: string | null;
}
/** Instantané budget réconcilié — source unique des compteurs "à régler". */
export interface BudgetSnapshot {
  totaux: { paye: number; acompte: number; a_payer: number };
  factures: BudgetFactureLite[];
}

const fmtEurShort = (n: number) => (n >= 1000 ? fmtK(n) : `${Math.round(n)} €`);

/**
 * Extrait le nom de l'entreprise depuis le libellé d'un document.
 * Coupe la description du devis/facture : "Gouttière Alu System - devis pour
 * la fourniture et la pose" → "Gouttière Alu System".
 */
function cleanCompanyName(raw?: string | null): string {
  if (!raw) return '';
  let s = raw.trim();
  const dashIdx = s.search(/\s[-–—]\s/);
  if (dashIdx > 2) s = s.slice(0, dashIdx).trim();
  const kw = s.match(/^(.*?)\s+(?:devis|facture)\b/i);
  if (kw && kw[1].trim().length > 2) s = kw[1].trim();
  return s;
}

/** Date relative compacte : "aujourd'hui", "hier", "il y a 3 j", "il y a 2 sem.". */
function relTime(iso?: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} j`;
  if (days < 30) return `il y a ${Math.floor(days / 7)} sem.`;
  return `il y a ${Math.floor(days / 30)} mois`;
}

/** Date longue compacte : "12 mai 2026". */
function fmtBubbleDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Icônes inline (design) ────────────────────────────────────────────────────

const ArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 5l7 7-7 7" /></svg>
);
const ChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
);
const TrendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5-5 4 4 8-8" /><path d="M14 8h7v7" /></svg>
);
const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
);
const AlertTriangle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
);

// ── Carte intervenant (design .pro-card) ──────────────────────────────────────

type LotStatus = 'blocked' | 'selecting' | 'ready';

const STATUTS_VALIDES = ['ok', 'termine', 'en_cours', 'contrat_signe'];

function computeLotCard(lot: LotChantier, docs: DocumentChantier[]) {
  const devis    = docs.filter(d => d.document_type === 'devis');
  const factures = docs.filter(d => d.document_type === 'facture');

  const hasValidatedDevis = devis.some(d => d.devis_statut === 'valide' || d.devis_statut === 'attente_facture');
  const hasPaidFacture    = factures.some(d => d.facture_statut === 'payee' || d.facture_statut === 'payee_partiellement');

  const validated = STATUTS_VALIDES.includes(lot.statut ?? '') || hasValidatedDevis || hasPaidFacture;
  const status: LotStatus = validated ? 'ready' : devis.length > 0 ? 'selecting' : 'blocked';

  // Dernière action sur le lot = document le plus récent, décrit en une ligne.
  const last = [...docs].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];
  let lastAction = 'Aucun devis reçu — demande à envoyer';
  let lastDate: string | null = null;
  if (last) {
    lastDate = last.created_at ?? null;
    const company = cleanCompanyName(last.nom);
    const suffix = company ? ` · ${company}` : '';
    if (last.document_type === 'devis') {
      const signed = last.devis_statut === 'valide' || last.devis_statut === 'attente_facture';
      lastAction = (signed ? 'Devis signé' : 'Devis reçu') + suffix;
    } else if (last.document_type === 'facture') {
      if (last.depense_type === 'frais') {
        lastAction = 'Frais' + suffix;
      } else {
        lastAction = (
          last.facture_statut === 'payee'                ? 'Facture payée'
          : last.facture_statut === 'payee_partiellement' ? 'Facture payée en partie'
          : last.facture_statut === 'en_litige'           ? 'Facture en litige'
          :                                                 'Facture reçue'
        ) + suffix;
      }
    } else if (last.document_type === 'photo') {
      lastAction = 'Photo ajoutée';
    } else {
      lastAction = 'Document ajouté';
    }
  }

  return { status, lastAction, lastDate };
}

const STATUS_LABEL: Record<LotStatus, string> = {
  ready:     'Engagé',
  selecting: 'En sélection',
  blocked:   'À démarrer',
};

function ProCard({ lot, docs, onOpen }: { lot: LotChantier; docs: DocumentChantier[]; onOpen: () => void }) {
  const { status, lastAction, lastDate } = computeLotCard(lot, docs);

  return (
    <button type="button" onClick={onOpen} className={`cr-pro-card ${status}`}>
      <div className="cr-pc-top">
        <div className="cr-pc-emoji-wrap">{lot.emoji ?? '🔧'}</div>
        <span className={`cr-pc-status ${status}`}><span className="d" />{STATUS_LABEL[status]}</span>
      </div>
      <div className="cr-pc-mid">
        <div className="cr-pc-trade">{lot.nom}</div>
        <div className="cr-pc-assigned">{lastAction}</div>
      </div>
      <div className="cr-pc-foot">
        <span className="cr-pc-foot-meta">{lastDate ? relTime(lastDate) : '—'}</span>
        <span className="cr-pc-open">Ouvrir<ArrowRight /></span>
      </div>
    </button>
  );
}

// ── Bulle Planning ────────────────────────────────────────────────────────────

interface PlanningSnapshot {
  debut: string | null;
  finSouhaitee: string | null;
  estimatedEnd: string | null;
}

/**
 * V3.4.15+ (2026-05-18) — 3 états distincts pour cohérence post-deadline :
 *   - `completed` : tous les lots terminés (facture payée OU statut termine).
 *     Affiche "Livré le [date auto]" + CTA "Confirmer la réception".
 *   - `overdue`   : ≥ 1 lot non terminé ET date prévue dépassée.
 *     Affiche "Date initialement prévue" (label factuel) + chip ambre +
 *     invitation discrète à mettre à jour.
 *   - `nominal`   : cas standard, date dans le futur.
 *
 * AUCUNE alerte journalière "X jours de retard" — c'est anxiogène et faux dans
 * 80% des cas (chantier déjà terminé non clôturé). Le user reste maître de la
 * date prévue, on ne la recalcule pas dans son dos.
 */
type PlanningState = 'completed' | 'overdue' | 'nominal';

function PlanningBubble({
  planning, rdvs, onOpen, state = 'nominal', completedDate = null,
}: {
  planning: PlanningSnapshot;
  rdvs: { titre: string; date: string }[];
  onOpen: () => void;
  /** État détecté par DashboardHome depuis lots + docs (3 valeurs possibles). */
  state?: PlanningState;
  /** ISO date — date du dernier événement (facture payée la plus récente) si state=completed. */
  completedDate?: string | null;
}) {
  const { debut, finSouhaitee, estimatedEnd } = planning;
  // Mode : si une date de fin souhaitée existe, on a piloté par la fin.
  const endMode = !!finSouhaitee;
  const endDate = endMode ? finSouhaitee : estimatedEnd;

  // Pas de date de début → invitation à créer le planning.
  if (!debut) {
    return (
      <button type="button" className="cr-panel cr-plan" onClick={onOpen}>
        <div className="cr-plan-head">
          <div className="cr-plan-title">Planning</div>
          <span className="cr-plan-chip ar"><ArrowRight /></span>
        </div>
        <div className="cr-plan-empty">
          <span>Aucune date définie pour ce chantier.</span>
          <span className="cta">Définir le planning <ArrowRight /></span>
        </div>
      </button>
    );
  }

  const startT = new Date(debut).getTime();
  const endT = endDate ? new Date(endDate).getTime() : null;
  const weeks = endT && endT > startT ? Math.max(1, Math.round((endT - startT) / (7 * 86_400_000))) : null;

  const rdvMarkers = (endT && endT > startT)
    ? rdvs
        .map(r => {
          const t = new Date(r.date).getTime();
          if (Number.isNaN(t)) return null;
          const pct = (t - startT) / (endT - startT);
          if (pct < 0 || pct > 1) return null;
          return { titre: r.titre, date: r.date, pct };
        })
        .filter((m): m is { titre: string; date: string; pct: number } => m !== null)
    : [];

  // V3.4.15+ — Wording adaptatif selon l'état.
  // PAS d'alerte journalière "en retard de X jours" — c'est anxiogène et faux
  // dans 80% des cas (chantier déjà terminé non clôturé). Le user reste maître.
  const rightLabel =
    state === 'completed' ? 'Livré le'
    : state === 'overdue' ? 'Date initialement prévue'
    : endMode             ? 'Livraison visée'
    :                       'Livraison estimée';
  const rightDateValue =
    state === 'completed' && completedDate ? completedDate
    : endDate;
  const headChipClass =
    state === 'completed' ? 'cr-plan-chip ok'
    : state === 'overdue' ? 'cr-plan-chip warn'
    : '';
  const headChipLabel =
    state === 'completed' ? '✓ Terminé'
    : state === 'overdue' ? '🟡 À ajuster'
    : null;
  const footerInvite =
    state === 'completed' ? 'Cliquez pour confirmer la réception et clôturer le chantier'
    : state === 'overdue' ? 'Cliquez pour mettre à jour la date prévue avec votre artisan'
    : null;

  return (
    <button type="button" className={`cr-panel cr-plan cr-plan-${state}`} onClick={onOpen}>
      <div className="cr-plan-head">
        <div className="cr-plan-title">Planning</div>
        <div className="cr-plan-chips">
          {headChipLabel && <span className={headChipClass}>{headChipLabel}</span>}
          {state === 'nominal' && weeks && <span className="cr-plan-chip">≈ {weeks} sem.</span>}
          {state !== 'completed' && rdvMarkers.length > 0 && (
            <span className="cr-plan-chip">📌 {rdvMarkers.length} RDV</span>
          )}
          <span className="cr-plan-chip ar"><ArrowRight /></span>
        </div>
      </div>
      <div className="cr-plan-timeline">
        <div className="cr-plan-side">
          <div className="lbl">{endMode ? 'Début estimé' : 'Début'}</div>
          <div className="dt">{fmtBubbleDate(debut)}</div>
        </div>
        <div className="cr-plan-bar">
          <div className="line" />
          <div className="cap" />
          {state === 'nominal' && rdvMarkers.map((m, i) => (
            <div
              key={i}
              className="cr-plan-rdv"
              style={{ left: `${m.pct * 100}%` }}
              title={`${m.titre} · ${fmtBubbleDate(m.date)}`}
            >
              <span className="rdv-t">{m.titre}</span>
              <span className="rdv-d">
                {new Date(m.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              </span>
              <span className="rdv-dot" />
            </div>
          ))}
          <div className="arrow" />
        </div>
        <div className="cr-plan-side right">
          <div className="lbl">{rightLabel}</div>
          <div className="dt">{rightDateValue ? fmtBubbleDate(rightDateValue) : '—'}</div>
        </div>
      </div>
      {/* V3.4.15+ — invitation discrète selon l'état (pas d'alerte intrusive) */}
      {footerInvite && (
        <div className="cr-plan-footer-invite">
          {state === 'completed' ? '✅ ' : '💡 '}
          {footerInvite}
        </div>
      )}
    </button>
  );
}

// ── DashboardHome ─────────────────────────────────────────────────────────────

function DashboardHome({
  lots, documents, docsByLot, displayMin, displayMax, budgetReel, contactsCount, refinedBreakdown, onAffineBudget,
  onGoToLot, onAddDoc, onGoToAssistant, onGoToTresorerie, onGoToDocuments, onGoToPlanning,
  onAddIntervenant, chantierId, token, urgentActions, budget,
}: {
  chantierNom: string;
  chantierEmoji?: string | null;
  budget?: BudgetSnapshot | null;
  lots: LotChantier[];
  documents: DocumentChantier[];
  docsByLot: Record<string, DocumentChantier[]>;
  displayMin: number;
  displayMax: number;
  budgetReel?: number | null;
  contactsCount?: number;
  refinedBreakdown: BreakdownItem[];
  onAffineBudget: () => void;
  onAddDevisForLot: (lotId: string) => void;
  onAddDocForLot: (lotId: string) => void;
  onGoToLot: (lotId: string) => void;
  onGoToAnalyse: () => void;
  onGoToPlanning: () => void;
  onAddDoc: () => void;
  onGoToAssistant: () => void;
  onGoToTresorerie: () => void;
  onGoToDocuments: () => void;
  onAddIntervenant: () => void;
  onDeleteLot: (lotId: string) => void;
  onDeleteDoc: (docId: string) => void;
  onGoToDiy: () => void;
  chantierId: string;
  token: string | null | undefined;
  onDocStatutUpdated?: (docId: string, statut: string) => void;
  onDocMoved?: (docId: string, newLotId: string) => void;
  urgentActions?: number;
}) {

  const [paiementOpen, setPaiementOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  // ── Budget réconcilié — fourni par ChantierCockpit (source unique) ────────
  const budgetTotaux = budget?.totaux ?? null;

  // ── Planning — instantané pour la bulle d'accueil ─────────────────────────
  // V3.4.16+ (2026-05-18) — Refresh sur event `chantierPlanningChanged` :
  // sans ça, la bulle reste figée sur les anciennes dates après modification
  // depuis l'onglet Planning. Un compteur `refreshKey` force le re-run du
  // useEffect quand l'event est reçu.
  const [planning, setPlanning] = useState<PlanningSnapshot | null>(null);
  const [planningRefreshKey, setPlanningRefreshKey] = useState(0);
  useEffect(() => {
    if (!chantierId || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/chantier/${chantierId}/planning`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (!res.ok) { setPlanning({ debut: null, finSouhaitee: null, estimatedEnd: null }); return; }
        const d = await res.json();
        const ends = ((d.lots ?? []) as { date_fin?: string | null }[])
          .map(l => l.date_fin)
          .filter((x): x is string => !!x)
          .sort();
        setPlanning({
          debut: d.dateDebutChantier ?? null,
          finSouhaitee: d.dateFinSouhaitee ?? null,
          estimatedEnd: ends.length ? ends[ends.length - 1] : null,
        });
      } catch {
        if (!cancelled) setPlanning({ debut: null, finSouhaitee: null, estimatedEnd: null });
      }
    })();
    return () => { cancelled = true; };
  }, [chantierId, token, planningRefreshKey]);

  // V3.4.16+ — Écoute l'event dispatché par usePlanning après chaque PATCH.
  // Force le refresh du snapshot planning de la bulle accueil.
  useEffect(() => {
    function onPlanningChanged(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.chantierId === chantierId) {
        setPlanningRefreshKey(k => k + 1);
      }
    }
    window.addEventListener('chantierPlanningChanged', onPlanningChanged);
    return () => window.removeEventListener('chantierPlanningChanged', onPlanningChanged);
  }, [chantierId]);

  // V3.4.15+ (2026-05-18) — Détection cohérence date livraison vs avancement réel.
  //
  // Problème observé : un chantier dont la date prévue est dépassée (ex: prévu
  // 27/04 mais on est le 18/05) continue d'afficher "Livraison estimée 27/04"
  // → mensonge. Mais on ne veut PAS afficher une alerte "en retard de X jours"
  // qui serait anxiogène et faux dans 80% des cas (chantier déjà terminé non
  // clôturé).
  //
  // Solution : 3 états selon avancement réel + date courante.
  //   - `completed` : tous les lots ont au moins une facture payée OU statut
  //     "termine"/"contrat_signe" → on affiche "Livré le [max(facture.created_at)]"
  //   - `overdue`   : ≥ 1 lot non terminé ET endDate < aujourd'hui → on remplace
  //     "Livraison estimée" par "Date initialement prévue" + chip "À ajuster"
  //   - `nominal`   : cas standard
  const planningState = useMemo<{ state: PlanningState; completedDate: string | null }>(() => {
    if (!planning || !lots || lots.length === 0) {
      return { state: 'nominal', completedDate: null };
    }
    // Un lot est "complété" si statut termine/contrat_signe OU ≥ 1 facture payée
    // (logique alignée sur computeLotCard / "Engagé" du dashboard).
    const isLotCompleted = (lot: LotChantier): boolean => {
      const s = String(lot.statut ?? '');
      if (s === 'termine' || s === 'contrat_signe') return true;
      const lotDocs = docsByLot[lot.id] ?? [];
      return lotDocs.some(d =>
        d.document_type === 'facture'
        && (d.facture_statut === 'payee' || d.facture_statut === 'payee_partiellement')
      );
    };
    const allCompleted = lots.every(isLotCompleted);
    if (allCompleted) {
      // Date livraison auto = date du dernier événement (facture payée la plus récente).
      const paidFactures = documents.filter(d =>
        d.document_type === 'facture'
        && (d.facture_statut === 'payee' || d.facture_statut === 'payee_partiellement')
      );
      const lastFactureDate = paidFactures
        .map(d => d.created_at)
        .filter((x): x is string => !!x)
        .sort()
        .pop() ?? null;
      return { state: 'completed', completedDate: lastFactureDate };
    }
    // Chantier en cours : check si date prévue dépassée.
    const endDateIso = planning.finSouhaitee ?? planning.estimatedEnd;
    if (endDateIso) {
      const endT = new Date(endDateIso).getTime();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (Number.isFinite(endT) && endT < today.getTime()) {
        return { state: 'overdue', completedDate: null };
      }
    }
    return { state: 'nominal', completedDate: null };
  }, [planning, lots, documents, docsByLot]);

  // RDV (localStorage) — jalons affichés sur la flèche temporelle.
  const [rdvs, setRdvs] = useState<{ titre: string; date: string }[]>([]);
  useEffect(() => {
    if (!chantierId) return;
    try {
      const raw = localStorage.getItem(`rdvs_${chantierId}`);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) setRdvs(parsed);
    } catch { /* ignore */ }
  }, [chantierId]);

  // Click-outside popover "À traiter"
  useEffect(() => {
    if (!actionsOpen) return;
    function onDown(e: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setActionsOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setActionsOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc); };
  }, [actionsOpen]);

  // ── Calculs financiers ─────────────────────────────────────────────────────
  const totalPaye = useMemo(() =>
    documents
      .filter(d => d.document_type === 'facture' && (d.facture_statut === 'payee' || d.facture_statut === 'payee_partiellement'))
      .reduce((sum, d) => sum + (d.facture_statut === 'payee_partiellement' ? (d.montant_paye ?? 0) : (d.montant ?? 0)), 0),
    [documents],
  );
  const decaisse  = budgetTotaux ? (budgetTotaux.paye + budgetTotaux.acompte) : totalPaye;
  const aPayer30j = budgetTotaux?.a_payer ?? 0;
  const fluxCertains = decaisse + aPayer30j;

  const budgetRef = (budgetReel && budgetReel > 0) ? budgetReel : displayMax;
  const hasBudgetRef = budgetRef > 0;
  const reste = Math.max(0, budgetRef - decaisse - aPayer30j);
  const pctFlux = hasBudgetRef && fluxCertains > 0 ? Math.round((fluxCertains / budgetRef) * 100) : 0;

  const total = lots.length;

  // ── À régler — source réconciliée (API budget, paiements Échéancier déduits).
  // Une facture 'recue' soldée via l'Échéancier a a_payer = 0 → exclue.
  const facturesARegler = useMemo(
    () => (budget?.factures ?? []).filter(f => f.a_payer > 0),
    [budget],
  );
  // Montant ET nombre dérivent de la même liste de factures → toujours cohérents.
  // (totaux.a_payer inclut aussi les devis signés sans facture : hors KPI "factures".)
  const aRegler   = facturesARegler.reduce((s, f) => s + f.a_payer, 0);
  const nbARegler = facturesARegler.length;

  // ── Liste exacte des actions du KPI "À traiter" ────────────────────────────
  const kpiActions = useMemo(() => {
    const list: { id: string; kind: 'facture' | 'devis'; label: string; sub: string; onClick: () => void }[] = [];
    // Factures à régler — réconciliées (a_payer réel, paiements Échéancier déduits)
    for (const f of facturesARegler) {
      const artisan = cleanCompanyName(f.nom) || 'Facture';
      list.push({
        id: f.id, kind: 'facture',
        label: `Régler ${artisan} (${fmtEurShort(f.a_payer)})`,
        sub: f.facture_statut === 'payee_partiellement' ? 'Solde restant' : 'Facture reçue non soldée',
        onClick: () => {
          setActionsOpen(false);
          // Signal one-shot : BudgetTab ouvrira filtré sur "À payer".
          try { sessionStorage.setItem('cockpitBudgetFilter', 'unpaid'); } catch { /* ignore */ }
          onGoToTresorerie();
        },
      });
    }
    // Devis à valider — source documents (non concernés par la réconciliation paiement)
    for (const d of documents) {
      if (d.document_type === 'devis' && (d.devis_statut as string) === 'recu') {
        list.push({
          id: d.id, kind: 'devis',
          label: `Valider ${d.nom ?? 'devis'}${d.montant ? ` (${fmtEurShort(d.montant)})` : ''}`,
          sub: 'En attente de signature',
          onClick: () => { setActionsOpen(false); onGoToDocuments(); },
        });
      }
    }
    return list;
  }, [facturesARegler, documents, onGoToTresorerie, onGoToDocuments]);

  // ── Stepper de démarrage ───────────────────────────────────────────────────
  const hasDevis  = documents.some(d => d.document_type === 'devis');
  const hasBudget = !!(budgetReel && budgetReel > 0);
  const setupSteps = [
    { label: 'Chantier créé', done: true,            cta: '',                    onCta: () => {} },
    { label: 'Saisir les artisans',   done: (contactsCount ?? 0) > 0, cta: 'Ajouter un artisan',  onCta: onAddIntervenant },
    { label: 'Ajouter les devis',     done: hasDevis,        cta: 'Importer un devis',   onCta: onAddDoc },
    { label: 'Valider le budget', done: hasBudget || refinedBreakdown.length > 0, cta: 'Définir le budget',   onCta: onAffineBudget },
  ];
  const doneCount  = setupSteps.filter(s => s.done).length;
  const activeIdx  = setupSteps.findIndex(s => !s.done);
  const setupDone  = activeIdx === -1;
  const activeStep = setupDone ? null : setupSteps[activeIdx];

  // ── Quick actions ──────────────────────────────────────────────────────────
  const quickActions = [
    {
      cls: 'cr-qa-1', title: 'Enregistrer un paiement', sub: 'Facture, acompte, dépense…',
      onClick: () => setPaiementOpen(true),
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" /><path d="M6 14h2" /></svg>,
    },
    {
      cls: 'cr-qa-2', title: 'Ajouter un devis ou facture', sub: 'Glisse-dépose · OCR IA',
      onClick: onAddDoc,
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M12 18v-6" /><path d="M9 15l3-3 3 3" /></svg>,
    },
    {
      cls: 'cr-qa-3', title: 'Ajouter un artisan', sub: 'Nouveau lot / intervenant',
      onClick: onAddIntervenant,
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6" /><path d="M22 11h-6" /></svg>,
    },
  ];

  const editLabel = refinedBreakdown.length > 0 ? 'Recalculer' : 'Affiner';

  return (
    <>
      {/* Header chantier rendu par ChantierCockpit (commun à tous les onglets). */}

      {/* ── Stepper de démarrage ──────────────────────────────────────────── */}
      {!setupDone && (
        <div className="cr-setup-bar">
          <div className="cr-setup-eyebrow">
            <span className="e1">Démarrage</span>
            <span className="e2">{doneCount} / {setupSteps.length} étapes</span>
            <span className="e3">
              {setupSteps.length - doneCount === 1 ? "Plus qu'une étape pour piloter en autonomie" : `${setupSteps.length - doneCount} étapes restantes`}
            </span>
          </div>
          <div className="cr-setup-steps">
            {setupSteps.map((step, i) => (
              <div key={step.label} className={`cr-setup-step ${step.done ? 'done' : i === activeIdx ? 'active' : ''}`}>
                <div className="cr-setup-dot">{step.done ? <CheckIcon /> : i + 1}</div>
                <span className="cr-setup-label">{step.label}</span>
              </div>
            ))}
          </div>
          {activeStep && (
            <button className="cr-setup-cta" onClick={activeStep.onCta}>
              {activeStep.cta}<ArrowRight />
            </button>
          )}
        </div>
      )}

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <div className="cr-quick-row">
        {quickActions.map(qa => (
          <button key={qa.title} type="button" onClick={qa.onClick} className={`cr-qa ${qa.cls}`}>
            <div className="cr-qa-ic">{qa.icon}</div>
            <div className="cr-qa-text">
              <div className="cr-qa-title">{qa.title}</div>
              <div className="cr-qa-sub">{qa.sub}</div>
            </div>
            <div className="cr-qa-arrow"><ChevronRight /></div>
          </button>
        ))}
      </div>

      {/* ── Grille principale ─────────────────────────────────────────────── */}
      <div className="cr-body-grid">

        {/* Colonne gauche : Planning + Intervenants */}
        <div className="cr-left-col">

          {/* Bulle Planning — V3.4.15+ : 3 états distincts (completed/overdue/nominal) */}
          {planning && (
            <PlanningBubble
              planning={planning}
              rdvs={rdvs}
              onOpen={onGoToPlanning}
              state={planningState.state}
              completedDate={planningState.completedDate}
            />
          )}

          {/* Intervenants */}
          <section className="cr-panel">
            <div className="cr-section-head">
              <div className="cr-sh-left">
                <h2 className="cr-sh-title">Intervenants</h2>
              </div>
            </div>

            {total === 0 ? (
              <div className="cr-empty">
                <span className="em">🏗</span>
                <p className="t">Aucun intervenant défini</p>
                <p className="s">Décrivez votre projet et l'IA génère la liste des intervenants et une estimation de budget.</p>
                <a href="/mon-chantier/nouveau" className="cta"><span>＋</span> Créer avec l'IA</a>
              </div>
            ) : (
              <div className={`cr-intervenants-wrap${lots.length > 6 ? ' scrollable' : ''}`}>
                <div className="cr-intervenants">
                  {lots.map(lot => (
                    <ProCard
                      key={lot.id}
                      lot={lot}
                      docs={docsByLot[lot.id] ?? []}
                      onOpen={() => onGoToLot(lot.id)}
                    />
                  ))}
                  {/* Ajout d'un intervenant directement depuis le dashboard. Réutilise EXACTEMENT
                      le même handler que le quick-action + le stepper (onAddIntervenant → onglet
                      Contacts + formulaire auto-ouvert) → contactsCount/lots/étape se rechaînent seuls. */}
                  <button
                    type="button"
                    onClick={onAddIntervenant}
                    className="cr-pro-add"
                    aria-label="Ajouter un intervenant"
                  >
                    <span className="cr-pro-add-ic" aria-hidden="true">＋</span>
                    <span className="cr-pro-add-label">Ajouter un intervenant</span>
                    <span className="cr-pro-add-sub">Nouveau lot / artisan</span>
                  </button>
                </div>
              </div>
            )}
          </section>

        </div>

        {/* Colonne droite : budget + stats + alerte */}
        <aside className="cr-right">

          <div className="cr-budget">
            <div className="cr-b-head">
              <div className="cr-b-title">Budget</div>
              <button className="cr-b-edit" onClick={onAffineBudget}>
                <EditIcon />{editLabel}
              </button>
            </div>

            <div className="cr-b-amount">
              <div className="v">{hasBudgetRef ? fmtEurShort(budgetRef) : '—'}</div>
              {displayMin > 0 && displayMax > 0 && (
                <div className="range">{fmtK(displayMin)} – {fmtK(displayMax)}</div>
              )}
              {pctFlux > 0 && <span className="pill">{pctFlux} %</span>}
            </div>
            <div className="cr-b-note">
              {hasBudget ? 'Budget défini · suivi des flux certains' : 'À affiner avec vos devis · estimation IA indicative'}
            </div>

            <div className="cr-b-bar">
              {hasBudgetRef ? (
                <>
                  <i className="seg-paid" style={{ width: `${Math.min(100, (decaisse / budgetRef) * 100)}%` }} />
                  <i className="seg-due"  style={{ width: `${Math.min(100, (aPayer30j / budgetRef) * 100)}%` }} />
                  <i className="seg-rest" style={{ width: `${Math.min(100, (reste / budgetRef) * 100)}%` }} />
                </>
              ) : (
                <i className="seg-rest" style={{ width: '100%' }} />
              )}
            </div>

            <div className="cr-b-legend">
              <div className="cr-b-leg-item paid">
                <span className="cr-b-leg-dot"><span className="d" />Décaissé</span>
                <span className="cr-b-leg-v">{decaisse > 0 ? fmtEurShort(decaisse) : '—'}</span>
              </div>
              <div className="cr-b-leg-item due">
                <span className="cr-b-leg-dot"><span className="d" />À payer</span>
                <span className="cr-b-leg-v">{aPayer30j > 0 ? fmtEurShort(aPayer30j) : '—'}</span>
              </div>
              <div className="cr-b-leg-item rest">
                <span className="cr-b-leg-dot"><span className="d" />Reste</span>
                <span className="cr-b-leg-v">{hasBudgetRef ? fmtEurShort(reste) : '—'}</span>
              </div>
            </div>

            <div className="cr-b-flux">
              <div className="cr-b-flux-ic"><TrendIcon /></div>
              <div className="cr-b-flux-text">
                <div className="cr-b-flux-l1">Flux certains · sorties inévitables</div>
                <div className="cr-b-flux-l2">Décaissé + à payer certain</div>
              </div>
              <div className="cr-b-flux-v">{fluxCertains > 0 ? fmtEurShort(fluxCertains) : '—'}</div>
            </div>
          </div>

          {/* Stats */}
          <div className="cr-stats">
            <button
              type="button"
              className={`cr-stat${aRegler > 0 ? ' clickable' : ''}`}
              onClick={aRegler > 0 ? () => {
                // Ouvre Budget & Trésorerie filtré sur "À payer".
                try { sessionStorage.setItem('cockpitBudgetFilter', 'unpaid'); } catch { /* ignore */ }
                onGoToTresorerie();
              } : undefined}
            >
              <span className="cr-stat-eyebrow"><span className="em">💸</span>À régler</span>
              <span className={`cr-stat-v ${aRegler > 0 ? 'orange' : 'sage'}`}>
                {aRegler > 0 ? fmtEurShort(aRegler) : '0 €'}
              </span>
              <span className="cr-stat-sub">
                {aRegler > 0
                  ? `${nbARegler} facture${nbARegler > 1 ? 's' : ''} à régler →`
                  : 'aucune facture en attente'}
              </span>
            </button>
            <div ref={actionsRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className={`cr-stat${urgentActions ? ' clickable' : ''}`}
                style={{ width: '100%' }}
                onClick={urgentActions ? () => setActionsOpen(o => !o) : undefined}
              >
                <span className="cr-stat-eyebrow"><span className="em">⚡</span>À traiter</span>
                <span className={`cr-stat-v ${urgentActions ? 'ink' : 'sage'}`}>
                  {urgentActions ? `${urgentActions} action${urgentActions > 1 ? 's' : ''}` : '—'}
                </span>
                <span className="cr-stat-sub">
                  {urgentActions ? (actionsOpen ? 'fermer ▴' : 'voir la liste ▾') : 'tout est sous contrôle'}
                </span>
              </button>
              {actionsOpen && kpiActions.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full mt-2 z-30 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden"
                  role="dialog"
                  aria-label="Actions à traiter"
                >
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-amber-50/50">
                    <p className="text-[11px] font-black text-amber-700 uppercase tracking-wider">
                      ⚡ À traiter — {kpiActions.length} {kpiActions.length > 1 ? 'actions' : 'action'}
                    </p>
                  </div>
                  <ul className="divide-y divide-gray-50 max-h-[55vh] overflow-y-auto">
                    {kpiActions.map(action => (
                      <li key={action.id}>
                        <button
                          type="button"
                          onClick={action.onClick}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-50/60 transition-colors text-left"
                        >
                          <span className="text-[18px] shrink-0 w-6 text-center">
                            {action.kind === 'facture' ? '💸' : '📋'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12.5px] font-semibold text-gray-900 truncate">{action.label}</p>
                            <p className="text-[10.5px] text-gray-500 mt-0.5">{action.sub}</p>
                          </div>
                          <span className="text-[10px] font-bold text-amber-700 shrink-0">
                            {action.kind === 'facture' ? 'Trésorerie →' : 'Documents →'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Alerte / entrée Assistant IA */}
          <div
            className="cr-alerts-card"
            role="button"
            tabIndex={0}
            onClick={onGoToAssistant}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onGoToAssistant(); }}
          >
            <div className={`cr-alerts-ic${urgentActions ? '' : ' ok'}`}>
              {urgentActions ? <AlertTriangle /> : <CheckIcon />}
            </div>
            <div className="cr-alerts-text">
              <div className="cr-alerts-title">
                {urgentActions
                  ? `${urgentActions} action${urgentActions > 1 ? 's' : ''} à traiter`
                  : 'Tout est sous contrôle'}
              </div>
              <div className="cr-alerts-sub">
                {urgentActions
                  ? 'Pilote IA · prêt à vous aider à les traiter'
                  : 'Aucune action en attente sur ce chantier'}
              </div>
            </div>
            <span className="cr-alerts-link">Assistant<ArrowRight /></span>
          </div>

        </aside>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {paiementOpen && (
        <PaiementDrawer
          chantierId={chantierId}
          token={token}
          lots={lots}
          onClose={() => setPaiementOpen(false)}
          onSuccess={() => {}}
        />
      )}
    </>
  );
}

export default DashboardHome;
