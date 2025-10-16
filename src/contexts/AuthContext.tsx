import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  householdId: string | null
  householdName: string | null
  needsOnboarding: boolean
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
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
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
      
      // Try direct query first (most reliable)
      let memberData: any = null
      let memberError: any = null
      
      try {
        console.log('🔍 Querying household_members directly for user:', userId)
        
        const directResult = await supabase
          .from('household_members')
          .select('household_id')
          .eq('user_id', userId)
          .maybeSingle()
        
        console.log('📊 Direct query result:', directResult)
        
        memberData = directResult.data
        memberError = directResult.error
        
        // If direct query fails, try RPC as fallback
        if (memberError || !memberData) {
          console.log('⚠️ Direct query failed, trying RPC fallback')
          const rpcResult = await supabase
            .rpc('get_user_household', { user_uuid: userId })
            .maybeSingle()
          
          console.log('RPC fallback result:', rpcResult)
          
          if (!rpcResult.error && rpcResult.data) {
            memberData = rpcResult.data
            memberError = null
          }
        }
      } catch (err) {
        console.error('⚠️ Query exception:', err)
        memberError = err
      }

      console.log('✅ Final query result:', { memberData, memberError, userId })

      if (memberError) {
        console.error('❌ Error fetching household membership:', memberError)
        console.log('⚠️ Query failed, user may need onboarding')
        setNeedsOnboarding(true)
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
          setNeedsOnboarding(false)
          setLoading(false)
          return
        }

        console.log('🏠 Household data:', householdData)
        setHouseholdId(householdData.id)
        setHouseholdName(householdData.name)
        setNeedsOnboarding(false)
        setLoading(false)
      } else {
        // User doesn't have a household - show onboarding
        console.log('⚠️ No household found, user needs onboarding')
        setNeedsOnboarding(true)
        setLoading(false)
      }
    } catch (error) {
      console.error('💥 Error in fetchHousehold:', error)
      console.log('🚨 Loading app anyway without household')
      setLoading(false)
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
        needsOnboarding,
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

