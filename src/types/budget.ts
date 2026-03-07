export type StatutPaiement = "total" | "acompte";
export type ModeDeblocage = "compte_courant" | "virement_fournisseur";

export interface DonneesIA {
  entreprise: string;
  montant_ttc: number;
  date: string;
  objet: string;
}

export interface FactureApport {
  id: string;
  entreprise: string;
  objetTravaux: string;
  montantTTC: number;
  dateFacture: string;
  statutPaiement: StatutPaiement;
  montantPaye: number;
  commentaire?: string;
  documentUrl?: string;
  luParIA: boolean;
  createdAt: string;
}

export interface FactureFinancement {
  id: string;
  entreprise: string;
  objetTravaux: string;
  montantTTC: number;
  dateFacture: string;
  statutPaiement: StatutPaiement;
  montantPaye: number;
  modeDeblocage: ModeDeblocage;
  commentaire?: string;
  documentUrl?: string;
  luParIA: boolean;
  createdAt: string;
}

export interface BudgetStoredState {
  facturesApport: FactureApport[];
  facturesFinancement: FactureFinancement[];
  mensualite: string;
  duree: string;
}
