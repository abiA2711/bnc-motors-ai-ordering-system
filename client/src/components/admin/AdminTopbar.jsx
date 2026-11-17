import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import AdminBreadcrumb from './AdminBreadcrumb.jsx'
import { LogoutIcon, MenuIcon } from './adminIcons.jsx'

const initialsFrom = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return 'A'
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export default function AdminTopbar({ menuExpanded, menuLabel, onToggleMenu }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const menuRef = useRef(null)
  const menuId = useId()
  const [menuOpen, setMenuOpen] = useState(false)
  const name = user && typeof user.name === 'string' && user.name.trim() ? user.name.trim() : 'Admin'

  useEffect(() => {
    if (!menuOpen) {
      return undefined
    }

    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const signOut = () => {
    setMenuOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="admin-topbar">
      <div className="admin-topbar-title">
        <button
          type="button"
          className="admin-menu-button"
          aria-label={menuLabel}
          aria-expanded={menuExpanded}
          aria-controls="admin-sidebar"
          onClick={onToggleMenu}
        >
          <MenuIcon />
        </button>
        <AdminBreadcrumb />
      </div>
      <div className="admin-profile" ref={menuRef}>
        <button
          type="button"
          className="admin-profile-button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="admin-avatar" aria-hidden="true">{initialsFrom(name)}</span>
          <span className="admin-profile-copy">
            <strong>{name}</strong>
            <small>Admin</small>
          </span>
        </button>
        {menuOpen ? (
          <div id={menuId} className="admin-profile-menu" role="menu">
            <div className="admin-profile-details">
              <strong>{name}</strong>
              <span>Admin</span>
              {user && user.email ? <span>{user.email}</span> : null}
            </div>
            <button type="button" role="menuitem" onClick={signOut}>
              <LogoutIcon />
              Logout
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
