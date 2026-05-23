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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      academy_settings: {
        Row: {
          academy_name: string
          auto_close_enabled: boolean
          created_at: string
          id: string
          lat: number
          lng: number
          operating_end: string
          operating_start: string
          radius_meters: number
          updated_at: string
        }
        Insert: {
          academy_name?: string
          auto_close_enabled?: boolean
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          operating_end?: string
          operating_start?: string
          radius_meters?: number
          updated_at?: string
        }
        Update: {
          academy_name?: string
          auto_close_enabled?: boolean
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          operating_end?: string
          operating_start?: string
          radius_meters?: number
          updated_at?: string
        }
        Relationships: []
      }
      access_blocklist: {
        Row: {
          active: boolean
          blocked_until: string | null
          created_at: string
          created_by: string | null
          id: string
          member_id: string
          reason: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          blocked_until?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          member_id: string
          reason: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          blocked_until?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          member_id?: string
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_blocklist_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "access_members"
            referencedColumns: ["id"]
          },
        ]
      }
      access_logs: {
        Row: {
          created_at: string
          device_id: string | null
          device_ip: string | null
          direction: string
          external_id_snapshot: string | null
          id: string
          member_id: string | null
          member_name_snapshot: string | null
          occurred_at: string
          raw_payload: Json | null
          reason: string | null
          result: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          device_ip?: string | null
          direction?: string
          external_id_snapshot?: string | null
          id?: string
          member_id?: string | null
          member_name_snapshot?: string | null
          occurred_at?: string
          raw_payload?: Json | null
          reason?: string | null
          result: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          device_ip?: string | null
          direction?: string
          external_id_snapshot?: string | null
          id?: string
          member_id?: string | null
          member_name_snapshot?: string | null
          occurred_at?: string
          raw_payload?: Json | null
          reason?: string | null
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "access_members"
            referencedColumns: ["id"]
          },
        ]
      }
      access_members: {
        Row: {
          birth_date: string | null
          created_at: string
          document: string | null
          email: string | null
          external_id: string
          face_external_id: string | null
          full_name: string
          id: string
          last_payment_at: string | null
          last_synced_at: string | null
          notes: string | null
          payment_status: string
          phone: string | null
          photo_url: string | null
          plan_id: string | null
          plan_name_raw: string | null
          source: string
          status: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          external_id: string
          face_external_id?: string | null
          full_name: string
          id?: string
          last_payment_at?: string | null
          last_synced_at?: string | null
          notes?: string | null
          payment_status?: string
          phone?: string | null
          photo_url?: string | null
          plan_id?: string | null
          plan_name_raw?: string | null
          source?: string
          status?: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          external_id?: string
          face_external_id?: string | null
          full_name?: string
          id?: string
          last_payment_at?: string | null
          last_synced_at?: string | null
          notes?: string | null
          payment_status?: string
          phone?: string | null
          photo_url?: string | null
          plan_id?: string | null
          plan_name_raw?: string | null
          source?: string
          status?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_members_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "access_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      access_plans: {
        Row: {
          active: boolean
          allowed_end: string
          allowed_start: string
          allowed_weekdays: number[]
          created_at: string
          external_id: string | null
          id: string
          monthly_value_cents: number
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          allowed_end?: string
          allowed_start?: string
          allowed_weekdays?: number[]
          created_at?: string
          external_id?: string | null
          id?: string
          monthly_value_cents?: number
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          allowed_end?: string
          allowed_start?: string
          allowed_weekdays?: number[]
          created_at?: string
          external_id?: string | null
          id?: string
          monthly_value_cents?: number
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ad_contracts: {
        Row: {
          ad_duration_seconds: number
          advertiser_id: string
          contract_status: string
          created_at: string
          daily_executions: number
          end_date: string
          id: string
          notes: string | null
          payment_status: string
          plan_name: string
          segment_exclusive: boolean
          start_date: string
          updated_at: string
          value_cents: number
        }
        Insert: {
          ad_duration_seconds?: number
          advertiser_id: string
          contract_status?: string
          created_at?: string
          daily_executions?: number
          end_date: string
          id?: string
          notes?: string | null
          payment_status?: string
          plan_name?: string
          segment_exclusive?: boolean
          start_date: string
          updated_at?: string
          value_cents?: number
        }
        Update: {
          ad_duration_seconds?: number
          advertiser_id?: string
          contract_status?: string
          created_at?: string
          daily_executions?: number
          end_date?: string
          id?: string
          notes?: string | null
          payment_status?: string
          plan_name?: string
          segment_exclusive?: boolean
          start_date?: string
          updated_at?: string
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_contracts_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "advertisers"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_execution_logs: {
        Row: {
          actual_duration_seconds: number | null
          ad_id: string | null
          advertiser_id: string | null
          contract_id: string | null
          created_at: string
          error_message: string | null
          id: string
          played_at: string
          scheduled_time: string | null
          status: string
        }
        Insert: {
          actual_duration_seconds?: number | null
          ad_id?: string | null
          advertiser_id?: string | null
          contract_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          played_at?: string
          scheduled_time?: string | null
          status?: string
        }
        Update: {
          actual_duration_seconds?: number | null
          ad_id?: string | null
          advertiser_id?: string | null
          contract_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          played_at?: string
          scheduled_time?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_execution_logs_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_execution_logs_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "advertisers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_execution_logs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "ad_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_schedule: {
        Row: {
          ad_id: string
          contract_id: string | null
          created_at: string
          execution_status: string
          id: string
          schedule_date: string
          scheduled_time: string
        }
        Insert: {
          ad_id: string
          contract_id?: string | null
          created_at?: string
          execution_status?: string
          id?: string
          schedule_date?: string
          scheduled_time: string
        }
        Update: {
          ad_id?: string
          contract_id?: string | null
          created_at?: string
          execution_status?: string
          id?: string
          schedule_date?: string
          scheduled_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_schedule_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_schedule_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "ad_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      ads: {
        Row: {
          advertiser_id: string
          allowed_hours_end: string | null
          allowed_hours_start: string | null
          approved_at: string | null
          audio_url: string | null
          contract_id: string | null
          created_at: string
          duration_seconds: number
          id: string
          is_house_ad: boolean
          name: string
          priority: number
          status: string
          updated_at: string
          volume: number
        }
        Insert: {
          advertiser_id: string
          allowed_hours_end?: string | null
          allowed_hours_start?: string | null
          approved_at?: string | null
          audio_url?: string | null
          contract_id?: string | null
          created_at?: string
          duration_seconds?: number
          id?: string
          is_house_ad?: boolean
          name: string
          priority?: number
          status?: string
          updated_at?: string
          volume?: number
        }
        Update: {
          advertiser_id?: string
          allowed_hours_end?: string | null
          allowed_hours_start?: string | null
          approved_at?: string | null
          audio_url?: string | null
          contract_id?: string | null
          created_at?: string
          duration_seconds?: number
          id?: string
          is_house_ad?: boolean
          name?: string
          priority?: number
          status?: string
          updated_at?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "ads_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "advertisers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "ad_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      advertisers: {
        Row: {
          company_name: string
          contact_person: string | null
          created_at: string
          id: string
          notes: string | null
          phone: string | null
          segment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_name: string
          contact_person?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          phone?: string | null
          segment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_name?: string
          contact_person?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          phone?: string | null
          segment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advertisers_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "business_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      business_segments: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      class_enrollments: {
        Row: {
          cancelled_at: string | null
          class_id: string
          enrolled_at: string
          id: string
          member_id: string
          notes: string | null
          status: string
        }
        Insert: {
          cancelled_at?: string | null
          class_id: string
          enrolled_at?: string
          id?: string
          member_id: string
          notes?: string | null
          status?: string
        }
        Update: {
          cancelled_at?: string | null
          class_id?: string
          enrolled_at?: string
          id?: string
          member_id?: string
          notes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "gym_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_enrollments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "access_members"
            referencedColumns: ["id"]
          },
        ]
      }
      class_notifications_log: {
        Row: {
          class_id: string
          employee_id: string
          error_message: string | null
          id: string
          minutes_before: number
          notification_date: string
          sent_at: string
          status: string
        }
        Insert: {
          class_id: string
          employee_id: string
          error_message?: string | null
          id?: string
          minutes_before: number
          notification_date?: string
          sent_at?: string
          status?: string
        }
        Update: {
          class_id?: string
          employee_id?: string
          error_message?: string | null
          id?: string
          minutes_before?: number
          notification_date?: string
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_notifications_log_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_notifications_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      class_schedule: {
        Row: {
          active: boolean
          class_name: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          instructor_id: string | null
          instructor_name: string | null
          max_capacity: number | null
          start_time: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          class_name: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          instructor_id?: string | null
          instructor_name?: string | null
          max_capacity?: number | null
          start_time: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          class_name?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          instructor_id?: string | null
          instructor_name?: string | null
          max_capacity?: number | null
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_schedule_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          phone: string
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          phone: string
          role?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          phone?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      gym_classes: {
        Row: {
          active: boolean
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          instructor_id: string | null
          instructor_name: string | null
          max_capacity: number
          modality: string
          name: string
          notes: string | null
          room: string | null
          start_time: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          instructor_id?: string | null
          instructor_name?: string | null
          max_capacity?: number
          modality?: string
          name: string
          notes?: string | null
          room?: string | null
          start_time: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          instructor_id?: string | null
          instructor_name?: string | null
          max_capacity?: number
          modality?: string
          name?: string
          notes?: string | null
          room?: string | null
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_classes_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      member_payments: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          id: string
          member_id: string
          method: string
          notes: string | null
          paid_at: string
          receipt_url: string | null
          reference_month: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          member_id: string
          method?: string
          notes?: string | null
          paid_at?: string
          receipt_url?: string | null
          reference_month?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          member_id?: string
          method?: string
          notes?: string | null
          paid_at?: string
          receipt_url?: string | null
          reference_month?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "access_members"
            referencedColumns: ["id"]
          },
        ]
      }
      ponto_records: {
        Row: {
          auto_closed: boolean
          created_at: string
          date: string
          employee_id: string
          id: string
          lat: number | null
          lng: number | null
          source: string
          time: string
          type: string
          within_radius: boolean
        }
        Insert: {
          auto_closed?: boolean
          created_at?: string
          date?: string
          employee_id: string
          id?: string
          lat?: number | null
          lng?: number | null
          source?: string
          time?: string
          type: string
          within_radius?: boolean
        }
        Update: {
          auto_closed?: boolean
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
          source?: string
          time?: string
          type?: string
          within_radius?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ponto_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      radio_playlist: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          position: number
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          position?: number
          title?: string
          updated_at?: string
          url: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          position?: number
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      radio_settings: {
        Row: {
          created_at: string
          id: string
          min_interval_minutes: number
          min_same_advertiser_interval_minutes: number
          operating_hours_end: string
          operating_hours_start: string
          prime_hours_end: string | null
          prime_hours_start: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_interval_minutes?: number
          min_same_advertiser_interval_minutes?: number
          operating_hours_end?: string
          operating_hours_start?: string
          prime_hours_end?: string | null
          prime_hours_start?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          min_interval_minutes?: number
          min_same_advertiser_interval_minutes?: number
          operating_hours_end?: string
          operating_hours_start?: string
          prime_hours_end?: string | null
          prime_hours_start?: string | null
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
      whatsapp_conversations: {
        Row: {
          assigned_to: string | null
          auto_reply_enabled: boolean
          contact_name: string | null
          created_at: string
          id: string
          last_message: string | null
          last_message_at: string | null
          phone_number: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          auto_reply_enabled?: boolean
          contact_name?: string | null
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          phone_number: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          auto_reply_enabled?: boolean
          contact_name?: string | null
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          phone_number?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_ai_response: boolean
          media_url: string | null
          sender: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_ai_response?: boolean
          media_url?: string | null
          sender: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_ai_response?: boolean
          media_url?: string | null
          sender?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_outbox: {
        Row: {
          attempts: number
          category: string
          created_at: string
          employee_id: string | null
          id: string
          last_error: string | null
          member_id: string | null
          message: string
          phone: string
          scheduled_for: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          category?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          last_error?: string | null
          member_id?: string | null
          message: string
          phone: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          category?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          last_error?: string | null
          member_id?: string | null
          message?: string
          phone?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_outbox_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "access_members"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sessions: {
        Row: {
          connected_at: string | null
          created_at: string
          id: string
          phone_number: string | null
          qr_code: string | null
          session_name: string
          status: string
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          id?: string
          phone_number?: string | null
          qr_code?: string | null
          session_name?: string
          status?: string
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          id?: string
          phone_number?: string | null
          qr_code?: string | null
          session_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_overdue_members: { Args: never; Returns: number }
      queue_whatsapp_message: {
        Args: { _category?: string; _member_id: string; _message: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "staff"
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
      app_role: ["admin", "staff"],
    },
  },
} as const
