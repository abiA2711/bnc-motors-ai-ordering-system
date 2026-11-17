import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import '../../styles/topbar.css'

const initialsFrom = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return ''
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16.5 20 20.5" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 16.5h11l-1.1-1.8V10a4.4 4.4 0 0 0-8.8 0v4.7z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 10 5 5 5-5" />
    </svg>
  )
}

export default function Topbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const searchRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()
  const [term, setTerm] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const name = user && user.name ? user.name : ''
  const email = user && user.email ? user.email : ''
  const company = user && user.company_name ? user.company_name : ''

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        window.setTimeout(() => searchRef.current?.focus(), 0)
        return
      }

      if (event.key === 'Escape') {
        setMenuOpen(false)
        setSearchOpen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!menuOpen) {
      return undefined
    }

    const close = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  const submitSearch = (event) => {
    event.preventDefault()
    const query = term.trim()
    navigate(query ? `/products?search=${encodeURIComponent(query)}` : '/products')
  }

  const signOut = () => {
    setMenuOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="topbar">
      <form className={`topbar-search${searchOpen ? ' is-open' : ''}`} role="search" onSubmit={submitSearch}>
        <button
          type="button"
          className="topbar-search-toggle"
          aria-label="Search products"
          onClick={() => {
            setSearchOpen(true)
            window.setTimeout(() => searchRef.current?.focus(), 0)
          }}
        >
          <SearchIcon />
        </button>
        <label className="topbar-search-field">
          <span className="topbar-sr">Search products</span>
          <SearchIcon />
          <input
            ref={searchRef}
            type="search"
            value={term}
            placeholder="Search products by name, SKU or part number..."
            onChange={(event) => setTerm(event.target.value)}
          />
          <kbd>Ctrl + K</kbd>
        </label>
      </form>
      <div className="topbar-actions">
        <button
          type="button"
          className="topbar-bell"
          aria-disabled="true"
          aria-label="Notifications are not available"
          onClick={(event) => event.preventDefault()}
        >
          <BellIcon />
          <span className="topbar-bell-dot" aria-hidden="true" />
        </button>
        <div className="topbar-profile" ref={menuRef}>
          <button
            type="button"
            className="topbar-profile-button"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="topbar-avatar" aria-hidden="true">{initialsFrom(name)}</span>
            <span className="topbar-identity">
              <strong>{name}</strong>
              <small>{email}</small>
            </span>
            <ChevronIcon />
          </button>
          {menuOpen ? (
            <div id={menuId} className="topbar-menu" role="menu">
              <div className="topbar-menu-details">
                <strong>{name}</strong>
                <span>{email}</span>
                {company ? <span>{company}</span> : null}
              </div>
              <button type="button" role="menuitem" onClick={signOut}>
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
