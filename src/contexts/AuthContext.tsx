import { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react'
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
  const lastHouseholdRef = useRef<{ id: string | null; name: string | null }>({
    id: null,
    name: null
  })

  useEffect(() => {
    lastHouseholdRef.current = {
      id: householdId,
      name: householdName
    }
  }, [householdId, householdName])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let isActive = true

    // Get initial session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!isActive) return

        console.log('🔐 Initial session check:', session ? 'Found' : 'Not found')
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          console.log('👤 User authenticated:', session.user.email)
          fetchHousehold(session.user.id)
        } else {
          console.log('👤 No authenticated user')
          setLoading(false)
        }
      })
      .catch((error) => {
        if (!isActive) return
        console.error('❌ Error getting session:', error)
        setLoading(false)
      })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isActive) return

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
          lastHouseholdRef.current = { id: null, name: null }
          setNeedsOnboarding(false)
          setLoading(false)
        }
      }
    )

    return () => {
      isActive = false
      subscription.unsubscribe()
    }
  }, [])

  const fetchHousehold = async (userId: string) => {
    if (!supabase) {
      setLoading(false)
      return
    }
    
    try {
      console.log(`🔍 Fetching household for user: ${userId}`)
      const { data: memberData, error: memberError } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (memberError) {
        console.warn('⚠️ Unable to load household membership:', memberError)
        if (lastHouseholdRef.current.id) {
          console.log('➡️ Retaining last known household due to transient error')
          setNeedsOnboarding(false)
        } else {
          setHouseholdId(null)
          setHouseholdName(null)
          lastHouseholdRef.current = { id: null, name: null }
          setNeedsOnboarding(true)
        }
        setLoading(false)
        return
      }

      if (!memberData?.household_id) {
        console.log('ℹ️ No household found, showing onboarding flow')
        setHouseholdId(null)
        setHouseholdName(null)
        lastHouseholdRef.current = { id: null, name: null }
        setNeedsOnboarding(true)
        setLoading(false)
        return
      }

      const householdId = memberData.household_id
      console.log('✅ Found household ID:', householdId)
      
      const { data: householdData, error: householdError } = await supabase
        .from('households')
        .select('id, name')
        .eq('id', householdId)
        .single()

      if (householdError || !householdData) {
        console.warn('⚠️ Household details not found, using fallback')
        const fallbackName = lastHouseholdRef.current.name ?? 'My Household'
        setHouseholdId(householdId)
        setHouseholdName(fallbackName)
        lastHouseholdRef.current = { id: householdId, name: fallbackName }
        setNeedsOnboarding(false)
        setLoading(false)
        return
      }

      console.log('✅ Household loaded:', householdData.name)
      setHouseholdId(householdData.id)
      setHouseholdName(householdData.name)
      lastHouseholdRef.current = { id: householdData.id, name: householdData.name }
      setNeedsOnboarding(false)
      setLoading(false)
      
    } catch (error) {
      console.error('💥 Error in fetchHousehold:', error)
      if (lastHouseholdRef.current.id) {
        console.log('➡️ Keeping last known household after error')
        setNeedsOnboarding(false)
      } else {
        setHouseholdId(null)
        setHouseholdName(null)
        lastHouseholdRef.current = { id: null, name: null }
        setNeedsOnboarding(true)
      }
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
      lastHouseholdRef.current = { id: null, name: null }
      setNeedsOnboarding(false)
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
