import { useState, useMemo } from 'react';
import {
  Wand2, Upload, Sparkles, Layers, Route, FolderOpen, Lightbulb,
  Wallet, Activity, TrendingUp,
  FileText, Plus,
  ExternalLink, ChevronRight, BookOpen, Info,
  Users, Send, X, MessageCircle, ClipboardList,
  AlertCircle, ArrowRight, Calculator,
} from 'lucide-react';
import type { ChantierIAResult, LotChantier, TacheIA, StatutArtisan, EtapeRoadmap } from '@/types/chantier-ia';
import type { ConseilMO } from '@/components/chantier/ConseilsChantier';

import PanneauDetail from '@/components/chantier/cockpit/PanneauDetail';
import TimelineHorizontale from '@/components/chantier/cockpit/TimelineHorizontale';
import SimulateurOptions, { type OptionTravaux } from '@/components/chantier/cockpit/SimulateurOptions';
import DiagnosticProjet from '@/components/chantier/DiagnosticProjet';
import ConseilsChantier from '@/components/chantier/ConseilsChantier';
import LotGrid from '@/components/chantier/lots/LotGrid';
import ChantierTimeline from '@/components/chantier/ChantierTimeline';
import DocumentsSection from '@/components/chantier/nouveau/DocumentsSection';
import BudgetFiabilite from '@/components/chantier/nouveau/BudgetFiabilite';
import BudgetGlobal from '@/components/chantier/BudgetGlobal';
import SimulationFinancement from '@/components/chantier/financement/SimulationFinancement';
import SyntheseChantier from '@/components/chantier/SyntheseChantier';
import JournalChantier from '@/components/chantier/JournalChantier';
import { getFormaliteLinks } from '@/lib/formalitesLinks';

// ── Props ─────────────────────────────────────────────────────────────────────

interface DashboardChantierProps {
  result: ChantierIAResult;
  chantierId: string | null;
  onAmeliorer: () => void;
  onNouveau: () => void;
  onToggleTache?: (todoId: string, done: boolean) => void;
  onLotStatutChange?: (lotId: string, statut: StatutArtisan) => void;
  token?: string | null;
  userId?: string | null;
}

// ── Options simulateur par type de travaux ────────────────────────────────────

const REVETEMENT_OPTIONS: OptionTravaux[] = [
  { id: 'gravier', label: 'Gravier', emoji: '⚪', budgetMultiplier: 0.6, durabilite: 2, entretien: 2, drainage: 5, description: 'Économique, perméable, mais demande un entretien régulier (désherbage).' },
  { id: 'paves',   label: 'Pavés',   emoji: '🧱', budgetMultiplier: 1.2, durabilite: 5, entretien: 4, drainage: 3, description: 'Esthétique et durable. Peut être déposé/reposé facilement pour accéder aux réseaux.' },
  { id: 'beton',   label: 'Béton',   emoji: '🔲', budgetMultiplier: 1.0, durabilite: 4, entretien: 5, drainage: 1, description: 'Solide et peu coûteux. Sensible aux fissures et peu perméable.' },
  { id: 'enrobe',  label: 'Enrobé',  emoji: '🛣️', budgetMultiplier: 1.1, durabilite: 4, entretien: 5, drainage: 1, description: 'Propre et résistant. Nécessite un ensoleillement correct pour se stabiliser.' },
];

const TERRASSE_OPTIONS: OptionTravaux[] = [
  { id: 'bois',       label: 'Bois exotique', emoji: '🪵', budgetMultiplier: 1.2, durabilite: 3, entretien: 2, description: 'Chaud et naturel. Nécessite une lasure annuelle pour rester beau.' },
  { id: 'composite',  label: 'Composite',     emoji: '♻️', budgetMultiplier: 1.4, durabilite: 5, entretien: 5, description: 'Zéro entretien, imputrescible. Investissement plus élevé mais durable.' },
  { id: 'carrelage',  label: 'Carrelage',     emoji: '🏁', budgetMultiplier: 1.0, durabilite: 5, entretien: 4, description: 'Classique et résistant. Glissant mouillé si mal choisi.' },
  { id: 'beton_cire', label: 'Béton ciré',    emoji: '🔲', budgetMultiplier: 0.8, durabilite: 3, entretien: 3, description: 'Moderne et uni. Sensible aux chocs et aux taches sans bonne protection.' },
];

const FACADE_OPTIONS: OptionTravaux[] = [
  { id: 'enduit',     label: 'Enduit',           emoji: '🏠', budgetMultiplier: 1.0, durabilite: 4, entretien: 3, description: 'Solution classique. Peut se fissurer si le support bouge.' },
  { id: 'bardage_b',  label: 'Bardage bois',     emoji: '🪵', budgetMultiplier: 1.3, durabilite: 3, entretien: 2, description: 'Esthétique chaleureux mais demande un traitement régulier.' },
  { id: 'bardage_c',  label: 'Bardage composite',emoji: '♻️', budgetMultiplier: 1.5, durabilite: 5, entretien: 5, description: 'Imputrescible, résistant UV. Le meilleur rapport durabilité/entretien.' },
  { id: 'crepit',     label: 'Crépi',            emoji: '🎨', budgetMultiplier: 0.8, durabilite: 3, entretien: 3, description: 'Économique et rapide. Moins isolant et vieillissant moins bien.' },
];

const ISOLATION_OPTIONS: OptionTravaux[] = [
  { id: 'laine_roche',  label: 'Laine de roche',    emoji: '🪨', budgetMultiplier: 1.0, durabilite: 5, entretien: 5, description: 'Très bon isolant thermique et acoustique. Incombustible.' },
  { id: 'ouate',        label: 'Ouate cellulose',   emoji: '♻️', budgetMultiplier: 1.1, durabilite: 4, entretien: 5, description: 'Écologique, bonne inertie thermique. Sensible à l\'humidité si mal posé.' },
  { id: 'polyurethane', label: 'Polyuréthane',      emoji: '🫧', budgetMultiplier: 1.3, durabilite: 5, entretien: 5, description: 'Meilleur lambda du marché. Solution parfaite quand l\'épaisseur est limitée.' },
];

const WORK_OPTIONS_MAP: Record<string, OptionTravaux[]> = {
  'revêtement': REVETEMENT_OPTIONS,
  'revetement': REVETEMENT_OPTIONS,
  'allée':      REVETEMENT_OPTIONS,
  'allee':      REVETEMENT_OPTIONS,
  'terrasse':   TERRASSE_OPTIONS,
  'facade':     FACADE_OPTIONS,
  'façade':     FACADE_OPTIONS,
  'isolation':  ISOLATION_OPTIONS,
};

function detectOptions(result: ChantierIAResult): OptionTravaux[] | null {
  const haystack = [
    result.prochaineAction?.titre ?? '',
    result.prochaineAction?.detail ?? '',
    ...(result.lignesBudget ?? []).slice(0, 2).map((l) => l.label),
    result.nom,
  ].join(' ').toLowerCase();

  for (const [key, opts] of Object.entries(WORK_OPTIONS_MAP)) {
    if (haystack.includes(key)) return opts;
  }
  return null;
}

// ── Helpers calcul santé ──────────────────────────────────────────────────────

function getMarketRange(result: ChantierIAResult): { min: number; max: number } | null {
  const lots = result.lots ?? [];
  if (!lots.length) return null;
  let min = 0; let max = 0; let hasData = false;
  for (const lot of lots) {
    if (lot.budget_min_ht != null && lot.budget_max_ht != null) {
      min += lot.budget_min_ht; max += lot.budget_max_ht; hasData = true;
    }
  }
  return hasData ? { min: Math.round(min * 1.2), max: Math.round(max * 1.2) } : null;
}

type SanteScore = { score: number; label: string; color: 'emerald' | 'blue' | 'amber' | 'rose' };

function getSante(result: ChantierIAResult): SanteScore {
  let pts = 0; let total = 0;
  const nbLots = (result.lots ?? []).length || (result.artisans ?? []).length;
  const nbOk   = (result.lots ?? []).filter((l) => l.statut === 'ok').length;
  total += 25; if (nbLots > 0) pts += Math.round((nbOk / nbLots) * 25);
  const taches = result.taches ?? [];
  total += 20; if (taches.length > 0) pts += Math.round((taches.filter((t) => t.done).length / taches.length) * 20);
  total += 15; if ((result.formalites ?? []).length > 0) pts += 15;
  const range = getMarketRange(result);
  total += 20;
  if (range) {
    const budget = result.budgetTotal;
    if (budget >= range.min && budget <= range.max * 1.1) pts += 20;
    else if (budget >= range.min * 0.85) pts += 10;
  } else { pts += 10; }
  total += 10; if ((result.roadmap ?? []).length > 0) pts += 10;
  total += 10; if ((result.aides ?? []).some((a) => a.eligible)) pts += 10;
  const score = Math.round((pts / total) * 100);
  if (score >= 75) return { score, label: 'Projet bien préparé',        color: 'emerald' };
  if (score >= 50) return { score, label: 'Quelques points à sécuriser', color: 'blue'    };
  if (score >= 30) return { score, label: 'Projet à consolider',         color: 'amber'   };
  return                   { score, label: 'À structurer',               color: 'rose'    };
}

type HealthPoint = { type: 'ok' | 'warn'; label: string };

function getHealthPoints(result: ChantierIAResult): HealthPoint[] {
  const points: HealthPoint[] = [];
  const range = getMarketRange(result);
  const nbOk = (result.lots ?? []).filter((l) => l.statut === 'ok').length;
  if (nbOk > 0) points.push({ type: 'ok', label: `${nbOk} artisan${nbOk > 1 ? 's' : ''} confirmé${nbOk > 1 ? 's' : ''}` });
  if ((result.aides ?? []).some((a) => a.eligible)) {
    const total = (result.aides ?? []).filter((a) => a.eligible && a.montant).reduce((s, a) => s + (a.montant ?? 0), 0);
    points.push({ type: 'ok', label: `Aides disponibles${total > 0 ? ` (~${total.toLocaleString('fr-FR')} €)` : ''}` });
  }
  if (range && result.budgetTotal >= range.min && result.budgetTotal <= range.max * 1.1) {
    points.push({ type: 'ok', label: 'Budget cohérent avec le marché' });
  }
  if ((result.roadmap ?? []).length > 0) points.push({ type: 'ok', label: 'Planning des phases défini' });
  const nbATrouver = (result.lots ?? []).filter((l) => !l.id?.startsWith('fallback-') && l.statut === 'a_trouver').length;
  if (nbATrouver > 0) points.push({ type: 'warn', label: `${nbATrouver} lot${nbATrouver > 1 ? 's' : ''} sans artisan` });
  if (range && result.budgetTotal > range.max * 1.1) points.push({ type: 'warn', label: 'Budget au-dessus du marché' });
  if (range && result.budgetTotal < range.min * 0.85) points.push({ type: 'warn', label: 'Budget potentiellement sous-estimé' });
  const nbObligatoires = (result.formalites ?? []).filter((f) => f.obligatoire).length;
  if (nbObligatoires > 0) points.push({ type: 'warn', label: `${nbObligatoires} formalité${nbObligatoires > 1 ? 's' : ''} obligatoire${nbObligatoires > 1 ? 's' : ''}` });
  const urgentes = (result.taches ?? []).filter((t) => !t.done && t.priorite === 'urgent').length;
  if (urgentes > 0) points.push({ type: 'warn', label: `${urgentes} tâche${urgentes > 1 ? 's' : ''} urgente${urgentes > 1 ? 's' : ''}` });
  return points;
}

// ── Génère un texte "Pourquoi maintenant" contextualisé ──────────────────────

function getPourquoiText(result: ChantierIAResult, currentPhase: string): string {
  const titre = result.prochaineAction?.titre?.toLowerCase() ?? '';
  const nbATrouver = (result.lots ?? []).filter((l) => !l.id?.startsWith('fallback-') && l.statut === 'a_trouver').length;
  const urgentes = (result.taches ?? []).filter((t) => !t.done && t.priorite === 'urgent').length;
  const nextEtape = (result.roadmap ?? []).find((e, i, arr) => {
    const currIdx = arr.findIndex((x) => x.isCurrent);
    return i === currIdx + 1;
  });

  if (titre.includes('devis') || titre.includes('artisan') || titre.includes('chiffr')) {
    return `Vous êtes en phase "${currentPhase}". Pour avancer, vous devez recevoir et comparer des devis — c'est la seule façon de valider votre budget estimatif et de sécuriser vos lots.${nbATrouver > 0 ? ` Il vous manque encore ${nbATrouver} artisan${nbATrouver > 1 ? 's' : ''}.` : ''} Sans devis signés, impossible de démarrer les travaux.`;
  }
  if (titre.includes('permit') || titre.includes('déclar') || titre.includes('formalit') || titre.includes('pc ') || titre.includes('dp ')) {
    return `Les démarches administratives ont des délais incompressibles (2 à 3 mois pour un permis de construire). Attendre retarderait tout votre planning. La phase "${nextEtape?.nom ?? 'suivante'}" ne peut démarrer qu'après obtention des autorisations.`;
  }
  if (titre.includes('financement') || titre.includes('prêt') || titre.includes('budget')) {
    return `Boucler votre plan de financement maintenant vous évite les mauvaises surprises en cours de chantier. Une fois les artisans retenus, les délais de banque (4-8 semaines) peuvent bloquer le démarrage.`;
  }
  if (urgentes > 0) {
    return `Vous avez ${urgentes} tâche${urgentes > 1 ? 's' : ''} urgente${urgentes > 1 ? 's' : ''} en attente. Chaque semaine de retard en phase "${currentPhase}" se répercute directement sur la date de livraison.${nextEtape ? ` La prochaine étape "${nextEtape.nom}" est conditionnée à cette action.` : ''}`;
  }
  return `Vous êtes en phase "${currentPhase}" — c'est le moment stratégique pour cette action. En tant que maître d'œuvre, je surveille l'enchaînement des phases : agir maintenant évite les goulets d'étranglement qui retardent la livraison.${nextEtape ? ` Objectif : atteindre "${nextEtape.nom}" sans délai.` : ''}`;
}

// ── Génère les contenus enrichis d'une étape roadmap ─────────────────────────

function getEtapeEnrichie(etape: EtapeRoadmap): {
  actions: string[];
  decisions: string[];
  documents: string[];
} {
  const nom = etape.nom.toLowerCase();

  if (nom.includes('prépa') || nom.includes('design') || nom.includes('concept')) {
    return {
      actions:   ['Clarifier vos besoins et contraintes', 'Consulter un architecte si > 150m²', 'Faire une visite du site avec un géomètre', 'Définir les lots de travaux'],
      decisions: ['Budget cible TTC', 'Maîtrise d\'œuvre ou auto-gestion', 'Planning global et contraintes de dates'],
      documents: ['Plans existants du logement', 'Titre de propriété', 'Règles du PLU (Plan Local d\'Urbanisme)', 'Photos de l\'existant'],
    };
  }
  if (nom.includes('admin') || nom.includes('permit') || nom.includes('déclar') || nom.includes('autoris')) {
    return {
      actions:   ['Déposer la déclaration préalable ou le permis de construire', 'Attendre l\'instruction (1 à 3 mois)', 'Afficher le panneau de chantier après accord', 'Vérifier les recours des tiers (2 mois après affichage)'],
      decisions: ['Type de dossier (DP ou PC) selon surface', 'Recours à un architecte (obligatoire > 150m² surface plancher)', 'Date de dépôt cible'],
      documents: ['Formulaire Cerfa 13703 (DP) ou 13406 (PC)', 'Plan de masse coté', 'Plan de situation', 'Notice descriptive des travaux', 'Photos de l\'environnement'],
    };
  }
  if (nom.includes('artisan') || nom.includes('devis') || nom.includes('chiffr') || nom.includes('consul')) {
    return {
      actions:   ['Contacter 3 artisans par lot minimum', 'Vérifier les qualifications RGE si travaux énergétiques', 'Demander les références chantiers récents', 'Comparer les devis sur les mêmes bases'],
      decisions: ['Critères de sélection (prix, délai, références)', 'Coordination des lots (gros œuvre avant second œuvre)', 'Acomptes et modalités de paiement'],
      documents: ['Devis signés avec délai d\'exécution', 'Attestation d\'assurance décennale', 'Extrait Kbis ou SIRET', 'Certificat RGE si applicable'],
    };
  }
  if (nom.includes('travaux') || nom.includes('réalisa') || nom.includes('chantier')) {
    return {
      actions:   ['Ouvrir le chantier et sécuriser le périmètre', 'Vérifier les livraisons de matériaux', 'Organiser les réunions de chantier hebdomadaires', 'Consigner les réserves par écrit'],
      decisions: ['Ordre d\'intervention des corps de métier', 'Gestion des imprévus et travaux supplémentaires', 'Validation des étapes clés avant suite'],
      documents: ['Ordres de service', 'PV de réunion de chantier', 'Bons de livraison matériaux', 'Photos d\'avancement hebdomadaires'],
    };
  }
  if (nom.includes('récep') || nom.includes('livrai') || nom.includes('fin')) {
    return {
      actions:   ['Réaliser le tour complet avec chaque artisan', 'Consigner toutes les réserves sur le PV', 'Activer les garanties (parfait achèvement, biennale, décennale)', 'Retenir la dernière tranche jusqu\'à levée des réserves'],
      decisions: ['Réception avec ou sans réserves', 'Délai accordé pour lever les réserves', 'Retenue de garantie (5% pendant 1 an)'],
      documents: ['Procès-verbal de réception', 'Liste de réserves signée', 'Garantie de parfait achèvement', 'DOE (Dossier des Ouvrages Exécutés)'],
    };
  }
  // Default
  return {
    actions:   ['Suivre l\'avancement selon le planning', 'Documenter les décisions importantes', 'Communiquer avec les intervenants'],
    decisions: ['Arbitrages techniques ou budgétaires', 'Ajustements du planning si nécessaire'],
    documents: ['Compte-rendus de réunion', 'Devis complémentaires si besoin'],
  };
}

// ── Constantes couleurs ───────────────────────────────────────────────────────

const SANTE_COLORS = {
  emerald: { bar: 'from-emerald-500 to-teal-400', text: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
  blue:    { bar: 'from-blue-500 to-cyan-400',     text: 'text-blue-300',    bg: 'bg-blue-500/10',    border: 'border-blue-500/25'    },
  amber:   { bar: 'from-amber-500 to-yellow-400',  text: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25'   },
  rose:    { bar: 'from-rose-500 to-pink-400',     text: 'text-rose-300',    bg: 'bg-rose-500/10',    border: 'border-rose-500/25'    },
};

// Couleurs SVG pour la jauge circulaire (valeurs hex, pas des classes Tailwind)
const SANTE_GAUGE_STROKE: Record<string, string> = {
  emerald: '#34d399',
  blue:    '#60a5fa',
  amber:   '#fbbf24',
  rose:    '#fb7185',
};

// ── Jauge circulaire SVG ──────────────────────────────────────────────────────

function CircularGauge({ score, color, label }: { score: number; color: string; label: string }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.max(score, 3) / 100) * circ;
  const stroke = SANTE_GAUGE_STROKE[color] ?? '#60a5fa';
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" strokeLinecap="round" />
          <circle
            cx="60" cy="60" r={r} fill="none"
            stroke={stroke} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.7s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white leading-none">{score}%</span>
          <span className="text-[9px] text-slate-500 mt-0.5 leading-none">score</span>
        </div>
      </div>
      <p className={`text-xs font-semibold mt-1.5 ${SANTE_COLORS[color as keyof typeof SANTE_COLORS]?.text ?? 'text-blue-300'}`}>{label}</p>
    </div>
  );
}

const STATUT_COLORS: Record<string, string> = {
  a_trouver:   'bg-orange-500/15 text-orange-300 border-orange-500/25',
  a_contacter: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  ok:          'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
};
const STATUT_LABELS: Record<string, string> = {
  a_trouver:   'À trouver',
  a_contacter: 'À contacter',
  ok:          'Confirmé',
};

// ── Types panneau ─────────────────────────────────────────────────────────────

type PanneauId = 'sante' | 'budget' | 'lots' | 'planning' | 'artisans' | 'documents' | 'conseils' | 'budget-detail' | 'timeline-detail' | null;

// ── Questions rapides pour le chat MO ─────────────────────────────────────────

const QUICK_QUESTIONS = [
  'Comment optimiser mon budget ?',
  'Quels artisans dois-je contacter en premier ?',
  'Quels sont les risques de mon chantier ?',
  'Comment négocier les devis ?',
];

// ── Composant ─────────────────────────────────────────────────────────────────

export default function DashboardChantier({
  result,
  chantierId,
  onAmeliorer,
  onNouveau,
  onToggleTache,
  onLotStatutChange,
  token,
  userId,
}: DashboardChantierProps) {
  const [panneau, setPanneau]       = useState<PanneauId>(null);
  const [taches, setTaches]         = useState<TacheIA[]>(result.taches ?? []);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lotStatuts, setLotStatuts] = useState<Record<string, StatutArtisan>>(
    () => Object.fromEntries((result.lots ?? []).map((l) => [l.id, l.statut])),
  );
  const [conseils, setConseils]     = useState<ConseilMO[]>([]);
  const [uploadTrigger, setUploadTrigger] = useState<'document' | 'devis' | null>(null);
  const [selectedEtape, setSelectedEtape] = useState<EtapeRoadmap | null>(null);
  const [showWhyAction, setShowWhyAction] = useState(false);
  const [optionBudget, setOptionBudget]   = useState<number | null>(null);
  const [showChat, setShowChat]           = useState(false);
  const [chatInput, setChatInput]         = useState('');

  // ── Calculs mémo ────────────────────────────────────────────────────────────
  const sante        = useMemo(() => getSante(result),         [result]);
  const healthPoints = useMemo(() => getHealthPoints(result),  [result]);
  const range        = useMemo(() => getMarketRange(result),   [result]);
  const santeColors  = SANTE_COLORS[sante.color];
  const options      = useMemo(() => detectOptions(result),    [result]);

  const okPoints   = healthPoints.filter((p) => p.type === 'ok').slice(0, 3);
  const warnPoints = healthPoints.filter((p) => p.type === 'warn').slice(0, 3);

  const nbATrouver = (result.lots ?? [])
    .filter((l) => !l.id.startsWith('fallback-') && (lotStatuts[l.id] ?? l.statut) === 'a_trouver').length;

  // Phase courante
  const currentEtape = (result.roadmap ?? []).find((e) => e.isCurrent);
  const currentPhase = currentEtape?.nom ?? 'Préparation';

  // Budget affiché (option sélectionnée ou budget de base)
  const displayBudget = optionBudget ?? result.budgetTotal;
  const budgetDelta   = optionBudget != null ? optionBudget - result.budgetTotal : 0;

  // Badge confiance budget
  const budgetConfidence = (() => {
    const hasMarket = (result.lots ?? []).some((l) => l.budget_min_ht != null);
    if (hasMarket) return { label: 'Excellente', color: 'emerald' };
    if ((result.roadmap ?? []).length > 0) return { label: 'Bonne', color: 'blue' };
    return { label: 'Estimative', color: 'amber' };
  })();

  // Tâches urgentes
  const nbUrgentes = taches.filter((t) => !t.done && t.priorite === 'urgent').length;

  // Texte "Pourquoi maintenant"
  const pourquoiText = useMemo(() => getPourquoiText(result, currentPhase), [result, currentPhase]);

  // Contenu enrichi de l'étape sélectionnée
  const etapeEnrichie = useMemo(
    () => selectedEtape ? getEtapeEnrichie(selectedEtape) : null,
    [selectedEtape],
  );

  const toggleTache = (idx: number) => {
    setTaches((prev) => prev.map((t, i) => (i === idx ? { ...t, done: !t.done } : t)));
    const tache = taches[idx];
    if (tache?.id && onToggleTache) onToggleTache(tache.id, !tache.done);
  };

  const openPanneau = (id: PanneauId) => setPanneau(id);
  const closePanneau = () => { setPanneau(null); setSelectedEtape(null); };

  const handleEtapeClick = (etape: EtapeRoadmap) => {
    setSelectedEtape(etape);
    openPanneau('timeline-detail');
  };

  const handleOptionSelect = (option: OptionTravaux) => {
    setOptionBudget(Math.round(result.budgetTotal * option.budgetMultiplier));
  };

  const handleChatSubmit = (question: string) => {
    if (!question.trim()) return;
    setShowChat(false);
    setChatInput('');
    onAmeliorer();
  };

  // ── Titre du panneau ────────────────────────────────────────────────────────
  const panneauTitle: Record<NonNullable<PanneauId>, string> = {
    sante:          'Diagnostic du projet',
    budget:         'Détail du budget',
    lots:           'Lots de travaux',
    planning:       'Planning du chantier',
    artisans:       'Artisans par lot',
    documents:      'Documents du chantier',
    conseils:       'Conseils maître d\'œuvre',
    'budget-detail':'Budget & financement',
    'timeline-detail': selectedEtape ? `Étape ${selectedEtape.numero} — ${selectedEtape.nom}` : 'Détail de l\'étape',
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-[#0a0f1e]">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="flex-none border-b border-white/[0.05] px-4 lg:px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Emoji + nom */}
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-xl shrink-0 select-none">
            {result.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-sm sm:text-base leading-tight truncate">{result.nom}</h1>
            <p className="text-slate-500 text-xs truncate hidden sm:block">{currentPhase}</p>
          </div>

          {/* Budget header — reflète l'option choisie */}
          <div className="hidden sm:block shrink-0 text-right">
            <p className="text-white font-bold text-lg leading-none">
              {displayBudget.toLocaleString('fr-FR')} €
            </p>
            {budgetDelta !== 0 ? (
              <p className={`text-[10px] mt-0.5 font-semibold ${budgetDelta > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {budgetDelta > 0 ? '+' : ''}{budgetDelta.toLocaleString('fr-FR')} € vs base
              </p>
            ) : (
              <p className="text-slate-500 text-[10px] mt-0.5">budget estimé TTC</p>
            )}
          </div>

          {/* Séparateur */}
          <div className="hidden sm:block h-6 w-px bg-white/[0.08] mx-1 shrink-0" />

          {/* CTAs header */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { openPanneau('documents'); setUploadTrigger('document'); }}
              className="flex items-center gap-1.5 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 text-xs font-medium rounded-lg px-3 py-1.5 transition-all"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Document</span>
            </button>
            <button
              onClick={() => { openPanneau('documents'); setUploadTrigger('devis'); }}
              className="flex items-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-medium rounded-lg px-3 py-1.5 transition-all"
            >
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Demander devis</span>
            </button>
            {chantierId && (
              <a
                href="/mon-chantier"
                className="hidden lg:flex items-center gap-1 text-slate-500 hover:text-white text-xs transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Mes chantiers
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ── COCKPIT MAIN ───────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-3 p-3 lg:p-4">

        {/* ── Col 1 : Santé du projet ──────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col gap-3 overflow-y-auto min-h-0">
          <div className={`bg-[#0d1525] border ${santeColors.border} rounded-2xl p-4 flex-none`}>
            {/* En-tête */}
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-7 h-7 rounded-lg ${santeColors.bg} border ${santeColors.border} flex items-center justify-center shrink-0`}>
                <Activity className={`h-3.5 w-3.5 ${santeColors.text}`} />
              </div>
              <p className="text-white font-semibold text-xs flex-1">Santé du projet</p>
            </div>

            {/* Jauge circulaire */}
            <div className="flex justify-center mb-3">
              <CircularGauge score={sante.score} color={sante.color} label={sante.label} />
            </div>

            {/* Points */}
            <div className="space-y-1.5">
              {okPoints.map((p, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-emerald-400 shrink-0 mt-0.5">✔</span>
                  <span className="text-slate-300 leading-tight">{p.label}</span>
                </div>
              ))}
              {warnPoints.map((p, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-amber-400 shrink-0 mt-0.5">⚠</span>
                  <span className="text-slate-300 leading-tight">{p.label}</span>
                </div>
              ))}
            </div>

            {/* Bouton diagnostic complet */}
            <button
              onClick={() => openPanneau('sante')}
              className="mt-4 w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/[0.07] hover:border-white/[0.14] rounded-xl py-2 transition-all"
            >
              Voir le diagnostic complet
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Tâches urgentes si présentes */}
          {nbUrgentes > 0 && (
            <div className="bg-amber-500/[0.07] border border-amber-500/20 rounded-2xl p-3 flex-none">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <p className="text-amber-300 text-xs font-semibold">{nbUrgentes} tâche{nbUrgentes > 1 ? 's' : ''} urgente{nbUrgentes > 1 ? 's' : ''}</p>
              </div>
              <div className="space-y-1.5">
                {taches.filter((t) => !t.done && t.priorite === 'urgent').slice(0, 3).map((t, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <button
                      onClick={() => toggleTache(taches.indexOf(t))}
                      className="w-3.5 h-3.5 rounded border border-amber-500/40 flex items-center justify-center shrink-0 mt-0.5 hover:border-amber-400 transition-colors"
                    >
                      {t.done && <span className="text-[8px] text-amber-400">✔</span>}
                    </button>
                    <p className="text-slate-300 text-xs leading-tight">{t.titre}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Col 2 : Prochaine décision (CENTRE) ──────────────────────────── */}
        <div className="flex flex-col gap-3 overflow-y-auto min-h-0">
          {/* Bloc décision — visuellement dominant */}
          <div className="bg-gradient-to-br from-violet-950/60 to-purple-950/50 border border-violet-500/30 rounded-2xl p-5 flex-none shadow-lg shadow-violet-900/20">
            {/* Badge phase + deadline */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-1.5 bg-violet-500/20 border border-violet-500/30 rounded-full px-2.5 py-1">
                <Sparkles className="h-3 w-3 text-violet-400" />
                <span className="text-[11px] font-bold text-violet-300 uppercase tracking-wider">Prochaine décision</span>
              </div>
              {result.prochaineAction.deadline && (
                <span className="text-[10px] bg-amber-500/15 border border-amber-500/25 text-amber-300 rounded-full px-2 py-0.5 font-medium ml-auto">
                  ⏰ {result.prochaineAction.deadline}
                </span>
              )}
            </div>

            {/* Titre — grand et lisible */}
            <h2 className="text-white font-bold text-base leading-snug mb-2">
              {result.prochaineAction.titre}
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-4">
              {result.prochaineAction.detail}
            </p>

            {/* Simulateur d'options — met à jour le budget en temps réel */}
            {options && options.length > 0 && (
              <SimulateurOptions
                baseBudget={result.budgetTotal}
                lotLabel={result.prochaineAction.titre}
                options={options}
                onSelectOption={handleOptionSelect}
              />
            )}

            {/* CTAs */}
            <div className="flex gap-2 mt-4">
              {options && options.length > 0 && (
                <button
                  onClick={() => openPanneau('lots')}
                  className="flex items-center justify-center gap-1.5 text-xs font-semibold text-violet-300 border border-violet-500/30 hover:border-violet-500/50 bg-violet-500/10 hover:bg-violet-500/15 rounded-xl px-3 py-2.5 transition-all"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Comparer
                </button>
              )}
              <button
                onClick={() => { openPanneau('artisans'); }}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl py-2.5 transition-all shadow-md shadow-emerald-900/30"
              >
                <Users className="h-4 w-4" />
                Demander des devis
              </button>
              <button
                onClick={() => setShowWhyAction((v) => !v)}
                className={`flex items-center gap-1.5 text-xs border rounded-xl px-3 py-2.5 transition-all ${
                  showWhyAction
                    ? 'text-violet-300 border-violet-500/40 bg-violet-500/10'
                    : 'text-slate-400 hover:text-white border-white/[0.08] hover:border-white/[0.16]'
                }`}
              >
                <Info className="h-3.5 w-3.5" />
                Pourquoi ?
              </button>
            </div>

            {/* Bloc "Pourquoi maintenant" — contextualisé */}
            {showWhyAction && (
              <div className="mt-3 bg-white/[0.04] border border-violet-500/15 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <p className="text-amber-300 text-[11px] font-semibold uppercase tracking-wider">Pourquoi cette décision maintenant ?</p>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">{pourquoiText}</p>
                {currentEtape && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <ArrowRight className="h-3 w-3 shrink-0" />
                    <span>Phase en cours : <strong className="text-slate-300">{currentEtape.nom}</strong> · {currentEtape.mois}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile : carte santé condensée */}
          <div className="lg:hidden bg-[#0d1525] border border-white/[0.07] rounded-2xl p-3">
            <div className="flex items-center gap-2">
              <Activity className={`h-4 w-4 ${santeColors.text}`} />
              <span className="text-xs text-slate-300 flex-1">{sante.label}</span>
              <span className={`text-sm font-bold ${santeColors.text}`}>{sante.score}%</span>
            </div>
            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden mt-2">
              <div className={`h-full bg-gradient-to-r ${santeColors.bar} rounded-full`} style={{ width: `${Math.max(sante.score, 3)}%` }} />
            </div>
          </div>
        </div>

        {/* ── Col 3 : Budget ───────────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col gap-3 overflow-y-auto min-h-0">
          <div className="bg-[#0d1525] border border-white/[0.07] rounded-2xl p-4 flex-none">
            {/* En-tête */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Wallet className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <p className="text-white font-semibold text-xs flex-1">Budget</p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                budgetConfidence.color === 'emerald'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : budgetConfidence.color === 'blue'
                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-300'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
              }`}>
                {budgetConfidence.label}
              </span>
            </div>

            {/* Budget principal — mis à jour par SimulateurOptions */}
            <div className="flex items-baseline gap-2 mb-0.5">
              <p className="text-white font-bold text-2xl leading-none">
                {displayBudget.toLocaleString('fr-FR')} €
              </p>
              {budgetDelta !== 0 && (
                <span className={`text-sm font-semibold ${budgetDelta > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {budgetDelta > 0 ? '+' : ''}{budgetDelta.toLocaleString('fr-FR')} €
                </span>
              )}
            </div>
            <p className="text-slate-500 text-[11px] mb-1">
              {optionBudget != null ? 'avec option sélectionnée · TTC' : 'budget estimé TTC'}
            </p>
            {optionBudget != null && (
              <button
                onClick={() => setOptionBudget(null)}
                className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors mb-2"
              >
                ← Revenir au budget de base ({result.budgetTotal.toLocaleString('fr-FR')} €)
              </button>
            )}

            {/* Fourchette marché — barre de position visuelle */}
            {range ? (() => {
              const maxScale = range.max * 1.7;
              const pctMin    = Math.round((range.min / maxScale) * 100);
              const pctMax    = Math.round((range.max / maxScale) * 100);
              const pctBudget = Math.min(97, Math.max(3, Math.round((displayBudget / maxScale) * 100)));
              const inRange   = displayBudget >= range.min && displayBudget <= range.max * 1.1;
              const above     = displayBudget > range.max * 1.1;
              const markerColor = inRange ? '#34d399' : above ? '#fbbf24' : '#60a5fa';
              return (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-3">
                  <div className="flex items-center gap-1 mb-2">
                    <TrendingUp className="h-3 w-3 text-slate-500" />
                    <p className="text-slate-500 text-[10px] uppercase tracking-wider font-medium flex-1">Fourchette marché</p>
                    <span className={`text-[10px] font-semibold ${inRange ? 'text-emerald-400' : above ? 'text-amber-400' : 'text-blue-400'}`}>
                      {inRange ? '✓ Dans la fourchette' : above ? '⚠ Au-dessus' : '↓ Sous la fourchette'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold text-white mb-1.5">
                    <span>{Math.round(range.min / 1000)}k €</span>
                    <span>{Math.round(range.max / 1000)}k €</span>
                  </div>
                  {/* Barre visuelle */}
                  <div className="relative h-2.5 bg-white/[0.06] rounded-full mb-1">
                    {/* Zone marché */}
                    <div
                      className="absolute inset-y-0 rounded-full bg-blue-500/25"
                      style={{ left: `${pctMin}%`, right: `${100 - pctMax}%` }}
                    />
                    {/* Marqueur budget */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-[#0d1525] shadow-md transition-all duration-500"
                      style={{ left: `calc(${pctBudget}% - 6px)`, backgroundColor: markerColor }}
                    />
                  </div>
                  <p className="text-slate-600 text-[10px] text-center">Budget : {displayBudget.toLocaleString('fr-FR')} €</p>
                </div>
              );
            })() : (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-3">
                <p className="text-slate-500 text-xs">Fourchette marché : données insuffisantes</p>
              </div>
            )}

            {/* Confiance de l'estimation */}
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-slate-500 text-[10px] uppercase tracking-wider font-medium">Confiance estimation</p>
                <span className={`text-xs font-bold ${
                  budgetConfidence.color === 'emerald' ? 'text-emerald-300' :
                  budgetConfidence.color === 'blue' ? 'text-blue-300' : 'text-amber-300'
                }`}>
                  {budgetConfidence.color === 'emerald' ? '85 %' : budgetConfidence.color === 'blue' ? '70 %' : '45 %'}
                </span>
              </div>
              <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    budgetConfidence.color === 'emerald' ? 'bg-emerald-500' :
                    budgetConfidence.color === 'blue' ? 'bg-blue-500' : 'bg-amber-500'
                  }`}
                  style={{ width: budgetConfidence.color === 'emerald' ? '85%' : budgetConfidence.color === 'blue' ? '70%' : '45%' }}
                />
              </div>
            </div>

            {/* Résumé par lot si disponible */}
            {(result.lots ?? []).filter((l) => l.budget_avg_ht != null).length > 0 && (
              <div className="space-y-1.5 mb-3">
                <p className="text-slate-600 text-[10px] uppercase tracking-wider font-medium">Par lot</p>
                {(result.lots ?? []).filter((l) => l.budget_avg_ht != null).slice(0, 4).map((lot, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 truncate flex-1 min-w-0 mr-2">
                      {lot.emoji && <span className="mr-1">{lot.emoji}</span>}{lot.nom}
                    </span>
                    <span className="text-white font-medium shrink-0">
                      {Math.round((lot.budget_avg_ht ?? 0) * 1.2).toLocaleString('fr-FR')} €
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Bouton */}
            <button
              onClick={() => openPanneau('budget-detail')}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/[0.07] hover:border-white/[0.14] rounded-xl py-2 transition-all"
            >
              <Calculator className="h-3.5 w-3.5" />
              Comprendre le calcul
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

      </main>

      {/* ── TIMELINE ───────────────────────────────────────────────────────── */}
      {(result.roadmap ?? []).length > 0 && (
        <div className="flex-none px-4 lg:px-6 py-2.5 border-t border-white/[0.05]">
          <TimelineHorizontale
            roadmap={result.roadmap ?? []}
            onEtapeClick={handleEtapeClick}
          />
        </div>
      )}

      {/* ── NAV PANNEAUX ───────────────────────────────────────────────────── */}
      <nav className="flex-none flex items-center gap-1.5 px-3 lg:px-5 py-2 border-t border-white/[0.05] overflow-x-auto scrollbar-none">
        {[
          { id: 'lots' as PanneauId,      icon: Layers,       label: 'Lots' },
          { id: 'planning' as PanneauId,  icon: Route,        label: 'Planning' },
          { id: 'artisans' as PanneauId,  icon: Users,        label: 'Artisans',   badge: nbATrouver > 0 ? nbATrouver : undefined },
          { id: 'documents' as PanneauId, icon: FolderOpen,   label: 'Documents' },
          { id: 'conseils' as PanneauId,  icon: Lightbulb,    label: 'Conseils' },
          { id: 'budget-detail' as PanneauId, icon: Wallet,   label: 'Budget' },
        ].map(({ id, icon: Icon, label, badge }) => (
          <button
            key={id as string}
            onClick={() => openPanneau(id)}
            className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] rounded-lg px-3 py-1.5 transition-all relative flex-none"
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {badge !== undefined && badge > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {badge}
              </span>
            )}
          </button>
        ))}

        <div className="flex-1" />

        {/* Nouveau chantier */}
        <button
          onClick={onNouveau}
          className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500 hover:text-white rounded-lg px-2 py-1.5 transition-all flex-none"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Nouveau</span>
        </button>
      </nav>

      {/* ── PANNEAUX DÉTAIL ────────────────────────────────────────────────── */}

      {/* Santé / Diagnostic */}
      <PanneauDetail open={panneau === 'sante'} onClose={closePanneau} title={panneauTitle['sante']}>
        <DiagnosticProjet result={result} />
      </PanneauDetail>

      {/* Budget détaillé */}
      <PanneauDetail open={panneau === 'budget-detail'} onClose={closePanneau} title={panneauTitle['budget-detail']}>
        <div className="space-y-6">
          {/* Explication du calcul */}
          <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calculator className="h-4 w-4 text-blue-400" />
              <p className="text-white font-semibold text-sm">Comment ce budget est calculé</p>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed mb-4">
              Le budget est basé sur les données marché des lots identifiés par l'IA, exprimées en HT puis majorées de 20% pour obtenir le TTC. Chaque lot est estimé selon la surface, la zone géographique et les prix moyens constatés dans votre région.
            </p>
            {/* Détail par lot */}
            {(result.lots ?? []).filter((l) => l.budget_avg_ht != null).length > 0 && (
              <div className="space-y-3">
                <p className="text-slate-500 text-[10px] uppercase tracking-wider font-medium">Détail par lot</p>
                {(result.lots ?? []).filter((l) => l.budget_avg_ht != null).map((lot, i) => {
                  const avgTTC = Math.round((lot.budget_avg_ht ?? 0) * 1.2);
                  const minTTC = lot.budget_min_ht != null ? Math.round(lot.budget_min_ht * 1.2) : null;
                  const maxTTC = lot.budget_max_ht != null ? Math.round(lot.budget_max_ht * 1.2) : null;
                  return (
                    <div key={i} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white text-xs font-medium">
                          {lot.emoji && <span className="mr-1">{lot.emoji}</span>}{lot.nom}
                        </span>
                        <span className="text-white font-bold text-sm">{avgTTC.toLocaleString('fr-FR')} €</span>
                      </div>
                      {lot.quantite && lot.unite && (
                        <p className="text-slate-500 text-[11px] mb-1">
                          {lot.quantite} {lot.unite} · ~{Math.round(avgTTC / lot.quantite).toLocaleString('fr-FR')} €/{lot.unite}
                        </p>
                      )}
                      {minTTC != null && maxTTC != null && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500/60 rounded-full"
                              style={{ width: `${Math.min(100, Math.round(((avgTTC - minTTC) / (maxTTC - minTTC || 1)) * 100))}%` }}
                            />
                          </div>
                          <span className="text-slate-600 text-[10px]">
                            {Math.round(minTTC / 1000)}k – {Math.round(maxTTC / 1000)}k €
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                  <span className="text-slate-400 text-xs font-medium">Total TTC estimé</span>
                  <span className="text-white font-bold text-base">{result.budgetTotal.toLocaleString('fr-FR')} €</span>
                </div>
              </div>
            )}
          </div>

          <BudgetFiabilite result={result} onAmeliorer={onAmeliorer} />
          <BudgetGlobal key={refreshKey} lignesBudget={result.lignesBudget ?? []} chantierId={chantierId} token={token} />
          <SimulationFinancement budgetTotal={result.budgetTotal} />
          <button
            onClick={onAmeliorer}
            className="w-full flex items-center justify-center gap-2 border border-white/[0.08] hover:border-blue-500/40 text-slate-400 hover:text-blue-300 rounded-xl px-4 py-2.5 text-sm transition-all"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Affiner le budget avec le maître d'œuvre
          </button>
        </div>
      </PanneauDetail>

      {/* Lots */}
      <PanneauDetail open={panneau === 'lots'} onClose={closePanneau} title={panneauTitle['lots']}>
        <LotGrid
          lignesBudget={result.lignesBudget ?? []}
          lots={result.lots ?? []}
          documents={[]}
          chantierId={chantierId ?? undefined}
          userId={userId ?? undefined}
          token={token ?? undefined}
          onDocumentAdded={() => setRefreshKey((k) => k + 1)}
        />
      </PanneauDetail>

      {/* Planning */}
      <PanneauDetail open={panneau === 'planning'} onClose={closePanneau} title={panneauTitle['planning']}>
        <div className="space-y-6">
          <ChantierTimeline roadmap={result.roadmap ?? []} />
          <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-4">Détail des étapes</p>
            <div className="space-y-4">
              {result.roadmap?.map((etape, i) => (
                <div key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      etape.isCurrent ? 'bg-blue-600 text-white' : 'bg-white/[0.06] text-slate-500'
                    }`}>
                      {etape.numero}
                    </div>
                    {i < (result.roadmap?.length ?? 0) - 1 && (
                      <div className={`w-0.5 flex-1 mt-2 ${etape.isCurrent ? 'bg-blue-500/30' : 'bg-white/[0.04]'}`} style={{ minHeight: '1.5rem' }} />
                    )}
                  </div>
                  <div className={`flex-1 pb-4 ${etape.isCurrent ? 'opacity-100' : 'opacity-60'}`}>
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className={`text-sm font-medium ${etape.isCurrent ? 'text-white' : 'text-slate-300'}`}>{etape.nom}</span>
                      <span className={`text-xs ${etape.isCurrent ? 'text-blue-300' : 'text-slate-600'}`}>{etape.mois}</span>
                    </div>
                    <p className="text-slate-500 text-xs mt-0.5">{etape.detail}</p>
                    {etape.isCurrent && (
                      <button
                        onClick={() => handleEtapeClick(etape)}
                        className="inline-flex items-center gap-1 mt-1.5 bg-blue-500/15 border border-blue-500/25 text-blue-300 text-xs rounded-full px-2 py-0.5 hover:bg-blue-500/25 transition-colors"
                      >
                        Étape en cours · Voir le détail →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PanneauDetail>

      {/* Timeline détail — enrichi avec actions / décisions / documents */}
      <PanneauDetail open={panneau === 'timeline-detail'} onClose={closePanneau} title={panneauTitle['timeline-detail']}>
        {selectedEtape && etapeEnrichie && (
          <div className="space-y-4">
            {/* Résumé étape */}
            <div className={`rounded-xl p-4 border ${selectedEtape.isCurrent ? 'bg-blue-500/10 border-blue-500/20' : 'bg-white/[0.03] border-white/[0.07]'}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-semibold uppercase tracking-wider ${selectedEtape.isCurrent ? 'text-blue-300' : 'text-slate-500'}`}>
                  {selectedEtape.mois}
                </span>
                {selectedEtape.isCurrent && (
                  <span className="text-[10px] bg-blue-500/15 border border-blue-500/25 text-blue-300 rounded-full px-2 py-0.5 font-medium">
                    Étape en cours
                  </span>
                )}
              </div>
              <h3 className="text-white font-bold text-base mb-2">{selectedEtape.nom}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{selectedEtape.detail}</p>
            </div>

            {/* Actions à faire */}
            <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="h-4 w-4 text-blue-400" />
                <p className="text-white font-semibold text-sm">Actions à réaliser</p>
              </div>
              <ul className="space-y-2">
                {etapeEnrichie.actions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-slate-300 leading-tight">{action}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Décisions clés */}
            <div className="bg-[#0d1525] border border-amber-500/15 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-4 w-4 text-amber-400" />
                <p className="text-white font-semibold text-sm">Décisions clés</p>
              </div>
              <ul className="space-y-2">
                {etapeEnrichie.decisions.map((decision, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-amber-400 shrink-0 mt-0.5">◆</span>
                    <span className="text-slate-300 leading-tight">{decision}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Documents nécessaires */}
            <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-slate-400" />
                <p className="text-white font-semibold text-sm">Documents à préparer</p>
              </div>
              <ul className="space-y-2">
                {etapeEnrichie.documents.map((doc, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-slate-600 shrink-0 mt-0.5">📄</span>
                    <span className="text-slate-300 leading-tight">{doc}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Roadmap complète */}
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">Vue d'ensemble du projet</p>
              <ChantierTimeline roadmap={result.roadmap ?? []} />
            </div>
          </div>
        )}
      </PanneauDetail>

      {/* Artisans */}
      <PanneauDetail open={panneau === 'artisans'} onClose={closePanneau} title={panneauTitle['artisans']}>
        {(result.lots ?? []).length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500 text-sm mb-3">Aucun lot défini pour l'instant.</p>
            <button onClick={onAmeliorer} className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium">
              Demander au maître d'œuvre →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Guide rapide */}
            <div className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-2xl p-4">
              <p className="text-emerald-300 text-xs font-semibold mb-1">💡 Conseil maître d'œuvre</p>
              <p className="text-slate-400 text-xs leading-relaxed">
                Contactez au minimum 3 artisans par lot pour obtenir des devis comparables. Vérifiez toujours l'assurance décennale et demandez des références de chantiers récents similaires.
              </p>
            </div>
            {(result.lots ?? []).map((lot: LotChantier) => {
              const statut     = lotStatuts[lot.id] ?? lot.statut;
              const isFallback = lot.id.startsWith('fallback-');
              return (
                <div key={lot.id} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    {lot.emoji && <span className="text-2xl shrink-0 mt-0.5">{lot.emoji}</span>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white text-sm font-medium">{lot.nom}</p>
                        {isFallback && (
                          <span className="text-[10px] text-slate-600 border border-white/[0.06] rounded px-1.5 py-0.5">lecture seule</span>
                        )}
                        {lot.budget_avg_ht && (
                          <span className="text-[10px] text-slate-500">· ~{Math.round(lot.budget_avg_ht * 1.2).toLocaleString('fr-FR')} € TTC</span>
                        )}
                      </div>
                      {lot.role && <p className="text-slate-500 text-xs mt-0.5 leading-tight">{lot.role}</p>}
                      <div className="flex gap-1.5 mt-3 flex-wrap">
                        {(['a_trouver', 'a_contacter', 'ok'] as StatutArtisan[]).map((s) => (
                          <button
                            key={s}
                            disabled={isFallback}
                            onClick={() => {
                              if (isFallback) return;
                              setLotStatuts((prev) => ({ ...prev, [lot.id]: s }));
                              onLotStatutChange?.(lot.id, s);
                            }}
                            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                              isFallback
                                ? 'cursor-default opacity-50 ' + (statut === s ? STATUT_COLORS[s] : 'border-white/[0.06] text-slate-600')
                                : statut === s
                                  ? STATUT_COLORS[s]
                                  : 'border-white/[0.06] text-slate-600 hover:text-slate-400 hover:border-white/[0.12]'
                            }`}
                          >
                            {STATUT_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PanneauDetail>

      {/* Documents */}
      <PanneauDetail open={panneau === 'documents'} onClose={closePanneau} title={panneauTitle['documents']}>
        <DocumentsSection
          chantierId={chantierId ?? ''}
          userId={userId ?? ''}
          token={token ?? ''}
          lots={result.lots ?? []}
          uploadTrigger={uploadTrigger}
          onTriggerConsumed={() => setUploadTrigger(null)}
        />
      </PanneauDetail>

      {/* Conseils */}
      <PanneauDetail open={panneau === 'conseils'} onClose={closePanneau} title={panneauTitle['conseils']}>
        <div className="space-y-4">
          <ConseilsChantier
            chantierId={chantierId}
            token={token}
            nomChantier={result.nom}
            lignesBudget={result.lignesBudget ?? []}
            lots={result.lots ?? []}
            artisans={result.artisans ?? []}
            roadmap={result.roadmap ?? []}
            onConseils={setConseils}
          />
          <SyntheseChantier result={result} chantierId={chantierId} token={token} />
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-semibold text-white">Journal d'activité</span>
            </div>
            <JournalChantier key={refreshKey} chantierId={chantierId} token={token} limit={10} />
          </div>
        </div>
      </PanneauDetail>

      {/* Budget (nav button alias) */}
      <PanneauDetail open={panneau === 'budget'} onClose={closePanneau} title={panneauTitle['budget']}>
        <div className="space-y-6">
          <BudgetFiabilite result={result} onAmeliorer={onAmeliorer} />
          <BudgetGlobal key={refreshKey} lignesBudget={result.lignesBudget ?? []} chantierId={chantierId} token={token} />
        </div>
      </PanneauDetail>

      {/* ── CHAT MAÎTRE D'ŒUVRE (mini overlay) ─────────────────────────────── */}
      {showChat && (
        <div className="fixed bottom-24 right-6 z-50 w-80 bg-[#0d1525] border border-white/[0.1] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
          {/* Header chat */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.07] bg-gradient-to-r from-blue-950/50 to-violet-950/50">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0">
              <Wand2 className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold">Maître d'œuvre virtuel</p>
              <p className="text-slate-500 text-[10px]">Posez votre question</p>
            </div>
            <button onClick={() => setShowChat(false)} className="text-slate-500 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Questions rapides */}
          <div className="p-3 space-y-1.5">
            <p className="text-slate-600 text-[10px] uppercase tracking-wider font-medium mb-2">Questions fréquentes</p>
            {QUICK_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => handleChatSubmit(q)}
                className="w-full text-left text-xs text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] rounded-xl px-3 py-2 transition-all leading-tight"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input libre */}
          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChatSubmit(chatInput)}
                placeholder="Votre question…"
                className="flex-1 bg-transparent text-white text-xs placeholder-slate-600 outline-none min-w-0"
              />
              <button
                onClick={() => handleChatSubmit(chatInput)}
                disabled={!chatInput.trim()}
                className="text-blue-400 hover:text-blue-300 disabled:text-slate-700 transition-colors shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BOUTON FLOTTANT MAÎTRE D'ŒUVRE ─────────────────────────────────── */}
      <button
        onClick={() => setShowChat((v) => !v)}
        className={`fixed bottom-6 right-6 z-40 flex items-center gap-2 font-semibold rounded-full px-5 py-3 shadow-xl transition-all hover:scale-105 ${
          showChat
            ? 'bg-white/[0.1] border border-white/[0.15] text-white shadow-black/30'
            : 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-blue-500/25'
        }`}
      >
        {showChat ? (
          <><X className="h-4 w-4" />Fermer</>
        ) : (
          <><MessageCircle className="h-4 w-4" />Maître d'œuvre</>
        )}
      </button>

    </div>
  );
}
