export const PURCHASE_ORDER_STATUSES = ['uploaded', 'processing', 'review_required', 'partially_converted', 'confirmed', 'failed']

export function purchaseOrderStatusClass(status) {
  if (status === 'failed') {
    return 'status-cancelled'
  }

  if (status === 'confirmed') {
    return 'status-delivered'
  }

  if (status === 'partially_converted') {
    return 'status-processing'
  }

  if (status === 'processing') {
    return 'status-confirmed'
  }

  return 'status-pending'
}
