import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client.js'
import { fetchPurchaseOrderPdf, getPurchaseOrder } from '../../api/purchaseOrders.js'
import ProductImage from '../../components/products/ProductImage.jsx'
import { lineCustomerState } from '../../components/purchase-orders/fields.js'
import {
  LINE_STATE_LABELS,
  matchScoreLabel,
  primaryMatch,
  progressFromItems,
  purchaseOrderStatusLabel,
} from '../../purchase-orders/conversion.js'
import { formatMoney, formatStatus } from '../../utils/format.js'
import '../../styles/admin-purchase-orders.css'

const ITEM_FILTERS = [
  { key: 'all', label: 'All Items' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'pending', label: 'Pending' },
  { key: 'converted', label: 'Converted' },
]

const textValue = (value) => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return ''
}

const formatWhen = (value) => {
  if (!value) {
    return 'Not available'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Not available'
  }

  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const formatFileSize = (value) => {
  const bytes = Number(value)

  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'Not available'
  }

  if (bytes < 1024) {
    return `${Math.round(bytes)} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const safeFileName = (value) => {
  const base = textValue(value).split(/[/\\]/).pop() || 'purchase-order.pdf'
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
}

const labelize = (key) => key.replaceAll('_', ' ').replace(/^\w/, (letter) => letter.toUpperCase())

const extraExtracted = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return []
  }

  const skip = new Set(['description', 'sku', 'extracted_sku', 'name', 'product_name', 'quantity', 'unit', 'unit_price', 'line_total'])

  return Object.entries(raw).flatMap(([key, value]) => {
    if (skip.has(key)) {
      return []
    }

    if (typeof value === 'string') {
      const text = value.trim()
      if (!text || /uploads[/\\]purchase-orders|[/\\]/.test(text)) {
        return []
      }
      return [[labelize(key), text]]
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return [[labelize(key), String(value)]]
    }

    if (typeof value === 'boolean') {
      return [[labelize(key), value ? 'Yes' : 'No']]
    }

    return []
  })
}

function Icon({ children }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
}

function EyeIcon() {
  return <Icon><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.5" /></Icon>
}

function DownloadIcon() {
  return <Icon><path d="M12 4v10" /><path d="m8 10 4 4 4-4" /><path d="M5 18h14" /></Icon>
}

function PurchaseOrderDocument({ pdf, fileName, onDownload, onRetry }) {
  return (
    <div className="admin-po-pdf" id="po-pdf">
      <div className="admin-po-pdf-toolbar">
        <button type="button" className="is-primary" onClick={() => window.open(pdf.url, '_blank', 'noopener')} disabled={pdf.status !== 'ready'}>
          <EyeIcon />
          View PDF
        </button>
        <button type="button" onClick={onDownload} disabled={pdf.status !== 'ready'}>
          <DownloadIcon />
          Download PDF
        </button>
      </div>
      {pdf.status === 'loading' ? (
        <div className="admin-po-pdf-loading" aria-label="Loading purchase order PDF">
          <span />
          <span />
        </div>
      ) : null}
      {pdf.status === 'error' ? (
        <div className="admin-po-pdf-error">
          <p>{pdf.error}</p>
          <button type="button" onClick={onRetry}>Try again</button>
        </div>
      ) : null}
      {pdf.status === 'ready' ? <iframe title={safeFileName(fileName)} src={pdf.url} /> : null}
    </div>
  )
}

function ItemExpansion({ item, currency }) {
  const match = primaryMatch(item)
  const extras = extraExtracted(item.raw_extracted_data)
  const score = match ? matchScoreLabel(match.match_score) : ''
  const catalogue = match && match.product_id ? {
    id: match.product_id,
    name: textValue(match.product_name),
    sku: textValue(match.product_sku),
    image_url: textValue(match.product_image_url),
    brand: textValue(match.product_brand),
    category: textValue(match.product_category),
    description: textValue(match.product_description),
    unit: textValue(match.product_unit),
    price: match.product_price,
    currency: textValue(match.product_currency) || 'INR',
    stock_quantity: match.product_stock_quantity,
    reorder_level: match.product_reorder_level,
    is_active: match.product_is_active,
  } : null
  const stock = catalogue && Number.isFinite(Number(catalogue.stock_quantity)) ? Number(catalogue.stock_quantity).toLocaleString('en-IN') : '—'
  const reorder = catalogue && Number.isFinite(Number(catalogue.reorder_level)) ? Number(catalogue.reorder_level).toLocaleString('en-IN') : '—'

  return (
    <div className="admin-po-expand">
      <div className="admin-po-extract">
        <h3>Original extracted PO information</h3>
        <div className="admin-po-grid">
          <p><span>Description</span><strong>{textValue(item.description) || textValue(item.extracted_name) || 'Not available'}</strong></p>
          <p><span>Extracted SKU</span><strong>{textValue(item.extracted_sku) || 'Not available'}</strong></p>
          <p><span>Quantity</span><strong>{textValue(item.quantity) || 'Not available'}</strong></p>
          <p><span>Unit</span><strong>{textValue(item.unit) || 'Not available'}</strong></p>
          <p><span>Unit price</span><strong>{item.unit_price === null || item.unit_price === undefined || item.unit_price === '' ? 'Not available' : formatMoney(item.unit_price, currency)}</strong></p>
          <p><span>Line total</span><strong>{item.line_total === null || item.line_total === undefined || item.line_total === '' ? 'Not available' : formatMoney(item.line_total, currency)}</strong></p>
          {item.converted_quantity !== null && item.converted_quantity !== undefined ? <p><span>Converted quantity</span><strong>{textValue(item.converted_quantity)}</strong></p> : null}
          {extras.map(([label, value]) => <p key={label}><span>{label}</span><strong>{value}</strong></p>)}
        </div>
      </div>
      <div className="admin-po-catalogue">
        <h3>Matched catalogue product</h3>
        {catalogue ? (
          <div className="admin-po-catalogue-layout">
            <ProductImage product={catalogue} className="admin-po-photo" />
            <div className="admin-po-grid">
              <p><span>Product</span><strong>{catalogue.name || '—'}</strong></p>
              <p><span>SKU</span><strong>{catalogue.sku || '—'}</strong></p>
              <p><span>Brand</span><strong>{catalogue.brand || '—'}</strong></p>
              <p><span>Category</span><strong>{catalogue.category || '—'}</strong></p>
              <p><span>Current catalogue price</span><strong>{formatMoney(catalogue.price, catalogue.currency)}</strong></p>
              <p><span>Current stock</span><strong>{stock}</strong></p>
              <p><span>Reorder level</span><strong>{reorder}</strong></p>
              <p><span>Status</span><strong>{catalogue.is_active === false ? 'Inactive' : 'Active'}</strong></p>
              {score ? <p><span>Match score</span><strong>{score}</strong></p> : null}
            </div>
          </div>
        ) : <p>No catalogue product is stored for this line.</p>}
        <p className="admin-pos-note">Current catalogue information may differ from the details extracted when this purchase order was matched.</p>
      </div>
    </div>
  )
}

function PurchaseOrderBody({ purchaseOrder }) {
  const [itemFilter, setItemFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [pdfAttempt, setPdfAttempt] = useState(0)
  const [pdf, setPdf] = useState({ status: 'loading', url: '', error: '' })

  useEffect(() => {
    let active = true
    let url = ''

    fetchPurchaseOrderPdf(purchaseOrder.id)
      .then((blob) => {
        const nextUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
        if (!active) {
          URL.revokeObjectURL(nextUrl)
          return
        }
        url = nextUrl
        setPdf({ status: 'ready', url: nextUrl, error: '' })
      })
      .catch((requestError) => {
        if (!active) {
          return
        }
        const message = requestError instanceof ApiError ? requestError.message : 'The original PDF is unavailable'
        setPdf({ status: 'error', url: '', error: message })
      })

    return () => {
      active = false
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }, [purchaseOrder.id, pdfAttempt])

  const downloadPdf = () => {
    if (pdf.status !== 'ready') {
      return
    }

    const link = document.createElement('a')
    link.href = pdf.url
    link.download = safeFileName(purchaseOrder.file_name)
    link.click()
  }

  const retryPdf = () => {
    setPdf({ status: 'loading', url: '', error: '' })
    setPdfAttempt((current) => current + 1)
  }
  const items = Array.isArray(purchaseOrder.items) ? purchaseOrder.items : []
  const orders = Array.isArray(purchaseOrder.orders) ? purchaseOrder.orders : []
  const progress = progressFromItems(items)
  const extracted = purchaseOrder.extracted_data && typeof purchaseOrder.extracted_data === 'object' && !Array.isArray(purchaseOrder.extracted_data)
    ? purchaseOrder.extracted_data
    : null
  const rawCurrency = extracted && typeof extracted.currency === 'string' ? extracted.currency.trim() : ''
  const currency = /^[A-Za-z]{3}$/.test(rawCurrency) ? rawCurrency.toUpperCase() : 'INR'
  const visibleItems = items.filter((item) => itemFilter === 'all' || lineCustomerState(item) === itemFilter)
  const customer = textValue(purchaseOrder.customer_name) || 'Unknown customer'
  const company = textValue(purchaseOrder.customer_company_name)
  const counts = {
    all: progress.total,
    accepted: progress.remaining,
    rejected: progress.rejected,
    pending: progress.pending,
    converted: progress.converted,
  }

  return (
    <>
      <header className="admin-po-detail-head">
        <div>
          <h1>{purchaseOrder.po_number}</h1>
          <p>{company || customer} · Uploaded {formatWhen(purchaseOrder.created_at)}</p>
        </div>
        <div className="admin-po-head-actions">
          <span className={`admin-po-badge is-${purchaseOrder.status}`}>{purchaseOrderStatusLabel(purchaseOrder.status)}</span>
          <button type="button" className="is-primary" onClick={() => window.open(pdf.url, '_blank', 'noopener')} disabled={pdf.status !== 'ready'}>
            <EyeIcon />
            View PDF
          </button>
          <button type="button" onClick={downloadPdf} disabled={pdf.status !== 'ready'}>
            <DownloadIcon />
            Download PDF
          </button>
        </div>
      </header>

      <div className="admin-po-split">
        <section className="admin-po-section">
          <h2>PO Information</h2>
          <div className="admin-po-grid">
            <p><span>PO number</span><strong>{purchaseOrder.po_number}</strong></p>
            <p><span>Customer</span><strong>{customer}</strong></p>
            <p><span>Company</span><strong>{company || 'Not provided'}</strong></p>
            <p><span>Uploaded date</span><strong>{formatWhen(purchaseOrder.created_at)}</strong></p>
            <p><span>Current status</span><strong><span className={`admin-po-badge is-${purchaseOrder.status}`}>{purchaseOrderStatusLabel(purchaseOrder.status)}</span></strong></p>
            <p><span>Email</span><strong>{textValue(purchaseOrder.customer_email) || 'Not provided'}</strong></p>
            <p><span>File name</span><strong>{textValue(purchaseOrder.file_name) || 'Not available'}</strong></p>
            <p><span>File type</span><strong>{textValue(purchaseOrder.file_type) || 'Not available'}</strong></p>
            <p><span>File size</span><strong>{formatFileSize(purchaseOrder.file_size)}</strong></p>
            <p><span>Processed</span><strong>{formatWhen(purchaseOrder.processed_at)}</strong></p>
          </div>
          {purchaseOrder.processing_error ? <p className="admin-pos-note">{purchaseOrder.processing_error}</p> : null}
        </section>

        <section className="admin-po-section">
          <h2>Conversion Summary</h2>
          <div className="admin-po-metrics">
            <div className="admin-po-metric"><span>Total Items</span><strong>{progress.total.toLocaleString('en-IN')}</strong></div>
            <div className="admin-po-metric"><span>Accepted</span><strong>{progress.accepted.toLocaleString('en-IN')}</strong></div>
            <div className="admin-po-metric"><span>Rejected</span><strong>{progress.rejected.toLocaleString('en-IN')}</strong></div>
            <div className="admin-po-metric"><span>Converted</span><strong>{progress.converted.toLocaleString('en-IN')}</strong></div>
            <div className="admin-po-metric"><span>Remaining</span><strong>{progress.remaining.toLocaleString('en-IN')}</strong></div>
            <div className="admin-po-metric"><span>Conversion Progress</span><strong>{progress.percent}%</strong></div>
          </div>
          <div className="admin-po-progress" title="Converted quantity divided by accepted quantity. Rejected and undecided lines are excluded.">
            <span><i style={{ '--progress': `${progress.percent}%` }} /></span>
            <strong>{progress.percent}%</strong>
          </div>
          <p className="admin-pos-note">Progress counts accepted quantity only. Rejected lines are not waiting to be converted.</p>
        </section>
      </div>

      <div className="admin-po-media">
        <section className="admin-po-section">
          <h2>Original Purchase Order</h2>
          <PurchaseOrderDocument pdf={pdf} fileName={purchaseOrder.file_name} onDownload={downloadPdf} onRetry={retryPdf} />
        </section>
        <section className="admin-po-section">
          <h2>Linked Orders ({orders.length.toLocaleString('en-IN')})</h2>
          {orders.length === 0 ? <p>No orders have been created from this purchase order.</p> : (
            <div className="admin-pos-table-wrap">
              <table className="admin-po-table">
                <thead>
                  <tr>
                    <th>Order Number</th>
                    <th>Created Date</th>
                    <th>Order Status</th>
                    <th>Total Items</th>
                    <th>Total Amount</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const itemsCount = Number.isInteger(Number(order.item_quantity)) ? Number(order.item_quantity) : Number(order.converted_line_count)
                    return (
                      <tr key={order.id}>
                        <td data-label="Order Number">
                          <Link className="admin-po-order-link" to={`/admin/orders/${order.id}`}>{order.order_number}</Link>
                        </td>
                        <td data-label="Created Date">{formatWhen(order.created_at)}</td>
                        <td data-label="Order Status"><span className={`admin-po-badge is-${order.status}`}>{formatStatus(order.status)}</span></td>
                        <td data-label="Total Items">{Number.isInteger(itemsCount) ? itemsCount.toLocaleString('en-IN') : '—'}</td>
                        <td data-label="Total Amount">{formatMoney(order.total_amount, 'INR')}</td>
                        <td data-label="Actions">
                          <div className="admin-po-row-actions">
                            <Link to={`/admin/orders/${order.id}`} aria-label={`View order ${order.order_number}`}><EyeIcon /></Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="admin-po-section">
        <h2>Extracted and Matched Items</h2>
        <div className="admin-po-tabs" role="tablist" aria-label="Item status">
          {ITEM_FILTERS.map((filter) => (
            <button key={filter.key} type="button" aria-pressed={itemFilter === filter.key} onClick={() => setItemFilter(filter.key)}>
              {filter.label} ({counts[filter.key].toLocaleString('en-IN')})
            </button>
          ))}
        </div>
        {items.length === 0 ? <p>This purchase order has no extracted lines.</p> : null}
        {items.length > 0 && visibleItems.length === 0 ? <p>No lines match this status.</p> : null}
        {visibleItems.length > 0 ? (
          <div className="admin-pos-table-wrap">
            <table className="admin-po-table">
              <thead>
                <tr>
                  <th>S.No.</th>
                  <th>Original PO Item</th>
                  <th>Matched Catalogue Product</th>
                  <th>SKU</th>
                  <th>Quantity</th>
                  <th>Match Score</th>
                  <th>Match Status</th>
                  <th>Conversion Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => {
                  const match = primaryMatch(item)
                  const state = lineCustomerState(item)
                  const score = match ? matchScoreLabel(match.match_score) : ''
                  const converted = Boolean(item.converted_order_id)
                  const open = expandedId === item.id
                  return (
                    <Fragment key={item.id}>
                      <tr>
                        <td data-label="S.No.">{item.line_number}</td>
                        <td data-label="Original PO Item">
                          <button type="button" className="admin-po-item-name" aria-expanded={open} onClick={() => setExpandedId(open ? null : item.id)}>
                            {textValue(item.extracted_name) || 'Extracted item'}
                          </button>
                        </td>
                        <td data-label="Matched Catalogue Product">{match ? textValue(match.product_name) || 'Catalogue product' : 'No catalogue match'}</td>
                        <td data-label="SKU">{match ? textValue(match.product_sku) || '—' : '—'}</td>
                        <td data-label="Quantity">{textValue(item.quantity) || '—'}</td>
                        <td data-label="Match Score">{score || '—'}</td>
                        <td data-label="Match Status"><span className={`admin-po-badge is-${state === 'converted' ? 'accepted' : state}`}>{LINE_STATE_LABELS[state === 'converted' ? 'accepted' : state] || 'Pending'}</span></td>
                        <td data-label="Conversion Status"><span className={`admin-po-badge is-${converted ? 'converted' : 'pending'}`}>{converted ? 'Converted' : 'Not converted'}</span></td>
                      </tr>
                      {open ? (
                        <tr className="admin-po-detail-row">
                          <td colSpan={8}>
                            <ItemExpansion item={item} currency={currency} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  )
}

export default function AdminPurchaseOrderDetail() {
  const { id } = useParams()
  const [purchaseOrder, setPurchaseOrder] = useState(null)
  const [loadedId, setLoadedId] = useState(null)
  const [error, setError] = useState('')
  const [errorStatus, setErrorStatus] = useState(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true

    getPurchaseOrder(id)
      .then((nextPurchaseOrder) => {
        if (!active) {
          return
        }
        setPurchaseOrder(nextPurchaseOrder)
        setError('')
        setErrorStatus(0)
        setLoadedId(id)
      })
      .catch((requestError) => {
        if (!active) {
          return
        }
        setPurchaseOrder(null)
        setError(requestError instanceof ApiError ? requestError.message : requestError.message)
        setErrorStatus(requestError instanceof ApiError ? requestError.status : 0)
        setLoadedId(id)
      })

    return () => {
      active = false
    }
  }, [id, attempt])

  const loading = loadedId !== id
  const missing = errorStatus === 404

  return (
    <div className="admin-po-detail">
      <Link className="admin-po-back" to="/admin/purchase-orders">Back to Purchase Orders</Link>
      {loading ? (
        <div className="admin-po-detail-skeleton" aria-label="Loading purchase order">
          <span /><span /><span /><span />
        </div>
      ) : null}
      {!loading && error ? (
        <section className="admin-po-section admin-po-detail-state">
          <h1>{missing ? 'Purchase order not found' : 'Purchase order unavailable'}</h1>
          <p>{error}</p>
          {missing ? null : (
            <button type="button" onClick={() => { setError(''); setErrorStatus(0); setLoadedId(null); setAttempt((current) => current + 1) }}>Try again</button>
          )}
        </section>
      ) : null}
      {!loading && !error && purchaseOrder ? <PurchaseOrderBody key={purchaseOrder.id} purchaseOrder={purchaseOrder} /> : null}
    </div>
  )
}
