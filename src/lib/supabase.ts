import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Check if we have valid environment variables
const hasValidEnv = supabaseUrl && 
                   supabaseAnonKey && 
                   supabaseUrl !== 'your_supabase_project_url_here' && 
                   supabaseAnonKey !== 'your_supabase_anon_key_here'

if (!hasValidEnv) {
  console.warn('⚠️ Supabase environment variables not configured. Please set up your .env.local file with actual Supabase credentials.')
}

// Create a mock client if env vars are missing
export const supabase = hasValidEnv 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Database types
export interface Database {
  public: {
    Tables: {
      meals: {
        Row: {
          id: string
          user_id: string
          date: string
          restaurant: string | null
          dish: string
          cuisine: string
          cost: number
          rating: number | null
          notes: string | null
          seed_only: boolean
          purchaser_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          restaurant?: string | null
          dish: string
          cuisine: string
          cost: number
          rating?: number | null
          notes?: string | null
          seed_only?: boolean
          purchaser_name?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          restaurant?: string | null
          dish?: string
          cuisine?: string
          cost?: number
          rating?: number | null
          notes?: string | null
          seed_only?: boolean
          purchaser_name?: string
          created_at?: string
          updated_at?: string
        }
      }
      user_preferences: {
        Row: {
          id: string
          user_id: string
          budget_min: number
          budget_max: number
          forbid_repeat_days: number
          strict_budget: boolean
          monthly_budget: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          budget_min: number
          budget_max: number
          forbid_repeat_days: number
          strict_budget: boolean
          monthly_budget?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          budget_min?: number
          budget_max?: number
          forbid_repeat_days?: number
          strict_budget?: boolean
          monthly_budget?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      cuisine_overrides: {
        Row: {
          id: string
          user_id: string
          cuisine: string
          count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          cuisine: string
          count: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          cuisine?: string
          count?: number
          created_at?: string
          updated_at?: string
        }
      }
      disabled_items: {
        Row: {
          id: string
          user_id: string
          restaurant_norm: string
          dish_norm: string
          disabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_norm: string
          dish_norm: string
          disabled: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          restaurant_norm?: string
          dish_norm?: string
          disabled?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      groceries: {
        Row: {
          id: string
          user_id: string
          date: string
          amount: number
          notes: string | null
          trip_label: string | null
          purchaser_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          amount: number
          notes?: string | null
          trip_label?: string | null
          purchaser_name?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          amount?: number
          notes?: string | null
          trip_label?: string | null
          purchaser_name?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      spending_summary: {
        Row: {
          purchaser_name: string
          category: string
          transaction_count: number
          total_amount: number
          avg_amount: number
          min_amount: number
          max_amount: number
          earliest_date: string
          latest_date: string
        }
      }
      person_totals: {
        Row: {
          purchaser_name: string
          total_transactions: number
          total_spent: number
          avg_per_category: number
          first_purchase: string
          last_purchase: string
        }
      }
    }
  }
}
