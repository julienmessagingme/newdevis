export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      analyses: {
        Row: {
          alertes: Json | null
          assurance_level2_score: string | null
          assurance_source: string | null
          attestation_analysis: Json | null
          attestation_comparison: Json | null
          attestation_decennale_url: string | null
          attestation_rcpro_url: string | null
          created_at: string
          error_message: string | null
          file_name: string
          file_path: string
          id: string
          points_ok: Json | null
          raw_text: string | null
          recommandations: Json | null
          resume: string | null
          score: string | null
          status: string
          types_travaux: Json | null
          updated_at: string
          user_id: string
          work_type: string | null
        }
        Insert: {
          alertes?: Json | null
          assurance_level2_score?: string | null
          assurance_source?: string | null
          attestation_analysis?: Json | null
          attestation_comparison?: Json | null
          attestation_decennale_url?: string | null
          attestation_rcpro_url?: string | null
          created_at?: string
          error_message?: string | null
          file_name: string
          file_path: string
          id?: string
          points_ok?: Json | null
          raw_text?: string | null
          recommandations?: Json | null
          resume?: string | null
          score?: string | null
          status?: string
          types_travaux?: Json | null
          updated_at?: string
          user_id: string
          work_type?: string | null
        }
        Update: {
          alertes?: Json | null
          assurance_level2_score?: string | null
          assurance_source?: string | null
          attestation_analysis?: Json | null
          attestation_comparison?: Json | null
          attestation_decennale_url?: string | null
          attestation_rcpro_url?: string | null
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_path?: string
          id?: string
          points_ok?: Json | null
          raw_text?: string | null
          recommandations?: Json | null
          resume?: string | null
          score?: string | null
          status?: string
          types_travaux?: Json | null
          updated_at?: string
          user_id?: string
          work_type?: string | null
        }
        Relationships: []
      }
      company_cache: {
        Row: {
          error_code: string | null
          error_message: string | null
          expires_at: string
          fetched_at: string
          id: string
          payload: Json
          provider: string
          siren: string
          siret: string
          status: string
        }
        Insert: {
          error_code?: string | null
          error_message?: string | null
          expires_at?: string
          fetched_at?: string
          id?: string
          payload?: Json
          provider?: string
          siren: string
          siret: string
          status?: string
        }
        Update: {
          error_code?: string | null
          error_message?: string | null
          expires_at?: string
          fetched_at?: string
          id?: string
          payload?: Json
          provider?: string
          siren?: string
          siret?: string
          status?: string
        }
        Relationships: []
      }
      post_signature_tracking: {
        Row: {
          admin_alert_date: string | null
          admin_alert_sent: boolean | null
          admin_alert_type: string | null
          analysis_id: string
          communication_channel: string | null
          company_name: string | null
          company_siret: string | null
          consent_date: string | null
          created_at: string
          deadline_alert_date: string | null
          deadline_alert_sent: boolean | null
          id: string
          is_signed: boolean
          max_execution_days: number | null
          phone_number: string | null
          signed_date: string | null
          tracking_consent: boolean
          updated_at: string
          user_id: string
          work_completion_response_date: string | null
          work_completion_status: string | null
          work_end_date: string | null
          work_start_date: string | null
        }
        Insert: {
          admin_alert_date?: string | null
          admin_alert_sent?: boolean | null
          admin_alert_type?: string | null
          analysis_id: string
          communication_channel?: string | null
          company_name?: string | null
          company_siret?: string | null
          consent_date?: string | null
          created_at?: string
          deadline_alert_date?: string | null
          deadline_alert_sent?: boolean | null
          id?: string
          is_signed?: boolean
          max_execution_days?: number | null
          phone_number?: string | null
          signed_date?: string | null
          tracking_consent?: boolean
          updated_at?: string
          user_id: string
          work_completion_response_date?: string | null
          work_completion_status?: string | null
          work_end_date?: string | null
          work_start_date?: string | null
        }
        Update: {
          admin_alert_date?: string | null
          admin_alert_sent?: boolean | null
          admin_alert_type?: string | null
          analysis_id?: string
          communication_channel?: string | null
          company_name?: string | null
          company_siret?: string | null
          consent_date?: string | null
          created_at?: string
          deadline_alert_date?: string | null
          deadline_alert_sent?: boolean | null
          id?: string
          is_signed?: boolean
          max_execution_days?: number | null
          phone_number?: string | null
          signed_date?: string | null
          tracking_consent?: boolean
          updated_at?: string
          user_id?: string
          work_completion_response_date?: string | null
          work_completion_status?: string | null
          work_end_date?: string | null
          work_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_signature_tracking_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      travaux_reference_prix: {
        Row: {
          categorie_travaux: string
          created_at: string
          description: string | null
          id: string
          prix_max_national: number
          prix_min_national: number
          unite: string
          updated_at: string
        }
        Insert: {
          categorie_travaux: string
          created_at?: string
          description?: string | null
          id?: string
          prix_max_national: number
          prix_min_national: number
          unite?: string
          updated_at?: string
        }
        Update: {
          categorie_travaux?: string
          created_at?: string
          description?: string | null
          id?: string
          prix_max_national?: number
          prix_min_national?: number
          unite?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      zones_geographiques: {
        Row: {
          coefficient: number
          created_at: string
          id: string
          prefixe_postal: string
          type_zone: string
        }
        Insert: {
          coefficient?: number
          created_at?: string
          id?: string
          prefixe_postal: string
          type_zone: string
        }
        Update: {
          coefficient?: number
          created_at?: string
          id?: string
          prefixe_postal?: string
          type_zone?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_kpis_scoring: {
        Row: {
          pct_orange: number | null
          pct_rouge: number | null
          pct_vert: number | null
          score_null: number | null
          score_orange: number | null
          score_rouge: number | null
          score_vert: number | null
        }
        Relationships: []
      }
      admin_kpis_tracking: {
        Row: {
          consent_given: number | null
          consent_rate: number | null
          responses_received: number | null
          signed_quotes: number | null
          status_completed: number | null
          status_delayed: number | null
          status_in_progress: number | null
          total_tracking_entries: number | null
          whatsapp_enabled: number | null
          whatsapp_rate: number | null
        }
        Relationships: []
      }
      admin_kpis_usage: {
        Row: {
          avg_analyses_per_user: number | null
          completed_analyses: number | null
          completion_rate: number | null
          error_analyses: number | null
          pending_analyses: number | null
          total_analyses: number | null
          total_users: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
