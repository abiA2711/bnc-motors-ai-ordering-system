import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useCart } from '../../cart/CartContext.jsx'
import Button from '../ui/Button.jsx'

export default function Header() {
  const { user, logout } = useAuth()
  const { itemCount } = useCart()
  const navigate = useNavigate()

  const signOut = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="header">
      <div>
        <p className="header-kicker">{user && user.role === 'admin' ? 'Administration' : 'Customer account'}</p>
        <p className="header-title">{user ? user.company_name : 'BNC Motors'}</p>
      </div>
      <div className="header-user">
        {user && user.role === 'customer' ? (
          <Link className="cart-count" to="/cart">Cart ({itemCount})</Link>
        ) : null}
        <div>
          <strong>{user ? user.name : ''}</strong>
          <small>{user ? user.email : ''}</small>
        </div>
        <Button variant="ghost" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </header>
  )
}
