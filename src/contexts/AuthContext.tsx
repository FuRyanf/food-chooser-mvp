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
    if (!supabase) {
      setLoading(false)
      return
    }
    
    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.error('⏱️ Auth loading timeout - forcing load complete')
      console.log('⚠️ You can still use the app, but household features may not work')
      setLoading(false)
    }, 5000) // 5 second timeout
    
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchHousehold(session.user.id).finally(() => {
          clearTimeout(timeoutId)
        })
      } else {
        setLoading(false)
        clearTimeout(timeoutId)
      }
    }).catch((error) => {
      console.error('Error getting session:', error)
      setLoading(false)
      clearTimeout(timeoutId)
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

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeoutId)
    }
  }, [])

  const fetchHousehold = async (userId: string) => {
    if (!supabase) {
      setLoading(false)
      return
    }
    
    try {
      console.log('🔍 Fetching household for user:', userId)
      
      // TEMPORARY WORKAROUND: Use direct SQL query bypass
      // This avoids RLS issues
      const { data: memberData, error: memberError } = await supabase
        .rpc('get_user_household', { user_uuid: userId })
        .single()
        .then(result => {
          console.log('RPC result:', result)
          return result
        })
        .catch(async (rpcError) => {
          console.log('⚠️ RPC failed, trying direct query:', rpcError)
          // Fallback to direct query
          return await supabase
            .from('household_members')
            .select('household_id')
            .eq('user_id', userId)
            .limit(1)
        })

      console.log('📊 Query result:', { memberData, memberError })

      if (memberError) {
        console.error('❌ Error fetching household membership:', memberError)
        console.log('🔧 Creating fallback household...')
        // Don't return, try to create household instead
        await createHouseholdForUser(userId)
        setLoading(false)
        return
      }

      const householdId = memberData?.household_id || (Array.isArray(memberData) && memberData[0]?.household_id)

      if (householdId) {
        console.log('✅ Found household membership:', householdId)
        
        // User already has a household, fetch its details
        const { data: householdData, error: householdError } = await supabase
          .from('households')
          .select('id, name')
          .eq('id', householdId)
          .limit(1)
          .single()

        if (householdError) {
          console.error('❌ Error fetching household:', householdError)
          // Set a default household so app can work
          setHouseholdId(householdId)
          setHouseholdName('My Household')
          setLoading(false)
          return
        }

        console.log('🏠 Household data:', householdData)
        setHouseholdId(householdData.id)
        setHouseholdName(householdData.name)
        setLoading(false)
      } else {
        // User doesn't have a household, create one
        console.log('⚠️ No household found, creating one...')
        await createHouseholdForUser(userId)
        setLoading(false)
      }
    } catch (error) {
      console.error('💥 Error in fetchHousehold:', error)
      console.log('🚨 Loading app anyway without household')
      setLoading(false)
    }
  }

  const createHouseholdForUser = async (userId: string) => {
    if (!supabase) return
    
    try {
      console.log('Creating household for user:', userId)
      
      // Create household
      const { data: household, error: householdError} = await supabase
        .from('households')
        .insert({ name: 'My Household' })
        .select()
        .single()

      if (householdError) {
        console.error('Error creating household:', householdError)
        return
      }

      console.log('Household created:', household)

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

      console.log('User linked to household')
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
    if (!supabase) return
    
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
    if (!supabase) return
    
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

