import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client.js'
import { adjustStock, getInventory, listMovements } from '../../api/inventory.js'
import ProductImage from '../../components/products/ProductImage.jsx'
import { useToast } from '../../components/ui/ToastProvider.jsx'
import '../../styles/admin-inventory.css'

const PAGE_SIZES = [5, 10, 20]
const STATUS_LABELS = {
  in_stock: 'In Stock',
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
  inactive: 'Inactive',
}

const MOVEMENT_LABELS = {
  stock_added: 'Stock Added',
  stock_deducted: 'Stock Deducted',
  order_deduction: 'Order Deduction',
  order_restoration: 'Order Restoration',
  po_conversion_deduction: 'PO Conversion Deduction',
}

const MOVEMENT_INCREASE = {
  stock_added: true,
  order_restoration: true,
}

const displayText = (value) => (typeof value === 'string' && value.trim() ? value : '—')

const formatCount = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('en-IN') : '—'
}

const formatWhen = (value) => {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const pageWindow = (page, totalPages) => {
  const count = Math.min(5, totalPages)
  const start = Math.max(1, Math.min(page - 2, totalPages - count + 1))
  return Array.from({ length: count }, (_, index) => start + index)
}

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

const quantityError = (value, type, stock) => {
  const text = value.trim()

  if (!text) {
    return 'Quantity is required'
  }

  if (!/^[1-9]\d*$/.test(text)) {
    return 'Quantity must be a positive whole number'
  }

  const quantity = Number(text)

  if (!Number.isSafeInteger(quantity) || quantity > 2147483647) {
    return 'Quantity is too large'
  }

  if (type === 'deduct' && quantity > stock) {
    return 'Quantity is greater than available stock'
  }

  return ''
}

const stockPreview = (draft) => {
  if (!draft || !draft.product) {
    return null
  }

  const stock = Number(draft.product.stock_quantity)
  const text = draft.quantity.trim()

  if (!Number.isFinite(stock) || !/^[1-9]\d*$/.test(text)) {
    return null
  }

  const quantity = Number(text)

  if (!Number.isSafeInteger(quantity)) {
    return null
  }

  if (draft.type === 'deduct' && quantity > stock) {
    return { blocked: true, current: stock }
  }

  return {
    blocked: false,
    current: stock,
    next: draft.type === 'add' ? stock + quantity : stock - quantity,
  }
}

const uniqueProducts = (groups) => {
  const seen = new Set()
  const rows = []

  groups.forEach((group) => {
    group.forEach((product) => {
      const id = String(product.id)

      if (seen.has(id)) {
        return
      }

      seen.add(id)
      rows.push(product)
    })
  })

  return rows
}

function Icon({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

function InventoryMark() {
  return (
    <Icon>
      <path d="M3 10.2 12 5l9 5.2" />
      <path d="M5 9.6V19h14V9.6" />
      <path d="M9.5 19v-5h5v5" />
    </Icon>
  )
}

function DownloadIcon() {
  return (
    <Icon>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 19h14" />
    </Icon>
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

function StockIcon() {
  return (
    <Icon>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  )
}

function StatusBadge({ status }) {
  return <span className={`admin-inventory-badge is-${status}`}>{STATUS_LABELS[status] || '—'}</span>
}

function MovementBadge({ type }) {
  return <span className={`admin-inventory-badge is-${type}`}>{MOVEMENT_LABELS[type] || '—'}</span>
}

function movementReference(movement) {
  if (!movement.reference_number) {
    return null
  }

  if (movement.reference_type === 'purchase_order') {
    return `/admin/purchase-orders/${movement.reference_id}`
  }

  if (movement.reference_type === 'order') {
    return `/admin/orders/${movement.reference_id}`
  }

  return null
}

export default function AdminInventory() {
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [alerts, setAlerts] = useState([])
  const [movements, setMovements] = useState([])
  const [movementPage, setMovementPage] = useState(1)
  const [movementTotal, setMovementTotal] = useState(0)
  const [movementPages, setMovementPages] = useState(0)
  const [movementType, setMovementType] = useState('')
  const [movementFrom, setMovementFrom] = useState('')
  const [movementTo, setMovementTo] = useState('')
  const [movementLoading, setMovementLoading] = useState(true)
  const [movementError, setMovementError] = useState('')
  const [categories, setCategories] = useState([])
  const [summary, setSummary] = useState(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [stockStatus, setStockStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [tip, setTip] = useState(null)
  const searchTimer = useRef(null)
  const tipTimer = useRef(null)
  const submitLock = useRef(false)
  const opener = useRef(null)
  const modalRef = useRef(null)
  const filtered = Boolean(search || category || stockStatus !== 'all')
  const lastUpdated = summary ? formatWhen(summary.last_adjustment_at) : ''
  const preview = stockPreview(draft)
  const modalOpen = Boolean(draft)
  const chooserProducts = uniqueProducts([alerts, products])
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)
  const pages = pageWindow(page, totalPages)
  const movementFromRow = movementTotal === 0 ? 0 : (movementPage - 1) * 10 + 1
  const movementToRow = Math.min(movementPage * 10, movementTotal)
  const movementPageList = pageWindow(movementPage, movementPages)
  const movementFiltered = Boolean(movementType || movementFrom || movementTo)

  useEffect(() => {
    let active = true

    getInventory({ page, limit, search, category, stockStatus })
      .then((result) => {
        if (!active) {
          return
        }

        if (result.totalPages > 0 && page > result.totalPages) {
          setPage(result.totalPages)
          return
        }

        setProducts(result.products)
        setAlerts(result.alerts)
        setCategories(result.categories)
        setSummary(result.summary)
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
        setProducts([])
        setTotal(0)
        setTotalPages(0)
        setError(message || 'The inventory could not be loaded')
        toast.error(message || 'The inventory could not be loaded', `inventory:${page}:${limit}:${search}:${category}:${stockStatus}:${message}`)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [page, limit, search, category, stockStatus, attempt, toast])

  useEffect(() => {
    let active = true

    listMovements({ page: movementPage, limit: 10, movementType, from: movementFrom, to: movementTo })
      .then((result) => {
        if (!active) {
          return
        }

        if (result.totalPages > 0 && movementPage > result.totalPages) {
          setMovementPage(result.totalPages)
          return
        }

        setMovements(result.movements)
        setMovementTotal(result.total)
        setMovementPages(result.totalPages)
        setMovementError('')
        setMovementLoading(false)
      })
      .catch((requestError) => {
        if (!active) {
          return
        }

        const message = requestError instanceof ApiError ? requestError.message : requestError.message
        setMovements([])
        setMovementTotal(0)
        setMovementPages(0)
        setMovementError(message || 'The stock history could not be loaded')
        toast.error(message || 'The stock history could not be loaded', `movements:${movementPage}:${movementType}:${movementFrom}:${movementTo}:${message}`)
        setMovementLoading(false)
      })

    return () => {
      active = false
    }
  }, [movementPage, movementType, movementFrom, movementTo, attempt, toast])

  useEffect(() => () => {
    clearTimeout(searchTimer.current)
    clearTimeout(tipTimer.current)
  }, [])

  useEffect(() => {
    if (!tip) {
      return undefined
    }

    const close = () => {
      clearTimeout(tipTimer.current)
      setTip(null)
    }

    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [tip])

  useEffect(() => {
    if (!modalOpen) {
      return undefined
    }

    const node = modalRef.current
    const field = node && node.querySelector('#inventory-quantity, select')
    if (field) {
      field.focus()
    }

    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (!submitLock.current) {
          setDraft(null)
          const trigger = opener.current
          if (trigger && trigger.isConnected) {
            trigger.focus()
          }
        }
        return
      }

      if (event.key !== 'Tab' || !node) {
        return
      }

      const focusable = [...node.querySelectorAll('button, select, input, textarea, a')].filter((item) => !item.disabled)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (!first || !last) {
        return
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [modalOpen])

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

    clearTimeout(tipTimer.current)
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280
    tipTimer.current = setTimeout(() => {
      if (!target.isConnected) {
        return
      }

      const rect = target.getBoundingClientRect()
      const width = Math.min(240, Math.ceil(label.length * 7.1) + 18)
      const center = rect.left + rect.width / 2
      const left = Math.max(8, Math.min(center - width / 2, window.innerWidth - width - 8))
      const above = rect.top >= 52
      setTip({ label, left, top: above ? rect.top - 8 : rect.bottom + 8, above })
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
    setLoading(true)
    setPage(1)
    setter(event.target.value)
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

  const applyStatus = (nextStatus) => {
    if (nextStatus === stockStatus && page === 1) {
      return
    }

    setLoading(true)
    setPage(1)
    setStockStatus(nextStatus)
  }

  const reset = () => {
    clearTimeout(searchTimer.current)
    const queryChanged = search !== '' || category !== '' || stockStatus !== 'all' || limit !== 10 || page !== 1
    setSearchInput('')
    setSearch('')
    setCategory('')
    setStockStatus('all')
    setLimit(10)
    setPage(1)

    if (queryChanged) {
      setLoading(true)
    }
  }

  const changeMovementType = (event) => {
    setMovementLoading(true)
    setMovementPage(1)
    setMovementType(event.target.value)
  }

  const changeMovementDate = (setter) => (event) => {
    setMovementLoading(true)
    setMovementPage(1)
    setter(event.target.value)
  }

  const resetMovements = () => {
    const queryChanged = movementType !== '' || movementFrom !== '' || movementTo !== '' || movementPage !== 1
    setMovementType('')
    setMovementFrom('')
    setMovementTo('')
    setMovementPage(1)

    if (queryChanged) {
      setMovementLoading(true)
    }
  }

  const retry = () => {
    setError('')
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  const openStock = (product, locked, event) => {
    opener.current = event && event.currentTarget
    setDraft({
      product,
      locked,
      type: 'add',
      quantity: '',
      remarks: '',
      errors: {},
      formError: '',
    })
  }

  const closeStock = () => {
    if (submitLock.current) {
      return
    }

    setDraft(null)
    const trigger = opener.current
    if (trigger && trigger.isConnected) {
      trigger.focus()
    }
  }

  const updateDraft = (patch) => {
    setDraft((current) => (current ? { ...current, ...patch, errors: { ...current.errors, ...patch.clearErrors } } : current))
  }

  const chooseProduct = (event) => {
    const match = chooserProducts.find((product) => String(product.id) === event.target.value) || null
    setDraft((current) => (current ? { ...current, product: match, errors: {}, formError: '' } : current))
  }

  const submitStock = (event) => {
    event.preventDefault()

    if (!draft || submitLock.current) {
      return
    }

    const stock = draft.product ? Number(draft.product.stock_quantity) : 0
    const errors = {}
    const quantityMessage = draft.product ? quantityError(draft.quantity, draft.type, stock) : ''

    if (!draft.product) {
      errors.product = 'Select a product'
    }

    if (quantityMessage) {
      errors.quantity = quantityMessage
    }

    if (draft.remarks.trim().length > 500) {
      errors.remarks = 'Remarks must be 500 characters or fewer'
    }

    if (Object.keys(errors).length > 0) {
      setDraft((current) => (current ? { ...current, errors, formError: '' } : current))
      return
    }

    const productId = draft.product.id
    const type = draft.type
    const quantity = Number(draft.quantity)
    const remarks = draft.remarks.trim()
    submitLock.current = true
    setSaving(true)

    adjustStock(productId, { type, quantity, remarks })
      .then((result) => {
        toast.success(result.message, `stock:${productId}:${result.data.current_stock}`)
        setDraft(null)
        setAttempt((current) => current + 1)
      })
      .catch((requestError) => {
        const message = requestError instanceof ApiError ? requestError.message : 'Stock could not be updated'
        setDraft((current) => {
          if (!current) {
            return current
          }

          if (requestError instanceof ApiError && requestError.status === 409) {
            return { ...current, errors: { ...current.errors, quantity: message }, formError: '' }
          }

          return { ...current, formError: message }
        })
        toast.error(message, `stock-error:${message}`)
      })
      .finally(() => {
        submitLock.current = false
        setSaving(false)
      })
  }

  const exportInventory = async () => {
    if (exporting || total === 0) {
      if (total === 0) {
        toast.info('There are no inventory records to export')
      }
      return
    }

    setExporting(true)

    try {
      const rows = []
      let exportPage = 1
      let exportPages = 1

      while (exportPage <= exportPages && exportPage <= 50) {
        const result = await getInventory({ page: exportPage, limit: 100, search, category, stockStatus })
        rows.push(...result.products)
        exportPages = result.totalPages
        exportPage += 1
      }

      const header = ['Product Name', 'SKU', 'Category', 'Brand', 'Current Stock', 'Reorder Level', 'Stock Status', 'Active Status']
      const body = rows.map((product) => [
        product.name,
        product.sku,
        product.category,
        product.brand,
        product.stock_quantity,
        product.reorder_level,
        STATUS_LABELS[product.stock_status] || product.stock_status,
        product.is_active ? 'Active' : 'Inactive',
      ].map(csvCell).join(','))
      const blob = new Blob([`\uFEFF${[header.map(csvCell).join(','), ...body].join('\n')}`], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'bnc-inventory.csv'
      link.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${rows.length} inventory records`, `inventory-export:${rows.length}`)
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : requestError.message
      toast.error(message || 'The inventory could not be exported', `inventory-export:${message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="admin-inventory">
      <header className="admin-inventory-head">
        <div>
          <h1>
            <span className="admin-inventory-mark"><InventoryMark /></span>
            Inventory Management
          </h1>
          <p>Track stock levels, update inventory and monitor low-stock alerts.</p>
        </div>
        <div className="admin-inventory-actions">
          <button type="button" className="admin-inventory-export" onClick={exportInventory} disabled={exporting}>
            <DownloadIcon />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            type="button"
            className="admin-inventory-update"
            onClick={(event) => openStock(null, false, event)}
            disabled={loading || chooserProducts.length === 0}
          >
            <StockIcon />
            Update Stock
          </button>
        </div>
      </header>

      {summary ? (
        <section className="admin-inventory-kpis" aria-label="Inventory summary">
          <button type="button" className={stockStatus === 'all' ? 'is-selected' : ''} onClick={() => applyStatus('all')}>
            <span>Total Products</span>
            <strong>{formatCount(summary.total_products)}</strong>
            <small>Including inactive products</small>
          </button>
          <button type="button" className={stockStatus === 'in_stock' ? 'is-selected' : ''} onClick={() => applyStatus('in_stock')}>
            <span>In Stock</span>
            <strong>{formatCount(summary.in_stock)}</strong>
            <small>Above reorder level</small>
          </button>
          <button type="button" className={stockStatus === 'low_stock' ? 'is-selected' : ''} onClick={() => applyStatus('low_stock')}>
            <span>Low Stock</span>
            <strong>{formatCount(summary.low_stock)}</strong>
            <small>At or below reorder level</small>
          </button>
          <button type="button" className={stockStatus === 'out_of_stock' ? 'is-selected' : ''} onClick={() => applyStatus('out_of_stock')}>
            <span>Out of Stock</span>
            <strong>{formatCount(summary.out_of_stock)}</strong>
            <small>Active products at zero</small>
          </button>
          {lastUpdated ? (
            <div>
              <span>Last Updated</span>
              <strong className="is-time">{lastUpdated}</strong>
              <small>Latest stock movement</small>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="admin-inventory-panel" aria-labelledby="inventory-alerts-title">
        <div className="admin-inventory-panel-head">
          <div>
            <h2 id="inventory-alerts-title">Low Stock Alerts</h2>
            <p>Active products with stock above zero and at or below the reorder level.</p>
          </div>
          <button type="button" className="admin-inventory-text-button" onClick={() => applyStatus('out_of_stock')}>
            View out of stock
          </button>
        </div>
        {alerts.length === 0 ? (
          <p className="admin-inventory-empty">No active products are at or below their reorder level.</p>
        ) : (
          <ul className="admin-inventory-alerts">
            {alerts.map((product) => (
              <li key={product.id}>
                <ProductImage product={product} className="admin-inventory-thumb" />
                <div>
                  <strong>{product.name}</strong>
                  <small>{product.sku}</small>
                </div>
                <p>
                  <span>{formatCount(product.stock_quantity)} in stock</span>
                  <span>Reorder {formatCount(product.reorder_level)}</span>
                </p>
                <button type="button" onClick={(event) => openStock(product, true, event)}>
                  Update Stock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-inventory-panel">
        <div className="admin-inventory-tools">
          <label className="admin-inventory-search">
            <span className="admin-inventory-sr">Search inventory</span>
            <SearchIcon />
            <input
              type="search"
              value={searchInput}
              placeholder="Search name, SKU, or brand"
              onChange={onSearchChange}
            />
          </label>
          <label>
            <span className="admin-inventory-sr">Category</span>
            <select id="inventory-category" value={category} onChange={changeFilter(setCategory)} aria-label="Category">
              <option value="">All Categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="admin-inventory-sr">Stock status</span>
            <select id="inventory-status" value={stockStatus} onChange={changeFilter(setStockStatus)} aria-label="Stock status">
              <option value="all">All</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <button type="button" className="admin-inventory-reset" onClick={reset}>Reset</button>
        </div>

        {loading ? <InventorySkeleton /> : null}

        {!loading && error ? (
          <div className="admin-inventory-state">
            <h2>Inventory could not be loaded</h2>
            <p>{error}</p>
            <button type="button" onClick={retry}>Try again</button>
          </div>
        ) : null}

        {!loading && !error && products.length === 0 ? (
          <div className="admin-inventory-state">
            <h2>{filtered ? 'No matching products' : 'No products yet'}</h2>
            <p>{filtered ? 'Try another search or clear the filters.' : 'Products added to the catalogue will appear here.'}</p>
          </div>
        ) : null}

        {!loading && !error && products.length > 0 ? (
          <div className="admin-inventory-table-wrap">
            <table className="admin-inventory-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Product</th>
                  <th>SKU / Part Number</th>
                  <th>Category</th>
                  <th>Current Stock</th>
                  <th>Reorder Level</th>
                  <th>Stock Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product, index) => (
                  <tr key={product.id} className={product.is_active ? '' : 'is-inactive'}>
                    <td data-label="S.No">{(page - 1) * limit + index + 1}</td>
                    <td data-label="Product">
                      <div className="admin-inventory-product">
                        <ProductImage product={product} className="admin-inventory-thumb" />
                        <strong>{product.name}</strong>
                      </div>
                    </td>
                    <td data-label="SKU">{displayText(product.sku)}</td>
                    <td data-label="Category">{displayText(product.category)}</td>
                    <td data-label="Current Stock">{formatCount(product.stock_quantity)}</td>
                    <td data-label="Reorder Level">{formatCount(product.reorder_level)}</td>
                    <td data-label="Stock Status"><StatusBadge status={product.stock_status} /></td>
                    <td data-label="Actions">
                      <div className="admin-inventory-row-actions">
                        <Link
                          to={`/admin/products/${product.id}`}
                          data-tooltip="View product"
                          aria-label={`View ${product.name}`}
                          onMouseEnter={showTip}
                          onMouseLeave={hideTip}
                          onFocus={showTip}
                          onBlur={hideTip}
                        >
                          <EyeIcon />
                          <span className="admin-inventory-action-label">View</span>
                        </Link>
                        <button
                          type="button"
                          data-tooltip="Update stock"
                          aria-label={`Update stock for ${product.name}`}
                          onMouseEnter={showTip}
                          onMouseLeave={hideTip}
                          onFocus={showTip}
                          onBlur={hideTip}
                          onClick={(event) => openStock(product, true, event)}
                        >
                          <StockIcon />
                          <span className="admin-inventory-action-label">Update</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error && total > 0 ? (
          <footer className="admin-inventory-pager">
            <p>Showing {from} to {to} of {total} products</p>
            <div>
              <label>
                Rows
                <select value={limit} onChange={changeLimit} aria-label="Rows per page">
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
              <nav aria-label="Inventory pages">
                <button type="button" onClick={() => changePage(page - 1)} disabled={page <= 1}>Previous</button>
                {pages.map((item) => (
                  <button key={item} type="button" aria-current={item === page ? 'page' : undefined} onClick={() => changePage(item)} disabled={item === page}>
                    {item}
                  </button>
                ))}
                <button type="button" onClick={() => changePage(page + 1)} disabled={page >= totalPages}>Next</button>
              </nav>
            </div>
          </footer>
        ) : null}
      </section>

      <section className="admin-inventory-panel" aria-labelledby="inventory-movements-title">
        <div className="admin-inventory-panel-head">
          <div>
            <h2 id="inventory-movements-title">Recent Stock Movements</h2>
            <p>Manual adjustments, customer orders, cancellations, and purchase-order conversions.</p>
          </div>
        </div>
        <div className="admin-inventory-tools admin-inventory-movement-tools">
          <label>
            <span className="admin-inventory-sr">Movement type</span>
            <select id="inventory-movement-type" value={movementType} onChange={changeMovementType} aria-label="Movement type">
              <option value="">All movement types</option>
              {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="admin-inventory-date">
            From
            <input type="date" value={movementFrom} onChange={changeMovementDate(setMovementFrom)} aria-label="Movement start date" />
          </label>
          <label className="admin-inventory-date">
            To
            <input type="date" value={movementTo} onChange={changeMovementDate(setMovementTo)} aria-label="Movement end date" />
          </label>
          <button type="button" className="admin-inventory-reset" onClick={resetMovements}>Reset</button>
        </div>
        {movementLoading ? <InventorySkeleton /> : null}
        {!movementLoading && movementError ? (
          <div className="admin-inventory-state">
            <h2>Stock history could not be loaded</h2>
            <p>{movementError}</p>
            <button type="button" onClick={() => { setMovementError(''); setMovementLoading(true); setAttempt((current) => current + 1) }}>Try again</button>
          </div>
        ) : null}
        {!movementLoading && !movementError && movements.length === 0 ? (
          <p className="admin-inventory-empty">{movementFiltered ? 'No stock movements match these filters.' : 'No stock movements have been recorded yet.'}</p>
        ) : null}
        {!movementLoading && !movementError && movements.length > 0 ? (
          <div className="admin-inventory-table-wrap">
            <table className="admin-inventory-table admin-inventory-movements">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Movement Type</th>
                  <th>Quantity Changed</th>
                  <th>Previous Stock → New Stock</th>
                  <th>Remarks</th>
                  <th>Reference Number</th>
                  <th>Updated By</th>
                  <th>Date and Time</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => {
                  const referencePath = movementReference(movement)

                  return (
                    <tr key={movement.id}>
                      <td data-label="Product">
                        <strong>{movement.product_name}</strong>
                        <small>{movement.sku}</small>
                      </td>
                      <td data-label="Movement Type"><MovementBadge type={movement.movement_type} /></td>
                      <td data-label="Quantity Changed">{MOVEMENT_INCREASE[movement.movement_type] ? '+' : '−'}{formatCount(movement.adjustment_quantity)}</td>
                      <td data-label="Previous Stock → New Stock">{formatCount(movement.previous_quantity)} → {formatCount(movement.new_quantity)}</td>
                      <td data-label="Remarks">{displayText(movement.remarks)}</td>
                      <td data-label="Reference Number">
                        {referencePath ? <Link to={referencePath}>{movement.reference_number}</Link> : displayText(movement.reference_number)}
                      </td>
                      <td data-label="Updated By">{displayText(movement.updated_by_name)}</td>
                      <td data-label="Date and Time">{formatWhen(movement.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {!movementLoading && !movementError && movementTotal > 0 ? (
          <footer className="admin-inventory-pager">
            <p>Showing {movementFromRow} to {movementToRow} of {movementTotal} movements</p>
            <div>
              <nav aria-label="Stock movement pages">
                <button type="button" onClick={() => { setMovementLoading(true); setMovementPage(movementPage - 1) }} disabled={movementPage <= 1}>Previous</button>
                {movementPageList.map((item) => (
                  <button key={item} type="button" aria-current={item === movementPage ? 'page' : undefined} onClick={() => { setMovementLoading(true); setMovementPage(item) }} disabled={item === movementPage}>
                    {item}
                  </button>
                ))}
                <button type="button" onClick={() => { setMovementLoading(true); setMovementPage(movementPage + 1) }} disabled={movementPage >= movementPages}>Next</button>
              </nav>
            </div>
          </footer>
        ) : null}
      </section>

      {tip ? (
        <span className={`admin-inventory-tooltip${tip.above ? ' is-above' : ''}`} style={{ left: tip.left, top: tip.top }} role="tooltip">
          {tip.label}
        </span>
      ) : null}

      {draft ? (
        <div className="admin-inventory-modal-root">
          <div className="admin-inventory-modal-backdrop" />
          <div
            className="admin-inventory-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-stock-title"
            ref={modalRef}
          >
            <header>
              <h2 id="inventory-stock-title">Update Stock</h2>
              <button type="button" onClick={closeStock} disabled={saving} aria-label="Close">×</button>
            </header>
            <form onSubmit={submitStock}>
              {draft.locked || draft.product ? null : (
                <label>
                  Product
                  <select value="" onChange={chooseProduct} aria-invalid={Boolean(draft.errors.product)}>
                    <option value="">Select a product</option>
                    {chooserProducts.map((product) => (
                      <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>
                    ))}
                  </select>
                  {draft.errors.product ? <small className="is-error">{draft.errors.product}</small> : null}
                </label>
              )}

              {!draft.locked && draft.product ? (
                <label>
                  Product
                  <select value={draft.product.id} onChange={chooseProduct}>
                    {chooserProducts.map((product) => (
                      <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              {draft.product ? (
                <div className="admin-inventory-modal-product">
                  <ProductImage product={draft.product} className="admin-inventory-thumb" />
                  <div>
                    <strong>{draft.product.name}</strong>
                    <small>{draft.product.sku}</small>
                    <p>
                      <span>Current stock {formatCount(draft.product.stock_quantity)}</span>
                      <span>Reorder {formatCount(draft.product.reorder_level)}</span>
                    </p>
                    <StatusBadge status={draft.product.stock_status} />
                  </div>
                </div>
              ) : null}

              <fieldset>
                <legend>Update Type</legend>
                <label>
                  <input
                    type="radio"
                    name="inventory-update-type"
                    value="add"
                    checked={draft.type === 'add'}
                    onChange={() => updateDraft({ type: 'add', clearErrors: { quantity: '' } })}
                  />
                  Add Stock (Receive)
                </label>
                <label>
                  <input
                    type="radio"
                    name="inventory-update-type"
                    value="deduct"
                    checked={draft.type === 'deduct'}
                    onChange={() => updateDraft({ type: 'deduct', clearErrors: { quantity: '' } })}
                  />
                  Deduct Stock
                </label>
              </fieldset>

              <label>
                Quantity
                <input
                  id="inventory-quantity"
                  inputMode="numeric"
                  value={draft.quantity}
                  aria-invalid={Boolean(draft.errors.quantity)}
                  onChange={(event) => updateDraft({ quantity: event.target.value, clearErrors: { quantity: '' } })}
                />
                {draft.errors.quantity ? <small className="is-error">{draft.errors.quantity}</small> : null}
              </label>

              <label>
                Remarks
                <textarea
                  id="inventory-remarks"
                  rows="3"
                  maxLength={500}
                  value={draft.remarks}
                  placeholder="Stock received from supplier, damaged stock, or a manual correction"
                  aria-invalid={Boolean(draft.errors.remarks)}
                  onChange={(event) => updateDraft({ remarks: event.target.value, clearErrors: { remarks: '' } })}
                />
                {draft.errors.remarks ? <small className="is-error">{draft.errors.remarks}</small> : null}
              </label>

              {preview ? (
                <p className={`admin-inventory-preview${preview.blocked ? ' is-blocked' : ''}`}>
                  Current stock: {formatCount(preview.current)}
                  {preview.blocked
                    ? '. This deduction is greater than available stock.'
                    : `. Expected stock: ${formatCount(preview.next)}.`}
                </p>
              ) : null}

              {draft.formError ? <p className="admin-inventory-form-error">{draft.formError}</p> : null}

              <div className="admin-inventory-modal-actions">
                <button type="button" onClick={closeStock} disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving}>{saving ? 'Updating…' : 'Update Stock'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function InventorySkeleton() {
  return (
    <div className="admin-inventory-skeleton" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
    </div>
  )
}
