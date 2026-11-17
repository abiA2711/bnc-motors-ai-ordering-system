import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { getProduct, listRelatedProducts } from '../api/products.js'
import { useCart } from '../cart/CartContext.jsx'
import { CartIcon } from '../components/auth/icons.jsx'
import ProductCard from '../components/products/ProductCard.jsx'
import ProductImage from '../components/products/ProductImage.jsx'
import { useToast } from '../components/ui/ToastProvider.jsx'
import Button from '../components/ui/Button.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import Loading from '../components/ui/Loading.jsx'
import { formatMoney } from '../utils/format.js'
import { readStockQuantity, stockProblem, stockStatus, stockStatusLabel } from '../utils/stock.js'
import '../styles/catalogue.css'
import '../styles/product-detail.css'

const textOf = (value) => (typeof value === 'string' ? value.trim() : '')

const photosOf = (product) => {
  const image = textOf(product && product.image_url)
  return image ? [image] : []
}

const specificationsOf = (product) => [
  ['SKU', product.sku],
  ['Brand', product.brand],
  ['Category', product.category],
  ['Unit', product.unit],
].filter(([, value]) => textOf(value))

const tabs = [
  { key: 'description', label: 'Description' },
  { key: 'specifications', label: 'Specifications' },
  { key: 'compatibility', label: 'Compatibility' },
]

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5" />
    </svg>
  )
}

function TabIcon({ name }) {
  if (name === 'specifications') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />
      </svg>
    )
  }

  if (name === 'compatibility') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 12h8M12 8v8M5 5h5v5H5zM14 14h5v5h-5z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v6h6M8 13h8M8 17h6" />
    </svg>
  )
}

export default function ProductDetail() {
  const { id } = useParams()
  const { addProduct } = useCart()
  const toast = useToast()
  const zoomRef = useRef(null)
  const [product, setProduct] = useState(null)
  const [related, setRelated] = useState([])
  const [relatedLoadedId, setRelatedLoadedId] = useState(null)
  const [relatedError, setRelatedError] = useState('')
  const [relatedAttempt, setRelatedAttempt] = useState(0)
  const [loadedId, setLoadedId] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [tab, setTab] = useState('description')
  const [photo, setPhoto] = useState(0)
  const [zoom, setZoom] = useState(false)

  useEffect(() => {
    let active = true

    getProduct(id)
      .then((nextProduct) => {
        if (!active) {
          return
        }

        setProduct(nextProduct)
        setError('')
        setLoadedId(id)
        setQuantity(1)
        setTab('description')
        setPhoto(0)
        setZoom(false)
      })
      .catch((requestError) => {
        if (!active) {
          return
        }

        setProduct(null)
        setError(requestError instanceof ApiError ? requestError.message : 'This product could not be loaded')
        setLoadedId(id)
      })

    return () => {
      active = false
    }
  }, [id, attempt])

  useEffect(() => {
    let active = true

    listRelatedProducts(id)
      .then((products) => {
        if (!active) {
          return
        }

        setRelated(products)
        setRelatedError('')
        setRelatedLoadedId(id)
      })
      .catch((requestError) => {
        if (!active) {
          return
        }

        setRelated([])
        setRelatedError(requestError instanceof ApiError ? requestError.message : 'Related products could not be loaded')
        setRelatedLoadedId(id)
      })

    return () => {
      active = false
    }
  }, [id, relatedAttempt])

  useEffect(() => {
    const dialog = zoomRef.current
    if (!zoom || !dialog) {
      return undefined
    }

    if (!dialog.open) {
      dialog.showModal()
    }

    return () => {
      if (dialog.open) {
        dialog.close()
      }
    }
  }, [zoom])

  const loading = loadedId !== id
  const relatedLoading = relatedLoadedId !== id
  const showRelated = !loading && !error && product && (relatedLoading || relatedError || related.length > 0)
  const stock = product ? readStockQuantity(product) : null
  const inactive = Boolean(product && product.is_active === false)
  const inStock = !inactive && stock !== null && stock > 0
  const photos = product ? photosOf(product) : []
  const selectedPhoto = photos[Math.min(photo, Math.max(photos.length - 1, 0))] || ''
  const preview = product && selectedPhoto ? { ...product, image_url: selectedPhoto } : product
  const specs = product ? specificationsOf(product) : []
  const description = textOf(product && product.description)

  const changeQuantity = (next) => {
    if (!inStock) {
      return
    }

    setQuantity((current) => {
      const value = typeof next === 'function' ? next(current) : next
      if (!Number.isInteger(value)) {
        return current
      }
      return Math.min(stock, Math.max(1, value))
    })
  }

  const add = () => {
    const key = `cart-add:${product.id}`
    const problem = stockProblem({ ...product, quantity })

    if (problem) {
      toast.error(problem, key)
      return
    }

    const result = addProduct(product, quantity)
    if (result.ok) {
      toast.success(
        result.capped
          ? `Only ${stock} available. The cart now has ${result.quantity}.`
          : `${product.name} added to cart`,
        key,
      )
      return
    }

    toast.error(result.message, key)
  }

  return (
    <div className="pdp">
      <nav className="pdp-crumb" aria-label="Breadcrumb">
        <Link to="/">
          <HomeIcon />
          Home
        </Link>
        <span aria-hidden="true">›</span>
        <Link to="/products">Products</Link>
        {product ? (
          <>
            <span aria-hidden="true">›</span>
            <span aria-current="page">{product.name}</span>
          </>
        ) : null}
      </nav>
      {loading ? <Loading label="Loading product" /> : null}
      {!loading && error ? (
        <section className="pdp-card pdp-missing">
          <h1>Product unavailable</h1>
          <ErrorMessage message={error} />
          <Button onClick={() => {
            setError('')
            setLoadedId(null)
            setAttempt((current) => current + 1)
          }}
          >
            Try again
          </Button>
        </section>
      ) : null}
      {!loading && !error && product ? (
        <>
          <article className="pdp-card">
            <div className={`pdp-gallery${photos.length > 1 ? ' has-thumbs' : ''}`}>
              <div className="pdp-stage">
                <ProductImage product={preview} />
                <button type="button" className="pdp-zoom-button" aria-label="View larger image" onClick={() => setZoom(true)}>
                  <ExpandIcon />
                </button>
              </div>
              {photos.length > 1 ? (
                <div className="pdp-thumbs" role="list">
                  {photos.map((src, index) => (
                    <button
                      key={src}
                      type="button"
                      role="listitem"
                      aria-label={`Show image ${index + 1}`}
                      aria-pressed={index === photo}
                      onClick={() => setPhoto(index)}
                    >
                      <ProductImage product={{ ...product, image_url: src }} />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="pdp-buy">
              <h1>{product.name}</h1>
              <p className="pdp-sku">SKU: {product.sku}</p>
              <div className="pdp-facts">
                {textOf(product.brand) ? <span>Brand: <b>{product.brand}</b></span> : null}
                {textOf(product.category) ? <span>Category: <b>{product.category}</b></span> : null}
              </div>
              <p className="pdp-price">{formatMoney(product.price, product.currency || 'INR')}</p>
              <p className={`pdp-stock is-${stockStatus(product)}`}>
                <span className="pdp-stock-badge">{stockStatusLabel[stockStatus(product)]}</span>
                {stock !== null ? <strong>{stock.toLocaleString('en-IN')} units available</strong> : null}
              </p>
              {inStock ? (
                <div className="pdp-actions">
                  <div className="pdp-quantity">
                    <span id={`qty-${product.id}`}>Quantity</span>
                    <div role="group" aria-labelledby={`qty-${product.id}`}>
                      <button type="button" aria-label="Decrease quantity" onClick={() => changeQuantity((current) => current - 1)} disabled={quantity <= 1}>−</button>
                      <input
                        type="number"
                        min="1"
                        max={stock}
                        value={quantity}
                        aria-label="Quantity"
                        onChange={(event) => {
                          const next = Number(event.target.value)
                          if (!Number.isInteger(next)) {
                            return
                          }
                          changeQuantity(next)
                        }}
                      />
                      <button type="button" aria-label="Increase quantity" onClick={() => changeQuantity((current) => current + 1)} disabled={quantity >= stock}>+</button>
                    </div>
                  </div>
                  <button type="button" className="pdp-cart" onClick={add}>
                    <CartIcon />
                    Add to Cart
                  </button>
                </div>
              ) : (
                <button type="button" className="pdp-cart" disabled>
                  {inactive ? 'Unavailable' : 'Out of Stock'}
                </button>
              )}
            </div>
            <section className="pdp-info">
              <div className="pdp-tabs" role="tablist" aria-label="Product information">
                {tabs.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    id={`tab-${item.key}`}
                    aria-selected={tab === item.key}
                    aria-controls={`panel-${item.key}`}
                    onClick={() => setTab(item.key)}
                  >
                    <TabIcon name={item.key} />
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="pdp-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === 'description' ? (
                  description ? <p>{description}</p> : <p className="pdp-empty">No description is available for this product.</p>
                ) : null}
                {tab === 'specifications' ? (
                  specs.length > 0 ? (
                    <dl>
                      {specs.map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : <p className="pdp-empty">No specifications are available for this product.</p>
                ) : null}
                {tab === 'compatibility' ? <p className="pdp-empty">No compatibility information is available for this product.</p> : null}
              </div>
            </section>
          </article>
          {showRelated ? (
            <section className="pdp-related" aria-label="Related products" aria-busy={relatedLoading}>
              <div className="pdp-related-head">
                <h2>Related Products</h2>
                <Link to="/products">View All</Link>
              </div>
              {relatedLoading ? (
                <div className="pdp-related-state">
                  <Loading label="Loading related products" />
                </div>
              ) : null}
              {!relatedLoading && relatedError ? (
                <div className="pdp-related-state">
                  <ErrorMessage message={relatedError} />
                  <Button onClick={() => {
                    setRelatedError('')
                    setRelatedLoadedId(null)
                    setRelatedAttempt((current) => current + 1)
                  }}
                  >
                    Try again
                  </Button>
                </div>
              ) : null}
              {!relatedLoading && !relatedError && related.length > 0 ? (
                <div className="pdp-related-grid">
                  {related.map((item) => (
                    <ProductCard key={item.id} product={item} />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
          {zoom ? (
            <dialog
              ref={zoomRef}
              className="pdp-zoom"
              aria-label={`${product.name} image`}
              onCancel={(event) => {
                event.preventDefault()
                setZoom(false)
              }}
              onClick={(event) => {
                if (event.target === zoomRef.current) {
                  setZoom(false)
                }
              }}
            >
              <button type="button" onClick={() => setZoom(false)}>Close</button>
              <ProductImage product={preview} />
            </dialog>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
