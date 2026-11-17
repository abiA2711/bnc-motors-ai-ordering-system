function Icon({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

export function ChartIcon() {
  return (
    <Icon>
      <path d="M4 19h16" />
      <path d="M7 16v-4" />
      <path d="M12 16V8" />
      <path d="M17 16v-7" />
    </Icon>
  )
}

export function UsersIcon() {
  return (
    <Icon>
      <path d="M16 20v-1.2a3.2 3.2 0 0 0-3.2-3.2H7.2A3.2 3.2 0 0 0 4 18.8V20" />
      <circle cx="10" cy="8" r="3" />
      <path d="M20 20v-1.2a3.2 3.2 0 0 0-2.4-3.1" />
      <path d="M16 5.1a3 3 0 0 1 0 5.8" />
    </Icon>
  )
}

export function PackageIcon() {
  return (
    <Icon>
      <path d="M12 3.2 20.2 7.6 12 12 3.8 7.6z" />
      <path d="M3.8 7.6V16.4L12 20.8l8.2-4.4V7.6" />
      <path d="M12 12v8.8" />
    </Icon>
  )
}

export function CartIcon() {
  return (
    <Icon>
      <circle cx="8" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
      <path d="M3 4h2l2.2 10.2a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.3L21 7H6" />
    </Icon>
  )
}

export function ClockIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 2" />
    </Icon>
  )
}

export function FileIcon() {
  return (
    <Icon>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </Icon>
  )
}

export function RefreshIcon() {
  return (
    <Icon>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v5h-5" />
    </Icon>
  )
}

export function CalendarIcon() {
  return (
    <Icon>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5V7M16 3.5V7M4 10h16" />
    </Icon>
  )
}

export function EyeIcon() {
  return (
    <Icon>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </Icon>
  )
}

export function TrendIcon() {
  return (
    <Icon>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="m7 14 3.2-3.2 2.4 2.2L18 7" />
    </Icon>
  )
}
