import { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import AdminSidebar from './AdminSidebar.jsx'
import AdminTopbar from './AdminTopbar.jsx'
import '../../styles/admin-layout.css'

const COLLAPSE_KEY = 'bnc.admin.sidebar.collapsed'
const DRAWER_QUERY = '(max-width: 900px)'

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === 'collapsed'
  } catch {
    return false
  }
}

const drawerMatches = () => window.innerWidth <= 900

export default function AdminLayout() {
  const sidebarRef = useRef(null)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawer, setDrawer] = useState(drawerMatches)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(DRAWER_QUERY)
    const onChange = () => {
      const matches = window.innerWidth <= 900
      setDrawer(matches)
      if (!matches) {
        setDrawerOpen(false)
      }
    }

    media.addEventListener('change', onChange)
    window.addEventListener('resize', onChange)
    return () => {
      media.removeEventListener('change', onChange)
      window.removeEventListener('resize', onChange)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? 'collapsed' : 'expanded')
    } catch {
      // The preference stays in memory when storage is unavailable.
    }
  }, [collapsed])

  useEffect(() => {
    if (!drawerOpen) {
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    const previouslyFocused = document.activeElement
    document.body.style.overflow = 'hidden'
    sidebarRef.current?.querySelector('a, button')?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus()
      }
    }
  }, [drawerOpen])

  const closeDrawer = () => setDrawerOpen(false)

  const toggleMenu = () => {
    if (drawer) {
      setDrawerOpen((open) => !open)
      return
    }

    setCollapsed((current) => !current)
  }

  const menuLabel = drawer
    ? (drawerOpen ? 'Close admin menu' : 'Open admin menu')
    : (collapsed ? 'Expand admin sidebar' : 'Collapse admin sidebar')

  return (
    <div className={`admin-shell${collapsed ? ' is-collapsed' : ''}${drawerOpen ? ' is-drawer-open' : ''}`}>
      <AdminSidebar
        sidebarRef={sidebarRef}
        collapsed={collapsed}
        locked={drawer && !drawerOpen}
        onNavigate={closeDrawer}
        onToggleCollapse={() => setCollapsed((current) => !current)}
      />
      {drawerOpen ? <button type="button" className="admin-backdrop" aria-label="Close admin menu" onClick={closeDrawer} /> : null}
      <div className="admin-main">
        <AdminTopbar
          menuExpanded={drawer ? drawerOpen : !collapsed}
          menuLabel={menuLabel}
          onToggleMenu={toggleMenu}
        />
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
