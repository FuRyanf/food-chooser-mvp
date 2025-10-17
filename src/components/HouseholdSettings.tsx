import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useProfile } from '../contexts/ProfileContext'
import { supabase } from '../lib/supabase'
import { Users, Crown, Trash2, Send, CheckCircle, XCircle, LogOut, AlertCircle, User } from 'lucide-react'

interface HouseholdMember {
  id: string
  user_id: string
  role: string
  email: string
  joined_at: string
}

export function HouseholdSettings() {
  const { householdId, householdName, user, refreshHousehold, signOut } = useAuth()
  const { displayName, updateDisplayName, loading: profileLoading } = useProfile()
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [newHouseholdName, setNewHouseholdName] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [switchCode, setSwitchCode] = useState('')
  const [showSwitchHousehold, setShowSwitchHousehold] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  useEffect(() => {
    if (householdId) {
      fetchMembers()
      setNewHouseholdName(householdName || '')
    }
  }, [householdId, householdName])

  useEffect(() => {
    if (displayName && !newDisplayName) {
      setNewDisplayName(displayName)
    }
  }, [displayName])

  const fetchMembers = async () => {
    if (!householdId || !supabase) return

    try {
      // Use RPC function to get members with their email addresses
      const { data, error } = await supabase
        .rpc('get_household_members_with_emails', { p_household_id: householdId })

      if (error) throw error

      setMembers(data || [])
    } catch (err) {
      console.error('Error fetching members:', err)
      // Fallback to basic query if RPC fails
      try {
        const { data, error } = await supabase
          .from('household_members')
          .select('id, user_id, role, joined_at')
          .eq('household_id', householdId)
          .order('joined_at', { ascending: true })

        if (error) throw error

        const membersWithFallback = (data || []).map(member => ({
          ...member,
          email: `User ${member.user_id.slice(0, 8)}...`
        }))

        setMembers(membersWithFallback)
      } catch (fallbackErr) {
        console.error('Fallback query also failed:', fallbackErr)
      }
    }
  }

  const updateHouseholdName = async () => {
    if (!householdId || !newHouseholdName.trim() || !supabase) {
      setError('Household name cannot be empty')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const { error } = await supabase
        .from('households')
        .update({ name: newHouseholdName.trim(), updated_at: new Date().toISOString() })
        .eq('id', householdId)

      if (error) throw error

      setSuccess('Household name updated!')
      setTimeout(() => setSuccess(null), 3000)
      await refreshHousehold()
    } catch (err) {
      console.error('Error updating household name:', err)
      setError('Failed to update household name')
    } finally {
      setLoading(false)
    }
  }

  const generateInviteCode = async () => {
    if (!householdId || !supabase) {
      setError('Unable to generate invite')
      return
    }

    try {
      setLoading(true)
      setError(null)
      setSuccess(null)

      const { data, error } = await supabase
        .rpc('generate_household_invite', {
          p_household_id: householdId
        })

      if (error) throw error

      if (data && data.length > 0) {
        const code = data[0].invite_code
        setInviteCode(code)
        
        // Copy to clipboard
        await navigator.clipboard.writeText(code)
        
        setSuccess('Code copied to clipboard!')
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err: any) {
      console.error('Error generating invite:', err)
      setError(err.message || 'Failed to generate code')
    } finally {
      setLoading(false)
    }
  }

  const removeMember = async (memberId: string, memberUserId: string) => {
    if (!supabase) return
    
    const currentMember = members.find(m => m.user_id === user?.id)
    if (memberUserId === user?.id) {
      setError('Use "Leave Household" button to remove yourself')
      return
    }

    if (!confirm('Are you sure you want to remove this member?')) {
      return
    }

    try {
      setLoading(true)
      setError(null)

      const { error } = await supabase
        .from('household_members')
        .delete()
        .eq('id', memberId)

      if (error) throw error

      setSuccess('Member removed')
      setTimeout(() => setSuccess(null), 3000)
      await fetchMembers()
    } catch (err) {
      console.error('Error removing member:', err)
      setError('Failed to remove member')
    } finally {
      setLoading(false)
    }
  }

  const leaveHousehold = async () => {
    if (!user?.id || !supabase) return

    const currentMember = members.find(m => m.user_id === user.id)
    const isLastMember = members.length === 1
    const isOwner = currentMember?.role === 'owner'

    try {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .rpc('leave_household', { p_user_id: user.id })

      if (error) throw error

      if (data && data.length > 0 && data[0].success) {
        if (isLastMember) {
          setSuccess('Household deleted. All data has been removed.')
        } else {
          setSuccess('You have left the household.')
        }
        
        // Sign out and redirect to onboarding
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      } else {
        throw new Error(data?.[0]?.message || 'Failed to leave household')
      }
    } catch (err: any) {
      console.error('Error leaving household:', err)
      setError(err.message || 'Failed to leave household')
      setLoading(false)
    }
  }

  const copyInviteLink = (token: string) => {
    const inviteUrl = `${window.location.origin}/invite/${token}`
    navigator.clipboard.writeText(inviteUrl)
    setSuccess('Invite link copied to clipboard!')
    setTimeout(() => setSuccess(null), 3000)
  }

  const handleUpdateProfile = async () => {
    if (!newDisplayName.trim()) {
      setProfileError('Please enter a name')
      return
    }

    setLoading(true)
    setProfileError(null)
    setProfileSuccess(null)

    try {
      await updateDisplayName(newDisplayName.trim())
      setProfileSuccess('Profile updated successfully!')
      setTimeout(() => setProfileSuccess(null), 3000)
    } catch (err: any) {
      console.error('Error updating profile:', err)
      setProfileError(err.message || 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const handleSwitchHousehold = async () => {
    if (!switchCode.trim()) {
      setError('Please enter an invite code')
      return
    }

    if (!supabase) {
      setError('Database connection not available')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .rpc('accept_household_invite', {
          p_invite_code: switchCode.trim()
        })

      if (error) throw error

      if (data && data.length > 0) {
        const result = data[0]
        if (result.success) {
          setSuccess(`Switched to ${result.household_name}!`)
          setTimeout(() => {
            window.location.reload()
          }, 1500)
        } else {
          setError(result.message || 'Failed to switch households')
        }
      }
    } catch (err: any) {
      console.error('Error switching household:', err)
      setError(err.message || 'Failed to switch households')
    } finally {
      setLoading(false)
    }
  }

  const currentUserRole = members.find(m => m.user_id === user?.id)?.role
  const isOwner = currentUserRole === 'owner'
  const isLastMember = members.length === 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 p-6 rounded-xl border border-purple-200 dark:border-purple-800">
        <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <Users className="w-6 h-6" />
          Household Settings
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          Manage your profile, household, and members
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-2">
          <XCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-2">
          <CheckCircle className="w-5 h-5 text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-700 dark:text-green-400 font-semibold">{success}</p>
        </div>
      )}

      {/* Profile & Household Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Settings */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-orange-500" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Your Profile</h3>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Defaults as "Who paid?" in entries
            </p>
          </div>
          
          <div className="p-5 space-y-3">
            <input
              type="text"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 transition-shadow"
              placeholder="Enter your name"
              disabled={loading || profileLoading}
            />
            
            {profileError && (
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />
                {profileError}
              </p>
            )}
            {profileSuccess && (
              <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                {profileSuccess}
              </p>
            )}
            
            <button
              onClick={handleUpdateProfile}
              disabled={loading || profileLoading || newDisplayName === displayName || !newDisplayName.trim()}
              className="w-full px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm hover:shadow-md disabled:shadow-none"
            >
              {loading ? 'Updating...' : 'Update'}
            </button>
          </div>
        </div>

        {/* Household Name */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-500" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Household Name</h3>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Shared with all members
            </p>
          </div>
          
          <div className="p-5 space-y-3">
            <input
              type="text"
              value={newHouseholdName}
              onChange={(e) => setNewHouseholdName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 transition-shadow"
              placeholder="My Household"
              disabled={loading}
            />
            <button
              onClick={updateHouseholdName}
              disabled={loading || newHouseholdName === householdName}
              className="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm hover:shadow-md disabled:shadow-none"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Invite Members */}
      {isOwner && (
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 p-6 rounded-xl border border-blue-200 dark:border-blue-800 shadow-sm">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Invite Members
          </h3>
          
          {inviteCode ? (
            <div className="space-y-4">
              {/* Code Display */}
              <div className="bg-white dark:bg-blue-950/50 border-2 border-blue-300 dark:border-blue-600 rounded-lg p-6 text-center">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">Invite Code:</p>
                <div className="text-4xl font-bold tracking-[0.5em] text-blue-600 dark:text-blue-400 font-mono mb-4">
                  {inviteCode.toUpperCase()}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(inviteCode.toUpperCase())
                    setSuccess('Code copied to clipboard!')
                    setTimeout(() => setSuccess(null), 2000)
                  }}
                  className="w-full sm:w-auto px-6 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 active:bg-blue-700 transition-colors shadow-sm"
                >
                  📋 Copy Code
                </button>
              </div>

              {/* Link Display */}
              <div className="bg-white dark:bg-blue-950/50 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">Or share this link:</p>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={`${window.location.origin}/invite/${inviteCode.toUpperCase()}`}
                    readOnly
                    className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-mono"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/invite/${inviteCode.toUpperCase()}`)
                      setSuccess('Link copied to clipboard!')
                      setTimeout(() => setSuccess(null), 2000)
                    }}
                    className="w-full sm:w-auto px-6 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 active:bg-blue-700 transition-colors shadow-sm"
                  >
                    📋 Copy Link
                  </button>
                </div>
              </div>

              <div className="bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                <p className="text-xs text-blue-800 dark:text-blue-200 flex items-start gap-2">
                  <span className="text-base">💡</span>
                  <span>Code and link expire in 7 days. Can be used by multiple people.</span>
                </p>
              </div>
              
              <button
                onClick={() => setInviteCode(null)}
                className="w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 py-2 transition-colors"
              >
                ← Hide
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-blue-700 dark:text-blue-200">
                Generate a simple code to invite people to your household
              </p>
              <button
                onClick={generateInviteCode}
                disabled={loading}
                className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 active:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold shadow-sm"
              >
                <Send className="w-4 h-4" />
                {loading ? 'Generating...' : 'Generate Invite Code'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Members List */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="font-semibold mb-4 text-gray-800">
          Members ({members.length})
        </h3>
        <div className="space-y-2">
          {members.map((member) => {
            const isCurrentUser = member.user_id === user?.id
            const isMemberOwner = member.role === 'owner'
            const canRemove = isOwner && !isMemberOwner && !isCurrentUser

            return (
              <div
                key={member.id}
                className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                  isCurrentUser ? 'bg-purple-50 border border-purple-200' : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {isMemberOwner && (
                    <Crown className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                  )}
                  <div>
                    <p className="font-medium text-gray-800">
                      {member.email}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-purple-600 font-semibold">
                          (You)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      {member.role} • Joined {new Date(member.joined_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {canRemove && (
                  <button
                    onClick={() => removeMember(member.id, member.user_id)}
                    disabled={loading}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Remove member"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Leave Household */}
      <div className="bg-white p-6 rounded-lg shadow border-2 border-red-100">
        <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Danger Zone
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {isLastMember ? (
            <>
              <strong>Warning:</strong> You are the last member of this household. 
              Leaving will <strong className="text-red-600">permanently delete all household data</strong> including 
              meals, groceries, preferences, and history.
            </>
          ) : (
            <>
              Leave this household. You can create a new household or join another one after leaving.
            </>
          )}
        </p>
        
        {!showLeaveConfirm ? (
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Leave Household
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-red-700">
              Are you absolutely sure?
            </p>
            <div className="flex gap-2">
              <button
                onClick={leaveHousehold}
                disabled={loading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? 'Leaving...' : 'Yes, Leave Household'}
              </button>
              <button
                onClick={() => setShowLeaveConfirm(false)}
                disabled={loading}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-600">
          <strong>💡 How it works:</strong> All household members share meals, groceries, and preferences. 
          Only owners can invite new members. Each person can only belong to one household at a time.
        </p>
      </div>
    </div>
  )
}
