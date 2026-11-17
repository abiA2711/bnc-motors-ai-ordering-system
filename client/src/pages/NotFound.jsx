import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { homePath } from '../auth/paths.js'

export default function NotFound() {
  const { user } = useAuth()
  const destination = user ? homePath(user) : '/login'
  const label = user ? 'Back to your workspace' : 'Back to sign in'

  return (
    <section className="gate">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p className="lede">That address is not part of the ordering system.</p>
      <Link className="text-link" to={destination}>{label}</Link>
    </section>
  )
}
