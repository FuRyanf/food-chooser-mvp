import { useAuth } from '../contexts/AuthContext'
import { Login } from './Login'

interface AuthenticatedAppProps {
  children: React.ReactNode
}

export function AuthenticatedApp({ children }: AuthenticatedAppProps) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">🍜</div>
          <div className="flex items-center gap-2 text-white">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
          </div>
          <p className="text-white mt-4 font-medium">Loading your delicious experience...</p>
        </div>
      </div>
    )
  }

  // Only check for user - let AppRouter handle the household/onboarding logic
  if (!user) {
    return <Login />
  }

  return <>{children}</>
}

