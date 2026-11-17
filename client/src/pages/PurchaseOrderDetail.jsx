import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { listProducts, loadCataloguePrices } from '../api/products.js'
import { getPurchaseOrder, reviewPurchaseOrderMatch } from '../api/purchaseOrders.js'
import PurchaseOrderLines from '../components/purchase-orders/PurchaseOrderLines.jsx'
import PurchaseOrderPdf from '../components/purchase-orders/PurchaseOrderPdf.jsx'
import { extractedLineCount, reviewSummary } from '../components/purchase-orders/fields.js'
import Button from '../components/ui/Button.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import Loading from '../components/ui/Loading.jsx'
import { useToast } from '../components/ui/ToastProvider.jsx'
import { PURCHASE_ORDER_STATUSES } from '../purchase-orders/status.js'
import '../styles/purchase-orders.css'

const STATUS_LABELS = {
  uploaded: 'Uploaded',
  processing: 'Processing',
  review_required: 'In Review',
  partially_converted: 'Partially Converted',
  confirmed: 'Converted',
  failed: 'Failed',
}

const statusLabel = (status) => STATUS_LABELS[status] || 'Unknown'

const fileNameOf = (purchaseOrder) => {
  const name = purchaseOrder && typeof purchaseOrder.file_name === 'string' ? purchaseOrder.file_name.trim() : ''
  return name || 'Not available'
}

export default function PurchaseOrderDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const reviewing = useRef(null)
  const [purchaseOrder, setPurchaseOrder] = useState(null)
  const [loadedId, setLoadedId] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const catalogueRef = useRef({})
  const [catalogueById, setCatalogueById] = useState({})
  const [pendingItemId, setPendingItemId] = useState(null)
  const [itemErrors, setItemErrors] = useState({})

  useEffect(() => {
    let active = true

    getPurchaseOrder(id)
      .then((nextPurchaseOrder) => {
        if (!active) {
          return
        }

        setPurchaseOrder(nextPurchaseOrder)
        setItemErrors({})
        setError('')
        setLoadedId(id)
      })
      .catch((requestError) => {
        if (!active) {
          return
        }

        setPurchaseOrder(null)
        setError(requestError instanceof ApiError ? requestError.message : requestError.message)
        setLoadedId(id)
      })

    return () => {
      active = false
    }
  }, [id, attempt])

  const productKey = useMemo(() => {
    const ids = []
    const items = purchaseOrder && Array.isArray(purchaseOrder.items) ? purchaseOrder.items : []

    items.forEach((item) => {
      const matches = Array.isArray(item.matches) ? item.matches : []
      matches.forEach((match) => {
        if (match.product_id !== undefined && match.product_id !== null) {
          ids.push(String(match.product_id))
        }
      })
    })

    return [...new Set(ids)].sort().join(',')
  }, [purchaseOrder])

  useEffect(() => {
    const ids = productKey ? productKey.split(',') : []
    const missing = ids.filter((productId) => !catalogueRef.current[productId])

    if (missing.length === 0) {
      return undefined
    }

    let active = true

    loadCataloguePrices(missing)
      .then((result) => {
        if (!active) {
          return
        }

        Object.entries(result.products).forEach(([productId, product]) => {
          if (!catalogueRef.current[productId]) {
            catalogueRef.current[productId] = product
          }
        })
        setCatalogueById({ ...catalogueRef.current })
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [productKey])

  const loading = loadedId !== id
  const items = purchaseOrder && Array.isArray(purchaseOrder.items) ? purchaseOrder.items : []
  const summary = reviewSummary(items)
  const extractedCount = purchaseOrder ? extractedLineCount(purchaseOrder) : null
  const itemCount = items.length > 0 ? items.length : extractedCount
  const reviewable = Boolean(
    user
    && user.role === 'customer'
    && purchaseOrder
    && (purchaseOrder.status === 'review_required' || purchaseOrder.status === 'partially_converted'),
  )
  const knownStatus = purchaseOrder && PURCHASE_ORDER_STATUSES.includes(purchaseOrder.status)
  const matched = summary.accepted + summary.converted
  const linkedOrders = purchaseOrder && Array.isArray(purchaseOrder.orders) ? purchaseOrder.orders : []

  const reviewItem = async (itemId, action, productId) => {
    if (reviewing.current || !productId || user?.role !== 'customer') {
      return false
    }

    reviewing.current = String(itemId)
    setPendingItemId(String(itemId))
    setItemErrors((current) => {
      const next = { ...current }
      delete next[String(itemId)]
      return next
    })

    try {
      const savedPurchaseOrder = await reviewPurchaseOrderMatch(id, itemId, { action, productId })
      const nextPurchaseOrder = await getPurchaseOrder(id).catch(() => savedPurchaseOrder)
      setPurchaseOrder(nextPurchaseOrder)
      const message = action === 'reject'
        ? 'Suggested product rejected. Please choose the correct catalogue product.'
        : 'Product selected successfully.'
      toast.success(message, `po-match:${id}:${itemId}:${action}:${productId}:${message}`)
      return true
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : 'The match could not be reviewed'
      const unavailable = /inactive or does not exist|no longer available/i.test(message)
        ? 'This product is no longer available. Please choose another product.'
        : message
      setItemErrors((current) => ({ ...current, [String(itemId)]: unavailable }))
      toast.error(unavailable, `po-match:${id}:${itemId}:${action}:${productId}:${unavailable}`)
      return false
    } finally {
      reviewing.current = null
      setPendingItemId(null)
    }
  }

  const searchCatalogue = (term) => listProducts({ search: term, page: 1, limit: 8 }).then((list) => list.products)

  return (
    <div className="po-review">
      <header className="po-review-heading">
        <Link className="po-upload-back" to="/purchase-orders">Back to My Purchase Orders</Link>
        <h1>{reviewable ? 'Review Purchase Order' : 'Purchase Order'}</h1>
        {reviewable ? (
          <p>Verify extracted items, review AI suggestions and select the correct catalogue products. Accepted lines can be ordered while other lines stay on this purchase order.</p>
        ) : null}
      </header>
      {loading ? <Loading label="Loading purchase order" /> : null}
      {!loading && error ? (
        <section className="po-review-summary">
          <h2>Purchase order unavailable</h2>
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
      {!loading && !error && purchaseOrder ? (
        <>
          <section className="po-review-summary po-review-facts" aria-label="Purchase order summary">
            <div>
              <span>PO Number</span>
              <strong>{purchaseOrder.po_number}</strong>
            </div>
            <div>
              <span>File Name</span>
              <strong title={fileNameOf(purchaseOrder)}>{fileNameOf(purchaseOrder)}</strong>
            </div>
            <div>
              <span>Extracted Items</span>
              <strong>{itemCount === null ? '—' : itemCount.toLocaleString('en-IN')}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>
                <em className={knownStatus ? `po-badge is-${purchaseOrder.status}` : 'po-badge'}>{statusLabel(purchaseOrder.status)}</em>
              </strong>
            </div>
            <PurchaseOrderPdf purchaseOrderId={purchaseOrder.id} fileName={fileNameOf(purchaseOrder)} />
          </section>
          {purchaseOrder.processing_error ? <ErrorMessage message={purchaseOrder.processing_error} /> : null}
          {linkedOrders.length > 0 ? (
            <p className="po-review-note">
              Orders from this purchase order:
              {' '}
              {linkedOrders.map((order, index) => (
                <span key={order.id}>
                  {index > 0 ? ', ' : null}
                  <Link to={`/orders/${order.id}`}>{order.order_number}</Link>
                </span>
              ))}
            </p>
          ) : null}
          {items.length > 0 ? (
            <PurchaseOrderLines
              items={items}
              catalogueById={catalogueById}
              reviewable={reviewable}
              pendingItemId={pendingItemId}
              itemErrors={itemErrors}
              onSelect={(itemId, productId) => reviewItem(itemId, 'select', productId)}
              onReject={(itemId, productId) => reviewItem(itemId, 'reject', productId)}
              onSearch={searchCatalogue}
            />
          ) : (
            <section className="po-review-summary">
              <p>This purchase order has no extracted lines.</p>
            </section>
          )}
          <footer className="po-review-bar">
            <Link className="po-review-back" to="/purchase-orders">‹ Back to Purchase Orders</Link>
            <div className="po-review-meter">
              <p>{matched.toLocaleString('en-IN')} of {summary.total.toLocaleString('en-IN')} items matched</p>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={summary.total}
                aria-valuenow={matched}
                aria-label="Matching progress"
              >
                <span style={{ width: `${summary.total === 0 ? 0 : (matched / summary.total) * 100}%` }} />
              </div>
              <p className="po-review-counts">
                <strong>{summary.accepted.toLocaleString('en-IN')} accepted</strong>
                <span className="is-pending">{summary.pending.toLocaleString('en-IN')} pending</span>
                <span className="is-rejected">{summary.rejected.toLocaleString('en-IN')} rejected</span>
                <span className="is-converted">{summary.converted.toLocaleString('en-IN')} converted</span>
              </p>
              {reviewable ? <p className="po-review-keep">Unresolved lines will remain in the original purchase order.</p> : null}
            </div>
            <div className="po-review-action">
              {reviewable && summary.accepted > 0 ? (
                <Link className="po-review-continue" to={`/purchase-orders/${id}/confirm`}>Continue with Matched Items</Link>
              ) : null}
              {reviewable && summary.accepted === 0 ? (
                <button type="button" className="po-review-continue" disabled>Continue with Matched Items</button>
              ) : null}
            </div>
          </footer>
        </>
      ) : null}
    </div>
  )
}
