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
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
