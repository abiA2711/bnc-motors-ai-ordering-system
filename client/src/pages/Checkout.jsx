import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useCart } from '../cart/CartContext.jsx'
import { addressFromUser, countryIso, emptyAddress, firstField, textOf, validateAddress } from '../checkout/address.js'
import CheckoutSteps from '../checkout/CheckoutSteps.jsx'
import { readDraft, writeDraft } from '../checkout/draft.js'
import { normalizePaymentMethod } from '../orders/payment.js'
import { CartIcon } from '../components/auth/icons.jsx'
import ProductImage from '../components/products/ProductImage.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import { useToast } from '../components/ui/ToastProvider.jsx'
import { getCountries, getSubdivisions } from '../location/geography.js'
import { formatMoney, lineAmount } from '../utils/format.js'
import { stockProblem } from '../utils/stock.js'
import '../styles/checkout.css'

export default function Checkout() {
  const { user } = useAuth()
  const { items, itemCount, subtotal, refreshStock } = useCart()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const submitting = useRef(false)
  const refreshStockRef = useRef(refreshStock)
  const countries = useMemo(() => getCountries().slice().sort((left, right) => left.name.localeCompare(right.name)), [])
  const [checkingStock, setCheckingStock] = useState(true)
  const [shipping, setShipping] = useState(() => {
    const draft = readDraft()
    return draft ? draft.shipping : addressFromUser(user)
  })
  const [billing, setBilling] = useState(() => {
    const draft = readDraft()
    return draft ? draft.billing : emptyAddress
  })
  const [sameBilling, setSameBilling] = useState(() => {
    const draft = readDraft()
    return draft ? draft.sameBilling : true
  })
  const [notes, setNotes] = useState(() => {
    const draft = readDraft()
    return draft ? draft.notes : ''
  })
  const [paymentMethod, setPaymentMethod] = useState(() => {
    const draft = readDraft()
    return draft ? normalizePaymentMethod(draft.paymentMethod) : 'pay_later'
  })
  const [fieldErrors, setFieldErrors] = useState({ shipping: {}, billing: {}, notes: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const shippingIso = countryIso(countries, shipping.country)

  useEffect(() => {
    refreshStockRef.current = refreshStock
  }, [refreshStock])

  useEffect(() => {
    let active = true

    refreshStockRef.current()
      .then((notices) => {
        if (active && notices.length > 0) {
          setError(notices.join(' '))
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError instanceof ApiError ? requestError.message : 'Stock could not be checked')
        }
      })
      .finally(() => {
        if (active) {
          setCheckingStock(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const id = location.hash.replace('#', '')
    if (!id) {
      return
    }

    document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [location.hash])

  const problems = items.map(stockProblem).filter(Boolean)

  if (items.length === 0) {
    return <Navigate to="/cart" replace />
  }

  const updateAddress = (setter, group) => (event) => {
    const { name, value } = event.target
    setter((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({
      ...current,
      [group]: { ...current[group], [name]: '' },
    }))
  }

  const changeCountry = (setter, group) => (event) => {
    const value = event.target.value
    setter((current) => ({ ...current, country: value, state: '' }))
    setFieldErrors((current) => ({
      ...current,
      [group]: { ...current[group], country: '', state: '' },
    }))
  }

  const submit = async (event) => {
    event.preventDefault()

    if (submitting.current || items.length === 0 || busy) {
      return
    }

    const shippingErrors = validateAddress(shipping, shippingIso)
    const billingIso = countryIso(countries, billing.country)
    const billingErrors = sameBilling ? {} : validateAddress(billing, billingIso)
    const notesError = notes.trim().length > 500 ? 'Order notes must be 500 characters or fewer' : ''
    const shippingField = firstField(shippingErrors)
    const billingField = firstField(billingErrors)

    if (shippingField || billingField || notesError) {
      setFieldErrors({ shipping: shippingErrors, billing: billingErrors, notes: notesError })
      const fieldId = shippingField ? `shipping-${shippingField}` : `billing-${billingField}`
      document.getElementById(notesError && !shippingField && !billingField ? 'checkout-notes' : fieldId)?.focus()
      return
    }

    submitting.current = true
    setBusy(true)
    setError('')

    try {
      const notices = await refreshStock()

      if (notices.length > 0) {
        const message = notices.join(' ')
        setError(message)
        toast.error(message, 'checkout-stock')
        submitting.current = false
        setBusy(false)
        return
      }

      writeDraft({ shipping, billing, sameBilling, notes, paymentMethod })
      navigate('/checkout/review')
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : 'Stock could not be checked'
      setError(message)
      toast.error(message, 'checkout-stock')
    }

    submitting.current = false
    setBusy(false)
  }

  const currency = items[0] ? items[0].currency || 'INR' : 'INR'

  return (
    <form className="checkout-page" onSubmit={submit} noValidate>
      <div className="checkout-heading">
        <span className="checkout-heading-icon"><CartIcon /></span>
        <div>
          <h1>Checkout</h1>
          <p>Review your delivery details and confirm your order.</p>
        </div>
        <CheckoutSteps current={1} />
      </div>

      <div className="checkout-layout">
        <div className="checkout-main">
          <section className="checkout-card" id="shipping" aria-labelledby="shipping-heading">
            <h2 id="shipping-heading"><PinIcon />Shipping Address</h2>
            <AddressFields
              idPrefix="shipping"
              value={shipping}
              errors={fieldErrors.shipping}
              countries={countries}
              onChange={updateAddress(setShipping, 'shipping')}
              onCountryChange={changeCountry(setShipping, 'shipping')}
            />
          </section>

          <section className="checkout-card" id="billing" aria-labelledby="billing-heading">
            <h2 id="billing-heading"><CardIcon />Billing Address</h2>
            <label className="checkout-check">
              <input
                type="checkbox"
                checked={sameBilling}
                onChange={(event) => setSameBilling(event.target.checked)}
              />
              Billing address same as shipping address
            </label>
            {sameBilling ? null : (
              <AddressFields
                idPrefix="billing"
                value={billing}
                errors={fieldErrors.billing}
                countries={countries}
                onChange={updateAddress(setBilling, 'billing')}
                onCountryChange={changeCountry(setBilling, 'billing')}
              />
            )}
          </section>

          <section className="checkout-card" id="payment" aria-labelledby="payment-heading">
            <h2 id="payment-heading"><WalletIcon />Payment Method</h2>
            <div className="payment-options" role="radiogroup" aria-label="Payment method">
              <label className={paymentMethod === 'pay_later' ? 'payment-option is-selected' : 'payment-option'}>
                <span className="payment-option-icon" aria-hidden="true"><BuildingIcon /></span>
                <span>
                  <strong>Pay Later – Business Terms</strong>
                  <small>Place the order now. Payment is settled separately according to your agreed business terms.</small>
                </span>
                <input
                  type="radio"
                  name="payment_method"
                  value="pay_later"
                  checked={paymentMethod === 'pay_later'}
                  onChange={() => setPaymentMethod('pay_later')}
                />
              </label>
              <label className={paymentMethod === 'cod' ? 'payment-option is-selected' : 'payment-option'}>
                <span className="payment-option-icon" aria-hidden="true"><TruckIcon /></span>
                <span>
                  <strong>Cash on Delivery</strong>
                  <small>Pay when the order is delivered. Selecting this does not mark the order as paid.</small>
                </span>
                <input
                  type="radio"
                  name="payment_method"
                  value="cod"
                  checked={paymentMethod === 'cod'}
                  onChange={() => setPaymentMethod('cod')}
                />
              </label>
            </div>
          </section>

          <section className="checkout-card" id="notes" aria-labelledby="notes-heading">
            <h2 id="notes-heading"><NoteIcon />Order Notes (Optional)</h2>
            <label className="checkout-field span-6" htmlFor="checkout-notes">
              <textarea
                id="checkout-notes"
                name="notes"
                maxLength={500}
                rows={4}
                value={notes}
                placeholder="Add any special instructions for your order."
                aria-invalid={fieldErrors.notes ? 'true' : 'false'}
                onChange={(event) => {
                  setNotes(event.target.value)
                  setFieldErrors((current) => ({ ...current, notes: '' }))
                }}
              />
              <small className="checkout-count">{notes.length} / 500</small>
              {fieldErrors.notes ? <small className="checkout-error">{fieldErrors.notes}</small> : null}
            </label>
          </section>
        </div>

        <aside className="checkout-card checkout-summary" aria-label="Order summary">
          <h2><BoxIcon />Order Summary ({items.length} {items.length === 1 ? 'Item' : 'Items'})</h2>
          <ul className="checkout-lines">
            {items.map((item) => {
              const line = lineAmount(item.price, item.quantity)
              return (
                <li key={item.id}>
                  <span className="checkout-thumb">
                    <ProductImage product={item} />
                  </span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>SKU: {item.sku}</small>
                    <small>Qty: {item.quantity}</small>
                  </span>
                  <b>{line ? formatMoney(line, item.currency || 'INR') : 'Price unavailable'}</b>
                </li>
              )
            })}
          </ul>
          <div className="checkout-total-row">
            <span>Items ({itemCount.toLocaleString('en-IN')})</span>
            <strong>{formatMoney(subtotal, currency)}</strong>
          </div>
          <div className="checkout-total-row">
            <span>Subtotal</span>
            <strong>{formatMoney(subtotal, currency)}</strong>
          </div>
          <div className="checkout-grand">
            <span>Grand Total</span>
            <strong>{formatMoney(subtotal, currency)}</strong>
          </div>
          <ErrorMessage message={error || problems.join(' ')} />
          <button type="submit" className="checkout-submit" disabled={busy || checkingStock || problems.length > 0}>
            {busy || checkingStock ? (checkingStock ? 'Checking stock' : 'Checking cart') : 'Continue to Review Order'}
            <span aria-hidden="true">→</span>
          </button>
        </aside>
      </div>
    </form>
  )
}

function AddressFields({
  idPrefix,
  value,
  errors,
  countries,
  onChange,
  onCountryChange,
}) {
  const iso = countryIso(countries, value.country)
  const [states, setStates] = useState([])
  const [loadedIso, setLoadedIso] = useState('')
  const [statesStatus, setStatesStatus] = useState(iso ? 'loading' : 'ready')
  const pending = Boolean(iso) && loadedIso !== iso
  const stateNames = !iso || pending ? [] : states.map((state) => state.name).filter(Boolean)
  const selectedState = textOf(value.state)
  const stateChoices = selectedState && !stateNames.includes(selectedState)
    ? [selectedState, ...stateNames]
    : stateNames
  const stateIsSelect = Boolean(iso) && statesStatus !== 'error' && (pending || stateChoices.length > 0)

  useEffect(() => {
    if (!iso) {
      return undefined
    }

    let active = true

    getSubdivisions(iso)
      .then((list) => {
        if (!active) {
          return
        }

        setStates(Array.isArray(list) ? list : [])
        setLoadedIso(iso)
        setStatesStatus('ready')
      })
      .catch(() => {
        if (!active) {
          return
        }

        setStates([])
        setLoadedIso(iso)
        setStatesStatus('error')
      })

    return () => {
      active = false
    }
  }, [iso])

  return (
    <div className="checkout-fields">
      <Field id={`${idPrefix}-full_name`} name="full_name" label="Full Name" value={value.full_name} error={errors.full_name} autoComplete="name" onChange={onChange} span="span-3" />
      <Field id={`${idPrefix}-phone`} name="phone" label="Phone Number" value={value.phone} error={errors.phone} autoComplete="tel" onChange={onChange} span="span-3" />
      <Field id={`${idPrefix}-line1`} name="line1" label="Address Line 1" value={value.line1} error={errors.line1} autoComplete="address-line1" onChange={onChange} span="span-3" />
      <Field id={`${idPrefix}-line2`} name="line2" label="Address Line 2 (Optional)" value={value.line2} error={errors.line2} autoComplete="address-line2" onChange={onChange} span="span-3" optional />
      <Field id={`${idPrefix}-city`} name="city" label="City" value={value.city} error={errors.city} autoComplete="address-level2" onChange={onChange} span="span-2" />
      <label className="checkout-field span-2" htmlFor={`${idPrefix}-state`}>
        <span>State <i>*</i></span>
        {stateIsSelect ? (
          <select id={`${idPrefix}-state`} name="state" value={value.state} autoComplete="address-level1" aria-invalid={errors.state ? 'true' : 'false'} onChange={onChange}>
            <option value="">{pending ? 'Loading states' : 'Select a state'}</option>
            {stateChoices.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
        ) : (
          <input id={`${idPrefix}-state`} name="state" value={value.state} autoComplete="address-level1" aria-invalid={errors.state ? 'true' : 'false'} onChange={onChange} />
        )}
        {errors.state ? <small className="checkout-error">{errors.state}</small> : null}
      </label>
      <Field id={`${idPrefix}-postal_code`} name="postal_code" label="Postal Code" value={value.postal_code} error={errors.postal_code} autoComplete="postal-code" onChange={onChange} span="span-2" />
      <label className="checkout-field span-6" htmlFor={`${idPrefix}-country`}>
        <span>Country <i>*</i></span>
        <select id={`${idPrefix}-country`} name="country" value={value.country} autoComplete="country-name" aria-invalid={errors.country ? 'true' : 'false'} onChange={onCountryChange}>
          <option value="">Select a country</option>
          {countries.map((country) => <option key={country.isoCode} value={country.name}>{country.name}</option>)}
        </select>
        {errors.country ? <small className="checkout-error">{errors.country}</small> : null}
      </label>
    </div>
  )
}

function Field({ id, name, label, value, error, autoComplete, onChange, span, optional = false }) {
  return (
    <label className={`checkout-field ${span}`} htmlFor={id}>
      <span>{label}{optional ? null : <> <i>*</i></>}</span>
      <input id={id} name={name} value={value} autoComplete={autoComplete} aria-invalid={error ? 'true' : 'false'} onChange={onChange} />
      {error ? <small className="checkout-error">{error}</small> : null}
    </label>
  )
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" />
      <circle cx="12" cy="11" r="2" />
    </svg>
  )
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
    </svg>
  )
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3.5h7l4 4V20.5H7z" />
      <path d="M14 3.5V8h4M9 12h6M9 16h4" />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" />
      <path d="M4 7.5 6.5 4.5H16" />
      <path d="M16 13h4" />
    </svg>
  )
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20.5h16" />
      <path d="M6 20.5V5.5h8v15" />
      <path d="M14 9.5h4v11" />
      <path d="M8.5 9h3M8.5 12.5h3M8.5 16h3" />
    </svg>
  )
}

function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 7.5h11v9H3z" />
      <path d="M14 11h4l3 3v2.5h-7" />
      <circle cx="7" cy="17.5" r="1.6" />
      <circle cx="17" cy="17.5" r="1.6" />
    </svg>
  )
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8l9-4 9 4-9 4-9-4z" />
      <path d="M3 8v8l9 4 9-4V8" />
      <path d="M12 12v8" />
    </svg>
  )
}

