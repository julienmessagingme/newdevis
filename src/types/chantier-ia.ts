export type TypeProjet =
  | 'renovation_maison' | 'salle_de_bain' | 'cuisine' | 'extension'
  | 'terrasse' | 'pergola' | 'isolation' | 'toiture'
  | 'piscine' | 'electricite' | 'plomberie' | 'autre';

export type Financement = 'apport' | 'credit' | 'mixte';
export type PrioriteTache = 'urgent' | 'important' | 'normal';
export type StatutArtisan = 'a_trouver' | 'a_contacter' | 'ok';

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
  // Métadonnées
  generatedAt: string;
  promptOriginal: string;
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
