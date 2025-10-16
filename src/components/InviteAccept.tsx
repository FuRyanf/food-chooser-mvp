import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { UserPlus, AlertCircle, CheckCircle, Loader } from 'lucide-react'

interface InviteAcceptProps {
  inviteToken: string
  onAccepted: () => void
}

interface InviteInfo {
  invite_id: string
  household_id: string
  household_name: string
  inviter_email: string
  invite_email: string
  status: string
  created_at: string
  expires_at: string
}

export default function InviteAccept({ inviteToken, onAccepted }: InviteAcceptProps) {
  const { user, householdId, loading: authLoading } = useAuth()
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false)

  useEffect(() => {
    fetchInviteInfo()
  }, [inviteToken])

  useEffect(() => {
    // Log auth state for debugging
    console.log('📊 InviteAccept auth state:', { 
      user: user?.id, 
      householdId, 
      authLoading,
      inviteToken 
    })
  }, [user, householdId, authLoading])

  const fetchInviteInfo = async () => {
    if (!supabase) {
      setError('Supabase client not initialized')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      
      // RPC returns a TABLE, so we need to handle it as an array
      const { data, error } = await supabase
        .rpc('get_invite_info', { p_invite_code: inviteToken })
      
      console.log('📊 Invite info response:', { data, error })

      if (error) {
        console.error('❌ RPC error:', error)
        throw error
      }

      // Data should be an array from the TABLE return type
      if (!data || !Array.isArray(data) || data.length === 0) {
        setError('Invalid or expired invitation code')
        setLoading(false)
        return
      }

      console.log('✅ Invite info loaded:', data[0])
      setInviteInfo(data[0])
    } catch (err: any) {
      console.error('💥 Error fetching invite info:', err)
      setError(err.message || 'Failed to load invitation')
    } finally {
      setLoading(false)
    }
  }

  const acceptInvite = async () => {
    if (!user?.id || !supabase) {
      setError('You must be signed in to accept invitations')
      return
    }

    console.log('🔄 Accepting invite - user state:', { userId: user.id, householdId, showSwitchConfirm })

    // If user is already in a household and hasn't confirmed, show confirmation
    if (householdId && !showSwitchConfirm) {
      console.log('⚠️ User already has household, showing switch confirmation')
      setShowSwitchConfirm(true)
      return
    }

    try {
      setAccepting(true)
      setError('')
      setSuccess('')

      console.log('📞 Calling accept_household_invite with code:', inviteToken)
      
      // RPC returns a TABLE, so we need to handle it as an array
      const { data, error } = await supabase
        .rpc('accept_household_invite', {
          p_invite_code: inviteToken
        })

      console.log('📊 Accept invite response:', { data, error })

      if (error) {
        console.error('❌ RPC error:', error)
        throw error
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        setError('Failed to accept invitation')
        return
      }

      const result = data[0]
      console.log('✅ Accept result:', result)

      if (result.success) {
        const message = householdId 
          ? `Switched to ${result.household_name}! Your old household has been left.`
          : `Successfully joined ${result.household_name}!`
        setSuccess(message)
        setTimeout(() => {
          console.log('✅ Calling onAccepted callback')
          onAccepted()
        }, 2000)
      } else {
        setError(result.message || 'Failed to join household')
      }
    } catch (err: any) {
      console.error('💥 Error accepting invite:', err)
      setError(err.message || 'Failed to accept invitation')
    } finally {
      setAccepting(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-xl sm:rounded-2xl shadow-xl p-6 sm:p-8">
          <div className="flex flex-col items-center gap-4">
            <Loader className="w-10 h-10 sm:w-12 sm:h-12 text-blue-500 animate-spin" />
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
              {authLoading ? 'Loading your account...' : 'Loading invitation...'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (error && !inviteInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Invalid Invitation
            </h1>
            <p className="text-gray-600">{error}</p>
          </div>
          <button
            onClick={() => window.location.href = '/'}
            className="w-full bg-gray-500 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <div className="text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Welcome! 🎉
            </h1>
            <p className="text-gray-600">{success}</p>
            <p className="text-sm text-gray-500 mt-2">Redirecting...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-xl sm:rounded-2xl shadow-xl p-6 sm:p-8 space-y-5 sm:space-y-6">
        {/* Header */}
        <div className="text-center">
          <UserPlus className="w-14 h-14 sm:w-16 sm:h-16 text-blue-500 mx-auto mb-3 sm:mb-4" />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            You're Invited!
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Join <strong>{inviteInfo?.household_name}</strong>
          </p>
        </div>

        {/* Invite Details */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Invited by:</span>
            <span className="font-medium text-gray-900">{inviteInfo?.inviter_email}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Household:</span>
            <span className="font-medium text-gray-900">{inviteInfo?.household_name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Expires:</span>
            <span className="font-medium text-gray-900">
              {inviteInfo ? new Date(inviteInfo.expires_at).toLocaleDateString() : ''}
            </span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Switch Household Warning */}
        {showSwitchConfirm && householdId && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-semibold mb-1">You're already in a household</p>
                <p>Accepting this invitation will remove you from your current household. This action cannot be undone.</p>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {!showSwitchConfirm ? (
            <button
              onClick={acceptInvite}
              disabled={accepting || !user}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {accepting ? 'Joining...' : 'Accept & Join Household'}
            </button>
          ) : (
            <>
              <button
                onClick={acceptInvite}
                disabled={accepting}
                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-300 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {accepting ? 'Switching...' : 'Yes, Switch Households'}
              </button>
              <button
                onClick={() => setShowSwitchConfirm(false)}
                disabled={accepting}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </>
          )}

          {!user && (
            <p className="text-sm text-center text-gray-600">
              Please sign in to accept this invitation
            </p>
          )}
        </div>

        {/* Info */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-600">
            💡 By joining this household, you'll share meal history, preferences, and spending data with all members.
          </p>
        </div>
      </div>
    </div>
  )
}

