import { NavLink } from 'react-router-dom'
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from '../layout/sidebarIcons.jsx'
import { CrownIcon, DashboardIcon, InventoryIcon, OrdersIcon, ProductsIcon, PurchaseOrdersIcon } from './adminIcons.jsx'

const links = [
  { to: '/admin', label: 'Dashboard', end: true, icon: DashboardIcon },
  { to: '/admin/products', label: 'Products', end: false, icon: ProductsIcon },
  { to: '/admin/inventory', label: 'Inventory', end: false, icon: InventoryIcon },
  { to: '/admin/orders', label: 'Orders', end: false, icon: OrdersIcon },
  { to: '/admin/purchase-orders', label: 'Purchase Orders', end: false, icon: PurchaseOrdersIcon },
]

export default function AdminSidebar({ sidebarRef, collapsed = false, locked = false, onNavigate, onToggleCollapse }) {
  return (
    <aside id="admin-sidebar" className="admin-sidebar" ref={sidebarRef} aria-label="Admin" inert={locked ? true : undefined}>
      <div className="admin-collapse-row">
        <button
          type="button"
          className="admin-collapse"
          aria-pressed={collapsed}
          aria-expanded={!collapsed}
          aria-controls="admin-sidebar"
          onClick={onToggleCollapse}
        >
          {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
          <span className="admin-sr">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
        </button>
      </div>
      <div className="admin-brand">
        <span className="admin-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="admin-brand-copy">
          <strong>BNC MOTORS</strong>
          <small>Automotive Spare Parts</small>
        </span>
        <span className="admin-badge">
          <CrownIcon />
          Admin Panel
        </span>
      </div>
      <nav className="admin-nav" aria-label="Admin pages">
        {links.map((link) => {
          const Icon = link.icon

          return (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              aria-label={link.label}
              data-tooltip={link.label}
              onClick={onNavigate}
            >
              <Icon />
              <span>{link.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}
