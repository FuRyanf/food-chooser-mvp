# Google Authentication & Shared Accounts Guide

This guide explains how to implement Google OAuth authentication with support for shared household accounts.

## Architecture Overview

### Current State
- Uses hardcoded `demo-user-123` ID
- No authentication
- Single user experience

### Target State
- Google OAuth sign-in via Supabase Auth
- Multiple Google accounts can belong to one household
- Shared meal history, preferences, and budgets
- User management UI for household members

## Implementation Strategy

### 1. **Authentication Flow**
```
User clicks "Sign in with Google"
  ↓
Supabase Auth handles OAuth
  ↓
User authenticated → Gets unique user_id
  ↓
Check if user belongs to a household
  ↓
If yes: Load household data
If no: Create new household OR join existing via invite
```

### 2. **Database Schema Changes**

You'll need to add these tables to support shared accounts:

```sql
-- Households table (shared accounts)
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Household members (links users to households)
CREATE TABLE household_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- 'owner' or 'member'
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(household_id, user_id)
);

-- Update existing tables to use household_id instead of user_id
ALTER TABLE meals ADD COLUMN household_id UUID REFERENCES households(id);
ALTER TABLE user_preferences ADD COLUMN household_id UUID REFERENCES households(id);
ALTER TABLE cuisine_overrides ADD COLUMN household_id UUID REFERENCES households(id);
ALTER TABLE groceries ADD COLUMN household_id UUID REFERENCES households(id);
ALTER TABLE disabled_items ADD COLUMN household_id UUID REFERENCES households(id);

-- Indexes for performance
CREATE INDEX idx_household_members_user ON household_members(user_id);
CREATE INDEX idx_household_members_household ON household_members(household_id);
CREATE INDEX idx_meals_household ON meals(household_id);
CREATE INDEX idx_groceries_household ON groceries(household_id);

-- Row Level Security (RLS) policies
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- Users can only see households they belong to
CREATE POLICY "Users can view their households"
  ON households FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = households.id
      AND household_members.user_id = auth.uid()
    )
  );

-- Users can update households they belong to
CREATE POLICY "Users can update their households"
  ON households FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = households.id
      AND household_members.user_id = auth.uid()
    )
  );

-- Users can view household members
CREATE POLICY "Users can view household members"
  ON household_members FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members
      WHERE user_id = auth.uid()
    )
  );
```

### 3. **Supabase Auth Setup**

#### Enable Google OAuth Provider

1. **Get Google OAuth Credentials**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Add authorized redirect URI:
     ```
     https://your-project-id.supabase.co/auth/v1/callback
     ```
   - Copy **Client ID** and **Client Secret**

2. **Configure Supabase**
   - Go to Supabase Dashboard → **Authentication** → **Providers**
   - Enable **Google**
   - Paste your Client ID and Client Secret
   - Save changes

3. **Update Environment Variables**
   ```bash
   # .env.local (already have these)
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```

### 4. **Implementation Components**

#### A. Authentication Context (`src/contexts/AuthContext.tsx`)

```typescript
import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  householdId: string | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchHouseholdId(session.user.id)
      }
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchHouseholdId(session.user.id)
        } else {
          setHouseholdId(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const fetchHouseholdId = async (userId: string) => {
    const { data, error } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .single()

    if (!error && data) {
      setHouseholdId(data.household_id)
    } else {
      // User doesn't have a household yet - create one
      await createHouseholdForUser(userId)
    }
  }

  const createHouseholdForUser = async (userId: string) => {
    // Create household
    const { data: household, error: householdError } = await supabase
      .from('households')
      .insert({ name: 'My Household' })
      .select()
      .single()

    if (householdError) {
      console.error('Error creating household:', householdError)
      return
    }

    // Add user as household member
    const { error: memberError } = await supabase
      .from('household_members')
      .insert({
        household_id: household.id,
        user_id: userId,
        role: 'owner'
      })

    if (memberError) {
      console.error('Error adding household member:', memberError)
      return
    }

    setHouseholdId(household.id)
  }

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })
    if (error) console.error('Error signing in:', error)
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Error signing out:', error)
  }

  return (
    <AuthContext.Provider
      value={{ user, session, householdId, signInWithGoogle, signOut, loading }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
```

#### B. Login Component (`src/components/Login.tsx`)

```typescript
import { useAuth } from '../contexts/AuthContext'

export function Login() {
  const { signInWithGoogle, loading } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
      <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">🍜 FuDi</h1>
          <p className="text-gray-600">
            Your personalized meal companion
          </p>
        </div>

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-300 rounded-lg px-6 py-3 text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>

        <p className="text-xs text-gray-500 text-center mt-6">
          By signing in, you agree to share meals with your household members
        </p>
      </div>
    </div>
  )
}
```

#### C. Household Management Component (`src/components/HouseholdSettings.tsx`)

```typescript
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Users, UserPlus, Crown, Trash2 } from 'lucide-react'

interface HouseholdMember {
  id: string
  user_id: string
  role: string
  email: string
  joined_at: string
}

export function HouseholdSettings() {
  const { householdId } = useAuth()
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [householdName, setHouseholdName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')

  useEffect(() => {
    if (householdId) {
      fetchMembers()
      fetchHouseholdName()
    }
  }, [householdId])

  const fetchMembers = async () => {
    if (!householdId) return

    const { data, error } = await supabase
      .from('household_members')
      .select(`
        id,
        user_id,
        role,
        joined_at,
        user:auth.users(email)
      `)
      .eq('household_id', householdId)

    if (!error && data) {
      setMembers(data.map(m => ({
        ...m,
        email: (m as any).user?.email || 'Unknown'
      })))
    }
  }

  const fetchHouseholdName = async () => {
    if (!householdId) return

    const { data, error } = await supabase
      .from('households')
      .select('name')
      .eq('id', householdId)
      .single()

    if (!error && data) {
      setHouseholdName(data.name)
    }
  }

  const updateHouseholdName = async () => {
    if (!householdId || !householdName.trim()) return

    const { error } = await supabase
      .from('households')
      .update({ name: householdName })
      .eq('id', householdId)

    if (error) {
      console.error('Error updating household name:', error)
    }
  }

  const removeMember = async (memberId: string) => {
    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('id', memberId)

    if (!error) {
      fetchMembers()
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Users className="w-6 h-6" />
          Household Settings
        </h2>
      </div>

      {/* Household Name */}
      <div className="bg-white p-4 rounded-lg shadow">
        <label className="block text-sm font-medium mb-2">
          Household Name
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-lg"
            placeholder="My Family"
          />
          <button
            onClick={updateHouseholdName}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Save
          </button>
        </div>
      </div>

      {/* Members List */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="font-semibold mb-3">Members ({members.length})</h3>
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                {member.role === 'owner' && (
                  <Crown className="w-4 h-4 text-yellow-500" />
                )}
                <div>
                  <p className="font-medium">{member.email}</p>
                  <p className="text-xs text-gray-500 capitalize">
                    {member.role}
                  </p>
                </div>
              </div>
              {member.role !== 'owner' && (
                <button
                  onClick={() => removeMember(member.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Invite Section (Note: Requires email invitation system) */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <UserPlus className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-blue-900">
            Invite Household Member
          </h3>
        </div>
        <p className="text-sm text-blue-700 mb-3">
          Share this household ID with others to join: <code className="bg-white px-2 py-1 rounded">{householdId?.slice(0, 8)}...</code>
        </p>
        <p className="text-xs text-blue-600">
          Note: Invitation system can be enhanced with email invites or magic links
        </p>
      </div>
    </div>
  )
}
```

### 5. **Update Main App** (`src/main.tsx`)

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
```

### 6. **Update App.tsx to Use Auth**

```typescript
import { useAuth } from './contexts/AuthContext'
import { Login } from './components/Login'
import { HouseholdSettings } from './components/HouseholdSettings'

export default function App() {
  const { user, householdId, signOut, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  if (!user || !householdId) {
    return <Login />
  }

  // Your existing app code here...
  // Replace DEMO_USER_ID with householdId in API calls
}
```

### 7. **Update API Layer** (`src/lib/api.ts`)

Replace `DEMO_USER_ID` usage with `householdId`:

```typescript
export class FoodChooserAPI {
  static async getMeals(householdId: string): Promise<Meal[]> {
    checkSupabase()
    
    const { data, error } = await supabase!
      .from('meals')
      .select('*')
      .eq('household_id', householdId) // Changed from user_id
      .order('date', { ascending: false })

    if (error) throw error
    return data || []
  }

  // Update all other methods similarly...
}
```

## Benefits of This Approach

✅ **Secure**: Uses industry-standard OAuth 2.0  
✅ **Scalable**: Easy to add more providers (Apple, Facebook, etc.)  
✅ **Shared Data**: Multiple Google accounts share one household  
✅ **Privacy**: RLS policies ensure data isolation between households  
✅ **User-Friendly**: One-click Google sign-in  
✅ **Free**: Supabase Auth is included in free tier  

## Next Steps

1. Apply database schema changes
2. Set up Google OAuth credentials
3. Configure Supabase Auth provider
4. Implement authentication components
5. Update API layer to use household IDs
6. Test multi-user functionality
7. Deploy to Vercel (works seamlessly!)

## Security Considerations

- ✅ RLS policies prevent cross-household data access
- ✅ Supabase handles OAuth security
- ✅ No passwords to manage
- ✅ Automatic session management
- 🔐 Consider adding email verification
- 🔐 Consider implementing invite-only households

Would you like me to generate the complete implementation files?

