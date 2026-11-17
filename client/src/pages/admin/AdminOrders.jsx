import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client.js'
import { listOrders } from '../../api/orders.js'
import { useToast } from '../../components/ui/ToastProvider.jsx'
import { ORDER_STATUSES } from '../../orders/status.js'
import { paymentMethodLabel, paymentStatusKey, paymentStatusLabel } from '../../orders/payment.js'
import { formatDate, formatMoney, formatStatus } from '../../utils/format.js'
import '../../styles/admin-orders.css'

const PAGE_SIZES = [10, 20, 50]
const SUMMARY = [
  { key: '', label: 'Total Orders', countKey: 'all' },
  { key: 'pending', label: 'Pending', countKey: 'pending' },
  { key: 'confirmed', label: 'Confirmed', countKey: 'confirmed' },
  { key: 'processing', label: 'Processing', countKey: 'processing' },
  { key: 'shipped', label: 'Shipped', countKey: 'shipped' },
  { key: 'delivered', label: 'Delivered', countKey: 'delivered' },
  { key: 'cancelled', label: 'Cancelled', countKey: 'cancelled' },
]

const SOURCE_SUMMARY = [
  { key: 'cart_checkout', label: 'Cart Checkout' },
  { key: 'purchase_order', label: 'Purchase Order' },
]

const sourceLabel = (source) => {
  if (source === 'purchase_order') {
    return 'Purchase Order'
  }

  if (source === 'cart_checkout') {
    return 'Cart Checkout'
  }

  return '—'
}

const customerLabel = (order) => {
  const customer = order.customer
  if (!customer) {
    return 'Unknown customer'
  }

  return customer.name || customer.email || 'Unknown customer'
}

const customerDetail = (order) => {
  const customer = order.customer
  if (!customer) {
    return 'Unknown customer'
  }

  return [customer.name, customer.email, customer.company_name].filter((part) => typeof part === 'string' && part.trim()).join(' · ')
}

const itemQuantity = (order) => {
  if (!Array.isArray(order.items)) {
    return null
  }

  return order.items.reduce((sum, item) => {
    const quantity = Number(item.quantity)
    return Number.isInteger(quantity) && quantity >= 0 ? sum + quantity : sum
  }, 0)
}

const pageWindow = (page, totalPages) => {
  const count = Math.min(5, totalPages)
  const start = Math.max(1, Math.min(page - 2, totalPages - count + 1))
  return Array.from({ length: count }, (_, index) => start + index)
}

function Icon({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </Icon>
  )
}

function EyeIcon() {
  return (
    <Icon>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </Icon>
  )
}

function RefreshIcon() {
  return (
    <Icon>
      <path d="M20 12a8 8 0 1 1-2.2-5.5" />
      <path d="M20 4v6h-6" />
    </Icon>
  )
}

function KpiIcon({ name }) {
  if (name === 'pending') {
    return <Icon><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></Icon>
  }
  if (name === 'confirmed') {
    return <Icon><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.2 2.2 4.8-5" /></Icon>
  }
  if (name === 'processing') {
    return <Icon><circle cx="12" cy="12" r="8" /><path d="M12 8v4" /></Icon>
  }
  if (name === 'shipped') {
    return <Icon><path d="M3 7h11v8H3z" /><path d="M14 10h4l3 3v2h-7" /><circle cx="7" cy="17" r="1.4" /><circle cx="17" cy="17" r="1.4" /></Icon>
  }
  if (name === 'delivered') {
    return <Icon><path d="M4 12.5 9 17l11-10" /></Icon>
  }
  if (name === 'cancelled') {
    return <Icon><circle cx="12" cy="12" r="8" /><path d="m9 9 6 6M15 9l-6 6" /></Icon>
  }
  if (name === 'cart_checkout') {
    return <Icon><circle cx="9" cy="19" r="1.2" /><circle cx="17" cy="19" r="1.2" /><path d="M4 5h2l2.2 9h9.2l1.8-6H8" /></Icon>
  }
  if (name === 'purchase_order') {
    return <Icon><path d="M7 3.5h7l4 4V20H7z" /><path d="M14 3.5V8h4" /><path d="M9.5 12h6M9.5 16h6" /></Icon>
  }
  return <Icon><path d="M5 6h14v12H5z" /><path d="M5 10h14" /></Icon>
}

export default function AdminOrders() {
  const toast = useToast()
  const [orders, setOrders] = useState([])
  const [counts, setCounts] = useState(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [source, setSource] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [tip, setTip] = useState(null)
  const searchTimer = useRef(null)
  const tipTimer = useRef(null)
  const filtered = Boolean(search || status || source || from || to)
  const fromRow = total === 0 ? 0 : (page - 1) * limit + 1
  const toRow = total === 0 ? 0 : fromRow + orders.length - 1

  useEffect(() => {
    let active = true

    listOrders({ page, limit, status, source, search, from, to })
      .then((result) => {
        if (!active) {
          return
        }

        if (result.totalPages > 0 && page > result.totalPages) {
          setPage(result.totalPages)
          return
        }

        setOrders(result.orders)
        setCounts(result.counts)
        setTotal(result.total)
        setTotalPages(result.totalPages)
        setError('')
        setLoading(false)
      })
      .catch((requestError) => {
        if (!active) {
          return
        }

        setOrders([])
        setCounts(null)
        setTotal(0)
        setTotalPages(0)
        const message = requestError instanceof ApiError ? requestError.message : requestError.message
        setError(message)
        toast.error(message, `order-list:${page}:${status}:${source}:${search}:${from}:${to}:${message}`)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [page, limit, status, source, search, from, to, attempt, toast])

  useEffect(() => () => {
    clearTimeout(searchTimer.current)
    clearTimeout(tipTimer.current)
  }, [])

  const hideTip = () => {
    clearTimeout(tipTimer.current)
    setTip(null)
  }

  const showTip = (event) => {
    const target = event.currentTarget
    const label = target.getAttribute('data-tooltip')
    const hoverCapable = window.matchMedia('(hover: hover)').matches

    if (!label || (event.type === 'mouseenter' && !hoverCapable) || (!hoverCapable && window.innerWidth <= 800)) {
      return
    }

    if (target.hasAttribute('data-tooltip-clip') && target.scrollWidth <= target.clientWidth + 1) {
      return
    }

    clearTimeout(tipTimer.current)
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280
    tipTimer.current = setTimeout(() => {
      if (!target.isConnected) {
        return
      }

      const rect = target.getBoundingClientRect()
      const width = Math.min(320, Math.ceil(label.length * 7.1) + 18)
      const center = rect.left + rect.width / 2
      const left = Math.max(8, Math.min(center - width / 2, window.innerWidth - width - 8))
      const above = rect.top >= 52
      setTip({ label, left, top: above ? rect.top - 8 : rect.bottom + 8, above, width })
    }, delay)
  }

  const applySearch = (value) => {
    const nextSearch = value.trim()
    clearTimeout(searchTimer.current)

    if (nextSearch === search && page === 1) {
      return
    }

    setLoading(true)
    setPage(1)
    setSearch(nextSearch)
  }

  const onSearchChange = (event) => {
    const value = event.target.value
    setSearchInput(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => applySearch(value), 300)
  }

  const changeFilter = (setter) => (event) => {
    const value = event.target.value

    if ((setter === setFrom && to && value && value > to) || (setter === setTo && from && value && from > value)) {
      setError('The start date cannot be after the end date')
      return
    }

    setError('')
    setLoading(true)
    setPage(1)
    setter(value)
  }

  const selectStatus = (value) => {
    setError('')

    if (value === status && page === 1) {
      return
    }

    setLoading(true)
    setPage(1)
    setStatus(value)
  }

  const selectSource = (value) => {
    setError('')

    if (value === source && page === 1) {
      return
    }

    setLoading(true)
    setPage(1)
    setSource(value)
  }

  const changeLimit = (event) => {
    setLoading(true)
    setPage(1)
    setLimit(Number(event.target.value))
  }

  const reset = () => {
    clearTimeout(searchTimer.current)
    const unchanged = search === '' && status === '' && source === '' && from === '' && to === '' && page === 1 && limit === 10 && searchInput === ''
    setSearchInput('')
    setSearch('')
    setStatus('')
    setSource('')
    setFrom('')
    setTo('')
    setPage(1)
    setLimit(10)
    setError('')

    if (unchanged) {
      return
    }

    setLoading(true)
  }

  const retry = () => {
    setError('')
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  const changePage = (nextPage) => {
    setLoading(true)
    setPage(nextPage)
  }

  return (
    <div className="admin-orders">
      <header className="admin-orders-head">
        <div>
          <h1>Orders Management</h1>
          <p>Monitor customer orders, track fulfilment and manage order status.</p>
        </div>
        <div className="admin-orders-actions">
          <button type="button" className="admin-orders-refresh" onClick={retry} disabled={loading}>
            <RefreshIcon />
            Refresh
          </button>
        </div>
      </header>

      {loading ? (
        <div className="admin-orders-kpis admin-orders-skeleton" aria-hidden="true">
          <div className="admin-orders-kpi-row">
            {SUMMARY.map((item) => <span key={item.label} />)}
          </div>
          <div className="admin-orders-kpi-row is-source">
            {SOURCE_SUMMARY.map((item) => <span key={item.label} />)}
          </div>
        </div>
      ) : null}

      {!loading && counts ? (
        <section className="admin-orders-kpis" aria-label="Order summary">
          <div className="admin-orders-kpi-row">
            {SUMMARY.map((item) => (
              <button
                key={item.label}
                type="button"
                className={status === item.key ? `is-selected is-${item.countKey}` : `is-${item.countKey}`}
                aria-pressed={status === item.key}
                onClick={() => selectStatus(item.key)}
              >
                <i className="admin-orders-kpi-icon" aria-hidden="true"><KpiIcon name={item.countKey} /></i>
                <span>
                  <small>{item.label}</small>
                  <strong>{counts[item.countKey].toLocaleString('en-IN')}</strong>
                </span>
              </button>
            ))}
          </div>
          {Number.isInteger(counts.cart_checkout) && Number.isInteger(counts.purchase_order) ? (
            <div className="admin-orders-kpi-row is-source">
              {SOURCE_SUMMARY.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={source === item.key ? `is-selected is-source is-${item.key}` : `is-source is-${item.key}`}
                  aria-pressed={source === item.key}
                  onClick={() => selectSource(source === item.key ? '' : item.key)}
                >
                  <i className="admin-orders-kpi-icon" aria-hidden="true"><KpiIcon name={item.key} /></i>
                  <span>
                    <small>{item.label}</small>
                    <strong>{counts[item.key].toLocaleString('en-IN')}</strong>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {!loading && counts && (!Number.isInteger(counts.cart_checkout) || !Number.isInteger(counts.purchase_order)) ? (
        <p className="admin-orders-note">Order source counts are unavailable.</p>
      ) : null}

      {!loading && !error && !counts ? (
        <p className="admin-orders-note">Order counts are unavailable.</p>
      ) : null}

      <section className="admin-orders-panel">
        <form
          className="admin-orders-tools"
          onSubmit={(event) => {
            event.preventDefault()
            applySearch(searchInput)
          }}
        >
          <label className="admin-orders-search">
            <SearchIcon />
            <span className="admin-orders-sr">Search orders</span>
            <input
              type="search"
              value={searchInput}
              onChange={onSearchChange}
              placeholder="Order number, name, email, or company"
            />
          </label>
          <label>
            <span className="admin-orders-sr">Status</span>
            <select value={status} onChange={changeFilter(setStatus)} aria-label="Status">
              <option value="">All statuses</option>
              {ORDER_STATUSES.map((item) => (
                <option key={item} value={item}>{formatStatus(item)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="admin-orders-sr">Order source</span>
            <select value={source} onChange={changeFilter(setSource)} aria-label="Order source">
              <option value="">All sources</option>
              <option value="cart_checkout">Cart Checkout</option>
              <option value="purchase_order">Purchase Order</option>
            </select>
          </label>
          <label>
            <span className="admin-orders-sr">From date</span>
            <input type="date" value={from} onChange={changeFilter(setFrom)} aria-label="From date" />
          </label>
          <label>
            <span className="admin-orders-sr">To date</span>
            <input type="date" value={to} onChange={changeFilter(setTo)} aria-label="To date" />
          </label>
          <button type="button" className="admin-orders-reset" onClick={reset}>Reset filters</button>
        </form>

        {loading ? (
          <div className="admin-orders-skeleton" aria-label="Loading orders">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {!loading && error ? (
          <div className="admin-orders-state">
            <h2>Orders could not be loaded</h2>
            <p>{error}</p>
            <button type="button" onClick={retry}>Try again</button>
          </div>
        ) : null}

        {!loading && !error && orders.length === 0 ? (
          <div className="admin-orders-state">
            <h2>{filtered ? 'No orders found' : 'No orders yet'}</h2>
            <p>
              {filtered
                ? 'No orders match this search, status, or date range.'
                : 'Customer orders will appear here after they are placed.'}
            </p>
          </div>
        ) : null}

        {!loading && !error && orders.length > 0 ? (
          <div className="admin-orders-table-wrap">
            <table className="admin-orders-table">
              <thead>
                <tr>
                  <th>S.No.</th>
                  <th>Order Number</th>
                  <th>Customer</th>
                  <th>Order Date</th>
                  <th>Total Items</th>
                  <th>Total Amount</th>
                  <th>Order Source</th>
                  <th>Order Status</th>
                  <th>Payment Method</th>
                  <th>Payment Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order, index) => {
                  const customer = order.customer
                  const quantity = itemQuantity(order)

                  return (
                    <tr key={order.id}>
                      <td data-label="S.No.">{(page - 1) * limit + index + 1}</td>
                      <td data-label="Order Number">
                        <Link className="admin-orders-number" to={`/admin/orders/${order.id}`}>{order.order_number}</Link>
                      </td>
                      <td data-label="Customer">
                        <div
                          className="admin-orders-customer"
                          data-tooltip={customerDetail(order)}
                          onMouseEnter={showTip}
                          onMouseLeave={hideTip}
                          onFocus={showTip}
                          onBlur={hideTip}
                          tabIndex={0}
                        >
                          <strong>{customerLabel(order)}</strong>
                          {customer && customer.email ? <small>{customer.email}</small> : null}
                        </div>
                      </td>
                      <td data-label="Order Date">{formatDate(order.created_at) || 'Not available'}</td>
                      <td data-label="Total Items">{quantity === null ? '—' : quantity.toLocaleString('en-IN')}</td>
                      <td data-label="Total Amount">{formatMoney(order.total_amount, 'INR')}</td>
                      <td data-label="Order Source">
                        <div
                          className="admin-order-source-meta"
                          data-tooltip={order.purchase_order && order.purchase_order.po_number ? order.purchase_order.po_number : undefined}
                          onMouseEnter={showTip}
                          onMouseLeave={hideTip}
                          onFocus={showTip}
                          onBlur={hideTip}
                          tabIndex={order.purchase_order ? 0 : undefined}
                        >
                          <span className={`admin-order-source is-${order.source || 'unknown'}`}>{sourceLabel(order.source)}</span>
                          {order.purchase_order && order.purchase_order.po_number ? <small>{order.purchase_order.po_number}</small> : null}
                        </div>
                      </td>
                      <td data-label="Order Status">
                        <span className={`admin-order-badge is-${order.status}`}>{formatStatus(order.status)}</span>
                      </td>
                      <td data-label="Payment Method">{paymentMethodLabel(order.payment_method)}</td>
                      <td data-label="Payment Status">
                        <span className={`payment-pill is-${paymentStatusKey(order.payment_status)}`}>{paymentStatusLabel(order.payment_status)}</span>
                      </td>
                      <td data-label="Actions">
                        <div className="admin-orders-row-actions">
                          <Link
                            to={`/admin/orders/${order.id}`}
                            aria-label={`View details for ${order.order_number}`}
                            data-tooltip="View details"
                            onMouseEnter={showTip}
                            onMouseLeave={hideTip}
                            onFocus={showTip}
                            onBlur={hideTip}
                          >
                            <EyeIcon />
                            <span className="admin-orders-action-label">Details</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error && totalPages > 0 ? (
          <div className="admin-orders-pager">
            <p>Showing {fromRow}–{toRow} of {total.toLocaleString('en-IN')} orders</p>
            <div>
              <label>
                Rows per page
                <select value={limit} onChange={changeLimit} aria-label="Rows per page">
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
              <nav aria-label="Order pages">
                <button type="button" onClick={() => changePage(page - 1)} disabled={page <= 1}>Previous</button>
                {pageWindow(page, totalPages).map((item) => (
                  <button key={item} type="button" aria-current={item === page ? 'page' : undefined} onClick={() => changePage(item)}>
                    {item}
                  </button>
                ))}
                <button type="button" onClick={() => changePage(page + 1)} disabled={page >= totalPages}>Next</button>
              </nav>
            </div>
          </div>
        ) : null}
      </section>

      {tip ? (
        <div
          className={`admin-orders-tooltip${tip.above ? ' is-above' : ''}`}
          style={{ left: tip.left, top: tip.top, width: tip.width }}
          role="tooltip"
        >
          {tip.label}
        </div>
      ) : null}
    </div>
  )
}
