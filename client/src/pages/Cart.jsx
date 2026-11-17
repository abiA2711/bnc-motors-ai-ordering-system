import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { useCart } from '../cart/CartContext.jsx'
import { CartIcon } from '../components/auth/icons.jsx'
import ProductImage from '../components/products/ProductImage.jsx'
import StockBadge from '../components/products/StockBadge.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import { useToast } from '../components/ui/ToastProvider.jsx'
import { formatMoney, lineAmount } from '../utils/format.js'
import { readStockQuantity, stockProblem } from '../utils/stock.js'
import '../styles/cart.css'

const textOf = (value) => (typeof value === 'string' ? value.trim() : '')

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" />
    </svg>
  )
}

function SummaryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3.5h7l4 4V20.5H7z" />
      <path d="M14 3.5V8h4M9 12h6M9 16h6" />
    </svg>
  )
}

function EmptyCartArt() {
  return (
    <svg className="cart-empty-drawing" viewBox="0 0 96 96" aria-hidden="true">
      <path d="M20 30h8.2l2.4 7" />
      <path d="M32 38.5h39.5L66 58.5H38.2L32 38.5z" />
      <circle cx="54" cy="48" r="8.5" />
      <circle cx="54" cy="48" r="3" />
      <path d="M54 40.2v2.1M54 53.7v2.1M46.2 48h2.1M59.7 48h2.1" />
      <circle cx="43" cy="68" r="4.2" />
      <circle cx="64" cy="68" r="4.2" />
      <circle cx="43" cy="68" r="1.5" />
      <circle cx="64" cy="68" r="1.5" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" />
    </svg>
  )
}

function DiscIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7.2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 5.4v2M12 16.6v2M5.4 12h2M16.6 12h2" />
    </svg>
  )
}

function PackageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7.5 12 4l8 3.5L12 11z" />
      <path d="M4 7.5V16L12 20l8-4V7.5" />
      <path d="M12 11v9" />
    </svg>
  )
}

function BrowseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="m15.5 15.5 4 4" />
    </svg>
  )
}

function StockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 16.5V8.2L12 5l7 3.2v8.3L12 19.5z" />
      <path d="M12 5v14.5M5 8.2l7 3.3 7-3.3" />
    </svg>
  )
}

function TrackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.5h8.5L19 8v11.5H7z" />
      <path d="M15.5 4.5V8H19M9.2 12h5.6M9.2 15.5h5.6" />
    </svg>
  )
}

export default function Cart() {
  const { items, itemCount, subtotal, setQuantity, removeItem, clearCart, refreshStock } = useCart()
  const toast = useToast()
  const confirmRef = useRef(null)
  const refreshStockRef = useRef(refreshStock)
  const [stockNotice, setStockNotice] = useState('')
  const [stockError, setStockError] = useState('')
  const [checked, setChecked] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const currency = items[0]?.currency || 'INR'
  const problems = items.map(stockProblem).filter(Boolean)
  const canCheckout = checked && !stockError && problems.length === 0

  useEffect(() => {
    refreshStockRef.current = refreshStock
  }, [refreshStock])

  useEffect(() => {
    let active = true

    refreshStockRef.current()
      .then((notices) => {
        if (!active) {
          return
        }
        setStockNotice(notices.join(' '))
        setStockError('')
        setChecked(true)
      })
      .catch((error) => {
        if (!active) {
          return
        }
        setStockError(error instanceof ApiError ? error.message : 'Stock could not be checked')
        setChecked(true)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const dialog = confirmRef.current
    if (!confirmClear || !dialog) {
      return undefined
    }

    if (!dialog.open) {
      dialog.showModal()
    }

    return () => {
      if (dialog.open) {
        dialog.close()
      }
    }
  }, [confirmClear])

  const changeQuantity = (item, delta) => {
    if (item.is_active === false || readStockQuantity(item) < 1) {
      return
    }
    setQuantity(item.id, (current) => current + delta)
  }

  const remove = (item) => {
    removeItem(item.id)
    toast.success(`${item.name} removed from cart`, `cart-remove:${item.id}`)
  }

  const clear = () => {
    clearCart()
    setConfirmClear(false)
    toast.success('Cart cleared', 'cart-clear')
  }

  return (
    <div className="cart-page">
      <header className="cart-heading">
        <span className="cart-heading-icon" aria-hidden="true"><CartIcon /></span>
        <div>
          <h1>Shopping Cart</h1>
          <p>Review your selected items before proceeding to checkout.</p>
        </div>
      </header>

      {items.length === 0 ? (
        <section className="cart-empty" aria-labelledby="cart-empty-heading">
          <div className="cart-empty-art" aria-hidden="true">
            <span className="cart-empty-badge cart-empty-gear"><GearIcon /></span>
            <span className="cart-empty-badge cart-empty-disc"><DiscIcon /></span>
            <span className="cart-empty-badge cart-empty-package"><PackageIcon /></span>
            <span className="cart-empty-halo"><EmptyCartArt /></span>
          </div>
          <h2 id="cart-empty-heading">Your Cart Is Waiting for Something Great!</h2>
          <p>Looks like you haven't added any spare parts yet. Explore our catalogue and find the right components for your vehicle.</p>
          <Link className="cart-empty-action" to="/products">
            <BrowseIcon />
            Explore Spare Parts
          </Link>
          <Link className="cart-empty-more" to="/products">Continue browsing our product catalogue</Link>
          <ul className="cart-empty-points">
            <li>
              <PackageIcon />
              <strong>Wide Range of Spare Parts</strong>
              <small>Browse the live product catalogue.</small>
            </li>
            <li>
              <StockIcon />
              <strong>Live Stock Availability</strong>
              <small>Each part shows its current stock.</small>
            </li>
            <li>
              <TrackIcon />
              <strong>Easy Order Tracking</strong>
              <small>Placed orders remain in My Orders.</small>
            </li>
          </ul>
        </section>
      ) : (
        <div className="cart-layout">
          <section className="cart-items" aria-label="Cart items">
            <div className="cart-items-head">
              <h2>Cart Items ({items.length})</h2>
              <button type="button" className="cart-clear" onClick={() => setConfirmClear(true)}>
                <TrashIcon />
                Clear Cart
              </button>
            </div>
            <div className="cart-columns" aria-hidden="true">
              <span />
              <span />
              <span>Quantity</span>
              <span>Unit Price</span>
              <span>Total</span>
              <span />
            </div>
            <div className="cart-lines">
              {items.map((item) => {
                const stock = readStockQuantity(item)
                const problem = stockProblem(item)
                const blocked = item.is_active === false || stock === null || stock < 1
                const line = lineAmount(item.price, item.quantity)

                return (
                  <article className="cart-row" key={item.id}>
                    <Link className="cart-media" to={`/products/${item.id}`} aria-label={item.name}>
                      <ProductImage product={item} />
                    </Link>
                    <div className="cart-info">
                      <h3><Link to={`/products/${item.id}`}>{item.name}</Link></h3>
                      <p>SKU: {item.sku}</p>
                      {textOf(item.brand) || textOf(item.category) ? (
                        <div className="cart-facts">
                          {textOf(item.brand) ? <span>Brand: <b>{item.brand}</b></span> : null}
                          {textOf(item.category) ? <span>Category: <b>{item.category}</b></span> : null}
                        </div>
                      ) : null}
                      <p className="cart-availability">
                        <StockBadge product={item} />
                        {item.is_active === false ? <span className="cart-inactive">Inactive</span> : null}
                        {stock !== null ? <strong>{stock.toLocaleString('en-IN')} units available</strong> : null}
                      </p>
                      {problem ? <p className="cart-problem">{problem}</p> : null}
                    </div>
                    <div className="cart-qty">
                      <span className="cart-label">Quantity</span>
                      <div>
                        <button type="button" aria-label={`Decrease ${item.name}`} onClick={() => changeQuantity(item, -1)} disabled={blocked || item.quantity <= 1}>−</button>
                        <span>{item.quantity}</span>
                        <button type="button" aria-label={`Increase ${item.name}`} onClick={() => changeQuantity(item, 1)} disabled={blocked || stock === null || item.quantity >= stock}>+</button>
                      </div>
                    </div>
                    <div className="cart-money cart-unit">
                      <span className="cart-label">Unit Price</span>
                      <strong>{formatMoney(item.price, item.currency || 'INR')}</strong>
                    </div>
                    <div className="cart-money cart-line">
                      <span className="cart-label">Total</span>
                      <strong>{line ? formatMoney(line, item.currency || 'INR') : 'Price unavailable'}</strong>
                    </div>
                    <button type="button" className="cart-remove" aria-label={`Remove ${item.name}`} onClick={() => remove(item)}>
                      <TrashIcon />
                    </button>
                  </article>
                )
              })}
            </div>
            <div className="cart-items-foot">
              <Link className="cart-continue" to="/products">Continue Shopping</Link>
              <p>Total Items: <strong>{itemCount.toLocaleString('en-IN')}</strong></p>
            </div>
          </section>

          <aside className="cart-summary" aria-label="Order summary">
            <h2><span className="cart-summary-icon"><SummaryIcon /></span>Order Summary</h2>
            <div className="cart-summary-row">
              <span>Items ({itemCount.toLocaleString('en-IN')})</span>
              <strong>{formatMoney(subtotal, currency)}</strong>
            </div>
            <div className="cart-summary-row">
              <span>Subtotal</span>
              <strong>{formatMoney(subtotal, currency)}</strong>
            </div>
            <div className="cart-grand">
              <span>Grand Total</span>
              <strong>{formatMoney(subtotal, currency)}</strong>
            </div>
            <ErrorMessage message={stockError || stockNotice || problems.join(' ')} />
            {canCheckout ? (
              <Link className="cart-checkout" to="/checkout">
                <CartIcon />
                <span>Proceed to Checkout</span>
                <span className="cart-checkout-arrow" aria-hidden="true">›</span>
              </Link>
            ) : (
              <button type="button" className="cart-checkout" disabled>
                <CartIcon />
                <span>{checked ? 'Proceed to Checkout' : 'Checking stock'}</span>
                <span className="cart-checkout-arrow" aria-hidden="true">›</span>
              </button>
            )}
          </aside>
        </div>
      )}

      {confirmClear ? (
        <dialog
          ref={confirmRef}
          className="cart-confirm"
          aria-labelledby="clear-cart-title"
          onCancel={(event) => {
            event.preventDefault()
            setConfirmClear(false)
          }}
          onClick={(event) => {
            if (event.target === confirmRef.current) {
              setConfirmClear(false)
            }
          }}
        >
          <h2 id="clear-cart-title">Clear cart?</h2>
          <p>This removes every item from your cart. It does not place an order.</p>
          <div>
            <button type="button" onClick={() => setConfirmClear(false)}>Cancel</button>
            <button type="button" className="cart-clear" onClick={clear}>Clear Cart</button>
          </div>
        </dialog>
      ) : null}
    </div>
  )
}
