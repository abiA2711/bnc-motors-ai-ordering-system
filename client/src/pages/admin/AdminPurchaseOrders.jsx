import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client.js'
import { listPurchaseOrders } from '../../api/purchaseOrders.js'
import { useToast } from '../../components/ui/ToastProvider.jsx'
import { progressFromCounts, purchaseOrderStatusLabel } from '../../purchase-orders/conversion.js'
import { PURCHASE_ORDER_STATUSES } from '../../purchase-orders/status.js'
import { formatDate } from '../../utils/format.js'
import '../../styles/admin-purchase-orders.css'

const PAGE_SIZES = [10, 20, 50]
const SUMMARY = [
  { key: '', label: 'Total Purchase Orders', countKey: 'all' },
  { key: 'uploaded', label: 'Uploaded', countKey: 'uploaded' },
  { key: 'processing', label: 'Processing', countKey: 'processing' },
  { key: 'review_required', label: 'Review Required', countKey: 'review_required' },
  { key: 'partially_converted', label: 'Partially Converted', countKey: 'partially_converted' },
  { key: 'confirmed', label: 'Confirmed', countKey: 'confirmed' },
  { key: 'failed', label: 'Failed', countKey: 'failed' },
]

const readCounts = (counts) => {
  if (!counts || typeof counts !== 'object') {
    return null
  }

  const next = {}
  const keys = SUMMARY.map((item) => item.countKey)

  for (const key of keys) {
    const value = Number(counts[key])
    if (!Number.isInteger(value) || value < 0) {
      return null
    }
    next[key] = value
  }

  const sum = keys.filter((key) => key !== 'all').reduce((total, key) => total + next[key], 0)
  return sum === next.all ? next : null
}

const pageWindow = (page, totalPages) => {
  const count = Math.min(5, totalPages)
  const start = Math.max(1, Math.min(page - 2, totalPages - count + 1))
  return Array.from({ length: count }, (_, index) => start + index)
}

const customerLabel = (purchaseOrder) => purchaseOrder.customer_name || purchaseOrder.customer_email || 'Unknown customer'

const countText = (value) => {
  const number = Number(value)
  return Number.isInteger(number) ? number.toLocaleString('en-IN') : '—'
}

function Icon({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

function SearchIcon() {
  return <Icon><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></Icon>
}

function EyeIcon() {
  return <Icon><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.5" /></Icon>
}

function RefreshIcon() {
  return <Icon><path d="M20 12a8 8 0 1 1-2.2-5.5" /><path d="M20 4v6h-6" /></Icon>
}

function KpiIcon({ name }) {
  if (name === 'uploaded') return <Icon><path d="M12 4v10" /><path d="m8 8 4-4 4 4" /><path d="M5 16.5V19h14v-2.5" /></Icon>
  if (name === 'processing') return <Icon><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></Icon>
  if (name === 'review_required') return <Icon><path d="M12 4 3.5 19h17z" /><path d="M12 10v4M12 16.5h.01" /></Icon>
  if (name === 'partially_converted') return <Icon><path d="M7 3.5h7l4 4V20H7z" /><path d="M14 3.5V8h4" /><path d="M9.5 13h5" /></Icon>
  if (name === 'confirmed') return <Icon><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.2 2.2 4.8-5" /></Icon>
  if (name === 'failed') return <Icon><circle cx="12" cy="12" r="8" /><path d="m9 9 6 6M15 9l-6 6" /></Icon>
  return <Icon><path d="M7 3.5h7l4 4V20H7z" /><path d="M14 3.5V8h4" /><path d="M9.5 12h6M9.5 16h6" /></Icon>
}

export default function AdminPurchaseOrders() {
  const toast = useToast()
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [counts, setCounts] = useState(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const searchTimer = useRef(null)
  const filtered = Boolean(search || status || from || to)
  const fromRow = total === 0 ? 0 : (page - 1) * limit + 1
  const toRow = total === 0 ? 0 : fromRow + purchaseOrders.length - 1

  useEffect(() => {
    let active = true

    listPurchaseOrders({ page, limit, status, search, from, to })
      .then((result) => {
        if (!active) {
          return
        }

        if (result.totalPages > 0 && page > result.totalPages) {
          setPage(result.totalPages)
          return
        }

        setPurchaseOrders(result.purchaseOrders)
        setCounts(readCounts(result.counts))
        setTotal(result.total)
        setTotalPages(result.totalPages)
        setError('')
        setLoading(false)
      })
      .catch((requestError) => {
        if (!active) {
          return
        }

        const message = requestError instanceof ApiError ? requestError.message : requestError.message
        setPurchaseOrders([])
        setCounts(null)
        setTotal(0)
        setTotalPages(0)
        setError(message)
        toast.error(message, `admin-po-list:${page}:${limit}:${status}:${search}:${from}:${to}:${message}`)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [page, limit, status, search, from, to, attempt, toast])

  useEffect(() => () => clearTimeout(searchTimer.current), [])

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

  const changeLimit = (event) => {
    setLoading(true)
    setPage(1)
    setLimit(Number(event.target.value))
  }

  const reset = () => {
    clearTimeout(searchTimer.current)
    const unchanged = search === '' && status === '' && from === '' && to === '' && page === 1 && limit === 10 && searchInput === ''
    setSearchInput('')
    setSearch('')
    setStatus('')
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
    <div className="admin-pos">
      <header className="admin-pos-head">
        <div>
          <h1>Purchase Orders Management</h1>
          <p>Manage uploaded purchase orders, review AI extraction, track product matching and monitor conversions.</p>
        </div>
        <button type="button" className="admin-pos-refresh" onClick={retry} disabled={loading}>
          <RefreshIcon />
          Refresh
        </button>
      </header>

      {loading ? (
        <div className="admin-pos-kpis admin-pos-skeleton" aria-hidden="true">
          {SUMMARY.map((item) => <span key={item.label} />)}
        </div>
      ) : null}

      {!loading && counts ? (
        <section className="admin-pos-kpis" aria-label="Purchase order summary">
          {SUMMARY.map((item) => (
            <button
              key={item.label}
              type="button"
              className={status === item.key ? `is-selected is-${item.countKey}` : `is-${item.countKey}`}
              aria-pressed={status === item.key}
              onClick={() => selectStatus(item.key)}
            >
              <i className="admin-pos-kpi-icon" aria-hidden="true"><KpiIcon name={item.countKey} /></i>
              <span>
                <small>{item.label}</small>
                <strong>{counts[item.countKey].toLocaleString('en-IN')}</strong>
              </span>
            </button>
          ))}
        </section>
      ) : null}

      {!loading && !error && !counts ? <p className="admin-pos-note">Purchase order counts are unavailable.</p> : null}

      <section className="admin-pos-panel">
        <form
          className="admin-pos-tools"
          onSubmit={(event) => {
            event.preventDefault()
            applySearch(searchInput)
          }}
        >
          <label className="admin-pos-search">
            <SearchIcon />
            <span className="admin-pos-sr">Search purchase orders</span>
            <input
              type="search"
              value={searchInput}
              onChange={onSearchChange}
              placeholder="PO number, customer, or company"
              aria-label="Search by PO number, customer, or company"
            />
          </label>
          <label>
            <span className="admin-pos-sr">Status</span>
            <select value={status} onChange={changeFilter(setStatus)} aria-label="Status">
              <option value="">All statuses</option>
              {PURCHASE_ORDER_STATUSES.map((item) => (
                <option key={item} value={item}>{purchaseOrderStatusLabel(item)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="admin-pos-sr">From date</span>
            <input type="date" value={from} onChange={changeFilter(setFrom)} aria-label="From date" />
          </label>
          <label>
            <span className="admin-pos-sr">To date</span>
            <input type="date" value={to} onChange={changeFilter(setTo)} aria-label="To date" />
          </label>
          <button type="button" className="admin-pos-reset" onClick={reset}>Reset filters</button>
        </form>

        {loading ? (
          <div className="admin-pos-skeleton" aria-label="Loading purchase orders">
            <span /><span /><span /><span />
          </div>
        ) : null}

        {!loading && error ? (
          <div className="admin-pos-state">
            <h2>Purchase orders could not be loaded</h2>
            <p>{error}</p>
            <button type="button" onClick={retry}>Try again</button>
          </div>
        ) : null}

        {!loading && !error && purchaseOrders.length === 0 ? (
          <div className="admin-pos-state">
            <h2>{filtered ? 'No purchase orders found' : 'No purchase orders yet'}</h2>
            <p>
              {filtered
                ? 'No purchase orders match this search, status, or date range.'
                : 'Uploaded purchase orders will appear here.'}
            </p>
          </div>
        ) : null}

        {!loading && !error && purchaseOrders.length > 0 ? (
          <div className="admin-pos-table-wrap">
            <table className="admin-pos-table">
              <thead>
                <tr>
                  <th>S.No.</th>
                  <th>PO Number</th>
                  <th>Customer / Company</th>
                  <th>Uploaded Date</th>
                  <th>Total Items</th>
                  <th>Accepted</th>
                  <th>Rejected</th>
                  <th>Converted</th>
                  <th>PO Status</th>
                  <th>Conversion Progress</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((purchaseOrder, index) => {
                  const progress = progressFromCounts(purchaseOrder)
                  const company = purchaseOrder.customer_company_name

                  return (
                    <tr key={purchaseOrder.id}>
                      <td data-label="S.No.">{(page - 1) * limit + index + 1}</td>
                      <td data-label="PO Number">
                        <Link className="admin-pos-number" to={`/admin/purchase-orders/${purchaseOrder.id}`}>{purchaseOrder.po_number}</Link>
                      </td>
                      <td data-label="Customer / Company">
                        <div className="admin-pos-customer" title={[customerLabel(purchaseOrder), company].filter(Boolean).join(' · ')}>
                          <strong>{customerLabel(purchaseOrder)}</strong>
                          {company ? <small>{company}</small> : null}
                        </div>
                      </td>
                      <td data-label="Uploaded Date">{formatDate(purchaseOrder.created_at) || 'Not available'}</td>
                      <td data-label="Total Items">{progress ? countText(progress.total) : countText(purchaseOrder.item_count)}</td>
                      <td data-label="Accepted">{progress ? countText(progress.accepted) : '—'}</td>
                      <td data-label="Rejected">{progress ? countText(progress.rejected) : '—'}</td>
                      <td data-label="Converted">{progress ? countText(progress.converted) : '—'}</td>
                      <td data-label="PO Status">
                        <span className={`admin-po-badge is-${purchaseOrder.status}`}>{purchaseOrderStatusLabel(purchaseOrder.status)}</span>
                      </td>
                      <td data-label="Conversion Progress">
                        {progress ? (
                          <div
                            className="admin-pos-progress"
                            title={`${progress.converted.toLocaleString('en-IN')} converted, ${progress.remaining.toLocaleString('en-IN')} accepted still remaining. Rejected lines are excluded.`}
                          >
                            <span><i style={{ '--progress': `${progress.percent}%` }} /></span>
                            <strong>{progress.percent}%</strong>
                          </div>
                        ) : '—'}
                      </td>
                      <td data-label="Actions">
                        <div className="admin-pos-row-actions">
                          <Link to={`/admin/purchase-orders/${purchaseOrder.id}`} aria-label={`View details for ${purchaseOrder.po_number}`}>
                            <EyeIcon />
                            <span className="admin-pos-action-label">Details</span>
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
          <div className="admin-pos-pager">
            <p>Showing {fromRow}–{toRow} of {total.toLocaleString('en-IN')} purchase orders</p>
            <div>
              <label>
                Rows per page
                <select value={limit} onChange={changeLimit} aria-label="Rows per page">
                  {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <nav aria-label="Purchase order pages">
                <button type="button" onClick={() => changePage(page - 1)} disabled={page <= 1}>Previous</button>
                {pageWindow(page, totalPages).map((item) => (
                  <button key={item} type="button" aria-current={item === page ? 'page' : undefined} onClick={() => changePage(item)}>{item}</button>
                ))}
                <button type="button" onClick={() => changePage(page + 1)} disabled={page >= totalPages}>Next</button>
              </nav>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
