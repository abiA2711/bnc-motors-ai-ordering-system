function Icon({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

export function DashboardIcon() {
  return (
    <Icon>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </Icon>
  )
}

export function ProductsIcon() {
  return (
    <Icon>
      <path d="M12 3.2 20.2 7.6 12 12 3.8 7.6z" />
      <path d="M3.8 7.6V16.4L12 20.8l8.2-4.4V7.6" />
      <path d="M12 12v8.8" />
    </Icon>
  )
}

export function InventoryIcon() {
  return (
    <Icon>
      <path d="M3 10.2 12 5l9 5.2" />
      <path d="M5 9.6V19h14V9.6" />
      <path d="M9.5 19v-5h5v5" />
    </Icon>
  )
}

export function OrdersIcon() {
  return (
    <Icon>
      <circle cx="8" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
      <path d="M3 4h2l2.2 10.2a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.3L21 7H6" />
    </Icon>
  )
}

export function PurchaseOrdersIcon() {
  return (
    <Icon>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </Icon>
  )
}

export function LogoutIcon() {
  return (
    <Icon>
      <path d="M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3" />
      <path d="M16 16.5 20.5 12 16 7.5" />
      <path d="M20.5 12H9" />
    </Icon>
  )
}

export function MenuIcon() {
  return (
    <Icon>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  )
}

export function CrownIcon() {
  return (
    <Icon>
      <path d="M4 17.5 6.2 8l3.3 3.2L12 6.5l2.5 4.7L17.8 8 20 17.5z" />
      <path d="M5 20h14" />
    </Icon>
  )
}

export function ChevronIcon() {
  return (
    <Icon>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  )
}
