npm warn exec The following package was not found and will be installed: supabase@2.95.6
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
      agent_config: {
        Row: {
          agent_mode: string
          created_at: string | null
          id: string
          openclaw_agent_id: string | null
          openclaw_token: string | null
          openclaw_url: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agent_mode?: string
          created_at?: string | null
          id?: string
          openclaw_agent_id?: string | null
          openclaw_token?: string | null
          openclaw_url?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agent_mode?: string
          created_at?: string | null
          id?: string
          openclaw_agent_id?: string | null
          openclaw_token?: string | null
          openclaw_url?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      agent_context_cache: {
        Row: {
          chantier_id: string
          context_json: Json
          hydrated_at: string
          invalidated: boolean | null
        }
        Insert: {
          chantier_id: string
          context_json: Json
          hydrated_at: string
          invalidated?: boolean | null
        }
        Update: {
          chantier_id?: string
          context_json?: Json
          hydrated_at?: string
          invalidated?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_context_cache_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: true
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_insights: {
        Row: {
          actions_taken: Json | null
          body: string
          chantier_id: string
          created_at: string | null
          id: string
          needs_confirmation: boolean | null
          read_by_user: boolean | null
          severity: string | null
          source_event: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actions_taken?: Json | null
          body: string
          chantier_id: string
          created_at?: string | null
          id?: string
          needs_confirmation?: boolean | null
          read_by_user?: boolean | null
          severity?: string | null
          source_event?: Json | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          actions_taken?: Json | null
          body?: string
          chantier_id?: string
          created_at?: string | null
          id?: string
          needs_confirmation?: boolean | null
          read_by_user?: boolean | null
          severity?: string | null
          source_event?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_insights_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_pending_decisions: {
        Row: {
          chantier_id: string
          context: Json | null
          created_at: string
          expected_action: Json
          expires_at: string
          id: string
          question: string
          resolved_answer: string | null
          resolved_at: string | null
          source_event: string | null
          status: string
        }
        Insert: {
          chantier_id: string
          context?: Json | null
          created_at?: string
          expected_action: Json
          expires_at?: string
          id?: string
          question: string
          resolved_answer?: string | null
          resolved_at?: string | null
          source_event?: string | null
          status?: string
        }
        Update: {
          chantier_id?: string
          context?: Json | null
          created_at?: string
          expected_action?: Json
          expires_at?: string
          id?: string
          question?: string
          resolved_answer?: string | null
          resolved_at?: string | null
          source_event?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_pending_decisions_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          actions_taken: Json | null
          chantier_id: string
          created_at: string | null
          id: string
          insights_created: number | null
          messages_analyzed: number | null
          run_type: string
          tokens_used: number | null
        }
        Insert: {
          actions_taken?: Json | null
          chantier_id: string
          created_at?: string | null
          id?: string
          insights_created?: number | null
          messages_analyzed?: number | null
          run_type: string
          tokens_used?: number | null
        }
        Update: {
          actions_taken?: Json | null
          chantier_id?: string
          created_at?: string | null
          id?: string
          insights_created?: number | null
          messages_analyzed?: number | null
          run_type?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_scheduled_actions: {
        Row: {
          action_type: string
          chantier_id: string
          created_at: string
          due_at: string
          fired_at: string | null
          fired_result: Json | null
          id: string
          payload: Json
          source: string | null
          status: string
        }
        Insert: {
          action_type?: string
          chantier_id: string
          created_at?: string
          due_at: string
          fired_at?: string | null
          fired_result?: Json | null
          id?: string
          payload: Json
          source?: string | null
          status?: string
        }
        Update: {
          action_type?: string
          chantier_id?: string
          created_at?: string
          due_at?: string
          fired_at?: string | null
          fired_result?: Json | null
          id?: string
          payload?: Json
          source?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_scheduled_actions_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      analyses: {
        Row: {
          alertes: Json | null
          assurance_level2_score: string | null
          assurance_source: string | null
          attestation_analysis: Json | null
          attestation_comparison: Json | null
          attestation_decennale_url: string | null
          attestation_rcpro_url: string | null
          conclusion_ia: string | null
          created_at: string
          domain: string
          error_message: string | null
          file_name: string
          file_path: string
          id: string
          market_price_overrides: Json | null
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
          conclusion_ia?: string | null
          created_at?: string
          domain?: string
          error_message?: string | null
          file_name: string
          file_path: string
          id?: string
          market_price_overrides?: Json | null
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
          conclusion_ia?: string | null
          created_at?: string
          domain?: string
          error_message?: string | null
          file_name?: string
          file_path?: string
          id?: string
          market_price_overrides?: Json | null
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
      analysis_work_items: {
        Row: {
          amount_ht: number | null
          analysis_id: string
          category: string | null
          created_at: string | null
          description: string
          id: string
          job_type_group: string | null
          n8n_response: Json | null
          quantity: number | null
          unit: string | null
        }
        Insert: {
          amount_ht?: number | null
          analysis_id: string
          category?: string | null
          created_at?: string | null
          description: string
          id?: string
          job_type_group?: string | null
          n8n_response?: Json | null
          quantity?: number | null
          unit?: string | null
        }
        Update: {
          amount_ht?: number | null
          analysis_id?: string
          category?: string | null
          created_at?: string | null
          description?: string
          id?: string
          job_type_group?: string | null
          n8n_response?: Json | null
          quantity?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_work_items_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          ai_generated: boolean | null
          ai_model: string | null
          ai_prompt: string | null
          category: string | null
          content_html: string
          cover_image_url: string | null
          created_at: string | null
          excerpt: string | null
          id: string
          mid_image_url: string | null
          published_at: string | null
          reading_time: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          scheduled_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          workflow_status: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          ai_model?: string | null
          ai_prompt?: string | null
          category?: string | null
          content_html: string
          cover_image_url?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string
          mid_image_url?: string | null
          published_at?: string | null
          reading_time?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          workflow_status?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          ai_model?: string | null
          ai_prompt?: string | null
          category?: string | null
          content_html?: string
          cover_image_url?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string
          mid_image_url?: string | null
          published_at?: string | null
          reading_time?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheduled_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          workflow_status?: string | null
        }
        Relationships: []
      }
      cashflow_extras: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          due_date: string
          financing_source: string | null
          id: string
          label: string
          notes: string | null
          paid_at: string | null
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          due_date: string
          financing_source?: string | null
          id?: string
          label: string
          notes?: string | null
          paid_at?: string | null
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          due_date?: string
          financing_source?: string | null
          id?: string
          label?: string
          notes?: string | null
          paid_at?: string | null
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_extras_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      chantier_assistant_messages: {
        Row: {
          agent_initiated: boolean
          chantier_id: string
          content: string | null
          created_at: string
          id: string
          is_read: boolean
          role: string
          tool_call_id: string | null
          tool_calls: Json | null
        }
        Insert: {
          agent_initiated?: boolean
          chantier_id: string
          content?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          role: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Update: {
          agent_initiated?: boolean
          chantier_id?: string
          content?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          role?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chantier_assistant_messages_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      chantier_conversations: {
        Row: {
          chantier_id: string
          contact_email: string
          contact_id: string | null
          contact_name: string
          contact_phone: string | null
          created_at: string
          id: string
          last_message_at: string | null
          reply_address: string
          unread_count: number
          user_id: string
        }
        Insert: {
          chantier_id: string
          contact_email: string
          contact_id?: string | null
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          reply_address: string
          unread_count?: number
          user_id: string
        }
        Update: {
          chantier_id?: string
          contact_email?: string
          contact_id?: string | null
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          reply_address?: string
          unread_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chantier_conversations_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chantier_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts_chantier"
            referencedColumns: ["id"]
          },
        ]
      }
      chantier_entrees: {
        Row: {
          chantier_id: string
          created_at: string
          date_entree: string
          id: string
          label: string
          montant: number
          notes: string | null
          source_type: string
          statut: string
          user_id: string
        }
        Insert: {
          chantier_id: string
          created_at?: string
          date_entree: string
          id?: string
          label: string
          montant: number
          notes?: string | null
          source_type?: string
          statut?: string
          user_id: string
        }
        Update: {
          chantier_id?: string
          created_at?: string
          date_entree?: string
          id?: string
          label?: string
          montant?: number
          notes?: string | null
          source_type?: string
          statut?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chantier_entrees_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      chantier_journal: {
        Row: {
          alerts_count: number | null
          body: string
          chantier_id: string
          created_at: string | null
          id: string
          journal_date: string
          max_severity: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          alerts_count?: number | null
          body: string
          chantier_id: string
          created_at?: string | null
          id?: string
          journal_date: string
          max_severity?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          alerts_count?: number | null
          body?: string
          chantier_id?: string
          created_at?: string | null
          id?: string
          journal_date?: string
          max_severity?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chantier_journal_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      chantier_messages: {
        Row: {
          body_html: string | null
          body_text: string
          conversation_id: string
          created_at: string
          direction: string
          id: string
          sendgrid_id: string | null
          status: string
          subject: string | null
        }
        Insert: {
          body_html?: string | null
          body_text: string
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          sendgrid_id?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          body_html?: string | null
          body_text?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          sendgrid_id?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chantier_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chantier_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chantier_updates: {
        Row: {
          changes: string
          chantier_id: string
          created_at: string
          id: string
          modification: string
        }
        Insert: {
          changes?: string
          chantier_id: string
          created_at?: string
          id?: string
          modification: string
        }
        Update: {
          changes?: string
          chantier_id?: string
          created_at?: string
          id?: string
          modification?: string
        }
        Relationships: [
          {
            foreignKeyName: "chantier_updates_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      chantier_whatsapp_groups: {
        Row: {
          chantier_id: string
          created_at: string
          group_jid: string
          id: string
          invite_link: string | null
          is_owner_channel: boolean
          name: string
        }
        Insert: {
          chantier_id: string
          created_at?: string
          group_jid: string
          id?: string
          invite_link?: string | null
          is_owner_channel?: boolean
          name?: string
        }
        Update: {
          chantier_id?: string
          created_at?: string
          group_jid?: string
          id?: string
          invite_link?: string | null
          is_owner_channel?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "chantier_whatsapp_groups_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      chantier_whatsapp_members: {
        Row: {
          excluded_no_whatsapp: boolean
          group_id: string
          id: string
          joined_at: string
          left_at: string | null
          name: string
          phone: string
          role: string
          status: string
        }
        Insert: {
          excluded_no_whatsapp?: boolean
          group_id: string
          id?: string
          joined_at?: string
          left_at?: string | null
          name: string
          phone: string
          role?: string
          status?: string
        }
        Update: {
          excluded_no_whatsapp?: boolean
          group_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          name?: string
          phone?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "chantier_whatsapp_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chantier_whatsapp_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      chantier_whatsapp_messages: {
        Row: {
          body: string | null
          chantier_id: string
          from_me: boolean
          from_number: string
          group_id: string
          id: string
          media_url: string | null
          timestamp: string
          type: string
        }
        Insert: {
          body?: string | null
          chantier_id: string
          from_me?: boolean
          from_number: string
          group_id: string
          id: string
          media_url?: string | null
          timestamp?: string
          type?: string
        }
        Update: {
          body?: string | null
          chantier_id?: string
          from_me?: boolean
          from_number?: string
          group_id?: string
          id?: string
          media_url?: string | null
          timestamp?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chantier_whatsapp_messages_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      chantiers: {
        Row: {
          adresse: string | null
          apport: number | null
          budget: number | null
          created_at: string
          credit: number | null
          date_debut: string | null
          date_debut_chantier: string | null
          date_debut_souhaitee: string | null
          date_fin: string | null
          date_fin_souhaitee: string | null
          duree_credit: number | null
          emoji: string
          id: string
          mensualite: number | null
          metadonnees: string | null
          nom: string
          phase: string
          project_mode: string | null
          taux_interet: number | null
          type_projet: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          adresse?: string | null
          apport?: number | null
          budget?: number | null
          created_at?: string
          credit?: number | null
          date_debut?: string | null
          date_debut_chantier?: string | null
          date_debut_souhaitee?: string | null
          date_fin?: string | null
          date_fin_souhaitee?: string | null
          duree_credit?: number | null
          emoji?: string
          id?: string
          mensualite?: number | null
          metadonnees?: string | null
          nom?: string
          phase?: string
          project_mode?: string | null
          taux_interet?: number | null
          type_projet?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          adresse?: string | null
          apport?: number | null
          budget?: number | null
          created_at?: string
          credit?: number | null
          date_debut?: string | null
          date_debut_chantier?: string | null
          date_debut_souhaitee?: string | null
          date_fin?: string | null
          date_fin_souhaitee?: string | null
          duree_credit?: number | null
          emoji?: string
          id?: string
          mensualite?: number | null
          metadonnees?: string | null
          nom?: string
          phase?: string
          project_mode?: string | null
          taux_interet?: number | null
          type_projet?: string | null
          updated_at?: string
          user_id?: string
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
      contacts_chantier: {
        Row: {
          analyse_id: string | null
          chantier_id: string
          contact_category: string | null
          created_at: string
          devis_id: string | null
          email: string | null
          has_whatsapp: boolean | null
          id: string
          lot_id: string | null
          nom: string
          notes: string | null
          role: string | null
          siret: string | null
          source: string
          telephone: string | null
          user_id: string
          whatsapp_checked_at: string | null
        }
        Insert: {
          analyse_id?: string | null
          chantier_id: string
          contact_category?: string | null
          created_at?: string
          devis_id?: string | null
          email?: string | null
          has_whatsapp?: boolean | null
          id?: string
          lot_id?: string | null
          nom: string
          notes?: string | null
          role?: string | null
          siret?: string | null
          source?: string
          telephone?: string | null
          user_id: string
          whatsapp_checked_at?: string | null
        }
        Update: {
          analyse_id?: string | null
          chantier_id?: string
          contact_category?: string | null
          created_at?: string
          devis_id?: string | null
          email?: string | null
          has_whatsapp?: boolean | null
          id?: string
          lot_id?: string | null
          nom?: string
          notes?: string | null
          role?: string | null
          siret?: string | null
          source?: string
          telephone?: string | null
          user_id?: string
          whatsapp_checked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_chantier_analyse_id_fkey"
            columns: ["analyse_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_chantier_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_chantier_devis_id_fkey"
            columns: ["devis_id"]
            isOneToOne: false
            referencedRelation: "devis_chantier"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_chantier_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots_chantier"
            referencedColumns: ["id"]
          },
        ]
      }
      devis_chantier: {
        Row: {
          acompte_paye: number | null
          acompte_pct: number | null
          analyse_id: string | null
          artisan_email: string | null
          artisan_nom: string
          artisan_phone: string | null
          artisan_siret: string | null
          assurance_ok: boolean
          chantier_id: string
          created_at: string
          date_debut: string | null
          date_fin: string | null
          id: string
          lot_id: string | null
          mentions_ok: boolean
          montant_ht: number
          montant_ttc: number
          rc_pro_ok: boolean
          score_analyse: string | null
          statut: string
          tva: number
          type_travaux: string
          user_id: string | null
        }
        Insert: {
          acompte_paye?: number | null
          acompte_pct?: number | null
          analyse_id?: string | null
          artisan_email?: string | null
          artisan_nom: string
          artisan_phone?: string | null
          artisan_siret?: string | null
          assurance_ok?: boolean
          chantier_id: string
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          id?: string
          lot_id?: string | null
          mentions_ok?: boolean
          montant_ht?: number
          montant_ttc?: number
          rc_pro_ok?: boolean
          score_analyse?: string | null
          statut?: string
          tva?: number
          type_travaux?: string
          user_id?: string | null
        }
        Update: {
          acompte_paye?: number | null
          acompte_pct?: number | null
          analyse_id?: string | null
          artisan_email?: string | null
          artisan_nom?: string
          artisan_phone?: string | null
          artisan_siret?: string | null
          assurance_ok?: boolean
          chantier_id?: string
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          id?: string
          lot_id?: string | null
          mentions_ok?: boolean
          montant_ht?: number
          montant_ttc?: number
          rc_pro_ok?: boolean
          score_analyse?: string | null
          statut?: string
          tva?: number
          type_travaux?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devis_chantier_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devis_chantier_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots_chantier"
            referencedColumns: ["id"]
          },
        ]
      }
      document_extractions: {
        Row: {
          analysis_id: string | null
          blocks: Json | null
          cache_hit: boolean
          contains_table_signals: boolean | null
          created_at: string
          detected_units_set: string[] | null
          error_code: string | null
          error_details: Json | null
          expires_at: string
          file_hash: string
          file_path: string
          force_textract: boolean | null
          id: string
          ocr_debug: Json | null
          ocr_provider: string | null
          ocr_reason: string | null
          ocr_status: string
          ocr_used: boolean
          pages_count: number | null
          pages_used: number | null
          pages_used_list: number[] | null
          parsed_data: Json | null
          parser_debug: Json | null
          parser_status: string
          provider: string
          provider_calls: Json | null
          qty_ref_debug: Json | null
          qty_ref_detected: number | null
          qty_unit: string | null
          qtyref_candidates: Json | null
          qtyref_failure_reason: string | null
          qtyref_status: string
          quality_score: number | null
          raw_text: string | null
          request_id: string | null
          sample_lines: Json | null
          started_at: string | null
          status: string
          text_length: number | null
          text_length_by_page: Json | null
          textract_debug: Json | null
        }
        Insert: {
          analysis_id?: string | null
          blocks?: Json | null
          cache_hit?: boolean
          contains_table_signals?: boolean | null
          created_at?: string
          detected_units_set?: string[] | null
          error_code?: string | null
          error_details?: Json | null
          expires_at?: string
          file_hash: string
          file_path: string
          force_textract?: boolean | null
          id?: string
          ocr_debug?: Json | null
          ocr_provider?: string | null
          ocr_reason?: string | null
          ocr_status?: string
          ocr_used?: boolean
          pages_count?: number | null
          pages_used?: number | null
          pages_used_list?: number[] | null
          parsed_data?: Json | null
          parser_debug?: Json | null
          parser_status?: string
          provider?: string
          provider_calls?: Json | null
          qty_ref_debug?: Json | null
          qty_ref_detected?: number | null
          qty_unit?: string | null
          qtyref_candidates?: Json | null
          qtyref_failure_reason?: string | null
          qtyref_status?: string
          quality_score?: number | null
          raw_text?: string | null
          request_id?: string | null
          sample_lines?: Json | null
          started_at?: string | null
          status?: string
          text_length?: number | null
          text_length_by_page?: Json | null
          textract_debug?: Json | null
        }
        Update: {
          analysis_id?: string | null
          blocks?: Json | null
          cache_hit?: boolean
          contains_table_signals?: boolean | null
          created_at?: string
          detected_units_set?: string[] | null
          error_code?: string | null
          error_details?: Json | null
          expires_at?: string
          file_hash?: string
          file_path?: string
          force_textract?: boolean | null
          id?: string
          ocr_debug?: Json | null
          ocr_provider?: string | null
          ocr_reason?: string | null
          ocr_status?: string
          ocr_used?: boolean
          pages_count?: number | null
          pages_used?: number | null
          pages_used_list?: number[] | null
          parsed_data?: Json | null
          parser_debug?: Json | null
          parser_status?: string
          provider?: string
          provider_calls?: Json | null
          qty_ref_debug?: Json | null
          qty_ref_detected?: number | null
          qty_unit?: string | null
          qtyref_candidates?: Json | null
          qtyref_failure_reason?: string | null
          qtyref_status?: string
          quality_score?: number | null
          raw_text?: string | null
          request_id?: string | null
          sample_lines?: Json | null
          started_at?: string | null
          status?: string
          text_length?: number | null
          text_length_by_page?: Json | null
          textract_debug?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "document_extractions_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      documents_chantier: {
        Row: {
          analyse_id: string | null
          avenant_motif: string | null
          bucket_path: string
          chantier_id: string
          created_at: string
          date: string | null
          depense_type: string | null
          devis_statut: string | null
          devis_validated_at: string | null
          document_type: string
          facture_statut: string | null
          id: string
          lot_id: string | null
          lot_override_reason: string | null
          mime_type: string | null
          montant: number | null
          montant_paye: number | null
          nom: string
          nom_fichier: string
          parent_devis_id: string | null
          payment_terms: Json | null
          source: string
          statut: string
          taille_octets: number | null
          type: string
          updated_at: string
          url: string
          user_id: string | null
          vision_description: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          analyse_id?: string | null
          avenant_motif?: string | null
          bucket_path: string
          chantier_id: string
          created_at?: string
          date?: string | null
          depense_type?: string | null
          devis_statut?: string | null
          devis_validated_at?: string | null
          document_type?: string
          facture_statut?: string | null
          id?: string
          lot_id?: string | null
          lot_override_reason?: string | null
          mime_type?: string | null
          montant?: number | null
          montant_paye?: number | null
          nom: string
          nom_fichier: string
          parent_devis_id?: string | null
          payment_terms?: Json | null
          source?: string
          statut?: string
          taille_octets?: number | null
          type?: string
          updated_at?: string
          url?: string
          user_id?: string | null
          vision_description?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          analyse_id?: string | null
          avenant_motif?: string | null
          bucket_path?: string
          chantier_id?: string
          created_at?: string
          date?: string | null
          depense_type?: string | null
          devis_statut?: string | null
          devis_validated_at?: string | null
          document_type?: string
          facture_statut?: string | null
          id?: string
          lot_id?: string | null
          lot_override_reason?: string | null
          mime_type?: string | null
          montant?: number | null
          montant_paye?: number | null
          nom?: string
          nom_fichier?: string
          parent_devis_id?: string | null
          payment_terms?: Json | null
          source?: string
          statut?: string
          taille_octets?: number | null
          type?: string
          updated_at?: string
          url?: string
          user_id?: string | null
          vision_description?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_chantier_analyse_id_fkey"
            columns: ["analyse_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_chantier_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_chantier_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots_chantier"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_chantier_parent_devis_id_fkey"
            columns: ["parent_devis_id"]
            isOneToOne: false
            referencedRelation: "documents_chantier"
            referencedColumns: ["id"]
          },
        ]
      }
      dvf_prices: {
        Row: {
          code_insee: string
          code_postal: string | null
          commune: string
          nb_ventes_appartement: number | null
          nb_ventes_maison: number | null
          period: string | null
          prix_m2: number
          prix_m2_appartement: number | null
          prix_m2_maison: number | null
          source: string | null
          updated_at: string | null
        }
        Insert: {
          code_insee: string
          code_postal?: string | null
          commune: string
          nb_ventes_appartement?: number | null
          nb_ventes_maison?: number | null
          period?: string | null
          prix_m2: number
          prix_m2_appartement?: number | null
          prix_m2_maison?: number | null
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          code_insee?: string
          code_postal?: string | null
          commune?: string
          nb_ventes_appartement?: number | null
          nb_ventes_maison?: number | null
          period?: string | null
          prix_m2?: number
          prix_m2_appartement?: number | null
          prix_m2_maison?: number | null
          source?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      dvf_prices_v2: {
        Row: {
          code_insee: string
          commune: string
          nb_ventes_appartement: number | null
          nb_ventes_maison: number | null
          prix_m2_appartement: number | null
          prix_m2_maison: number | null
          source: string | null
          updated_at: string | null
        }
        Insert: {
          code_insee: string
          commune: string
          nb_ventes_appartement?: number | null
          nb_ventes_maison?: number | null
          prix_m2_appartement?: number | null
          prix_m2_maison?: number | null
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          code_insee?: string
          commune?: string
          nb_ventes_appartement?: number | null
          nb_ventes_maison?: number | null
          prix_m2_appartement?: number | null
          prix_m2_maison?: number | null
          source?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          artisan_nom: string | null
          chantier_id: string
          created_at: string
          date: string
          id: string
          note: string
          phase: string
          photos: string[]
          tags: string[]
        }
        Insert: {
          artisan_nom?: string | null
          chantier_id: string
          created_at?: string
          date?: string
          id?: string
          note?: string
          phase?: string
          photos?: string[]
          tags?: string[]
        }
        Update: {
          artisan_nom?: string | null
          chantier_id?: string
          created_at?: string
          date?: string
          id?: string
          note?: string
          phase?: string
          photos?: string[]
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_dependencies: {
        Row: {
          created_at: string
          depends_on_id: string
          lot_id: string
        }
        Insert: {
          created_at?: string
          depends_on_id: string
          lot_id: string
        }
        Update: {
          created_at?: string
          depends_on_id?: string
          lot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lot_dependencies_depends_on_id_fkey"
            columns: ["depends_on_id"]
            isOneToOne: false
            referencedRelation: "lots_chantier"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_dependencies_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots_chantier"
            referencedColumns: ["id"]
          },
        ]
      }
      lots_chantier: {
        Row: {
          budget_avg_ht: number | null
          budget_max_ht: number | null
          budget_min_ht: number | null
          chantier_id: string
          created_at: string
          date_debut: string | null
          date_fin: string | null
          delai_avant_jours: number
          divers_ht: number | null
          duree_jours: number | null
          emoji: string | null
          id: string
          job_type: string | null
          lane_index: number | null
          main_oeuvre_ht: number | null
          materiaux_ht: number | null
          nom: string
          ordre: number
          ordre_planning: number | null
          parallel_group: number | null
          quantite: number | null
          role: string | null
          statut: string
          unite: string | null
          updated_at: string
        }
        Insert: {
          budget_avg_ht?: number | null
          budget_max_ht?: number | null
          budget_min_ht?: number | null
          chantier_id: string
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          delai_avant_jours?: number
          divers_ht?: number | null
          duree_jours?: number | null
          emoji?: string | null
          id?: string
          job_type?: string | null
          lane_index?: number | null
          main_oeuvre_ht?: number | null
          materiaux_ht?: number | null
          nom: string
          ordre?: number
          ordre_planning?: number | null
          parallel_group?: number | null
          quantite?: number | null
          role?: string | null
          statut?: string
          unite?: string | null
          updated_at?: string
        }
        Update: {
          budget_avg_ht?: number | null
          budget_max_ht?: number | null
          budget_min_ht?: number | null
          chantier_id?: string
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          delai_avant_jours?: number
          divers_ht?: number | null
          duree_jours?: number | null
          emoji?: string | null
          id?: string
          job_type?: string | null
          lane_index?: number | null
          main_oeuvre_ht?: number | null
          materiaux_ht?: number | null
          nom?: string
          ordre?: number
          ordre_planning?: number | null
          parallel_group?: number | null
          quantite?: number | null
          role?: string | null
          statut?: string
          unite?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lots_chantier_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      market_prices: {
        Row: {
          confidence: string | null
          created_at: string | null
          domain: string
          fixed_avg_ht: number
          fixed_max_ht: number
          fixed_min_ht: number
          id: number
          job_type: string
          label: string
          last_reviewed_at: string | null
          notes: string | null
          price_avg_unit_ht: number
          price_max_unit_ht: number
          price_min_unit_ht: number
          ratio_fixed: number | null
          ratio_main_oeuvre: number
          ratio_materiaux: number
          ratio_unit: number | null
          sample_size: number | null
          source: string | null
          unit: string
          variability_ratio: number | null
          zip_scope: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string | null
          domain?: string
          fixed_avg_ht?: number
          fixed_max_ht?: number
          fixed_min_ht?: number
          id?: number
          job_type: string
          label: string
          last_reviewed_at?: string | null
          notes?: string | null
          price_avg_unit_ht?: number
          price_max_unit_ht?: number
          price_min_unit_ht?: number
          ratio_fixed?: number | null
          ratio_main_oeuvre?: number
          ratio_materiaux?: number
          ratio_unit?: number | null
          sample_size?: number | null
          source?: string | null
          unit?: string
          variability_ratio?: number | null
          zip_scope?: string
        }
        Update: {
          confidence?: string | null
          created_at?: string | null
          domain?: string
          fixed_avg_ht?: number
          fixed_max_ht?: number
          fixed_min_ht?: number
          id?: number
          job_type?: string
          label?: string
          last_reviewed_at?: string | null
          notes?: string | null
          price_avg_unit_ht?: number
          price_max_unit_ht?: number
          price_min_unit_ht?: number
          ratio_fixed?: number | null
          ratio_main_oeuvre?: number
          ratio_materiaux?: number
          ratio_unit?: number | null
          sample_size?: number | null
          source?: string | null
          unit?: string
          variability_ratio?: number | null
          zip_scope?: string
        }
        Relationships: []
      }
      newsletter_subscriptions: {
        Row: {
          email: string
          id: string
          source: string | null
          subscribed_at: string | null
        }
        Insert: {
          email: string
          id?: string
          source?: string | null
          subscribed_at?: string | null
        }
        Update: {
          email?: string
          id?: string
          source?: string | null
          subscribed_at?: string | null
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          amount: number | null
          created_at: string | null
          due_date: string | null
          financing_source: string | null
          funding_source_id: string | null
          id: string
          is_override: boolean | null
          label: string | null
          payment_term_id: string | null
          project_id: string | null
          replaced_by: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          due_date?: string | null
          financing_source?: string | null
          funding_source_id?: string | null
          id?: string
          is_override?: boolean | null
          label?: string | null
          payment_term_id?: string | null
          project_id?: string | null
          replaced_by?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          due_date?: string | null
          financing_source?: string | null
          funding_source_id?: string | null
          id?: string
          is_override?: boolean | null
          label?: string | null
          payment_term_id?: string | null
          project_id?: string | null
          replaced_by?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_funding_source_id_fkey"
            columns: ["funding_source_id"]
            isOneToOne: false
            referencedRelation: "chantier_entrees"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_paid: number | null
          id: string
          method: string | null
          paid_at: string | null
          payment_event_id: string | null
        }
        Insert: {
          amount_paid?: number | null
          id?: string
          method?: string | null
          paid_at?: string | null
          payment_event_id?: string | null
        }
        Update: {
          amount_paid?: number | null
          id?: string
          method?: string | null
          paid_at?: string | null
          payment_event_id?: string | null
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
      postal_insee: {
        Row: {
          code_insee: string
          code_postal: string
          commune: string
          id: number
        }
        Insert: {
          code_insee: string
          code_postal: string
          commune: string
          id?: number
        }
        Update: {
          code_insee?: string
          code_postal?: string
          commune?: string
          id?: number
        }
        Relationships: []
      }
      postal_insee_raw: {
        Row: {
          code_insee: string | null
          code_postal: string | null
          commune: string | null
        }
        Insert: {
          code_insee?: string | null
          code_postal?: string | null
          commune?: string | null
        }
        Update: {
          code_insee?: string | null
          code_postal?: string | null
          commune?: string | null
        }
        Relationships: []
      }
      price_observations: {
        Row: {
          analysis_id: string | null
          catalog_job_types: string[] | null
          created_at: string
          devis_lines: Json
          devis_total_ht: number | null
          domain: string
          id: string
          job_type_label: string
          line_count: number
          main_quantity: number
          main_unit: string
          user_id: string
          zip_code: string | null
        }
        Insert: {
          analysis_id?: string | null
          catalog_job_types?: string[] | null
          created_at?: string
          devis_lines?: Json
          devis_total_ht?: number | null
          domain?: string
          id?: string
          job_type_label: string
          line_count?: number
          main_quantity?: number
          main_unit?: string
          user_id: string
          zip_code?: string | null
        }
        Update: {
          analysis_id?: string | null
          catalog_job_types?: string[] | null
          created_at?: string
          devis_lines?: Json
          devis_total_ht?: number | null
          domain?: string
          id?: string
          job_type_label?: string
          line_count?: number
          main_quantity?: number
          main_unit?: string
          user_id?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      relances: {
        Row: {
          artisan_email: string
          artisan_nom: string
          artisan_phone: string | null
          channel: string | null
          chantier_id: string
          contenu: string
          created_at: string
          envoye_at: string | null
          id: string
          type: string
        }
        Insert: {
          artisan_email?: string
          artisan_nom: string
          artisan_phone?: string | null
          channel?: string | null
          chantier_id: string
          contenu?: string
          created_at?: string
          envoye_at?: string | null
          id?: string
          type: string
        }
        Update: {
          artisan_email?: string
          artisan_nom?: string
          artisan_phone?: string | null
          channel?: string | null
          chantier_id?: string
          contenu?: string
          created_at?: string
          envoye_at?: string | null
          id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "relances_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_prices_v1: {
        Row: {
          code_insee: string
          commune: string | null
          loyer_m2_appartement: number | null
          loyer_m2_maison: number | null
          nb_obs_appartement: number | null
          nb_obs_maison: number | null
          source: string | null
          updated_at: string | null
        }
        Insert: {
          code_insee: string
          commune?: string | null
          loyer_m2_appartement?: number | null
          loyer_m2_maison?: number | null
          nb_obs_appartement?: number | null
          nb_obs_maison?: number | null
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          code_insee?: string
          commune?: string | null
          loyer_m2_appartement?: number | null
          loyer_m2_maison?: number | null
          nb_obs_appartement?: number | null
          nb_obs_maison?: number | null
          source?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      strategic_matrix: {
        Row: {
          attractivite: number | null
          capex_risk: number | null
          energie: number | null
          fiscalite: number | null
          impact_loyer: number | null
          job_type: string
          liquidite: number | null
          recovery_rate: number
          reduction_risque: number | null
          vacance: number | null
          value_intrinseque: number | null
        }
        Insert: {
          attractivite?: number | null
          capex_risk?: number | null
          energie?: number | null
          fiscalite?: number | null
          impact_loyer?: number | null
          job_type: string
          liquidite?: number | null
          recovery_rate?: number
          reduction_risque?: number | null
          vacance?: number | null
          value_intrinseque?: number | null
        }
        Update: {
          attractivite?: number | null
          capex_risk?: number | null
          energie?: number | null
          fiscalite?: number | null
          impact_loyer?: number | null
          job_type?: string
          liquidite?: number | null
          recovery_rate?: number
          reduction_risque?: number | null
          vacance?: number | null
          value_intrinseque?: number | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          lifetime_analysis_count: number
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          lifetime_analysis_count?: number
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          lifetime_analysis_count?: number
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      todo_chantier: {
        Row: {
          chantier_id: string
          created_at: string
          done: boolean
          id: string
          ordre: number
          priorite: string
          titre: string
          user_id: string | null
        }
        Insert: {
          chantier_id: string
          created_at?: string
          done?: boolean
          id?: string
          ordre?: number
          priorite?: string
          titre: string
          user_id?: string | null
        }
        Update: {
          chantier_id?: string
          created_at?: string
          done?: boolean
          id?: string
          ordre?: number
          priorite?: string
          titre?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "todo_chantier_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
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
      whatsapp_message_statuses: {
        Row: {
          chantier_id: string
          id: string
          message_id: string
          status: string
          status_code: number | null
          updated_at: string
          viewer_id: string
          viewer_phone: string | null
        }
        Insert: {
          chantier_id: string
          id?: string
          message_id: string
          status: string
          status_code?: number | null
          updated_at?: string
          viewer_id: string
          viewer_phone?: string | null
        }
        Update: {
          chantier_id?: string
          id?: string
          message_id?: string
          status?: string
          status_code?: number | null
          updated_at?: string
          viewer_id?: string
          viewer_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_statuses_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_outgoing_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_outgoing_messages: {
        Row: {
          body: string
          chantier_id: string
          group_jid: string
          id: string
          run_type: string | null
          sent_at: string
          sent_by: string
        }
        Insert: {
          body: string
          chantier_id: string
          group_jid: string
          id: string
          run_type?: string | null
          sent_at?: string
          sent_by?: string
        }
        Update: {
          body?: string
          chantier_id?: string
          group_jid?: string
          id?: string
          run_type?: string | null
          sent_at?: string
          sent_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_outgoing_messages_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
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
      admin_kpis_alerts: {
        Row: {
          avg_alerts_per_analysis: number | null
          category: string | null
          count: number | null
          percentage: number | null
          total_alerts: number | null
        }
        Relationships: []
      }
      admin_kpis_daily_evolution: {
        Row: {
          analyses: number | null
          date: string | null
          orange: number | null
          rouge: number | null
          users: number | null
          vert: number | null
        }
        Relationships: []
      }
      admin_kpis_documents: {
        Row: {
          devis_diagnostic: number | null
          devis_prestation_technique: number | null
          devis_travaux: number | null
          documents_refuses: number | null
          total: number | null
        }
        Relationships: []
      }
      admin_kpis_retention_daily: {
        Row: {
          day: string | null
          new_users: number | null
          returning_users: number | null
        }
        Relationships: []
      }
      admin_kpis_retention_weekly: {
        Row: {
          new_users: number | null
          returning_users: number | null
          week: string | null
        }
        Relationships: []
      }
      admin_kpis_returning_users: {
        Row: {
          analysis_count: number | null
          completed_count: number | null
          email: string | null
          first_analysis_at: string | null
          last_analysis_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
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
      admin_kpis_time_analytics: {
        Row: {
          this_month: number | null
          this_week: number | null
          today: number | null
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
      admin_kpis_weekly_evolution: {
        Row: {
          analyses: number | null
          label: string | null
          orange: number | null
          rouge: number | null
          users: number | null
          vert: number | null
          week: string | null
        }
        Relationships: []
      }
      admin_kpis_work_type_distribution: {
        Row: {
          categorie: string | null
          nb_analyses: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_pending_reminders: {
        Args: { batch_limit?: number }
        Returns: {
          action_type: string
          chantier_id: string
          due_at: string
          id: string
          payload: Json
          source: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_analysis_count: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      safe_jsonb: { Args: { val: string }; Returns: Json }
      set_payment_event_status: {
        Args: { p_chantier_id: string; p_event_id: string; p_status: string }
        Returns: boolean
      }
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
