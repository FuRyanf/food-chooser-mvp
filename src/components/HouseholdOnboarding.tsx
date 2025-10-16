import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface HouseholdOnboardingProps {
  userId: string
  onComplete: () => void
}

export default function HouseholdOnboarding({ userId, onComplete }: HouseholdOnboardingProps) {
  const [mode, setMode] = useState<'choice' | 'create' | 'join'>('choice')
  const [householdName, setHouseholdName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreateHousehold = async () => {
    if (!householdName.trim()) {
      setError('Please enter a household name')
      return
    }

    if (!supabase) {
      setError('Database connection not available')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Create household
      const { data: household, error: householdError } = await supabase
        .from('households')
        .insert({ name: householdName.trim() })
        .select()
        .single()

      if (householdError) throw householdError

      // Add user as owner
      const { error: memberError } = await supabase
        .from('household_members')
        .insert({
          household_id: household.id,
          user_id: userId,
          role: 'owner'
        })

      if (memberError) throw memberError

      // Create default preferences for this household
      const { error: prefsError } = await supabase
        .from('user_preferences')
        .insert({
          user_id: userId,
          household_id: household.id,
          budget_min: 10,
          budget_max: 35,
          forbid_repeat_days: 1,
          strict_budget: true
        })

      if (prefsError) throw prefsError

      onComplete()
    } catch (err: any) {
      console.error('Error creating household:', err)
      setError(err.message || 'Failed to create household')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinInstructions = () => {
    setMode('join')
  }

  if (mode === 'choice') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="text-6xl mb-4">🏠</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Welcome to FuDi!
            </h1>
            <p className="text-gray-600">
              Let's set up your household to start tracking meals and expenses together.
            </p>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <button
              onClick={() => setMode('create')}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-4 px-6 rounded-xl transition-colors flex items-center justify-between group"
            >
              <span className="flex items-center gap-3">
                <span className="text-2xl">✨</span>
                <span>Create New Household</span>
              </span>
              <span className="text-xl group-hover:translate-x-1 transition-transform">→</span>
            </button>

            <button
              onClick={handleJoinInstructions}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 px-6 rounded-xl transition-colors flex items-center justify-between group"
            >
              <span className="flex items-center gap-3">
                <span className="text-2xl">👥</span>
                <span>Join Existing Household</span>
              </span>
              <span className="text-xl group-hover:translate-x-1 transition-transform">→</span>
            </button>
          </div>

          <p className="text-xs text-gray-500 text-center">
            You can only belong to one household at a time
          </p>
        </div>
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="text-6xl mb-4">✨</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Create Your Household
            </h1>
            <p className="text-gray-600">
              Choose a name for your household. You can invite others later!
            </p>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Household Name
              </label>
              <input
                type="text"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="e.g., The Smith Family, Roommates, etc."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                disabled={loading}
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleCreateHousehold}
              disabled={loading || !householdName.trim()}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {loading ? 'Creating...' : 'Create Household'}
            </button>

            <button
              onClick={() => setMode('choice')}
              disabled={loading}
              className="w-full text-gray-600 hover:text-gray-800 font-medium py-2 transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'join') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="text-6xl mb-4">📧</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Join a Household
            </h1>
            <p className="text-gray-600 mb-6">
              To join an existing household, you'll need an invitation.
            </p>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold text-blue-900 flex items-center gap-2">
              <span>ℹ️</span>
              <span>How to join:</span>
            </h3>
            <ol className="space-y-2 text-sm text-blue-800">
              <li className="flex gap-2">
                <span className="font-semibold">1.</span>
                <span>Ask a household member to send you an invite from their Household Settings</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold">2.</span>
                <span>Check your email for the invitation link</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold">3.</span>
                <span>Click the link to automatically join their household</span>
              </li>
            </ol>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
            <p className="text-sm text-gray-700">
              💡 <strong>Tip:</strong> Invitations are valid for 7 days and can only be used once.
            </p>
          </div>

          <button
            onClick={() => setMode('choice')}
            className="w-full text-gray-600 hover:text-gray-800 font-medium py-2 transition-colors"
          >
            ← Back to options
          </button>
        </div>
      </div>
    )
  }

  return null
}

