import { Link } from 'react-router-dom'
import Button from '../ui/Button.jsx'
import ErrorMessage from '../ui/ErrorMessage.jsx'
import { formatMoney, formatStatus } from '../../utils/format.js'

const formatAddress = (address) => {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    return 'Not provided'
  }

  const parts = [address.line1, address.line2, address.city, address.state, address.postal_code, address.country]
    .filter((part) => typeof part === 'string' && part.trim())

  return parts.length > 0 ? parts.join(', ') : 'Not provided'
}

export default function ReviewSummary({
  summary,
  reviewable,
  confirming,
  confirmError,
  order,
  onConfirm,
  addressForm,
}) {
  return (
    <section className="panel panel-wide page-stack">
      <h2>Review summary</h2>
      <div className="summary-grid">
        <p>Extracted lines <strong>{summary.total}</strong></p>
        <p>Accepted lines <strong>{summary.accepted}</strong></p>
        <p>Pending lines <strong>{summary.pending}</strong></p>
        <p>Rejected or unmatched <strong>{summary.unresolved}</strong></p>
      </div>
      {order ? (
        <div className="page-stack">
          <p className="eyebrow">Confirmed</p>
          <h2>{order.order_number}</h2>
          <p>Status {formatStatus(order.status)}. Total {formatMoney(order.total_amount, 'INR')}.</p>
          <div className="address-pair">
            <p>Shipping <strong>{formatAddress(order.shipping_address)}</strong></p>
            <p>Billing <strong>{formatAddress(order.billing_address)}</strong></p>
          </div>
          <p>Delivery notes <strong>{order.notes && order.notes.trim() ? order.notes : 'Not provided'}</strong></p>
          <Link className="text-link" to={`/orders/${order.id}`}>View order details</Link>
        </div>
      ) : null}
      {reviewable && summary.ready ? addressForm : null}
      {reviewable && summary.ready ? (
        <Button disabled={confirming} onClick={onConfirm}>
          {confirming ? 'Creating order' : 'Confirm purchase order'}
        </Button>
      ) : null}
      {reviewable && !summary.ready ? (
        <p>Confirm stays unavailable until every line has exactly one selected catalogue product.</p>
      ) : null}
      <ErrorMessage message={confirmError} />
    </section>
  )
}
