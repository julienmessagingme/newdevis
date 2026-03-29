export interface EvolutionData {
  date?: string;
  week?: string;
  label: string;
  analyses: number;
  vert: number;
  orange: number;
  rouge: number;
  users: number;
}

export interface ScoreDistribution {
  name: string;
  value: number;
  color: string;
}

export interface RegisteredUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  created_at: string;
  last_sign_in_at: string | null;
}

export interface Subscriber {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  lifetime_analysis_count: number;
  subscribed_at: string;
  current_period_end: string | null;
}

export interface UsersData {
  registered_users: RegisteredUser[];
  subscribers: Subscriber[];
  total_registered: number;
  total_subscribers: number;
}

export interface KPIs {
  usage: {
    total_users: number;
    total_analyses: number;
    completed_analyses: number;
    pending_analyses: number;
    error_analyses: number;
    completion_rate: number;
    avg_analyses_per_user: number;
  };
  scoring: {
    score_vert: number;
    score_orange: number;
    score_rouge: number;
    pct_vert: number;
    pct_orange: number;
    pct_rouge: number;
  };
  tracking: {
    total_entries: number;
    consent_given: number;
    consent_rate: number;
    whatsapp_enabled: number;
    whatsapp_rate: number;
    signed_quotes: number;
    responses_received: number;
    status_completed: number;
    status_in_progress: number;
    status_delayed: number;
  };
  documents: {
    devis_travaux: number;
    devis_diagnostic: number;
    devis_prestation_technique: number;
    documents_refuses: number;
    total: number;
  };
  alerts: {
    total_alerts: number;
    avg_alerts_per_analysis: number;
    top_alerts: Array<{ category: string; count: number; percentage: number }>;
    analyses_without_critical: number;
    pct_without_critical: number;
  };
  time_analytics: {
    today: number;
    this_week: number;
    this_month: number;
  };
  charts: {
    evolution_daily: EvolutionData[];
    evolution_weekly: EvolutionData[];
    score_distribution: ScoreDistribution[];
  };
}
