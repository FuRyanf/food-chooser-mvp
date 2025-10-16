import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  householdId: string | null
  householdName: string | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  loading: boolean
  refreshHousehold: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [householdName, setHouseholdName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchHousehold(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchHousehold(session.user.id)
        } else {
          setHouseholdId(null)
          setHouseholdName(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const fetchHousehold = async (userId: string) => {
    try {
      // Check if user belongs to a household
      const { data: memberData, error: memberError } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (memberError && memberError.code !== 'PGRST116') {
        console.error('Error fetching household membership:', memberError)
        setLoading(false)
        return
      }

      if (memberData?.household_id) {
        // User already has a household, fetch its details
        const { data: householdData, error: householdError } = await supabase
          .from('households')
          .select('id, name')
          .eq('id', memberData.household_id)
          .single()

        if (householdError) {
          console.error('Error fetching household:', householdError)
          setLoading(false)
          return
        }

        setHouseholdId(householdData.id)
        setHouseholdName(householdData.name)
      } else {
        // User doesn't have a household, create one
        // This might happen if the trigger didn't fire
        await createHouseholdForUser(userId)
      }
    } catch (error) {
      console.error('Error in fetchHousehold:', error)
    } finally {
      setLoading(false)
    }
  }

  const createHouseholdForUser = async (userId: string) => {
    try {
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

      // Add user as household owner
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
      setHouseholdName(household.name)
    } catch (error) {
      console.error('Error creating household:', error)
    }
  }

  const refreshHousehold = async () => {
    if (user) {
      await fetchHousehold(user.id)
    }
  }

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}`
        }
      })
      if (error) {
        console.error('Error signing in with Google:', error)
        throw error
      }
    } catch (error) {
      console.error('Sign in error:', error)
      throw error
    }
  }

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Error signing out:', error)
        throw error
      }
      setHouseholdId(null)
      setHouseholdName(null)
    } catch (error) {
      console.error('Sign out error:', error)
      throw error
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        householdId,
        householdName,
        signInWithGoogle,
        signOut,
        loading,
        refreshHousehold
      }}
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

