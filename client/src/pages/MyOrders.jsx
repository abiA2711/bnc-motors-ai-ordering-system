import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { listMyOrders } from '../api/orders.js'
import { OrdersIcon } from '../components/layout/sidebarIcons.jsx'
import CatalogueProductName from '../components/products/CatalogueProductName.jsx'
import ProductDetailsModal from '../components/products/ProductDetailsModal.jsx'
import Button from '../components/ui/Button.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import Loading from '../components/ui/Loading.jsx'
import { useToast } from '../components/ui/ToastProvider.jsx'
import { ORDER_STATUSES } from '../orders/status.js'
import { formatMoney, formatStatus } from '../utils/format.js'
import '../styles/orders.css'

const PAGE_SIZES = [10, 20, 50]

const formatOrderDate = (value) => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Not available'
  }

  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const itemLabel = (order) => {
  const count = Array.isArray(order.items) ? order.items.length : 0
  return `${count.toLocaleString('en-IN')} ${count === 1 ? 'Item' : 'Items'}`
}

const pageWindow = (page, totalPages) => {
  const size = 5
  let start = Math.max(1, page - 2)
  const end = Math.min(totalPages, start + size - 1)
  start = Math.max(1, end - size + 1)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function StatusBadge({ status }) {
  const known = ORDER_STATUSES.includes(status)
  return <span className={known ? `order-badge is-${status}` : 'order-badge'}>{formatStatus(status)}</span>
}

function EmptyOrdersArt() {
  return (
    <svg className="orders-empty-drawing" viewBox="0 0 96 96" aria-hidden="true">
      <rect x="28" y="22" width="40" height="52" rx="6" />
      <path d="M38 36h20M38 46h20M38 56h12" />
      <circle cx="64" cy="62" r="12" />
      <path d="M64 56.5v6l3.5 2" />
    </svg>
  )
}

export default function MyOrders() {
  const toast = useToast()
  const [orders, setOrders] = useState([])
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
  const [catalogueProduct, setCatalogueProduct] = useState(null)
  const searchTimer = useRef(null)

  useEffect(() => {
    let active = true

    listMyOrders({ page, limit, status, search, from, to })
      .then((result) => {
        if (!active) {
          return
        }

        if (result.totalPages > 0 && page > result.totalPages) {
          setPage(result.totalPages)
          return
        }

        setOrders(result.orders)
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
        setOrders([])
        setTotal(0)
        setTotalPages(0)
        setError(message)
        toast.error(message, `my-orders:${page}:${limit}:${status}:${search}:${from}:${to}:${message}`)
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

  const changeStatus = (nextStatus) => {
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

  const changeLimit = (event) => {
    setLoading(true)
    setPage(1)
    setLimit(Number(event.target.value))
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

  const accountEmpty = !loading && !error && !search && !from && !to && counts && counts.all === 0
  const filteredEmpty = !loading && !error && !accountEmpty && orders.length === 0
  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  const countFor = (value) => {
    if (!counts) {
      return null
    }

    const count = value ? counts[value] : counts.all
    return Number.isInteger(count) ? count : 0
  }

  return (
    <div className="orders-page">
      <header className="orders-heading">
        <span className="orders-heading-icon" aria-hidden="true"><OrdersIcon /></span>
        <div>
          <h1>My Orders</h1>
          <p>Track and manage your orders, view details and order history.</p>
        </div>
      </header>

      <section className="orders-card">
        <div className="orders-filters" role="tablist" aria-label="Order status">
          <button type="button" role="tab" aria-selected={status === ''} className={status === '' ? 'is-active' : ''} onClick={() => changeStatus('')}>
            All Orders
            {countFor('') !== null ? <span>{countFor('').toLocaleString('en-IN')}</span> : null}
          </button>
          {ORDER_STATUSES.map((item) => (
            <button key={item} type="button" role="tab" aria-selected={status === item} className={status === item ? 'is-active' : ''} onClick={() => changeStatus(item)}>
              {formatStatus(item)}
              {countFor(item) !== null ? <span>{countFor(item).toLocaleString('en-IN')}</span> : null}
            </button>
          ))}
        </div>

        <form
          className="orders-tools"
          onSubmit={(event) => {
            event.preventDefault()
            applySearch(searchInput)
          }}
        >
          <label className="orders-search">
            <span className="orders-sr">Search orders</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m15.5 15.5 4 4" /></svg>
            <input
              type="search"
              value={searchInput}
              onChange={onSearchChange}
              placeholder="Search by order number, product, or SKU..."
              maxLength={100}
            />
          </label>
          <label className="orders-date">
            <span className="orders-sr">From date</span>
            <input type="date" value={from} max={to || undefined} aria-label="From date" onChange={changeDate(setFrom, to, true)} />
          </label>
          <label className="orders-date">
            <span className="orders-sr">To date</span>
            <input type="date" value={to} min={from || undefined} aria-label="To date" onChange={changeDate(setTo, from, false)} />
          </label>
          <label className="orders-status">
            <span>Status</span>
            <select value={status} aria-label="Status" onChange={(event) => changeStatus(event.target.value)}>
              <option value="">All</option>
              {ORDER_STATUSES.map((item) => (
                <option key={item} value={item}>{formatStatus(item)}</option>
              ))}
            </select>
          </label>
        </form>

        {loading ? <Loading label="Loading orders" /> : null}
        <ErrorMessage message={error} />
        {!loading && error ? <Button onClick={retry}>Try again</Button> : null}

        {accountEmpty ? (
          <div className="orders-empty">
            <span className="orders-empty-halo"><EmptyOrdersArt /></span>
            <h2>You haven't placed any orders yet.</h2>
            <p>When you confirm an order, it will appear here with its status and total.</p>
            <Link to="/products">Browse Products</Link>
          </div>
        ) : null}

        {filteredEmpty ? (
          <div className="orders-empty">
            <h2>No orders match these filters.</h2>
            <p>Try another status, date, or search.</p>
          </div>
        ) : null}

        {!loading && !error && orders.length > 0 ? (
          <div className="orders-table-wrap">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order Number</th>
                  <th>Order Date</th>
                  <th>Items</th>
                  <th>Total Amount</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td data-label="Order Number"><strong>{order.order_number}</strong></td>
                    <td data-label="Order Date">{formatOrderDate(order.created_at)}</td>
                    <td data-label="Items">
                      <span>{itemLabel(order)}</span>
                      {Array.isArray(order.items) && order.items.length > 0 ? (
                        <ul className="orders-product-names">
                          {order.items.map((item) => {
                            const paid = formatMoney(item.unit_price, 'INR')
                            return (
                              <li key={item.id}>
                                <CatalogueProductName
                                  productId={item.product_id}
                                  onOpen={(id) => setCatalogueProduct({ id, orderPrice: paid === 'Price unavailable' ? '' : paid })}
                                >
                                  {item.product_name}
                                </CatalogueProductName>
                              </li>
                            )
                          })}
                        </ul>
                      ) : null}
                    </td>
                    <td data-label="Total Amount">{formatMoney(order.total_amount, 'INR')}</td>
                    <td data-label="Status"><StatusBadge status={order.status} /></td>
                    <td data-label="Action">
                      <Link className="orders-view" to={`/orders/${order.id}`}>View Details <span aria-hidden="true">→</span></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error && total > 0 ? (
          <div className="orders-pager">
            <p>Showing {start.toLocaleString('en-IN')}–{end.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}</p>
            <nav aria-label="Order pages">
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
      <ProductDetailsModal
        productId={catalogueProduct ? catalogueProduct.id : null}
        orderPriceLabel={catalogueProduct ? catalogueProduct.orderPrice : ''}
        onClose={() => setCatalogueProduct(null)}
      />
    </div>
  )
}
