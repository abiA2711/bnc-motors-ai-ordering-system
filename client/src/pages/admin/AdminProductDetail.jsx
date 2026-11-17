import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client.js'
import { deleteProduct, getProduct, updateProductStatus } from '../../api/products.js'
import DeactivateProductDialog, { DeleteProductDialog } from '../../components/admin/DeactivateProductDialog.jsx'
import ProductImage from '../../components/products/ProductImage.jsx'
import Button from '../../components/ui/Button.jsx'
import ErrorMessage from '../../components/ui/ErrorMessage.jsx'
import { useToast } from '../../components/ui/ToastProvider.jsx'
import { formatMoney } from '../../utils/format.js'
import { readReorderLevel, readStockQuantity, stockStatus } from '../../utils/stock.js'
import '../../styles/admin-product-detail.css'

const displayText = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '')

const formatDateTime = (value) => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function Icon({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

function ArrowIcon() {
  return (
    <Icon>
      <path d="M15 6 9 12l6 6" />
    </Icon>
  )
}

function PencilIcon() {
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

function ExpandIcon() {
  return (
    <Icon>
      <path d="M9 4H4v5" />
      <path d="M15 4h5v5" />
      <path d="M20 15v5h-5" />
      <path d="M9 20H4v-5" />
    </Icon>
  )
}

function TagIcon() {
  return (
    <Icon>
      <path d="M12 3h7v7l-8.5 8.5a2 2 0 0 1-2.8 0L3.5 14.3a2 2 0 0 1 0-2.8z" />
      <circle cx="16" cy="8" r="1" />
    </Icon>
  )
}

function BrandIcon() {
  return (
    <Icon>
      <path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5z" />
      <path d="M12 12V4" />
    </Icon>
  )
}

function UnitIcon() {
  return (
    <Icon>
      <path d="M4 8h16v10H4z" />
      <path d="M8 8V6h8v2" />
    </Icon>
  )
}

function RupeeIcon() {
  return (
    <Icon>
      <path d="M7 5h10" />
      <path d="M7 9h10" />
      <path d="M7 5c4 0 6 2 6 4.5S10.5 14 7 14l7 6" />
    </Icon>
  )
}

function StockIcon() {
  return (
    <Icon>
      <path d="M12 3 4 7v10l8 4 8-4V7z" />
      <path d="M12 12 4 7" />
      <path d="m12 12 8-5" />
      <path d="M12 12v9" />
    </Icon>
  )
}

function BellIcon() {
  return (
    <Icon>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </Icon>
  )
}

function FileIcon() {
  return (
    <Icon>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
    </Icon>
  )
}

function InfoIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </Icon>
  )
}

function DetailHeader({ product, busy, onStatus, onDelete }) {
  return (
    <header className="admin-product-detail-head">
      <div className="admin-product-detail-title">
        <Link to="/admin/products" aria-label="Back to Products">
          <ArrowIcon />
        </Link>
        <div>
          <h1>Product Details</h1>
          <p>View complete information about this product.</p>
        </div>
      </div>
      {product ? (
        <div className="admin-product-detail-actions">
          <Link to={`/admin/products/${product.id}/edit`}>
            <PencilIcon />
            Edit Product
          </Link>
          <button type="button" className={product.is_active ? 'is-status' : 'is-activate'} disabled={busy} onClick={onStatus}>
            <PowerIcon />
            {product.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button type="button" className="is-delete" disabled={busy} onClick={onDelete}>
            <TrashIcon />
            Delete
          </button>
        </div>
      ) : null}
    </header>
  )
}

function DetailSkeleton() {
  return (
    <div className="admin-product-detail-skeleton" aria-hidden="true">
      <span />
      <span />
    </div>
  )
}

export default function AdminProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [product, setProduct] = useState(null)
  const [loadedId, setLoadedId] = useState(null)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [pendingStatus, setPendingStatus] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [zoom, setZoom] = useState(false)
  const statusLock = useRef(false)
  const deleteLock = useRef(false)
  const announced = useRef(false)
  const arrivalMessage = location.state && typeof location.state.message === 'string' ? location.state.message : ''

  useEffect(() => {
    let active = true

    getProduct(id)
      .then((nextProduct) => {
        if (!active) {
          return
        }

        setProduct(nextProduct)
        setError(null)
        setLoadedId(id)
      })
      .catch((requestError) => {
        if (!active) {
          return
        }

        const requestStatus = requestError instanceof ApiError ? requestError.status : 0
        setProduct(null)
        setError({
          message: requestError instanceof ApiError ? requestError.message : requestError.message,
          status: requestStatus,
        })
        setLoadedId(id)
      })

    return () => {
      active = false
    }
  }, [id, attempt])

  useEffect(() => {
    if (announced.current || !arrivalMessage) {
      return
    }

    announced.current = true
    toast.success(arrivalMessage, 'product-detail-arrival')
  }, [arrivalMessage, toast])

  useEffect(() => {
    if (!zoom) {
      return undefined
    }

    const onKey = (event) => {
      if (event.key === 'Escape') {
        setZoom(false)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom])

  const loading = loadedId !== id
  const notFound = Boolean(error && (error.status === 404 || error.status === 400))
  const busy = updatingStatus || deleting

  const confirmStatus = () => {
    if (!product || statusLock.current) {
      return
    }

    const nextActive = !product.is_active
    statusLock.current = true
    setUpdatingStatus(true)
    setStatusError('')

    updateProductStatus(product.id, nextActive)
      .then((result) => {
        const nextMessage = result.message || (nextActive ? `${product.name} was activated.` : `${product.name} was deactivated.`)
        setProduct(result.product)
        setPendingStatus(false)
        toast.success(nextMessage, `product-status:${product.id}:${nextActive}`)
      })
      .catch((requestError) => {
        const nextMessage = requestError instanceof ApiError ? requestError.message : requestError.message
        setStatusError(nextMessage)
        toast.error(nextMessage, `product-status:${product.id}:${nextActive}`)
      })
      .finally(() => {
        statusLock.current = false
        setUpdatingStatus(false)
      })
  }

  const confirmDelete = () => {
    if (!product || deleteLock.current) {
      return
    }

    deleteLock.current = true
    setDeleting(true)
    setDeleteError('')

    deleteProduct(product.id)
      .then((result) => {
        const nextMessage = result.message || `${product.name} was deactivated.`
        toast.success(nextMessage, `product-delete:${product.id}`)
        navigate('/admin/products')
      })
      .catch((requestError) => {
        const nextMessage = requestError instanceof ApiError ? requestError.message : requestError.message
        setDeleteError(nextMessage)
        toast.error(nextMessage, `product-delete:${product.id}`)
        deleteLock.current = false
        setDeleting(false)
      })
  }

  const name = product ? displayText(product.name) || 'Unnamed product' : ''
  const description = product ? displayText(product.description) : ''
  const category = product ? displayText(product.category) : ''
  const brand = product ? displayText(product.brand) : ''
  const unit = product ? displayText(product.unit) : ''
  const created = product ? formatDateTime(product.created_at) : ''
  const updated = product ? formatDateTime(product.updated_at) : ''
  const stock = product ? readStockQuantity(product) : null
  const reorder = product ? readReorderLevel(product) : null
  const level = product ? stockStatus(product) : 'unknown'
  const metadata = product
    ? [
        category ? ['Category', category] : null,
        ['Status', product.is_active ? 'Active' : 'Inactive', product.is_active ? 'is-active' : 'is-inactive'],
        created ? ['Created On', created] : null,
        updated ? ['Last Updated', updated] : null,
      ].filter(Boolean)
    : []

  return (
    <div className="admin-product-detail">
      <DetailHeader
        product={loading || error ? null : product}
        busy={busy}
        onStatus={() => {
          setStatusError('')
          setPendingStatus(true)
        }}
        onDelete={() => {
          setDeleteError('')
          setPendingDelete(true)
        }}
      />

      {loading ? <DetailSkeleton /> : null}

      {!loading && notFound ? (
        <section className="admin-product-detail-state">
          <h2>Product not found</h2>
          <p>{error.message || 'This product could not be found.'}</p>
          <Link to="/admin/products">Back to Products</Link>
        </section>
      ) : null}

      {!loading && error && !notFound ? (
        <section className="admin-product-detail-state">
          <h2>Product details unavailable</h2>
          <ErrorMessage message={error.message} />
          <Button onClick={() => {
            setError(null)
            setLoadedId(null)
            setAttempt((current) => current + 1)
          }}
          >
            Try again
          </Button>
        </section>
      ) : null}

      {!loading && !error && product ? (
        <article className="admin-product-detail-card">
          <div className="admin-product-detail-media">
            <ProductImage product={product} className="admin-product-detail-photo" />
            <button type="button" aria-label="View larger image" onClick={() => setZoom(true)}>
              <ExpandIcon />
            </button>
          </div>
          <div className="admin-product-detail-body">
            <h2>{name}</h2>
            <div className="admin-product-detail-badges">
              <span className={product.is_active ? 'is-active' : 'is-inactive'}>
                {product.is_active ? 'Active' : 'Inactive'}
              </span>
              {category ? <span className="is-category">{category}</span> : null}
            </div>
            <dl className="admin-product-detail-tiles">
              <div>
                <dt><TagIcon /> Part Number (SKU)</dt>
                <dd>{displayText(product.sku) || 'Not set'}</dd>
              </div>
              <div>
                <dt><BrandIcon /> Brand</dt>
                <dd>{brand || 'Not set'}</dd>
              </div>
              <div>
                <dt><UnitIcon /> Unit</dt>
                <dd>{unit || 'Not set'}</dd>
              </div>
              <div>
                <dt><RupeeIcon /> Price</dt>
                <dd>{formatMoney(product.price, product.currency || 'INR')}</dd>
              </div>
              <div>
                <dt><StockIcon /> Stock Quantity</dt>
                <dd className={`is-stock is-${level}`}>{stock === null ? 'Not available' : stock.toLocaleString('en-IN')}</dd>
              </div>
              <div>
                <dt><BellIcon /> Reorder Level</dt>
                <dd>{reorder === null ? 'Not available' : reorder.toLocaleString('en-IN')}</dd>
              </div>
            </dl>
            <section className="admin-product-detail-description">
              <h3><FileIcon /> Description</h3>
              {description ? <p>{description}</p> : <p className="is-empty">No description has been added for this product.</p>}
            </section>
            {metadata.length > 0 ? (
              <section className="admin-product-detail-meta">
                <h3><InfoIcon /> Product Information</h3>
                <dl>
                  {metadata.map(([label, value, tone]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd className={tone || undefined}>{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
          </div>
        </article>
      ) : null}

      {zoom && product ? (
        <div className="dialog-backdrop" onClick={() => setZoom(false)}>
          <section
            className="admin-product-detail-zoom panel dialog"
            role="dialog"
            aria-modal="true"
            aria-label={name}
            onClick={(event) => event.stopPropagation()}
          >
            <ProductImage product={product} className="admin-product-detail-photo" />
            <Button variant="ghost" onClick={() => setZoom(false)}>Close</Button>
          </section>
        </div>
      ) : null}

      <DeactivateProductDialog
        product={pendingStatus && product ? product : null}
        activating={Boolean(product && !product.is_active)}
        busy={updatingStatus}
        error={statusError}
        onCancel={() => {
          if (!statusLock.current) {
            setPendingStatus(false)
            setStatusError('')
          }
        }}
        onConfirm={confirmStatus}
      />

      <DeleteProductDialog
        product={pendingDelete && product ? product : null}
        busy={deleting}
        error={deleteError}
        onCancel={() => {
          if (!deleteLock.current) {
            setPendingDelete(false)
            setDeleteError('')
          }
        }}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
