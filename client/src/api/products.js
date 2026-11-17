import { ApiError, request } from './client.js'

const readList = (payload) => {
  const data = payload && payload.data
  const products = data && Array.isArray(data.products) ? data.products : null

  if (!data || !products || !Number.isInteger(data.page) || !Number.isInteger(data.totalPages)) {
    return null
  }

  return {
    products,
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.totalPages,
  }
}

export async function listProducts({ page = 1, limit = 9, search = '', category = '', status = '' } = {}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('limit', String(limit))

  if (search) {
    params.set('search', search)
  }

  if (category) {
    params.set('category', category)
  }

  if (status) {
    params.set('status', status)
  }

  const payload = await request(`/api/products?${params.toString()}`)
  const list = readList(payload)

  if (!list) {
    throw new Error('The product list could not be read')
  }

  return list
}

export function readProductRecord(value) {
  const nested = value && value.data && value.data.product
  const product = nested && typeof nested === 'object' ? nested : value

  if (!product || typeof product !== 'object' || product.price === undefined || product.price === null) {
    return null
  }

  return product
}

export async function loadCurrentStock(ids) {
  const wanted = [...new Set(ids.map((id) => String(id)))].filter((id) => /^[1-9]\d*$/.test(id))
  const products = {}
  const missing = []

  for (const id of wanted) {
    try {
      products[id] = await getProduct(id)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        missing.push(id)
        continue
      }

      throw error
    }
  }

  return { products, missing }
}

export async function listRelatedProducts(id, limit = 4) {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  const payload = await request(`/api/products/${encodeURIComponent(id)}/related?${params.toString()}`)
  const products = payload && payload.data && Array.isArray(payload.data.products)
    ? payload.data.products
    : null

  if (!products) {
    throw new Error('The related products could not be read')
  }

  return products
    .map((product) => readProductRecord(product))
    .filter((product) => product && String(product.id) !== String(id))
    .slice(0, 4)
}

export async function getProduct(id) {
  const payload = await request(`/api/products/${encodeURIComponent(id)}`)
  const product = readProductRecord(payload)

  if (!product || product.id === undefined || product.id === null) {
    throw new Error('The product could not be read')
  }

  return product
}

let catalogueTask = null
let lookupQueue = Promise.resolve()
const lookupTasks = new Map()

const fetchActiveCatalogue = async () => {
  const byId = {}
  let page = 1
  let totalPages = 1

  while (page <= totalPages && page <= 5) {
    const list = await listProducts({ page, limit: 100 })
    list.products.forEach((product) => {
      const record = readProductRecord(product)
      if (record && record.id !== undefined && record.id !== null) {
        byId[String(record.id)] = record
      }
    })
    totalPages = list.totalPages
    page += 1
  }

  return byId
}

const lookupProduct = (id) => {
  if (!lookupTasks.has(id)) {
    const task = lookupQueue.then(() => getProduct(id))
    lookupQueue = task.then(() => undefined, () => undefined)
    lookupTasks.set(id, task)
    task.catch(() => {
      lookupTasks.delete(id)
    })
  }

  return lookupTasks.get(id)
}

export async function loadCataloguePrices(ids) {
  const wanted = [...new Set(ids.map((id) => String(id)))].filter((id) => /^[1-9]\d*$/.test(id))
  const products = {}
  const errors = {}

  if (!catalogueTask) {
    catalogueTask = fetchActiveCatalogue().catch((error) => {
      catalogueTask = null
      throw error
    })
  }

  let catalogue = null

  try {
    catalogue = await catalogueTask
  } catch {
    catalogue = null
  }

  const missing = []

  wanted.forEach((id) => {
    if (catalogue && catalogue[id]) {
      products[id] = catalogue[id]
      return
    }

    missing.push(id)
  })

  for (const id of missing) {
    try {
      products[id] = await lookupProduct(id)
    } catch (error) {
      errors[id] = error instanceof ApiError ? error.message : 'The catalogue price could not be loaded'
    }
  }

  return { products, errors }
}

export async function createProduct(product) {
  const payload = await request('/api/products', {
    method: 'POST',
    body: product,
  })
  const created = readProductRecord(payload)

  if (!created || created.id === undefined || created.id === null) {
    throw new Error('The product could not be read')
  }

  return {
    message: typeof payload.message === 'string' ? payload.message : 'Product created',
    product: created,
  }
}

export async function updateProduct(id, product) {
  const payload = await request(`/api/products/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: product,
  })
  const updated = readProductRecord(payload)

  if (!updated || updated.id === undefined || updated.id === null) {
    throw new Error('The product could not be read')
  }

  return {
    message: typeof payload.message === 'string' ? payload.message : 'Product updated',
    product: updated,
  }
}

export async function updateProductStatus(id, isActive) {
  const payload = await request(`/api/products/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: { is_active: isActive },
  })
  const product = readProductRecord(payload)

  if (!product || product.id === undefined || product.id === null) {
    throw new Error('The product could not be read')
  }

  return {
    message: typeof payload.message === 'string' ? payload.message : (isActive ? 'Product activated' : 'Product deactivated'),
    product,
  }
}

export async function deleteProduct(id) {
  const payload = await request(`/api/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  const product = readProductRecord(payload)

  if (!product) {
    throw new Error('The product could not be read')
  }

  return {
    message: typeof payload.message === 'string' ? payload.message : 'Product deactivated',
    product,
  }
}

export async function listProductCategories(options = {}) {
  const status = options.status || ''
  const categories = new Set()
  let page = 1
  let totalPages = 1

  while (page <= totalPages && page <= 5) {
    const list = await listProducts({ page, limit: 100, status })
    list.products.forEach((product) => {
      if (typeof product.category === 'string' && product.category.trim()) {
        categories.add(product.category.trim())
      }
    })
    totalPages = list.totalPages
    page += 1
  }

  return [...categories].sort((left, right) => left.localeCompare(right))
}
