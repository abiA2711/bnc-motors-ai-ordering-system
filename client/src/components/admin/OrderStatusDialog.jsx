import Button from '../ui/Button.jsx'
import ErrorMessage from '../ui/ErrorMessage.jsx'
import { formatStatus } from '../../utils/format.js'

export default function OrderStatusDialog({ orderNumber, status, busy, error, onCancel, onConfirm }) {
  if (!status) {
    return null
  }

  const cancelling = status === 'cancelled'

  return (
    <div className="dialog-backdrop">
      <section className="panel dialog" role="dialog" aria-modal="true" aria-labelledby="order-status-title">
        <h2 id="order-status-title">
          {cancelling ? `Cancel ${orderNumber}?` : `Change ${orderNumber} to ${formatStatus(status)}?`}
        </h2>
        <p>
          {cancelling
            ? 'The order stays in history. The server restores the reserved stock as part of cancellation.'
            : 'This follows the allowed status sequence. Prices and the existing order lines stay unchanged.'}
        </p>
        <ErrorMessage message={error} />
        <div className="dialog-actions">
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? 'Updating' : cancelling ? 'Cancel order' : 'Update status'}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Keep current status</Button>
        </div>
      </section>
    </div>
  )
}
