/**
 * Catalogue des liens officiels .gouv.fr associés aux formalités administratives
 * générées par l'IA du module Chantier.
 *
 * Chaque entrée contient :
 *  - keywords : mots-clés (minuscules, sans accents) détectés dans le nom de la formalité
 *  - label    : libellé du bouton "Accéder au formulaire"
 *  - url      : URL officielle service-public.fr ou formulaires.service-public.fr
 *  - cerfa?   : numéro CERFA (affiché dans le bouton si présent)
 */

export interface FormaliteLink {
  label:  string;
  url:    string;
  cerfa?: string;
}

interface FormaliteMapping {
  keywords: string[];
  primary:  FormaliteLink;
  secondary?: FormaliteLink;
}

const FORMALITE_MAPPINGS: FormaliteMapping[] = [
  // ── Déclaration préalable de travaux ──────────────────────────────────────
  {
    keywords: ['declaration prealable', 'déclaration préalable', 'dp travaux'],
    primary: {
      label: 'CERFA Déclaration préalable',
      url:   'https://www.service-public.fr/particuliers/vosdroits/R11646',
      cerfa: '13703*10',
    },
    secondary: {
      label: 'Fiche pratique DP',
      url:   'https://www.service-public.fr/particuliers/vosdroits/F17578',
    },
  },

  // ── Permis de construire ──────────────────────────────────────────────────
  {
    keywords: ['permis de construire', 'permis construire'],
    primary: {
      label: 'CERFA Permis de construire',
      url:   'https://www.service-public.fr/particuliers/vosdroits/R21378',
      cerfa: '13409*12',
    },
    secondary: {
      label: 'Fiche pratique PC',
      url:   'https://www.service-public.fr/particuliers/vosdroits/F1986',
    },
  },

  // ── Permis d'aménager ─────────────────────────────────────────────────────
  {
    keywords: ['permis amenager', "permis d'amenager", 'permis aménager'],
    primary: {
      label: "CERFA Permis d'aménager",
      url:   'https://www.service-public.fr/particuliers/vosdroits/R11638',
      cerfa: '13409*12',
    },
  },

  // ── Déclaration ouverture de chantier ─────────────────────────────────────
  {
    keywords: ['ouverture de chantier', 'declaration ouverture', 'doc travaux'],
    primary: {
      label: 'CERFA Déclaration ouverture chantier',
      url:   'https://www.service-public.fr/particuliers/vosdroits/R1890',
      cerfa: '13407*06',
    },
  },

  // ── Déclaration attestant achèvement et conformité (DAACT) ───────────────
  {
    keywords: ['achevement', 'conformite', 'daact', 'attestation achevement'],
    primary: {
      label: 'CERFA DAACT (achèvement)',
      url:   'https://www.service-public.fr/particuliers/vosdroits/R1892',
      cerfa: '13408*09',
    },
  },

  // ── Assurance dommages-ouvrage ────────────────────────────────────────────
  {
    keywords: ['dommages-ouvrage', 'dommages ouvrage', 'assurance dommage'],
    primary: {
      label: 'Assurance dommages-ouvrage : guide officiel',
      url:   'https://www.service-public.fr/particuliers/vosdroits/F19062',
    },
  },

  // ── Assurance décennale ───────────────────────────────────────────────────
  {
    keywords: ['assurance decennale', 'garantie decennale', 'décennale'],
    primary: {
      label: 'Garantie décennale : vos droits',
      url:   'https://www.service-public.fr/particuliers/vosdroits/F2034',
    },
  },

  // ── Certificat d'urbanisme ────────────────────────────────────────────────
  {
    keywords: ['certificat urbanisme', "certificat d'urbanisme", 'cu operationnel'],
    primary: {
      label: "CERFA Certificat d'urbanisme",
      url:   'https://www.service-public.fr/particuliers/vosdroits/R1668',
      cerfa: '13410*07',
    },
  },

  // ── Autorisation de travaux ERP ───────────────────────────────────────────
  {
    keywords: ['autorisation travaux erp', 'erp', 'etablissement recevant du public'],
    primary: {
      label: 'Autorisation ERP (Cerfa 13824)',
      url:   'https://www.service-public.fr/professionnels-entreprises/vosdroits/R14491',
      cerfa: '13824*04',
    },
  },

  // ── Raccordement ENEDIS / réseau électrique ───────────────────────────────
  {
    keywords: ['raccordement electrique', 'enedis', 'consuel', 'attestation electrique'],
    primary: {
      label: 'CONSUEL (attestation électrique)',
      url:   'https://www.consuel.com/fr/pages/demande-attestation',
    },
    secondary: {
      label: 'Raccordement ENEDIS',
      url:   'https://www.enedis.fr/faire-une-demande-de-raccordement',
    },
  },

  // ── Plan local d'urbanisme (PLU) ──────────────────────────────────────────
  {
    keywords: ['plu', 'plan local urbanisme', 'règles urbanisme', 'regles urbanisme'],
    primary: {
      label: 'Consulter le PLU (Géoportail Urbanisme)',
      url:   'https://www.geoportail-urbanisme.gouv.fr/',
    },
  },

  // ── Déclaration préalable de piscine ─────────────────────────────────────
  {
    keywords: ['piscine', 'bassin'],
    primary: {
      label: 'Formalités piscine',
      url:   'https://www.service-public.fr/particuliers/vosdroits/F16178',
    },
  },

  // ── MaPrimeRénov' / aides à la rénovation ────────────────────────────────
  {
    keywords: ['maprimerénov', 'maprimerenov', 'aide renovation', 'aide rénovation', 'anah'],
    primary: {
      label: "MaPrimeRénov' (ANAH)",
      url:   'https://www.maprimerenov.gouv.fr/',
    },
    secondary: {
      label: 'Simulateur aides rénovation',
      url:   'https://france-renov.gouv.fr/aides/france-renov',
    },
  },

  // ── CEE (Certificats d'économies d'énergie) ───────────────────────────────
  {
    keywords: ['cee', "certificat d'economie", "certificats d'économies", 'prime energie'],
    primary: {
      label: "Primes CEE (France Rénov')",
      url:   'https://france-renov.gouv.fr/aides/cee',
    },
  },

  // ── Éco-PTZ ───────────────────────────────────────────────────────────────
  {
    keywords: ['eco ptz', 'eco-ptz', 'éco-prêt', 'eco pret taux zero'],
    primary: {
      label: 'Éco-PTZ : toutes les infos',
      url:   'https://www.service-public.fr/particuliers/vosdroits/F19905',
    },
  },
];

// ── Normalize ─────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire les accents
    .replace(/['']/g, ' ');
}

// ── Lookup ────────────────────────────────────────────────────────────────────

/**
 * Retourne les liens officiels correspondant à la formalité.
 * Cherche dans le nom ET le détail de la formalité.
 */
export function getFormaliteLinks(nom: string, detail?: string): FormaliteMapping | null {
  const haystack = normalize(`${nom} ${detail ?? ''}`);
  return (
    FORMALITE_MAPPINGS.find((m) =>
      m.keywords.some((kw) => haystack.includes(normalize(kw))),
    ) ?? null
  );
}
