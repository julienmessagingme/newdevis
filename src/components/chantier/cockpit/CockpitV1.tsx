import { useState, useMemo, useRef, useEffect } from 'react';
import {
  AlertTriangle, ChevronRight, Upload, LayoutGrid, Calendar,
  Users, FolderOpen, BookOpen, Pencil, Check, X, Wallet,
  FileText, Wand2, MessageSquare, Send, SlidersHorizontal,
  Info, Shield, Scan,
} from 'lucide-react';
import type { ChantierIAResult, LotChantier, StatutArtisan, ProjectMode } from '@/types/chantier-ia';

// ── Types ──────────────────────────────────────────────────────────────────────

type PanelId =
  | 'lots' | 'planning' | 'artisans' | 'documents' | 'journal'
  | 'budget-detail' | 'phase-detail' | 'lot-params' | 'chat' | 'alert-detail'
  | 'radar' | 'bouclier'
  | null;

type DecisionStatus = 'a_faire' | 'deja_fait' | 'document_envoye' | 'non_necessaire' | 'etape_suivante';

interface ChatMessage { role: 'user' | 'assistant'; text: string; }

// ── Work options ────────────────────────────────────────────────────────────────

interface WorkOption {
  id: string; label: string;
  priceMin: number; priceAvg: number; priceMax: number;
  multiplier: number;
}

const OPTIONS_REVETEMENT: WorkOption[] = [
  { id: 'gravier',  label: 'Gravier',        priceMin: 15, priceAvg: 25,  priceMax: 40,  multiplier: 0.6 },
  { id: 'paves',    label: 'Pavés',           priceMin: 60, priceAvg: 90,  priceMax: 130, multiplier: 1.2 },
  { id: 'beton',    label: 'Béton drainant',  priceMin: 40, priceAvg: 65,  priceMax: 90,  multiplier: 1.0 },
  { id: 'enrobe',   label: 'Enrobé',          priceMin: 50, priceAvg: 70,  priceMax: 100, multiplier: 1.1 },
];

// Terrasse extérieure — béton ciré retiré (intérieur uniquement)
const OPTIONS_TERRASSE: WorkOption[] = [
  { id: 'bois',      label: 'Bois exotique',  priceMin: 70,  priceAvg: 110, priceMax: 160, multiplier: 1.2 },
  { id: 'composite', label: 'Composite',      priceMin: 90,  priceAvg: 150, priceMax: 210, multiplier: 1.4 },
  { id: 'carrelage', label: 'Carrelage ext.', priceMin: 55,  priceAvg: 90,  priceMax: 140, multiplier: 1.0 },
  { id: 'beton',     label: 'Béton drainant', priceMin: 40,  priceAvg: 65,  priceMax: 90,  multiplier: 0.7 },
];

const OPTIONS_FACADE: WorkOption[] = [
  { id: 'enduit',    label: 'Enduit',            priceMin: 35,  priceAvg: 60,  priceMax: 90,  multiplier: 1.0 },
  { id: 'bard_bois', label: 'Bardage bois',      priceMin: 70,  priceAvg: 110, priceMax: 160, multiplier: 1.3 },
  { id: 'bard_comp', label: 'Bardage composite', priceMin: 100, priceAvg: 160, priceMax: 220, multiplier: 1.5 },
  { id: 'crepi',     label: 'Crépi',             priceMin: 25,  priceAvg: 45,  priceMax: 70,  multiplier: 0.8 },
];

const OPTIONS_ISOLATION: WorkOption[] = [
  { id: 'laine', label: 'Laine de roche',  priceMin: 20, priceAvg: 38, priceMax: 55, multiplier: 1.0 },
  { id: 'ouate', label: 'Ouate cellulose', priceMin: 25, priceAvg: 45, priceMax: 65, multiplier: 1.1 },
  { id: 'poly',  label: 'Polyuréthane',    priceMin: 35, priceAvg: 60, priceMax: 90, multiplier: 1.3 },
];

// ── Radar & Bouclier ─────────────────────────────────────────────────────────

interface RadarPoint {
  emoji: string;
  title: string;
  risk: string;
  rule: string;
  document: string;
}

interface BouclierPoint {
  emoji: string;
  title: string;
  severity: 'high' | 'medium';
  lines: string[];
}

function detectRadarPoints(result: ChantierIAResult): RadarPoint[] {
  const hay = [
    result.nom,
    result.description ?? '',
    ...(result.lots ?? []).map((l) => `${l.nom} ${l.role ?? ''}`),
    ...(result.formalites ?? []).map((f) => (f as { label?: string }).label ?? ''),
  ].join(' ').toLowerCase();

  const points: RadarPoint[] = [];

  if (hay.match(/mitoyen|séparatif|clôture|cloture/)) points.push({
    emoji: '🏠', title: 'Mur ou ouvrage mitoyen',
    risk: "Travaux sur un mur mitoyen sans accord écrit du voisin peuvent entraîner un arrêt de chantier et une responsabilité civile.",
    rule: "Le Code Civil impose l'accord écrit du copropriétaire avant tout travaux affectant la mitoyenneté.",
    document: "Accord de mitoyenneté signé, bornage cadastral, déclaration préalable si modification de clôture.",
  });

  if (hay.match(/terrassement|excavation|fouille|sous-sol|vide sanitaire/)) points.push({
    emoji: '⛏️', title: 'Terrassement et réseaux souterrains',
    risk: "Endommager des réseaux souterrains (gaz, élec, eau, télécoms) engage la responsabilité pénale du maître d'ouvrage.",
    rule: "La DICT (Déclaration d'Intention de Commencement de Travaux) est obligatoire avant tout terrassement.",
    document: "DICT sur reseaux-et-canalisations.gouv.fr, plan des réseaux, attestation de l'entreprise de terrassement.",
  });

  if (hay.match(/assainissement|fosse|eaux usées|eaux pluviales|raccordement/)) points.push({
    emoji: '🚿', title: 'Assainissement',
    risk: "Un raccordement non conforme peut entraîner une amende et une obligation de mise en conformité à vos frais.",
    rule: "Toute construction neuve doit être raccordée au réseau public si disponible. En zone rurale : fosse conforme DTU 64.1.",
    document: "Attestation de conformité SPANC, plan d'assainissement communal, devis de raccordement réseau.",
  });

  if (hay.match(/électri|tableau|câblage|domotique/)) points.push({
    emoji: '⚡', title: 'Conformité électrique',
    risk: "Une installation non conforme peut causer un incendie ou un refus d'assurance habitation.",
    rule: "La norme NF C 15-100 est obligatoire. Un certificat CONSUEL est requis pour tout nouveau raccordement.",
    document: "Attestation CONSUEL, rapport de conformité électrique, devis d'un électricien qualifié.",
  });

  if (hay.match(/amiante|désamiant/)) points.push({
    emoji: '☣️', title: 'Risque amiante',
    risk: "L'amiante libère des fibres cancérigènes. Intervenir sans diagnostic expose à des poursuites pénales.",
    rule: "Diagnostic amiante obligatoire avant démolition ou rénovation d'un bâtiment construit avant juillet 1997.",
    document: "Rapport de diagnostic amiante, devis de désamiantage certifié, registre amiante.",
  });

  if (hay.match(/extension|agrandissement|surface habitable/)) points.push({
    emoji: '📐', title: 'Surface créée',
    risk: "Créer de la surface sans autorisation : amende jusqu'à 6 000 €/m² et démolition judiciaire possible.",
    rule: "Déclaration préalable jusqu'à 40 m² en zone PLU (20 m² hors zone). Permis de construire au-delà.",
    document: "Cerfa 13703 (déclaration préalable) ou 13406 (permis de construire), plan de masse coté.",
  });

  if (hay.match(/copropriété|syndic|assemblée|parties communes/)) points.push({
    emoji: '🏢', title: 'Travaux en copropriété',
    risk: "Travaux en parties communes sans accord de l'AG : nullité et remise en état obligatoire à vos frais.",
    rule: "L'assemblée générale doit voter les travaux en parties communes (article 25, loi 1965).",
    document: "PV d'AG autorisant les travaux, règlement de copropriété, devis validé par le syndic.",
  });

  if (hay.match(/piscine|bassin|spa/)) points.push({
    emoji: '🏊', title: 'Piscine ou bassin',
    risk: "Installation sans autorisation : amende. Sans dispositif de sécurité : responsabilité pénale en cas de noyade.",
    rule: "Déclaration préalable si bassin > 10 m², permis si > 100 m². Dispositif de sécurité NF P 90-308 obligatoire.",
    document: "Cerfa déclaration préalable, attestation norme sécurité piscine.",
  });

  if (hay.match(/façade|ravalement|enduit|bardage/)) points.push({
    emoji: '🏗️', title: 'Ravalement de façade',
    risk: "Ravalement non déclaré : amende. Matériaux non conformes au PLU : obligation de reprise.",
    rule: "Déclaration préalable obligatoire si modification d'aspect extérieur. Certains secteurs imposent des matériaux spécifiques.",
    document: "Déclaration préalable Cerfa 13703, cahier des prescriptions architecturales de la commune.",
  });

  if (hay.match(/porteur|charpente|mur porteur|plancher/)) points.push({
    emoji: '🏛️', title: 'Travaux structurels',
    risk: "Modifier un élément structurel sans étude préalable peut fragiliser l'ouvrage et engager votre responsabilité.",
    rule: "Un bureau d'études structure doit valider toute modification de mur porteur, charpente ou plancher.",
    document: "Note de calcul bureau d'études, plan d'exécution visé, attestation de l'architecte si applicable.",
  });

  return points.slice(0, 6);
}

// Bouclier = uniquement risques FINANCIERS ou CONTRACTUELS (pas de doublon avec le Radar)
function detectBouclierPoints(
  lots: LotChantier[],
  lotStatuts: Record<string, StatutArtisan>,
  displayBudget: number,
  marketRange: { min: number; max: number } | null,
  description: string,
): BouclierPoint[] {
  const points: BouclierPoint[] = [];

  // 1. Devis trop élevé vs marché
  if (marketRange && displayBudget > marketRange.max * 1.15) {
    const depassement = Math.round(displayBudget - marketRange.max);
    points.push({
      emoji: '💸', title: 'Devis au-dessus du marché', severity: 'high',
      lines: [
        `Votre estimation dépasse la fourchette haute de ${depassement.toLocaleString('fr-FR')} €.`,
        "Demandez au moins 3 devis par lot pour valider les prix avant de vous engager.",
        "Un devis 30% au-dessus du marché mérite toujours une contre-offre ou un second avis.",
      ],
    });
  }

  // 2. Acompte trop élevé (détecté dans la description du projet)
  const acompteMatch = description.match(/acompte[^0-9]*(\d+)\s*%/i);
  if (acompteMatch) {
    const pct = parseInt(acompteMatch[1]);
    if (pct > 30) {
      points.push({
        emoji: '💳', title: `Acompte de ${pct}% demandé`, severity: pct > 50 ? 'high' : 'medium',
        lines: [
          `Un acompte de ${pct}% est supérieur au plafond recommandé de 30%.`,
          "Au-delà de 30% sans garantie, vous prenez un risque financier significatif si l'artisan disparaît.",
          "Exigez une garantie de remboursement ou négociez des paiements échelonnés par avancement.",
        ],
      });
    }
  }

  // 3. Lots sans devis officiel
  const lotsWithoutDevis = lots.filter((l) => l.budget_avg_ht == null && !l.id.startsWith('fallback-'));
  if (lotsWithoutDevis.length > 0) {
    const noms = lotsWithoutDevis.slice(0, 2).map((l) => l.nom).join(', ') + (lotsWithoutDevis.length > 2 ? '…' : '');
    points.push({
      emoji: '📋', title: 'Absence de devis signé', severity: 'medium',
      lines: [
        `${lotsWithoutDevis.length} lot${lotsWithoutDevis.length > 1 ? 's' : ''} sans devis chiffré : ${noms}.`,
        "Sans devis signé, vous n'avez aucune protection contractuelle en cas de litige sur le prix.",
        "Exigez un devis détaillé : prix HT, délais d'exécution, conditions de paiement.",
      ],
    });
  }

  // 4. Artisan sans assurance vérifiée
  const lotsATrouver = lots.filter((l) => (lotStatuts[l.id] ?? l.statut) === 'a_trouver' && l.budget_avg_ht != null);
  if (lotsATrouver.length > 0) {
    points.push({
      emoji: '🔒', title: 'Assurance artisan non vérifiée', severity: 'medium',
      lines: [
        `${lotsATrouver.length} lot${lotsATrouver.length > 1 ? 's' : ''} avec budget mais sans artisan confirmé.`,
        "Exigez l'attestation décennale à jour avant tout premier versement.",
        "Un artisan sans assurance vous expose à couvrir les sinistres de votre poche pendant 10 ans.",
      ],
    });
  }

  return points;
}

function getAlertExplanation(alert: string): { emoji: string; title: string; lines: string[] } {
  if (alert.match(/sans artisan/)) return {
    emoji: '👷',
    title: 'Lots sans artisan assigné',
    lines: [
      "Certains lots de travaux n'ont pas encore d'artisan confirmé.",
      'Contactez au moins 3 artisans par lot pour comparer les devis.',
      'Vérifiez systématiquement : assurance décennale, SIRET valide, références récentes.',
    ],
  };
  if (alert.match(/démarche/)) return {
    emoji: '📄',
    title: 'Démarches administratives requises',
    lines: [
      'Des formalités administratives obligatoires sont identifiées pour votre projet.',
      "Certaines autorisations peuvent prendre 1 à 3 mois d'instruction.",
      "Anticipez ces démarches avant de lancer les travaux pour éviter tout blocage.",
    ],
  };
  if (alert.match(/Surface/)) return {
    emoji: '📐',
    title: 'Surface non définie',
    lines: [
      "Renseignez la surface pour comparer les options matériaux en euros.",
      "La surface permet de calculer le coût réel de chaque option et d'afficher les écarts de prix.",
    ],
  };
  if (alert.match(/sans devis/)) return {
    emoji: '📋',
    title: 'Lots sans devis chiffré',
    lines: [
      "Certains lots n'ont pas encore de budget chiffré.",
      "L'estimation globale est donc partielle et pourrait sous-estimer le budget réel.",
      "Demandez des devis auprès d'artisans pour affiner la fourchette.",
    ],
  };
  if (alert.match(/fourchette/)) return {
    emoji: '💰',
    title: 'Budget au-dessus de la fourchette',
    lines: [
      "Votre estimation dépasse la fourchette haute du marché pour ce type de travaux.",
      "Vérifiez si des lots peuvent être optimisés ou si des matériaux moins coûteux conviennent.",
      "Une réserve de 10–15% est normale — au-delà, challengez vos devis.",
    ],
  };
  return { emoji: '⚠️', title: "Point d'attention", lines: [alert] };
}

function detectWorkOptions(result: ChantierIAResult): { title: string; options: WorkOption[] } | null {
  const hay = [
    result.prochaineAction?.titre ?? '',
    result.prochaineAction?.detail ?? '',
    ...(result.lignesBudget ?? []).slice(0, 2).map((l) => l.label),
    result.nom, result.description ?? '',
  ].join(' ').toLowerCase();
  if (hay.match(/rev.tement|allee|allée|driveway/)) return { title: 'Choisir le type de revêtement', options: OPTIONS_REVETEMENT };
  if (hay.match(/terrasse/)) return { title: 'Choisir le matériau de terrasse', options: OPTIONS_TERRASSE };
  if (hay.match(/facade|façade/)) return { title: 'Choisir le type de façade', options: OPTIONS_FACADE };
  if (hay.match(/isolation/)) return { title: "Choisir le type d'isolation", options: OPTIONS_ISOLATION };
  return null;
}

// ── Phases ──────────────────────────────────────────────────────────────────────

const PHASES = [
  { id: 'conception',    label: 'Conception',   emoji: '✏️' },
  { id: 'devis',         label: 'Devis',         emoji: '📋' },
  { id: 'autorisations', label: 'Autorisations', emoji: '📄' },
  { id: 'travaux',       label: 'Travaux',        emoji: '🔨' },
  { id: 'reception',     label: 'Réception',     emoji: '✅' },
] as const;

type PhaseId = (typeof PHASES)[number]['id'];

function mapRoadmapToPhase(roadmapPhase: string): PhaseId {
  const p = roadmapPhase.toLowerCase();
  if (p.match(/autori|admin|permit/)) return 'autorisations';
  if (p.match(/travaux|réalisa|gros|second|finit/)) return 'travaux';
  if (p.match(/récep|livrai|fin/)) return 'reception';
  if (p.match(/devis|artisan|chiffr|consul/)) return 'devis';
  return 'conception';
}

function getPhaseDetail(phaseId: PhaseId) {
  switch (phaseId) {
    case 'conception': return {
      actions: ['Définir les besoins et contraintes', 'Consulter un architecte si > 150 m²', 'Visiter le site avec les intervenants', 'Définir les lots de travaux'],
      decisions: ['Budget cible TTC', "Maîtrise d'œuvre ou auto-gestion", 'Planning et contraintes de dates'],
      documents: ['Plans existants', 'Titre de propriété', 'Règles du PLU', "Photos de l'existant"],
    };
    case 'devis': return {
      actions: ['Contacter 3 artisans par lot minimum', 'Vérifier les qualifications RGE', 'Demander des références chantiers récents', 'Comparer les devis sur les mêmes bases'],
      decisions: ['Critères de sélection (prix, délai, références)', 'Coordination des lots', "Modalités d'acompte et de paiement"],
      documents: ["Devis signés avec délai d'exécution", 'Attestations décennale', 'Extraits Kbis / SIRET', 'Certificats RGE si applicable'],
    };
    case 'autorisations': return {
      actions: ["Déposer la déclaration préalable ou le permis de construire", "Attendre l'instruction (1 à 3 mois)", 'Afficher le panneau de chantier après accord', 'Vérifier les recours des tiers (2 mois après affichage)'],
      decisions: ['Type de dossier (DP ou PC) selon surface', 'Recours à un architecte obligatoire si > 150 m²', 'Date de dépôt cible'],
      documents: ['Cerfa 13703 (DP) ou 13406 (PC)', 'Plan de masse coté', 'Plan de situation', 'Notice descriptive des travaux'],
    };
    case 'travaux': return {
      actions: ["Ouvrir le chantier et sécuriser le périmètre", 'Vérifier les livraisons de matériaux', 'Organiser des réunions de chantier hebdomadaires', 'Consigner les réserves par écrit'],
      decisions: ["Ordre d'intervention des corps de métier", 'Gestion des imprévus et travaux supplémentaires', 'Validation des étapes clés avant la suite'],
      documents: ["Ordres de service", 'PV de réunion de chantier', 'Bons de livraison', "Photos d'avancement hebdomadaires"],
    };
    case 'reception': return {
      actions: ['Réaliser le tour complet avec chaque artisan', 'Consigner toutes les réserves sur le PV', 'Activer les garanties (parfait achèvement, biennale, décennale)', "Retenir la dernière tranche jusqu'à levée des réserves"],
      decisions: ['Réception avec ou sans réserves', 'Délai accordé pour lever les réserves', 'Retenue de garantie (5 % pendant 1 an)'],
      documents: ['Procès-verbal de réception', 'Liste de réserves signée', 'Garantie de parfait achèvement', 'DOE (Dossier des Ouvrages Exécutés)'],
    };
  }
}

// ── Decision status config ──────────────────────────────────────────────────────

const DECISION_STATUTS: { id: DecisionStatus; label: string; emoji: string; cls: string; advance?: boolean }[] = [
  { id: 'deja_fait',       label: 'Déjà fait',        emoji: '✔',  cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20' },
  { id: 'document_envoye', label: 'Document envoyé',  emoji: '📄', cls: 'border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20' },
  { id: 'non_necessaire',  label: 'Non nécessaire',   emoji: '❌', cls: 'border-slate-500/40 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20' },
  { id: 'etape_suivante',  label: 'Étape suivante',   emoji: '➡', cls: 'border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20', advance: true },
];

// ── Chat helpers ────────────────────────────────────────────────────────────────

const CHAT_SUGGESTIONS = [
  'Quelles aides financières puis-je obtenir ?',
  'Comment choisir mes artisans ?',
  'Mon budget est-il réaliste ?',
  'Quels documents dois-je préparer ?',
];

const CHAT_RESPONSES: { keywords: RegExp; reply: (r: ChantierIAResult) => string }[] = [
  {
    keywords: /aide|subvention|ma ?prime|anah|crédit|cee/i,
    reply: (r) => `Pour votre projet **${r.nom}**, plusieurs aides peuvent s'appliquer : MaPrimeRénov', éco-PTZ, TVA réduite à 5,5% ou 10%. Vérifiez votre éligibilité sur le site de l'ANAH et consultez un conseiller France Rénov' gratuit.`,
  },
  {
    keywords: /artisan|entreprise|trouver|choisir|sélect/i,
    reply: () => `Je recommande de contacter **3 artisans minimum par lot** pour votre projet. Vérifiez systématiquement : inscription au RCS, assurance décennale valide, références récentes et qualifications RGE si travaux énergie.`,
  },
  {
    keywords: /budget|prix|coût|cher|réaliste/i,
    reply: (r) => `Votre budget estimé de **${r.budgetTotal.toLocaleString('fr-FR')} €** est basé sur les prix marché moyens. Les vrais devis peuvent varier de ±20%. Prévoyez une réserve de 10–15% pour les imprévus.`,
  },
  {
    keywords: /document|papier|dossier|permis|autor/i,
    reply: (r) => `Pour votre projet, les documents clés sont : titre de propriété, PLU de votre commune, plans côtés. ${r.nbFormalites > 0 ? `Vous avez ${r.nbFormalites} formalité(s) administrative(s) identifiée(s) dans votre plan.` : ''}`,
  },
  {
    keywords: /délai|durée|quand|planning|calendrier/i,
    reply: (r) => `La durée estimée de votre chantier est de **${r.dureeEstimeeMois} mois**. Comptez 1–3 mois supplémentaires pour les démarches administratives et la recherche d'artisans.`,
  },
];

function getChatReply(text: string, result: ChantierIAResult): string {
  const match = CHAT_RESPONSES.find((r) => r.keywords.test(text));
  if (match) return match.reply(result);
  return `Pour votre projet **${result.nom}**, je vous conseille de commencer par obtenir plusieurs devis et de vérifier les qualifications des artisans. Posez-moi une question plus précise sur le budget, les artisans, les aides ou les démarches.`;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface CockpitV1Props {
  result: ChantierIAResult;
  chantierId: string | null;
  onAmeliorer: () => void;
  onNouveau: () => void;
  onToggleTache?: (todoId: string, done: boolean) => void;
  onLotStatutChange?: (lotId: string, statut: StatutArtisan) => void;
  token?: string | null;
  userId?: string | null;
  projectMode?: ProjectMode | null;
  onProjectModeChange?: (mode: ProjectMode) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CockpitV1({
  result,
  onLotStatutChange,
}: CockpitV1Props) {

  // ── Masquer le widget de chat externe sur cette page ────────────────────────
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'cockpit-hide-ext-widget';
    style.textContent = [
      'iframe[src*="messagingme.app"] { display: none !important; }',
      'div[id*="msg-widget"], div[id*="messagingme"], div[class*="msg-widget"] { display: none !important; }',
      'iframe[src*="whatsapp"], a[href*="wa.me"], a[href*="whatsapp.com"] { display: none !important; }',
      '[class*="widget-chat"], [id*="chat-widget"], [class*="whatsapp-btn"] { display: none !important; }',
    ].join(' ');
    document.head.appendChild(style);
    return () => { document.getElementById('cockpit-hide-ext-widget')?.remove(); };
  }, []);

  // ── State ──────────────────────────────────────────────────────────────────

  const [panel, setPanel]             = useState<PanelId>(null);
  const [selectedPhaseId, setPhaseId] = useState<PhaseId | null>(null);
  const [lotQuantities, setLotQuantities] = useState<Record<string, number>>({});
  const [lotStatuts, setLotStatuts]   = useState<Record<string, StatutArtisan>>(
    () => Object.fromEntries((result.lots ?? []).map((l) => [l.id, l.statut])),
  );
  const [decisionStatuts, setDecisionStatuts] = useState<Record<string, DecisionStatus>>({});
  const [decisionIndex, setDecisionIndex]     = useState(0);
  const [selectedAlertIndex, setSelectedAlertIndex] = useState<number | null>(null);
  const [surface, setSurface]         = useState<number>(() => {
    const m = (result.description ?? '').match(/(\d+)\s*m²/);
    return m ? parseInt(m[1]) : 0;
  });
  const [editingSurface, setEditSurf] = useState(false);
  const [surfaceInput, setSurfInput]  = useState('');
  const [selectedOption, setOption]   = useState<WorkOption | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    { role: 'assistant', text: `Bonjour ! Je suis votre assistant pour **${result.nom}**. Posez-moi vos questions sur le budget, les artisans, les aides ou les démarches administratives.` },
  ]);
  const [chatInput, setChatInput]       = useState('');
  const [chatLoading, setChatLoading]   = useState(false);
  const chatEndRef                       = useRef<HTMLDivElement>(null);

  type PhaseStatus = 'fait' | 'en_cours' | 'a_faire';
  const [phaseTimelineStatuses, setPhaseTimelineStatuses] = useState<Partial<Record<PhaseId, PhaseStatus>>>({});

  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; type: 'devis' | 'document'; size: number }[]>([]);
  const devisFileRef    = useRef<HTMLInputElement>(null);
  const documentFileRef = useRef<HTMLInputElement>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const lots       = result.lots     ?? [];
  const artisans   = result.artisans ?? [];
  const taches     = result.taches   ?? [];
  const formalites = result.formalites ?? [];

  const decisions = useMemo(() => {
    const q: { id: string; titre: string; detail: string; deadline?: string }[] = [
      { id: '_prochaine', ...result.prochaineAction },
    ];
    taches
      .filter((t) => !t.done && t.priorite === 'urgent')
      .slice(0, 4)
      .forEach((t) => q.push({ id: t.id ?? t.titre, titre: t.titre, detail: '' }));
    return q;
  }, [result.prochaineAction, taches]);

  const currentDecision       = decisions[decisionIndex] ?? null;
  const currentDecisionStatus = currentDecision ? (decisionStatuts[currentDecision.id] ?? 'a_faire') : null;

  // Budget lot quantities
  const lotBudgets = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of lots) {
      if (l.budget_avg_ht == null) continue;
      const qty = lotQuantities[l.id];
      if (qty != null && l.quantite != null && l.quantite > 0) {
        map[l.id] = Math.round((l.budget_avg_ht / l.quantite) * qty);
      } else {
        map[l.id] = Math.round(l.budget_avg_ht);
      }
    }
    return map;
  }, [lots, lotQuantities]);

  const hasLotBudgets = lots.some((l) => l.budget_avg_ht != null);

  const totalBudget = useMemo(() => {
    if (!hasLotBudgets) return result.budgetTotal;
    return lots.reduce((s, l) => s + (lotBudgets[l.id] ?? 0), 0);
  }, [lots, lotBudgets, hasLotBudgets, result.budgetTotal]);

  const displayBudget = selectedOption
    ? Math.round(totalBudget * selectedOption.multiplier)
    : totalBudget;

  const marketRange = useMemo(() => {
    let min = 0, max = 0, ok = false;
    for (const l of lots) {
      if (l.budget_min_ht != null && l.budget_max_ht != null) {
        min += l.budget_min_ht; max += l.budget_max_ht; ok = true;
      }
    }
    return ok ? { min: Math.round(min * 1.2), max: Math.round(max * 1.2) } : null;
  }, [lots]);

  const budgetPosition = useMemo(() => {
    if (!marketRange) return null;
    if (displayBudget > marketRange.max * 1.1) return { label: 'Au-dessus du marché', color: 'text-red-400' };
    if (displayBudget < marketRange.min * 0.9) return { label: 'En dessous du marché', color: 'text-amber-400' };
    const mid = (marketRange.min + marketRange.max) / 2;
    if (displayBudget <= mid * 1.05 && displayBudget >= mid * 0.95) return { label: 'Dans la moyenne', color: 'text-emerald-400' };
    if (displayBudget > mid) return { label: 'Légèrement au-dessus', color: 'text-amber-400' };
    return { label: 'Légèrement en dessous', color: 'text-emerald-400' };
  }, [displayBudget, marketRange]);

  const workOptions = useMemo(() => detectWorkOptions(result), [result]);

  // Delta vs première option (référence = 0 €)
  const optionDeltas = useMemo(() => {
    if (!workOptions || surface === 0) return {};
    const basePrice = workOptions.options[0]?.priceAvg ?? 0;
    const map: Record<string, number> = {};
    for (const opt of workOptions.options) {
      map[opt.id] = Math.round((opt.priceAvg - basePrice) * surface);
    }
    return map;
  }, [workOptions, surface]);

  // Alertes
  const alerts = useMemo(() => {
    const list: string[] = [];
    const nbATrouver = lots.filter((l) => !l.id.startsWith('fallback-') && (lotStatuts[l.id] ?? l.statut) === 'a_trouver').length;
    if (nbATrouver > 0) list.push(`${nbATrouver} lot${nbATrouver > 1 ? 's' : ''} sans artisan`);
    const nbFormal = formalites.filter((f) => f.obligatoire).length;
    if (nbFormal > 0) list.push(`${nbFormal} démarche${nbFormal > 1 ? 's' : ''} à effectuer`);
    if (workOptions && surface === 0) list.push('Surface non définie');
    const noDevisLots = lots.filter((l) => l.budget_avg_ht == null && !l.id.startsWith('fallback-')).length;
    if (noDevisLots > 0 && list.length < 4) list.push(`${noDevisLots} lot${noDevisLots > 1 ? 's' : ''} sans devis chiffré`);
    if (marketRange && displayBudget > marketRange.max * 1.1 && list.length < 4) list.push('Budget au-dessus de la fourchette');
    return list.slice(0, 4);
  }, [lots, lotStatuts, formalites, workOptions, surface, marketRange, displayBudget]);

  const currentPhaseId = useMemo<PhaseId>(() => {
    const cur = (result.roadmap ?? []).find((e) => e.isCurrent);
    return cur ? mapRoadmapToPhase(cur.phase ?? '') : 'conception';
  }, [result.roadmap]);

  const radarPoints = useMemo(() => detectRadarPoints(result), [result]);

  const bouclierPoints = useMemo(
    () => detectBouclierPoints(lots, lotStatuts, displayBudget, marketRange, result.description ?? ''),
    [lots, lotStatuts, displayBudget, marketRange, result.description],
  );

  const currentPhaseIndex = PHASES.findIndex((p) => p.id === currentPhaseId);

  const journalEvents = useMemo(() => {
    const ev: { emoji: string; label: string; sublabel: string; date: string }[] = [];
    ev.push({ emoji: '✨', label: 'Plan généré', sublabel: result.nom, date: result.generatedAt ? new Date(result.generatedAt).toLocaleDateString('fr-FR') : '—' });
    lots.filter((l) => (lotStatuts[l.id] ?? l.statut) === 'ok').forEach((l) => {
      ev.push({ emoji: '✅', label: `Artisan confirmé — ${l.nom}`, sublabel: l.role ?? 'Artisan', date: '—' });
    });
    taches.filter((t) => t.done).slice(0, 5).forEach((t) => {
      ev.push({ emoji: '☑️', label: t.titre, sublabel: 'Tâche complétée', date: '—' });
    });
    return ev;
  }, [result, lots, lotStatuts, taches]);

  const slidableLots = lots.filter((l) => l.budget_avg_ht != null && l.quantite != null && l.quantite > 0 && !l.id.startsWith('fallback-'));

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (panel === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, panel]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openPanel  = (id: PanelId) => setPanel(id);
  const closePanel = () => { setPanel(null); setPhaseId(null); };
  const handlePhaseClick = (id: PhaseId) => { setPhaseId(id); openPanel('phase-detail'); };

  const handleOptionSelect = (opt: WorkOption) =>
    setOption((prev) => (prev?.id === opt.id ? null : opt));

  const saveSurface = () => {
    const v = parseInt(surfaceInput);
    if (!isNaN(v) && v > 0) setSurface(v);
    setEditSurf(false);
  };

  const handleLotStatut = (lotId: string, statut: StatutArtisan) => {
    setLotStatuts((prev) => ({ ...prev, [lotId]: statut }));
    onLotStatutChange?.(lotId, statut);
  };

  const handleDecisionAction = (status: DecisionStatus) => {
    if (!currentDecision) return;
    if (status === 'etape_suivante') {
      setDecisionIndex((i) => Math.min(i + 1, decisions.length - 1));
      return;
    }
    setDecisionStatuts((prev) => ({ ...prev, [currentDecision.id]: status }));
    setTimeout(() => {
      if (decisionIndex < decisions.length - 1) {
        setDecisionIndex((i) => Math.min(i + 1, decisions.length - 1));
      }
    }, 800);
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatMessages((prev) => [...prev, { role: 'user', text }]);
    setChatInput('');
    setChatLoading(true);
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 500));
    setChatMessages((prev) => [...prev, { role: 'assistant', text: getChatReply(text, result) }]);
    setChatLoading(false);
  };

  const cyclePhaseStatus = (phaseId: PhaseId) => {
    setPhaseTimelineStatuses((prev) => {
      const current = prev[phaseId] ?? getDefaultPhaseStatus(phaseId);
      const next: PhaseStatus = current === 'a_faire' ? 'en_cours' : current === 'en_cours' ? 'fait' : 'a_faire';
      return { ...prev, [phaseId]: next };
    });
  };

  const getDefaultPhaseStatus = (phaseId: PhaseId): PhaseStatus => {
    const idx = PHASES.findIndex((p) => p.id === phaseId);
    if (idx < currentPhaseIndex) return 'fait';
    if (idx === currentPhaseIndex) return 'en_cours';
    return 'a_faire';
  };

  // ── Panel meta ─────────────────────────────────────────────────────────────

  const phaseMeta   = selectedPhaseId ? PHASES.find((p) => p.id === selectedPhaseId) : null;
  const phaseDetail = selectedPhaseId ? getPhaseDetail(selectedPhaseId) : null;

  const panelTitle: Record<NonNullable<PanelId>, string> = {
    lots:            'Lots de travaux',
    planning:        'Planning du chantier',
    artisans:        'Artisans',
    documents:       'Documents',
    journal:         'Journal',
    'budget-detail': 'Détail du budget',
    'lot-params':    'Ajuster les paramètres',
    'phase-detail':  phaseMeta ? `${phaseMeta.emoji} ${phaseMeta.label}` : 'Détail de la phase',
    chat:            '💬 Assistant chantier',
    'alert-detail':  selectedAlertIndex != null ? getAlertExplanation(alerts[selectedAlertIndex] ?? '').title : "Point d'attention",
    radar:           'Radar chantier',
    bouclier:        'Bouclier chantier',
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white pb-24">

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <header className="border-b border-white/[0.06] px-6 lg:px-8 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-xl shrink-0 select-none">
              {result.emoji}
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-base text-white truncate leading-tight">{result.nom}</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {PHASES.find(p => p.id === currentPhaseId)?.emoji}{' '}
                {PHASES.find(p => p.id === currentPhaseId)?.label}
                {surface > 0 && ` · ${surface} m²`}
              </p>
            </div>
          </div>
          <div className="hidden sm:block text-right shrink-0">
            <p className="text-xl font-bold text-white leading-none">
              {displayBudget.toLocaleString('fr-FR')} €
            </p>
            <p className={`text-[10px] mt-0.5 ${selectedOption ? 'text-amber-400' : 'text-slate-500'}`}>
              {selectedOption ? `Option : ${selectedOption.label}` : 'budget estimé TTC'}
            </p>
          </div>
          <button
            onClick={() => openPanel('chat')}
            className="flex items-center gap-1.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-xs font-semibold rounded-xl px-3 py-2 transition-all shrink-0"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Assistant chantier</span>
          </button>
        </div>
      </header>

      <div className="px-6 lg:px-8 py-5 space-y-4">

        {/* ── GRILLE 3 COLONNES ────────────────────────────────────────────── */}
        {/* Mobile : decision d'abord (order-1), puis situation (order-2), puis budget (order-3) */}
        {/* Desktop lg : situation | decision | budget */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-4 items-start">

          {/* ── COL 1 : Situation projet ───────────────────────────────────── */}
          <div className="order-2 lg:order-1 space-y-3">

            {/* Phase du chantier */}
            <div className="bg-[#0d1525] border border-white/[0.07] rounded-2xl p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Phase du projet</p>
              <div className="space-y-0.5">
                {PHASES.map((phase, idx) => {
                  const isCompleted = idx < currentPhaseIndex;
                  const isCurrent   = phase.id === currentPhaseId;
                  return (
                    <button
                      key={phase.id}
                      onClick={() => handlePhaseClick(phase.id)}
                      className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-all group ${
                        isCurrent
                          ? 'bg-violet-500/15 border border-violet-500/30'
                          : 'hover:bg-white/[0.04] border border-transparent'
                      }`}
                    >
                      <span className={`text-sm shrink-0 leading-none ${isCompleted ? 'opacity-40' : ''}`}>
                        {isCompleted ? '✓' : phase.emoji}
                      </span>
                      <span className={`text-xs font-medium flex-1 truncate ${
                        isCompleted ? 'text-emerald-400/40 line-through decoration-emerald-700/40' :
                        isCurrent   ? 'text-violet-300' :
                                      'text-slate-500'
                      }`}>
                        {phase.label}
                      </span>
                      {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0 animate-pulse" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Points à traiter */}
            {alerts.length > 0 && (
              <div className="bg-[#0d1525] border border-white/[0.07] rounded-2xl p-4">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">À traiter</p>
                <div className="space-y-1.5">
                  {alerts.map((a, i) => (
                    <button
                      key={i}
                      onClick={() => { setSelectedAlertIndex(i); openPanel('alert-detail'); }}
                      className="w-full flex items-center gap-2 bg-amber-500/[0.06] hover:bg-amber-500/[0.12] border border-amber-500/15 hover:border-amber-500/30 rounded-xl px-3 py-2 text-left transition-all group"
                    >
                      <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />
                      <span className="text-xs text-amber-300/80 group-hover:text-amber-200 flex-1 min-w-0 truncate transition-colors">{a}</span>
                      <ChevronRight className="h-3 w-3 shrink-0 text-amber-700/50 group-hover:text-amber-500/70 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Radar chantier */}
            {radarPoints.length > 0 && (
              <button
                onClick={() => openPanel('radar')}
                className="w-full bg-[#0d1525] border border-blue-500/15 hover:border-blue-500/30 rounded-2xl p-4 text-left transition-all group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Scan className="h-3 w-3 text-blue-400 shrink-0" />
                  <p className="text-[10px] text-blue-400/80 uppercase tracking-wider font-medium">Radar chantier</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-300 group-hover:text-white transition-colors flex-1 min-w-0 truncate font-medium">
                    {radarPoints[0]?.title}
                  </span>
                  {radarPoints.length > 1 && (
                    <span className="text-[10px] text-blue-500/70 shrink-0">+{radarPoints.length - 1}</span>
                  )}
                  <ChevronRight className="h-3 w-3 text-slate-600 group-hover:text-blue-500/60 transition-colors shrink-0" />
                </div>
              </button>
            )}

            {/* Bouclier chantier */}
            {bouclierPoints.length > 0 && (
              <button
                onClick={() => openPanel('bouclier')}
                className="w-full bg-[#0d1525] border border-orange-500/20 hover:border-orange-500/35 rounded-2xl p-4 text-left transition-all group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Shield className="h-3 w-3 text-orange-400 shrink-0" />
                  <p className="text-[10px] text-orange-400/80 uppercase tracking-wider font-medium">Bouclier chantier</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
                    {bouclierPoints.length} point{bouclierPoints.length > 1 ? 's' : ''} à sécuriser
                  </span>
                  <ChevronRight className="h-3 w-3 text-slate-600 group-hover:text-orange-500/60 transition-colors" />
                </div>
              </button>
            )}

          </div>

          {/* ── COL 2 : Prochaine action — carte centrale ─────────────────── */}
          <div className="order-1 lg:order-2 bg-[#0d1525] border border-white/[0.07] rounded-2xl p-6 flex flex-col min-h-[420px]">
            <div className="flex items-center justify-between mb-5">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                Prochaine action
                {decisions.length > 1 && (
                  <span className="ml-2 text-slate-600 normal-case">{decisionIndex + 1}/{decisions.length}</span>
                )}
              </p>
              {currentDecisionStatus && currentDecisionStatus !== 'a_faire' && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  DECISION_STATUTS.find(s => s.id === currentDecisionStatus)?.cls ?? ''
                }`}>
                  {DECISION_STATUTS.find(s => s.id === currentDecisionStatus)?.emoji}{' '}
                  {DECISION_STATUTS.find(s => s.id === currentDecisionStatus)?.label}
                </span>
              )}
            </div>

            {currentDecision ? (
              <>
                <p className="text-2xl font-bold text-white leading-snug mb-2">{currentDecision.titre}</p>
                {currentDecision.detail && (
                  <p className="text-sm text-slate-400 leading-relaxed mb-5">{currentDecision.detail}</p>
                )}
                {currentDecision.deadline && (
                  <p className="text-xs text-amber-400 mb-4">⏰ {currentDecision.deadline}</p>
                )}

                {/* Options matériaux */}
                {workOptions && decisionIndex === 0 && (
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-violet-300 font-medium">{workOptions.title}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Surface</span>
                        {editingSurface ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              value={surfaceInput}
                              onChange={(e) => setSurfInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveSurface(); if (e.key === 'Escape') setEditSurf(false); }}
                              className="w-14 text-xs bg-white/[0.08] border border-white/[0.15] rounded-lg px-2 py-1 text-white outline-none focus:border-violet-500/60"
                              autoFocus placeholder="0"
                            />
                            <span className="text-xs text-slate-400">m²</span>
                            <button onClick={saveSurface} className="text-emerald-400 hover:text-emerald-300 transition-colors"><Check className="h-3.5 w-3.5" /></button>
                            <button onClick={() => setEditSurf(false)} className="text-slate-500 hover:text-slate-300 transition-colors"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setSurfInput(surface > 0 ? String(surface) : ''); setEditSurf(true); }}
                            className="flex items-center gap-1.5 text-xs bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.10] rounded-lg px-2.5 py-1 text-white transition-colors group"
                          >
                            {surface > 0 ? `${surface} m²` : '— m²'}
                            <Pencil className="h-2.5 w-2.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {workOptions.options.map((opt) => {
                        const isSelected = selectedOption?.id === opt.id;
                        const delta      = optionDeltas[opt.id] ?? null;
                        const deltaStr   = delta === null
                          ? null
                          : delta === 0
                          ? 'Base'
                          : delta > 0
                          ? `+${delta.toLocaleString('fr-FR')} €`
                          : `${delta.toLocaleString('fr-FR')} €`;
                        return (
                          <button
                            key={opt.id}
                            onClick={() => handleOptionSelect(opt)}
                            className={`text-left rounded-xl border px-3 py-2.5 text-xs transition-all ${
                              isSelected
                                ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                                : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-white/[0.15] hover:text-white'
                            }`}
                          >
                            <div className="font-medium">{opt.label}</div>
                            {deltaStr && (
                              <div className={`text-[10px] mt-0.5 font-semibold ${
                                deltaStr === 'Base' ? 'text-slate-500' :
                                delta! > 0 ? (isSelected ? 'text-red-300' : 'text-red-400/70') :
                                (isSelected ? 'text-emerald-300' : 'text-emerald-400/70')
                              }`}>
                                {deltaStr}
                              </div>
                            )}
                            {deltaStr === null && surface === 0 && (
                              <div className="text-[10px] text-slate-600 mt-0.5">Saisir la surface</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Boutons d'action */}
                <div className="mt-auto pt-4 border-t border-white/[0.06]">
                  <p className="text-[10px] text-slate-500 mb-3">Marquer cette étape :</p>
                  <div className="grid grid-cols-2 gap-2">
                    {DECISION_STATUTS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleDecisionAction(s.id)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${s.cls} ${
                          currentDecisionStatus === s.id ? 'ring-1 ring-inset ring-current' : ''
                        }`}
                      >
                        <span className="text-sm leading-none">{s.emoji}</span>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {decisionIndex === decisions.length - 1 && currentDecisionStatus && currentDecisionStatus !== 'a_faire' && (
                    <p className="text-center text-[10px] text-emerald-400 mt-3">✓ Toutes les étapes traitées</p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-slate-400 italic">Aucune décision en attente.</p>
              </div>
            )}
          </div>

          {/* ── COL 3 : Budget ────────────────────────────────────────────── */}
          <div className="order-3 space-y-3">
            <div className="bg-[#0d1525] border border-white/[0.07] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Budget estimé TTC</p>
              </div>

              <p className="text-3xl font-bold text-white leading-none mb-1">
                {displayBudget.toLocaleString('fr-FR')} €
              </p>
              {selectedOption && (
                <p className="text-[10px] text-amber-400 mb-2">Option : {selectedOption.label}</p>
              )}

              {marketRange ? (
                <div className="mt-3 space-y-2">
                  <p className="text-[10px] text-slate-500">Fourchette marché</p>
                  <p className="text-xs text-slate-300 tabular-nums font-medium">
                    {marketRange.min.toLocaleString('fr-FR')} – {marketRange.max.toLocaleString('fr-FR')} €
                  </p>
                  <div className="h-1.5 bg-white/[0.06] rounded-full relative mt-1">
                    <div className="absolute inset-0 bg-emerald-500/15 rounded-full" />
                    {(() => {
                      const total = marketRange.max - marketRange.min;
                      const pct = total > 0
                        ? Math.min(100, Math.max(0, ((displayBudget - marketRange.min) / total) * 100))
                        : 50;
                      const color = displayBudget > marketRange.max * 1.1 ? '#fb7185' : displayBudget >= marketRange.min ? '#34d399' : '#fbbf24';
                      return (
                        <div
                          className="absolute top-1/2 w-2.5 h-2.5 rounded-full border-2 border-[#0d1525] shadow"
                          style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)', background: color }}
                        />
                      );
                    })()}
                  </div>
                  {budgetPosition && (
                    <p className={`text-xs font-medium ${budgetPosition.color}`}>{budgetPosition.label}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic mt-3">Fourchette en attente de devis</p>
              )}

              <div className="mt-4 space-y-1.5">
                <button
                  onClick={() => openPanel('budget-detail')}
                  className="w-full flex items-center justify-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 border border-white/[0.06] hover:border-white/[0.12] rounded-xl py-2 transition-all"
                >
                  <Info className="h-3 w-3" />
                  Voir le détail du budget
                </button>
                {slidableLots.length > 0 && (
                  <button
                    onClick={() => openPanel('lot-params')}
                    className="w-full flex items-center justify-center gap-1.5 text-[10px] text-slate-400 hover:text-violet-300 border border-white/[0.06] hover:border-violet-500/20 rounded-xl py-2 transition-all"
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    Ajuster les quantités
                  </button>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* ── TIMELINE PHASES ───────────────────────────────────────────── */}
        <div className="bg-[#0d1525] border border-white/[0.07] rounded-2xl px-4 py-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Avancement du projet · cliquer pour changer le statut</p>
          <div className="flex items-center">
            {PHASES.map((phase, idx) => {
              const status = phaseTimelineStatuses[phase.id] ?? getDefaultPhaseStatus(phase.id);
              const isLast = idx === PHASES.length - 1;
              return (
                <div key={phase.id} className="flex items-center flex-1 min-w-0">
                  <button
                    onClick={() => cyclePhaseStatus(phase.id)}
                    className="flex flex-col items-center gap-1.5 flex-1 min-w-0 py-1 rounded-xl hover:bg-white/[0.04] transition-all group"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                      status === 'fait'     ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' :
                      status === 'en_cours' ? 'bg-violet-500/20 border-violet-500/50 text-violet-300 ring-2 ring-violet-500/20' :
                                             'bg-white/[0.04] border-white/[0.10] text-slate-600'
                    }`}>
                      {status === 'fait' ? '✓' : phase.emoji}
                    </div>
                    <span className={`text-[10px] font-semibold truncate w-full text-center px-1 ${
                      status === 'fait'     ? 'text-emerald-400' :
                      status === 'en_cours' ? 'text-violet-300' :
                                             'text-slate-600'
                    }`}>
                      {phase.label}
                    </span>
                    <span className={`text-[10px] leading-none ${
                      status === 'fait'     ? 'text-emerald-600' :
                      status === 'en_cours' ? 'text-violet-500' :
                                             'text-slate-700'
                    }`}>
                      {status === 'fait' ? 'Fait' : status === 'en_cours' ? 'En cours' : 'À faire'}
                    </span>
                  </button>
                  {!isLast && (
                    <div className={`h-px w-6 shrink-0 transition-colors ${
                      (phaseTimelineStatuses[PHASES[idx + 1].id] ?? getDefaultPhaseStatus(PHASES[idx + 1].id)) !== 'a_faire'
                        ? 'bg-emerald-500/30'
                        : 'bg-white/[0.07]'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── NAVIGATION CHANTIER ───────────────────────────────────────── */}
        <div className="bg-[#0d1525] border border-white/[0.07] rounded-2xl p-2">
          <div className="flex">
            {([
              { id: 'lots',      label: 'Lots',      Icon: LayoutGrid },
              { id: 'planning',  label: 'Planning',  Icon: Calendar   },
              { id: 'artisans',  label: 'Artisans',  Icon: Users      },
              { id: 'documents', label: 'Documents', Icon: FolderOpen },
              { id: 'journal',   label: 'Journal',   Icon: BookOpen   },
            ] as const).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => openPanel(id)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all ${
                  panel === id ? 'bg-white/[0.08] text-white' : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* ── PANEL SLIDE-IN ────────────────────────────────────────────────── */}
      {panel && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={closePanel} />
          <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] bg-[#0d1525] border-l border-white/[0.08] z-50 flex flex-col shadow-2xl shadow-black/60">

            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
              <h3 className="font-semibold text-white text-sm">{panelTitle[panel]}</h3>
              <button onClick={closePanel} className="text-slate-400 hover:text-white transition-colors p-1 -mr-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className={`flex-1 overflow-y-auto ${panel === 'chat' ? 'flex flex-col' : 'p-5 space-y-4'}`}>

              {/* ── Lots ──────────────────────────────────────────────────── */}
              {panel === 'lots' && (
                lots.length === 0
                  ? <p className="text-sm text-slate-400 italic">Aucun lot défini.</p>
                  : lots.map((lot) => {
                    const statut     = lotStatuts[lot.id] ?? lot.statut;
                    const noDevis    = lot.budget_avg_ht == null && !lot.id.startsWith('fallback-');
                    const isFallback = lot.id.startsWith('fallback-');
                    return (
                      <div key={lot.id} className="bg-white/[0.04] border border-white/[0.07] rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <span className="text-xl shrink-0 mt-0.5">{lot.emoji ?? '🔧'}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-white">{lot.nom}</p>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                                statut === 'ok'          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' :
                                statut === 'a_contacter' ? 'bg-blue-500/15 text-blue-300 border-blue-500/25' :
                                                           'bg-orange-500/15 text-orange-300 border-orange-500/25'
                              }`}>
                                {statut === 'ok' ? 'Confirmé' : statut === 'a_contacter' ? 'À contacter' : 'À trouver'}
                              </span>
                            </div>
                            {lot.role && <p className="text-xs text-slate-400 mt-0.5">{lot.role}</p>}
                            {lot.budget_min_ht != null && lot.budget_max_ht != null ? (
                              <p className="text-xs text-slate-300 mt-1 tabular-nums">
                                {Math.round(lot.budget_min_ht).toLocaleString('fr-FR')} – {Math.round(lot.budget_max_ht).toLocaleString('fr-FR')} € HT
                              </p>
                            ) : (
                              <p className="text-xs text-slate-500 mt-1 italic">Aucun devis chiffré</p>
                            )}
                            {noDevis && (
                              <div className="flex items-center gap-1.5 text-[10px] text-amber-400 mt-1.5">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                Lot sans devis officiel
                              </div>
                            )}
                          </div>
                          {!isFallback && (
                            <select
                              value={statut}
                              onChange={(e) => handleLotStatut(lot.id, e.target.value as StatutArtisan)}
                              className="shrink-0 text-[10px] bg-white/[0.06] border border-white/[0.10] rounded-lg px-1.5 py-1 text-slate-300 outline-none cursor-pointer"
                            >
                              <option value="a_trouver">À trouver</option>
                              <option value="a_contacter">À contacter</option>
                              <option value="ok">Confirmé</option>
                            </select>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}

              {/* ── Planning ──────────────────────────────────────────────── */}
              {panel === 'planning' && (
                (result.roadmap ?? []).length === 0
                  ? <p className="text-sm text-slate-400 italic">Aucun planning défini.</p>
                  : (result.roadmap ?? []).map((etape, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="flex flex-col items-center shrink-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          etape.isCurrent ? 'bg-violet-600 text-white' : 'bg-white/[0.06] text-slate-400 border border-white/[0.08]'
                        }`}>
                          {etape.numero}
                        </div>
                        {i < (result.roadmap ?? []).length - 1 && (
                          <div className="w-px flex-1 bg-white/[0.06] mt-1 min-h-[20px]" />
                        )}
                      </div>
                      <div className="pb-5 flex-1 min-w-0">
                        <p className={`text-sm font-medium ${etape.isCurrent ? 'text-white' : 'text-slate-300'}`}>{etape.nom}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{etape.mois}</p>
                        {etape.isCurrent && (
                          <span className="inline-block mt-1 text-[10px] font-semibold text-violet-300 bg-violet-500/15 border border-violet-500/25 rounded-full px-2 py-0.5">
                            Phase actuelle
                          </span>
                        )}
                      </div>
                    </div>
                  ))
              )}

              {/* ── Artisans ──────────────────────────────────────────────── */}
              {panel === 'artisans' && (
                artisans.length === 0
                  ? <p className="text-sm text-slate-400 italic">Aucun artisan défini.</p>
                  : artisans.map((a, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-xl p-3.5">
                      <span className="text-xl">{a.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{a.metier}</p>
                        <p className="text-xs text-slate-400">{a.role}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        a.statut === 'ok'          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' :
                        a.statut === 'a_contacter' ? 'bg-blue-500/15 text-blue-300 border-blue-500/25' :
                                                     'bg-orange-500/15 text-orange-300 border-orange-500/25'
                      }`}>
                        {a.statut === 'ok' ? 'Confirmé' : a.statut === 'a_contacter' ? 'À contacter' : 'À trouver'}
                      </span>
                    </div>
                  ))
              )}

              {/* ── Documents ─────────────────────────────────────────────── */}
              {panel === 'documents' && (
                <div className="space-y-4">
                  {/* Boutons upload — les inputs file sont cachés, déclenchés par click */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => devisFileRef.current?.click()}
                      className="flex flex-col items-center gap-2 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] hover:border-white/[0.14] rounded-xl p-4 transition-all text-slate-300 hover:text-white"
                    >
                      <Upload className="h-5 w-5 text-blue-400" />
                      <span className="text-xs font-medium">Ajouter un devis</span>
                      <span className="text-[10px] text-slate-600">PDF uniquement</span>
                    </button>
                    <button
                      onClick={() => documentFileRef.current?.click()}
                      className="flex flex-col items-center gap-2 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] hover:border-white/[0.14] rounded-xl p-4 transition-all text-slate-300 hover:text-white"
                    >
                      <FileText className="h-5 w-5 text-emerald-400" />
                      <span className="text-xs font-medium">Ajouter un document</span>
                      <span className="text-[10px] text-slate-600">PDF ou image</span>
                    </button>
                  </div>
                  {/* Inputs file cachés */}
                  <input
                    ref={devisFileRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setUploadedFiles((prev) => [...prev, { name: file.name, type: 'devis', size: file.size }]);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={documentFileRef}
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setUploadedFiles((prev) => [...prev, { name: file.name, type: 'document', size: file.size }]);
                      e.target.value = '';
                    }}
                  />
                  {/* Liste des fichiers uploadés */}
                  {uploadedFiles.length > 0 ? (
                    <div className="space-y-2">
                      {uploadedFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2.5">
                          {f.type === 'devis'
                            ? <Upload className="h-4 w-4 text-blue-400 shrink-0" />
                            : <FileText className="h-4 w-4 text-emerald-400 shrink-0" />
                          }
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white font-medium truncate">{f.name}</p>
                            <p className="text-[10px] text-slate-500">
                              {f.type === 'devis' ? 'Devis' : 'Document'} · {Math.round(f.size / 1024)} Ko
                            </p>
                          </div>
                          <button
                            onClick={() => setUploadedFiles((prev) => prev.filter((_, j) => j !== i))}
                            className="text-slate-600 hover:text-slate-400 transition-colors p-1"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <FolderOpen className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">Aucun document ajouté</p>
                      <p className="text-xs text-slate-600 mt-1">Importez vos devis et documents de chantier</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Journal ───────────────────────────────────────────────── */}
              {panel === 'journal' && journalEvents.map((e, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-white/[0.05] border border-white/[0.08] rounded-xl flex items-center justify-center text-base shrink-0">
                    {e.emoji}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm text-white font-medium leading-tight">{e.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{e.sublabel}</p>
                  </div>
                  <span className="text-[10px] text-slate-600 shrink-0 pt-1">{e.date}</span>
                </div>
              ))}

              {/* ── Budget detail ─────────────────────────────────────────── */}
              {panel === 'budget-detail' && (
                <div className="space-y-4">
                  <div className="bg-white/[0.04] rounded-xl p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-white">Répartition par lots</h4>
                    {hasLotBudgets ? (
                      <>
                        <div className="space-y-2">
                          {lots.filter((l) => l.budget_avg_ht != null).map((l, i) => (
                            <div key={i} className="flex items-center justify-between text-xs gap-4">
                              <span className="text-slate-300 flex items-center gap-1.5 min-w-0 truncate">
                                <span>{l.emoji ?? '🔧'}</span>
                                {l.nom}
                                {l.quantite && l.unite ? ` (${lotQuantities[l.id] ?? l.quantite} ${l.unite})` : ''}
                              </span>
                              <span className="text-white font-semibold tabular-nums shrink-0">
                                {(lotBudgets[l.id] ?? 0).toLocaleString('fr-FR')} € HT
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-white/[0.08] pt-3 flex items-center justify-between">
                          <span className="text-xs text-slate-400">Total HT estimé</span>
                          <span className="text-sm font-bold text-white tabular-nums">
                            {lots.reduce((s, l) => s + (lotBudgets[l.id] ?? 0), 0).toLocaleString('fr-FR')} €
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500">Estimations basées sur les prix marché moyens. TTC = HT × 1,20 (TVA 20%).</p>
                      </>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {(result.lignesBudget ?? []).map((l, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-slate-300">{l.label}</span>
                              <span className="text-white font-semibold tabular-nums">{l.montant.toLocaleString('fr-FR')} €</span>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-white/[0.08] pt-3 flex items-center justify-between">
                          <span className="text-xs text-slate-400">Total estimé</span>
                          <span className="text-sm font-bold text-white tabular-nums">{result.budgetTotal.toLocaleString('fr-FR')} €</span>
                        </div>
                        <p className="text-[10px] text-slate-500">Estimation basée sur le projet décrit. Affinez avec de vrais devis.</p>
                      </>
                    )}
                    {surface > 0 && (
                      <div className="pt-2 border-t border-white/[0.08]">
                        <p className="text-xs text-slate-400">
                          Coût moyen :{' '}
                          <strong className="text-white">{Math.round(totalBudget / surface).toLocaleString('fr-FR')} €/m²</strong>{' '}
                          pour {surface} m²
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Lot params (sliders) ──────────────────────────────────── */}
              {panel === 'lot-params' && (
                <div className="space-y-5">
                  <p className="text-xs text-slate-400">Ajustez les quantités pour recalculer le budget estimé en temps réel.</p>
                  {slidableLots.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">Aucun lot avec des paramètres ajustables.</p>
                  ) : (
                    slidableLots.map((l) => {
                      const baseQty  = l.quantite!;
                      const curQty   = lotQuantities[l.id] ?? baseQty;
                      const minQty   = Math.max(1, Math.round(baseQty * 0.3));
                      const maxQty   = Math.round(baseQty * 3);
                      const ppu      = l.budget_avg_ht! / baseQty;
                      const curBudget = Math.round(ppu * curQty);
                      return (
                        <div key={l.id} className="bg-white/[0.04] border border-white/[0.07] rounded-xl p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{l.emoji ?? '🔧'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white">{l.nom}</p>
                              {l.role && <p className="text-xs text-slate-400">{l.role}</p>}
                            </div>
                            <span className="text-sm font-bold text-emerald-400 tabular-nums shrink-0">
                              {curBudget.toLocaleString('fr-FR')} € HT
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400">{l.unite ?? 'unité'}</span>
                              <span className="text-white font-semibold tabular-nums">{curQty} {l.unite ?? ''}</span>
                            </div>
                            <input
                              type="range"
                              min={minQty} max={maxQty}
                              step={Math.max(1, Math.round(baseQty * 0.05))}
                              value={curQty}
                              onChange={(e) => setLotQuantities((prev) => ({ ...prev, [l.id]: Number(e.target.value) }))}
                              className="w-full accent-violet-500 cursor-pointer"
                            />
                            <div className="flex justify-between text-[10px] text-slate-600">
                              <span>{minQty} {l.unite ?? ''}</span>
                              <span className="text-slate-500">Base : {baseQty} {l.unite ?? ''}</span>
                              <span>{maxQty} {l.unite ?? ''}</span>
                            </div>
                          </div>
                          {lotQuantities[l.id] != null && lotQuantities[l.id] !== baseQty && (
                            <button
                              onClick={() => setLotQuantities((prev) => { const n = { ...prev }; delete n[l.id]; return n; })}
                              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                            >
                              ↺ Réinitialiser à {baseQty} {l.unite ?? ''}
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                  {slidableLots.length > 0 && (
                    <div className="bg-emerald-500/[0.08] border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
                      <span className="text-sm text-slate-300 font-medium">Budget total estimé</span>
                      <span className="text-lg font-bold text-emerald-400 tabular-nums">
                        {displayBudget.toLocaleString('fr-FR')} €
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Phase detail ─────────────────────────────────────────── */}
              {panel === 'phase-detail' && phaseDetail && (
                <div className="space-y-6">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Actions</p>
                    <ul className="space-y-2">
                      {phaseDetail.actions.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
                          <span className="text-blue-400 shrink-0 mt-1">→</span>{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Décisions à prendre</p>
                    <ul className="space-y-2">
                      {phaseDetail.decisions.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
                          <span className="text-amber-400 shrink-0 mt-1">◆</span>{d}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Documents</p>
                    <ul className="space-y-2">
                      {phaseDetail.documents.map((d, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
                          <FileText className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />{d}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* ── Alert detail ─────────────────────────────────────────── */}
              {panel === 'alert-detail' && selectedAlertIndex != null && (() => {
                const exp = getAlertExplanation(alerts[selectedAlertIndex] ?? '');
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl shrink-0">
                        {exp.emoji}
                      </div>
                      <h4 className="text-base font-semibold text-white leading-snug">{exp.title}</h4>
                    </div>
                    <ul className="space-y-3">
                      {exp.lines.map((line, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300 leading-relaxed">
                          <span className="text-amber-400 shrink-0 mt-0.5">→</span>
                          {line}
                        </li>
                      ))}
                    </ul>
                    {alerts.length > 1 && (
                      <div className="pt-4 border-t border-white/[0.07] space-y-2">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Autres points d'attention</p>
                        {alerts.map((a, i) => i !== selectedAlertIndex && (
                          <button
                            key={i}
                            onClick={() => setSelectedAlertIndex(i)}
                            className="w-full text-left flex items-center gap-2 text-xs text-amber-300/70 hover:text-amber-200 bg-amber-500/[0.05] hover:bg-amber-500/[0.10] border border-amber-500/15 rounded-xl px-3 py-2 transition-all"
                          >
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            {a}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Radar ────────────────────────────────────────────────── */}
              {panel === 'radar' && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 bg-blue-500/[0.06] border border-blue-500/15 rounded-xl p-3.5">
                    <Scan className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Le radar identifie automatiquement les points de vigilance spécifiques à votre chantier, avant même que les travaux démarrent.
                    </p>
                  </div>
                  {radarPoints.map((pt, i) => (
                    <div key={i} className="bg-white/[0.04] border border-white/[0.07] rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-lg shrink-0">
                          {pt.emoji}
                        </div>
                        <p className="text-sm font-semibold text-white leading-snug">{pt.title}</p>
                      </div>
                      <div className="space-y-2 pl-0.5">
                        <div className="flex items-start gap-2">
                          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider shrink-0 mt-0.5 w-14">Risque</span>
                          <span className="text-xs text-slate-300 leading-relaxed">{pt.risk}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider shrink-0 mt-0.5 w-14">Règle</span>
                          <span className="text-xs text-slate-300 leading-relaxed">{pt.rule}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider shrink-0 mt-0.5 w-14">Document</span>
                          <span className="text-xs text-slate-300 leading-relaxed">{pt.document}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Bouclier ─────────────────────────────────────────────── */}
              {panel === 'bouclier' && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 bg-orange-500/[0.06] border border-orange-500/15 rounded-xl p-3.5">
                    <Shield className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Le bouclier détecte les situations à risque pour protéger votre projet et votre budget.
                    </p>
                  </div>
                  {bouclierPoints.map((pt, i) => (
                    <div key={i} className={`bg-white/[0.04] border rounded-xl p-4 space-y-3 ${
                      pt.severity === 'high' ? 'border-red-500/20' : 'border-orange-500/15'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 ${
                          pt.severity === 'high'
                            ? 'bg-red-500/10 border border-red-500/20'
                            : 'bg-orange-500/10 border border-orange-500/20'
                        }`}>
                          {pt.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white leading-snug">{pt.title}</p>
                          <span className={`text-[10px] font-semibold ${
                            pt.severity === 'high' ? 'text-red-400' : 'text-orange-400'
                          }`}>
                            {pt.severity === 'high' ? '⚠ Risque élevé' : 'Point à sécuriser'}
                          </span>
                        </div>
                      </div>
                      <ul className="space-y-2">
                        {pt.lines.map((line, j) => (
                          <li key={j} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                            <span className={`shrink-0 mt-0.5 ${pt.severity === 'high' ? 'text-red-400' : 'text-orange-400'}`}>→</span>
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Chat ─────────────────────────────────────────────────── */}
              {panel === 'chat' && (
                <>
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && (
                          <div className="w-7 h-7 rounded-full bg-violet-600/30 border border-violet-500/30 flex items-center justify-center text-sm shrink-0 mr-2 mt-0.5">
                            👷
                          </div>
                        )}
                        <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-violet-600 text-white rounded-tr-sm'
                            : 'bg-white/[0.06] border border-white/[0.08] text-slate-200 rounded-tl-sm'
                        }`}>
                          {msg.text.split('**').map((part, pi) =>
                            pi % 2 === 1
                              ? <strong key={pi} className="font-semibold text-white">{part}</strong>
                              : <span key={pi}>{part}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="w-7 h-7 rounded-full bg-violet-600/30 border border-violet-500/30 flex items-center justify-center text-sm shrink-0 mr-2">👷</div>
                        <div className="bg-white/[0.06] border border-white/[0.08] rounded-2xl rounded-tl-sm px-4 py-3">
                          <div className="flex gap-1.5 items-center">
                            <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  {chatMessages.length === 1 && (
                    <div className="px-5 pb-3 flex flex-wrap gap-2">
                      {CHAT_SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => setChatInput(s)}
                          className="text-[10px] text-slate-300 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] hover:border-white/[0.15] rounded-full px-3 py-1.5 transition-all"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] shrink-0">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                        placeholder="Posez votre question..."
                        className="flex-1 bg-white/[0.06] border border-white/[0.10] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-violet-500/50 transition-colors"
                      />
                      <button
                        onClick={handleSendChat}
                        disabled={!chatInput.trim() || chatLoading}
                        className="w-10 h-10 flex items-center justify-center bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all"
                      >
                        <Send className="h-4 w-4 text-white" />
                      </button>
                    </div>
                  </div>
                </>
              )}

            </div>
          </div>
        </>
      )}


    </div>
  );
}
