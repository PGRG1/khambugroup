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
      account_mapping_rules: {
        Row: {
          account_id: string
          created_at: string
          id: string
          match_key: string
          notes: string | null
          rule_type: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          match_key?: string
          notes?: string | null
          rule_type: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          match_key?: string
          notes?: string | null
          rule_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_mapping_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_mapping_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_sheet"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "account_mapping_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_pl"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "account_mapping_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
        ]
      }
      accounting_categories: {
        Row: {
          category_group: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          statement: string
          updated_at: string
        }
        Insert: {
          category_group?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          statement?: string
          updated_at?: string
        }
        Update: {
          category_group?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          statement?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      bank_accounts: {
        Row: {
          account_name: string
          account_number_last4: string
          account_type: string
          bank_name: string
          created_at: string
          currency: string
          entity: string | null
          id: string
          is_active: boolean
          last_reconciled_date: string | null
          legacy_venue_name: string | null
          linked_gl_account_id: string | null
          notes: string
          opening_balance: number
          opening_date: string
          sort_order: number
          updated_at: string
          venue: string | null
          venue_id: string | null
        }
        Insert: {
          account_name: string
          account_number_last4?: string
          account_type?: string
          bank_name?: string
          created_at?: string
          currency?: string
          entity?: string | null
          id?: string
          is_active?: boolean
          last_reconciled_date?: string | null
          legacy_venue_name?: string | null
          linked_gl_account_id?: string | null
          notes?: string
          opening_balance?: number
          opening_date?: string
          sort_order?: number
          updated_at?: string
          venue?: string | null
          venue_id?: string | null
        }
        Update: {
          account_name?: string
          account_number_last4?: string
          account_type?: string
          bank_name?: string
          created_at?: string
          currency?: string
          entity?: string | null
          id?: string
          is_active?: boolean
          last_reconciled_date?: string | null
          legacy_venue_name?: string | null
          linked_gl_account_id?: string | null
          notes?: string
          opening_balance?: number
          opening_date?: string
          sort_order?: number
          updated_at?: string
          venue?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_linked_gl_account_id_fkey"
            columns: ["linked_gl_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_linked_gl_account_id_fkey"
            columns: ["linked_gl_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_sheet"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "bank_accounts_linked_gl_account_id_fkey"
            columns: ["linked_gl_account_id"]
            isOneToOne: false
            referencedRelation: "v_pl"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "bank_accounts_linked_gl_account_id_fkey"
            columns: ["linked_gl_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "bank_accounts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_audit_trail: {
        Row: {
          action: string
          bank_account_id: string | null
          bank_transaction_id: string | null
          id: string
          new_status: string | null
          notes: Json
          old_status: string | null
          ts: string
          user_display_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          id?: string
          new_status?: string | null
          notes?: Json
          old_status?: string | null
          ts?: string
          user_display_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          id?: string
          new_status?: string | null
          notes?: Json
          old_status?: string | null
          ts?: string
          user_display_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_audit_trail_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_audit_trail_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_recon_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          match_contains: string
          name: string
          sort_order: number
          suggested_category: string | null
          suggested_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          match_contains: string
          name: string
          sort_order?: number
          suggested_category?: string | null
          suggested_type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          match_contains?: string
          name?: string
          sort_order?: number
          suggested_category?: string | null
          suggested_type?: string
        }
        Relationships: []
      }
      bank_reconciliation_periods: {
        Row: {
          bank_account_id: string
          created_at: string
          difference: number
          id: string
          ledger_balance: number
          locked_at: string | null
          locked_by: string | null
          notes: string
          period_end: string
          period_start: string
          statement_balance: number
          status: string
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          difference?: number
          id?: string
          ledger_balance?: number
          locked_at?: string | null
          locked_by?: string | null
          notes?: string
          period_end: string
          period_start: string
          statement_balance?: number
          status?: string
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          difference?: number
          id?: string
          ledger_balance?: number
          locked_at?: string | null
          locked_by?: string | null
          notes?: string
          period_end?: string
          period_start?: string
          statement_balance?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliation_periods_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_account_mappings: {
        Row: {
          account_number_last4: string
          bank_account_id: string
          bank_name: string
          created_at: string
          id: string
        }
        Insert: {
          account_number_last4: string
          bank_account_id: string
          bank_name: string
          created_at?: string
          id?: string
        }
        Update: {
          account_number_last4?: string
          bank_account_id?: string
          bank_name?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_account_mappings_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_imports: {
        Row: {
          bank_account_id: string
          closing_balance: number
          file_name: string | null
          file_url: string | null
          id: string
          notes: string
          opening_balance: number
          period_end: string
          period_start: string
          status: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          bank_account_id: string
          closing_balance?: number
          file_name?: string | null
          file_url?: string | null
          id?: string
          notes?: string
          opening_balance?: number
          period_end: string
          period_start: string
          status?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          bank_account_id?: string
          closing_balance?: number
          file_name?: string | null
          file_url?: string | null
          id?: string
          notes?: string
          opening_balance?: number
          period_end?: string
          period_start?: string
          status?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_imports_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          bank_account_id: string
          counterparty: string
          created_at: string
          description: string
          extraction_confidence: number | null
          id: string
          import_id: string | null
          journal_entry_id: string | null
          match_confidence: string | null
          matched_record_id: string | null
          matched_record_type: string | null
          money_in: number
          money_out: number
          notes: string
          reference: string
          running_balance: number | null
          source_page: number | null
          status: string
          suggested_category: string | null
          suggested_match_id: string | null
          suggested_type: string | null
          txn_date: string
          updated_at: string
          value_date: string | null
        }
        Insert: {
          bank_account_id: string
          counterparty?: string
          created_at?: string
          description?: string
          extraction_confidence?: number | null
          id?: string
          import_id?: string | null
          journal_entry_id?: string | null
          match_confidence?: string | null
          matched_record_id?: string | null
          matched_record_type?: string | null
          money_in?: number
          money_out?: number
          notes?: string
          reference?: string
          running_balance?: number | null
          source_page?: number | null
          status?: string
          suggested_category?: string | null
          suggested_match_id?: string | null
          suggested_type?: string | null
          txn_date: string
          updated_at?: string
          value_date?: string | null
        }
        Update: {
          bank_account_id?: string
          counterparty?: string
          created_at?: string
          description?: string
          extraction_confidence?: number | null
          id?: string
          import_id?: string | null
          journal_entry_id?: string | null
          match_confidence?: string | null
          matched_record_id?: string | null
          matched_record_type?: string | null
          money_in?: number
          money_out?: number
          notes?: string
          reference?: string
          running_balance?: number | null
          source_page?: number | null
          status?: string
          suggested_category?: string | null
          suggested_match_id?: string | null
          suggested_type?: string | null
          txn_date?: string
          updated_at?: string
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_settings: {
        Row: {
          id: string
          notes: string | null
          opening_balance: number
          opening_date: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          notes?: string | null
          opening_balance?: number
          opening_date?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          notes?: string | null
          opening_balance?: number
          opening_date?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      chart_of_accounts: {
        Row: {
          account_type: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_cash: boolean
          name: string
          normal_side: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_type: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_cash?: boolean
          name: string
          normal_side: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_type?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_cash?: boolean
          name?: string
          normal_side?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_balance_sheet"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_pl"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
        ]
      }
      events: {
        Row: {
          actual_guests: number | null
          actual_revenue: number | null
          created_at: string
          created_by: string | null
          end_date: string
          event_type: string
          expected_guests: number | null
          external_location: string | null
          forecast_avg_spend: number | null
          forecast_revenue: number | null
          id: string
          include_in_dashboard: boolean
          legacy_linked_venue_name: string | null
          linked_venue: string | null
          linked_venue_id: string | null
          name: string
          notes: string
          revenue_source_id: string | null
          sales_channel: string | null
          service_period: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          actual_guests?: number | null
          actual_revenue?: number | null
          created_at?: string
          created_by?: string | null
          end_date: string
          event_type?: string
          expected_guests?: number | null
          external_location?: string | null
          forecast_avg_spend?: number | null
          forecast_revenue?: number | null
          id?: string
          include_in_dashboard?: boolean
          legacy_linked_venue_name?: string | null
          linked_venue?: string | null
          linked_venue_id?: string | null
          name: string
          notes?: string
          revenue_source_id?: string | null
          sales_channel?: string | null
          service_period?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          actual_guests?: number | null
          actual_revenue?: number | null
          created_at?: string
          created_by?: string | null
          end_date?: string
          event_type?: string
          expected_guests?: number | null
          external_location?: string | null
          forecast_avg_spend?: number | null
          forecast_revenue?: number | null
          id?: string
          include_in_dashboard?: boolean
          legacy_linked_venue_name?: string | null
          linked_venue?: string | null
          linked_venue_id?: string | null
          name?: string
          notes?: string
          revenue_source_id?: string | null
          sales_channel?: string | null
          service_period?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_linked_venue_id_fkey"
            columns: ["linked_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_revenue_source_id_fkey"
            columns: ["revenue_source_id"]
            isOneToOne: false
            referencedRelation: "revenue_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
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
          event_id: string | null
          external_location: string | null
          forecast_notes: string
          forecasted_avg_spend: number
          forecasted_customers: number
          forecasted_gross_sales: number
          forecasted_service_charge: number
          forecasted_total_sales: number
          id: string
          legacy_venue_name: string | null
          pending_post_event_notes: string | null
          post_event_notes: string
          revenue_source_id: string | null
          sales_channel: string | null
          service_period: string | null
          status: string
          submitted_by: string | null
          updated_at: string
          venue: string
          venue_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          comment?: string
          created_at?: string
          date: string
          day: string
          event_id?: string | null
          external_location?: string | null
          forecast_notes?: string
          forecasted_avg_spend?: number
          forecasted_customers?: number
          forecasted_gross_sales?: number
          forecasted_service_charge?: number
          forecasted_total_sales?: number
          id?: string
          legacy_venue_name?: string | null
          pending_post_event_notes?: string | null
          post_event_notes?: string
          revenue_source_id?: string | null
          sales_channel?: string | null
          service_period?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
          venue: string
          venue_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          comment?: string
          created_at?: string
          date?: string
          day?: string
          event_id?: string | null
          external_location?: string | null
          forecast_notes?: string
          forecasted_avg_spend?: number
          forecasted_customers?: number
          forecasted_gross_sales?: number
          forecasted_service_charge?: number
          forecasted_total_sales?: number
          id?: string
          legacy_venue_name?: string | null
          pending_post_event_notes?: string | null
          post_event_notes?: string
          revenue_source_id?: string | null
          sales_channel?: string | null
          service_period?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
          venue?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forecasts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecasts_revenue_source_id_fkey"
            columns: ["revenue_source_id"]
            isOneToOne: false
            referencedRelation: "revenue_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecasts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_attendance: {
        Row: {
          clock_in: string | null
          clock_out: string | null
          created_at: string
          date: string
          employee_id: string
          hours_worked: number | null
          id: string
          notes: string | null
          overtime_hours: number | null
          status: string
          updated_at: string
        }
        Insert: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          date: string
          employee_id: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          date?: string
          employee_id?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_employee_history: {
        Row: {
          change_type: string
          created_at: string
          created_by: string | null
          effective_date: string
          employee_id: string
          field_changed: string | null
          id: string
          new_value: string | null
          notes: string | null
          old_value: string | null
        }
        Insert: {
          change_type?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          employee_id: string
          field_changed?: string | null
          id?: string
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          employee_id?: string
          field_changed?: string | null
          id?: string
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employees: {
        Row: {
          created_at: string
          date_of_birth: string | null
          department_id: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employment_type: string
          end_date: string | null
          first_name: string
          hire_date: string
          id: string
          job_title: string | null
          last_name: string
          legacy_venue_name: string | null
          notes: string | null
          phone: string | null
          sort_order: number
          status: string
          updated_at: string
          user_id: string | null
          venue: string | null
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_type?: string
          end_date?: string | null
          first_name: string
          hire_date?: string
          id?: string
          job_title?: string | null
          last_name: string
          legacy_venue_name?: string | null
          notes?: string | null
          phone?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          user_id?: string | null
          venue?: string | null
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_type?: string
          end_date?: string | null
          first_name?: string
          hire_date?: string
          id?: string
          job_title?: string | null
          last_name?: string
          legacy_venue_name?: string | null
          notes?: string | null
          phone?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          user_id?: string | null
          venue?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "hr_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hr_employees_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_holidays: {
        Row: {
          created_at: string
          date: string
          holiday_type: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          date: string
          holiday_type?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          date?: string
          holiday_type?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      hr_leave_balances: {
        Row: {
          adjustment_notes: string | null
          adjustments: number
          carried_forward: number
          created_at: string
          employee_id: string
          id: string
          leave_type_id: string
          remaining_days: number
          total_days: number
          updated_at: string
          used_days: number
          year: number
        }
        Insert: {
          adjustment_notes?: string | null
          adjustments?: number
          carried_forward?: number
          created_at?: string
          employee_id: string
          id?: string
          leave_type_id: string
          remaining_days?: number
          total_days?: number
          updated_at?: string
          used_days?: number
          year: number
        }
        Update: {
          adjustment_notes?: string | null
          adjustments?: number
          carried_forward?: number
          created_at?: string
          employee_id?: string
          id?: string
          leave_type_id?: string
          remaining_days?: number
          total_days?: number
          updated_at?: string
          used_days?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_balances_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_ledger: {
        Row: {
          accrued: number
          created_at: string
          description: string
          employee_id: string
          entry_date: string
          id: string
          leave_type_id: string
          sort_order: number
          taken: number
          updated_at: string
          year: number
        }
        Insert: {
          accrued?: number
          created_at?: string
          description?: string
          employee_id: string
          entry_date: string
          id?: string
          leave_type_id: string
          sort_order?: number
          taken?: number
          updated_at?: string
          year: number
        }
        Update: {
          accrued?: number
          created_at?: string
          description?: string
          employee_id?: string
          entry_date?: string
          id?: string
          leave_type_id?: string
          sort_order?: number
          taken?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_ledger_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_ledger_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          days: number
          employee_id: string
          end_date: string
          id: string
          leave_type_id: string
          notes: string | null
          reason: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          days?: number
          employee_id: string
          end_date: string
          id?: string
          leave_type_id: string
          notes?: string | null
          reason?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          days?: number
          employee_id?: string
          end_date?: string
          id?: string
          leave_type_id?: string
          notes?: string | null
          reason?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_types: {
        Row: {
          created_at: string
          default_days_per_year: number
          id: string
          is_active: boolean
          is_paid: boolean
          name: string
        }
        Insert: {
          created_at?: string
          default_days_per_year?: number
          id?: string
          is_active?: boolean
          is_paid?: boolean
          name: string
        }
        Update: {
          created_at?: string
          default_days_per_year?: number
          id?: string
          is_active?: boolean
          is_paid?: boolean
          name?: string
        }
        Relationships: []
      }
      hr_payroll: {
        Row: {
          actual_allowances: number | null
          actual_base_salary: number | null
          actual_bonus: number | null
          actual_deductions: number | null
          actual_overtime: number | null
          actual_total: number | null
          annual_leave_pay: number
          created_at: string
          employee_id: string
          forecast_allowances: number
          forecast_base_salary: number
          forecast_bonus: number
          forecast_deductions: number
          forecast_overtime: number
          forecast_total: number
          gross_salary: number
          id: string
          month: number
          mpf_employee: number
          mpf_employer: number
          mpf_payment_amount: number
          mpf_payment_date: string | null
          net_salary: number
          net_salary_payment_date: string | null
          notes: string | null
          other_deductions: number
          other_deductions_note: string | null
          other_payments: number
          other_payments_note: string | null
          payment_date: string | null
          payment_method: string
          payment_status: string
          sick_leave_deduction: number
          statutory_holiday_pay: number
          total_deductions: number
          unpaid_leave_deduction: number
          updated_at: string
          year: number
        }
        Insert: {
          actual_allowances?: number | null
          actual_base_salary?: number | null
          actual_bonus?: number | null
          actual_deductions?: number | null
          actual_overtime?: number | null
          actual_total?: number | null
          annual_leave_pay?: number
          created_at?: string
          employee_id: string
          forecast_allowances?: number
          forecast_base_salary?: number
          forecast_bonus?: number
          forecast_deductions?: number
          forecast_overtime?: number
          forecast_total?: number
          gross_salary?: number
          id?: string
          month: number
          mpf_employee?: number
          mpf_employer?: number
          mpf_payment_amount?: number
          mpf_payment_date?: string | null
          net_salary?: number
          net_salary_payment_date?: string | null
          notes?: string | null
          other_deductions?: number
          other_deductions_note?: string | null
          other_payments?: number
          other_payments_note?: string | null
          payment_date?: string | null
          payment_method?: string
          payment_status?: string
          sick_leave_deduction?: number
          statutory_holiday_pay?: number
          total_deductions?: number
          unpaid_leave_deduction?: number
          updated_at?: string
          year: number
        }
        Update: {
          actual_allowances?: number | null
          actual_base_salary?: number | null
          actual_bonus?: number | null
          actual_deductions?: number | null
          actual_overtime?: number | null
          actual_total?: number | null
          annual_leave_pay?: number
          created_at?: string
          employee_id?: string
          forecast_allowances?: number
          forecast_base_salary?: number
          forecast_bonus?: number
          forecast_deductions?: number
          forecast_overtime?: number
          forecast_total?: number
          gross_salary?: number
          id?: string
          month?: number
          mpf_employee?: number
          mpf_employer?: number
          mpf_payment_amount?: number
          mpf_payment_date?: string | null
          net_salary?: number
          net_salary_payment_date?: string | null
          notes?: string | null
          other_deductions?: number
          other_deductions_note?: string | null
          other_payments?: number
          other_payments_note?: string | null
          payment_date?: string | null
          payment_method?: string
          payment_status?: string
          sick_leave_deduction?: number
          statutory_holiday_pay?: number
          total_deductions?: number
          unpaid_leave_deduction?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_shifts: {
        Row: {
          actual_break_minutes: number | null
          actual_end_time: string | null
          actual_hours_worked: number | null
          actual_shift_type: string | null
          actual_start_time: string | null
          break_minutes: number
          created_at: string
          employee_id: string
          end_time: string
          id: string
          no_show: boolean
          notes: string | null
          shift_date: string
          shift_type: string
          start_time: string
          status: string
          updated_at: string
          variance_minutes: number | null
        }
        Insert: {
          actual_break_minutes?: number | null
          actual_end_time?: string | null
          actual_hours_worked?: number | null
          actual_shift_type?: string | null
          actual_start_time?: string | null
          break_minutes?: number
          created_at?: string
          employee_id: string
          end_time: string
          id?: string
          no_show?: boolean
          notes?: string | null
          shift_date: string
          shift_type?: string
          start_time: string
          status?: string
          updated_at?: string
          variance_minutes?: number | null
        }
        Update: {
          actual_break_minutes?: number | null
          actual_end_time?: string | null
          actual_hours_worked?: number | null
          actual_shift_type?: string | null
          actual_start_time?: string | null
          break_minutes?: number
          created_at?: string
          employee_id?: string
          end_time?: string
          id?: string
          no_show?: boolean
          notes?: string | null
          shift_date?: string
          shift_type?: string
          start_time?: string
          status?: string
          updated_at?: string
          variance_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          beginning_qty: number
          created_at: string
          ending_qty: number
          id: string
          item_id: string
          legacy_venue_name: string | null
          period_id: string
          purchases_qty: number
          total_usage_cost: number | null
          unit_cost: number
          updated_at: string
          usage_qty: number | null
          venue: string
          venue_id: string | null
        }
        Insert: {
          beginning_qty?: number
          created_at?: string
          ending_qty?: number
          id?: string
          item_id: string
          legacy_venue_name?: string | null
          period_id: string
          purchases_qty?: number
          total_usage_cost?: number | null
          unit_cost?: number
          updated_at?: string
          usage_qty?: number | null
          venue: string
          venue_id?: string | null
        }
        Update: {
          beginning_qty?: number
          created_at?: string
          ending_qty?: number
          id?: string
          item_id?: string
          legacy_venue_name?: string | null
          period_id?: string
          purchases_qty?: number
          total_usage_cost?: number | null
          unit_cost?: number
          updated_at?: string
          usage_qty?: number | null
          venue?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "inventory_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category_id: string | null
          created_at: string
          current_qty: number
          id: string
          is_active: boolean
          name: string
          par_level: number | null
          standard_product_id: string | null
          unit_of_measure: string
          unit_size: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          current_qty?: number
          id?: string
          is_active?: boolean
          name: string
          par_level?: number | null
          standard_product_id?: string | null
          unit_of_measure?: string
          unit_size?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          current_qty?: number
          id?: string
          is_active?: boolean
          name?: string
          par_level?: number | null
          standard_product_id?: string | null
          unit_of_measure?: string
          unit_size?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_standard_product_id_fkey"
            columns: ["standard_product_id"]
            isOneToOne: false
            referencedRelation: "standard_products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_periods: {
        Row: {
          created_at: string
          created_by: string
          id: string
          legacy_venue_name: string | null
          period_end: string
          period_label: string
          period_start: string
          status: string
          updated_at: string
          venue: string
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          legacy_venue_name?: string | null
          period_end: string
          period_label: string
          period_start: string
          status?: string
          updated_at?: string
          venue: string
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          legacy_venue_name?: string | null
          period_end?: string
          period_label?: string
          period_start?: string
          status?: string
          updated_at?: string
          venue?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_periods_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          category_id: string | null
          created_at: string
          description: string
          discount: number
          id: string
          invoice_id: string
          item_code: string | null
          notes: string | null
          pack_size: string | null
          product_master_id: string | null
          quantity: number
          standard_product_id: string | null
          tax_amount: number
          total: number
          unit: string | null
          unit_price: number
          weight: number | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description: string
          discount?: number
          id?: string
          invoice_id: string
          item_code?: string | null
          notes?: string | null
          pack_size?: string | null
          product_master_id?: string | null
          quantity?: number
          standard_product_id?: string | null
          tax_amount?: number
          total?: number
          unit?: string | null
          unit_price?: number
          weight?: number | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string
          discount?: number
          id?: string
          invoice_id?: string
          item_code?: string | null
          notes?: string | null
          pack_size?: string | null
          product_master_id?: string | null
          quantity?: number
          standard_product_id?: string | null
          tax_amount?: number
          total?: number
          unit?: string | null
          unit_price?: number
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoices_postable"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_line_items_product_master_id_fkey"
            columns: ["product_master_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_product_master_id_fkey"
            columns: ["product_master_id"]
            isOneToOne: false
            referencedRelation: "v_product_mapping_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_standard_product_id_fkey"
            columns: ["standard_product_id"]
            isOneToOne: false
            referencedRelation: "standard_products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          notes: string | null
          payment_date: string
          payment_method: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoices_postable"
            referencedColumns: ["invoice_id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          discount: number
          dispute_notes: string | null
          due_date: string | null
          entered_by: string
          file_name: string | null
          file_url: string | null
          id: string
          invoice_date: string
          invoice_number: string
          legacy_venue_name: string | null
          notes: string | null
          payment_method: string | null
          payment_status: string
          received_date: string | null
          remaining_balance: number
          status: string
          subtotal: number
          supplier_id: string
          tax_amount: number
          total_amount: number
          updated_at: string
          venue: string
          venue_id: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          discount?: number
          dispute_notes?: string | null
          due_date?: string | null
          entered_by: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          legacy_venue_name?: string | null
          notes?: string | null
          payment_method?: string | null
          payment_status?: string
          received_date?: string | null
          remaining_balance?: number
          status?: string
          subtotal?: number
          supplier_id: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          venue: string
          venue_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          discount?: number
          dispute_notes?: string | null
          due_date?: string | null
          entered_by?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          legacy_venue_name?: string | null
          notes?: string | null
          payment_method?: string | null
          payment_status?: string
          received_date?: string | null
          remaining_balance?: number
          status?: string
          subtotal?: number
          supplier_id?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          venue?: string
          venue_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          legacy_venue_name: string | null
          manually_adjusted: boolean
          memo: string
          posted_at: string | null
          source_id: string | null
          source_type: string
          status: string
          updated_at: string
          venue: string | null
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_date: string
          id?: string
          legacy_venue_name?: string | null
          manually_adjusted?: boolean
          memo?: string
          posted_at?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          updated_at?: string
          venue?: string | null
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          legacy_venue_name?: string | null
          manually_adjusted?: boolean
          memo?: string
          posted_at?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          updated_at?: string
          venue?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          category_l1: string | null
          created_at: string
          credit: number
          debit: number
          entry_id: string
          id: string
          legacy_venue_name: string | null
          line_no: number
          memo: string | null
          venue: string | null
          venue_id: string | null
        }
        Insert: {
          account_id: string
          category_l1?: string | null
          created_at?: string
          credit?: number
          debit?: number
          entry_id: string
          id?: string
          legacy_venue_name?: string | null
          line_no?: number
          memo?: string | null
          venue?: string | null
          venue_id?: string | null
        }
        Update: {
          account_id?: string
          category_l1?: string | null
          created_at?: string
          credit?: number
          debit?: number
          entry_id?: string
          id?: string
          legacy_venue_name?: string | null
          line_no?: number
          memo?: string | null
          venue?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_sheet"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_pl"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "v_cash_movements"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "v_general_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "journal_lines_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_audit_log: {
        Row: {
          amount: number | null
          created_at: string
          employee_name: string | null
          event_type: string
          id: string
          journal_entry_id: string | null
          notes: string | null
          payroll_id: string | null
          period: string | null
          status: string
          user_display_name: string | null
          user_id: string | null
          venue: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          employee_name?: string | null
          event_type: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          payroll_id?: string | null
          period?: string | null
          status?: string
          user_display_name?: string | null
          user_id?: string | null
          venue?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          employee_name?: string | null
          event_type?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          payroll_id?: string | null
          period?: string | null
          status?: string
          user_display_name?: string | null
          user_id?: string | null
          venue?: string | null
        }
        Relationships: []
      }
      menu_item_ingredients: {
        Row: {
          created_at: string
          description: string
          id: string
          line_cost: number
          menu_item_id: string
          product_master_id: string | null
          quantity_used: number
          reference_cost: number
          sku: string
          unit_used: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          line_cost?: number
          menu_item_id: string
          product_master_id?: string | null
          quantity_used?: number
          reference_cost?: number
          sku?: string
          unit_used?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          line_cost?: number
          menu_item_id?: string
          product_master_id?: string | null
          quantity_used?: number
          reference_cost?: number
          sku?: string
          unit_used?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_ingredients_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_ingredients_product_master_id_fkey"
            columns: ["product_master_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_ingredients_product_master_id_fkey"
            columns: ["product_master_id"]
            isOneToOne: false
            referencedRelation: "v_product_mapping_status"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_pricing: {
        Row: {
          created_at: string
          food_cost_pct: number
          gross_profit: number
          id: string
          menu_item_id: string
          price_type: string
          selling_price: number
        }
        Insert: {
          created_at?: string
          food_cost_pct?: number
          gross_profit?: number
          id?: string
          menu_item_id: string
          price_type: string
          selling_price?: number
        }
        Update: {
          created_at?: string
          food_cost_pct?: number
          gross_profit?: number
          id?: string
          menu_item_id?: string
          price_type?: string
          selling_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_pricing_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          status: string
          theoretical_cost: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          name: string
          status?: string
          theoretical_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          theoretical_cost?: number
          updated_at?: string
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
      payment_processor_merchants: {
        Row: {
          created_at: string
          default_bank_account_id: string | null
          display_name: string
          fee_account_id: string | null
          id: string
          is_active: boolean
          merchant_number: string
          notes: string
          processor_id: string
          shared_venues: string[]
          sort_order: number
          store_address: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          created_at?: string
          default_bank_account_id?: string | null
          display_name: string
          fee_account_id?: string | null
          id?: string
          is_active?: boolean
          merchant_number: string
          notes?: string
          processor_id: string
          shared_venues?: string[]
          sort_order?: number
          store_address?: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          created_at?: string
          default_bank_account_id?: string | null
          display_name?: string
          fee_account_id?: string | null
          id?: string
          is_active?: boolean
          merchant_number?: string
          notes?: string
          processor_id?: string
          shared_venues?: string[]
          sort_order?: number
          store_address?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_processor_merchants_processor_id_fkey"
            columns: ["processor_id"]
            isOneToOne: false
            referencedRelation: "payment_processors"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_processors: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_settlement_batches: {
        Row: {
          adjustments: number
          bank_account_id: string | null
          bank_transaction_id: string | null
          bank_transfer_fee: number
          created_at: string
          fee_amount: number
          frozen_amount: number
          gross_amount: number
          id: string
          import_id: string | null
          merchant_id: string
          net_settlement: number
          notes: string
          points_offset: number
          processor_id: string
          settlement_date: string
          status: string
          transaction_date: string
          updated_at: string
        }
        Insert: {
          adjustments?: number
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          bank_transfer_fee?: number
          created_at?: string
          fee_amount?: number
          frozen_amount?: number
          gross_amount?: number
          id?: string
          import_id?: string | null
          merchant_id: string
          net_settlement?: number
          notes?: string
          points_offset?: number
          processor_id: string
          settlement_date: string
          status?: string
          transaction_date: string
          updated_at?: string
        }
        Update: {
          adjustments?: number
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          bank_transfer_fee?: number
          created_at?: string
          fee_amount?: number
          frozen_amount?: number
          gross_amount?: number
          id?: string
          import_id?: string | null
          merchant_id?: string
          net_settlement?: number
          notes?: string
          points_offset?: number
          processor_id?: string
          settlement_date?: string
          status?: string
          transaction_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_settlement_batches_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "payment_settlement_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlement_batches_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "payment_processor_merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlement_batches_processor_id_fkey"
            columns: ["processor_id"]
            isOneToOne: false
            referencedRelation: "payment_processors"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settlement_imports: {
        Row: {
          currency: string
          file_name: string | null
          file_url: string | null
          id: string
          notes: string
          period_end: string
          period_start: string
          processor_id: string
          status: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          currency?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          notes?: string
          period_end: string
          period_start: string
          processor_id: string
          status?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          currency?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          notes?: string
          period_end?: string
          period_start?: string
          processor_id?: string
          status?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_settlement_imports_processor_id_fkey"
            columns: ["processor_id"]
            isOneToOne: false
            referencedRelation: "payment_processors"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settlement_lines: {
        Row: {
          batch_id: string
          count: number
          created_at: string
          fee_amount: number
          gross_amount: number
          id: string
          net_amount: number
          payment_type: string
          payment_type_label: string
        }
        Insert: {
          batch_id: string
          count?: number
          created_at?: string
          fee_amount?: number
          gross_amount?: number
          id?: string
          net_amount?: number
          payment_type: string
          payment_type_label?: string
        }
        Update: {
          batch_id?: string
          count?: number
          created_at?: string
          fee_amount?: number
          gross_amount?: number
          id?: string
          net_amount?: number
          payment_type?: string
          payment_type_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_settlement_lines_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payment_settlement_batches"
            referencedColumns: ["id"]
          },
        ]
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
      product_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          level: number
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          level: number
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          level?: number
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_master: {
        Row: {
          accounting_category: string
          base_unit_qty: number
          base_unit_type: string
          cost_per_base_unit: number
          cost_per_stock_unit: number
          created_at: string
          default_coa_account_id: string | null
          external_sku: string
          financial_treatment: string
          id: string
          internal_product_name: string
          internal_sku: string
          level1_category: string
          level2_category: string
          level3_category: string
          notes: string | null
          purchase_unit: string
          purchase_unit_cost: number
          status: string
          stock_qty: number
          stock_uom: string
          supplier: string
          supplier_product_name: string
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          accounting_category?: string
          base_unit_qty?: number
          base_unit_type?: string
          cost_per_base_unit?: number
          cost_per_stock_unit?: number
          created_at?: string
          default_coa_account_id?: string | null
          external_sku?: string
          financial_treatment?: string
          id?: string
          internal_product_name: string
          internal_sku: string
          level1_category?: string
          level2_category?: string
          level3_category?: string
          notes?: string | null
          purchase_unit?: string
          purchase_unit_cost?: number
          status?: string
          stock_qty?: number
          stock_uom?: string
          supplier?: string
          supplier_product_name?: string
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          accounting_category?: string
          base_unit_qty?: number
          base_unit_type?: string
          cost_per_base_unit?: number
          cost_per_stock_unit?: number
          created_at?: string
          default_coa_account_id?: string | null
          external_sku?: string
          financial_treatment?: string
          id?: string
          internal_product_name?: string
          internal_sku?: string
          level1_category?: string
          level2_category?: string
          level3_category?: string
          notes?: string | null
          purchase_unit?: string
          purchase_unit_cost?: number
          status?: string
          stock_qty?: number
          stock_uom?: string
          supplier?: string
          supplier_product_name?: string
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_master_default_coa_account_id_fkey"
            columns: ["default_coa_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_master_default_coa_account_id_fkey"
            columns: ["default_coa_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_sheet"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "product_master_default_coa_account_id_fkey"
            columns: ["default_coa_account_id"]
            isOneToOne: false
            referencedRelation: "v_pl"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "product_master_default_coa_account_id_fkey"
            columns: ["default_coa_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
        ]
      }
      product_pack_conversions: {
        Row: {
          conversion_factor: number
          created_at: string
          from_unit: string
          id: string
          standard_product_id: string
          to_unit: string
        }
        Insert: {
          conversion_factor?: number
          created_at?: string
          from_unit: string
          id?: string
          standard_product_id: string
          to_unit: string
        }
        Update: {
          conversion_factor?: number
          created_at?: string
          from_unit?: string
          id?: string
          standard_product_id?: string
          to_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_pack_conversions_standard_product_id_fkey"
            columns: ["standard_product_id"]
            isOneToOne: false
            referencedRelation: "standard_products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_suppliers: {
        Row: {
          accounting_category: string
          base_unit_qty: number
          base_unit_type: string
          created_at: string
          external_sku: string
          id: string
          product_master_id: string
          purchase_unit: string
          purchase_unit_cost: number
          status: string
          stock_qty: number
          stock_uom: string
          supplier: string
          supplier_product_name: string
          updated_at: string
        }
        Insert: {
          accounting_category?: string
          base_unit_qty?: number
          base_unit_type?: string
          created_at?: string
          external_sku?: string
          id?: string
          product_master_id: string
          purchase_unit?: string
          purchase_unit_cost?: number
          status?: string
          stock_qty?: number
          stock_uom?: string
          supplier?: string
          supplier_product_name?: string
          updated_at?: string
        }
        Update: {
          accounting_category?: string
          base_unit_qty?: number
          base_unit_type?: string
          created_at?: string
          external_sku?: string
          id?: string
          product_master_id?: string
          purchase_unit?: string
          purchase_unit_cost?: number
          status?: string
          stock_qty?: number
          stock_uom?: string
          supplier?: string
          supplier_product_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_suppliers_product_master_id_fkey"
            columns: ["product_master_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_suppliers_product_master_id_fkey"
            columns: ["product_master_id"]
            isOneToOne: false
            referencedRelation: "v_product_mapping_status"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          preferences: Json | null
          theme_preference: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          preferences?: Json | null
          theme_preference?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          preferences?: Json | null
          theme_preference?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      revenue_sources: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      revenue_targets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          month: number
          notes: string | null
          target_amount: number
          updated_at: string
          venues: string[]
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          month: number
          notes?: string | null
          target_amount?: number
          updated_at?: string
          venues?: string[]
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          month?: number
          notes?: string | null
          target_amount?: number
          updated_at?: string
          venues?: string[]
          year?: number
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
          event_id: string | null
          event_name: string | null
          external_location: string | null
          guests: number
          id: string
          jcb: number
          legacy_venue_name: string | null
          mastercard: number
          orders: number
          payme: number
          receipt_file_name: string | null
          receipt_file_url: string | null
          report_number: string
          revenue_source_id: string | null
          sales_channel: string | null
          service_charge: number
          service_period: string | null
          service_period_id: string | null
          subtotal: number
          total_sales: number
          union_pay: number
          venue: string
          venue_id: string | null
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
          event_id?: string | null
          event_name?: string | null
          external_location?: string | null
          guests?: number
          id?: string
          jcb?: number
          legacy_venue_name?: string | null
          mastercard?: number
          orders?: number
          payme?: number
          receipt_file_name?: string | null
          receipt_file_url?: string | null
          report_number: string
          revenue_source_id?: string | null
          sales_channel?: string | null
          service_charge?: number
          service_period?: string | null
          service_period_id?: string | null
          subtotal?: number
          total_sales?: number
          union_pay?: number
          venue: string
          venue_id?: string | null
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
          event_id?: string | null
          event_name?: string | null
          external_location?: string | null
          guests?: number
          id?: string
          jcb?: number
          legacy_venue_name?: string | null
          mastercard?: number
          orders?: number
          payme?: number
          receipt_file_name?: string | null
          receipt_file_url?: string | null
          report_number?: string
          revenue_source_id?: string | null
          sales_channel?: string | null
          service_charge?: number
          service_period?: string | null
          service_period_id?: string | null
          subtotal?: number
          total_sales?: number
          union_pay?: number
          venue?: string
          venue_id?: string | null
          visa?: number
          wechat?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_records_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_records_revenue_source_id_fkey"
            columns: ["revenue_source_id"]
            isOneToOne: false
            referencedRelation: "revenue_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_records_service_period_id_fkey"
            columns: ["service_period_id"]
            isOneToOne: false
            referencedRelation: "service_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_records_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      service_periods: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          revenue_source_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          revenue_source_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          revenue_source_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_periods_revenue_source_id_fkey"
            columns: ["revenue_source_id"]
            isOneToOne: false
            referencedRelation: "revenue_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      standard_products: {
        Row: {
          base_unit: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          reorder_level: number | null
          sub_category: string | null
          updated_at: string
        }
        Insert: {
          base_unit?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          reorder_level?: number | null
          sub_category?: string | null
          updated_at?: string
        }
        Update: {
          base_unit?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          reorder_level?: number | null
          sub_category?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      supplier_item_mappings: {
        Row: {
          created_at: string
          default_unit_price: number | null
          id: string
          purchase_unit: string
          quantity_per_unit: number
          standard_product_id: string
          supplier_id: string
          supplier_item_name: string
          supplier_sku: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_unit_price?: number | null
          id?: string
          purchase_unit?: string
          quantity_per_unit?: number
          standard_product_id: string
          supplier_id: string
          supplier_item_name: string
          supplier_sku?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_unit_price?: number | null
          id?: string
          purchase_unit?: string
          quantity_per_unit?: number
          standard_product_id?: string
          supplier_id?: string
          supplier_item_name?: string
          supplier_sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_item_mappings_standard_product_id_fkey"
            columns: ["standard_product_id"]
            isOneToOne: false
            referencedRelation: "standard_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_item_mappings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      uom_options: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          uom_type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          uom_type?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          uom_type?: string
          updated_at?: string
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
      venues: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          notes: string
          seats: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          notes?: string
          seats?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          notes?: string
          seats?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      venues_config: {
        Row: {
          created_at: string
          display_label: string
          historical_only: boolean
          include_in_dashboard: boolean
          include_in_forecasting: boolean
          include_in_inventory: boolean
          include_in_payroll: boolean
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          venue_type: string
        }
        Insert: {
          created_at?: string
          display_label: string
          historical_only?: boolean
          include_in_dashboard?: boolean
          include_in_forecasting?: boolean
          include_in_inventory?: boolean
          include_in_payroll?: boolean
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          venue_type: string
        }
        Update: {
          created_at?: string
          display_label?: string
          historical_only?: boolean
          include_in_dashboard?: boolean
          include_in_forecasting?: boolean
          include_in_inventory?: boolean
          include_in_payroll?: boolean
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          venue_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_balance_sheet: {
        Row: {
          account_id: string | null
          account_type: string | null
          amount: number | null
          code: string | null
          entry_date: string | null
          name: string | null
        }
        Relationships: []
      }
      v_cash_movements: {
        Row: {
          account_code: string | null
          account_name: string | null
          cash_in: number | null
          cash_out: number | null
          entry_date: string | null
          entry_id: string | null
          memo: string | null
          net_cash: number | null
          source_type: string | null
          venue: string | null
        }
        Relationships: []
      }
      v_general_ledger: {
        Row: {
          account_code: string | null
          account_id: string | null
          account_name: string | null
          account_type: string | null
          credit: number | null
          debit: number | null
          entry_date: string | null
          entry_id: string | null
          entry_memo: string | null
          entry_venue: string | null
          line_id: string | null
          line_memo: string | null
          line_venue: string | null
          normal_side: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_sheet"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_pl"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
        ]
      }
      v_invoices_postable: {
        Row: {
          invoice_date: string | null
          invoice_id: string | null
          invoice_number: string | null
          is_postable: boolean | null
          status: string | null
          supplier_id: string | null
          unmapped_line_count: number | null
          venue: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pl: {
        Row: {
          account_id: string | null
          account_type: string | null
          amount: number | null
          code: string | null
          entry_date: string | null
          month: number | null
          name: string | null
          year: number | null
        }
        Relationships: []
      }
      v_product_mapping_status: {
        Row: {
          default_coa_account_id: string | null
          financial_treatment: string | null
          id: string | null
          internal_product_name: string | null
          internal_sku: string | null
          mapping_status: string | null
          pl_section: string | null
        }
        Insert: {
          default_coa_account_id?: string | null
          financial_treatment?: string | null
          id?: string | null
          internal_product_name?: string | null
          internal_sku?: string | null
          mapping_status?: never
          pl_section?: never
        }
        Update: {
          default_coa_account_id?: string | null
          financial_treatment?: string | null
          id?: string | null
          internal_product_name?: string | null
          internal_sku?: string | null
          mapping_status?: never
          pl_section?: never
        }
        Relationships: [
          {
            foreignKeyName: "product_master_default_coa_account_id_fkey"
            columns: ["default_coa_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_master_default_coa_account_id_fkey"
            columns: ["default_coa_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_sheet"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "product_master_default_coa_account_id_fkey"
            columns: ["default_coa_account_id"]
            isOneToOne: false
            referencedRelation: "v_pl"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "product_master_default_coa_account_id_fkey"
            columns: ["default_coa_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
        ]
      }
      v_trial_balance: {
        Row: {
          account_id: string | null
          account_type: string | null
          balance: number | null
          code: string | null
          name: string | null
          normal_side: string | null
          total_credit: number | null
          total_debit: number | null
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
      rebuild_journal_from_operations: { Args: never; Returns: Json }
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
