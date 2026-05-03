import type {
  MarketingPersonaCode,
  MarketingPlatform,
  MarketingPostStatus,
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
