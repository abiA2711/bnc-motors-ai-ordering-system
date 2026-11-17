export function moneyToCents(amount) {
  const text = typeof amount === 'number' && Number.isFinite(amount)
    ? amount.toFixed(2)
    : String(amount ?? '').trim()

  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return null
  }

  const [whole, fraction = ''] = text.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export function centsToAmount(cents) {
  const whole = Math.trunc(cents / 100)
  const fraction = String(Math.abs(cents % 100)).padStart(2, '0')
  return `${whole}.${fraction}`
}

export function lineAmount(price, quantity) {
  const cents = moneyToCents(price)

  if (cents === null || !Number.isInteger(quantity) || quantity < 0) {
    return null
  }

  return centsToAmount(cents * quantity)
}

export function formatMoney(amount, currency = 'INR') {
  const value = typeof amount === 'number' ? amount : Number(amount)

  if (!Number.isFinite(value)) {
    return 'Price unavailable'
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatDate(value) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date)
}

export function formatStatus(status) {
  if (typeof status !== 'string' || !status.trim()) {
    return 'Unknown'
  }

  const text = status.trim().replaceAll('_', ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
