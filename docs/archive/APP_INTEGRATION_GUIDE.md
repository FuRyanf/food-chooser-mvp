# App.tsx Integration Guide

This guide explains how to update your `App.tsx` to use the new authentication system with householdId.

## Overview

The authentication system requires that all API calls now pass `householdId` as the first parameter. This ensures data is properly scoped to the user's household.

## Step-by-Step Integration

### 1. Wrap Your App Component

Your main App component should be wrapped with `AuthenticatedApp` to handle login/loading states:

```typescript
import { AuthenticatedApp } from './components/AuthenticatedApp'
import { useAuth } from './contexts/AuthContext'

export default function App() {
  const { householdId, user, signOut } = useAuth()

  return (
    <AuthenticatedApp>
      {/* Your existing app content */}
      <YourMainContent householdId={householdId!} />
    </AuthenticatedApp>
  )
}
```

### 2. Update All API Calls

Every `FoodChooserAPI` method now requires `householdId` as the first parameter.

#### Before (Old):
```typescript
const meals = await FoodChooserAPI.getMeals()
const prefs = await FoodChooserAPI.getUserPreferences()
await FoodChooserAPI.addMeal(mealData)
```

#### After (New):
```typescript
const { householdId } = useAuth()

const meals = await FoodChooserAPI.getMeals(householdId)
const prefs = await FoodChooserAPI.getUserPreferences(householdId)
await FoodChooserAPI.addMeal(householdId, mealData)
```

### 3. Complete API Method Updates

Here's the complete list of method signature changes:

| Old Method | New Method |
|------------|------------|
| `getMeals()` | `getMeals(householdId)` |
| `addMeal(meal)` | `addMeal(householdId, meal)` |
| `updateMeal(id, updates)` | `updateMeal(householdId, id, updates)` |
| `deleteMeal(id)` | `deleteMeal(householdId, id)` |
| `getGroceries()` | `getGroceries(householdId)` |
| `addGrocery(grocery)` | `addGrocery(householdId, grocery)` |
| `updateGrocery(id, updates)` | `updateGrocery(householdId, id, updates)` |
| `deleteGrocery(id)` | `deleteGrocery(householdId, id)` |
| `getUserPreferences()` | `getUserPreferences(householdId)` |
| `upsertUserPreferences(prefs)` | `upsertUserPreferences(householdId, prefs)` |
| `getCuisineOverrides()` | `getCuisineOverrides(householdId)` |
| `upsertCuisineOverride(cuisine, count)` | `upsertCuisineOverride(householdId, cuisine, count)` |
| `getOverridesMap()` | `getOverridesMap(householdId)` |
| `getDisabledItems()` | `getDisabledItems(householdId)` |
| `setDisabledItem(restaurant, dish, disabled)` | `setDisabledItem(householdId, restaurant, dish, disabled)` |

### 4. Add User Profile/Sign Out

Add a user profile section with sign out capability:

```typescript
import { LogOut, User as UserIcon } from 'lucide-react'
import { useAuth } from './contexts/AuthContext'

function UserProfile() {
  const { user, signOut, householdName } = useAuth()

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-sm font-medium">{user?.email}</p>
        <p className="text-xs text-gray-500">{householdName}</p>
      </div>
      <button
        onClick={signOut}
        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        title="Sign out"
      >
        <LogOut className="w-5 h-5" />
      </button>
    </div>
  )
}
```

### 5. Add Household Settings to Navigation

If you have a settings/navigation section, add a link to household settings:

```typescript
import { HouseholdSettings } from './components/HouseholdSettings'

// In your navigation/tabs
<button onClick={() => setView('household')}>
  <Users className="w-5 h-5" />
  Household
</button>

// In your view renderer
{view === 'household' && <HouseholdSettings />}
```

## Example: Complete App.tsx Structure

Here's a simplified example showing the full integration pattern:

```typescript
import { useState, useEffect } from 'react'
import { AuthenticatedApp } from './components/AuthenticatedApp'
import { HouseholdSettings } from './components/HouseholdSettings'
import { useAuth } from './contexts/AuthContext'
import { FoodChooserAPI } from './lib/api'
import { LogOut } from 'lucide-react'

export default function App() {
  return (
    <AuthenticatedApp>
      <MainApp />
    </AuthenticatedApp>
  )
}

function MainApp() {
  const { householdId, user, signOut, householdName } = useAuth()
  const [meals, setMeals] = useState([])
  const [view, setView] = useState('home')

  // Load data with householdId
  useEffect(() => {
    if (householdId) {
      loadMeals()
    }
  }, [householdId])

  const loadMeals = async () => {
    try {
      const data = await FoodChooserAPI.getMeals(householdId!)
      setMeals(data)
    } catch (error) {
      console.error('Error loading meals:', error)
    }
  }

  const handleAddMeal = async (mealData) => {
    try {
      await FoodChooserAPI.addMeal(householdId!, {
        restaurant: mealData.restaurant,
        dish: mealData.dish,
        // ... other fields
      })
      await loadMeals() // Reload
    } catch (error) {
      console.error('Error adding meal:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with user info */}
      <header className="bg-white shadow px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">🍜 FuDi</h1>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{user?.email}</p>
              <p className="text-xs text-gray-500">{householdName}</p>
            </div>
            <button
              onClick={signOut}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b px-6 py-3">
        <div className="flex gap-4">
          <button
            onClick={() => setView('home')}
            className={view === 'home' ? 'font-semibold' : ''}
          >
            Home
          </button>
          <button
            onClick={() => setView('household')}
            className={view === 'household' ? 'font-semibold' : ''}
          >
            Household Settings
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto p-6">
        {view === 'home' && (
          <div>
            {/* Your existing app content */}
            <button onClick={() => handleAddMeal({...})}>
              Add Meal
            </button>
            {/* ... */}
          </div>
        )}
        
        {view === 'household' && <HouseholdSettings />}
      </main>
    </div>
  )
}
```

## Common Patterns

### Loading State Pattern
```typescript
const [loading, setLoading] = useState(true)

useEffect(() => {
  if (householdId) {
    loadData()
  }
}, [householdId])

const loadData = async () => {
  try {
    setLoading(true)
    const [meals, prefs, overrides] = await Promise.all([
      FoodChooserAPI.getMeals(householdId!),
      FoodChooserAPI.getUserPreferences(householdId!),
      FoodChooserAPI.getCuisineOverrides(householdId!)
    ])
    // Update state...
  } catch (error) {
    console.error('Error loading data:', error)
  } finally {
    setLoading(false)
  }
}
```

### Error Handling Pattern
```typescript
const [error, setError] = useState<string | null>(null)

const saveMeal = async (meal) => {
  try {
    setError(null)
    await FoodChooserAPI.addMeal(householdId!, meal)
    // Success!
  } catch (err) {
    setError('Failed to save meal. Please try again.')
    console.error(err)
  }
}
```

### Optimistic UI Pattern
```typescript
const deleteMeal = async (mealId) => {
  // Optimistically update UI
  setMeals(prev => prev.filter(m => m.id !== mealId))
  
  try {
    await FoodChooserAPI.deleteMeal(householdId!, mealId)
  } catch (error) {
    // Revert on error
    loadMeals()
    console.error('Error deleting meal:', error)
  }
}
```

## Testing Your Integration

1. **Sign in** - Verify Google OAuth works
2. **Load data** - Check that existing data appears
3. **Add meal** - Verify new meals are saved
4. **Sign out and back in** - Data should persist
5. **Open in incognito** - Sign in with different Google account
6. **Verify isolation** - Second user shouldn't see first user's data
7. **Check household settings** - Should show correct members

## TypeScript Tips

If you get type errors about `householdId` being possibly null:

```typescript
// Use non-null assertion when you know it's defined
const meals = await FoodChooserAPI.getMeals(householdId!)

// Or check explicitly
if (householdId) {
  const meals = await FoodChooserAPI.getMeals(householdId)
}

// Or provide a default (not recommended for production)
const meals = await FoodChooserAPI.getMeals(householdId || '')
```

## Next Steps

1. ✅ Update all API calls in App.tsx
2. ✅ Add user profile/sign out button
3. ✅ Add household settings to navigation
4. ✅ Test the complete flow
5. ✅ Deploy to Vercel
6. 🎉 Share with your household!

---

**Need Help?** Check the main `AUTHENTICATION_GUIDE.md` for more details on the authentication system architecture.

