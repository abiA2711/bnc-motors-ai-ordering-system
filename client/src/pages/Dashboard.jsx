import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { listMyOrders } from '../api/orders.js'
import { listPurchaseOrders } from '../api/purchaseOrders.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Button from '../components/ui/Button.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import { centsToAmount, formatMoney, formatStatus, moneyToCents } from '../utils/format.js'
import '../styles/dashboard.css'

const PAGE_LIMIT = 100
const RECENT_LIMIT = 3

const actions = [
  {
    to: '/products',
    title: 'Browse Products',
    text: 'Search the spare-parts catalogue and check live stock.',
    tone: 'primary',
    icon: 'box',
  },
  {
    to: '/purchase-orders',
    title: 'Upload Purchase Order',
    text: 'Send a PDF purchase order for extraction and review.',
    tone: 'light',
    icon: 'upload',
  },
  {
    to: '/orders',
    title: 'View Orders',
    text: 'Open and track orders placed from this account.',
    tone: 'light',
    icon: 'orders',
  },
]

const sumQuantities = (orders) => {
  let total = 0

  for (const order of orders) {
    if (!Array.isArray(order.items)) {
      return null
    }

    for (const item of order.items) {
      const quantity = Number(item.quantity)

      if (!Number.isInteger(quantity) || quantity < 0) {
        return null
      }

      total += quantity
    }
  }

  return total
}

const sumTotals = (orders) => {
  let cents = 0

  for (const order of orders) {
    const value = moneyToCents(order.total_amount)

    if (value === null) {
      return null
    }

    cents += value
  }

  return centsToAmount(cents)
}

const itemQuantity = (order) => {
  if (!Array.isArray(order.items)) {
    return null
  }

  return sumQuantities([order])
}

const orderDate = (value) => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const loadAllOrders = async () => {
  const first = await listMyOrders({ page: 1, limit: PAGE_LIMIT })
  const pages = [first]

  if (first.totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: first.totalPages - 1 }, (_, index) => (
        listMyOrders({ page: index + 2, limit: PAGE_LIMIT })
      )),
    )
    pages.push(...rest)
  }

  return {
    total: first.total,
    orders: pages.flatMap((page) => page.orders),
  }
}

function DashIcon({ name }) {
  if (name === 'orders') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 7.5h12M6 12h12M6 16.5h8" />
        <rect x="3.5" y="4" width="17" height="16" rx="2" />
      </svg>
    )
  }

  if (name === 'po') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3.5h7l4 4V20.5H7z" />
        <path d="M14 3.5V8h4M9.5 12.5h5M9.5 16h5" />
      </svg>
    )
  }

  if (name === 'items' || name === 'box') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.8 7.5 12 3.8l8.2 3.7L12 11.2z" />
        <path d="M3.8 7.5V16.2L12 20.2l8.2-4V7.5" />
        <path d="M12 11.2v9" />
      </svg>
    )
  }

  if (name === 'value') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7.5v9M9.5 9.2c.6-.7 1.5-1 2.5-1 1.5 0 2.4.8 2.4 1.9S13.6 12 12 12s-2.4.7-2.4 1.9 1 1.9 2.4 1.9c1 0 1.9-.3 2.5-1" />
      </svg>
    )
  }

  if (name === 'upload') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 16V6.5M8.5 9.5 12 6l3.5 3.5" />
        <path d="M5 18.5h14" />
      </svg>
    )
  }

  if (name === 'arrow') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h2l1.4 8.2a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.5L20 9H7" />
      <circle cx="10" cy="19" r="1.2" />
      <circle cx="17" cy="19" r="1.2" />
    </svg>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [recent, setRecent] = useState([])
  const [orderTotal, setOrderTotal] = useState(null)
  const [itemTotal, setItemTotal] = useState(null)
  const [orderValue, setOrderValue] = useState(null)
  const [poTotal, setPoTotal] = useState(null)
  const [recentPurchaseOrders, setRecentPurchaseOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [poError, setPoError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const name = user && user.name ? user.name : ''
  const company = user && user.company_name ? user.company_name.trim() : ''

  useEffect(() => {
    let active = true

    Promise.allSettled([
      loadAllOrders(),
      listPurchaseOrders({ page: 1, limit: RECENT_LIMIT }),
    ]).then(([orderResult, poResult]) => {
      if (!active) {
        return
      }

      if (orderResult.status === 'fulfilled') {
        const { total, orders } = orderResult.value
        const complete = Number.isInteger(total) && orders.length === total
        setOrderTotal(Number.isInteger(total) ? total : null)
        setRecent(orders.slice(0, RECENT_LIMIT))
        setItemTotal(complete ? sumQuantities(orders) : null)
        setOrderValue(complete ? sumTotals(orders) : null)
        setError('')
      } else {
        const requestError = orderResult.reason
        setOrderTotal(null)
        setItemTotal(null)
        setOrderValue(null)
        setRecent([])
        setError(requestError instanceof ApiError ? requestError.message : 'Orders could not be loaded')
      }

      if (poResult.status === 'fulfilled' && Number.isInteger(poResult.value.total)) {
        const purchaseOrders = Array.isArray(poResult.value.purchaseOrders) ? poResult.value.purchaseOrders : []
        setPoTotal(poResult.value.total)
        setRecentPurchaseOrders(purchaseOrders.slice(0, RECENT_LIMIT))
        setPoError('')
      } else {
        setPoTotal(null)
        setRecentPurchaseOrders([])
        setPoError('Purchase orders could not be loaded')
      }

      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [attempt])

  const retry = () => {
    setError('')
    setPoError('')
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  const metric = (value, formatter) => {
    if (loading) {
      return '…'
    }

    if (value === null || value === undefined) {
      return '—'
    }

    return formatter(value)
  }

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <p>Customer Dashboard</p>
        <h1>Welcome, {name} 👋</h1>
        <p>
          {company
            ? `${company} can browse parts, send purchase orders, and follow orders from this workspace.`
            : 'Browse parts, send purchase orders, and follow orders from this workspace.'}
        </p>
      </section>

      <section className="dashboard-stats" aria-label="Account totals">
        <article>
          <span className="dashboard-stat-icon is-orders"><DashIcon name="orders" /></span>
          <div>
            <p>Total Orders</p>
            <strong>{metric(orderTotal, (value) => value.toLocaleString('en-IN'))}</strong>
          </div>
        </article>
        <article>
          <span className="dashboard-stat-icon is-po"><DashIcon name="po" /></span>
          <div>
            <p>Purchase Orders</p>
            <strong>{metric(poTotal, (value) => value.toLocaleString('en-IN'))}</strong>
          </div>
        </article>
        <article>
          <span className="dashboard-stat-icon is-items"><DashIcon name="items" /></span>
          <div>
            <p>Items Ordered</p>
            <strong>{metric(itemTotal, (value) => value.toLocaleString('en-IN'))}</strong>
          </div>
        </article>
        <article>
          <span className="dashboard-stat-icon is-value"><DashIcon name="value" /></span>
          <div>
            <p>Order Value</p>
            <strong>{metric(orderValue, (value) => formatMoney(value, 'INR'))}</strong>
          </div>
        </article>
      </section>

      <section className="dashboard-actions" aria-label="Quick navigation">
        {actions.map((action) => (
          <Link key={action.to} className={`dashboard-action is-${action.tone}`} to={action.to}>
            <span className="dashboard-action-icon"><DashIcon name={action.icon} /></span>
            <span>
              <strong>{action.title}</strong>
              <small>{action.text}</small>
            </span>
            <DashIcon name="arrow" />
          </Link>
        ))}
      </section>

      <div className="dashboard-lower">
        <section className="dashboard-card">
          <div className="dashboard-card-head">
            <h2>Recent Orders</h2>
            <Link to="/orders">View All Orders</Link>
          </div>
          {loading ? <p className="dashboard-note">Loading orders</p> : null}
          <ErrorMessage message={error} />
          {!loading && error ? <Button onClick={retry}>Try again</Button> : null}
          {!loading && !error && recent.length === 0 ? (
            <p className="dashboard-note">No orders have been placed from this account yet.</p>
          ) : null}
          {!loading && !error && recent.length > 0 ? (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Order No.</th>
                    <th>Order Date</th>
                    <th>Items</th>
                    <th>Total Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((order) => {
                    const quantity = itemQuantity(order)

                    return (
                      <tr key={order.id}>
                        <td><Link to={`/orders/${order.id}`}>{order.order_number}</Link></td>
                        <td>{orderDate(order.created_at)}</td>
                        <td>{quantity === null ? '—' : `${quantity.toLocaleString('en-IN')} ${quantity === 1 ? 'item' : 'items'}`}</td>
                        <td>{moneyToCents(order.total_amount) === null ? '—' : formatMoney(order.total_amount, 'INR')}</td>
                        <td><span className={`dashboard-status is-${order.status}`}>{formatStatus(order.status)}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <div className="dashboard-side">
          <section className="dashboard-card">
            <div className="dashboard-card-head">
              <h2>Recent Purchase Orders</h2>
              <Link to="/purchase-orders">View all</Link>
            </div>
            {loading ? <p className="dashboard-note">Loading purchase orders</p> : null}
            {!loading && poError ? <ErrorMessage message={poError} /> : null}
            {!loading && poError ? <Button onClick={retry}>Try again</Button> : null}
            {!loading && !poError && recentPurchaseOrders.length === 0 ? (
              <p className="dashboard-note">
                No purchase orders uploaded yet.{' '}
                <Link to="/purchase-orders/upload">Upload a purchase order</Link>
              </p>
            ) : null}
            {!loading && !poError && recentPurchaseOrders.length > 0 ? (
              <ul className="dashboard-po-list">
                {recentPurchaseOrders.map((purchaseOrder) => (
                  <li key={purchaseOrder.id}>
                    <Link className="dashboard-po" to={`/purchase-orders/${purchaseOrder.id}`}>
                      <span>
                        <strong>{purchaseOrder.po_number}</strong>
                        <small>{orderDate(purchaseOrder.created_at)}</small>
                      </span>
                      <span className={`dashboard-status is-${purchaseOrder.status}`}>{formatStatus(purchaseOrder.status)}</span>
                      <span className="dashboard-po-action">View Details</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          <section className="dashboard-card">
            <div className="dashboard-card-head">
              <h2>Purchase Orders</h2>
              <Link to="/purchase-orders">View all</Link>
            </div>
            {loading ? <p className="dashboard-note">Loading purchase orders</p> : null}
            {!loading ? (
              <p className="dashboard-summary">
                <strong>{poTotal === null ? '—' : poTotal.toLocaleString('en-IN')}</strong>
                <span>{poTotal === 1 ? 'purchase order uploaded from this account.' : 'purchase orders uploaded from this account.'}</span>
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
