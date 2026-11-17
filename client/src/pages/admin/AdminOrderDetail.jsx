import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client.js'
import { getOrder, updateOrderStatus } from '../../api/orders.js'
import AdminOrderProductModal from '../../components/admin/AdminOrderProductModal.jsx'
import OrderStatusDialog from '../../components/admin/OrderStatusDialog.jsx'
import { useToast } from '../../components/ui/ToastProvider.jsx'
import { nextOrderStatuses } from '../../orders/status.js'
import { paymentMethodDetail, paymentMethodLabel, paymentStatusKey, paymentStatusLabel } from '../../orders/payment.js'
import { formatMoney, formatStatus } from '../../utils/format.js'
import '../../styles/admin-orders.css'

const FLOW = ['pending', 'confirmed', 'processing', 'shipped', 'delivered']

const sourceLabel = (source) => {
  if (source === 'purchase_order') {
    return 'Purchase Order'
  }

  if (source === 'cart_checkout') {
    return 'Cart Checkout'
  }

  return '—'
}

const formatAddress = (address) => {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    return 'Not provided'
  }

  const parts = [address.line1, address.line2, address.city, address.state, address.postal_code, address.country]
    .filter((part) => typeof part === 'string' && part.trim())

  return parts.length > 0 ? parts.join(', ') : 'Not provided'
}

const displayText = (value) => (typeof value === 'string' && value.trim() ? value : 'Not provided')

const formatWhen = (value) => {
  if (!value) {
    return 'Not available'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Not available'
  }

  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const moneyValue = (value) => {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

function OrderTimeline({ order }) {
  const cancelled = order.status === 'cancelled'
  const currentIndex = FLOW.indexOf(order.status)

  return (
    <ol className="admin-order-track" aria-label="Order progression">
      {FLOW.map((status, index) => {
        let state = 'upcoming'
        if (!cancelled && index < currentIndex) state = 'done'
        if (!cancelled && index === currentIndex) state = 'current'
        return (
          <li key={status} className={`is-${state}`}>
            <span className="admin-order-track-dot" />
            <strong>{formatStatus(status)}</strong>
          </li>
        )
      })}
      {cancelled ? (
        <li className="is-cancelled">
          <span className="admin-order-track-dot" />
          <strong>Cancelled</strong>
        </li>
      ) : null}
    </ol>
  )
}

export default function AdminOrderDetail() {
  const { id } = useParams()
  const toast = useToast()
  const [order, setOrder] = useState(null)
  const [loadedId, setLoadedId] = useState(null)
  const [error, setError] = useState('')
  const [errorStatus, setErrorStatus] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [nextStatus, setNextStatus] = useState('')
  const [statusError, setStatusError] = useState('')
  const [updating, setUpdating] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const updateLock = useRef(false)

  useEffect(() => {
    let active = true

    getOrder(id)
      .then((nextOrder) => {
        if (!active) {
          return
        }

        setOrder(nextOrder)
        setError('')
        setErrorStatus(0)
        setLoadedId(id)
      })
      .catch((requestError) => {
        if (!active) {
          return
        }

        setOrder(null)
        setError(requestError instanceof ApiError ? requestError.message : requestError.message)
        setErrorStatus(requestError instanceof ApiError ? requestError.status : 0)
        setLoadedId(id)
      })

    return () => {
      active = false
    }
  }, [id, attempt])

  const loading = loadedId !== id
  const items = order && Array.isArray(order.items) ? order.items : []
  const transitions = order ? nextOrderStatuses(order.status) : []
  const customer = order && order.customer
  const tax = order ? moneyValue(order.tax_amount) : null
  const shipping = order ? moneyValue(order.shipping_charge) : null
  const missing = !loading && errorStatus === 404

  const closeStatus = () => {
    if (updateLock.current) {
      return
    }

    setNextStatus('')
    setStatusError('')
  }

  const confirmStatus = () => {
    if (!order || !nextStatus || updateLock.current || !transitions.includes(nextStatus)) {
      return
    }

    updateLock.current = true
    setUpdating(true)
    setStatusError('')

    updateOrderStatus(order.id, nextStatus)
      .then((result) => {
        setOrder(result.order)
        setNextStatus('')
        toast.success(result.message, `order-status:${order.id}:${nextStatus}`)
      })
      .catch((requestError) => {
        const message = requestError instanceof ApiError ? requestError.message : requestError.message
        setStatusError(message)
        toast.error(message, `order-status:${order.id}:${nextStatus}`)
      })
      .finally(() => {
        updateLock.current = false
        setUpdating(false)
      })
  }

  return (
    <div className="admin-order-detail">
      <Link className="admin-order-detail-back" to="/admin/orders">Back to Orders</Link>
      {loading ? (
        <div className="admin-order-detail-skeleton" aria-label="Loading order">
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {!loading && error ? (
        <section className="admin-order-section admin-order-detail-state">
          <h1>{missing ? 'Order not found' : 'Order unavailable'}</h1>
          <p>{error}</p>
          {missing ? null : (
            <button
              type="button"
              className="is-primary"
              onClick={() => {
                setError('')
                setErrorStatus(0)
                setLoadedId(null)
                setAttempt((current) => current + 1)
              }}
            >
              Try again
            </button>
          )}
        </section>
      ) : null}
      {!loading && !error && order ? (
        <>
          <header className="admin-order-detail-head">
            <div>
              <h1>{order.order_number}</h1>
              <p>Placed {formatWhen(order.created_at)}</p>
            </div>
            <span className={`admin-order-badge is-${order.status}`}>{formatStatus(order.status)}</span>
          </header>

          <div className="admin-order-detail-split">
            <section className="admin-order-section">
              <h2>Order Information</h2>
              <div className="admin-order-detail-grid">
                <p><span>Order number</span><strong>{order.order_number}</strong></p>
                <p><span>Order date</span><strong>{formatWhen(order.created_at)}</strong></p>
                <p>
                  <span>Order source</span>
                  <strong>
                    <span className={`admin-order-source is-${order.source || 'unknown'}`}>{sourceLabel(order.source)}</span>
                  </strong>
                </p>
                {order.source === 'purchase_order' && order.purchase_order && order.purchase_order.po_number ? (
                  <p>
                    <span>Original PO number</span>
                    <strong>
                      <Link to={`/admin/purchase-orders/${order.purchase_order.id}`}>{order.purchase_order.po_number}</Link>
                    </strong>
                  </p>
                ) : null}
                <p><span>Current status</span><strong><span className={`admin-order-badge is-${order.status}`}>{formatStatus(order.status)}</span></strong></p>
                <p><span>Payment method</span><strong>{paymentMethodLabel(order.payment_method)}</strong></p>
                <p>
                  <span>Payment status</span>
                  <strong className={`payment-pill is-${paymentStatusKey(order.payment_status)}`}>{paymentStatusLabel(order.payment_status)}</strong>
                </p>
              </div>
              <p className="admin-order-detail-note">{paymentMethodDetail(order.payment_method)} The payment status stays as recorded and is not changed from this page.</p>
            </section>

            <section className="admin-order-section">
              <h2>Customer Information</h2>
              <div className="admin-order-detail-grid">
                <p><span>Customer name</span><strong>{displayText(customer && customer.name)}</strong></p>
                <p><span>Email</span><strong>{displayText(customer && customer.email)}</strong></p>
                <p><span>Phone</span><strong>{displayText(customer && customer.phone)}</strong></p>
                <p><span>Company</span><strong>{displayText(customer && customer.company_name)}</strong></p>
              </div>
            </section>
          </div>

          <div className="admin-order-detail-addresses">
            <section className="admin-order-section">
              <h2>Delivery Address</h2>
              <p>{formatAddress(order.shipping_address)}</p>
            </section>
            <section className="admin-order-section">
              <h2>Billing Address</h2>
              <p>{formatAddress(order.billing_address)}</p>
            </section>
            <section className="admin-order-section">
              <h2>Customer Notes</h2>
              <p>{order.notes && order.notes.trim() ? order.notes : 'Not provided'}</p>
            </section>
          </div>

          <div className="admin-order-detail-commerce">
            <section className="admin-order-section">
              <h2>Ordered Products</h2>
              <p className="admin-order-detail-note">Unit prices are the amounts saved on the order.</p>
              <div className="admin-orders-table-wrap">
                <table className="admin-order-items">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Quantity</th>
                      <th>Saved unit price</th>
                      <th>Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td data-label="Product">
                          <button type="button" className="admin-order-product" onClick={() => setSelectedItem(item)}>
                            {item.product_name}
                          </button>
                        </td>
                        <td data-label="SKU">{item.product_sku || '—'}</td>
                        <td data-label="Quantity">{item.quantity}</td>
                        <td data-label="Saved unit price">{formatMoney(item.unit_price, 'INR')}</td>
                        <td data-label="Line total">{formatMoney(item.line_total, 'INR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="admin-order-section">
              <h2>Price Summary</h2>
              <div className="admin-order-summary">
                <p><span>Subtotal</span><strong>{formatMoney(order.subtotal, 'INR')}</strong></p>
                {tax !== null && tax > 0 ? <p><span>Tax</span><strong>{formatMoney(order.tax_amount, 'INR')}</strong></p> : null}
                {shipping !== null && shipping > 0 ? <p><span>Shipping</span><strong>{formatMoney(order.shipping_charge, 'INR')}</strong></p> : null}
                <p className="is-grand"><span>Grand total</span><strong>{formatMoney(order.total_amount, 'INR')}</strong></p>
              </div>
              {tax === 0 && shipping === 0 ? <p className="admin-order-detail-note">Tax and shipping were not charged on this order.</p> : null}
            </section>
          </div>

          <section className="admin-order-section admin-order-progress">
            <div>
              <h2>Order Timeline</h2>
              <p className="admin-order-detail-note">Earlier status times are not stored.</p>
              <OrderTimeline order={order} />
            </div>
            <div>
              <h2>Update Status</h2>
              {transitions.length > 0 ? (
                <div className="admin-order-detail-actions">
                  {transitions.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={status === 'cancelled' ? 'is-danger' : 'is-primary'}
                      disabled={updating}
                      onClick={() => {
                        setStatusError('')
                        setNextStatus(status)
                      }}
                    >
                      {updating ? 'Updating' : status === 'cancelled' ? 'Cancel Order' : `Mark ${formatStatus(status)}`}
                    </button>
                  ))}
                </div>
              ) : (
                <p>This order cannot move to another status.</p>
              )}
            </div>
          </section>
        </>
      ) : null}
      {selectedItem ? (
        <AdminOrderProductModal key={selectedItem.id} item={selectedItem} onClose={() => setSelectedItem(null)} />
      ) : null}
      <OrderStatusDialog
        orderNumber={order ? order.order_number : ''}
        status={nextStatus}
        busy={updating}
        error={statusError}
        onCancel={closeStatus}
        onConfirm={confirmStatus}
      />
    </div>
  )
}
