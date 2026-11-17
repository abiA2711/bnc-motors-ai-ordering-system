import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client.js'
import { loadAdminDashboard } from '../../api/admin.js'
import { OrdersTrendChart, PurchaseOrderStatusChart } from '../../components/admin/AdminDashboardCharts.jsx'
import { RecentOrders, RecentPurchaseOrders } from '../../components/admin/AdminActivity.jsx'
import { CalendarIcon, CartIcon, ChartIcon, ClockIcon, FileIcon, PackageIcon, RefreshIcon, TrendIcon, UsersIcon } from '../../components/admin/dashboardIcons.jsx'
import Button from '../../components/ui/Button.jsx'
import ErrorMessage from '../../components/ui/ErrorMessage.jsx'
import { useToast } from '../../components/ui/ToastProvider.jsx'
import '../../styles/admin-dashboard.css'

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

const rangeLabel = (value) => RANGES.find((item) => item.value === value)?.label || 'Last 30 days'

export default function AdminDashboard() {
  const toast = useToast()
  const refreshRequested = useRef(false)
  const [range, setRange] = useState('30')
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true

    loadAdminDashboard(range)
      .then((result) => {
        if (!active) {
          return
        }

        setOverview(result)
        setError('')
        setLoading(false)

        if (refreshRequested.current) {
          refreshRequested.current = false
          toast.success('Dashboard updated')
        }
      })
      .catch((requestError) => {
        if (!active) {
          return
        }

        refreshRequested.current = false
        setOverview(null)
        const message = requestError instanceof ApiError ? requestError.message : requestError.message
        setError(message || 'The dashboard could not be loaded')
        toast.error(message || 'The dashboard could not be loaded', `dashboard:${range}:${attempt}:${message}`)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [range, attempt, toast])

  const changeRange = (event) => {
    const nextRange = event.target.value

    if (nextRange === range) {
      return
    }

    refreshRequested.current = false
    setError('')
    setOverview(null)
    setLoading(true)
    setRange(nextRange)
  }

  const refresh = () => {
    refreshRequested.current = true
    setError('')
    setOverview(null)
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  const summary = overview ? overview.summary : null
  const purchaseOrderNote = summary && summary.partiallyConvertedPurchaseOrders > 0
    ? `${summary.partiallyConvertedPurchaseOrders} partially converted`
    : 'Uploaded purchase orders'

  return (
    <div className="admin-dashboard" aria-busy={loading}>
      <header className="admin-dash-header">
        <div>
          <h1><ChartIcon /> Dashboard</h1>
          <p>Overview of your business performance and activities.</p>
        </div>
        <div className="admin-dash-tools">
          <label className="admin-range">
            <CalendarIcon />
            <span className="admin-dash-sr">Orders trend period</span>
            <select value={range} onChange={changeRange} disabled={loading}>
              {RANGES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="admin-refresh" onClick={refresh} disabled={loading}>
            <RefreshIcon />
            Refresh
          </button>
        </div>
      </header>

      {loading ? <DashboardSkeleton /> : null}
      {!loading && error ? (
        <section className="admin-dash-error">
          <ErrorMessage message={error} />
          <Button onClick={refresh}>Try again</Button>
        </section>
      ) : null}

      {!loading && !error && summary ? (
        <>
          <section className="admin-kpis" aria-label="Business totals">
            <article className="admin-kpi">
              <span className="is-customers"><UsersIcon /></span>
              <div>
                <p>Total Customers</p>
                <strong>{summary.totalCustomers}</strong>
                <small>Registered customer accounts</small>
              </div>
            </article>
            <Link className="admin-kpi" to="/admin/products">
              <span className="is-products"><PackageIcon /></span>
              <div>
                <p>Active Products</p>
                <strong>{summary.activeProducts}</strong>
                <small>Active catalogue products</small>
              </div>
            </Link>
            <Link className="admin-kpi" to="/admin/orders">
              <span className="is-orders"><CartIcon /></span>
              <div>
                <p>Total Orders</p>
                <strong>{summary.totalOrders}</strong>
                <small>All customer orders</small>
              </div>
            </Link>
            <Link className="admin-kpi" to="/admin/orders">
              <span className="is-pending"><ClockIcon /></span>
              <div>
                <p>Pending Orders</p>
                <strong>{summary.pendingOrders}</strong>
                <small>Orders with pending status</small>
              </div>
            </Link>
            <Link className="admin-kpi" to="/admin/purchase-orders">
              <span className="is-purchase"><FileIcon /></span>
              <div>
                <p>Purchase Orders</p>
                <strong>{summary.totalPurchaseOrders}</strong>
                <small>{purchaseOrderNote}</small>
              </div>
            </Link>
          </section>

          <section className="admin-dash-charts">
            <article className="admin-chart-card">
              <header>
                <h2><TrendIcon /> Orders Trend</h2>
                <p>Orders created per day, {rangeLabel(range).toLowerCase()}.</p>
              </header>
              <OrdersTrendChart points={overview.ordersTrend} />
            </article>
            <article className="admin-chart-card">
              <header>
                <h2><FileIcon /> Purchase Orders by Status</h2>
                <p>All uploaded purchase orders.</p>
              </header>
              <PurchaseOrderStatusChart statuses={overview.purchaseOrdersByStatus} />
            </article>
          </section>

          <section className="admin-dash-tables">
            <RecentOrders orders={overview.recentOrders} />
            <RecentPurchaseOrders purchaseOrders={overview.recentPurchaseOrders} />
          </section>
        </>
      ) : null}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="admin-dash-skeleton" aria-hidden="true">
      <div className="admin-kpis">
        {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
      </div>
      <div className="admin-dash-charts">
        <span />
        <span />
      </div>
      <div className="admin-dash-tables">
        <span />
        <span />
      </div>
    </div>
  )
}
