// Logique PURE d'isolation de l'Espace Artisan. Aucun I/O → testable sans DB.
// C'EST la barrière de sécurité : ces fonctions garantissent qu'un artisan ne voit QUE
// ses propres données. Tout endpoint /api/artisan/* DOIT passer par elles. Ne jamais
// renvoyer de données artisan sans les avoir filtrées ici.

export type ArtisanAccessCode = 'token_invalid' | 'subscription_inactive' | 'contact_not_found';
export type ArtisanAccessResult = { ok: true } | { ok: false; code: ArtisanAccessCode };

export interface ArtisanAccessInputs {
  /** Ligne artisan_space_tokens (ou null si introuvable). */
  tokenRow: { revoked_at: string | null } | null;
  /** Le chantier référencé par le token existe-t-il ? */
  chantierExists: boolean;
  /** Abo du client actif (résultat de hasGmcWriteAccess ; true si paywall off). */
  subActive: boolean;
  /** Le contact est-il toujours rattaché à ce chantier ? */
  contactOnChantier: boolean;
}

/**
 * Décision PURE de validité d'un accès artisan. Ordre strict : token → chantier → abo → contact.
 * Renvoie un code générique (le endpoint ne révèle pas la cause exacte à l'artisan).
 */
export function evaluateArtisanAccess(i: ArtisanAccessInputs): ArtisanAccessResult {
  if (!i.tokenRow || i.tokenRow.revoked_at) return { ok: false, code: 'token_invalid' };
  if (!i.chantierExists) return { ok: false, code: 'token_invalid' };
  if (!i.subActive) return { ok: false, code: 'subscription_inactive' };
  if (!i.contactOnChantier) return { ok: false, code: 'contact_not_found' };
  return { ok: true };
}

/**
 * Ne garde QUE les documents du contact courant. JAMAIS de filtre par lot_id (un lot peut
 * avoir des devis concurrents → fuite). C'est la barrière anti-fuite docs.
 */
export function scopeArtisanDocuments<T extends { contact_id?: string | null }>(
  docs: T[],
  contactId: string,
): T[] {
  return docs.filter((d) => d.contact_id === contactId);
}

// Toute clé contenant un de ces fragments est retirée du planning artisan (budget/prix).
// `_ht` (et non `ht` nu) pour ne matcher que les suffixes comptables (total_ht, prix_ht…)
// sans risquer de supprimer une colonne neutre contenant "ht" comme sous-chaîne.
const PLANNING_FORBIDDEN = ['budget', 'prix', 'price', 'montant', 'cout', '_ht', 'ttc'];

/** Retire toute clé budget/prix de chaque lot du planning (l'artisan voit le planning, pas les montants). */
export function shapeArtisanPlanningLots<T extends Record<string, unknown>>(lots: T[]): Array<Partial<T>> {
  return lots.map((lot) => {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(lot)) {
      const key = k.toLowerCase();
      if (PLANNING_FORBIDDEN.some((f) => key.includes(f))) continue;
      clean[k] = v;
    }
    return clean as Partial<T>;
  });
}

export interface ArtisanContactPublic {
  nom: string | null;
  role: string | null;
  telephone: string | null;
}

/**
 * Coordonnées des AUTRES artisans pour coordination : uniquement {nom, role, telephone}.
 * Exclut self + tout champ sensible (email, notes, siret, has_whatsapp, contact_category, ids…).
 */
export function shapeArtisanContacts(
  contacts: Array<{ id: string; nom?: string | null; role?: string | null; telephone?: string | null }>,
  selfContactId: string,
): ArtisanContactPublic[] {
  return contacts
    .filter((c) => c.id !== selfContactId)
    .map((c) => ({ nom: c.nom ?? null, role: c.role ?? null, telephone: c.telephone ?? null }));
}
