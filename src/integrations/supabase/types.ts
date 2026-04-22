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
          notes: string | null
          phone: string | null
          sort_order: number
          status: string
          updated_at: string
          user_id: string | null
          venue: string | null
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
          notes?: string | null
          phone?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          user_id?: string | null
          venue?: string | null
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
          notes?: string | null
          phone?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          user_id?: string | null
          venue?: string | null
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
          period_id: string
          purchases_qty: number
          total_usage_cost: number | null
          unit_cost: number
          updated_at: string
          usage_qty: number | null
          venue: string
        }
        Insert: {
          beginning_qty?: number
          created_at?: string
          ending_qty?: number
          id?: string
          item_id: string
          period_id: string
          purchases_qty?: number
          total_usage_cost?: number | null
          unit_cost?: number
          updated_at?: string
          usage_qty?: number | null
          venue: string
        }
        Update: {
          beginning_qty?: number
          created_at?: string
          ending_qty?: number
          id?: string
          item_id?: string
          period_id?: string
          purchases_qty?: number
          total_usage_cost?: number | null
          unit_cost?: number
          updated_at?: string
          usage_qty?: number | null
          venue?: string
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
          period_end: string
          period_label: string
          period_start: string
          status: string
          updated_at: string
          venue: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          period_end: string
          period_label: string
          period_start: string
          status?: string
          updated_at?: string
          venue: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          period_end?: string
          period_label?: string
          period_start?: string
          status?: string
          updated_at?: string
          venue?: string
        }
        Relationships: []
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
            foreignKeyName: "invoice_line_items_product_master_id_fkey"
            columns: ["product_master_id"]
            isOneToOne: false
            referencedRelation: "product_master"
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
          base_unit_qty: number
          base_unit_type: string
          cost_per_base_unit: number
          cost_per_stock_unit: number
          created_at: string
          external_sku: string
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
          base_unit_qty?: number
          base_unit_type?: string
          cost_per_base_unit?: number
          cost_per_stock_unit?: number
          created_at?: string
          external_sku?: string
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
          base_unit_qty?: number
          base_unit_type?: string
          cost_per_base_unit?: number
          cost_per_stock_unit?: number
          created_at?: string
          external_sku?: string
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
        Relationships: []
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
        ]
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
          guests: number
          id: string
          jcb: number
          mastercard: number
          orders: number
          payme: number
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
          jcb?: number
          mastercard?: number
          orders?: number
          payme?: number
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
          jcb?: number
          mastercard?: number
          orders?: number
          payme?: number
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
