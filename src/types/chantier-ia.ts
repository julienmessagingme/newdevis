export type ProjectMode = 'guided' | 'flexible' | 'investor';

export type TypeProjet =
  | 'renovation_maison' | 'salle_de_bain' | 'cuisine' | 'extension'
  | 'terrasse' | 'pergola' | 'isolation' | 'toiture'
  | 'piscine' | 'electricite' | 'plomberie' | 'autre';

export type Financement = 'apport' | 'credit' | 'mixte';
export type PrioriteTache = 'urgent' | 'important' | 'normal';
export type StatutArtisan = 'a_trouver' | 'a_contacter' | 'ok';
export type DocumentType =
  | 'devis' | 'facture' | 'photo'
  | 'plan' | 'autorisation' | 'assurance' | 'autre'
  | 'preuve_paiement';

export type DevisStatut = 'en_cours' | 'a_relancer' | 'valide' | 'attente_facture';
export type FactureStatut = 'recue' | 'payee' | 'payee_partiellement';

export interface DocumentChantier {
  id: string;
  chantier_id: string;
  lot_id: string | null;
  /** Terrain lot 6 : lien vers l'analyse créée depuis ce document */
  analyse_id: string | null;
  document_type: DocumentType;
  /** Statut du devis — uniquement pertinent pour document_type === 'devis' */
  devis_statut?: DevisStatut | null;
  /** Statut de la facture — uniquement pertinent pour document_type === 'facture' */
  facture_statut?: FactureStatut | null;
  /** Montant total de la facture (HT ou TTC selon le document) */
  montant?: number | null;
  /** Montant effectivement payé — utile si facture_statut === 'payee_partiellement' */
  montant_paye?: number | null;
  source: string;
  nom: string;
  nom_fichier: string;
  bucket_path: string;
  taille_octets: number | null;
  mime_type: string | null;
  created_at: string;
  updated_at: string;
  /** URL signée (TTL 1h) — injectée côté serveur au moment du listing */
  signedUrl?: string | null;
}

/** Un lot de travaux persisté dans lots_chantier.
 *  Si id commence par 'fallback-', le lot est dérivé de meta.artisans (lecture seule). */
export interface LotChantier {
  id: string;          // UUID DB, ou 'fallback-{i}' pour anciens chantiers
  nom: string;
  statut: StatutArtisan;
  ordre: number;
  emoji?: string;
  role?: string;
  // ── Prix de référence (enrichi par sauvegarder.ts via market_prices) ──────
  job_type?:       string | null;
  quantite?:       number | null;
  unite?:          string | null;
  budget_min_ht?:  number | null;
  budget_avg_ht?:  number | null;
  budget_max_ht?:  number | null;
  materiaux_ht?:   number | null;
  main_oeuvre_ht?: number | null;
  divers_ht?:      number | null;
}

/** Signaux factuels calculés avant l'appel IA — aucun montant, aucune hallucination */
export interface EstimationSignaux {
  /** Code postal ou zone géographique connus et utilisés dans la génération */
  hasLocalisation: boolean;
  /** Budget cible renseigné (qualification ou formulaire guidé) */
  hasBudget: boolean;
  /** Date de démarrage renseignée */
  hasDate: boolean;
  /** Surface, dimensions ou mesures détectées dans les inputs */
  hasSurface: boolean;
  /** typeProjet différent de 'autre' */
  typeProjetPrecis: boolean;
  /** Nombre de lignes de budget générées (richesse du détail) */
  nbLignesBudget: number;
}

export interface LigneBudgetIA {
  label: string;
  montant: number;
  couleur: string; // hex
}

export interface EtapeRoadmap {
  numero: number;
  nom: string;
  detail: string;
  mois: string;      // "Mai 2026"
  phase: string;     // "preparation" | "autorisations" | etc.
  isCurrent: boolean;
}

export interface TacheIA {
  id?: string; // UUID from todo_chantier when loaded from DB
  titre: string;
  priorite: PrioriteTache;
  done: boolean;
}

export interface ArtisanIA {
  metier: string;
  role: string;
  emoji: string;
  statut: StatutArtisan;
  couleurBg: string; // rgba
  /** Identifiant slug du type de travaux principal — ref market_prices.job_type */
  job_type?: string;
  /** Quantité estimée dans l'unité du job_type (m², ml, unité…) */
  quantite?: number;
}

export interface FormaliteIA {
  nom: string;
  detail: string;
  emoji: string;
  obligatoire: boolean;
}

export interface AideIA {
  nom: string;
  detail: string;
  montant: number | null;
  eligible: boolean;
  emoji: string;
  couleur: string;
}

export interface ChantierIAResult {
  // Infos générales
  nom: string;
  emoji: string;
  description: string;
  typeProjet: TypeProjet;
  // Stats WOW (écran 3)
  budgetTotal: number;
  dureeEstimeeMois: number;
  nbArtisans: number;
  nbFormalites: number;
  financement: Financement;
  mensualite?: number;
  dureeCredit?: number; // mois
  // Détail budget
  lignesBudget: LigneBudgetIA[];
  // Roadmap
  roadmap: EtapeRoadmap[];
  // Artisans
  artisans: ArtisanIA[];
  // Formalités
  formalites: FormaliteIA[];
  // Tâches checklist
  taches: TacheIA[];
  // Aides
  aides: AideIA[];
  // Prochaine action
  prochaineAction: {
    titre: string;
    detail: string;
    deadline?: string;
  };
  // Lots de travaux (lots_chantier si disponibles, sinon fallback read-only depuis artisans)
  lots?: LotChantier[];
  // Métadonnées
  generatedAt: string;
  promptOriginal: string;
  /** Signaux de fiabilité — présents pour les chantiers générés avec lot 8A+ */
  estimationSignaux?: EstimationSignaux | null;
}

export interface ChantierGuideForm {
  typeProjet: TypeProjet | null;
  typeEmoji: string | null;
  budget: number;
  financement: Financement | null;
  dureeCredit: string;
  dateDebut: string;
  dateLabelFr: string;
}

export interface ChangeItem {
  emoji: string;
  what: string;
  detail: string;
  field?: keyof ChantierIAResult;
  oldValue?: string;
  newValue?: string;
}

export interface ChantierUpdate {
  chantierId: string;
  modification: string;
  updatedAt: string;
  changes: ChangeItem[];
}

// SSE event types
export type SseEvent =
  | { type: 'step'; step: number; status: 'idle' | 'active' | 'done'; detail: string }
  | { type: 'progress'; pct: number }
  | { type: 'result'; data: ChantierIAResult }
  | { type: 'error'; message: string };

// ── Qualification flow ─────────────────────────────────────────────────────────

export type QuestionType = 'text' | 'single_choice' | 'text_or_choice';

export interface FollowUpQuestion {
  id: string;
  label: string;
  type: QuestionType;
  placeholder?: string;
  choices?: string[];
  required: boolean;
  reason: string;
}

export interface LocationContext {
  postalCode: string;
  cityName?: string;
  department?: string;
  urbanZoneType?: 'petite_ville' | 'ville_moyenne' | 'grande_ville';
  pricingCoefficient?: number;
}
