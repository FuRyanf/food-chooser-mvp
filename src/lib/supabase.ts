import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
    }
  }
}
