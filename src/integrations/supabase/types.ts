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
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_display_name: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_display_name?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_display_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      forecast_approvers: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      forecasts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          comment: string
          created_at: string
          date: string
          day: string
          forecast_notes: string
          forecasted_avg_spend: number
          forecasted_customers: number
          forecasted_gross_sales: number
          forecasted_service_charge: number
          forecasted_total_sales: number
          id: string
          pending_post_event_notes: string | null
          post_event_notes: string
          status: string
          submitted_by: string | null
          updated_at: string
          venue: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          comment?: string
          created_at?: string
          date: string
          day: string
          forecast_notes?: string
          forecasted_avg_spend?: number
          forecasted_customers?: number
          forecasted_gross_sales?: number
          forecasted_service_charge?: number
          forecasted_total_sales?: number
          id?: string
          pending_post_event_notes?: string | null
          post_event_notes?: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
          venue: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          comment?: string
          created_at?: string
          date?: string
          day?: string
          forecast_notes?: string
          forecasted_avg_spend?: number
          forecasted_customers?: number
          forecasted_gross_sales?: number
          forecasted_service_charge?: number
          forecasted_total_sales?: number
          id?: string
          pending_post_event_notes?: string | null
          post_event_notes?: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
          venue?: string
        }
        Relationships: []
      }
      page_visibility: {
        Row: {
          id: string
          page_key: string
          page_label: string
          updated_at: string
          visible_to_all: boolean
        }
        Insert: {
          id?: string
          page_key: string
          page_label: string
          updated_at?: string
          visible_to_all?: boolean
        }
        Update: {
          id?: string
          page_key?: string
          page_label?: string
          updated_at?: string
          visible_to_all?: boolean
        }
        Relationships: []
      }
      pl_manual_lines: {
        Row: {
          amount: number
          created_at: string
          id: string
          line_item_name: string
          month: number | null
          notes: string | null
          updated_at: string
          year: number
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          line_item_name: string
          month?: number | null
          notes?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          line_item_name?: string
          month?: number | null
          notes?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          preferences: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          preferences?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          preferences?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sales_records: {
        Row: {
          alipay: number
          amex: number
          card_tips: number
          cash: number
          created_at: string
          date: string
          day: string
          discount: number
          guests: number
          id: string
          mastercard: number
          orders: number
          report_number: string
          service_charge: number
          subtotal: number
          total_sales: number
          union_pay: number
          venue: string
          visa: number
          wechat: number
        }
        Insert: {
          alipay?: number
          amex?: number
          card_tips?: number
          cash?: number
          created_at?: string
          date: string
          day: string
          discount?: number
          guests?: number
          id?: string
          mastercard?: number
          orders?: number
          report_number: string
          service_charge?: number
          subtotal?: number
          total_sales?: number
          union_pay?: number
          venue: string
          visa?: number
          wechat?: number
        }
        Update: {
          alipay?: number
          amex?: number
          card_tips?: number
          cash?: number
          created_at?: string
          date?: string
          day?: string
          discount?: number
          guests?: number
          id?: string
          mastercard?: number
          orders?: number
          report_number?: string
          service_charge?: number
          subtotal?: number
          total_sales?: number
          union_pay?: number
          venue?: string
          visa?: number
          wechat?: number
        }
        Relationships: []
      }
      user_access_control: {
        Row: {
          created_at: string
          id: string
          position: Database["public"]["Enums"]["user_position"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: Database["public"]["Enums"]["user_position"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: Database["public"]["Enums"]["user_position"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_page_permissions: {
        Row: {
          authority: string
          can_access: boolean
          created_at: string
          hidden_actions: string[]
          id: string
          page_key: string
          show_in_sidebar: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          authority?: string
          can_access?: boolean
          created_at?: string
          hidden_actions?: string[]
          id?: string
          page_key: string
          show_in_sidebar?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          authority?: string
          can_access?: boolean
          created_at?: string
          hidden_actions?: string[]
          id?: string
          page_key?: string
          show_in_sidebar?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
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
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "manager"
      user_position: "owner" | "gm" | "finance" | "staff" | "viewer"
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
      app_role: ["admin", "moderator", "user", "manager"],
      user_position: ["owner", "gm", "finance", "staff", "viewer"],
    },
  },
} as const
