import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client.js'
import { deleteProduct, listProductCategories, listProducts, updateProductStatus } from '../../api/products.js'
import DeactivateProductDialog, { DeleteProductDialog } from '../../components/admin/DeactivateProductDialog.jsx'
import ProductImage from '../../components/products/ProductImage.jsx'
import Button from '../../components/ui/Button.jsx'
import ErrorMessage from '../../components/ui/ErrorMessage.jsx'
import { useToast } from '../../components/ui/ToastProvider.jsx'
import { formatMoney } from '../../utils/format.js'
import { stockStatus } from '../../utils/stock.js'
import '../../styles/admin-products.css'

const PAGE_SIZES = [5, 10, 20]

const displayText = (value) => (typeof value === 'string' && value.trim() ? value : '—')

const pageWindow = (page, totalPages) => {
  const count = Math.min(5, totalPages)
  const start = Math.max(1, Math.min(page - 2, totalPages - count + 1))
  return Array.from({ length: count }, (_, index) => start + index)
}

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

function Icon({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
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

function EditIcon() {
  return (
    <Icon>
      <path d="M4 20h4l10.2-10.2a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z" />
      <path d="M13 6.5 17.5 11" />
    </Icon>
  )
}

function PowerIcon() {
  return (
    <Icon>
      <path d="M12 3v8" />
      <path d="M7.2 6.2a7 7 0 1 0 9.6 0" />
    </Icon>
  )
}

function TrashIcon() {
  return (
    <Icon>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M8 7l.8 12h6.4L16 7" />
    </Icon>
  )
}

function PlusIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
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

function BoxIcon() {
  return (
    <Icon>
      <path d="M12 3.2 20.2 7.6 12 12 3.8 7.6z" />
      <path d="M3.8 7.6V16.4L12 20.8l8.2-4.4V7.6" />
      <path d="M12 12v8.8" />
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

export default function AdminProducts() {
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [pendingStatus, setPendingStatus] = useState(null)
  const [statusError, setStatusError] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [tip, setTip] = useState(null)
  const searchTimer = useRef(null)
  const tipTimer = useRef(null)
  const statusLock = useRef(false)
  const deleteLock = useRef(false)
  const categoriesLoaded = useRef(false)
  const filtered = Boolean(search || category || status !== 'all')

  useEffect(() => {
    let active = true

    listProducts({ page, limit, search, category, status })
      .then((result) => {
        if (!active) {
          return
        }

        if (result.totalPages > 0 && page > result.totalPages) {
          setPage(result.totalPages)
          return
        }

        setProducts(result.products)
        setTotal(Number.isInteger(result.total) ? result.total : 0)
        setTotalPages(result.totalPages)
        setError('')
        setLoading(false)

        if (categoriesLoaded.current) {
          return
        }

        listProductCategories({ status: 'all' })
          .then((values) => {
            if (!active) {
              return
            }

            categoriesLoaded.current = true
            setCategories(values)
          })
          .catch(() => {
            if (active) {
              setCategories([])
            }
          })
      })
      .catch((requestError) => {
        if (!active) {
          return
        }

        setProducts([])
        setTotal(0)
        setTotalPages(0)
        const message = requestError instanceof ApiError ? requestError.message : requestError.message
        setError(message)
        toast.error(message, `product-list:${page}:${limit}:${search}:${category}:${status}:${message}`)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [page, limit, search, category, status, attempt, toast])

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

  const retry = () => {
    setError('')
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  const changePage = (nextPage) => {
    setLoading(true)
    setPage(nextPage)
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

  const reset = () => {
    clearTimeout(searchTimer.current)
    const queryChanged = search !== '' || category !== '' || status !== 'all' || limit !== 10 || page !== 1
    setSearchInput('')
    setSearch('')
    setCategory('')
    setStatus('all')
    setLimit(10)
    setPage(1)

    if (queryChanged) {
      setLoading(true)
    }
  }

  const closeStatus = () => {
    if (statusLock.current) {
      return
    }

    setPendingStatus(null)
    setStatusError('')
  }

  const confirmStatus = () => {
    if (!pendingStatus || statusLock.current) {
      return
    }

    const { product, isActive } = pendingStatus
    statusLock.current = true
    setUpdatingStatus(true)
    setStatusError('')

    updateProductStatus(product.id, isActive)
      .then((result) => {
        const message = result.message || (isActive ? `${product.name} was activated.` : `${product.name} was deactivated.`)
        toast.success(message, `product-status:${product.id}:${isActive}`)
        setPendingStatus(null)
        setLoading(true)
        setAttempt((current) => current + 1)
      })
      .catch((requestError) => {
        const message = requestError instanceof ApiError ? requestError.message : requestError.message
        setStatusError(message)
        toast.error(message, `product-status:${product.id}:${isActive}`)
      })
      .finally(() => {
        statusLock.current = false
        setUpdatingStatus(false)
      })
  }

  const confirmDelete = () => {
    if (!pendingDelete || deleteLock.current) {
      return
    }

    deleteLock.current = true
    setDeleting(true)
    setDeleteError('')

    deleteProduct(pendingDelete.id)
      .then((result) => {
        const message = result.message || `${pendingDelete.name} was deactivated.`
        toast.success(message, `product-delete:${pendingDelete.id}`)
        setPendingDelete(null)
        setLoading(true)
        setAttempt((current) => current + 1)
      })
      .catch((requestError) => {
        const message = requestError instanceof ApiError ? requestError.message : requestError.message
        setDeleteError(message)
        toast.error(message, `product-delete:${pendingDelete.id}`)
      })
      .finally(() => {
        deleteLock.current = false
        setDeleting(false)
      })
  }

  const exportCatalogue = async () => {
    if (exporting) {
      return
    }

    setExporting(true)

    try {
      const rows = []
      let exportPage = 1
      let exportPages = 1

      while (exportPage <= exportPages && exportPage <= 50) {
        const result = await listProducts({ page: exportPage, limit: 100, search, category, status })
        rows.push(...result.products)
        exportPages = result.totalPages
        exportPage += 1
      }

      if (rows.length === 0) {
        toast.info('There are no products to export')
        return
      }

      const header = ['Name', 'SKU', 'Category', 'Brand', 'Unit', 'Price', 'Currency', 'Stock', 'Reorder level', 'Status', 'Description']
      const body = rows.map((product) => [
        product.name,
        product.sku,
        product.category,
        product.brand,
        product.unit,
        product.price,
        product.currency || 'INR',
        product.stock_quantity,
        product.reorder_level,
        product.is_active ? 'Active' : 'Inactive',
        product.description,
      ].map(csvCell).join(','))
      const blob = new Blob([`\uFEFF${[header.map(csvCell).join(','), ...body].join('\n')}`], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'bnc-products.csv'
      link.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${rows.length} products`)
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : requestError.message
      toast.error(message || 'The products could not be exported')
    } finally {
      setExporting(false)
    }
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)
  const pages = pageWindow(page, totalPages)

  return (
    <div className="admin-products">
      <header className="admin-products-head">
        <div>
          <h1><span className="admin-products-mark"><BoxIcon /></span> Products Management</h1>
          <p>Manage your product catalogue, stock and availability.</p>
        </div>
        <div className="admin-products-actions">
          <button type="button" className="admin-products-export" onClick={exportCatalogue} disabled={exporting || loading}>
            <DownloadIcon />
            {exporting ? 'Exporting' : 'Export'}
          </button>
          <Link className="admin-products-add" to="/admin/products/new">
            <PlusIcon />
            Add Product
          </Link>
        </div>
      </header>

      <section className="admin-products-card">
        <form
          className="admin-products-tools"
          onSubmit={(event) => {
            event.preventDefault()
            applySearch(searchInput)
          }}
        >
          <label className="admin-products-search">
            <SearchIcon />
            <span className="admin-products-sr">Search products</span>
            <input
              type="search"
              value={searchInput}
              onChange={onSearchChange}
              placeholder="Search by part number, product name or brand"
            />
          </label>
          <label>
            <span className="admin-products-sr">Category</span>
            <select value={category} onChange={changeFilter(setCategory)} aria-label="Category">
              <option value="">All Categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="admin-products-sr">Status</span>
            <select value={status} onChange={changeFilter(setStatus)} aria-label="Status">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <button type="button" className="admin-products-reset" onClick={reset}>
            Reset
          </button>
        </form>

        {loading ? <ProductSkeleton /> : null}
        {!loading && error ? (
          <div className="admin-products-state">
            <ErrorMessage message={error} />
            <Button onClick={retry}>Try again</Button>
          </div>
        ) : null}
        {!loading && !error && products.length === 0 ? (
          <div className="admin-products-state">
            <h2>{filtered ? 'No products found' : 'No products yet'}</h2>
            <p>{filtered ? 'No products match this search, category, or status.' : 'Add a product to start the catalogue.'}</p>
          </div>
        ) : null}

        {!loading && !error && products.length > 0 ? (
          <div className="admin-products-table-wrap">
            <table className="admin-products-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Part Number</th>
                  <th>Category</th>
                  <th>Brand</th>
                  <th>Price (₹)</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const level = stockStatus(product)
                  const name = displayText(product.name)

                  return (
                    <tr key={product.id}>
                      <td data-label="Product">
                        <div className="admin-product-identity">
                          <ProductImage product={product} className="admin-product-photo" />
                          <div className="admin-product-copy">
                            <strong
                              data-tooltip={name}
                              data-tooltip-clip=""
                              onMouseEnter={showTip}
                              onMouseLeave={hideTip}
                            >
                              {name}
                            </strong>
                            {product.description ? (
                              <small
                                data-tooltip={product.description}
                                data-tooltip-clip=""
                                onMouseEnter={showTip}
                                onMouseLeave={hideTip}
                              >
                                {product.description}
                              </small>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td
                        className="is-clip"
                        data-label="Part Number"
                        data-tooltip={product.sku}
                        data-tooltip-clip=""
                        onMouseEnter={showTip}
                        onMouseLeave={hideTip}
                      >
                        {product.sku}
                      </td>
                      <td data-label="Category"><span className="admin-product-chip">{displayText(product.category)}</span></td>
                      <td
                        className="is-clip"
                        data-label="Brand"
                        data-tooltip={displayText(product.brand)}
                        data-tooltip-clip=""
                        onMouseEnter={showTip}
                        onMouseLeave={hideTip}
                      >
                        {displayText(product.brand)}
                      </td>
                      <td data-label="Price">{formatMoney(product.price, product.currency || 'INR')}</td>
                      <td data-label="Stock"><span className={`admin-stock is-${level}`}>{product.stock_quantity}</span></td>
                      <td data-label="Status">
                        <span className={product.is_active ? 'admin-product-status is-active' : 'admin-product-status is-inactive'}>
                          {product.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td data-label="Actions">
                        <div className="admin-product-actions">
                          <Link
                            to={`/admin/products/${product.id}`}
                            aria-label={`View Product Details, ${product.name}`}
                            data-tooltip="View Product Details"
                            onMouseEnter={showTip}
                            onMouseLeave={hideTip}
                            onFocus={showTip}
                            onBlur={hideTip}
                            onClick={hideTip}
                          >
                            <EyeIcon />
                            <span className="admin-product-action-label" aria-hidden="true">View</span>
                          </Link>
                          <Link
                            to={`/admin/products/${product.id}/edit`}
                            aria-label={`Edit Product, ${product.name}`}
                            data-tooltip="Edit Product"
                            onMouseEnter={showTip}
                            onMouseLeave={hideTip}
                            onFocus={showTip}
                            onBlur={hideTip}
                            onClick={hideTip}
                          >
                            <EditIcon />
                            <span className="admin-product-action-label" aria-hidden="true">Edit</span>
                          </Link>
                          <button
                            type="button"
                            aria-label={`${product.is_active ? 'Deactivate Product' : 'Activate Product'}, ${product.name}`}
                            data-tooltip={product.is_active ? 'Deactivate Product' : 'Activate Product'}
                            disabled={updatingStatus || deleting}
                            onMouseEnter={showTip}
                            onMouseLeave={hideTip}
                            onFocus={showTip}
                            onBlur={hideTip}
                            onClick={() => {
                              hideTip()
                              setStatusError('')
                              setPendingStatus({ product, isActive: !product.is_active })
                            }}
                          >
                            <PowerIcon />
                            <span className="admin-product-action-label" aria-hidden="true">{product.is_active ? 'Deactivate' : 'Activate'}</span>
                          </button>
                          <button
                            type="button"
                            className="is-danger"
                            aria-label={`Delete Product, ${product.name}`}
                            data-tooltip="Delete Product"
                            disabled={updatingStatus || deleting}
                            onMouseEnter={showTip}
                            onMouseLeave={hideTip}
                            onFocus={showTip}
                            onBlur={hideTip}
                            onClick={() => {
                              hideTip()
                              setDeleteError('')
                              setPendingDelete(product)
                            }}
                          >
                            <TrashIcon />
                            <span className="admin-product-action-label" aria-hidden="true">Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error && total > 0 ? (
          <footer className="admin-products-pager">
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
              <nav aria-label="Product pages">
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

      {tip ? (
        <span className={`admin-product-tooltip${tip.above ? ' is-above' : ''}`} style={{ left: tip.left, top: tip.top }} role="tooltip">
          {tip.label}
        </span>
      ) : null}
      <DeactivateProductDialog
        product={pendingStatus ? pendingStatus.product : null}
        activating={Boolean(pendingStatus && pendingStatus.isActive)}
        busy={updatingStatus}
        error={statusError}
        onCancel={closeStatus}
        onConfirm={confirmStatus}
      />
      <DeleteProductDialog
        product={pendingDelete}
        busy={deleting}
        error={deleteError}
        onCancel={() => {
          if (!deleteLock.current) {
            setPendingDelete(null)
            setDeleteError('')
          }
        }}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function ProductSkeleton() {
  return (
    <div className="admin-products-skeleton" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
    </div>
  )
}
