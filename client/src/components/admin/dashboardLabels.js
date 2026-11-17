const STATUS_LABELS = {
  uploaded: 'Uploaded',
  processing: 'Processing',
  review_required: 'Review Required',
  partially_converted: 'Partially Converted',
  confirmed: 'Confirmed',
  failed: 'Failed',
  pending: 'Pending',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export function dashboardStatusLabel(status) {
  return STATUS_LABELS[status] || status
}
