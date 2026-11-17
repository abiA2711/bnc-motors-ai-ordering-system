import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { homePath } from '../auth/paths.js'

export default function RoleRoute({ allow }) {
  const { user } = useAuth()
  const allowed = Array.isArray(allow) ? allow : [allow]

  if (!user || !allowed.includes(user.role)) {
    return <Navigate to={homePath(user)} replace />
  }

  return <Outlet />
}
