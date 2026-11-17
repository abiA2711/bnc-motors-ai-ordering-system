import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { createOrder } from '../api/orders.js'
import { useCart } from '../cart/CartContext.jsx'
import { countryIso, formatAddressLines, toAddress, validateAddress } from '../checkout/address.js'
import CheckoutSteps from '../checkout/CheckoutSteps.jsx'
import { clearDraft, draftIsReady, readDraft, rememberConfirmation } from '../checkout/draft.js'
import { paymentMethodDetail, paymentMethodTitle } from '../orders/payment.js'
import { CartIcon } from '../components/auth/icons.jsx'
import ProductImage from '../components/products/ProductImage.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import { useToast } from '../components/ui/ToastProvider.jsx'
import { getCountries } from '../location/geography.js'
import { formatMoney, lineAmount } from '../utils/format.js'
import { stockProblem } from '../utils/stock.js'
import '../styles/checkout.css'

export default function ReviewOrder() {
  const draft = readDraft()
  const ready = draftIsReady(draft)
  const { items, itemCount, subtotal, clearCart, refreshStock } = useCart()
  const navigate = useNavigate()
  const toast = useToast()
  const submitting = useRef(false)
  const refreshStockRef = useRef(refreshStock)
  const [checkingStock, setCheckingStock] = useState(true)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    refreshStockRef.current = refreshStock
  }, [refreshStock])

  useEffect(() => {
    if (!ready) {
      return undefined
    }

    let active = true

    refreshStockRef.current()
      .then((notices) => {
        if (active && notices.length > 0) {
          setError(notices.join(' '))
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError instanceof ApiError ? requestError.message : 'Stock could not be checked')
        }
      })
      .finally(() => {
        if (active) {
          setCheckingStock(false)
        }
      })

    return () => {
      active = false
    }
  }, [ready])

  if (leaving) {
    return null
  }

  if (!ready) {
    return <Navigate to="/checkout" replace />
  }

  if (items.length === 0) {
    return <Navigate to="/cart" replace />
  }

  const problems = items.map(stockProblem).filter(Boolean)
  const currency = items[0] ? items[0].currency || 'INR' : 'INR'
  const countries = getCountries()
  const shippingErrors = validateAddress(draft.shipping, countryIso(countries, draft.shipping.country))
  const billingErrors = draft.sameBilling ? {} : validateAddress(draft.billing, countryIso(countries, draft.billing.country))
  const detailsValid = Object.keys(shippingErrors).length === 0 && Object.keys(billingErrors).length === 0

  const confirm = async (event) => {
    event.preventDefault()

    if (submitting.current || busy || !detailsValid || problems.length > 0) {
      return
    }

    submitting.current = true
    setBusy(true)
    setError('')

    try {
      const notices = await refreshStock()

      if (notices.length > 0) {
        const message = notices.join(' ')
        setError(message)
        toast.error(message, 'checkout-stock')
        submitting.current = false
        setBusy(false)
        return
      }

      const currentDraft = readDraft()
      if (!draftIsReady(currentDraft)) {
        navigate('/checkout')
        return
      }

      const shippingAddress = toAddress(currentDraft.shipping)
      const order = await createOrder({
        items: items.map((item) => ({
          product_id: item.id,
          quantity: item.quantity,
        })),
        shipping_address: shippingAddress,
        billing_address: currentDraft.sameBilling ? shippingAddress : toAddress(currentDraft.billing),
        notes: currentDraft.notes.trim(),
        payment_method: currentDraft.paymentMethod,
      })
      setLeaving(true)
      clearCart()
      clearDraft()
      rememberConfirmation(order.id)
      toast.success(`Order ${order.order_number} placed`, 'checkout')
      navigate(`/orders/${order.id}?confirmed=1`, { replace: true })
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : 'The order could not be placed'
      setError(message)
      toast.error(message, 'checkout')
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <form className="checkout-page" onSubmit={confirm}>
      <div className="checkout-heading">
        <span className="checkout-heading-icon"><CartIcon /></span>
        <div>
          <h1>Checkout</h1>
          <p>Review your delivery details and confirm your order.</p>
        </div>
        <CheckoutSteps current={2} />
      </div>

      <div className="checkout-layout">
        <div className="checkout-main">
          <section className="checkout-card">
            <div className="checkout-review-head">
              <div>
                <h2>Review Order</h2>
                <p>Please review your details and items before placing your order.</p>
              </div>
            </div>
          </section>

          <ReviewBlock title="Shipping Address" icon={<PinIcon />} editTo="/checkout#shipping">
            <AddressCopy address={draft.shipping} />
          </ReviewBlock>

          <ReviewBlock title="Billing Address" icon={<CardIcon />} editTo="/checkout#billing">
            {draft.sameBilling ? <p>Same as shipping address</p> : <AddressCopy address={draft.billing} />}
          </ReviewBlock>

          <ReviewBlock title="Payment Method" icon={<WalletIcon />} editTo="/checkout#payment">
            <p><strong>{paymentMethodTitle(draft.paymentMethod)}</strong></p>
            <p>{paymentMethodDetail(draft.paymentMethod)}</p>
          </ReviewBlock>

          <ReviewBlock title="Order Notes" icon={<NoteIcon />} editTo="/checkout#notes">
            <p>{draft.notes.trim() ? draft.notes.trim() : 'No special instructions'}</p>
          </ReviewBlock>

          <Link className="checkout-back" to="/checkout">‹ Back to Edit Details</Link>
        </div>

        <aside className="checkout-card checkout-summary" aria-label="Order summary">
          <h2><BoxIcon />Order Summary ({items.length} {items.length === 1 ? 'Item' : 'Items'})</h2>
          <ul className="checkout-lines">
            {items.map((item) => {
              const line = lineAmount(item.price, item.quantity)
              return (
                <li key={item.id}>
                  <span className="checkout-thumb"><ProductImage product={item} /></span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>SKU: {item.sku}</small>
                    <small>Qty: {item.quantity}</small>
                    <small>Unit price: {formatMoney(item.price, item.currency || 'INR')}</small>
                  </span>
                  <b>{line ? formatMoney(line, item.currency || 'INR') : 'Price unavailable'}</b>
                </li>
              )
            })}
          </ul>
          <div className="checkout-total-row">
            <span>Items ({itemCount.toLocaleString('en-IN')})</span>
            <strong>{formatMoney(subtotal, currency)}</strong>
          </div>
          <div className="checkout-total-row">
            <span>Subtotal</span>
            <strong>{formatMoney(subtotal, currency)}</strong>
          </div>
          <div className="checkout-grand">
            <span>Grand Total</span>
            <strong>{formatMoney(subtotal, currency)}</strong>
          </div>
          <ErrorMessage message={error || problems.join(' ')} />
          <button type="submit" className="checkout-submit" disabled={busy || checkingStock || problems.length > 0 || !detailsValid}>
            <CartIcon />
            {busy ? 'Confirming order' : checkingStock ? 'Checking stock' : 'Confirm Order'}
          </button>
        </aside>
      </div>
    </form>
  )
}

function ReviewBlock({ title, icon, editTo, children }) {
  return (
    <section className="checkout-card">
      <div className="checkout-review-head">
        <h2>{icon}{title}</h2>
        <Link to={editTo}>Edit</Link>
      </div>
      {children}
    </section>
  )
}

function AddressCopy({ address }) {
  return (
    <div className="checkout-address">
      {formatAddressLines(address).map((line) => <p key={line}>{line}</p>)}
    </div>
  )
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" />
      <circle cx="12" cy="11" r="2" />
    </svg>
  )
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
    </svg>
  )
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3.5h7l4 4V20.5H7z" />
      <path d="M14 3.5V8h4M9 12h6M9 16h4" />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" />
      <path d="M4 7.5 6.5 4.5H16" />
      <path d="M16 13h4" />
    </svg>
  )
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8l9-4 9 4-9 4-9-4z" />
      <path d="M3 8v8l9 4 9-4V8" />
      <path d="M12 12v8" />
    </svg>
  )
}
