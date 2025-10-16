import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Users, Crown, Trash2, Mail, Send, Clock, CheckCircle, XCircle, LogOut, AlertCircle } from 'lucide-react'

interface HouseholdMember {
  id: string
  user_id: string
  role: string
  email: string
  joined_at: string
}

interface Invitation {
  invite_id: string
  invite_email: string
  invite_token: string
  inviter_email: string
  status: string
  created_at: string
  expires_at: string
  is_expired: boolean
}

export function HouseholdSettings() {
  const { householdId, householdName, user, refreshHousehold, signOut } = useAuth()
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [newHouseholdName, setNewHouseholdName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  useEffect(() => {
    if (householdId) {
      fetchMembers()
      fetchInvitations()
      setNewHouseholdName(householdName || '')
    }
  }, [householdId, householdName])

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

  const fetchInvitations = async () => {
    if (!householdId || !supabase) return

    try {
      const { data, error } = await supabase
        .rpc('get_household_invites', { p_household_id: householdId })

      if (error) throw error

      setInvitations(data || [])
    } catch (err) {
      console.error('Error fetching invitations:', err)
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

  const sendInvite = async () => {
    if (!householdId || !user?.id || !supabase) {
      setError('Unable to generate invite')
      return
    }

    // Email is optional - just for tracking/labeling
    const emailToUse = inviteEmail.trim() || 'Anonymous invite'
    
    // If email provided, validate it
    if (inviteEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(inviteEmail)) {
        setError('Please enter a valid email address (or leave blank)')
        return
      }
    }

    try {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .rpc('generate_household_invite', {
          p_household_id: householdId,
          p_inviter_id: user.id,
          p_invite_email: emailToUse
        })

      if (error) throw error

      const inviteData = data[0]
      const inviteUrl = `${window.location.origin}/invite/${inviteData.invite_token}`

      // Copy invite link to clipboard
      await navigator.clipboard.writeText(inviteUrl)

      const recipientText = inviteEmail.trim() ? ` with ${inviteEmail}` : ''
      setSuccess(`✅ Invite link copied to clipboard! Share it${recipientText}:\n\n${inviteUrl}`)
      setInviteEmail('')
      
      await fetchInvitations()
      setTimeout(() => setSuccess(null), 15000)
    } catch (err: any) {
      console.error('Error sending invite:', err)
      setError(err.message || 'Failed to create invite')
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

  const currentUserRole = members.find(m => m.user_id === user?.id)?.role
  const isOwner = currentUserRole === 'owner'
  const isLastMember = members.length === 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6" />
          Household Settings
        </h2>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-2">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-green-700 font-semibold mb-2">Link Copied to Clipboard!</p>
            <p className="text-xs text-green-600 whitespace-pre-wrap break-all">{success}</p>
          </div>
        </div>
      )}

      {/* Household Name */}
      <div className="bg-white p-6 rounded-lg shadow">
        <label className="block text-sm font-medium mb-2 text-gray-700">
          Household Name
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newHouseholdName}
            onChange={(e) => setNewHouseholdName(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="My Family"
            disabled={loading}
          />
          <button
            onClick={updateHouseholdName}
            disabled={loading || newHouseholdName === householdName}
            className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>

      {/* Invite Members */}
      {isOwner && (
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-6 rounded-lg border border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Invite Members
          </h3>
          <p className="text-sm text-blue-700 mb-4">
            Generate an invite link and share it manually
          </p>
          <div className="flex gap-2 mb-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="friend@example.com (optional - for tracking)"
              className="flex-1 px-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              disabled={loading}
              onKeyPress={(e) => e.key === 'Enter' && sendInvite()}
            />
            <button
              onClick={sendInvite}
              disabled={loading}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              {loading ? 'Creating...' : 'Generate Link'}
            </button>
          </div>
          <div className="bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-100">
            <p className="font-semibold mb-1">📋 How it works:</p>
            <ol className="space-y-1 ml-4 list-decimal">
              <li>Optionally enter email above (just for your tracking)</li>
              <li>Click "Generate Link" to create a secure invite</li>
              <li>Link is automatically copied to your clipboard</li>
              <li>Send the link via email, text, Slack, etc.</li>
              <li>Recipient clicks link and joins your household</li>
            </ol>
            <p className="mt-2 text-blue-700 dark:text-blue-200">💡 Links expire after 7 days and work only once. Email field is optional.</p>
          </div>
        </div>
      )}

      {/* Pending Invitations */}
      {isOwner && invitations.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="font-semibold mb-4 text-gray-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-500" />
            Invite History ({invitations.filter(i => i.status === 'pending' && !i.is_expired).length} active)
          </h3>
          <div className="space-y-2">
            {invitations.map((invite) => {
              const isExpired = invite.is_expired || invite.status !== 'pending'
              const daysLeft = Math.ceil((new Date(invite.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              
              return (
                <div
                  key={invite.invite_id}
                  className={`flex items-center justify-between p-4 rounded-lg ${
                    isExpired ? 'bg-gray-50 opacity-60' : 'bg-blue-50 border border-blue-200'
                  }`}
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">
                      {invite.invite_email}
                    </p>
                    <p className="text-xs text-gray-500">
                      {isExpired ? (
                        <span className="text-red-600">Expired</span>
                      ) : invite.status === 'accepted' ? (
                        <span className="text-green-600">Accepted ✓</span>
                      ) : (
                        <>
                          Created {new Date(invite.created_at).toLocaleDateString()} • 
                          Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                        </>
                      )}
                    </p>
                  </div>
                  {!isExpired && (
                    <button
                      onClick={() => copyInviteLink(invite.invite_token)}
                      className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1"
                      title="Copy invite link to share again"
                    >
                      <Mail className="w-3 h-3" />
                      Copy Link
                    </button>
                  )}
                </div>
              )
            })}
          </div>
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
