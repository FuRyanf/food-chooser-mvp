import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Users, Crown, Trash2, Copy, Check, X } from 'lucide-react'

interface HouseholdMember {
  id: string
  user_id: string
  role: string
  email: string
  joined_at: string
}

export function HouseholdSettings() {
  const { householdId, householdName, user, refreshHousehold } = useAuth()
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [newHouseholdName, setNewHouseholdName] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (householdId) {
      fetchMembers()
      setNewHouseholdName(householdName || '')
    }
  }, [householdId, householdName])

  const fetchMembers = async () => {
    if (!householdId) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('household_members')
        .select('id, user_id, role, joined_at')
        .eq('household_id', householdId)
        .order('joined_at', { ascending: true })

      if (error) throw error

      // Fetch email addresses from auth.users
      const membersWithEmails = await Promise.all(
        (data || []).map(async (member) => {
          // Try to get user metadata
          const { data: userData } = await supabase.auth.admin.getUserById(member.user_id)
          return {
            ...member,
            email: userData?.user?.email || 'Unknown user'
          }
        })
      )

      setMembers(membersWithEmails)
    } catch (err) {
      console.error('Error fetching members:', err)
      // If admin API fails, show user IDs instead
      const { data } = await supabase
        .from('household_members')
        .select('id, user_id, role, joined_at')
        .eq('household_id', householdId)
        .order('joined_at', { ascending: true })

      if (data) {
        setMembers(data.map(m => ({ ...m, email: `User ${m.user_id.slice(0, 8)}...` })))
      }
    } finally {
      setLoading(false)
    }
  }

  const updateHouseholdName = async () => {
    if (!householdId || !newHouseholdName.trim()) {
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

  const removeMember = async (memberId: string, memberUserId: string) => {
    // Don't allow removing yourself if you're the owner
    const currentMember = members.find(m => m.user_id === user?.id)
    if (currentMember?.role === 'owner' && memberUserId === user?.id) {
      setError('You cannot remove yourself as the owner')
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

  const copyHouseholdId = () => {
    if (householdId) {
      navigator.clipboard.writeText(householdId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const currentUserRole = members.find(m => m.user_id === user?.id)?.role

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
          <X className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-2">
          <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-700">{success}</p>
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

      {/* Members List */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="font-semibold mb-4 text-gray-800">
          Members ({members.length})
        </h3>
        <div className="space-y-2">
          {members.map((member) => {
            const isCurrentUser = member.user_id === user?.id
            const isOwner = member.role === 'owner'
            const canRemove = currentUserRole === 'owner' && !isOwner

            return (
              <div
                key={member.id}
                className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                  isCurrentUser ? 'bg-purple-50 border border-purple-200' : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {isOwner && (
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

      {/* Household ID for Sharing */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-6 rounded-lg border border-blue-200">
        <h3 className="font-semibold text-blue-900 mb-2">
          Share Your Household
        </h3>
        <p className="text-sm text-blue-700 mb-4">
          Share this household ID with others so they can join your household:
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-white px-4 py-2 rounded-lg text-sm font-mono border border-blue-200 overflow-x-auto">
            {householdId}
          </code>
          <button
            onClick={copyHouseholdId}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-blue-600 mt-3">
          <strong>Note:</strong> Currently, new users automatically create their own household.
          To join an existing household, they need to be manually added by an admin in the database.
          Consider implementing an invitation system for better user experience.
        </p>
      </div>

      {/* Info Box */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-600">
          <strong>💡 Tip:</strong> All household members share the same meal history, preferences,
          and spending data. Only owners can manage household members.
        </p>
      </div>
    </div>
  )
}

