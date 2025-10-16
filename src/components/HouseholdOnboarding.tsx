import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { translateText, type Language } from '../lib/i18n'

interface HouseholdOnboardingProps {
  userId: string
  onComplete: () => void
}

// Get initial language from localStorage or default to 'en'
function resolveInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en'
  const stored = localStorage.getItem('language')
  return (stored === 'zh' ? 'zh' : 'en') as Language
}

export default function HouseholdOnboarding({ userId, onComplete }: HouseholdOnboardingProps) {
  const [mode, setMode] = useState<'choice' | 'create' | 'join'>('choice')
  const [householdName, setHouseholdName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [language, setLanguage] = useState<Language>(() => resolveInitialLanguage())
  
  const t = (text: string) => translateText(text, language)
  
  const toggleLanguage = () => {
    const newLang: Language = language === 'en' ? 'zh' : 'en'
    setLanguage(newLang)
    localStorage.setItem('language', newLang)
  }

  const handleCreateHousehold = async () => {
    if (!householdName.trim()) {
      setError(t('Please enter a household name'))
      return
    }

    if (!supabase) {
      setError(t('Database connection not available'))
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
      setError(err.message || t('Failed to create household'))
    } finally {
      setLoading(false)
    }
  }

  const handleJoinInstructions = () => {
    setMode('join')
  }

  if (mode === 'choice') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-xl sm:rounded-2xl shadow-xl p-6 sm:p-8 space-y-5 sm:space-y-6">
          {/* Language Toggle */}
          <div className="flex justify-end">
            <button
              onClick={toggleLanguage}
              className="px-3 py-1.5 text-xs sm:text-sm rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              {language === 'en' ? '中文' : 'EN'}
            </button>
          </div>

          {/* Header */}
          <div className="text-center">
            <div className="text-5xl sm:text-6xl mb-3 sm:mb-4">🏠</div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {t('Welcome to FuDi!')}
            </h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
              {t('Let\'s set up your household to start tracking meals and expenses together.')}
            </p>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <button
              onClick={() => setMode('create')}
              className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-semibold py-3.5 sm:py-4 px-5 sm:px-6 rounded-lg sm:rounded-xl transition-colors flex items-center justify-between group min-h-[56px]"
            >
              <span className="flex items-center gap-2 sm:gap-3">
                <span className="text-xl sm:text-2xl">✨</span>
                <span className="text-sm sm:text-base">{t('Create New Household')}</span>
              </span>
              <span className="text-lg sm:text-xl group-hover:translate-x-1 transition-transform">→</span>
            </button>

            <button
              onClick={handleJoinInstructions}
              className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-semibold py-3.5 sm:py-4 px-5 sm:px-6 rounded-lg sm:rounded-xl transition-colors flex items-center justify-between group min-h-[56px]"
            >
              <span className="flex items-center gap-2 sm:gap-3">
                <span className="text-xl sm:text-2xl">👥</span>
                <span className="text-sm sm:text-base">{t('Join Existing Household')}</span>
              </span>
              <span className="text-lg sm:text-xl group-hover:translate-x-1 transition-transform">→</span>
            </button>
          </div>

          <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 text-center">
            {t('You can only belong to one household at a time')}
          </p>
        </div>
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-xl sm:rounded-2xl shadow-xl p-6 sm:p-8 space-y-5 sm:space-y-6">
          {/* Language Toggle */}
          <div className="flex justify-end">
            <button
              onClick={toggleLanguage}
              className="px-3 py-1.5 text-xs sm:text-sm rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              {language === 'en' ? '中文' : 'EN'}
            </button>
          </div>

          {/* Header */}
          <div className="text-center">
            <div className="text-5xl sm:text-6xl mb-3 sm:mb-4">✨</div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {t('Create Your Household')}
            </h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
              {t('Choose a name for your household. You can invite others later!')}
            </p>
          </div>

          {/* Form */}
          <div className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('Household Name')}
              </label>
              <input
                type="text"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder={t('e.g., The Smith Family, Roommates, etc.')}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100"
                disabled={loading}
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleCreateHousehold}
              disabled={loading || !householdName.trim()}
              className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2.5 sm:py-3 px-5 sm:px-6 rounded-lg transition-colors min-h-[44px] text-sm sm:text-base"
            >
              {loading ? t('Creating...') : t('Create Household')}
            </button>

            <button
              onClick={() => setMode('choice')}
              disabled={loading}
              className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium py-2 transition-colors min-h-[44px] text-sm sm:text-base"
            >
              {t('← Back')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'join') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-xl sm:rounded-2xl shadow-xl p-6 sm:p-8 space-y-5 sm:space-y-6">
          {/* Language Toggle */}
          <div className="flex justify-end">
            <button
              onClick={toggleLanguage}
              className="px-3 py-1.5 text-xs sm:text-sm rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              {language === 'en' ? '中文' : 'EN'}
            </button>
          </div>

          {/* Header */}
          <div className="text-center">
            <div className="text-5xl sm:text-6xl mb-3 sm:mb-4">📧</div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {t('Join a Household')}
            </h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-6">
              {t('To join an existing household, you\'ll need an invitation.')}
            </p>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 sm:p-5 space-y-3">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
              <span>ℹ️</span>
              <span>{t('How to join:')}</span>
            </h3>
            <ol className="space-y-2 text-xs sm:text-sm text-blue-800 dark:text-blue-200">
              <li className="flex gap-2">
                <span className="font-semibold">1.</span>
                <span>{t('Ask a household member to generate an invite link from their Household Settings')}</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold">2.</span>
                <span>{t('They\'ll share the invite link with you (via email, text, Slack, etc.)')}</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold">3.</span>
                <span>{t('Click the link to automatically join their household')}</span>
              </li>
            </ol>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5">
            <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              💡 <strong>{t('Note:')}</strong> {t('Invite links expire after 7 days and work only once. No automatic emails are sent - links must be shared manually.')}
            </p>
          </div>

          <button
            onClick={() => setMode('choice')}
            className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium py-2 transition-colors min-h-[44px] text-sm sm:text-base"
          >
            {t('← Back to options')}
          </button>
        </div>
      </div>
    )
  }

  return null
}

