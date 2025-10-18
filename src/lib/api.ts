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
type GroceryUpdate = Database['public']['Tables']['groceries']['Update']

// Helper function to check if Supabase is configured
function checkSupabase() {
  if (!supabase) {
    throw new Error('Supabase not configured. Please set up your .env.local file with Supabase credentials.')
  }
}

export class FoodChooserAPI {
  // Meals
  static async getMeals(householdId: string): Promise<Meal[]> {
    checkSupabase()
    
    const { data, error } = await supabase!
      .from('meals')
      .select('*')
      .eq('household_id', householdId)
      .order('date', { ascending: false })

    if (error) {
      console.error('Error fetching meals:', error)
      throw error
    }

    return data || []
  }
  // Groceries
  static async getGroceries(householdId: string): Promise<Grocery[]> {
    checkSupabase()
    const { data, error } = await supabase!
      .from('groceries')
      .select('*')
      .eq('household_id', householdId)
      .order('date', { ascending: false })
    if (error) throw error
    return data || []
  }

  static async addGrocery(householdId: string, g: Omit<GroceryInsert, 'household_id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<Grocery> {
    checkSupabase()
    const now = new Date().toISOString()
    const row: GroceryInsert = { ...g, household_id: householdId, user_id: householdId, created_at: now, updated_at: now }
    const { data, error } = await supabase!
      .from('groceries')
      .insert(row)
      .select()
      .single()
    if (error) throw error
    return data
  }

  static async updateGrocery(householdId: string, id: string, updates: Partial<GroceryUpdate>): Promise<Grocery> {
    checkSupabase()

    const { data, error } = await supabase!
      .from('groceries')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('household_id', householdId)
      .select()
      .single()

    if (error) {
      console.error('Error updating grocery:', error)
      throw error
    }

    return data
  }

  static async addMeal(householdId: string, meal: Omit<MealInsert, 'household_id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<Meal> {
    checkSupabase()
    
    const now = new Date().toISOString()
    const mealData: MealInsert = {
      ...meal,
      household_id: householdId,
      user_id: householdId,
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

  static async updateMeal(householdId: string, id: string, updates: Partial<MealUpdate>): Promise<Meal> {
    checkSupabase()
    
    const { data, error } = await supabase!
      .from('meals')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('household_id', householdId)
      .select()
      .single()

    if (error) {
      console.error('Error updating meal:', error)
      throw error
    }

    return data
  }

  static async deleteMeal(householdId: string, id: string): Promise<void> {
    checkSupabase()
    
    const { error } = await supabase!
      .from('meals')
      .delete()
      .eq('id', id)
      .eq('household_id', householdId)

    if (error) {
      console.error('Error deleting meal:', error)
      throw error
    }
  }

  // Groceries
  static async deleteGrocery(householdId: string, id: string): Promise<void> {
    checkSupabase()
    
    const { error } = await supabase!
      .from('groceries')
      .delete()
      .eq('id', id)
      .eq('household_id', householdId)

    if (error) {
      console.error('Error deleting grocery:', error)
      throw error
    }
  }

  // User Preferences
  static async getUserPreferences(householdId: string): Promise<UserPreferences | null> {
    checkSupabase()
    
    const { data, error } = await supabase!
      .from('user_preferences')
      .select('*')
      .eq('household_id', householdId)
      .single()

    if (error && (error as any).code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error fetching user preferences:', error)
      throw error
    }

    return data
  }

  static async upsertUserPreferences(householdId: string, prefs: Omit<UserPreferencesInsert, 'household_id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<UserPreferences> {
    checkSupabase()
    
    // Get current user
    const { data: { user } } = await supabase!.auth.getUser()
    if (!user) {
      console.error('❌ User not authenticated')
      throw new Error('User not authenticated')
    }
    
    console.log('💾 Saving preferences for:', { userId: user.id, householdId, prefs })
    
    const supportedPreferenceKeys = ['budget_min', 'budget_max', 'forbid_repeat_days', 'strict_budget', 'monthly_budget'] as const
    const unsupportedKeys = Object.keys(prefs as Record<string, unknown>).filter(
      (key) => !supportedPreferenceKeys.includes(key as typeof supportedPreferenceKeys[number])
    )
    if (unsupportedKeys.length) {
      console.warn('Ignoring unsupported preference fields for Supabase upsert:', unsupportedKeys)
    }

    const sanitizedPrefs: Omit<UserPreferencesInsert, 'household_id' | 'user_id' | 'created_at' | 'updated_at'> = {
      budget_min: prefs.budget_min,
      budget_max: prefs.budget_max,
      forbid_repeat_days: prefs.forbid_repeat_days,
      strict_budget: prefs.strict_budget,
      monthly_budget: prefs.monthly_budget ?? null
    }
    
    // Check if preferences already exist for this household
    const { data: existing } = await supabase!
      .from('user_preferences')
      .select('*')
      .eq('household_id', householdId)
      .maybeSingle()
    
    const now = new Date().toISOString()
    
    if (existing) {
      // Update existing preferences
      console.log('📝 Updating existing preferences')
      const { data, error } = await supabase!
        .from('user_preferences')
        .update({
          ...sanitizedPrefs,
          updated_at: now
        })
        .eq('household_id', householdId)
        .select()
        .single()
      
      if (error) {
        console.error('❌ Error updating user preferences:', {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw new Error(`Failed to save preferences: ${error.message}`)
      }
      
      console.log('✅ Preferences updated successfully:', data)
      return data
    } else {
      // Insert new preferences
      console.log('➕ Inserting new preferences')
      const prefsData: UserPreferencesInsert = {
        ...sanitizedPrefs,
        household_id: householdId,
        user_id: user.id,
        created_at: now,
        updated_at: now
      }
      
      const { data, error } = await supabase!
        .from('user_preferences')
        .insert(prefsData)
        .select()
        .single()
      
      if (error) {
        console.error('❌ Error inserting user preferences:', {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        throw new Error(`Failed to save preferences: ${error.message}`)
      }
      
      console.log('✅ Preferences inserted successfully:', data)
      return data
    }
  }

  // Cuisine Overrides
  static async getCuisineOverrides(householdId: string): Promise<CuisineOverride[]> {
    checkSupabase()
    
    const { data, error } = await supabase!
      .from('cuisine_overrides')
      .select('*')
      .eq('household_id', householdId)

    if (error) {
      console.error('Error fetching cuisine overrides:', error)
      throw error
    }

    return data || []
  }

  static async upsertCuisineOverride(householdId: string, cuisine: string, count: number): Promise<CuisineOverride> {
    checkSupabase()
    
    const now = new Date().toISOString()
    const overrideData: CuisineOverrideInsert = {
      household_id: householdId,
      user_id: householdId,
      cuisine,
      count,
      created_at: now,
      updated_at: now
    }

    const { data, error } = await supabase!
      .from('cuisine_overrides')
      .upsert(overrideData, { onConflict: 'household_id,cuisine' })
      .select()
      .single()

    if (error) {
      console.error('Error upserting cuisine override:', error)
      throw error
    }

    return data
  }

  // Helper method to get overrides as a Record
  static async getOverridesMap(householdId: string): Promise<Record<string, number>> {
    checkSupabase()
    
    const overrides = await this.getCuisineOverrides(householdId)
    return overrides.reduce((acc, override) => {
      acc[override.cuisine] = override.count
      return acc
    }, {} as Record<string, number>)
  }

  // Disabled Items
  static async getDisabledItems(householdId: string): Promise<Record<string, boolean>> {
    checkSupabase()
    const { data, error } = await supabase!
      .from('disabled_items')
      .select('restaurant_norm, dish_norm, disabled')
      .eq('household_id', householdId)
    if (error) throw error
    const map: Record<string, boolean> = {}
    for (const row of data || []) {
      map[`${row.restaurant_norm}|${row.dish_norm}`] = row.disabled
    }
    return map
  }

  static async setDisabledItem(householdId: string, restaurantNorm: string, dishNorm: string, disabled: boolean): Promise<void> {
    checkSupabase()
    const now = new Date().toISOString()
    const upsertData: DisabledItemInsert = { household_id: householdId, user_id: householdId, restaurant_norm: restaurantNorm, dish_norm: dishNorm, disabled, created_at: now, updated_at: now }
    const { error } = await supabase!
      .from('disabled_items')
      .upsert(upsertData, { onConflict: 'household_id,restaurant_norm,dish_norm' })
    if (error) throw error
  }
}
