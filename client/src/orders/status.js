export const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']

export const ORDER_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

export function nextOrderStatuses(status) {
  return ORDER_STATUS_TRANSITIONS[status] || []
}

export function orderStatusClass(status) {
  if (status === 'cancelled') {
    return 'status-cancelled'
  }

  if (status === 'delivered') {
    return 'status-delivered'
  }

  if (status === 'shipped' || status === 'processing' || status === 'confirmed') {
    return 'status-confirmed'
  }

  return 'status-pending'
}
