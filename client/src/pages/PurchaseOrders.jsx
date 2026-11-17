import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { listPurchaseOrders } from '../api/purchaseOrders.js'
import { DocumentIcon } from '../components/auth/icons.jsx'
import Button from '../components/ui/Button.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import Loading from '../components/ui/Loading.jsx'
import { useToast } from '../components/ui/ToastProvider.jsx'
import { PURCHASE_ORDER_STATUSES } from '../purchase-orders/status.js'
import '../styles/purchase-orders.css'

const PAGE_SIZES = [10, 20, 50]
const STATUS_LABELS = {
  uploaded: 'Uploaded',
  processing: 'Processing',
  review_required: 'In Review',
  partially_converted: 'Partially Converted',
  confirmed: 'Converted',
  failed: 'Failed',
}

const statusLabel = (status) => STATUS_LABELS[status] || 'Unknown'

const formatUploaded = (value) => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Not available'
  }

  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const pageWindow = (page, totalPages) => {
  const size = 5
  let start = Math.max(1, page - 2)
  const end = Math.min(totalPages, start + size - 1)
  start = Math.max(1, end - size + 1)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function PdfUploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3.5h7l4 4V20.5H7z" />
      <path d="M14 3.5V8h4" />
      <path d="M12 17.2V11" />
      <path d="M9.6 13.2 12 10.8l2.4 2.4" />
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

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.2 13.5 8 18.3 9.5 13.5 11 12 15.8 10.5 11 5.7 9.5 10.5 8z" />
      <path d="M18 14.2l.8 2.1 2.1.7-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.7z" />
    </svg>
  )
}

function UploadStepIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 16.5V7.5" />
      <path d="M8.5 10.8 12 7.3l3.5 3.5" />
      <path d="M6 18.5h12" />
    </svg>
  )
}

function ExtractStepIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 4.5h7.2l3.8 3.8V19.5h-11z" />
      <path d="M13.7 4.5v3.8h3.8M9 12h4.2M9 15.2h2.8" />
      <path d="M16.2 13.2l1.8 1.8 2.4-3" />
    </svg>
  )
}

function ReviewStepIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.2l2.2 2.2 4.8-5" />
    </svg>
  )
}

function EmptyPurchaseOrderArt() {
  return (
    <svg className="po-zero-drawing" viewBox="0 0 128 128" aria-hidden="true">
      <path fill="#ffffff" stroke="#07182d" strokeWidth="2.4" strokeLinejoin="round" d="M36 20h38l22 22v66H36z" />
      <path fill="#e8f3fe" stroke="#0878e8" strokeWidth="2.2" strokeLinejoin="round" d="M74 20v22h22" />
      <rect x="48" y="52" width="38" height="18" rx="4" fill="#0878e8" />
      <text x="67" y="65" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="700" fontFamily="Segoe UI, sans-serif">PDF</text>
      <path stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" d="M48 80h36M48 88h26M48 96h32" />
      <path fill="#0878e8" d="M104 30l1.5 3.8 3.8 1.4-3.8 1.5-1.5 3.8-1.4-3.8-3.8-1.5 3.8-1.4z" />
    </svg>
  )
}

function EmptyPurchaseOrders() {
  return (
    <section className="po-zero" aria-labelledby="po-zero-heading">
      <div className="po-zero-art" aria-hidden="true">
        <span className="po-zero-badge po-zero-gear"><GearIcon /></span>
        <span className="po-zero-badge po-zero-disc"><DiscIcon /></span>
        <span className="po-zero-badge po-zero-spark"><SparkIcon /></span>
        <span className="po-zero-halo"><EmptyPurchaseOrderArt /></span>
      </div>
      <h2 id="po-zero-heading">No Purchase Orders Yet</h2>
      <p className="po-zero-lead">Have a purchase order ready? Upload your PDF and let our AI extract the items and find matching products from our catalogue.</p>
      <p className="po-zero-note">Review suggested matches, select the right parts, and confirm your order.</p>
      <Link className="po-zero-action" to="/purchase-orders/upload">
        <PdfUploadIcon />
        Upload Your First Purchase Order
      </Link>
      <ol className="po-zero-steps">
        <li>
          <span className="po-zero-step-icon"><UploadStepIcon /></span>
          <strong>Upload PDF</strong>
          <small>Upload your company's purchase order.</small>
        </li>
        <li>
          <span className="po-zero-step-icon"><ExtractStepIcon /></span>
          <strong>AI Extracts Items</strong>
          <small>Extract product names, quantities and relevant details.</small>
        </li>
        <li>
          <span className="po-zero-step-icon"><ReviewStepIcon /></span>
          <strong>Review &amp; Confirm</strong>
          <small>Review catalogue matches and confirm your order.</small>
        </li>
      </ol>
    </section>
  )
}

function SummaryIcon({ name }) {
  if (name === 'review') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.5 2" />
      </svg>
    )
  }

  if (name === 'converted') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M8.5 12.2l2.2 2.2 4.8-5" />
      </svg>
    )
  }

  if (name === 'failed') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M9 9l6 6M15 9l-6 6" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3.5h7l4 4V20.5H7z" />
      <path d="M14 3.5V8h4M9.5 12.5h5M9.5 16h5" />
    </svg>
  )
}

export default function PurchaseOrders() {
  const toast = useToast()
  const searchTimer = useRef(null)
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [counts, setCounts] = useState(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

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
        setTotal(result.total)
        setTotalPages(result.totalPages)
        setCounts(result.counts)
        setError('')
        setLoading(false)
      })
      .catch((requestError) => {
        if (!active) {
          return
        }

        const message = requestError instanceof ApiError ? requestError.message : requestError.message
        setPurchaseOrders([])
        setTotal(0)
        setTotalPages(0)
        setError(message)
        toast.error(message, `po-list:${page}:${limit}:${status}:${search}:${from}:${to}:${message}`)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [page, limit, status, search, from, to, attempt, toast])

  useEffect(() => () => clearTimeout(searchTimer.current), [])

  const countOf = (key) => {
    const value = counts && counts[key]
    return Number.isInteger(value) ? value : 0
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

  const changeStatus = (event) => {
    const nextStatus = event.target.value

    if (nextStatus === status && page === 1) {
      return
    }

    setError('')
    setLoading(true)
    setPage(1)
    setStatus(nextStatus)
  }

  const changeDate = (setter, other, isStart) => (event) => {
    const value = event.target.value

    if ((isStart && other && value && value > other) || (!isStart && other && value && other > value)) {
      setError('The start date cannot be after the end date')
      return
    }

    setError('')
    setLoading(true)
    setPage(1)
    setter(value)
  }

  const clearFilters = () => {
    clearTimeout(searchTimer.current)
    const unchanged = search === '' && status === '' && from === '' && to === '' && page === 1
    setSearchInput('')
    setSearch('')
    setStatus('')
    setFrom('')
    setTo('')
    setError('')
    setPage(1)

    if (!unchanged) {
      setLoading(true)
    }
  }

  const changeLimit = (event) => {
    setLoading(true)
    setPage(1)
    setLimit(Number(event.target.value))
  }

  const changePage = (nextPage) => {
    setLoading(true)
    setPage(nextPage)
  }

  const retry = () => {
    setError('')
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  const filtersActive = Boolean(search || status || from || to || searchInput)
  const accountEmpty = !loading && !error && !search && !status && !from && !to && counts && counts.all === 0
  const filteredEmpty = !loading && !error && !accountEmpty && purchaseOrders.length === 0
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  const cards = [
    { key: 'all', label: 'Total Purchase Orders', icon: 'total', tone: 'total' },
    { key: 'review_required', label: 'In Review', icon: 'review', tone: 'review' },
    { key: 'confirmed', label: 'Converted', icon: 'converted', tone: 'converted' },
    { key: 'failed', label: 'Failed', icon: 'failed', tone: 'failed' },
  ]

  return (
    <div className="po-page">
      <header className="po-heading">
        <span className="po-heading-icon" aria-hidden="true"><DocumentIcon /></span>
        <div>
          <h1>My Purchase Orders</h1>
          <p>Manage your uploaded purchase orders and track their processing status.</p>
        </div>
        <Link className="po-upload" to="/purchase-orders/upload">
          <SummaryIcon name="total" />
          Upload Purchase Order
        </Link>
      </header>

      <section className="po-summary" aria-label="Purchase order summary">
        {cards.map((card) => (
          <article key={card.key} className={`is-${card.tone}`}>
            <span><SummaryIcon name={card.icon} /></span>
            <div>
              <strong>{countOf(card.key).toLocaleString('en-IN')}</strong>
              <p>{card.label}</p>
            </div>
          </article>
        ))}
      </section>

      {accountEmpty ? <EmptyPurchaseOrders /> : (
      <section className="po-card">
        <form
          className="po-tools"
          onSubmit={(event) => {
            event.preventDefault()
            applySearch(searchInput)
          }}
        >
          <label className="po-search">
            <span className="po-sr">Search purchase orders</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m15.5 15.5 4 4" /></svg>
            <input
              type="search"
              value={searchInput}
              maxLength={100}
              placeholder="Search by PO number or file name..."
              onChange={onSearchChange}
            />
          </label>
          <label className="po-date">
            <span className="po-sr">From date</span>
            <input type="date" value={from} max={to || undefined} aria-label="From date" onChange={changeDate(setFrom, to, true)} />
          </label>
          <label className="po-date">
            <span className="po-sr">To date</span>
            <input type="date" value={to} min={from || undefined} aria-label="To date" onChange={changeDate(setTo, from, false)} />
          </label>
          <label className="po-status">
            <span>Status</span>
            <select value={status} aria-label="Status" onChange={changeStatus}>
              <option value="">All</option>
              {PURCHASE_ORDER_STATUSES.map((item) => (
                <option key={item} value={item}>{statusLabel(item)}</option>
              ))}
            </select>
          </label>
          {filtersActive ? <button type="button" className="po-clear" onClick={clearFilters}>Clear filters</button> : null}
        </form>

        {loading ? <Loading label="Loading purchase orders" /> : null}
        <ErrorMessage message={error} />
        {!loading && error ? <Button onClick={retry}>Try again</Button> : null}

        {filteredEmpty ? (
          <div className="po-empty">
            <h2>No purchase orders match these filters.</h2>
            <p>Try another status, date, or search.</p>
          </div>
        ) : null}

        {!loading && !error && purchaseOrders.length > 0 ? (
          <div className="po-table-wrap">
            <table className="po-table">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>File Name</th>
                  <th>Uploaded Date</th>
                  <th>Status</th>
                  <th>Items</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((purchaseOrder) => {
                  const fileName = typeof purchaseOrder.file_name === 'string' && purchaseOrder.file_name.trim()
                    ? purchaseOrder.file_name.trim()
                    : ''
                  const itemCount = Number(purchaseOrder.item_count)
                  const known = PURCHASE_ORDER_STATUSES.includes(purchaseOrder.status)

                  return (
                    <tr key={purchaseOrder.id}>
                      <td data-label="PO Number"><strong>{purchaseOrder.po_number}</strong></td>
                      <td data-label="File Name">
                        {fileName ? <span className="po-file" title={fileName}>{fileName}</span> : 'Not available'}
                      </td>
                      <td data-label="Uploaded Date">{formatUploaded(purchaseOrder.created_at)}</td>
                      <td data-label="Status">
                        <span className={known ? `po-badge is-${purchaseOrder.status}` : 'po-badge'}>{statusLabel(purchaseOrder.status)}</span>
                      </td>
                      <td data-label="Items">{Number.isInteger(itemCount) ? itemCount.toLocaleString('en-IN') : '—'}</td>
                      <td data-label="Action">
                        <Link className="po-view" to={`/purchase-orders/${purchaseOrder.id}`}>View Details <span aria-hidden="true">→</span></Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error && total > 0 ? (
          <div className="po-pager">
            <p>Showing {start.toLocaleString('en-IN')}–{end.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}</p>
            <nav aria-label="Purchase order pages">
              <button type="button" onClick={() => changePage(page - 1)} disabled={page <= 1} aria-label="Previous page">‹</button>
              {pageWindow(page, totalPages).map((number) => (
                <button key={number} type="button" aria-current={number === page ? 'page' : undefined} onClick={() => changePage(number)}>{number}</button>
              ))}
              <button type="button" onClick={() => changePage(page + 1)} disabled={page >= totalPages} aria-label="Next page">›</button>
            </nav>
            <label>
              Rows per page
              <select value={limit} onChange={changeLimit}>
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>
        ) : null}
      </section>
      )}
    </div>
  )
}
