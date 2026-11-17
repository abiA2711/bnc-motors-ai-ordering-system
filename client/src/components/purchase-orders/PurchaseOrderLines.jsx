import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/client.js'
import CatalogueProductName from '../products/CatalogueProductName.jsx'
import ProductDetailsModal from '../products/ProductDetailsModal.jsx'
import ProductImage from '../products/ProductImage.jsx'
import ErrorMessage from '../ui/ErrorMessage.jsx'
import { readProductRecord } from '../../api/products.js'
import { formatMoney } from '../../utils/format.js'
import { lineCustomerState, readMatches, selectedMatches } from './fields.js'

const textValue = (value) => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return 'Not available'
}

const optionalText = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '')

const confidenceLabel = (score) => {
  if (score === null || score === undefined || score === '') {
    return null
  }

  const value = Number(score)

  if (!Number.isFinite(value)) {
    return null
  }

  const percent = Math.round(value * 1000) / 10
  return `${percent}%`
}

const stateCopy = {
  accepted: 'Accepted',
  pending: 'Pending',
  rejected: 'Rejected',
  converted: 'Converted',
}

const availabilityLabel = (product) => {
  const stock = Number(product && product.stock_quantity)

  if (!Number.isInteger(stock)) {
    return ''
  }

  if (stock <= 0) {
    return 'Out of stock'
  }

  return `In stock (${stock.toLocaleString('en-IN')})`
}

const shownMatch = (item) => {
  const matches = readMatches(item)
  const selected = selectedMatches(item)

  if (selected.length === 1) {
    return selected[0]
  }

  const suggestion = matches.find((match) => match.match_status !== 'rejected' && match.is_selected !== true)

  if (suggestion) {
    return suggestion
  }

  return matches[0] || null
}

export default function PurchaseOrderLines({
  items,
  catalogueById,
  reviewable,
  pendingItemId,
  itemErrors,
  onSelect,
  onReject,
  onSearch,
}) {
  const [pickingId, setPickingId] = useState(null)
  const [detailProductId, setDetailProductId] = useState(null)
  const pickingItem = items.find((item) => String(item.id) === String(pickingId)) || null

  return (
    <section className="po-review-table-card">
      <div className="po-table-wrap">
        <table className="po-review-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Extracted Item</th>
              <th>Qty</th>
              <th>Suggested Catalogue Product</th>
              <th>SKU</th>
              <th>Confidence</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <PurchaseOrderLine
                key={item.id}
                item={item}
                index={index}
                catalogueById={catalogueById}
                reviewable={reviewable}
                busy={pendingItemId !== null && pendingItemId !== undefined}
                pending={String(pendingItemId) === String(item.id)}
                error={itemErrors[String(item.id)] || ''}
                onSelect={onSelect}
                onReject={onReject}
                onChoose={() => setPickingId(item.id)}
                onOpenProduct={setDetailProductId}
              />
            ))}
          </tbody>
        </table>
      </div>
      {reviewable && pickingItem ? (
        <CatalogueDialog
          key={pickingItem.id}
          item={pickingItem}
          busy={pendingItemId !== null && pendingItemId !== undefined}
          error={itemErrors[String(pickingItem.id)] || ''}
          onSearch={onSearch}
          onClose={() => setPickingId(null)}
          onSelect={async (productId) => {
            const saved = await onSelect(pickingItem.id, productId)
            if (saved) {
              setPickingId(null)
            }
            return saved
          }}
        />
      ) : null}
      <ProductDetailsModal productId={detailProductId} onClose={() => setDetailProductId(null)} />
    </section>
  )
}

function PurchaseOrderLine({
  item,
  index,
  catalogueById,
  reviewable,
  busy,
  pending,
  error,
  onSelect,
  onReject,
  onChoose,
  onOpenProduct,
}) {
  const match = shownMatch(item)
  const state = lineCustomerState(item)
  const converted = state === 'converted'
  const catalogue = match ? readProductRecord(catalogueById[String(match.product_id)]) : null
  const confidence = match ? confidenceLabel(match.match_score) : null
  const lineNumber = Number.isInteger(Number(item.line_number)) ? item.line_number : index + 1
  const product = match ? {
    name: match.product_name,
    sku: match.product_sku,
    image_url: catalogue && catalogue.image_url ? catalogue.image_url : null,
  } : null
  const accepted = state === 'accepted'
  const suggested = Boolean(match && match.match_status !== 'rejected' && !accepted)

  return (
    <tr className={`is-${state}`} aria-busy={pending}>
      <td data-label="#">{lineNumber}</td>
      <td data-label="Extracted Item">
        <strong>{textValue(item.extracted_name)}</strong>
        {item.extracted_sku ? <small>SKU {textValue(item.extracted_sku)}</small> : null}
      </td>
      <td data-label="Qty">{textValue(item.quantity)}</td>
      <td data-label="Suggested Catalogue Product">
        {match ? (
          <div className="po-review-product">
            <ProductImage product={product} />
            <span>
              <CatalogueProductName productId={match.product_id} onOpen={onOpenProduct}>
                {textValue(match.product_name)}
              </CatalogueProductName>
              <em className={`po-review-state is-${state}`}>{stateCopy[state]}</em>
            </span>
          </div>
        ) : (
          <span className="po-review-state is-pending">Pending</span>
        )}
      </td>
      <td data-label="SKU">{match ? textValue(match.product_sku) : '—'}</td>
      <td data-label="Confidence">{confidence || '—'}</td>
      <td data-label="Action">
        {reviewable && !converted ? (
          <div className="po-review-actions">
            {suggested ? (
              <button type="button" disabled={busy} onClick={() => onSelect(item.id, match.product_id)}>
                {pending ? 'Saving…' : 'Select'}
              </button>
            ) : null}
            {match && match.match_status !== 'rejected' ? (
              <button type="button" className="is-quiet" disabled={busy} onClick={() => onReject(item.id, match.product_id)}>
                {pending ? 'Saving…' : 'Reject'}
              </button>
            ) : null}
            <button type="button" className="is-quiet" disabled={busy} onClick={onChoose}>
              {accepted ? 'Change' : 'Choose Product'}
            </button>
          </div>
        ) : (
          <span className={`po-review-state is-${state}`}>{stateCopy[state]}</span>
        )}
        {pending ? <p className="po-review-saving">Saving review</p> : null}
        <ErrorMessage message={error} />
      </td>
    </tr>
  )
}

function activeProducts(products) {
  return (Array.isArray(products) ? products : []).filter((product) => product && product.is_active !== false && product.id !== undefined && product.id !== null)
}

function mergeProducts(current, incoming, limit = 8) {
  const seen = new Set(current.map((product) => String(product.id)))
  const next = current.slice()

  activeProducts(incoming).forEach((product) => {
    const key = String(product.id)
    if (seen.has(key) || next.length >= limit) {
      return
    }
    seen.add(key)
    next.push(product)
  })

  return next
}

async function collectSuggestions(item, search) {
  const name = textValue(item.extracted_name)
  const sku = textValue(item.extracted_sku)
  const nameQuery = name === 'Not available' ? '' : name
  const skuQuery = sku === 'Not available' ? '' : sku
  let list = []

  if (nameQuery) {
    list = mergeProducts(list, await search(nameQuery))
  }
  if (skuQuery && skuQuery.toLowerCase() !== nameQuery.toLowerCase()) {
    list = mergeProducts(list, await search(skuQuery))
  }
  if (list.length < 4 && nameQuery) {
    const words = [...new Set(
      nameQuery
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 4 && word.toLowerCase() !== nameQuery.toLowerCase()),
    )].slice(0, 3)

    for (const word of words) {
      if (list.length >= 8) {
        break
      }
      list = mergeProducts(list, await search(word))
    }
  }

  let fallback = false
  if (list.length === 0) {
    list = mergeProducts([], await search(''))
    fallback = list.length > 0
  }

  return { products: list, fallback }
}

function CatalogueDialog({ item, busy, error, onSearch, onClose, onSelect }) {
  const searchRef = useRef(null)
  const onSearchRef = useRef(onSearch)
  const requestRef = useRef(0)
  const suggestionsRef = useRef([])
  const fallbackRef = useRef(false)
  const debounceRef = useRef(0)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState([])
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(true)
  const [failed, setFailed] = useState(false)
  const [showingSuggestions, setShowingSuggestions] = useState(true)
  const [showingFallback, setShowingFallback] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const saving = Boolean(savingId) || busy
  const extractedName = textValue(item.extracted_name)
  const extractedSku = textValue(item.extracted_sku)

  useEffect(() => {
    onSearchRef.current = onSearch
  }, [onSearch])

  const applyResult = (requestId, list, { suggestions = false, fallback = false, emptyMessage = '' } = {}) => {
    if (requestId !== requestRef.current) {
      return
    }
    setResults(list)
    setShowingSuggestions(suggestions)
    setShowingFallback(fallback)
    setFailed(false)
    setSearchError(list.length === 0 ? emptyMessage : '')
    setSearching(false)
  }

  const loadSuggestions = () => {
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setSearching(true)
    setFailed(false)
    setSearchError('')
    setResults([])
    setShowingSuggestions(true)

    collectSuggestions(item, (query) => onSearchRef.current(query))
      .then((result) => {
        if (requestId !== requestRef.current) {
          return
        }
        suggestionsRef.current = result.products
        fallbackRef.current = result.fallback
        applyResult(requestId, result.products, {
          suggestions: true,
          fallback: result.fallback,
          emptyMessage: 'No active catalogue products are available.',
        })
      })
      .catch((requestError) => {
        if (requestId !== requestRef.current) {
          return
        }
        setResults([])
        setFailed(true)
        setSearchError(requestError instanceof ApiError ? requestError.message : 'The catalogue could not be loaded')
        setSearching(false)
      })
  }

  const runSearch = useCallback(async (query) => {
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setSearching(true)
    setFailed(false)
    setSearchError('')
    setShowingSuggestions(false)
    setShowingFallback(false)
    setResults([])

    try {
      const list = mergeProducts([], await onSearchRef.current(query))
      if (requestId !== requestRef.current) {
        return
      }
      setResults(list)
      setShowingSuggestions(false)
      setShowingFallback(false)
      setFailed(false)
      setSearchError(list.length === 0 ? 'No active catalogue products matched that search' : '')
      setSearching(false)
    } catch (requestError) {
      if (requestId !== requestRef.current) {
        return
      }
      setResults([])
      setFailed(true)
      setSearchError(requestError instanceof ApiError ? requestError.message : 'The catalogue could not be searched')
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    searchRef.current?.focus()

    collectSuggestions(
      { extracted_name: item.extracted_name, extracted_sku: item.extracted_sku },
      (query) => onSearchRef.current(query),
    )
      .then((result) => {
        if (!active || requestId !== requestRef.current) {
          return
        }
        suggestionsRef.current = result.products
        fallbackRef.current = result.fallback
        setResults(result.products)
        setShowingSuggestions(true)
        setShowingFallback(result.fallback)
        setFailed(false)
        setSearchError(result.products.length === 0 ? 'No active catalogue products are available.' : '')
        setSearching(false)
      })
      .catch((requestError) => {
        if (!active || requestId !== requestRef.current) {
          return
        }
        setResults([])
        setFailed(true)
        setSearchError(requestError instanceof ApiError ? requestError.message : 'The catalogue could not be loaded')
        setSearching(false)
      })

    return () => {
      active = false
    }
  }, [item.extracted_name, item.extracted_sku, item.id])

  useEffect(() => {
    const query = term.trim()
    if (!query) {
      return undefined
    }
    debounceRef.current = window.setTimeout(() => {
      runSearch(query)
    }, 300)
    return () => window.clearTimeout(debounceRef.current)
  }, [term, runSearch])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) {
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [saving, onClose])

  const restoreSuggestions = () => {
    window.clearTimeout(debounceRef.current)
    setTerm('')
    if (suggestionsRef.current.length === 0) {
      loadSuggestions()
      return
    }
    requestRef.current += 1
    setFailed(false)
    setSearching(false)
    setShowingSuggestions(true)
    setShowingFallback(fallbackRef.current)
    setResults(suggestionsRef.current)
    setSearchError('')
  }

  const search = (event) => {
    event.preventDefault()
    window.clearTimeout(debounceRef.current)
    if (saving) {
      return
    }
    const query = term.trim()
    if (!query) {
      restoreSuggestions()
      return
    }
    runSearch(query)
  }

  const clearSearch = () => {
    if (saving) {
      return
    }
    restoreSuggestions()
  }

  const choose = async (product) => {
    if (saving || product.is_active === false) {
      return
    }

    setSavingId(String(product.id))
    const saved = await onSelect(product.id)

    if (!saved) {
      setSavingId(null)
    }
  }

  return (
    <div className="po-catalogue" role="dialog" aria-modal="true" aria-labelledby="po-catalogue-title">
      <form className="po-catalogue-card" onSubmit={search}>
        <header>
          <div>
            <h2 id="po-catalogue-title">{lineCustomerState(item) === 'accepted' ? 'Change product' : 'Choose Product'}</h2>
            <p>{extractedName}</p>
            <p>SKU {extractedSku === 'Not available' ? '—' : extractedSku} · Qty {textValue(item.quantity)}</p>
          </div>
          <button type="button" className="is-quiet" onClick={onClose} disabled={saving}>Close</button>
        </header>
        <div className="po-catalogue-search">
          <label>
            <span className="po-sr">Catalogue search</span>
            <input
              ref={searchRef}
              value={term}
              onChange={(event) => {
              const value = event.target.value
              if (!value.trim()) {
                restoreSuggestions()
                return
              }
              setTerm(value)
            }}
              placeholder="Search by name, SKU, or brand"
              disabled={saving}
            />
          </label>
          <button type="submit" disabled={saving}>{searching && !showingSuggestions ? 'Searching…' : 'Search'}</button>
          <button type="button" className="is-quiet" onClick={clearSearch} disabled={saving}>Clear Search</button>
        </div>
        <p className="po-catalogue-status">
          {searching ? 'Loading catalogue products…' : showingSuggestions
            ? (showingFallback ? 'No exact catalogue match. Showing other active products.' : 'Suggested catalogue products')
            : 'Search results'}
        </p>
        <ErrorMessage message={searchError || error} />
        {failed ? <button type="button" onClick={showingSuggestions || !term.trim() ? loadSuggestions : () => runSearch(term.trim())}>Retry</button> : null}
        {searching && results.length === 0 ? (
          <ul className="po-catalogue-skeleton" aria-busy="true" aria-label="Loading catalogue products">
            <li />
            <li />
            <li />
          </ul>
        ) : null}
        {results.length > 0 ? (
          <ul className="po-catalogue-results">
            {results.map((product) => {
              const brand = optionalText(product.brand)
              const category = optionalText(product.category)
              const price = product.price === undefined || product.price === null ? '' : formatMoney(product.price, product.currency || 'INR')
              const stock = Number(product.stock_quantity)
              const outOfStock = Number.isInteger(stock) && stock <= 0
              const active = product.is_active !== false

              return (
                <li key={product.id}>
                  <ProductImage product={product} />
                  <span>
                    <strong>{product.name}</strong>
                    <small>SKU {product.sku}</small>
                    {brand || category ? <small>{[brand && `Brand ${brand}`, category && `Category ${category}`].filter(Boolean).join(' · ')}</small> : null}
                    {price && price !== 'Price unavailable' ? <small>{price}</small> : null}
                    <small className={outOfStock ? 'is-out' : ''}>{availabilityLabel(product) || 'Stock unavailable'}</small>
                    <small>{active ? 'Active' : 'Unavailable'}</small>
                  </span>
                  <button type="button" disabled={saving || !active} onClick={() => choose(product)}>
                    {savingId === String(product.id) ? 'Saving…' : 'Select Product'}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </form>
    </div>
  )
}
