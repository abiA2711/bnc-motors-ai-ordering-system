import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { getOrder } from '../api/orders.js'
import { formatAddressLines } from '../checkout/address.js'
import CheckoutSteps from '../checkout/CheckoutSteps.jsx'
import { clearConfirmation, confirmationFor } from '../checkout/draft.js'
import { CartIcon } from '../components/auth/icons.jsx'
import { OrdersIcon } from '../components/layout/sidebarIcons.jsx'
import CatalogueProductName from '../components/products/CatalogueProductName.jsx'
import ProductDetailsModal from '../components/products/ProductDetailsModal.jsx'
import ProductImage from '../components/products/ProductImage.jsx'
import Button from '../components/ui/Button.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import Loading from '../components/ui/Loading.jsx'
import { paymentMethodLabel, paymentStatusKey, paymentStatusLabel } from '../orders/payment.js'
import { ORDER_STATUSES } from '../orders/status.js'
import { formatMoney, formatStatus } from '../utils/format.js'
import '../styles/checkout.css'
import '../styles/orders.css'

const formatOrderDate = (value) => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const amountOf = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const FLOW = ORDER_STATUSES.filter((status) => status !== 'cancelled')

function StatusBadge({ status }) {
  const known = ORDER_STATUSES.includes(status)
  return <span className={known ? `order-badge is-${status}` : 'order-badge'}>{formatStatus(status)}</span>
}

function StatusTimeline({ status }) {
  const currentIndex = FLOW.indexOf(status)
  const cancelled = status === 'cancelled'

  return (
    <section aria-label="Order progress">
      <ol className="order-track">
        {FLOW.map((step, index) => {
          const state = cancelled || currentIndex < 0
            ? 'upcoming'
            : index < currentIndex
              ? 'complete'
              : index === currentIndex
                ? 'current'
                : 'upcoming'
          return (
            <li key={step} className={`is-${state}`}>
              <span>{state === 'complete' ? '✓' : index + 1}</span>
              <strong>{formatStatus(step)}</strong>
            </li>
          )
        })}
        {cancelled ? (
          <li className="is-current is-cancelled">
            <span>!</span>
            <strong>Cancelled</strong>
          </li>
        ) : null}
      </ol>
      {cancelled ? <p className="order-track-note">This order is cancelled. It has not been shipped or delivered.</p> : null}
    </section>
  )
}

const addressText = (value) => (typeof value === 'string' ? value.trim() : '')

const readAddress = (address) => {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    return null
  }

  const fields = {
    name: addressText(address.full_name),
    phone: addressText(address.phone),
    line1: addressText(address.line1),
    line2: addressText(address.line2),
    city: addressText(address.city),
    state: addressText(address.state),
    postal: addressText(address.postal_code),
    country: addressText(address.country),
  }
  const cityState = [fields.city, fields.state].filter(Boolean).join(', ')
  fields.locality = [cityState, fields.postal].filter(Boolean).join(' - ')
  const visible = [fields.name, fields.phone, fields.line1, fields.line2, fields.locality, fields.country].some(Boolean)

  return visible ? fields : null
}

const sameSavedAddress = (left, right) => {
  if (!left || !right) {
    return false
  }

  return ['name', 'phone', 'line1', 'line2', 'city', 'state', 'postal', 'country']
    .every((key) => left[key] === right[key])
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  )
}

function PhoneLineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4.5h2.2l1.2 3-1.6 1.1a12 12 0 0 0 5.6 5.6l1.1-1.6 3 1.2V16a2 2 0 0 1-2.2 2A14.5 14.5 0 0 1 6 6.7 2 2 0 0 1 8 4.5z" />
    </svg>
  )
}

function StreetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20.5h16" />
      <path d="M6.5 20.5V9.5L12 5.5l5.5 4V20.5" />
      <path d="M10 20.5v-4.5h4v4.5" />
    </svg>
  )
}

function BillingIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="M3.5 10h17" />
    </svg>
  )
}

function AddressCard({ title, icon, fields, sameAsShipping = false }) {
  return (
    <section className="order-address-card">
      <header>
        <span className="order-address-icon" aria-hidden="true">{icon}</span>
        <div>
          <h2>{title}</h2>
          {sameAsShipping ? <p className="order-address-same">Same as shipping address</p> : null}
        </div>
      </header>
      <div className="order-address-body">
        {fields.name ? <strong>{fields.name}</strong> : null}
        {fields.phone ? <p><PhoneLineIcon />{fields.phone}</p> : null}
        {fields.line1 ? <p><StreetIcon />{fields.line1}</p> : null}
        {fields.line2 ? (
          fields.line1 ? <p className="order-address-extra">{fields.line2}</p> : <p><StreetIcon />{fields.line2}</p>
        ) : null}
        {fields.locality ? <p className="order-address-follow">{fields.locality}</p> : null}
        {fields.country ? <p className="order-address-follow">{fields.country}</p> : null}
      </div>
    </section>
  )
}

export default function OrderDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const ordersHome = user && user.role === 'admin' ? '/admin/orders' : '/orders'
  const location = useLocation()
  const navigate = useNavigate()
  const confirmedVisit = new URLSearchParams(location.search).get('confirmed') === '1'
  const [order, setOrder] = useState(null)
  const [loadedId, setLoadedId] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [catalogueProduct, setCatalogueProduct] = useState(null)

  useEffect(() => {
    let active = true

    getOrder(id)
      .then((nextOrder) => {
        if (!active) {
          return
        }

        setOrder(nextOrder)
        setError('')
        setLoadedId(id)
      })
      .catch((requestError) => {
        if (!active) {
          return
        }

        setOrder(null)
        setError(requestError instanceof ApiError ? requestError.message : requestError.message)
        setLoadedId(id)
      })

    return () => {
      active = false
    }
  }, [id, attempt])

  const loading = loadedId !== id
  const items = order && Array.isArray(order.items) ? order.items : []
  const showConfirmation = Boolean(order) && confirmedVisit && confirmationFor(order.id)
  const quantity = items.reduce((total, item) => total + (Number(item.quantity) || 0), 0)
  const notes = order && typeof order.notes === 'string' ? order.notes.trim() : ''
  const shipping = order ? readAddress(order.shipping_address) : null
  const billing = order ? readAddress(order.billing_address) : null
  const billingMatchesShipping = sameSavedAddress(shipping, billing)

  const viewDetails = () => {
    clearConfirmation()
    navigate(`/orders/${order.id}`, { replace: true })
  }

  const openCatalogueProduct = (item) => {
    const paid = formatMoney(item.unit_price, 'INR')
    setCatalogueProduct({
      id: item.product_id,
      orderPrice: paid === 'Price unavailable' ? '' : paid,
    })
  }

  const catalogueModal = (
    <ProductDetailsModal
      productId={catalogueProduct ? catalogueProduct.id : null}
      orderPriceLabel={catalogueProduct ? catalogueProduct.orderPrice : ''}
      onClose={() => setCatalogueProduct(null)}
    />
  )

  if (showConfirmation) {
    return (
      <>
      <div className="checkout-page">
        <div className="checkout-heading">
          <span className="checkout-heading-icon"><CartIcon /></span>
          <div>
            <h1>Checkout</h1>
            <p>Review your delivery details and confirm your order.</p>
          </div>
          <CheckoutSteps current={3} />
        </div>
        <Confirmation order={order} items={items} onViewDetails={viewDetails} onOpenProduct={openCatalogueProduct} />
      </div>
      {catalogueModal}
      </>
    )
  }

  return (
    <>
    <div className="order-detail-page">
      <Link className="order-back" to={ordersHome}>‹ Back to My Orders</Link>
      {loading ? <Loading label="Loading order" /> : null}
      {!loading && error ? (
        <section className="order-card">
          <h1>Order unavailable</h1>
          <ErrorMessage message={error} />
          <Button onClick={() => {
            setError('')
            setLoadedId(null)
            setAttempt((current) => current + 1)
          }}
          >
            Try again
          </Button>
        </section>
      ) : null}
      {!loading && !error && order ? (
        <>
          <header className="order-detail-heading">
            <span className="order-detail-heading-icon" aria-hidden="true"><OrdersIcon /></span>
            <div>
              <h1>Order Details</h1>
              <p>View complete information about your order.</p>
            </div>
          </header>
          <div className="order-meta">
            <article>
              <span>Order Number</span>
              <strong>{order.order_number}</strong>
            </article>
            <article>
              <span>Order Date</span>
              <strong>{formatOrderDate(order.created_at) || 'Not available'}</strong>
            </article>
            <article>
              <span>Order Status</span>
              <StatusBadge status={order.status} />
            </article>
          </div>
          <StatusTimeline status={order.status} />
          <div className="order-detail-layout">
            <div className="order-main">
              <section className="order-card">
                <h2>Order Items ({items.length.toLocaleString('en-IN')})</h2>
                <ul className="order-lines">
                  {items.map((item) => (
                    <li key={item.id}>
                      <span className="order-thumb">
                        <ProductImage product={{ name: item.product_name, sku: item.product_sku, image_url: null }} />
                      </span>
                      <span>
                        <CatalogueProductName productId={item.product_id} onOpen={() => openCatalogueProduct(item)}>
                          {item.product_name}
                        </CatalogueProductName>
                        <small>SKU: {item.product_sku}</small>
                        <small>Qty: {item.quantity}</small>
                      </span>
                      <em>{formatMoney(item.unit_price, 'INR')}</em>
                      <b>{formatMoney(item.line_total, 'INR')}</b>
                    </li>
                  ))}
                </ul>
              </section>
              {notes ? (
                <section className="order-card">
                  <h2>Order Notes</h2>
                  <p className="order-notes">{notes}</p>
                </section>
              ) : null}
            </div>
            <aside className="order-aside">
              <section className="order-side">
                <h2>Payment Information</h2>
                <div className="order-payment">
                  <p>
                    <span>Payment Method</span>
                    <strong className="payment-pill is-method">{paymentMethodLabel(order.payment_method)}</strong>
                  </p>
                  <p>
                    <span>Payment Status</span>
                    <strong className={`payment-pill is-${paymentStatusKey(order.payment_status)}`}>{paymentStatusLabel(order.payment_status)}</strong>
                  </p>
                </div>
              </section>
              <section className="order-side">
                <h2>Price Summary</h2>
                <div className="order-money">
                  <p><span>Items ({quantity.toLocaleString('en-IN')})</span><strong>{formatMoney(order.subtotal, 'INR')}</strong></p>
                  <p><span>Subtotal</span><strong>{formatMoney(order.subtotal, 'INR')}</strong></p>
                  <p><span>Tax</span><strong>{formatMoney(order.tax_amount, 'INR')}</strong></p>
                  <p><span>Shipping</span><strong>{formatMoney(order.shipping_charge, 'INR')}</strong></p>
                  <div className="order-grand">
                    <span>Grand Total</span>
                    <strong>{formatMoney(order.total_amount, 'INR')}</strong>
                  </div>
                </div>
              </section>
            </aside>
          </div>
          {shipping || billing ? (
            <div className="order-addresses">
              {shipping ? <AddressCard title="Shipping Address" icon={<PinIcon />} fields={shipping} /> : null}
              {billing ? (
                <AddressCard
                  title="Billing Address"
                  icon={<BillingIcon />}
                  fields={billing}
                  sameAsShipping={billingMatchesShipping}
                />
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
    {catalogueModal}
    </>
  )
}

function Confirmation({ order, items, onViewDetails, onOpenProduct }) {
  const quantity = items.reduce((total, item) => total + (Number(item.quantity) || 0), 0)
  const address = formatAddressLines(order.shipping_address)

  return (
    <div className="checkout-layout">
      <section className="checkout-card checkout-success">
        <span className="checkout-success-icon" aria-hidden="true">✓</span>
        <h2>Order Placed Successfully!</h2>
        <p>Thank you for your order. Your order has been created successfully.</p>
        <div className="checkout-order-number">
          <span>Order Number</span>
          <strong>{order.order_number}</strong>
        </div>
        <div className="checkout-order-meta">
          <p><span>Order Date</span><strong>{formatOrderDate(order.created_at)}</strong></p>
          <p><span>Order Status</span><strong className="checkout-status">{formatStatus(order.status)}</strong></p>
          <p><span>Payment Method</span><strong>{paymentMethodLabel(order.payment_method)}</strong></p>
          <p><span>Payment Status</span><strong className={`payment-pill is-${paymentStatusKey(order.payment_status)}`}>{paymentStatusLabel(order.payment_status)}</strong></p>
        </div>
        {address.length > 0 ? (
          <div className="checkout-address">
            <h3>Shipping address</h3>
            {address.map((line) => <p key={line}>{line}</p>)}
          </div>
        ) : null}
        <div className="checkout-success-actions">
          <button type="button" className="checkout-back" onClick={onViewDetails}>View Order Details</button>
          <Link className="checkout-submit" to="/products">Continue Shopping</Link>
        </div>
      </section>
      <aside className="checkout-card checkout-summary" aria-label="Order summary">
        <h2>Order Summary ({items.length} {items.length === 1 ? 'Item' : 'Items'})</h2>
        <ul className="checkout-lines">
          {items.map((item) => (
            <li key={item.id}>
              <span className="checkout-thumb">
                <ProductImage product={{ name: item.product_name, sku: item.product_sku, image_url: null }} />
              </span>
              <span>
                <CatalogueProductName productId={item.product_id} onOpen={() => onOpenProduct(item)}>
                  {item.product_name}
                </CatalogueProductName>
                <small>SKU: {item.product_sku}</small>
                <small>Qty: {item.quantity}</small>
              </span>
              <b>{formatMoney(item.line_total, 'INR')}</b>
            </li>
          ))}
        </ul>
        <div className="checkout-total-row">
          <span>Items ({quantity.toLocaleString('en-IN')})</span>
          <strong>{formatMoney(order.subtotal, 'INR')}</strong>
        </div>
        <div className="checkout-total-row">
          <span>Subtotal</span>
          <strong>{formatMoney(order.subtotal, 'INR')}</strong>
        </div>
        {amountOf(order.tax_amount) > 0 ? (
          <div className="checkout-total-row">
            <span>Tax</span>
            <strong>{formatMoney(order.tax_amount, 'INR')}</strong>
          </div>
        ) : null}
        {amountOf(order.shipping_charge) > 0 ? (
          <div className="checkout-total-row">
            <span>Shipping</span>
            <strong>{formatMoney(order.shipping_charge, 'INR')}</strong>
          </div>
        ) : null}
        <div className="checkout-grand">
          <span>Grand Total</span>
          <strong>{formatMoney(order.total_amount, 'INR')}</strong>
        </div>
      </aside>
    </div>
  )
}
