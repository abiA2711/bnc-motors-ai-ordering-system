import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import Button from '../components/ui/Button.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import Loading from '../components/ui/Loading.jsx'

export default function ProtectedRoute() {
  const { user, status, sessionError, retrySession } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="gate">
        <Loading label="Checking your session" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="gate">
        <ErrorMessage message={sessionError} />
        <Button onClick={retrySession}>Try again</Button>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
