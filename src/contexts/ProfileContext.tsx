import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

interface ProfileContextType {
  displayName: string | null
  updateDisplayName: (name: string) => Promise<void>
  loading: boolean
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setDisplayName(null)
      setLoading(false)
      return
    }

    fetchProfile()
  }, [user])

  const fetchProfile = async () => {
    if (!user || !supabase) {
      setLoading(false)
      return
    }

    try {
      console.log('🔍 Fetching profile for user:', user.id)
      
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        console.error('❌ Error fetching profile:', error)
        // If profile doesn't exist, use email prefix as default
        setDisplayName(user.email?.split('@')[0] || 'User')
      } else if (data) {
        console.log('✅ Profile loaded:', data)
        setDisplayName(data.display_name || user.email?.split('@')[0] || 'User')
      } else {
        // No profile yet, use email prefix
        setDisplayName(user.email?.split('@')[0] || 'User')
      }
    } catch (error) {
      console.error('💥 Error in fetchProfile:', error)
      setDisplayName(user.email?.split('@')[0] || 'User')
    } finally {
      setLoading(false)
    }
  }

  const updateDisplayName = async (name: string) => {
    if (!user || !supabase) {
      throw new Error('Not authenticated')
    }

    console.log('💾 Updating display name to:', name)

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        display_name: name,
        updated_at: new Date().toISOString()
      })

    if (error) {
      console.error('❌ Error updating profile:', error)
      throw error
    }

    console.log('✅ Display name updated successfully')
    setDisplayName(name)
  }

  return (
    <ProfileContext.Provider
      value={{
        displayName,
        updateDisplayName,
        loading
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export const useProfile = () => {
  const context = useContext(ProfileContext)
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider')
  }
  return context
}

