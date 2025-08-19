import { supabase } from './supabase'
import type { Database } from './supabase'

type Meal = Database['public']['Tables']['meals']['Row']
type MealInsert = Database['public']['Tables']['meals']['Insert']
type MealUpdate = Database['public']['Tables']['meals']['Update']

type UserPreferences = Database['public']['Tables']['user_preferences']['Row']
type UserPreferencesInsert = Database['public']['Tables']['user_preferences']['Insert']

type CuisineOverride = Database['public']['Tables']['cuisine_overrides']['Row']
type CuisineOverrideInsert = Database['public']['Tables']['cuisine_overrides']['Insert']

type DisabledItem = Database['public']['Tables']['disabled_items']['Row']
type DisabledItemInsert = Database['public']['Tables']['disabled_items']['Insert']

type Grocery = Database['public']['Tables']['groceries']['Row']
type GroceryInsert = Database['public']['Tables']['groceries']['Insert']

// For now, we'll use a simple user ID. In a real app, you'd implement proper auth
const DEMO_USER_ID = 'demo-user-123'

// Helper function to check if Supabase is configured
function checkSupabase() {
  if (!supabase) {
    throw new Error('Supabase not configured. Please set up your .env.local file with Supabase credentials.')
  }
}

export class FoodChooserAPI {
  // Meals
  static async getMeals(): Promise<Meal[]> {
    checkSupabase()
    
    const { data, error } = await supabase!
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
  // Groceries
  static async getGroceries(): Promise<Grocery[]> {
    checkSupabase()
    const { data, error } = await supabase!
      .from('groceries')
      .select('*')
      .eq('user_id', DEMO_USER_ID)
      .order('date', { ascending: false })
    if (error) throw error
    return data || []
  }

  static async addGrocery(g: Omit<GroceryInsert, 'user_id' | 'created_at' | 'updated_at'>): Promise<Grocery> {
    checkSupabase()
    const now = new Date().toISOString()
    const row: GroceryInsert = { ...g, user_id: DEMO_USER_ID, created_at: now, updated_at: now }
    const { data, error } = await supabase!
      .from('groceries')
      .insert(row)
      .select()
      .single()
    if (error) throw error
    return data
  }

  static async addMeal(meal: Omit<MealInsert, 'user_id' | 'created_at' | 'updated_at'>): Promise<Meal> {
    checkSupabase()
    
    const now = new Date().toISOString()
    const mealData: MealInsert = {
      ...meal,
      user_id: DEMO_USER_ID,
      created_at: now,
      updated_at: now
    }

    const { data, error } = await supabase!
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
    checkSupabase()
    
    const { data, error } = await supabase!
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
    checkSupabase()
    
    const { error } = await supabase!
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
    checkSupabase()
    
    const { data, error } = await supabase!
      .from('user_preferences')
      .select('*')
      .eq('user_id', DEMO_USER_ID)
      .single()

    if (error && (error as any).code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching user preferences:', error)
      throw error
    }

    return data
  }

  static async upsertUserPreferences(prefs: Omit<UserPreferencesInsert, 'user_id' | 'created_at' | 'updated_at'>): Promise<UserPreferences> {
    checkSupabase()
    
    const now = new Date().toISOString()
    const prefsData: UserPreferencesInsert = {
      ...prefs,
      user_id: DEMO_USER_ID,
      created_at: now,
      updated_at: now
    }

    const { data, error } = await supabase!
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
    checkSupabase()
    
    const { data, error } = await supabase!
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
    checkSupabase()
    
    const now = new Date().toISOString()
    const overrideData: CuisineOverrideInsert = {
      user_id: DEMO_USER_ID,
      cuisine,
      count,
      created_at: now,
      updated_at: now
    }

    const { data, error } = await supabase!
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
    checkSupabase()
    
    const overrides = await this.getCuisineOverrides()
    return overrides.reduce((acc, override) => {
      acc[override.cuisine] = override.count
      return acc
    }, {} as Record<string, number>)
  }

  // Disabled Items
  static async getDisabledItems(): Promise<Record<string, boolean>> {
    checkSupabase()
    const { data, error } = await supabase!
      .from('disabled_items')
      .select('restaurant_norm, dish_norm, disabled')
      .eq('user_id', DEMO_USER_ID)
    if (error) throw error
    const map: Record<string, boolean> = {}
    for (const row of data || []) {
      map[`${row.restaurant_norm}|${row.dish_norm}`] = row.disabled
    }
    return map
  }

  static async setDisabledItem(restaurantNorm: string, dishNorm: string, disabled: boolean): Promise<void> {
    checkSupabase()
    const now = new Date().toISOString()
    const upsertData: DisabledItemInsert = { user_id: DEMO_USER_ID, restaurant_norm: restaurantNorm, dish_norm: dishNorm, disabled, created_at: now, updated_at: now }
    const { error } = await supabase!
      .from('disabled_items')
      .upsert(upsertData, { onConflict: 'user_id,restaurant_norm,dish_norm' })
    if (error) throw error
  }
}
