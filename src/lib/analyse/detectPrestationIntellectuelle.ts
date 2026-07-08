/**
 * V3.5.4 (2026-07-08) — Détection des prestations intellectuelles réglementées.
 *
 * Cas d'origine FARAUD.pdf : devis géomètre-expert 2 250€ HT avec 40+50%
 * acompte -> hard block acompte_cumule_excessif -> verdict "ne pas signer"
 * disproportionné. Pour ces professions réglementées, ces conditions de
 * paiement sont la NORME du métier, pas un signal de risque.
 *
 * Scanne l'activité / raison sociale de l'entreprise + les descriptions des
 * lignes du devis contre une liste de patterns métier.
 *
 * Conservateur : "architecte" seul (sans DPLG/HMONP) n'est PAS matché
 * (ambigu — peut être architecte d'intérieur pour un chantier BTP classique).
 */

const PATTERNS: Array<{ metier: string; regex: RegExp }> = [
  { metier: "géomètre-expert",              regex: /\bg[eé]om[eè]tre[\s-]*expert\b/i },
  { metier: "géomètre-expert",              regex: /\bg[eé]om[eè]tre\b/i },
  { metier: "architecte DPLG",              regex: /\barchitecte\s+(?:DPLG|HMONP|D\.?\s*P\.?\s*L\.?\s*G\.?)\b/i },
  { metier: "architecte inscrit à l'ordre", regex: /\bordre\s+des\s+architectes\b/i },
  { metier: "diagnostiqueur immobilier",    regex: /\bdiagnostiqueur|diagnostic\s+immobilier|\bDPE\b|\bERP\b/i },
  { metier: "notaire",                      regex: /\bnotaire\b|\bSCP\s+notari|\bétude\s+notariale\b/i },
  { metier: "huissier de justice",          regex: /\bhuissier|commissaire\s+de\s+justice\b/i },
  { metier: "bureau d'études techniques",   regex: /\bbureau\s+d[''''`]?[eé]tudes(?:\s+techniques?)?\b|\bBET\b/i },
  { metier: "maître d'œuvre",               regex: /\bma[iî]tre\s+d[''''`]?[oœ]uvre\b|\bMOE\b/i },
  { metier: "économiste de la construction", regex: /\b[eé]conomiste\s+(?:de\s+la\s+)?construction\b/i },
  { metier: "expert judiciaire",            regex: /\bexpert\s+judiciaire\b/i },
  { metier: "avocat",                       regex: /\bavocat(?:e|s)?\b|barreau\s+de\s+\w/i },
];

export function detectPrestationIntellectuelleReglementee(parsed: unknown): { metier: string } | null {
  const p = (parsed ?? {}) as Record<string, unknown>;
  const extracted = (p.extracted as Record<string, unknown>) ?? (p.extracted_data as Record<string, unknown>) ?? {};
  const verified  = (p.verified  as Record<string, unknown>) ?? {};

  const bits: (string | undefined | null)[] = [];
  const entreprise = (extracted.entreprise as Record<string, unknown> | undefined) ?? {};
  bits.push(entreprise.nom as string, entreprise.activite as string, entreprise.raison_sociale as string);
  bits.push(verified.activite_principale as string, verified.nom_officiel as string, verified.forme_juridique as string);

  const travaux = extracted.travaux;
  if (Array.isArray(travaux)) {
    for (const t of travaux) {
      if (t && typeof t === "object") bits.push((t as Record<string, unknown>).description as string);
    }
  }

  const text = bits.filter((s): s is string => typeof s === "string" && s.length > 0).join(" | ").toLowerCase();
  if (!text) return null;

  for (const pat of PATTERNS) {
    if (pat.regex.test(text)) return { metier: pat.metier };
  }
  return null;
}
