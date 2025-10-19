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
const HOUSEHOLD_CACHE_KEY = 'fudi.household.cache.v1'

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  onTimeout?: () => void
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      onTimeout?.()
      reject(new Error(`${TIMEOUT_ERROR_PREFIX}${label}`))
    }, timeoutMs)
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
  const householdFetchRef = useRef<Promise<void> | null>(null)
  const cachedHouseholdRef = useRef<{ userId: string; id: string | null; name: string | null } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(HOUSEHOLD_CACHE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { userId: string; id: string | null; name: string | null } | null
      if (parsed && typeof parsed.userId === 'string') {
        cachedHouseholdRef.current = parsed
      }
    } catch (err) {
      console.warn('⚠️ Failed to read cached household:', err)
      cachedHouseholdRef.current = null
    }
  }, [])

  const applyHouseholdState = (
    id: string | null,
    name: string | null,
    onboarding: boolean,
    persistRef = true,
    cacheUserId?: string | null
  ) => {
    setHouseholdId(id)
    setHouseholdName(name)
    setNeedsOnboarding(onboarding)
    if (persistRef) {
      lastHouseholdRef.current = { id, name }
      const ownerId = cacheUserId ?? user?.id ?? cachedHouseholdRef.current?.userId ?? null
      if (ownerId) {
        cachedHouseholdRef.current = { userId: ownerId, id, name }
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(
              HOUSEHOLD_CACHE_KEY,
              JSON.stringify({ userId: ownerId, id, name })
            )
          } catch (err) {
            console.warn('⚠️ Failed to write cached household:', err)
          }
        }
      }
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

  const surfaceCachedHousehold = (userId: string) => {
    const cached = cachedHouseholdRef.current
    if (!cached || cached.userId !== userId) return
    // Show cached household immediately without persisting ref (already cached)
    applyHouseholdState(cached.id, cached.name, false, false, userId)
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

    const client = supabase

    // Get initial session
    client.auth.getSession()
      .then(({ data: { session } }) => {
        if (!isActive) return

        console.log('🔐 Initial session check:', session ? 'Found' : 'Not found')
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          console.log('👤 User authenticated:', session.user.email)
          surfaceCachedHousehold(session.user.id)
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
    const { data: { subscription } } = client.auth.onAuthStateChange(
      async (event, session) => {
        if (!isActive) return

        console.log('🔄 Auth state changed:', event, session?.user?.email ?? 'No user')
        
        // Handle sign-in events with extra logging
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('✅ User signed in successfully:', session.user.email)
          surfaceCachedHousehold(session.user.id)
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

    if (householdFetchRef.current) {
      return householdFetchRef.current
    }

    const client = supabase

    const run = async () => {
      try {
        console.log(`🔍 Fetching household for user: ${userId}`)
        const memberResponse = await withTimeout(
          client.rpc('get_user_household_id') as unknown as Promise<{
            data: string | null
            error: unknown
          }>,
          5000,
          'get_user_household_id',
          undefined
        )

        const { data: householdId, error: memberError } = memberResponse

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

        if (!householdId) {
          console.log('ℹ️ No household found, showing onboarding flow')
          applyHouseholdState(null, null, true, true, userId)
          return
        }

        console.log('✅ Found household ID:', householdId)
        
        const cached = cachedHouseholdRef.current
        if (cached && cached.id === householdId && cached.name) {
          console.log('🗂️ Using cached household name:', cached.name)
          applyHouseholdState(householdId, cached.name, false, true, userId)
          return
        }

        const householdController = new AbortController()
        const householdResponse = await withTimeout(
          client
            .from('households')
            .select('id, name')
            .eq('id', householdId)
            .abortSignal(householdController.signal)
            .single() as unknown as Promise<{
              data: { id: string; name: string | null } | null
              error: unknown
            }>,
          5000,
          'households',
          () => householdController.abort()
        )

        const { data: householdData, error: householdError } = householdResponse

        if (householdError || !householdData) {
          console.warn('⚠️ Household details not found, using fallback')
          const fallbackName = householdData?.name
            ?? lastHouseholdRef.current.name
            ?? 'My Household'
          applyHouseholdState(householdId, fallbackName, false, true, userId)
          return
        }

        console.log('✅ Household loaded:', householdData.name)
        applyHouseholdState(householdData.id, householdData.name, false, true, userId)
      } catch (error) {
        if (error instanceof Error && error.message.startsWith(TIMEOUT_ERROR_PREFIX)) {
          fallbackToLastHousehold(
            `⏱️ Timed out loading ${error.message.replace(TIMEOUT_ERROR_PREFIX, '')}`
          )
        } else {
          console.error('💥 Error in fetchHousehold:', error)
          fallbackToLastHousehold('🚨 Error occurred while loading household')
        }
      } finally {
        householdFetchRef.current = null
      }
    }

    const promise = run()
    householdFetchRef.current = promise
    return promise
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
      cachedHouseholdRef.current = null
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem(HOUSEHOLD_CACHE_KEY)
        } catch (err) {
          console.warn('⚠️ Failed to clear cached household:', err)
        }
      }
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
