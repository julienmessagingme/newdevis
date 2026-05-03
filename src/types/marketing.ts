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

/**
 * Marketing settings — singleton row de marketing.settings.
 * Pilotable depuis /admin/marketing/settings.
 *
 * Source de vérité : `agents/src/models/marketing_settings.py` côté Python.
 * Validation côté serveur : helper FastAPI rejette toute valeur hors range.
 */
export interface MarketingSettings {
  id: 1;
  /** Cible CTA GMC vs VMD sur 30 jours, 0-100 (default 70 = 70% GMC) */
  gmc_ratio_pct: number;
  /** Score min Quality Gate pour APPROVED, 1-12 (default 10) */
  quality_threshold: number;
  /** Cap dur coût par flow en USD, > 0 et <= 50 (default 2.0) */
  max_flow_cost_usd: number;
  /** Heure tick quotidien, 0-23 Europe/Paris (default 9) */
  scheduler_hour: number;
  /** Minute tick quotidien, 0-59 (default 0) */
  scheduler_minute: number;
  /** Mode test : pas de publication réelle (default true) */
  dry_run: boolean;
  updated_at: string | null;
  updated_by: string;
}

/**
 * Payload envoyé PAR LE CLIENT à `/api/admin/marketing/settings` (route Astro proxy).
 * `updated_by` est INJECTÉ CÔTÉ SERVEUR (admin email auth) — pas du body — pour empêcher
 * un admin d'usurper l'identité d'un autre dans les logs d'audit. Ne jamais l'envoyer
 * depuis le client : il sera ignoré.
 */
export interface MarketingSettingsClientPayload {
  gmc_ratio_pct?: number;
  quality_threshold?: number;
  max_flow_cost_usd?: number;
  scheduler_hour?: number;
  scheduler_minute?: number;
  dry_run?: boolean;
}

/**
 * Payload envoyé PAR LA ROUTE ASTRO à FastAPI `/api/settings`.
 * `updated_by` est requis — c'est l'email de l'admin authentifié, injecté côté serveur.
 */
export interface MarketingSettingsUpdate extends MarketingSettingsClientPayload {
  updated_by: string;
}

/**
 * Réponse de POST /api/settings — settings post-update + hint UI sur le restart scheduler.
 * Le flag `scheduler_restart_required` est true si scheduler_hour ou scheduler_minute
 * a été modifié — le frontend doit afficher un avertissement "restart container nécessaire
 * pour la prise en compte" car APScheduler tient un trigger statique au boot.
 */
export interface MarketingSettingsUpdateResponse extends MarketingSettings {
  scheduler_restart_required: boolean;
}
