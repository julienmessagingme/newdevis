// ── Types du tableau de bord "Mon Chantier" ────────────────────────────────────
// Ce fichier définit les types TypeScript utilisés par les composants
// du nouveau dashboard multi-chantiers.

export type PhaseChantier =
  | 'preparation'
  | 'gros_oeuvre'
  | 'second_oeuvre'
  | 'finitions'
  | 'reception';

export type StatutDevis = 'recu' | 'signe' | 'en_cours' | 'termine' | 'litige';

/** Un devis rattaché à un chantier (depuis devis_chantier + analyses) */
export interface DevisRattache {
  id: string;
  nom: string;               // artisan_nom
  description: string;       // type_travaux
  montant: number | null;    // montant_ttc (null si pas encore chiffré)
  statut: StatutDevis;
  analyseId?: string | null; // lien vers analyse vmdv existante
  scoreAnalyse?: string | null; // 'VERT' | 'ORANGE' | 'ROUGE'
}

/** Un chantier enrichi avec les computed fields pour l'affichage */
export interface ChantierDashboard {
  id: string;
  userId: string;
  nom: string;
  emoji: string;
  enveloppePrevue: number;   // budget prévu (champ "budget" en DB)
  phase: PhaseChantier;
  devis: DevisRattache[];
  createdAt: string;
  updatedAt: string;

  // Computed (calculés côté client, jamais stockés)
  budgetEstimatif: number;   // sum(devis[].montant) — tous devis avec montant non null
  enveloppeValidee: number;  // sum(devis où statut = 'signe').montant
  pourcentConsomme: number;  // enveloppeValidee / enveloppePrevue * 100
  depassement: boolean;      // budgetEstimatif > enveloppePrevue * 0.9
}

/** KPIs globaux agrégés sur tous les chantiers de l'utilisateur */
export interface DashboardGlobalKPIs {
  budgetTotalEstime: number;       // sum(tous chantiers budgetEstimatif)
  enveloppeValideeTotal: number;   // sum(tous chantiers enveloppeValidee)
  aidesEnCours: number;            // depuis onglet Aides (localStorage)
  actionsRequises: number;         // formalités manquantes + alertes
}

/** Payload pour créer un chantier */
export interface CreateChantierPayload {
  nom: string;
  emoji: string;
  enveloppePrevue: number;
}

/** Payload pour mettre à jour un chantier */
export interface UpdateChantierPayload {
  nom?: string;
  emoji?: string;
  phase?: PhaseChantier;
  enveloppePrevue?: number;
}

/** Entrée d'activité récente */
export interface ActiviteRecente {
  id: string;
  type: 'devis_ajoute' | 'devis_signe' | 'aide_percue' | 'formalite_completee' | 'relance_envoyee';
  label: string;
  souslabel: string;     // nom du chantier + temps relatif
  montant?: number | null;
  createdAt: string;
}

/** Labels d'affichage des phases */
export const PHASE_LABELS: Record<PhaseChantier, string> = {
  preparation: 'Préparation',
  gros_oeuvre: 'Gros œuvre',
  second_oeuvre: 'Second œuvre',
  finitions: 'Finitions',
  reception: 'Réception',
};

export const PHASE_KEYS: PhaseChantier[] = [
  'preparation',
  'gros_oeuvre',
  'second_oeuvre',
  'finitions',
  'reception',
];

/** Statuts des devis avec labels et couleurs */
export const STATUT_CONFIG: Record<StatutDevis, { label: string; dot: string; badge: string }> = {
  recu:     { label: 'Reçu',     dot: 'bg-slate-400',  badge: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
  signe:    { label: 'Signé',    dot: 'bg-blue-400',   badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  en_cours: { label: 'En cours', dot: 'bg-amber-400',  badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  termine:  { label: 'Terminé',  dot: 'bg-green-400',  badge: 'bg-green-500/20 text-green-300 border-green-500/30' },
  litige:   { label: 'Litige',   dot: 'bg-red-400',    badge: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

/** Palette d'emojis disponibles pour un chantier */
export const EMOJI_CHOICES = [
  '🏠', '🛁', '🍳', '🌿', '🔌', '🪟',
  '🏗️', '🪴', '🔧', '🏊', '☀️', '🛣️',
];

/** Couleurs de la jauge circulaire selon le % consommé */
export function getJaugeColor(pourcent: number): string {
  if (pourcent >= 90) return '#dc2626'; // rouge
  if (pourcent >= 75) return '#F97316'; // orange
  return '#22c55e';                     // vert
}

/** Calcul du strokeDashoffset pour la jauge SVG (rayon = 27) */
export const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 27; // 169.6

export function computeDashOffset(pourcent: number): number {
  const clamped = Math.min(100, Math.max(0, pourcent));
  return GAUGE_CIRCUMFERENCE * (1 - clamped / 100);
}

/** Compute les champs calculés d'un chantier depuis les données brutes DB */
export function computeChantierDashboard(raw: {
  id: string;
  user_id: string;
  nom: string;
  emoji: string;
  budget: number | null;
  phase: string;
  created_at: string;
  updated_at: string;
  devis: DevisRattache[];
}): ChantierDashboard {
  const enveloppePrevue = raw.budget ?? 0;

  const budgetEstimatif = raw.devis
    .filter((d) => d.montant !== null)
    .reduce((acc, d) => acc + (d.montant ?? 0), 0);

  const enveloppeValidee = raw.devis
    .filter((d) => d.statut === 'signe' && d.montant !== null)
    .reduce((acc, d) => acc + (d.montant ?? 0), 0);

  const pourcentConsomme = enveloppePrevue > 0
    ? Math.round((enveloppeValidee / enveloppePrevue) * 100)
    : 0;

  const depassement = enveloppePrevue > 0 && budgetEstimatif > enveloppePrevue * 0.9;

  return {
    id: raw.id,
    userId: raw.user_id,
    nom: raw.nom,
    emoji: raw.emoji || '🏠',
    enveloppePrevue,
    phase: (raw.phase as PhaseChantier) || 'preparation',
    devis: raw.devis,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    budgetEstimatif,
    enveloppeValidee,
    pourcentConsomme,
    depassement,
  };
}
