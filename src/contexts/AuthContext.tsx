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

const TIMEOUT_ERROR_PREFIX = 'timeout:'

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${TIMEOUT_ERROR_PREFIX}${label}`)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

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

  const applyHouseholdState = (
    id: string | null,
    name: string | null,
    onboarding: boolean,
    persistRef = true
  ) => {
    setHouseholdId(id)
    setHouseholdName(name)
    setNeedsOnboarding(onboarding)
    if (persistRef) {
      lastHouseholdRef.current = { id, name }
    }
    setLoading(false)
  }

  const fallbackToLastHousehold = (reason: string) => {
    console.warn(reason)
    if (lastHouseholdRef.current.id) {
      console.log('➡️ Retaining last known household due to transient issue')
      applyHouseholdState(
        lastHouseholdRef.current.id,
        lastHouseholdRef.current.name,
        false,
        false
      )
    } else {
      applyHouseholdState(null, null, true)
    }
  }

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
      const memberPromise = supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', userId)
        .maybeSingle()

      const { data: memberData, error: memberError } = await withTimeout<{
        data: { household_id: string | null } | null
        error: unknown
      }>(
        Promise.resolve(memberPromise) as Promise<{
          data: { household_id: string | null } | null
          error: unknown
        }>,
        5000,
        'household_members'
      )

      if (memberError) {
        const memberErrorMessage =
          typeof memberError === 'object' &&
          memberError !== null &&
          'message' in memberError
            ? String((memberError as { message?: unknown }).message ?? 'unknown error')
            : 'unknown error'
        fallbackToLastHousehold(`⚠️ Unable to load household membership: ${memberErrorMessage}`)
        return
      }

      if (!memberData?.household_id) {
        console.log('ℹ️ No household found, showing onboarding flow')
        applyHouseholdState(null, null, true)
        return
      }

      const householdId = memberData.household_id
      console.log('✅ Found household ID:', householdId)
      
      const householdPromise = supabase
        .from('households')
        .select('id, name')
        .eq('id', householdId)
        .single()

      const { data: householdData, error: householdError } = await withTimeout<{
        data: { id: string; name: string | null } | null
        error: unknown
      }>(
        Promise.resolve(householdPromise) as Promise<{
          data: { id: string; name: string | null } | null
          error: unknown
        }>,
        5000,
        'households'
      )

      if (householdError || !householdData) {
        console.warn('⚠️ Household details not found, using fallback')
        const fallbackName = householdData?.name
          ?? lastHouseholdRef.current.name
          ?? 'My Household'
        applyHouseholdState(householdId, fallbackName, false)
        return
      }

      console.log('✅ Household loaded:', householdData.name)
      applyHouseholdState(householdData.id, householdData.name, false)
      
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(TIMEOUT_ERROR_PREFIX)) {
        fallbackToLastHousehold(
          `⏱️ Timed out loading ${error.message.replace(TIMEOUT_ERROR_PREFIX, '')}`
        )
      } else {
        console.error('💥 Error in fetchHousehold:', error)
        fallbackToLastHousehold('🚨 Error occurred while loading household')
      }
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
