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
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          match_key?: string
          notes?: string | null
          rule_type: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          match_key?: string
          notes?: string | null
          rule_type?: string
          tenant_id?: string
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
          {
            foreignKeyName: "account_mapping_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_learned_rules: {
        Row: {
          confidence: number
          created_at: string
          created_by: string | null
          domain: string
          hit_count: number
          id: string
          input_pattern: Json
          last_used_at: string | null
          name: string | null
          output_action: Json
          reviewed_at: string | null
          reviewed_by: string | null
          rule_key: string
          rule_type: string | null
          source_examples: Json
          status: string
          tenant_id: string
          updated_at: string
          venue_id: string | null
          version: number
          workflow: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          domain: string
          hit_count?: number
          id?: string
          input_pattern?: Json
          last_used_at?: string | null
          name?: string | null
          output_action?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_key: string
          rule_type?: string | null
          source_examples?: Json
          status?: string
          tenant_id: string
          updated_at?: string
          venue_id?: string | null
          version?: number
          workflow: string
        }
        Update: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          domain?: string
          hit_count?: number
          id?: string
          input_pattern?: Json
          last_used_at?: string | null
          name?: string | null
          output_action?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_key?: string
          rule_type?: string | null
          source_examples?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
          venue_id?: string | null
          version?: number
          workflow?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_learned_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_learned_rules_history: {
        Row: {
          change_type: string
          changed_at: string
          changed_by: string | null
          diff: Json
          id: string
          rule_id: string
          snapshot: Json
          tenant_id: string
        }
        Insert: {
          change_type: string
          changed_at?: string
          changed_by?: string | null
          diff?: Json
          id?: string
          rule_id: string
          snapshot?: Json
          tenant_id: string
        }
        Update: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          diff?: Json
          id?: string
          rule_id?: string
          snapshot?: Json
          tenant_id?: string
        }
        Relationships: []
      }
      ai_rule_applications: {
        Row: {
          applied_by: string | null
          created_at: string
          domain: string
          id: string
          input_snapshot: Json
          output_snapshot: Json
          record_id: string | null
          record_type: string | null
          rule_id: string | null
          tenant_id: string
          was_overridden: boolean
          workflow: string
        }
        Insert: {
          applied_by?: string | null
          created_at?: string
          domain: string
          id?: string
          input_snapshot?: Json
          output_snapshot?: Json
          record_id?: string | null
          record_type?: string | null
          rule_id?: string | null
          tenant_id: string
          was_overridden?: boolean
          workflow: string
        }
        Update: {
          applied_by?: string | null
          created_at?: string
          domain?: string
          id?: string
          input_snapshot?: Json
          output_snapshot?: Json
          record_id?: string | null
          record_type?: string | null
          rule_id?: string | null
          tenant_id?: string
          was_overridden?: boolean
          workflow?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_rule_applications_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "ai_learned_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_events: {
        Row: {
          created_at: string
          fired_for_date: string
          id: string
          metric_value: number | null
          payload: Json
          rule_id: string
          sent_count: number
          severity: string | null
          tenant_id: string
          threshold: number | null
        }
        Insert: {
          created_at?: string
          fired_for_date: string
          id?: string
          metric_value?: number | null
          payload?: Json
          rule_id: string
          sent_count?: number
          severity?: string | null
          tenant_id?: string
          threshold?: number | null
        }
        Update: {
          created_at?: string
          fired_for_date?: string
          id?: string
          metric_value?: number | null
          payload?: Json
          rule_id?: string
          sent_count?: number
          severity?: string | null
          tenant_id?: string
          threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_events_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          audience_roles: string[]
          created_at: string
          enabled: boolean
          id: string
          metric: string
          name: string
          operator: string
          severity: string
          tenant_id: string
          threshold: number
          updated_at: string
          user_id: string | null
          venue: string | null
        }
        Insert: {
          audience_roles?: string[]
          created_at?: string
          enabled?: boolean
          id?: string
          metric: string
          name: string
          operator: string
          severity?: string
          tenant_id?: string
          threshold: number
          updated_at?: string
          user_id?: string | null
          venue?: string | null
        }
        Update: {
          audience_roles?: string[]
          created_at?: string
          enabled?: boolean
          id?: string
          metric?: string
          name?: string
          operator?: string
          severity?: string
          tenant_id?: string
          threshold?: number
          updated_at?: string
          user_id?: string | null
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          tenant_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          tenant_id?: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          tenant_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          user_display_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
            foreignKeyName: "bank_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "bank_audit_trail_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_recon_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliation_periods_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliation_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
        }
        Insert: {
          account_number_last4: string
          bank_account_id: string
          bank_name: string
          created_at?: string
          id?: string
          tenant_id?: string
        }
        Update: {
          account_number_last4?: string
          bank_account_id?: string
          bank_name?: string
          created_at?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_account_mappings_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_account_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "bank_statement_imports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          expense_posted_bill_id: string | null
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
          tenant_id: string
          txn_date: string
          updated_at: string
          value_date: string | null
        }
        Insert: {
          bank_account_id: string
          counterparty?: string
          created_at?: string
          description?: string
          expense_posted_bill_id?: string | null
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
          tenant_id?: string
          txn_date: string
          updated_at?: string
          value_date?: string | null
        }
        Update: {
          bank_account_id?: string
          counterparty?: string
          created_at?: string
          description?: string
          expense_posted_bill_id?: string | null
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
          tenant_id?: string
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
            foreignKeyName: "bank_transactions_expense_posted_bill_id_fkey"
            columns: ["expense_posted_bill_id"]
            isOneToOne: false
            referencedRelation: "expense_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          notes?: string | null
          opening_balance?: number
          opening_date?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          notes?: string | null
          opening_balance?: number
          opening_date?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "chart_of_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          attachment_url: string | null
          created_at: string
          created_by: string | null
          credit_note_date: string
          credit_note_number: string
          id: string
          notes: string
          original_amount: number
          remaining_balance: number
          source_invoice_id: string | null
          status: string
          supplier_id: string | null
          tenant_id: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_date?: string
          credit_note_number?: string
          id?: string
          notes?: string
          original_amount: number
          remaining_balance?: number
          source_invoice_id?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_date?: string
          credit_note_number?: string
          id?: string
          notes?: string
          original_amount?: number
          remaining_balance?: number
          source_invoice_id?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_source_invoice_id_fkey"
            columns: ["source_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_source_invoice_id_fkey"
            columns: ["source_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoices_postable"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "credit_notes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_bill_allocations: {
        Row: {
          account_id: string | null
          amount: number
          bill_id: string
          created_at: string
          department: string | null
          expense_category: string | null
          id: string
          line_no: number
          notes: string | null
          tax_amount: number
          tax_treatment: string
          tenant_id: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number
          bill_id: string
          created_at?: string
          department?: string | null
          expense_category?: string | null
          id?: string
          line_no?: number
          notes?: string | null
          tax_amount?: number
          tax_treatment?: string
          tenant_id?: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          bill_id?: string
          created_at?: string
          department?: string | null
          expense_category?: string | null
          id?: string
          line_no?: number
          notes?: string | null
          tax_amount?: number
          tax_treatment?: string
          tenant_id?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_bill_allocations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_bill_allocations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_sheet"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_bill_allocations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_pl"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_bill_allocations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_bill_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "expense_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_bill_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_bill_audit: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          bill_id: string
          created_at: string
          details: Json | null
          event_type: string
          id: string
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          bill_id: string
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          tenant_id?: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          bill_id?: string
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_bill_audit_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "expense_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_bill_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_bill_links: {
        Row: {
          child_bill_id: string
          created_at: string
          created_by: string | null
          id: string
          link_type: string
          notes: string | null
          parent_bill_id: string
          tenant_id: string
        }
        Insert: {
          child_bill_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          link_type?: string
          notes?: string | null
          parent_bill_id: string
          tenant_id?: string
        }
        Update: {
          child_bill_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          link_type?: string
          notes?: string | null
          parent_bill_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_bill_links_child_bill_id_fkey"
            columns: ["child_bill_id"]
            isOneToOne: false
            referencedRelation: "expense_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_bill_links_parent_bill_id_fkey"
            columns: ["parent_bill_id"]
            isOneToOne: false
            referencedRelation: "expense_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_bill_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_bill_payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          bill_id: string
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          notes: string | null
          payment_date: string
          payment_method: string
          reference: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          bill_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          payment_date: string
          payment_method?: string
          reference?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          bill_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_method?: string
          reference?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_bill_payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_bill_payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "expense_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_bill_payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_bill_payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_cash_movements"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "expense_bill_payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_general_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "expense_bill_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_bills: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          attachment_path: string | null
          attachment_url: string | null
          bill_date: string
          bill_number: string | null
          combined_venues: boolean
          created_at: string
          created_by: string | null
          currency: string
          department: string | null
          document_requirement: string
          document_type: string | null
          due_date: string | null
          id: string
          journal_entry_id: string | null
          notes: string | null
          paid_amount: number
          payment_status: string
          period_end: string | null
          period_start: string | null
          posted_at: string | null
          posted_by: string | null
          recurring_rule_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          service_period_end: string | null
          service_period_start: string | null
          source_type: string
          subtotal: number
          supplier_id: string | null
          tax_amount: number
          tenant_id: string
          total_amount: number
          updated_at: string
          vendor_name: string | null
          venue: string | null
          venue_id: string | null
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          attachment_path?: string | null
          attachment_url?: string | null
          bill_date: string
          bill_number?: string | null
          combined_venues?: boolean
          created_at?: string
          created_by?: string | null
          currency?: string
          department?: string | null
          document_requirement?: string
          document_type?: string | null
          due_date?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          paid_amount?: number
          payment_status?: string
          period_end?: string | null
          period_start?: string | null
          posted_at?: string | null
          posted_by?: string | null
          recurring_rule_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_period_end?: string | null
          service_period_start?: string | null
          source_type?: string
          subtotal?: number
          supplier_id?: string | null
          tax_amount?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          vendor_name?: string | null
          venue?: string | null
          venue_id?: string | null
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          attachment_path?: string | null
          attachment_url?: string | null
          bill_date?: string
          bill_number?: string | null
          combined_venues?: boolean
          created_at?: string
          created_by?: string | null
          currency?: string
          department?: string | null
          document_requirement?: string
          document_type?: string | null
          due_date?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          paid_amount?: number
          payment_status?: string
          period_end?: string | null
          period_start?: string | null
          posted_at?: string | null
          posted_by?: string | null
          recurring_rule_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_period_end?: string | null
          service_period_start?: string | null
          source_type?: string
          subtotal?: number
          supplier_id?: string | null
          tax_amount?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          vendor_name?: string | null
          venue?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_bills_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_bills_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_cash_movements"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "expense_bills_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_general_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "expense_bills_recurring_rule_id_fkey"
            columns: ["recurring_rule_id"]
            isOneToOne: false
            referencedRelation: "expense_recurring_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_bills_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          default_account_id: string | null
          description: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_account_id?: string | null
          description?: string | null
          id?: string
          name: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_account_id?: string | null
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_default_account_id_fkey"
            columns: ["default_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_default_account_id_fkey"
            columns: ["default_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_sheet"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_categories_default_account_id_fkey"
            columns: ["default_account_id"]
            isOneToOne: false
            referencedRelation: "v_pl"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_categories_default_account_id_fkey"
            columns: ["default_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_recurring_rules: {
        Row: {
          account_id: string | null
          active: boolean
          auto_approve: boolean
          cadence: string
          category_id: string | null
          combined_venues: boolean
          created_at: string
          created_by: string | null
          credit_account_id: string | null
          currency: string
          day_of_month: number | null
          department: string | null
          document_notes: string | null
          document_source: string | null
          effective_from: string | null
          expected_amount: number
          id: string
          last_generated_at: string | null
          name: string
          next_due_date: string | null
          next_generation_date: string | null
          notes: string | null
          payment_due_day: number | null
          recognition_day: string | null
          status: string
          supplier_id: string | null
          tenant_id: string
          updated_at: string
          vendor_name: string | null
          venue_id: string | null
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          auto_approve?: boolean
          cadence?: string
          category_id?: string | null
          combined_venues?: boolean
          created_at?: string
          created_by?: string | null
          credit_account_id?: string | null
          currency?: string
          day_of_month?: number | null
          department?: string | null
          document_notes?: string | null
          document_source?: string | null
          effective_from?: string | null
          expected_amount?: number
          id?: string
          last_generated_at?: string | null
          name: string
          next_due_date?: string | null
          next_generation_date?: string | null
          notes?: string | null
          payment_due_day?: number | null
          recognition_day?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
          vendor_name?: string | null
          venue_id?: string | null
        }
        Update: {
          account_id?: string | null
          active?: boolean
          auto_approve?: boolean
          cadence?: string
          category_id?: string | null
          combined_venues?: boolean
          created_at?: string
          created_by?: string | null
          credit_account_id?: string | null
          currency?: string
          day_of_month?: number | null
          department?: string | null
          document_notes?: string | null
          document_source?: string | null
          effective_from?: string | null
          expected_amount?: number
          id?: string
          last_generated_at?: string | null
          name?: string
          next_due_date?: string | null
          next_generation_date?: string | null
          notes?: string | null
          payment_due_day?: number | null
          recognition_day?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
          vendor_name?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_recurring_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_recurring_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_sheet"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_recurring_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_pl"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_recurring_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_recurring_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_recurring_rules_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_recurring_rules_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_sheet"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_recurring_rules_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_pl"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_recurring_rules_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_recurring_rules_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_recurring_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_recurring_rules_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_vendor_statement_lines: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          line_date: string | null
          line_type: string
          notes: string | null
          statement_id: string
          tenant_id: string
          venue_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          line_date?: string | null
          line_type?: string
          notes?: string | null
          statement_id: string
          tenant_id?: string
          venue_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          line_date?: string | null
          line_type?: string
          notes?: string | null
          statement_id?: string
          tenant_id?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_vendor_statement_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_vendor_statement_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_sheet"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_vendor_statement_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_pl"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_vendor_statement_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_vendor_statement_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_vendor_statement_lines_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "expense_vendor_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_vendor_statement_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_vendor_statement_lines_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_vendor_statements: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          closing_balance: number
          created_at: string
          currency: string
          current_period_charges: number
          department: string | null
          id: string
          late_fees: number
          notes: string | null
          opening_balance: number
          payment_status: string
          payments_credits: number
          period_end: string | null
          period_start: string | null
          posted_journal_entry_id: string | null
          reviewed_by: string | null
          statement_date: string
          statement_number: string | null
          status: string
          supplier_id: string | null
          tenant_id: string
          updated_at: string
          uploaded_by: string | null
          vendor_name: string | null
          venue_id: string | null
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          closing_balance?: number
          created_at?: string
          currency?: string
          current_period_charges?: number
          department?: string | null
          id?: string
          late_fees?: number
          notes?: string | null
          opening_balance?: number
          payment_status?: string
          payments_credits?: number
          period_end?: string | null
          period_start?: string | null
          posted_journal_entry_id?: string | null
          reviewed_by?: string | null
          statement_date: string
          statement_number?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string | null
          vendor_name?: string | null
          venue_id?: string | null
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          closing_balance?: number
          created_at?: string
          currency?: string
          current_period_charges?: number
          department?: string | null
          id?: string
          late_fees?: number
          notes?: string | null
          opening_balance?: number
          payment_status?: string
          payments_credits?: number
          period_end?: string | null
          period_start?: string | null
          posted_journal_entry_id?: string | null
          reviewed_by?: string | null
          statement_date?: string
          statement_number?: string | null
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string | null
          vendor_name?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_vendor_statements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_vendor_statements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_vendor_statements_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_approvers: {
        Row: {
          created_at: string
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tenant_id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_approvers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
            foreignKeyName: "forecasts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      goods_received_notes: {
        Row: {
          created_at: string
          grn_number: string
          id: string
          invoice_id: string | null
          notes: string | null
          po_id: string | null
          received_by: string
          received_date: string
          status: string
          supplier_id: string
          updated_at: string
          venue: string
        }
        Insert: {
          created_at?: string
          grn_number?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          po_id?: string | null
          received_by: string
          received_date?: string
          status?: string
          supplier_id: string
          updated_at?: string
          venue: string
        }
        Update: {
          created_at?: string
          grn_number?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          po_id?: string | null
          received_by?: string
          received_date?: string
          status?: string
          supplier_id?: string
          updated_at?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_received_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_received_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoices_postable"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "goods_received_notes_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_received_notes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_items: {
        Row: {
          created_at: string
          description: string
          grn_id: string
          id: string
          invoice_line_item_id: string | null
          po_item_id: string | null
          product_master_id: string | null
          quantity_invoiced: number | null
          quantity_ordered: number | null
          quantity_received: number
          total: number | null
          unit: string
          unit_cost: number
        }
        Insert: {
          created_at?: string
          description: string
          grn_id: string
          id?: string
          invoice_line_item_id?: string | null
          po_item_id?: string | null
          product_master_id?: string | null
          quantity_invoiced?: number | null
          quantity_ordered?: number | null
          quantity_received?: number
          total?: number | null
          unit?: string
          unit_cost?: number
        }
        Update: {
          created_at?: string
          description?: string
          grn_id?: string
          id?: string
          invoice_line_item_id?: string | null
          po_item_id?: string | null
          product_master_id?: string | null
          quantity_invoiced?: number | null
          quantity_ordered?: number | null
          quantity_received?: number
          total?: number | null
          unit?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "grn_items_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "goods_received_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_invoice_line_item_id_fkey"
            columns: ["invoice_line_item_id"]
            isOneToOne: false
            referencedRelation: "invoice_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_product_master_id_fkey"
            columns: ["product_master_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_product_master_id_fkey"
            columns: ["product_master_id"]
            isOneToOne: false
            referencedRelation: "v_product_mapping_status"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "hr_attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
            foreignKeyName: "hr_employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_holidays_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "hr_leave_balances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "hr_leave_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "hr_leave_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
        }
        Insert: {
          created_at?: string
          default_days_per_year?: number
          id?: string
          is_active?: boolean
          is_paid?: boolean
          name: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          default_days_per_year?: number
          id?: string
          is_active?: boolean
          is_paid?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll: {
        Row: {
          accrual_journal_entry_id: string | null
          actual_allowances: number | null
          actual_base_salary: number | null
          actual_bonus: number | null
          actual_deductions: number | null
          actual_overtime: number | null
          actual_total: number | null
          adjustments_override: number | null
          annual_leave_pay: number
          created_at: string
          earned_salary_override: number | null
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
          mpf_employee_override: number | null
          mpf_employer: number
          mpf_employer_override: number | null
          mpf_paid_amount: number
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
          salary_paid_amount: number
          sick_leave_deduction: number
          statutory_holiday_pay: number
          tenant_id: string
          total_deductions: number
          unpaid_leave_deduction: number
          updated_at: string
          year: number
        }
        Insert: {
          accrual_journal_entry_id?: string | null
          actual_allowances?: number | null
          actual_base_salary?: number | null
          actual_bonus?: number | null
          actual_deductions?: number | null
          actual_overtime?: number | null
          actual_total?: number | null
          adjustments_override?: number | null
          annual_leave_pay?: number
          created_at?: string
          earned_salary_override?: number | null
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
          mpf_employee_override?: number | null
          mpf_employer?: number
          mpf_employer_override?: number | null
          mpf_paid_amount?: number
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
          salary_paid_amount?: number
          sick_leave_deduction?: number
          statutory_holiday_pay?: number
          tenant_id?: string
          total_deductions?: number
          unpaid_leave_deduction?: number
          updated_at?: string
          year: number
        }
        Update: {
          accrual_journal_entry_id?: string | null
          actual_allowances?: number | null
          actual_base_salary?: number | null
          actual_bonus?: number | null
          actual_deductions?: number | null
          actual_overtime?: number | null
          actual_total?: number | null
          adjustments_override?: number | null
          annual_leave_pay?: number
          created_at?: string
          earned_salary_override?: number | null
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
          mpf_employee_override?: number | null
          mpf_employer?: number
          mpf_employer_override?: number | null
          mpf_paid_amount?: number
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
          salary_paid_amount?: number
          sick_leave_deduction?: number
          statutory_holiday_pay?: number
          tenant_id?: string
          total_deductions?: number
          unpaid_leave_deduction?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_accrual_journal_entry_id_fkey"
            columns: ["accrual_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_accrual_journal_entry_id_fkey"
            columns: ["accrual_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_cash_movements"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "hr_payroll_accrual_journal_entry_id_fkey"
            columns: ["accrual_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_general_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "hr_payroll_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_payment_batch_lines: {
        Row: {
          amount: number
          batch_id: string
          created_at: string
          employee_id: string
          id: string
          kind: string
          payroll_id: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          batch_id: string
          created_at?: string
          employee_id: string
          id?: string
          kind: string
          payroll_id: string
          tenant_id?: string
        }
        Update: {
          amount?: number
          batch_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          kind?: string
          payroll_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_payment_batch_lines_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_payment_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_payment_batch_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_payment_batch_lines_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_payment_batch_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_payment_batches: {
        Row: {
          bank_account_id: string | null
          bank_transaction_id: string | null
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          notes: string
          payment_date: string
          payment_kind: string
          payment_method: string
          period_month: number
          period_year: number
          status: string
          tenant_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string
          payment_date: string
          payment_kind: string
          payment_method: string
          period_month: number
          period_year: number
          status?: string
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string
          payment_date?: string
          payment_kind?: string
          payment_method?: string
          period_month?: number
          period_year?: number
          status?: string
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_payment_batches_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_payment_batches_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_payment_batches_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_payment_batches_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_cash_movements"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "hr_payroll_payment_batches_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_general_ledger"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "hr_payroll_payment_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "hr_shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
            foreignKeyName: "inventory_counts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          updated_at?: string
          venue?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
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
          ai_suggestion: Json | null
          category_id: string | null
          created_at: string
          description: string
          discount: number
          id: string
          invoice_id: string
          item_code: string | null
          normalized_unit_cost: number | null
          notes: string | null
          pack_size: string | null
          pack_size_norm: string | null
          product_master_id: string | null
          quantity: number
          standard_product_id: string | null
          tax_amount: number
          tenant_id: string
          total: number
          unit: string | null
          unit_norm: string | null
          unit_price: number
          weight: number | null
        }
        Insert: {
          ai_suggestion?: Json | null
          category_id?: string | null
          created_at?: string
          description: string
          discount?: number
          id?: string
          invoice_id: string
          item_code?: string | null
          normalized_unit_cost?: number | null
          notes?: string | null
          pack_size?: string | null
          pack_size_norm?: string | null
          product_master_id?: string | null
          quantity?: number
          standard_product_id?: string | null
          tax_amount?: number
          tenant_id?: string
          total?: number
          unit?: string | null
          unit_norm?: string | null
          unit_price?: number
          weight?: number | null
        }
        Update: {
          ai_suggestion?: Json | null
          category_id?: string | null
          created_at?: string
          description?: string
          discount?: number
          id?: string
          invoice_id?: string
          item_code?: string | null
          normalized_unit_cost?: number | null
          notes?: string | null
          pack_size?: string | null
          pack_size_norm?: string | null
          product_master_id?: string | null
          quantity?: number
          standard_product_id?: string | null
          tax_amount?: number
          tenant_id?: string
          total?: number
          unit?: string | null
          unit_norm?: string | null
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
          {
            foreignKeyName: "invoice_line_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          bank_transaction_id: string | null
          created_at: string
          id: string
          invoice_id: string
          match_status: string
          notes: string | null
          payment_date: string
          payment_method: string
          reference: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          match_status?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          reference?: string
          tenant_id?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          match_status?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          reference?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "invoice_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          ai_anomaly: Json | null
          ai_extract_meta: Json | null
          ai_suggestions: Json | null
          amount_paid: number
          approved_at: string | null
          approved_by: string | null
          bank_match_status: string
          created_at: string
          discount: number
          discount_type: string
          dispute_notes: string | null
          due_date: string | null
          entered_by: string
          exception_note: string
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
          review_status: string
          scheduled_payment_date: string | null
          status: string
          subtotal: number
          supplier_id: string
          tax_amount: number
          tenant_id: string
          total_amount: number
          updated_at: string
          venue: string
          venue_id: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          ai_anomaly?: Json | null
          ai_extract_meta?: Json | null
          ai_suggestions?: Json | null
          amount_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_match_status?: string
          created_at?: string
          discount?: number
          discount_type?: string
          dispute_notes?: string | null
          due_date?: string | null
          entered_by: string
          exception_note?: string
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
          review_status?: string
          scheduled_payment_date?: string | null
          status?: string
          subtotal?: number
          supplier_id: string
          tax_amount?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          venue: string
          venue_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          ai_anomaly?: Json | null
          ai_extract_meta?: Json | null
          ai_suggestions?: Json | null
          amount_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_match_status?: string
          created_at?: string
          discount?: number
          discount_type?: string
          dispute_notes?: string | null
          due_date?: string | null
          entered_by?: string
          exception_note?: string
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
          review_status?: string
          scheduled_payment_date?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string
          tax_amount?: number
          tenant_id?: string
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
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          updated_at?: string
          venue?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
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
          mapping_match_key: string | null
          mapping_rule_type: string | null
          mapping_status: string | null
          memo: string | null
          payment_method: string | null
          source_amount: number | null
          tenant_id: string
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
          mapping_match_key?: string | null
          mapping_rule_type?: string | null
          mapping_status?: string | null
          memo?: string | null
          payment_method?: string | null
          source_amount?: number | null
          tenant_id?: string
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
          mapping_match_key?: string | null
          mapping_rule_type?: string | null
          mapping_status?: string | null
          memo?: string | null
          payment_method?: string | null
          source_amount?: number | null
          tenant_id?: string
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
            foreignKeyName: "journal_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
      kpi_actions: {
        Row: {
          action_required: string
          action_status: string
          assigned_user_id: string | null
          completed_date: string | null
          created_at: string
          due_date: string | null
          id: string
          kpi_card_id: string
          notes: string | null
          period_date: string | null
          tenant_id: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          action_required?: string
          action_status?: string
          assigned_user_id?: string | null
          completed_date?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          kpi_card_id: string
          notes?: string | null
          period_date?: string | null
          tenant_id?: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          action_required?: string
          action_status?: string
          assigned_user_id?: string | null
          completed_date?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          kpi_card_id?: string
          notes?: string | null
          period_date?: string | null
          tenant_id?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_actions_kpi_card_id_fkey"
            columns: ["kpi_card_id"]
            isOneToOne: false
            referencedRelation: "kpi_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_actions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_actuals: {
        Row: {
          actual_source: string
          actual_value: number
          created_at: string
          id: string
          kpi_card_id: string
          notes: string | null
          period_date: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          venue_id: string | null
        }
        Insert: {
          actual_source?: string
          actual_value?: number
          created_at?: string
          id?: string
          kpi_card_id: string
          notes?: string | null
          period_date: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          venue_id?: string | null
        }
        Update: {
          actual_source?: string
          actual_value?: number
          created_at?: string
          id?: string
          kpi_card_id?: string
          notes?: string | null
          period_date?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_actuals_kpi_card_id_fkey"
            columns: ["kpi_card_id"]
            isOneToOne: false
            referencedRelation: "kpi_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_actuals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_actuals_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_assignments: {
        Row: {
          active: boolean
          assigned_at: string
          assigned_by: string | null
          assigned_role: string | null
          assigned_user_id: string | null
          created_at: string
          id: string
          kpi_card_id: string
          tenant_id: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          assigned_role?: string | null
          assigned_user_id?: string | null
          created_at?: string
          id?: string
          kpi_card_id: string
          tenant_id?: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          assigned_role?: string | null
          assigned_user_id?: string | null
          created_at?: string
          id?: string
          kpi_card_id?: string
          tenant_id?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_assignments_kpi_card_id_fkey"
            columns: ["kpi_card_id"]
            isOneToOne: false
            referencedRelation: "kpi_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_assignments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_bundle_cards: {
        Row: {
          bundle_id: string
          created_at: string
          id: string
          kpi_card_id: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          id?: string
          kpi_card_id: string
          sort_order?: number
          tenant_id?: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          id?: string
          kpi_card_id?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_bundle_cards_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "kpi_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_bundle_cards_kpi_card_id_fkey"
            columns: ["kpi_card_id"]
            isOneToOne: false
            referencedRelation: "kpi_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_bundle_cards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_bundles: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_bundles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_cards: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          kpi_category: string
          kpi_name: string
          kpi_type: string
          tenant_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kpi_category?: string
          kpi_name: string
          kpi_type?: string
          tenant_id?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kpi_category?: string
          kpi_name?: string
          kpi_type?: string
          tenant_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_cards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_targets: {
        Row: {
          active: boolean
          assigned_role: string | null
          assigned_user_id: string | null
          calculation_method: string
          created_at: string
          critical_threshold_pct: number
          day_of_week: number | null
          id: string
          kpi_card_id: string
          period_end_date: string | null
          period_start_date: string | null
          target_mode: string
          target_period: string
          target_value: number
          tenant_id: string
          updated_at: string
          venue_id: string | null
          warning_threshold_pct: number
        }
        Insert: {
          active?: boolean
          assigned_role?: string | null
          assigned_user_id?: string | null
          calculation_method?: string
          created_at?: string
          critical_threshold_pct?: number
          day_of_week?: number | null
          id?: string
          kpi_card_id: string
          period_end_date?: string | null
          period_start_date?: string | null
          target_mode?: string
          target_period?: string
          target_value?: number
          tenant_id?: string
          updated_at?: string
          venue_id?: string | null
          warning_threshold_pct?: number
        }
        Update: {
          active?: boolean
          assigned_role?: string | null
          assigned_user_id?: string | null
          calculation_method?: string
          created_at?: string
          critical_threshold_pct?: number
          day_of_week?: number | null
          id?: string
          kpi_card_id?: string
          period_end_date?: string | null
          period_start_date?: string | null
          target_mode?: string
          target_period?: string
          target_value?: number
          tenant_id?: string
          updated_at?: string
          venue_id?: string | null
          warning_threshold_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_targets_kpi_card_id_fkey"
            columns: ["kpi_card_id"]
            isOneToOne: false
            referencedRelation: "kpi_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_targets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_targets_venue_id_fkey"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          user_display_name?: string | null
          user_id?: string | null
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "menu_item_ingredients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
        }
        Insert: {
          created_at?: string
          food_cost_pct?: number
          gross_profit?: number
          id?: string
          menu_item_id: string
          price_type: string
          selling_price?: number
          tenant_id?: string
        }
        Update: {
          created_at?: string
          food_cost_pct?: number
          gross_profit?: number
          id?: string
          menu_item_id?: string
          price_type?: string
          selling_price?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_pricing_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_pricing_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
          theoretical_cost: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          name: string
          status?: string
          tenant_id?: string
          theoretical_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          theoretical_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      page_visibility: {
        Row: {
          id: string
          page_key: string
          page_label: string
          tenant_id: string
          updated_at: string
          visible_to_all: boolean
        }
        Insert: {
          id?: string
          page_key: string
          page_label: string
          tenant_id?: string
          updated_at?: string
          visible_to_all?: boolean
        }
        Update: {
          id?: string
          page_key?: string
          page_label?: string
          tenant_id?: string
          updated_at?: string
          visible_to_all?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "page_visibility_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount_allocated: number
          created_at: string
          credit_note_amount_applied: number
          credit_note_id: string | null
          id: string
          invoice_id: string
          payment_id: string
          tenant_id: string
        }
        Insert: {
          amount_allocated: number
          created_at?: string
          credit_note_amount_applied?: number
          credit_note_id?: string | null
          id?: string
          invoice_id: string
          payment_id: string
          tenant_id?: string
        }
        Update: {
          amount_allocated?: number
          created_at?: string
          credit_note_amount_applied?: number
          credit_note_id?: string | null
          id?: string
          invoice_id?: string
          payment_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoices_postable"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_processor_fee_rates: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          locality: string
          merchant_number: string | null
          notes: string
          payment_method: string
          processor_id: string
          rate: number
          rounding_dp: number
          rounding_method: string
          tenant_id: string
          updated_at: string
          wallet_type: string | null
        }
        Insert: {
          created_at?: string
          effective_from?: string
          id?: string
          locality?: string
          merchant_number?: string | null
          notes?: string
          payment_method: string
          processor_id: string
          rate: number
          rounding_dp?: number
          rounding_method?: string
          tenant_id?: string
          updated_at?: string
          wallet_type?: string | null
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          locality?: string
          merchant_number?: string | null
          notes?: string
          payment_method?: string
          processor_id?: string
          rate?: number
          rounding_dp?: number
          rounding_method?: string
          tenant_id?: string
          updated_at?: string
          wallet_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_processor_fee_rates_processor_id_fkey"
            columns: ["processor_id"]
            isOneToOne: false
            referencedRelation: "payment_processors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_processor_fee_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "payment_processor_merchants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_processors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settlement_batches: {
        Row: {
          adjustments: number
          audit_status: string
          bank_account_id: string | null
          bank_transaction_id: string | null
          bank_transfer_fee: number
          clearing_journal_entry_id: string | null
          created_at: string
          fee_amount: number
          fee_variance: number
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
          tenant_id: string
          transaction_date: string
          transactions_flagged: number
          updated_at: string
        }
        Insert: {
          adjustments?: number
          audit_status?: string
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          bank_transfer_fee?: number
          clearing_journal_entry_id?: string | null
          created_at?: string
          fee_amount?: number
          fee_variance?: number
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
          tenant_id?: string
          transaction_date: string
          transactions_flagged?: number
          updated_at?: string
        }
        Update: {
          adjustments?: number
          audit_status?: string
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          bank_transfer_fee?: number
          clearing_journal_entry_id?: string | null
          created_at?: string
          fee_amount?: number
          fee_variance?: number
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
          tenant_id?: string
          transaction_date?: string
          transactions_flagged?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_settlement_batches_clearing_journal_entry_id_fkey"
            columns: ["clearing_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlement_batches_clearing_journal_entry_id_fkey"
            columns: ["clearing_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_cash_movements"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "payment_settlement_batches_clearing_journal_entry_id_fkey"
            columns: ["clearing_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "v_general_ledger"
            referencedColumns: ["entry_id"]
          },
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
          {
            foreignKeyName: "payment_settlement_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "payment_settlement_imports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settlement_lines: {
        Row: {
          audit_note: string
          audit_status: string
          batch_id: string
          count: number
          created_at: string
          expected_fee: number
          fee_amount: number
          fee_variance: number
          gross_amount: number
          id: string
          net_amount: number
          payment_type: string
          payment_type_label: string
          tenant_id: string
        }
        Insert: {
          audit_note?: string
          audit_status?: string
          batch_id: string
          count?: number
          created_at?: string
          expected_fee?: number
          fee_amount?: number
          fee_variance?: number
          gross_amount?: number
          id?: string
          net_amount?: number
          payment_type: string
          payment_type_label?: string
          tenant_id?: string
        }
        Update: {
          audit_note?: string
          audit_status?: string
          batch_id?: string
          count?: number
          created_at?: string
          expected_fee?: number
          fee_amount?: number
          fee_variance?: number
          gross_amount?: number
          id?: string
          net_amount?: number
          payment_type?: string
          payment_type_label?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_settlement_lines_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payment_settlement_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlement_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settlement_transactions: {
        Row: {
          audit_status: string
          batch_id: string
          created_at: string
          expected_fee: number
          fee_amount: number
          fee_variance: number
          gross_amount: number
          id: string
          locality: string
          merchant_number: string
          net_amount: number
          payment_method_key: string
          payment_method_raw: string
          reference: string
          tenant_id: string
          transaction_time: string
          wallet_type: string | null
        }
        Insert: {
          audit_status?: string
          batch_id: string
          created_at?: string
          expected_fee?: number
          fee_amount?: number
          fee_variance?: number
          gross_amount?: number
          id?: string
          locality?: string
          merchant_number?: string
          net_amount?: number
          payment_method_key?: string
          payment_method_raw?: string
          reference?: string
          tenant_id?: string
          transaction_time: string
          wallet_type?: string | null
        }
        Update: {
          audit_status?: string
          batch_id?: string
          created_at?: string
          expected_fee?: number
          fee_amount?: number
          fee_variance?: number
          gross_amount?: number
          id?: string
          locality?: string
          merchant_number?: string
          net_amount?: number
          payment_method_key?: string
          payment_method_raw?: string
          reference?: string
          tenant_id?: string
          transaction_time?: string
          wallet_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_settlement_transactions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payment_settlement_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlement_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_transaction_id: string | null
          cheque_number: string
          created_at: string
          created_by: string | null
          id: string
          match_status: string
          notes: string
          paid_from_account_id: string | null
          payment_date: string
          payment_method: string
          reference_number: string
          supplier_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_transaction_id?: string | null
          cheque_number?: string
          created_at?: string
          created_by?: string | null
          id?: string
          match_status?: string
          notes?: string
          paid_from_account_id?: string | null
          payment_date: string
          payment_method: string
          reference_number?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_transaction_id?: string | null
          cheque_number?: string
          created_at?: string
          created_by?: string | null
          id?: string
          match_status?: string
          notes?: string
          paid_from_account_id?: string | null
          payment_date?: string
          payment_method?: string
          reference_number?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "pl_manual_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_structure_rows: {
        Row: {
          created_at: string
          id: string
          indent: number
          is_bold: boolean
          kind: string
          label: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          indent?: number
          is_bold?: boolean
          kind: string
          label?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          indent?: number
          is_bold?: boolean
          kind?: string
          label?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pl_structure_rows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "product_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          min_stock_qty: number | null
          notes: string | null
          purchase_unit: string
          purchase_unit_cost: number
          reorder_qty: number | null
          status: string
          stock_qty: number
          stock_uom: string
          supplier: string
          supplier_product_name: string
          tenant_id: string
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
          min_stock_qty?: number | null
          notes?: string | null
          purchase_unit?: string
          purchase_unit_cost?: number
          reorder_qty?: number | null
          status?: string
          stock_qty?: number
          stock_uom?: string
          supplier?: string
          supplier_product_name?: string
          tenant_id?: string
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
          min_stock_qty?: number | null
          notes?: string | null
          purchase_unit?: string
          purchase_unit_cost?: number
          reorder_qty?: number | null
          status?: string
          stock_qty?: number
          stock_uom?: string
          supplier?: string
          supplier_product_name?: string
          tenant_id?: string
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
          {
            foreignKeyName: "product_master_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
          tenant_id: string
          to_unit: string
        }
        Insert: {
          conversion_factor?: number
          created_at?: string
          from_unit: string
          id?: string
          standard_product_id: string
          tenant_id?: string
          to_unit: string
        }
        Update: {
          conversion_factor?: number
          created_at?: string
          from_unit?: string
          id?: string
          standard_product_id?: string
          tenant_id?: string
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
          {
            foreignKeyName: "product_pack_conversions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "product_suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      purchase_order_items: {
        Row: {
          created_at: string
          description: string
          id: string
          po_id: string
          product_master_id: string
          quantity_ordered: number
          total: number | null
          unit: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          po_id: string
          product_master_id: string
          quantity_ordered?: number
          total?: number | null
          unit?: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          po_id?: string
          product_master_id?: string
          quantity_ordered?: number
          total?: number | null
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_master_id_fkey"
            columns: ["product_master_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_master_id_fkey"
            columns: ["product_master_id"]
            isOneToOne: false
            referencedRelation: "v_product_mapping_status"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string
          expected_date: string | null
          id: string
          notes: string | null
          po_number: string
          requested_date: string | null
          status: string
          supplier_id: string
          total_amount: number
          updated_at: string
          venue: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expected_date?: string | null
          id?: string
          notes?: string | null
          po_number?: string
          requested_date?: string | null
          status?: string
          supplier_id: string
          total_amount?: number
          updated_at?: string
          venue: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expected_date?: string | null
          id?: string
          notes?: string | null
          po_number?: string
          requested_date?: string | null
          status?: string
          supplier_id?: string
          total_amount?: number
          updated_at?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          enabled_daily_pulse: boolean
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          tenant_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          enabled_daily_pulse?: boolean
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          tenant_id?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          enabled_daily_pulse?: boolean
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          tenant_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_mapping_rules: {
        Row: {
          auto_post: boolean
          bank_description_contains: string
          bank_movement: string
          classification: string
          counterparty_type: string
          created_at: string
          credit_account: string
          debit_account: string
          id: string
          is_active: boolean
          match_to: string
          review_required: boolean
          rule_name: string
          sort_order: number
          source_required: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_post?: boolean
          bank_description_contains?: string
          bank_movement?: string
          classification?: string
          counterparty_type?: string
          created_at?: string
          credit_account?: string
          debit_account?: string
          id?: string
          is_active?: boolean
          match_to?: string
          review_required?: boolean
          rule_name: string
          sort_order?: number
          source_required?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          auto_post?: boolean
          bank_description_contains?: string
          bank_movement?: string
          classification?: string
          counterparty_type?: string
          created_at?: string
          credit_account?: string
          debit_account?: string
          id?: string
          is_active?: boolean
          match_to?: string
          review_required?: boolean
          rule_name?: string
          sort_order?: number
          source_required?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_mapping_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_targets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          month: number
          notes: string | null
          target_amount: number
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          updated_at?: string
          venues?: string[]
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "revenue_targets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
            foreignKeyName: "sales_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          revenue_source_id?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          revenue_source_id?: string | null
          sort_order?: number
          tenant_id?: string
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
          {
            foreignKeyName: "service_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "standard_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_items: {
        Row: {
          counted_at: string | null
          counted_by: string | null
          counted_qty: number | null
          created_at: string
          id: string
          last_count_qty: number | null
          location_id: string | null
          notes: string | null
          product_master_id: string
          session_id: string
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          counted_at?: string | null
          counted_by?: string | null
          counted_qty?: number | null
          created_at?: string
          id?: string
          last_count_qty?: number | null
          location_id?: string | null
          notes?: string | null
          product_master_id: string
          session_id: string
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          counted_at?: string | null
          counted_by?: string | null
          counted_qty?: number | null
          created_at?: string
          id?: string
          last_count_qty?: number | null
          location_id?: string | null
          notes?: string | null
          product_master_id?: string
          session_id?: string
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_product_master_id_fkey"
            columns: ["product_master_id"]
            isOneToOne: false
            referencedRelation: "product_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_product_master_id_fkey"
            columns: ["product_master_id"]
            isOneToOne: false
            referencedRelation: "v_product_mapping_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stock_count_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_sessions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          count_date: string
          count_type: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
          reference_mode: string
          session_number: string
          status: string
          updated_at: string
          venue: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          count_date?: string
          count_type?: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          reference_mode?: string
          session_number?: string
          status?: string
          updated_at?: string
          venue: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          count_date?: string
          count_type?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          reference_mode?: string
          session_number?: string
          status?: string
          updated_at?: string
          venue?: string
        }
        Relationships: []
      }
      stock_locations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          venue: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          venue: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          venue?: string
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "supplier_item_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          invoice_rounding_mode: string
          is_active: boolean
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invoice_rounding_mode?: string
          is_active?: boolean
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invoice_rounding_mode?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan?: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: string
          slug?: string
          status?: string
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          uom_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "uom_options_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_access_control: {
        Row: {
          created_at: string
          id: string
          position: Database["public"]["Enums"]["user_position"]
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: Database["public"]["Enums"]["user_position"]
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: Database["public"]["Enums"]["user_position"]
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_access_control_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_page_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      venue_memberships: {
        Row: {
          created_at: string
          id: string
          role: string
          updated_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          updated_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_memberships_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          updated_at?: string
          venue_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      sales_data: {
        Row: {
          alipay: number | null
          amex: number | null
          card_tips: number | null
          cash: number | null
          created_at: string | null
          date: string | null
          day: string | null
          discount: number | null
          event_id: string | null
          event_name: string | null
          external_location: string | null
          guests: number | null
          id: string | null
          jcb: number | null
          legacy_venue_name: string | null
          mastercard: number | null
          orders: number | null
          payme: number | null
          receipt_file_name: string | null
          receipt_file_url: string | null
          report_number: string | null
          revenue_source_id: string | null
          sales_channel: string | null
          service_charge: number | null
          service_period: string | null
          service_period_id: string | null
          subtotal: number | null
          total_sales: number | null
          union_pay: number | null
          venue: string | null
          venue_id: string | null
          visa: number | null
          wechat: number | null
        }
        Insert: {
          alipay?: number | null
          amex?: number | null
          card_tips?: number | null
          cash?: number | null
          created_at?: string | null
          date?: string | null
          day?: string | null
          discount?: number | null
          event_id?: string | null
          event_name?: string | null
          external_location?: string | null
          guests?: number | null
          id?: string | null
          jcb?: number | null
          legacy_venue_name?: string | null
          mastercard?: number | null
          orders?: number | null
          payme?: number | null
          receipt_file_name?: string | null
          receipt_file_url?: string | null
          report_number?: string | null
          revenue_source_id?: string | null
          sales_channel?: string | null
          service_charge?: number | null
          service_period?: string | null
          service_period_id?: string | null
          subtotal?: number | null
          total_sales?: number | null
          union_pay?: number | null
          venue?: string | null
          venue_id?: string | null
          visa?: number | null
          wechat?: number | null
        }
        Update: {
          alipay?: number | null
          amex?: number | null
          card_tips?: number | null
          cash?: number | null
          created_at?: string | null
          date?: string | null
          day?: string | null
          discount?: number | null
          event_id?: string | null
          event_name?: string | null
          external_location?: string | null
          guests?: number | null
          id?: string | null
          jcb?: number | null
          legacy_venue_name?: string | null
          mastercard?: number | null
          orders?: number | null
          payme?: number | null
          receipt_file_name?: string | null
          receipt_file_url?: string | null
          report_number?: string | null
          revenue_source_id?: string | null
          sales_channel?: string | null
          service_charge?: number | null
          service_period?: string | null
          service_period_id?: string | null
          subtotal?: number | null
          total_sales?: number | null
          union_pay?: number | null
          venue?: string | null
          venue_id?: string | null
          visa?: number | null
          wechat?: number | null
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
      compute_ai_rule_key: {
        Args: { _action: Json; _pattern: Json }
        Returns: string
      }
      compute_next_generation_date: {
        Args: {
          p_cadence: string
          p_day_of_month: number
          p_effective_from: string
          p_from?: string
          p_recognition_day: string
        }
        Returns: string
      }
      current_user_tenant_id: { Args: never; Returns: string }
      generate_po_number: { Args: never; Returns: string }
      generate_recurring_expense_bills: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_admin: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      post_expense_bill: { Args: { p_bill_id: string }; Returns: Json }
      post_expense_bill_payment: {
        Args: { p_payment_id: string }
        Returns: Json
      }
      post_payroll_accrual: {
        Args: { p_month: number; p_year: number }
        Returns: Json
      }
      post_payroll_payment_batch: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      rebuild_journal_from_operations: { Args: never; Returns: Json }
      rebuild_payroll_accrual: {
        Args: { p_month: number; p_year: number }
        Returns: Json
      }
      recompute_invoice_from_allocations: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      record_payment_with_allocations: {
        Args: { p_allocations: Json; p_payment: Json }
        Returns: string
      }
      reverse_and_regenerate_sales_journal: {
        Args: { p_entry_id: string }
        Returns: Json
      }
      user_has_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_venue: {
        Args: { _user_id: string; _venue_id: string }
        Returns: boolean
      }
      user_owns_kpi: {
        Args: { _kpi_card_id: string; _user_id: string }
        Returns: boolean
      }
      user_tenant_ids: { Args: { _user_id: string }; Returns: string[] }
      user_venue_ids: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: string[]
      }
      void_payroll_payment_batch: {
        Args: { p_batch_id: string }
        Returns: Json
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
