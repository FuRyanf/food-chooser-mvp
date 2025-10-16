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
    
    // Add timeout to prevent infinite loading (reduced to 3 seconds)
    const timeoutId = setTimeout(() => {
      console.error('⏱️ Auth loading timeout after 3s - showing onboarding')
      setNeedsOnboarding(true)
      setLoading(false)
    }, 3000) // 3 second timeout
    
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('🔐 Initial session check:', session ? 'Found' : 'Not found')
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        console.log('👤 User authenticated:', session.user.email)
        fetchHousehold(session.user.id).finally(() => {
          clearTimeout(timeoutId)
        })
      } else {
        console.log('👤 No authenticated user')
        setLoading(false)
        clearTimeout(timeoutId)
      }
    }).catch((error) => {
      console.error('❌ Error getting session:', error)
      setLoading(false)
      clearTimeout(timeoutId)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔄 Auth state changed:', event, session?.user?.email ?? 'No user')
        
        // Handle sign-in events with extra logging
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('✅ User signed in successfully:', session.user.email)
        }
        
        // Handle sign-out events
        if (event === 'SIGNED_OUT') {
          console.log('👋 User signed out')
        }
        
        setSession(session)
        setUser(session?.user ?? null)
        
        if (session?.user) {
          await fetchHousehold(session.user.id)
        } else {
          setHouseholdId(null)
          setHouseholdName(null)
          setNeedsOnboarding(false)
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
      console.log(`🔍 Fetching household for user: ${userId}`)
      
      // Race the query against a 2-second timeout
      const queryPromise = supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', userId)
        .maybeSingle()
      
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), 2000)
      )
      
      const { data: memberData, error: memberError } = await Promise.race([
        queryPromise,
        timeoutPromise
      ]).catch(err => {
        console.warn('⏱️ Query timed out or failed:', err.message)
        return { data: null, error: err }
      })
      
      // If query fails or no household found, show onboarding
      if (memberError || !memberData?.household_id) {
        console.log('ℹ️ No household found, showing onboarding flow')
        setHouseholdId(null)
        setHouseholdName(null)
        setNeedsOnboarding(true)
        setLoading(false)
        return
      }

      const householdId = memberData.household_id
      console.log('✅ Found household ID:', householdId)
      
      // Fetch household details with timeout
      const householdQueryPromise = supabase
        .from('households')
        .select('id, name')
        .eq('id', householdId)
        .single()
      
      const householdTimeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Household query timeout')), 2000)
      )
      
      const { data: householdData, error: householdError } = await Promise.race([
        householdQueryPromise,
        householdTimeoutPromise
      ]).catch(err => {
        console.warn('⏱️ Household query timed out or failed:', err.message)
        return { data: null, error: err }
      })

      if (householdError || !householdData) {
        console.warn('⚠️ Household details not found, using defaults')
        // Still set the household ID so app works
        setHouseholdId(householdId)
        setHouseholdName('My Household')
        setNeedsOnboarding(false)
        setLoading(false)
        return
      }

      console.log('✅ Household loaded:', householdData.name)
      setHouseholdId(householdData.id)
      setHouseholdName(householdData.name)
      setNeedsOnboarding(false)
      setLoading(false)
      
    } catch (error) {
      console.error('💥 Error in fetchHousehold:', error)
      // On any error, show onboarding
      console.log('🚨 Error occurred, showing onboarding flow')
      setHouseholdId(null)
      setHouseholdName(null)
      setNeedsOnboarding(true)
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
      // Get the current path to redirect back after auth
      const currentPath = window.location.pathname + window.location.search
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${currentPath}`,
          skipBrowserRedirect: false,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      })
      if (error) {
        console.error('❌ Error signing in with Google:', error)
        throw error
      }
    } catch (error) {
      console.error('❌ Sign in error:', error)
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

