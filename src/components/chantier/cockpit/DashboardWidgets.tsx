import { useState, useEffect, type ReactNode } from 'react';
import {
  Plus, ChevronRight, Calendar, ExternalLink,
  LayoutGrid, List, MessageCircle,
} from 'lucide-react';
import type { LotChantier, DocumentChantier } from '@/types/chantier-ia';
import { ExpertAvatar } from '@/components/chantier/MATERIAL_IMAGES';
import { fmtK } from '@/lib/dashboardHelpers';

// ── État global du chantier ────────────────────────────────────────────────────

export function EtatChantierBlock({ lots, documents }: { lots: LotChantier[]; documents: DocumentChantier[] }) {
  if (lots.length === 0) return null;

  const total     = lots.length;
  const validated = lots.filter(l => ['ok', 'termine', 'en_cours', 'contrat_signe'].includes(l.statut ?? '')).length;
  const withDevis = lots.filter(l => documents.some(d => d.lot_id === l.id && d.document_type === 'devis') && !['ok', 'termine', 'en_cours', 'contrat_signe'].includes(l.statut ?? '')).length;
  const blocked   = total - validated - withDevis;
  const pct       = Math.round((validated / total) * 100);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">État du chantier</p>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {/* Validés */}
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-3 text-center">
          <p className="text-xl font-extrabold text-emerald-700">{validated}</p>
          <p className="text-[10px] font-semibold text-emerald-600 mt-0.5">Validés</p>
        </div>
        {/* Avec devis */}
        <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-3 text-center">
          <p className="text-xl font-extrabold text-amber-700">{withDevis}</p>
          <p className="text-[10px] font-semibold text-amber-600 mt-0.5">Avec devis</p>
        </div>
        {/* Bloqués */}
        <div className={`rounded-xl px-3 py-3 text-center ${blocked > 0 ? 'bg-red-50 border border-red-100' : 'bg-gray-50 border border-gray-100'}`}>
          <p className={`text-xl font-extrabold ${blocked > 0 ? 'text-red-600' : 'text-gray-400'}`}>{blocked}</p>
          <p className={`text-[10px] font-semibold mt-0.5 ${blocked > 0 ? 'text-red-500' : 'text-gray-400'}`}>Manquants</p>
        </div>
      </div>
      {/* Barre de progression globale */}
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden mb-1">
        <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">Progression globale</span>
        <span className="text-[10px] font-bold text-emerald-600">{pct}% validé</span>
      </div>
    </div>
  );
}

// ── Conseils proactifs du Maître d'œuvre ──────────────────────────────────────

interface MasterAdvice {
  icon: string;
  title: string;
  desc: string;
  cta?: { label: string; fn: () => void };
}

function extractArtisanName(docNom: string): string {
  return docNom
    .replace(/\.(pdf|PDF|jpg|jpeg|png|PNG|JPG|JPEG)$/i, '')
    .replace(/^(devis|facture|Devis|Facture)\s+[-–]?\s*/i, '')
    .trim();
}

function generateMasterAdvices(
  lots: LotChantier[],
  docsByLot: Record<string, DocumentChantier[]>,
  handlers: {
    onAddDevisForLot: (lotId: string) => void;
    onGoToPlanning: () => void;
    onGoToAssistant: () => void;
  },
): MasterAdvice[] {
  const advices: MasterAdvice[] = [];
  const nowMs = Date.now();
  const VALIDATED = ['ok', 'termine', 'en_cours', 'contrat_signe'];

  // ── 1. Aucun lot — créer le plan ──────────────────────────────────────────
  if (lots.length === 0) {
    return [{
      icon: '🏗️',
      title: 'Créez votre plan de chantier',
      desc: "Je génère pour vous la liste des corps d'état, une estimation de budget et les points de vigilance réglementaires. Cela prend moins de 2 minutes.",
      cta: { label: "Créer avec l'IA →", fn: () => { window.location.href = '/mon-chantier/nouveau'; } },
    }];
  }

  // ── 2. Lot avec 2+ devis → comparer ──────────────────────────────────────
  const lotMultiDevis = lots.find(l => {
    const d = (docsByLot[l.id] ?? []).filter(d => d.document_type === 'devis');
    return d.length >= 2;
  });
  if (lotMultiDevis) {
    const devisCount = (docsByLot[lotMultiDevis.id] ?? []).filter(d => d.document_type === 'devis').length;
    advices.push({
      icon: '⚖️',
      title: `Comparez les ${devisCount} devis pour « ${lotMultiDevis.nom} »`,
      desc: `Deux devis similaires peuvent cacher des différences importantes : main-d'œuvre incluse ou non, garanties, délais d'intervention. Je peux vous aider à identifier le meilleur rapport qualité/prix.`,
      cta: { label: 'Comparer avec moi →', fn: handlers.onGoToAssistant },
    });
  }

  // ── 3. Devis > 14 jours sans suite → relancer ─────────────────────────────
  const staleLotEntry = lots.reduce<{ lot: LotChantier; doc: DocumentChantier; ageDays: number } | null>((best, l) => {
    if (VALIDATED.includes(l.statut ?? '')) return best;
    const lotDevis = (docsByLot[l.id] ?? []).filter(d => d.document_type === 'devis');
    if (lotDevis.length === 0) return best;
    const newest = lotDevis.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b);
    const ageDays = Math.round((nowMs - new Date(newest.created_at).getTime()) / 86_400_000);
    if (ageDays < 14) return best;
    if (!best || ageDays > best.ageDays) return { lot: l, doc: newest, ageDays };
    return best;
  }, null);

  if (staleLotEntry) {
    const { lot, doc, ageDays } = staleLotEntry;
    const artisan = extractArtisanName(doc.nom);
    advices.push({
      icon: '📨',
      title: `Relancez ${artisan || lot.nom} — ${ageDays} jours sans réponse`,
      desc: `Les bons artisans ont souvent du travail et se réservent rarement plus de 3 à 4 semaines. Une relance rapide suffit souvent pour maintenir votre position dans leur planning.`,
      cta: { label: 'Aller à la messagerie →', fn: handlers.onGoToAssistant },
    });
  }

  // ── 4. Lots sans devis ────────────────────────────────────────────────────
  const lotsNoDev = lots.filter(l => {
    const d = (docsByLot[l.id] ?? []).filter(d => d.document_type === 'devis');
    return d.length === 0 && !VALIDATED.includes(l.statut ?? '');
  });
  if (lotsNoDev.length > 0 && advices.length < 2) {
    const names = lotsNoDev.slice(0, 2).map(l => `« ${l.nom} »`).join(', ');
    const more  = lotsNoDev.length > 2 ? ` et ${lotsNoDev.length - 2} autre${lotsNoDev.length - 2 > 1 ? 's' : ''}` : '';
    advices.push({
      icon: '📋',
      title: `Devis manquants : ${names}${more}`,
      desc: `Pour chaque poste, demandez au moins 3 devis à des artisans différents. Même sur les petits postes, la concurrence peut faire baisser les prix de 15 à 25 %.`,
      cta: { label: `Ajouter un devis pour "${lotsNoDev[0].nom}" →`, fn: () => handlers.onAddDevisForLot(lotsNoDev[0].id) },
    });
  }

  // ── 5. Bonne progression → conseil planning ───────────────────────────────
  if (advices.length === 0) {
    const validated = lots.filter(l => VALIDATED.includes(l.statut ?? '')).length;
    const pct = lots.length > 0 ? Math.round((validated / lots.length) * 100) : 0;
    advices.push({
      icon: pct >= 80 ? '🎯' : '📐',
      title: pct >= 80
        ? `${pct} % de vos intervenants validés — pensez à l'ordonnancement`
        : `Avancement : ${validated}/${lots.length} lots validés`,
      desc: pct >= 80
        ? `Vérifiez que les corps d'état s'enchaînent dans le bon ordre : démolition → gros œuvre → second œuvre → finitions. Un mauvais ordonnancement génère en moyenne 8 à 12 % de surcoût.`
        : `En avançant bien sur les devis en attente, vous pourrez caler un planning réaliste. Je peux vous aider à estimer les délais et anticiper les conflits entre corps d'état.`,
      cta: { label: 'Voir le planning →', fn: handlers.onGoToPlanning },
    });
  }

  return advices.slice(0, 2);
}

// ── Assistant actif — conseils proactifs ──────────────────────────────────────

export function AssistantActiveBlock({ lots, docsByLot, onAddDevisForLot, onGoToPlanning, onAddDoc, onGoToAssistant }: {
  lots: LotChantier[];
  docsByLot: Record<string, DocumentChantier[]>;
  onAddDevisForLot: (lotId: string) => void;
  onGoToPlanning: () => void;
  onAddDoc: () => void;
  onGoToAssistant: () => void;
}) {
  const advices = generateMasterAdvices(lots, docsByLot, { onAddDevisForLot, onGoToPlanning, onGoToAssistant });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden border-l-4 border-l-blue-400">
      <div className="flex items-start gap-4 px-5 py-5">
        {/* Avatar */}
        <div className="shrink-0">
          <ExpertAvatar size={52} showBadge />
        </div>
        {/* Conseils */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Votre Maître d'œuvre</p>
          <div className="space-y-5">
            {advices.map((adv, i) => (
              <div key={i} className={i > 0 ? 'pt-4 border-t border-gray-50' : ''}>
                <p className="font-bold text-gray-900 leading-snug mb-1.5">
                  <span className="mr-1.5">{adv.icon}</span>{adv.title}
                </p>
                <p className="text-sm text-gray-500 leading-relaxed mb-3">{adv.desc}</p>
                {adv.cta && (
                  <button
                    onClick={adv.cta.fn}
                    className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl px-4 py-2 transition-colors shadow-sm shadow-blue-100"
                  >
                    {adv.cta.label}
                  </button>
                )}
              </div>
            ))}
          </div>
          {/* CTA secondaire toujours visible */}
          <button
            onClick={onGoToAssistant}
            className="mt-4 flex items-center gap-2 text-sm font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl px-4 py-2 transition-all shadow-sm"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Poser une question →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard Home ─────────────────────────────────────────────────────────────

export function KpiCard({ icon, label, value, sub, accent = 'gray', action }: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'gray' | 'emerald' | 'blue' | 'red' | 'amber';
  action?: ReactNode;
}) {
  const colors: Record<string, { bg: string; value: string; sub: string }> = {
    gray:    { bg: 'bg-gray-50',    value: 'text-gray-900',    sub: 'text-gray-400'   },
    emerald: { bg: 'bg-emerald-50', value: 'text-emerald-700', sub: 'text-emerald-500' },
    blue:    { bg: 'bg-blue-50',    value: 'text-blue-700',    sub: 'text-blue-400'   },
    red:     { bg: 'bg-red-50',     value: 'text-red-600',     sub: 'text-red-400'    },
    amber:   { bg: 'bg-amber-50',   value: 'text-amber-700',   sub: 'text-amber-500'  },
  };
  const c = colors[accent];
  return (
    <div className={`${c.bg} rounded-2xl px-4 py-4 flex items-start gap-3`}>
      <span className="text-2xl leading-none mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
        <p className={`text-2xl font-extrabold tabular-nums leading-none ${c.value}`}>{value}</p>
        {sub && <p className={`text-xs font-medium mt-1 ${c.sub}`}>{sub}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

// ── Carte DIY — toujours présente dans la grille intervenants ─────────────────

export function DiyCard({ onAddDoc, onGoToDiy }: { onAddDoc: () => void; onGoToDiy: () => void }) {
  return (
    <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-5 flex flex-col gap-3 hover:border-gray-300 hover:shadow-sm transition-all">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center text-xl shrink-0">
          🔧
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-gray-800 truncate">Travaux par vous-même</p>
          <p className="text-[11px] text-gray-400">DIY · Auto-construction</p>
        </div>
        <button
          onClick={onGoToDiy}
          className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 shrink-0"
        >
          Détails →
        </button>
      </div>
      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed">
        Ajoutez vos factures de matériaux et photos pour calculer automatiquement vos économies réalisées.
      </p>
      {/* CTAs */}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={onAddDoc}
          className="flex-1 flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-xl px-4 py-2.5 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </button>
        <button
          onClick={onGoToDiy}
          className="flex items-center justify-center gap-1 border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-semibold rounded-xl px-4 py-2.5 transition-colors"
        >
          Voir détails
        </button>
      </div>
    </div>
  );
}

// ── Toggle vue cartes / liste ─────────────────────────────────────────────────

export function ViewToggle({ value, onChange }: { value: 'cards' | 'list'; onChange: (v: 'cards' | 'list') => void }) {
  return (
    <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
      <button
        onClick={() => onChange('cards')}
        className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all ${value === 'cards' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <LayoutGrid className="h-3 w-3" /> Cartes
      </button>
      <button
        onClick={() => onChange('list')}
        className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all ${value === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <List className="h-3 w-3" /> Liste
      </button>
    </div>
  );
}

// ── RDV reminder widget ───────────────────────────────────────────────────────

export interface RdvLight {
  id: string;
  titre: string;
  date: string;   // YYYY-MM-DD
  time?: string;  // HH:MM
  type: 'artisan' | 'visite' | 'signature' | 'autre';
}

export const RDV_EMOJI: Record<RdvLight['type'], string> = {
  artisan: '👷', visite: '🏠', signature: '✍️', autre: '📅',
};

export function RdvReminder({ chantierId, onGoToPlanning }: { chantierId: string; onGoToPlanning: () => void }) {
  const [rdvs, setRdvs] = useState<RdvLight[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`rdvs_${chantierId}`);
      if (!raw) return;
      const today = new Date().toISOString().slice(0, 10);
      const all: RdvLight[] = JSON.parse(raw);
      const upcoming = all
        .filter(r => r.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
        .slice(0, 3);
      setRdvs(upcoming);
    } catch { /* ignore */ }
  }, [chantierId]);

  if (rdvs.length === 0) return null;

  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const hasUrgent = rdvs.some(r => r.date <= tomorrow);

  function fmtRdvDate(iso: string, time?: string): string {
    const label =
      iso === today    ? "Aujourd'hui" :
      iso === tomorrow ? 'Demain' :
      new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    return time ? `${label} à ${time}` : label;
  }

  return (
    <button
      type="button"
      onClick={onGoToPlanning}
      className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all hover:shadow-sm ${
        hasUrgent
          ? 'bg-amber-50 border-amber-200 hover:bg-amber-100/70'
          : 'bg-blue-50 border-blue-100 hover:bg-blue-100/70'
      }`}
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
        hasUrgent ? 'bg-amber-100' : 'bg-blue-100'
      }`}>
        <Calendar className={`h-4 w-4 ${hasUrgent ? 'text-amber-600' : 'text-blue-500'}`} />
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        <p className={`text-xs font-bold leading-tight ${hasUrgent ? 'text-amber-700' : 'text-blue-700'}`}>
          {rdvs.length === 1 ? '1 rendez-vous à venir' : `${rdvs.length} rendez-vous à venir`}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {rdvs.map(r => (
            <span key={r.id} className="text-[11px] text-gray-600 flex items-center gap-1">
              <span>{RDV_EMOJI[r.type]}</span>
              <span className="font-medium truncate max-w-[120px]">{r.titre}</span>
              <span className={`shrink-0 ${r.date <= tomorrow ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
                · {fmtRdvDate(r.date, r.time)}
              </span>
            </span>
          ))}
        </div>
      </div>

      <ChevronRight className={`h-4 w-4 shrink-0 ${hasUrgent ? 'text-amber-400' : 'text-blue-300'}`} />
    </button>
  );
}

// ── Placeholder "bientôt disponible" ─────────────────────────────────────────

export function ComingSoon({ section, icon: Icon, description, cta }: {
  section: string; icon: React.ElementType;
  description: string; cta?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <div className="max-w-md mx-auto px-6 py-20 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-6">
        <Icon className="h-8 w-8 text-blue-400" />
      </div>
      <h2 className="font-bold text-gray-900 text-lg mb-2">{section}</h2>
      <p className="text-sm text-gray-400 leading-relaxed mb-7">{description}</p>
      {cta && (
        cta.href
          ? <a href={cta.href} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
              {cta.label} <ExternalLink className="h-4 w-4" />
            </a>
          : <button onClick={cta.onClick} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
              {cta.label}
            </button>
      )}
    </div>
  );
}
