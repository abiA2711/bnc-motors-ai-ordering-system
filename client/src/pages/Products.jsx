import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { listProducts } from '../api/products.js'
import ProductCard from '../components/products/ProductCard.jsx'
import Button from '../components/ui/Button.jsx'
import ErrorMessage from '../components/ui/ErrorMessage.jsx'
import { moneyToCents } from '../utils/format.js'
import { readStockQuantity } from '../utils/stock.js'
import '../styles/catalogue.css'

const PAGE_SIZE = 12
const FETCH_LIMIT = 100
const FETCH_PAGES = 5
const blankFilters = {
  categories: [],
  brands: [],
  stockIn: false,
  stockOut: false,
  priceMin: null,
  priceMax: null,
}

const textOf = (value, fallback) => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || fallback
}

const rupees = (cents) => Math.round(cents / 100)

const loadCatalogue = async () => {
  const products = []
  let page = 1
  let totalPages = 1
  let total = 0

  while (page <= totalPages && page <= FETCH_PAGES) {
    const list = await listProducts({ page, limit: FETCH_LIMIT })
    products.push(...list.products)
    totalPages = list.totalPages
    total = list.total
    page += 1
  }

  return { products, total, truncated: totalPages > FETCH_PAGES }
}

const matchesSearch = (product, search) => {
  if (!search) {
    return true
  }

  const haystack = `${product.name || ''} ${product.sku || ''}`.toLowerCase()
  return haystack.includes(search)
}

const matchesChoice = (value, selected, fallback) => {
  if (selected.length === 0) {
    return true
  }

  return selected.includes(textOf(value, fallback))
}

const describeFilters = (source, search, bounds) => ({
  search,
  categories: source.categories,
  brands: source.brands,
  stockIn: source.stockIn,
  stockOut: source.stockOut,
  priceActive: bounds !== null && (source.priceMin !== null || source.priceMax !== null),
  minPrice: source.priceMin ?? bounds?.min ?? 0,
  maxPrice: source.priceMax ?? bounds?.max ?? 0,
})

const productMatches = (product, criteria, ignore = {}) => {
  if (!ignore.search && !matchesSearch(product, criteria.search)) {
    return false
  }

  if (!ignore.category && !matchesChoice(product.category, criteria.categories, 'Uncategorised')) {
    return false
  }

  if (!ignore.brand && !matchesChoice(product.brand, criteria.brands, 'Unbranded')) {
    return false
  }

  if (!ignore.stock && criteria.stockIn !== criteria.stockOut) {
    const stock = readStockQuantity(product)
    const available = stock !== null && stock > 0

    if (criteria.stockIn && !available) {
      return false
    }

    if (criteria.stockOut && (available || stock === null)) {
      return false
    }
  }

  if (!ignore.price && criteria.priceActive) {
    const cents = moneyToCents(product.price)
    if (cents === null || cents < criteria.minPrice || cents > criteria.maxPrice) {
      return false
    }
  }

  return true
}

const pageList = (page, totalPages) => {
  const pages = [1]

  for (let number = Math.max(2, page - 1); number <= Math.min(totalPages - 1, page + 1); number += 1) {
    pages.push(number)
  }

  if (totalPages > 1) {
    pages.push(totalPages)
  }

  return [...new Set(pages)]
}

function FilterGroup({ title, open, onToggle, children }) {
  return (
    <section className="catalogue-group">
      <button type="button" aria-expanded={open} onClick={onToggle}>
        <span>{title}</span>
        <span className="catalogue-chevron" aria-hidden="true" />
      </button>
      <div className={`catalogue-group-panel${open ? ' is-open' : ''}`} inert={open ? undefined : true}>
        <div className="catalogue-group-clip">
          <div className="catalogue-group-body">{children}</div>
        </div>
      </div>
    </section>
  )
}

function ChoiceList({ options, selected, onToggle }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? options : options.slice(0, 5)

  if (options.length === 0) {
    return <p className="catalogue-empty">None in these results.</p>
  }

  return (
    <>
      {visible.map(([name, count]) => (
        <label key={name} className={selected.includes(name) ? 'is-selected' : undefined}>
          <input type="checkbox" checked={selected.includes(name)} onChange={() => onToggle(name)} />
          <span>{name}</span>
          <small>{count.toLocaleString('en-IN')}</small>
        </label>
      ))}
      {options.length > 5 ? (
        <button type="button" className="catalogue-more" onClick={() => setExpanded((current) => !current)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </>
  )
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" />
      <rect x="14" y="4" width="6" height="6" />
      <rect x="4" y="14" width="6" height="6" />
      <rect x="14" y="14" width="6" height="6" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 7h12M8 12h12M8 17h12" />
      <circle cx="4.5" cy="7" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="17" r="1" />
    </svg>
  )
}

export default function Products() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedSearch = searchParams.get('search') || ''
  const [catalogue, setCatalogue] = useState([])
  const [catalogueTotal, setCatalogueTotal] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [trackedSearch, setTrackedSearch] = useState(requestedSearch)
  const [search, setSearch] = useState(requestedSearch.trim().toLowerCase())
  const [filters, setFilters] = useState(blankFilters)
  const [draft, setDraft] = useState(blankFilters)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 1024px)').matches)
  const [sort, setSort] = useState('name')
  const [view, setView] = useState('grid')
  const [page, setPage] = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [groups, setGroups] = useState({
    category: true,
    brand: true,
    availability: true,
    price: true,
  })

  if (requestedSearch !== trackedSearch) {
    setTrackedSearch(requestedSearch)
    setSearch(requestedSearch.trim().toLowerCase())
    setPage(1)
  }

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1024px)')
    const update = () => setIsMobile(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    let active = true

    loadCatalogue()
      .then((result) => {
        if (!active) {
          return
        }

        setCatalogue(result.products)
        setCatalogueTotal(result.total)
        setTruncated(result.truncated)
        setError('')
        setLoading(false)
      })
      .catch((requestError) => {
        if (!active) {
          return
        }

        setCatalogue([])
        setCatalogueTotal(0)
        setTruncated(false)
        setError(requestError instanceof ApiError ? requestError.message : 'Products could not be loaded')
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [attempt])

  const bounds = useMemo(() => {
    const cents = catalogue.flatMap((product) => {
      const value = moneyToCents(product.price)
      return value === null ? [] : [value]
    })

    if (cents.length === 0) {
      return null
    }

    return { min: Math.min(...cents), max: Math.max(...cents) }
  }, [catalogue])

  const shown = isMobile && filtersOpen ? draft : filters
  const shownMin = shown.priceMin ?? bounds?.min ?? 0
  const shownMax = shown.priceMax ?? bounds?.max ?? 0
  const criteria = useMemo(() => describeFilters(filters, search, bounds), [filters, search, bounds])
  const panelCriteria = useMemo(() => describeFilters(shown, search, bounds), [shown, search, bounds])

  const filtered = useMemo(() => {
    const next = catalogue.filter((product) => productMatches(product, criteria))

    next.sort((left, right) => {
      if (sort === 'price_asc' || sort === 'price_desc') {
        const leftPrice = moneyToCents(left.price)
        const rightPrice = moneyToCents(right.price)

        if (leftPrice !== null && rightPrice !== null && leftPrice !== rightPrice) {
          return sort === 'price_asc' ? leftPrice - rightPrice : rightPrice - leftPrice
        }
      }

      return String(left.name || '').localeCompare(String(right.name || '')) || String(left.id).localeCompare(String(right.id))
    })

    return next
  }, [catalogue, criteria, sort])

  const categoryOptions = useMemo(() => {
    const counts = new Map()

    catalogue.forEach((product) => {
      if (!productMatches(product, panelCriteria, { category: true })) {
        return
      }

      const name = textOf(product.category, 'Uncategorised')
      counts.set(name, (counts.get(name) || 0) + 1)
    })

    return [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]))
  }, [catalogue, panelCriteria])

  const brandOptions = useMemo(() => {
    const counts = new Map()

    catalogue.forEach((product) => {
      if (!productMatches(product, panelCriteria, { brand: true })) {
        return
      }

      const name = textOf(product.brand, 'Unbranded')
      counts.set(name, (counts.get(name) || 0) + 1)
    })

    return [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]))
  }, [catalogue, panelCriteria])

  const stockCounts = useMemo(() => catalogue.reduce((counts, product) => {
    if (!productMatches(product, panelCriteria, { stock: true })) {
      return counts
    }

    const stock = readStockQuantity(product)
    if (stock !== null && stock > 0) {
      return { ...counts, inStock: counts.inStock + 1 }
    }

    if (stock !== null && stock < 1) {
      return { ...counts, outOfStock: counts.outOfStock + 1 }
    }

    return counts
  }, { inStock: 0, outOfStock: 0 }), [catalogue, panelCriteria])

  const totalPages = filtered.length === 0 ? 0 : Math.ceil(filtered.length / PAGE_SIZE)
  const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages)
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length)

  const resetPage = () => setPage(1)

  const toggleValue = (current, value) => (
    current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
  )

  const commitFilters = (next) => {
    const resolved = typeof next === 'function' ? next(filters) : next
    setFilters(resolved)
    setDraft(resolved)
    resetPage()
  }

  const editPanel = (next) => {
    if (isMobile && filtersOpen) {
      setDraft(next)
      return
    }

    commitFilters(next)
  }

  const clearFilters = () => {
    setSearch('')
    setFilters(blankFilters)
    setDraft(blankFilters)
    setSort('name')
    setPage(1)
    setSearchParams({}, { replace: true })
  }

  const openFilters = () => {
    setDraft(filters)
    setFiltersOpen(true)
  }

  const closeFilters = () => {
    setDraft(filters)
    setFiltersOpen(false)
  }

  const applyFilters = () => {
    setFilters(draft)
    setPage(1)
    setFiltersOpen(false)
  }

  const setPriceBound = (edge, cents) => {
    if (!bounds || !Number.isFinite(cents)) {
      return
    }

    editPanel((current) => {
      const floor = current.priceMin ?? bounds.min
      const ceiling = current.priceMax ?? bounds.max
      const nextMin = edge === 'min' ? Math.min(Math.max(cents, bounds.min), ceiling) : floor
      const nextMax = edge === 'max' ? Math.max(Math.min(cents, bounds.max), floor) : ceiling
      return { ...current, priceMin: nextMin, priceMax: nextMax }
    })
  }

  const toggleGroup = (key) => {
    setGroups((current) => ({ ...current, [key]: !current[key] }))
  }

  const retry = () => {
    setError('')
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  const priceLabel = `₹${rupees(filters.priceMin ?? bounds?.min ?? 0).toLocaleString('en-IN')} – ₹${rupees(filters.priceMax ?? bounds?.max ?? 0).toLocaleString('en-IN')}`
  const priceNarrowed = Boolean(bounds && (
    (filters.priceMin !== null && filters.priceMin > bounds.min)
    || (filters.priceMax !== null && filters.priceMax < bounds.max)
  ))
  const chips = [
    ...(search ? [{ id: 'search', label: `Search: ${requestedSearch}`,       clear: () => {
      setSearch('')
      setPage(1)
      setSearchParams({}, { replace: true })
    } }] : []),
    ...filters.categories.map((name) => ({
      id: `category:${name}`,
      label: name,
      clear: () => commitFilters((current) => ({
        ...current,
        categories: current.categories.filter((item) => item !== name),
      })),
    })),
    ...filters.brands.map((name) => ({
      id: `brand:${name}`,
      label: name,
      clear: () => commitFilters((current) => ({
        ...current,
        brands: current.brands.filter((item) => item !== name),
      })),
    })),
    ...(filters.stockIn ? [{
      id: 'stock-in',
      label: 'In Stock',
      clear: () => commitFilters((current) => ({ ...current, stockIn: false })),
    }] : []),
    ...(filters.stockOut ? [{
      id: 'stock-out',
      label: 'Out of Stock',
      clear: () => commitFilters((current) => ({ ...current, stockOut: false })),
    }] : []),
    ...(priceNarrowed ? [{
      id: 'price',
      label: priceLabel,
      clear: () => commitFilters((current) => ({ ...current, priceMin: null, priceMax: null })),
    }] : []),
  ]

  const filterPanel = (
    <aside className={`catalogue-filters${filtersOpen ? ' is-open' : ''}`}>
      <div className="catalogue-filter-head">
        <h2>Filters</h2>
        <button type="button" onClick={clearFilters}>Clear All</button>
      </div>
      <FilterGroup title="Category" open={groups.category} onToggle={() => toggleGroup('category')}>
        <ChoiceList
          options={categoryOptions}
          selected={shown.categories}
          onToggle={(name) => editPanel((current) => ({
            ...current,
            categories: toggleValue(current.categories, name),
          }))}
        />
      </FilterGroup>
      <FilterGroup title="Brand" open={groups.brand} onToggle={() => toggleGroup('brand')}>
        <ChoiceList
          options={brandOptions}
          selected={shown.brands}
          onToggle={(name) => editPanel((current) => ({
            ...current,
            brands: toggleValue(current.brands, name),
          }))}
        />
      </FilterGroup>
      <FilterGroup title="Availability" open={groups.availability} onToggle={() => toggleGroup('availability')}>
        <label className={shown.stockIn ? 'is-selected' : undefined}>
          <input
            type="checkbox"
            checked={shown.stockIn}
            onChange={(event) => editPanel((current) => ({ ...current, stockIn: event.target.checked }))}
          />
          <span>In Stock</span>
          <small>{stockCounts.inStock.toLocaleString('en-IN')}</small>
        </label>
        <label className={shown.stockOut ? 'is-selected' : undefined}>
          <input
            type="checkbox"
            checked={shown.stockOut}
            onChange={(event) => editPanel((current) => ({ ...current, stockOut: event.target.checked }))}
          />
          <span>Out of Stock</span>
          <small>{stockCounts.outOfStock.toLocaleString('en-IN')}</small>
        </label>
      </FilterGroup>
      <FilterGroup title="Price Range" open={groups.price} onToggle={() => toggleGroup('price')}>
        {bounds ? (
          <div className="catalogue-price">
            <div className="catalogue-range">
              <input
                type="range"
                min={bounds.min}
                max={bounds.max}
                value={shownMin}
                aria-label="Minimum price"
                onChange={(event) => setPriceBound('min', Number(event.target.value))}
              />
              <input
                type="range"
                min={bounds.min}
                max={bounds.max}
                value={shownMax}
                aria-label="Maximum price"
                onChange={(event) => setPriceBound('max', Number(event.target.value))}
              />
            </div>
            <p className="catalogue-price-readout">₹{rupees(shownMin).toLocaleString('en-IN')} – ₹{rupees(shownMax).toLocaleString('en-IN')}</p>
            <div className="catalogue-price-fields">
              <label>
                <span>Min</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={rupees(bounds.min)}
                  max={rupees(shownMax)}
                  value={rupees(shownMin)}
                  aria-label="Minimum price in rupees"
                  onChange={(event) => setPriceBound('min', Math.round(Number(event.target.value) * 100))}
                />
              </label>
              <label>
                <span>Max</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={rupees(shownMin)}
                  max={rupees(bounds.max)}
                  value={rupees(shownMax)}
                  aria-label="Maximum price in rupees"
                  onChange={(event) => setPriceBound('max', Math.round(Number(event.target.value) * 100))}
                />
              </label>
            </div>
          </div>
        ) : <p className="catalogue-empty">No prices are available.</p>}
      </FilterGroup>
      <button type="button" className="catalogue-apply" onClick={applyFilters}>Apply Filters</button>
    </aside>
  )

  return (
    <div className="catalogue">
      <header className="catalogue-heading">
        <h1>Products</h1>
        <p>Browse our wide range of automotive spare parts.</p>
      </header>
      {truncated ? (
        <p className="catalogue-note">Filters use the first {catalogue.length.toLocaleString('en-IN')} of {catalogueTotal.toLocaleString('en-IN')} active products.</p>
      ) : null}
      <div className="catalogue-layout">
        {filterPanel}
        {filtersOpen ? <button type="button" className="catalogue-backdrop" aria-label="Close filters" onClick={closeFilters} /> : null}
        <div className="catalogue-main">
          <div className="catalogue-toolbar">
            <p>Showing {rangeStart.toLocaleString('en-IN')}–{rangeEnd.toLocaleString('en-IN')} of {filtered.length.toLocaleString('en-IN')} products</p>
            <div className="catalogue-toolbar-actions">
              <label className="catalogue-sort">
                <span>Sort By</span>
                <select
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value)
                    resetPage()
                  }}
                >
                  <option value="name">Name</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                </select>
              </label>
              <div className="catalogue-views" role="group" aria-label="Product layout">
                <button type="button" aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => setView('grid')}><GridIcon /></button>
                <button type="button" aria-pressed={view === 'list'} aria-label="List view" onClick={() => setView('list')}><ListIcon /></button>
              </div>
              <button type="button" className="catalogue-filter-button" onClick={openFilters}>Filters</button>
            </div>
          </div>
          {chips.length > 0 ? (
            <div className="catalogue-chips" aria-label="Selected filters">
              {chips.map((chip) => (
                <button type="button" key={chip.id} onClick={chip.clear}>
                  <span>{chip.label}</span>
                  <span aria-hidden="true">×</span>
                </button>
              ))}
              <button type="button" className="catalogue-chip-clear" onClick={clearFilters}>Clear All</button>
            </div>
          ) : null}
          {loading ? <p className="catalogue-note">Loading products</p> : null}
          <ErrorMessage message={error} />
          {!loading && error ? <Button onClick={retry}>Try again</Button> : null}
          {!loading && !error && visible.length === 0 ? (
            <section className="catalogue-empty-state">
              <h2>No products found</h2>
              <p>No active products match this search or these filters.</p>
            </section>
          ) : null}
          {!loading && !error && visible.length > 0 ? (
            <section className={`catalogue-grid is-${view}`} aria-label="Product results">
              {visible.map((product) => (
                <ProductCard key={product.id} product={product} layout={view} />
              ))}
            </section>
          ) : null}
          {!loading && !error && totalPages > 1 ? (
            <nav className="catalogue-pager" aria-label="Product pages">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Previous</button>
              {pageList(safePage, totalPages).map((number, index, numbers) => (
                <span key={number}>
                  {index > 0 && number - numbers[index - 1] > 1 ? <span className="catalogue-ellipsis">…</span> : null}
                  <button type="button" aria-current={number === safePage ? 'page' : undefined} onClick={() => setPage(number)}>{number}</button>
                </span>
              ))}
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Next</button>
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  )
}
