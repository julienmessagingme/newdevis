import type {
  MacroFormat,
  MarketingPersonaCode,
  MarketingPlatform,
  MarketingPostStatus,
  NarrativeType,
} from '@/types/marketing';

export const STATUS_LABELS: Record<MarketingPostStatus, string> = {
  draft: 'Brouillon',
  pending_review: 'En revue',
  approved: 'Approuvé · prêt à publier',
  scheduled: 'Planifié',
  publishing: 'En cours de publication',
  published: 'Publié',
  failed: 'Échec',
  rejected: 'Rejeté',
  archived: 'Archivé',
};

/** Tailwind classes for badge */
export const STATUS_BADGE_CLASS: Record<MarketingPostStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  pending_review: 'bg-blue-100 text-blue-800 border-blue-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  scheduled: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  publishing: 'bg-amber-100 text-amber-800 border-amber-200',
  published: 'bg-green-600 text-white border-green-700',
  failed: 'bg-red-100 text-red-800 border-red-200',
  rejected: 'bg-rose-100 text-rose-800 border-rose-200',
  archived: 'bg-gray-100 text-gray-600 border-gray-200',
};

export const PERSONA_LABELS: Record<MarketingPersonaCode, string> = {
  particulier_travaux: 'Particulier travaux',
  conducteur_travaux: 'Conducteur de travaux',
  maitre_oeuvre: "Maître d'œuvre",
  artisan_solo: 'Artisan solo',
  dirigeant_pme_btp: 'Dirigeant PME BTP',
};

export const PLATFORM_LABELS: Record<MarketingPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
};

export const ALL_STATUSES: MarketingPostStatus[] = [
  'draft', 'pending_review', 'approved', 'scheduled',
  'publishing', 'published', 'failed', 'rejected', 'archived',
];

export const ALL_PERSONAS: MarketingPersonaCode[] = [
  'particulier_travaux', 'conducteur_travaux', 'maitre_oeuvre',
  'artisan_solo', 'dirigeant_pme_btp',
];

export const ALL_PLATFORMS: MarketingPlatform[] = [
  'facebook', 'instagram', 'tiktok', 'linkedin',
];

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `il y a ${diffD} j`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── V2 Generator Constants ──────────────────────────────────────────────────

export const NARRATIVE_LABELS: Record<NarrativeType, string> = {
  A: 'Pain → Solution',
  B: 'Étude de cas',
  C: 'Tuto pas-à-pas',
  D: 'Prise de position',
  E: 'Mythe vs Réalité',
  F: 'Checklist',
  G: 'Stat-driven',
  H: 'POV / Storytelling',
};

export const MOOD_LABELS: Record<string, string> = {
  pain: 'Douleur',
  fear: 'Peur / Urgence',
  trust: 'Confiance',
  empowerment: 'Empowerment',
  authority: 'Autorité',
  revelation: 'Révélation',
  stat_choc: 'Stat choc',
  complicite: 'Complicité',
  celebration: 'Célébration',
};

export const PRODUCT_BADGE: Record<string, { label: string; class: string }> = {
  vmd: { label: 'VMD', class: 'bg-orange-100 text-orange-800 border-orange-200' },
  gmc: { label: 'GMC', class: 'bg-teal-100 text-teal-800 border-teal-200' },
};

export const CHAR_LIMITS: Record<string, Record<string, number>> = {
  texte_creme: { text: 60, subtext: 40 },
  image_overlay: { text: 80 },
  stat_geante: { stat_value: 8, text: 50 },
  cta: { text: 40, short_url: 30 },
  fond_couleur: { text: 120 },
  punchline_noir: { text: 60 },
  gradient_doux: { text: 100 },
  titre_section: { section_label: 20, text: 60 },
  etape_numerotee: { text: 60, subtext: 40 },
  temoignage: { text: 120, author: 30 },
  avant_apres: { before_text: 80, after_text: 80 },
  mythe_realite: { myth_text: 80, reality_text: 80 },
  verdict: { text: 60, verdict_label: 20 },
  comparatif: { left_label: 20, left_value: 60, right_label: 20, right_value: 60 },
  checklist: { text: 40 },
  liste_puces: { text: 40 },
  hero_image: { text: 60, label: 20 },
  question_reponse: { question: 80, answer: 120 },
  pov_whatsapp: { text: 60 },
  emoji_accent: { text: 80, emoji: 2 },
};

export const ALL_MOODS = ['pain', 'fear', 'trust', 'empowerment', 'authority', 'revelation', 'stat_choc', 'complicite', 'celebration'] as const;
export const ALL_NARRATIVES: NarrativeType[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// ─── V3 Macro-formats (refonte v3 §5) ────────────────────────────────────────

export const MACRO_FORMAT_LABELS: Record<MacroFormat, string> = {
  'V-F01': 'Listicle 7 red flags',
  'V-F02': 'Case study chiffré',
  'V-F03': 'POV devis reçu',
  'V-F04': 'Quiz vote A vs B',
  'V-F05': '3 phrases artisan',
  'V-F06': 'Fourchette de prix',
  'V-F07': 'Quiz Red/Green flag',
  'V-F08': 'Bailleur économie',
  'V-F09': 'Phrase commercial',
  'V-F10': 'Série épisode hebdo',
  'G-F01': 'Chaos multi-chantier',
  'G-F02': 'Démo cascade IA',
  'G-F03': 'POV bailleur lundi',
  'G-F04': 'ROI × N chantiers',
  'G-F05': 'Échéancier prédictif',
  'G-F06': 'Génération 5 min',
  'G-F07': 'WhatsApp 19h',
  'G-F08': 'Simulateur aides',
  'G-F09': 'Série 12 sem. Marc',
  'G-F10': '1er vs 4ème chantier',
};

export const ALL_MACRO_FORMATS_VMD: MacroFormat[] = [
  'V-F01','V-F02','V-F03','V-F04','V-F05','V-F06','V-F07','V-F08','V-F09','V-F10',
];

export const ALL_MACRO_FORMATS_GMC: MacroFormat[] = [
  'G-F01','G-F02','G-F03','G-F04','G-F05','G-F06','G-F07','G-F08','G-F09','G-F10',
];

export const ALL_MACRO_FORMATS: MacroFormat[] = [
  ...ALL_MACRO_FORMATS_VMD,
  ...ALL_MACRO_FORMATS_GMC,
];

export const MARKETING_PLATFORM_BADGE: Record<string, { label: string; class: string }> = {
  instagram: { label: 'IG',  class: 'bg-pink-100 text-pink-800 border-pink-200' },
  tiktok:    { label: 'TT',  class: 'bg-slate-100 text-slate-800 border-slate-200' },
  facebook:  { label: 'FB',  class: 'bg-blue-100 text-blue-800 border-blue-200' },
};
