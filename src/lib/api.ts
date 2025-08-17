import { supabase } from './supabase'
import type { Database } from './supabase'

type Meal = Database['public']['Tables']['meals']['Row']
type MealInsert = Database['public']['Tables']['meals']['Insert']
type MealUpdate = Database['public']['Tables']['meals']['Update']

type UserPreferences = Database['public']['Tables']['user_preferences']['Row']
type UserPreferencesInsert = Database['public']['Tables']['user_preferences']['Insert']
type UserPreferencesUpdate = Database['public']['Tables']['user_preferences']['Update']

type CuisineOverride = Database['public']['Tables']['cuisine_overrides']['Row']
type CuisineOverrideInsert = Database['public']['Tables']['cuisine_overrides']['Insert']

// For now, we'll use a simple user ID. In a real app, you'd implement proper auth
const DEMO_USER_ID = 'demo-user-123'

export class FoodChooserAPI {
  // Meals
  static async getMeals(): Promise<Meal[]> {
    const { data, error } = await supabase
      .from('meals')
      .select('*')
      .eq('user_id', DEMO_USER_ID)
      .order('date', { ascending: false })

    if (error) {
      console.error('Error fetching meals:', error)
      throw error
    }

    return data || []
  }

  static async addMeal(meal: Omit<MealInsert, 'user_id' | 'created_at' | 'updated_at'>): Promise<Meal> {
    const now = new Date().toISOString()
    const mealData: MealInsert = {
      ...meal,
      user_id: DEMO_USER_ID,
      created_at: now,
      updated_at: now
    }

    const { data, error } = await supabase
      .from('meals')
      .insert(mealData)
      .select()
      .single()

    if (error) {
      console.error('Error adding meal:', error)
      throw error
    }

    return data
  }

  static async updateMeal(id: string, updates: Partial<MealUpdate>): Promise<Meal> {
    const { data, error } = await supabase
      .from('meals')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', DEMO_USER_ID)
      .select()
      .single()

    if (error) {
      console.error('Error updating meal:', error)
      throw error
    }

    return data
  }

  static async deleteMeal(id: string): Promise<void> {
    const { error } = await supabase
      .from('meals')
      .delete()
      .eq('id', id)
      .eq('user_id', DEMO_USER_ID)

    if (error) {
      console.error('Error deleting meal:', error)
      throw error
    }
  }

  // User Preferences
  static async getUserPreferences(): Promise<UserPreferences | null> {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', DEMO_USER_ID)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching user preferences:', error)
      throw error
    }

    return data
  }

  static async upsertUserPreferences(prefs: Omit<UserPreferencesInsert, 'user_id' | 'created_at' | 'updated_at'>): Promise<UserPreferences> {
    const now = new Date().toISOString()
    const prefsData: UserPreferencesInsert = {
      ...prefs,
      user_id: DEMO_USER_ID,
      created_at: now,
      updated_at: now
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(prefsData, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      console.error('Error upserting user preferences:', error)
      throw error
    }

    return data
  }

  // Cuisine Overrides
  static async getCuisineOverrides(): Promise<CuisineOverride[]> {
    const { data, error } = await supabase
      .from('cuisine_overrides')
      .select('*')
      .eq('user_id', DEMO_USER_ID)

    if (error) {
      console.error('Error fetching cuisine overrides:', error)
      throw error
    }

    return data || []
  }

  static async upsertCuisineOverride(cuisine: string, count: number): Promise<CuisineOverride> {
    const now = new Date().toISOString()
    const overrideData: CuisineOverrideInsert = {
      user_id: DEMO_USER_ID,
      cuisine,
      count,
      created_at: now,
      updated_at: now
    }

    const { data, error } = await supabase
      .from('cuisine_overrides')
      .upsert(overrideData, { onConflict: 'user_id,cuisine' })
      .select()
      .single()

    if (error) {
      console.error('Error upserting cuisine override:', error)
      throw error
    }

    return data
  }

  // Helper method to get overrides as a Record
  static async getOverridesMap(): Promise<Record<string, number>> {
    const overrides = await this.getCuisineOverrides()
    return overrides.reduce((acc, override) => {
      acc[override.cuisine] = override.count
      return acc
    }, {} as Record<string, number>)
  }
}
