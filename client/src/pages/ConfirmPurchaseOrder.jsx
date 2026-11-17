import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { addressFromUser, countryIso, emptyAddress, firstField, toAddress, validateAddress } from '../checkout/address.js'
import { rememberConfirmation } from '../checkout/draft.js'
import { loadCataloguePrices, readProductRecord } from '../api/products.js'
import { confirmPurchaseOrder, getPurchaseOrder } from '../api/purchaseOrders.js'
import { selectedMatches } from '../components/purchase-orders/fields.js'
import ProductImage from '../components/products/ProductImage.jsx'
import Button from '../components/ui/Button.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import Loading from '../components/ui/Loading.jsx'
import { useToast } from '../components/ui/ToastProvider.jsx'
import { getCountries } from '../location/geography.js'
import { paymentMethodTitle, paymentStatusKey, paymentStatusLabel } from '../orders/payment.js'
import { centsToAmount, formatMoney, lineAmount, moneyToCents } from '../utils/format.js'
import '../styles/purchase-orders.css'

const TAX_AMOUNT = '0.00'
const SHIPPING_AMOUNT = '0.00'

const conversionKey = (purchaseOrderId) => `bnc.po.confirm.${purchaseOrderId}`

function readStoredConversion(purchaseOrderId) {
  if (!purchaseOrderId) {
    return null
  }

  try {
    const parsed = JSON.parse(sessionStorage.getItem(conversionKey(purchaseOrderId)) || 'null')
    const order = parsed && parsed.order
    const convertedLineCount = Number(parsed && parsed.convertedLineCount)
    const remainingLineCount = Number(parsed && parsed.remainingLineCount)
    const orderNumber = order && typeof order.order_number === 'string' ? order.order_number.trim() : ''

    if (!order || order.id === undefined || order.id === null || !orderNumber) {
      return null
    }

    if (!Number.isInteger(convertedLineCount) || convertedLineCount < 0 || !Number.isInteger(remainingLineCount) || remainingLineCount < 0) {
      return null
    }

    return {
      order: {
        id: order.id,
        order_number: orderNumber,
        payment_method: order.payment_method === 'cod' ? 'cod' : 'pay_later',
        payment_status: order.payment_status === 'paid' || order.payment_status === 'failed' ? order.payment_status : 'pending',
      },
      convertedLineCount,
      remainingLineCount,
    }
  } catch {
    return null
  }
}

function storeConversion(purchaseOrderId, conversion) {
  sessionStorage.setItem(conversionKey(purchaseOrderId), JSON.stringify(conversion))
}

function clearStoredConversion(purchaseOrderId) {
  sessionStorage.removeItem(conversionKey(purchaseOrderId))
}

export default function ConfirmPurchaseOrder() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const confirming = useRef(false)
  const catalogueRef = useRef({})
  const countries = useMemo(() => getCountries(), [])
  const [purchaseOrder, setPurchaseOrder] = useState(null)
  const [loadedId, setLoadedId] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [catalogueById, setCatalogueById] = useState({})
  const [priceErrors, setPriceErrors] = useState({})
  const [confirmingOrder, setConfirmingOrder] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [shipping, setShipping] = useState(() => addressFromUser(user))
  const [billing, setBilling] = useState(emptyAddress)
  const [sameBilling, setSameBilling] = useState(true)
  const [notes, setNotes] = useState('')
  const [fieldErrors, setFieldErrors] = useState({ shipping: {}, billing: {}, notes: '' })
  const [conversion, setConversion] = useState(() => readStoredConversion(id))
  const [conversionFor, setConversionFor] = useState(id)

  if (conversionFor !== id) {
    setConversionFor(id)
    setConversion(readStoredConversion(id))
  }

  useEffect(() => {
    let active = true

    getPurchaseOrder(id)
      .then((nextPurchaseOrder) => {
        if (!active) {
          return
        }

        setPurchaseOrder(nextPurchaseOrder)
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
      selectedMatches(item).forEach((match) => {
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
        setPriceErrors((current) => {
          const next = { ...current }
          missing.forEach((productId) => {
            if (catalogueRef.current[productId]) {
              delete next[productId]
              return
            }

            next[productId] = result.errors[productId] || 'The catalogue price could not be loaded'
          })
          return next
        })
      })
      .catch(() => {
        if (!active) {
          return
        }

        setPriceErrors((current) => {
          const next = { ...current }
          missing.forEach((productId) => {
            if (!catalogueRef.current[productId]) {
              next[productId] = 'The catalogue price could not be loaded'
            }
          })
          return next
        })
      })

    return () => {
      active = false
    }
  }, [productKey])

  const loading = loadedId !== id
  const items = purchaseOrder && Array.isArray(purchaseOrder.items) ? purchaseOrder.items : []
  const linkedOrders = purchaseOrder && Array.isArray(purchaseOrder.orders) ? purchaseOrder.orders : []
  const canConvert = Boolean(
    purchaseOrder
    && (purchaseOrder.status === 'review_required' || purchaseOrder.status === 'partially_converted'),
  )
  const lines = items.flatMap((item) => {
    if (item.converted_order_id) {
      return []
    }

    const selected = selectedMatches(item)

    if (selected.length !== 1) {
      return []
    }

    const match = selected[0]
    const product = readProductRecord(catalogueById[String(match.product_id)])
    const quantity = Number(item.quantity)
    const currency = product && product.currency ? product.currency : 'INR'

    return [{
      id: item.id,
      quantity,
      currency,
      product: product || {
        name: match.product_name,
        sku: match.product_sku,
        image_url: null,
      },
      price: product ? product.price : null,
      line: product && Number.isInteger(quantity) ? lineAmount(product.price, quantity) : null,
      priceError: priceErrors[String(match.product_id)] || '',
    }]
  })
  const currency = lines.find((line) => line.currency)?.currency || 'INR'
  const subtotalCents = lines.reduce((sum, line) => {
    if (sum === null) {
      return null
    }

    const cents = moneyToCents(line.line)
    return cents === null ? null : sum + cents
  }, 0)
  const taxCents = moneyToCents(TAX_AMOUNT)
  const shippingCents = moneyToCents(SHIPPING_AMOUNT)
  const subtotal = subtotalCents === null ? null : centsToAmount(subtotalCents)
  const grandCents = subtotalCents === null || taxCents === null || shippingCents === null
    ? null
    : subtotalCents + taxCents + shippingCents
  const grandTotal = grandCents === null ? null : centsToAmount(grandCents)
  const itemCount = lines.reduce((sum, line) => sum + (Number.isInteger(line.quantity) ? line.quantity : 0), 0)
  const pricesReady = lines.length > 0 && lines.every((line) => line.line !== null)

  const updateAddress = (setter, group) => (event) => {
    const { name, value } = event.target
    setter((current) => {
      const next = { ...current, [name]: value }

      if (name === 'country' && value !== current.country) {
        next.state = ''
      }

      return next
    })
    setFieldErrors((current) => ({
      ...current,
      [group]: { ...current[group], [name]: '', ...(name === 'country' ? { state: '' } : {}) },
    }))
  }

  const confirm = async (event) => {
    event.preventDefault()

    if (confirming.current || confirmingOrder || !canConvert || lines.length === 0 || !pricesReady) {
      return
    }

    const shippingErrors = validateAddress(shipping, countryIso(countries, shipping.country))
    const billingErrors = sameBilling ? {} : validateAddress(billing, countryIso(countries, billing.country))
    const notesError = notes.trim().length > 2000 ? 'Order notes must be 2000 characters or fewer' : ''

    if (Object.keys(shippingErrors).length > 0 || Object.keys(billingErrors).length > 0 || notesError) {
      setFieldErrors({ shipping: shippingErrors, billing: billingErrors, notes: notesError })
      const shippingField = firstField(shippingErrors)
      const billingField = sameBilling ? '' : firstField(billingErrors)

      if (shippingField) {
        document.getElementById(`ship-${shippingField}`)?.focus()
      } else if (billingField) {
        document.getElementById(`bill-${billingField}`)?.focus()
      } else if (notesError) {
        document.getElementById('ship-notes')?.focus()
      }

      return
    }

    const shippingAddress = toAddress(shipping)
    confirming.current = true
    setConfirmingOrder(true)
    setConfirmError('')

    try {
      const result = await confirmPurchaseOrder(id, {
        shipping_address: shippingAddress,
        billing_address: sameBilling ? shippingAddress : toAddress(billing),
        notes: notes.trim(),
      })
      const order = result.order

      if (!order || order.id === undefined || order.id === null) {
        setConfirmError('The order could not be read')
        toast.error('The order could not be read')
        return
      }

      rememberConfirmation(order.id)
      toast.success(result.message || `Order ${order.order_number} placed`)
      const nextConversion = {
        order: {
          id: order.id,
          order_number: order.order_number,
          payment_method: order.payment_method === 'cod' ? 'cod' : 'pay_later',
          payment_status: order.payment_status === 'paid' || order.payment_status === 'failed' ? order.payment_status : 'pending',
        },
        convertedLineCount: Number.isInteger(result.convertedLineCount) ? result.convertedLineCount : lines.length,
        remainingLineCount: Number.isInteger(result.remainingLineCount) ? result.remainingLineCount : 0,
      }
      storeConversion(id, nextConversion)
      setConversion(nextConversion)
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : 'The purchase order could not be confirmed'
      setConfirmError(message)
      toast.error(message)
    } finally {
      confirming.current = false
      setConfirmingOrder(false)
    }
  }

  return (
    <div className="po-confirm">
      <header className="po-confirm-heading">
        <Link className="po-upload-back" to={`/purchase-orders/${id}`} onClick={() => clearStoredConversion(id)}>Back to Review Purchase Order</Link>
        <h1>Confirm Purchase Order</h1>
        <p>Review the accepted items that will be ordered. Unresolved lines remain on the original purchase order.</p>
      </header>
      {loading ? <Loading label="Loading purchase order" /> : null}
      {!loading && error ? (
        <section className="po-confirm-card">
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
      {!loading && !error && conversion ? (
        <section className="po-confirm-card po-confirm-result" aria-live="polite">
          <div className="po-confirm-success-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M20 6.5 9.5 17 4 11.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2>Order Placed Successfully!</h2>
          <p>Your matched purchase order items have been converted into an order.</p>
          <p className="po-confirm-order-number">
            <span>Order number</span>
            <strong>{conversion.order.order_number}</strong>
          </p>
          <dl>
            <div>
              <dt>Converted items</dt>
              <dd>{conversion.convertedLineCount.toLocaleString('en-IN')}</dd>
            </div>
            <div>
              <dt>Remaining unresolved items</dt>
              <dd>{conversion.remainingLineCount.toLocaleString('en-IN')}</dd>
            </div>
            <div>
              <dt>Payment method</dt>
              <dd>{paymentMethodTitle(conversion.order.payment_method)}</dd>
            </div>
            <div>
              <dt>Payment status</dt>
              <dd><span className={`payment-pill is-${paymentStatusKey(conversion.order.payment_status)}`}>{paymentStatusLabel(conversion.order.payment_status)}</span></dd>
            </div>
          </dl>
          {conversion.remainingLineCount > 0 ? (
            <p className="po-confirm-note">Unresolved lines remain available on the original purchase order for later matching.</p>
          ) : (
            <p className="po-confirm-note is-complete">All purchase order lines have been converted.</p>
          )}
          <div className="po-confirm-links">
            <Link className="po-confirm-primary" to={`/orders/${conversion.order.id}?confirmed=1`}>View Order Details</Link>
            <Link className="po-confirm-secondary" to={`/purchase-orders/${id}`} onClick={() => clearStoredConversion(id)}>Return to Original Purchase Order</Link>
          </div>
        </section>
      ) : null}
      {!loading && !error && purchaseOrder && !conversion && !canConvert ? (
        <section className="po-confirm-card">
          <h2>{purchaseOrder.po_number}</h2>
          {linkedOrders.length > 0 ? (
            <p>
              This purchase order has already been converted.
              {' '}
              {linkedOrders.map((order, index) => (
                <span key={order.id}>
                  {index > 0 ? ', ' : null}
                  <Link to={`/orders/${order.id}`}>{order.order_number}</Link>
                </span>
              ))}
            </p>
          ) : (
            <p>This purchase order cannot be converted.</p>
          )}
          <Link className="po-upload-back" to={`/purchase-orders/${id}`}>Return to Original PO</Link>
        </section>
      ) : null}
      {!loading && !error && purchaseOrder && !conversion && canConvert && lines.length === 0 ? (
        <section className="po-confirm-card">
          <h2>Confirm Purchase Order</h2>
          <p>No accepted items are ready to convert. Unresolved lines remain on the original purchase order.</p>
          <Link className="po-upload-back" to={`/purchase-orders/${id}`}>Return to Original PO</Link>
        </section>
      ) : null}
      {!loading && !error && !conversion && canConvert && lines.length > 0 ? (
        <form className="po-confirm-layout" onSubmit={confirm}>
          <div className="po-confirm-main">
            <section className="po-confirm-card">
              <h2>Selected products</h2>
              <p>Converting {lines.length.toLocaleString('en-IN')} of {items.length.toLocaleString('en-IN')} purchase order lines. Unresolved lines remain on the original purchase order.</p>
              <div className="po-table-wrap">
                <table className="po-confirm-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id}>
                        <td data-label="Product">
                          <div className="po-confirm-product">
                            <ProductImage product={line.product} />
                            <strong>{line.product.name}</strong>
                          </div>
                        </td>
                        <td data-label="SKU">{line.product.sku}</td>
                        <td data-label="Qty">{line.quantity.toLocaleString('en-IN')}</td>
                        <td data-label="Unit Price">{line.price === null ? (line.priceError || 'Price unavailable') : formatMoney(line.price, line.currency)}</td>
                        <td data-label="Total">{line.line === null ? 'Price unavailable' : formatMoney(line.line, line.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="po-confirm-card">
              <h2>Delivery details</h2>
              <AddressFields
                idPrefix="ship"
                legend="Shipping address"
                value={shipping}
                errors={fieldErrors.shipping}
                countries={countries}
                onChange={updateAddress(setShipping, 'shipping')}
              />
              <label className="po-confirm-check">
                <input
                  type="checkbox"
                  checked={sameBilling}
                  onChange={(event) => setSameBilling(event.target.checked)}
                />
                Billing address is the same as shipping
              </label>
              {sameBilling ? null : (
                <AddressFields
                  idPrefix="bill"
                  legend="Billing address"
                  value={billing}
                  errors={fieldErrors.billing}
                  countries={countries}
                  onChange={updateAddress(setBilling, 'billing')}
                />
              )}
              <label className="po-confirm-field" htmlFor="ship-notes">
                <span>Order notes (optional)</span>
                <textarea
                  id="ship-notes"
                  name="notes"
                  maxLength={2000}
                  value={notes}
                  onChange={(event) => {
                    setNotes(event.target.value)
                    setFieldErrors((current) => ({ ...current, notes: '' }))
                  }}
                  aria-invalid={fieldErrors.notes ? 'true' : 'false'}
                />
                {fieldErrors.notes ? <small>{fieldErrors.notes}</small> : null}
              </label>
            </section>
          </div>
          <aside className="po-confirm-card po-confirm-summary">
            <h2>Order summary</h2>
            <dl>
              <div>
                <dt>Items being converted</dt>
                <dd>{lines.length.toLocaleString('en-IN')}</dd>
              </div>
              <div>
                <dt>Total quantity</dt>
                <dd>{itemCount.toLocaleString('en-IN')}</dd>
              </div>
              <div>
                <dt>Subtotal</dt>
                <dd>{subtotal === null ? 'Price unavailable' : formatMoney(subtotal, currency)}</dd>
              </div>
              <div>
                <dt>Tax</dt>
                <dd>{formatMoney(TAX_AMOUNT, currency)}</dd>
              </div>
              <div>
                <dt>Shipping</dt>
                <dd>{formatMoney(SHIPPING_AMOUNT, currency)}</dd>
              </div>
              <div className="is-grand">
                <dt>Grand Total</dt>
                <dd>{grandTotal === null ? 'Price unavailable' : formatMoney(grandTotal, currency)}</dd>
              </div>
            </dl>
            <p className="po-confirm-note">Payment method: Pay Later – Business Terms. Payment starts as pending and is settled separately.</p>
            <ErrorMessage message={confirmError} />
            <button type="submit" className="po-confirm-place" disabled={confirmingOrder || !pricesReady}>
              {confirmingOrder ? 'Placing order…' : 'Confirm & Place Order'}
            </button>
            <Link to={`/purchase-orders/${id}`}>Back to Review</Link>
          </aside>
        </form>
      ) : null}
    </div>
  )
}

function AddressFields({ idPrefix, legend, value, errors, countries, onChange }) {
  return (
    <fieldset className="po-confirm-address">
      <legend>{legend}</legend>
      <div className="po-confirm-fields">
        <Field id={`${idPrefix}-full_name`} name="full_name" label="Full name" value={value.full_name} error={errors.full_name} autoComplete="name" onChange={onChange} />
        <Field id={`${idPrefix}-phone`} name="phone" label="Phone number" value={value.phone} error={errors.phone} autoComplete="tel" onChange={onChange} />
        <Field id={`${idPrefix}-line1`} name="line1" label="Address line 1" value={value.line1} error={errors.line1} autoComplete="address-line1" onChange={onChange} wide />
        <Field id={`${idPrefix}-line2`} name="line2" label="Address line 2 (optional)" value={value.line2} error={errors.line2} autoComplete="address-line2" onChange={onChange} wide optional />
        <Field id={`${idPrefix}-city`} name="city" label="City" value={value.city} error={errors.city} autoComplete="address-level2" onChange={onChange} />
        <Field id={`${idPrefix}-state`} name="state" label="State" value={value.state} error={errors.state} autoComplete="address-level1" onChange={onChange} />
        <Field id={`${idPrefix}-postal_code`} name="postal_code" label="Postal code" value={value.postal_code} error={errors.postal_code} autoComplete="postal-code" onChange={onChange} />
        <label className="po-confirm-field is-wide" htmlFor={`${idPrefix}-country`}>
          <span>Country</span>
          <select id={`${idPrefix}-country`} name="country" value={value.country} autoComplete="country-name" aria-invalid={errors.country ? 'true' : 'false'} onChange={onChange}>
            <option value="">Select a country</option>
            {countries.map((country) => <option key={country.isoCode} value={country.name}>{country.name}</option>)}
          </select>
          {errors.country ? <small>{errors.country}</small> : null}
        </label>
      </div>
    </fieldset>
  )
}

function Field({ id, name, label, value, error, autoComplete, onChange, wide = false, optional = false }) {
  return (
    <label className={wide ? 'po-confirm-field is-wide' : 'po-confirm-field'} htmlFor={id}>
      <span>{label}{optional ? null : <i> *</i>}</span>
      <input id={id} name={name} value={value} autoComplete={autoComplete} aria-invalid={error ? 'true' : 'false'} onChange={onChange} />
      {error ? <small>{error}</small> : null}
    </label>
  )
}
