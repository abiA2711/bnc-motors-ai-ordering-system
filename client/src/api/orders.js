import { request } from './client.js'

const readOrder = (payload) => {
  const order = payload && payload.data && payload.data.order

  if (!order || order.id === undefined || order.id === null || !order.order_number) {
    return null
  }

  return order
}

export async function createOrder(order) {
  const payload = await request('/api/orders', {
    method: 'POST',
    body: order,
  })
  const created = readOrder(payload)

  if (!created) {
    throw new Error('The order could not be read')
  }

  return created
}

export async function getOrder(id) {
  const payload = await request(`/api/orders/${encodeURIComponent(id)}`)
  const order = readOrder(payload)

  if (!order) {
    throw new Error('The order could not be read')
  }

  return order
}

const readOrderPage = (payload) => {
  const data = payload && payload.data
  const orders = data && Array.isArray(data.orders) ? data.orders : null

  if (!data || !orders || !Number.isInteger(data.page) || !Number.isInteger(data.totalPages) || !Number.isInteger(data.total)) {
    return null
  }

  return {
    orders,
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.totalPages,
  }
}

export async function listMyOrders({ page = 1, limit = 5, status = '', search = '', from = '', to = '' } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  if (status) {
    params.set('status', status)
  }

  if (search) {
    params.set('search', search)
  }

  if (from) {
    params.set('from', from)
  }

  if (to) {
    params.set('to', to)
  }

  const payload = await request(`/api/orders/my?${params.toString()}`)
  const pageResult = readOrderPage(payload)
  const counts = payload && payload.data && payload.data.counts

  if (!pageResult) {
    throw new Error('The order list could not be read')
  }

  return {
    ...pageResult,
    counts: counts && typeof counts === 'object' ? counts : null,
  }
}

export async function updateOrderStatus(id, status) {
  const payload = await request(`/api/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: { status },
  })
  const order = readOrder(payload)

  if (!order) {
    throw new Error('The order could not be read')
  }

  return {
    message: typeof payload.message === 'string' ? payload.message : 'Order status updated',
    order,
  }
}

const ORDER_COUNT_KEYS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']

const readOrderCounts = (payload) => {
  const counts = payload && payload.data && payload.data.counts

  if (!counts || typeof counts !== 'object') {
    return null
  }

  const next = {}
  let all = 0

  for (const key of ORDER_COUNT_KEYS) {
    const value = counts[key]

    if (!Number.isInteger(value) || value < 0) {
      return null
    }

    next[key] = value
    all += value
  }

  if (!Number.isInteger(counts.all) || counts.all !== all) {
    return null
  }

  next.all = counts.all

  if (
    Number.isInteger(counts.cart_checkout)
    && counts.cart_checkout >= 0
    && Number.isInteger(counts.purchase_order)
    && counts.purchase_order >= 0
    && counts.cart_checkout + counts.purchase_order === counts.all
  ) {
    next.cart_checkout = counts.cart_checkout
    next.purchase_order = counts.purchase_order
  }

  return next
}

export async function listOrders({ page = 1, limit = 10, status = '', source = '', search = '', from = '', to = '' } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  })

  if (status) {
    params.set('status', status)
  }

  if (source) {
    params.set('source', source)
  }

  if (search) {
    params.set('search', search)
  }

  if (from) {
    params.set('from', from)
  }

  if (to) {
    params.set('to', to)
  }

  const payload = await request(`/api/orders?${params.toString()}`)
  const pageResult = readOrderPage(payload)

  if (!pageResult) {
    throw new Error('The order list could not be read')
  }

  return {
    ...pageResult,
    counts: readOrderCounts(payload),
  }
}
