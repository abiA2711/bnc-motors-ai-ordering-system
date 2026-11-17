import { request } from './client.js'

const readInventory = (payload) => {
  const data = payload && payload.data
  const summary = data && data.summary

  if (
    !data ||
    !Array.isArray(data.products) ||
    !Array.isArray(data.alerts) ||
    !Array.isArray(data.categories) ||
    !Number.isInteger(data.page) ||
    !Number.isInteger(data.total) ||
    !Number.isInteger(data.totalPages) ||
    !summary ||
    !Number.isInteger(summary.total_products) ||
    !Number.isInteger(summary.in_stock) ||
    !Number.isInteger(summary.low_stock) ||
    !Number.isInteger(summary.out_of_stock)
  ) {
    return null
  }

  return {
    products: data.products,
    alerts: data.alerts,
    categories: data.categories,
    summary,
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.totalPages,
  }
}

export async function getInventory({ page = 1, limit = 10, search = '', category = '', stockStatus = 'all' } = {}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('limit', String(limit))

  if (search) {
    params.set('search', search)
  }

  if (category) {
    params.set('category', category)
  }

  if (stockStatus && stockStatus !== 'all') {
    params.set('stock_status', stockStatus)
  }

  const payload = await request(`/api/admin/inventory?${params.toString()}`)
  const inventory = readInventory(payload)

  if (!inventory) {
    throw new Error('The inventory could not be read')
  }

  return inventory
}

export async function listMovements({ page = 1, limit = 10, movementType = '', from = '', to = '' } = {}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('limit', String(limit))

  if (movementType) {
    params.set('movement_type', movementType)
  }

  if (from) {
    params.set('from', from)
  }

  if (to) {
    params.set('to', to)
  }

  const payload = await request(`/api/admin/inventory/movements?${params.toString()}`)
  const data = payload && payload.data

  if (!data || !Array.isArray(data.movements) || !Number.isInteger(data.total) || !Number.isInteger(data.page) || !Number.isInteger(data.totalPages)) {
    throw new Error('The stock history could not be read')
  }

  return {
    movements: data.movements,
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.totalPages,
  }
}

export async function adjustStock(productId, { type, quantity, remarks }) {
  const payload = await request(`/api/products/${productId}/stock`, {
    method: 'PATCH',
    body: {
      type,
      quantity,
      remarks,
    },
  })
  const data = payload && payload.data

  if (!data || !Number.isInteger(data.current_stock) || !Number.isInteger(data.previous_stock)) {
    throw new Error('The stock update could not be read')
  }

  return {
    message: typeof payload.message === 'string' ? payload.message : 'Stock updated successfully',
    data,
  }
}
