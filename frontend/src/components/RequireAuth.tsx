import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthProvider'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="flex h-dvh items-center justify-center text-sm text-slate-400">Lädt …</div>
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}
