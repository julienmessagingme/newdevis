/**
 * Types domaine pour le schéma `marketing` (DB Supabase partagée avec gerermonchantier-marketing).
 *
 * Typage manuel — le types.ts auto-généré de Supabase ne couvre que le schema `public`.
 * Source de vérité : `supabase/migrations/20260502_001_marketing_schema_init.sql`
 * dans le repo `gerermonchantier-marketing`.
 */

export type MarketingPlatform = 'facebook' | 'instagram' | 'tiktok' | 'linkedin';

export type MarketingPersonaCode =
  | 'particulier_travaux'
  | 'conducteur_travaux'
  | 'maitre_oeuvre'
  | 'artisan_solo'
  | 'dirigeant_pme_btp';

export type MarketingPostStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'rejected'
  | 'archived';

export type MarketingAssetType =
  | 'carousel_slide'
  | 'carousel_cover'
  | 'thumbnail'
  | 'logo_variant'
  | 'reference';

export type MarketingAgentRole =
  | 'strategist'
  | 'researcher'
  | 'copywriter'
  | 'visual_director'
  | 'quality_gate'
  | 'publisher'
  | 'analyst';

export interface MarketingSlide {
  slide_n?: number;
  text?: string;
  visual_brief?: string;
  [key: string]: unknown;
}

export interface MarketingPost {
  id: string;
  campaign_id: string | null;
  platform: MarketingPlatform;
  persona_target: MarketingPersonaCode;
  title: string | null;
  hook: string;
  slides: MarketingSlide[] | null;
  caption: string;
  hashtags: string[] | null;
  cta: string;
  cta_url: string | null;
  status: MarketingPostStatus;
  quality_score: number | null;
  quality_notes: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  external_id: string | null;
  external_url: string | null;
  publish_error: string | null;
  created_by_agent: MarketingAgentRole | null;
  parent_post_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MarketingAsset {
  id: string;
  post_id: string | null;
  asset_type: MarketingAssetType;
  slide_index: number | null;
  storage_path: string;
  public_url: string | null;
  width: number | null;
  height: number | null;
  format: string | null;
  generated_by: string | null;
  prompt_used: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface MarketingKillSwitch {
  id: number;
  is_paused: boolean;
  reason: string | null;
  paused_by: string | null;
  paused_at: string | null;
}

/** Liste — version allégée pour la table */
export interface MarketingPostListItem {
  id: string;
  platform: MarketingPlatform;
  persona_target: MarketingPersonaCode;
  hook: string;
  status: MarketingPostStatus;
  quality_score: number | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  cover_url: string | null;
  slide_count: number;
}

/** Détail — post + assets */
export interface MarketingPostDetail extends MarketingPost {
  assets: MarketingAsset[];
}

/** Réponse de /api/admin/marketing/status (proxy de /api/status FastAPI) */
export interface MarketingStatus {
  kill_switch: {
    is_paused: boolean;
    reason: string | null;
    paused_by: string | null;
    paused_at: string | null;
  };
  recent_runs?: Array<Record<string, unknown>>;
  recent_published?: Array<Record<string, unknown>>;
  ready_to_publish?: number;
  [key: string]: unknown;
}
