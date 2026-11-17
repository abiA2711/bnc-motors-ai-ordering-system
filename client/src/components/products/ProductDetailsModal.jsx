import { useEffect, useId, useRef, useState } from 'react'
import { ApiError } from '../../api/client.js'
import { getProduct } from '../../api/products.js'
import { formatMoney } from '../../utils/format.js'
import ErrorMessage from '../ui/ErrorMessage.jsx'
import ProductImage from './ProductImage.jsx'
import '../../styles/product-details-modal.css'

const textOf = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '')

const wholeNumber = (value) => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value
  }

  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value.trim())) {
    return Number(value.trim())
  }

  return null
}

function detailRows(product) {
  const rows = []
  const description = textOf(product.description)
  const unit = textOf(product.unit)
  const stock = wholeNumber(product.stock_quantity)
  const reorder = wholeNumber(product.reorder_level)

  if (description) rows.push(['Description', description])
  if (unit) rows.push(['Unit', unit])
  if (stock !== null) rows.push(['Current stock', stock.toLocaleString('en-IN')])
  if (reorder !== null) rows.push(['Reorder level', reorder.toLocaleString('en-IN')])

  return rows
}

export default function ProductDetailsModal({ productId, orderPriceLabel = '', onClose }) {
  const titleId = useId()
  const closeRef = useRef(null)
  const requestRef = useRef(0)
  const onCloseRef = useRef(onClose)
  const openerRef = useRef(null)
  const productIdRef = useRef(productId)
  const [attempt, setAttempt] = useState(0)
  const [trackedId, setTrackedId] = useState(productId)
  const [product, setProduct] = useState(null)
  const [loadedId, setLoadedId] = useState(null)
  const [error, setError] = useState('')

  if (trackedId !== productId) {
    setTrackedId(productId)
    setAttempt(0)
    setProduct(null)
    setLoadedId(null)
    setError('')
  }

  useEffect(() => {
    if (!productId) {
      return undefined
    }

    const requestId = requestRef.current + 1
    requestRef.current = requestId
    let active = true

    getProduct(productId)
      .then((nextProduct) => {
        if (!active || requestId !== requestRef.current) {
          return
        }
        setProduct(nextProduct)
        setError('')
        setLoadedId(String(productId))
      })
      .catch((requestError) => {
        if (!active || requestId !== requestRef.current) {
          return
        }
        setProduct(null)
        setLoadedId(String(productId))
        setError(requestError instanceof ApiError
          ? (requestError.status === 404 ? 'This product is no longer available in the catalogue.' : requestError.message)
          : 'This product could not be loaded')
      })

    return () => {
      active = false
    }
  }, [productId, attempt])

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousId = productIdRef.current
    productIdRef.current = productId

    if (!productId) {
      if (previousId && openerRef.current instanceof HTMLElement) {
        openerRef.current.focus()
      }
      openerRef.current = null
      return undefined
    }

    if (!openerRef.current || openerRef.current === document.body) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }

    const previousOverflow = document.body.style.overflow
    const previousPosition = document.body.style.position
    const previousTop = document.body.style.top
    const previousWidth = document.body.style.width
    const scrollY = window.scrollY
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    closeRef.current?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const dialog = closeRef.current?.closest('[role="dialog"]')
      if (!dialog) {
        return
      }

      const focusable = [...dialog.querySelectorAll('button, a[href], input, select, textarea')]
        .filter((element) => !element.disabled)
      if (focusable.length === 0) {
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.position = previousPosition
      document.body.style.top = previousTop
      document.body.style.width = previousWidth
      document.removeEventListener('keydown', onKeyDown)
      window.scrollTo(0, scrollY)
    }
  }, [productId])

  if (!productId) {
    return null
  }

  const loading = String(loadedId) !== String(productId)
  const visible = !loading && product && String(product.id) === String(productId)
  const brand = visible ? textOf(product.brand) : ''
  const category = visible ? textOf(product.category) : ''
  const sku = visible ? textOf(product.sku) : ''
  const price = visible ? formatMoney(product.price, product.currency || 'INR') : ''
  const currency = visible ? textOf(product.currency) : ''
  const status = visible ? (product.is_active === false ? 'Inactive' : product.is_active === true ? 'Active' : '') : ''
  const stock = visible ? wholeNumber(product.stock_quantity) : null
  const availability = stock === null ? '' : stock > 0 ? `${stock.toLocaleString('en-IN')} in stock` : 'Out of stock'
  const rows = visible ? detailRows(product) : []
  const paidPrice = textOf(orderPriceLabel)

  return (
    <div
      className="product-details-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="product-details-card" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={loading}>
        <header>
          <h2 id={titleId}>Product Details</h2>
          <button ref={closeRef} type="button" onClick={onClose}>Close</button>
        </header>
        {loading ? (
          <div className="product-details-skeleton" aria-label="Loading product details">
            <span />
            <span />
            <span />
          </div>
        ) : null}
        {!loading && error ? (
          <div className="product-details-error">
            <ErrorMessage message={error} />
            <button type="button" onClick={() => {
              setProduct(null)
              setLoadedId(null)
              setError('')
              setAttempt((current) => current + 1)
            }}
            >
              Retry
            </button>
          </div>
        ) : null}
        {visible ? (
          <div className="product-details-body">
            <div className="product-details-hero">
              <ProductImage product={product} className="product-details-photo" />
              <div>
                <h3>{textOf(product.name) || 'Product'}</h3>
                {sku ? <p>SKU {sku}</p> : null}
                {brand || category ? <p>{[brand, category].filter(Boolean).join(' · ')}</p> : null}
                {status ? <p className={product.is_active === false ? 'is-inactive' : 'is-active'}>{status}</p> : null}
              </div>
            </div>
            <section className="product-details-price" aria-label="Price and availability">
              {price && price !== 'Price unavailable' ? (
                <p>
                  <span>Current catalogue price{currency ? ` (${currency})` : ''}</span>
                  <strong>{price}</strong>
                </p>
              ) : null}
              {availability ? (
                <p>
                  <span>Availability</span>
                  <strong>{availability}</strong>
                </p>
              ) : null}
              {paidPrice ? (
                <p>
                  <span>Price on this order</span>
                  <strong>{paidPrice}</strong>
                </p>
              ) : null}
              {paidPrice ? <p className="product-details-note">The order price was saved when the order was placed. The catalogue price is the current product price.</p> : null}
            </section>
            {rows.length > 0 ? (
              <dl className="product-details-facts">
                {rows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
