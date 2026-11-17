import { useEffect, useId, useRef, useState } from 'react'
import { ApiError } from '../../api/client.js'
import { getProduct } from '../../api/products.js'
import ProductImage from '../products/ProductImage.jsx'
import { formatMoney } from '../../utils/format.js'

const textOf = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '')

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

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  )
}

export default function AdminOrderProductModal({ item, onClose }) {
  const titleId = useId()
  const closeRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const [product, setProduct] = useState(null)
  const [loadedId, setLoadedId] = useState(null)
  const [error, setError] = useState('')
  const [missing, setMissing] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const productId = item && item.product_id ? String(item.product_id) : ''

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!productId) {
      return undefined
    }

    let active = true

    getProduct(productId)
      .then((nextProduct) => {
        if (!active) {
          return
        }

        setProduct(nextProduct)
        setError('')
        setMissing(false)
        setLoadedId(productId)
      })
      .catch((requestError) => {
        if (!active) {
          return
        }

        setProduct(null)
        setMissing(requestError instanceof ApiError && requestError.status === 404)
        setError(requestError instanceof ApiError && requestError.status !== 404
          ? requestError.message
          : '')
        setLoadedId(productId)
      })

    return () => {
      active = false
    }
  }, [productId, attempt])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  if (!item) {
    return null
  }

  const loading = Boolean(productId) && loadedId !== productId
  const catalogue = !loading && product && String(product.id) === productId
  const savedName = textOf(item.product_name) || 'Ordered product'
  const savedSku = textOf(item.product_sku)

  return (
    <div
      className="admin-order-product-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="admin-order-product-card" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={loading}>
        <header>
          <h2 id={titleId}>{catalogue ? textOf(product.name) || savedName : savedName}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close product details">
            <CloseIcon />
          </button>
        </header>

        <div className="admin-order-product-columns">
          <section className="is-saved">
            <h3>Ordered on this order</h3>
            <dl>
              <div><dt>Product name</dt><dd>{savedName}</dd></div>
              <div><dt>SKU</dt><dd>{savedSku || '—'}</dd></div>
              <div><dt>Quantity</dt><dd>{item.quantity}</dd></div>
              <div><dt>Saved unit price</dt><dd>{formatMoney(item.unit_price, 'INR')}</dd></div>
              <div><dt>Line total</dt><dd>{formatMoney(item.line_total, 'INR')}</dd></div>
            </dl>
          </section>

          <section className="is-current">
            <h3>Current catalogue information</h3>
            {loading ? (
              <div className="admin-order-product-skeleton" aria-label="Loading product details">
                <span />
                <span />
              </div>
            ) : null}
            {!loading && (!productId || missing) ? (
              <p>Current catalogue details are unavailable. The product may have been removed.</p>
            ) : null}
            {!loading && error ? (
              <div className="admin-order-product-error">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setProduct(null)
                    setLoadedId(null)
                    setError('')
                    setMissing(false)
                    setAttempt((current) => current + 1)
                  }}
                >
                  Try again
                </button>
              </div>
            ) : null}
            {catalogue ? (
              <div className="admin-order-product-layout">
                <ProductImage product={product} className="admin-order-product-photo" />
                <dl>
                  <div><dt>Product name</dt><dd>{textOf(product.name) || '—'}</dd></div>
                  <div><dt>SKU</dt><dd>{textOf(product.sku) || '—'}</dd></div>
                  <div><dt>Brand</dt><dd>{textOf(product.brand) || '—'}</dd></div>
                  <div><dt>Category</dt><dd>{textOf(product.category) || '—'}</dd></div>
                  <div><dt>Description</dt><dd>{textOf(product.description) || '—'}</dd></div>
                  <div><dt>Current catalogue price</dt><dd>{formatMoney(product.price, product.currency || 'INR')}</dd></div>
                  <div><dt>Currency</dt><dd>{textOf(product.currency) || 'INR'}</dd></div>
                  <div><dt>Unit</dt><dd>{textOf(product.unit) || '—'}</dd></div>
                  <div><dt>Current stock</dt><dd>{Number.isFinite(Number(product.stock_quantity)) ? Number(product.stock_quantity).toLocaleString('en-IN') : '—'}</dd></div>
                  <div><dt>Reorder level</dt><dd>{Number.isFinite(Number(product.reorder_level)) ? Number(product.reorder_level).toLocaleString('en-IN') : '—'}</dd></div>
                  <div><dt>Status</dt><dd>{product.is_active === false ? 'Inactive' : 'Active'}</dd></div>
                  {formatWhen(product.created_at) ? <div><dt>Created</dt><dd>{formatWhen(product.created_at)}</dd></div> : null}
                  {formatWhen(product.updated_at) ? <div><dt>Last updated</dt><dd>{formatWhen(product.updated_at)}</dd></div> : null}
                </dl>
              </div>
            ) : null}
          </section>
        </div>
        <p className="admin-order-product-note">Current catalogue information may differ from the details saved when this order was placed.</p>
      </div>
    </div>
  )
}
