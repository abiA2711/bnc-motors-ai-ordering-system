import { useEffect, useLayoutEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useCart } from '../../cart/CartContext.jsx'
import { BuildingIcon, CartIcon, DocumentIcon } from '../auth/icons.jsx'
import Button from '../ui/Button.jsx'
import { BoxIcon, HeadsetIcon, HomeIcon, OrdersIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from './sidebarIcons.jsx'
import '../../styles/sidebar.css'

const customerLinks = [
  { to: '/', label: 'Dashboard', end: true, icon: HomeIcon },
  { to: '/products', label: 'Products', end: false, icon: BoxIcon },
  { to: '/cart', label: 'Cart', end: true, icon: CartIcon },
  { to: '/purchase-orders', label: 'Purchase Orders', end: false, icon: DocumentIcon },
  { to: '/orders', label: 'My Orders', end: false, icon: OrdersIcon },
]

const SIDEBAR_PREF_KEY = 'bnc.sidebar.collapsed'

const readCollapsed = () => {
  try {
    return localStorage.getItem(SIDEBAR_PREF_KEY) === 'collapsed'
  } catch {
    return false
  }
}

const adminLinks = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/products', label: 'Products', end: true },
  { to: '/admin/orders', label: 'Orders', end: false },
  { to: '/admin/purchase-orders', label: 'Purchase Orders', end: false },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { itemCount } = useCart()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const isAdmin = user && user.role === 'admin'
  const companyName = user && user.company_name ? user.company_name.trim() : ''
  const desktopCollapsed = !isAdmin && collapsed

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('sidebar-collapsed', desktopCollapsed)
  }, [desktopCollapsed])

  useEffect(() => {
    return () => document.documentElement.classList.remove('sidebar-collapsed')
  }, [])

  useEffect(() => {
    if (isAdmin) {
      return undefined
    }

    try {
      localStorage.setItem(SIDEBAR_PREF_KEY, collapsed ? 'collapsed' : 'expanded')
    } catch {
      // The preference stays in memory when storage is unavailable.
    }
  }, [collapsed, isAdmin])

  useEffect(() => {
    if (!open) {
      return undefined
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const close = () => setOpen(false)

  const signOut = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={`sidebar-slot${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="sidebar-toggle"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="app-sidebar"
        onClick={() => setOpen(true)}
      >
        <span />
        <span />
        <span />
      </button>
      {open ? <button type="button" className="sidebar-backdrop" aria-label="Close menu" onClick={close} /> : null}
      <aside id="app-sidebar" className={`sidebar${isAdmin ? ' sidebar-admin' : ' sidebar-customer'}${open ? ' is-open' : ''}`}>
        {isAdmin ? (
          <>
            <div className="brand">
              <span className="brand-mark">BNC</span>
              <span>
                <strong>BNC Motors</strong>
                <small>Admin area</small>
              </span>
            </div>
            <nav className="side-nav" aria-label="Primary">
              {adminLinks.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end} onClick={close}>
                  {link.label}
                </NavLink>
              ))}
            </nav>
            <Button variant="ghost" className="side-logout" onClick={signOut}>
              Logout
            </Button>
          </>
        ) : (
          <div className="sidebar-body">
            <button type="button" className="sidebar-close" onClick={close}>
              Close
            </button>
            <div className="sidebar-collapse-row">
              <button
                type="button"
                className="sidebar-collapse"
                aria-pressed={collapsed}
                aria-expanded={!collapsed}
                aria-controls="app-sidebar"
                onClick={() => setCollapsed((current) => !current)}
              >
                {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
                <span className="sidebar-sr">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
              </button>
            </div>
            <div className="sidebar-brand" data-tooltip="BNC Motors">
              <span className="sidebar-mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="sidebar-copy">
                <strong>BNC MOTORS</strong>
                <small>Automotive Spare Parts</small>
              </span>
            </div>
            <div className="sidebar-account">
              <span
                className="sidebar-account-icon"
                data-tooltip={companyName || 'Customer'}
                tabIndex={collapsed ? 0 : -1}
                aria-label={companyName ? `${companyName}, Customer Account` : 'Customer Account'}
              >
                <BuildingIcon />
              </span>
              <span className="sidebar-copy">
                <strong>{companyName || 'Customer'}</strong>
                <small>Customer Account</small>
              </span>
            </div>
            <nav className="sidebar-nav" aria-label="Primary">
              {customerLinks.map((link) => {
                const Icon = link.icon
                const label = link.to === '/cart' ? `${link.label}, ${itemCount}` : link.label

                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.end}
                    onClick={close}
                    aria-label={collapsed ? label : undefined}
                    data-tooltip={link.label}
                  >
                    <Icon />
                    <span className="sidebar-copy">{link.label}</span>
                    {link.to === '/cart' ? <span className="sidebar-count">{itemCount}</span> : null}
                  </NavLink>
                )
              })}
            </nav>
            <div className="sidebar-foot">
              <div className="sidebar-help">
                {collapsed ? (
                  <a
                    className="sidebar-help-icon"
                    href="mailto:support@bncmotors.com"
                    aria-label="Contact Support"
                    data-tooltip="Contact Support"
                  >
                    <HeadsetIcon />
                  </a>
                ) : (
                  <span className="sidebar-help-icon" aria-hidden="true">
                    <HeadsetIcon />
                  </span>
                )}
                <span className="sidebar-copy">
                  <strong>Need Help?</strong>
                  <a href="mailto:support@bncmotors.com">support@bncmotors.com</a>
                </span>
              </div>
              <a className="sidebar-support" href="mailto:support@bncmotors.com">
                Contact Support
              </a>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
