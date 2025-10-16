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
    }, 8000) // 8 second timeout (increased for slower connections)
    
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

  const fetchHousehold = async (userId: string, retryCount = 0) => {
    if (!supabase) {
      setLoading(false)
      return
    }
    
    const maxRetries = 2
    
    try {
      console.log(`🔍 Fetching household for user: ${userId} (attempt ${retryCount + 1}/${maxRetries + 1})`)
      
      // Try direct query first (most reliable)
      let memberData: any = null
      let memberError: any = null
      
      try {
        console.log('🔍 Querying household_members directly...')
        
        const directResult = await supabase
          .from('household_members')
          .select('household_id')
          .eq('user_id', userId)
          .maybeSingle()
        
        memberData = directResult.data
        memberError = directResult.error
        
        console.log('📊 Direct query result:', { 
          found: !!memberData, 
          error: memberError?.message || 'none' 
        })
        
        // If direct query fails, try RPC as fallback (but not for "not found")
        if ((memberError && memberError.code !== 'PGRST116') || !memberData) {
          console.log('⚠️ Direct query needs fallback, trying RPC...')
          const rpcResult = await supabase
            .rpc('get_user_household', { user_uuid: userId })
            .limit(1)
            .single()
          
          console.log('📊 RPC result:', { found: !!rpcResult.data, error: rpcResult.error?.message || 'none' })
          
          if (!rpcResult.error && rpcResult.data) {
            memberData = rpcResult.data
            memberError = null
          }
        }
      } catch (err) {
        console.error('💥 Query exception:', err)
        memberError = err
        
        // Retry if we have attempts left
        if (retryCount < maxRetries) {
          console.log(`🔄 Retrying in 1 second... (${retryCount + 1}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, 1000))
          return fetchHousehold(userId, retryCount + 1)
        }
      }

      const householdId = memberData?.household_id || (Array.isArray(memberData) && memberData[0]?.household_id)

      if (householdId) {
        console.log('✅ Found household ID:', householdId)
        
        // User already has a household, fetch its details
        const { data: householdData, error: householdError } = await supabase
          .from('households')
          .select('id, name')
          .eq('id', householdId)
          .limit(1)
          .single()

        if (householdError) {
          console.error('❌ Error fetching household details:', householdError)
          // Set a default household so app can work
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
      } else {
        // User doesn't have a household - show onboarding
        console.log('ℹ️ No household found, showing onboarding flow')
        setHouseholdId(null)
        setHouseholdName(null)
        setNeedsOnboarding(true)
        setLoading(false)
      }
    } catch (error) {
      console.error('💥 Unexpected error in fetchHousehold:', error)
      
      // Retry on unexpected errors
      if (retryCount < maxRetries) {
        console.log(`🔄 Retrying after unexpected error... (${retryCount + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, 1000))
        return fetchHousehold(userId, retryCount + 1)
      }
      
      console.log('🚨 All retries exhausted, proceeding with onboarding')
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

