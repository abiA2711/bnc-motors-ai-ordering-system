import { ApiError, getToken, request } from './client.js'

const readPurchaseOrder = (value) => {
  if (!value || value.id === undefined || value.id === null || !value.po_number) {
    return null
  }

  return value
}

export async function listPurchaseOrders({ page = 1, limit = 10, status = '', search = '', from = '', to = '' } = {}) {
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

  const payload = await request(`/api/purchase-orders?${params.toString()}`)
  const data = payload && payload.data
  const purchaseOrders = data && Array.isArray(data.purchase_orders) ? data.purchase_orders : null
  const counts = data && data.counts

  if (!data || !purchaseOrders || !Number.isInteger(data.page) || !Number.isInteger(data.totalPages)) {
    throw new Error('The purchase order list could not be read')
  }

  return {
    purchaseOrders,
    total: data.total,
    page: data.page,
    limit: data.limit,
    totalPages: data.totalPages,
    counts: counts && typeof counts === 'object' ? counts : null,
  }
}

export async function getPurchaseOrder(id) {
  const payload = await request(`/api/purchase-orders/${encodeURIComponent(id)}`)
  const purchaseOrder = readPurchaseOrder(payload && payload.data && payload.data.purchase_order)

  if (!purchaseOrder) {
    throw new Error('The purchase order could not be read')
  }

  return purchaseOrder
}

export async function fetchPurchaseOrderPdf(id) {
  const headers = new Headers()
  const token = getToken()

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const baseUrl = import.meta.env.VITE_API_URL || ''
  let response

  try {
    response = await fetch(`${baseUrl}/api/purchase-orders/${encodeURIComponent(id)}/file`, { headers })
  } catch {
    throw new ApiError('The server could not be reached', 0)
  }

  if (!response.ok) {
    let message = 'The original PDF is unavailable'
    const text = await response.text()

    if (text) {
      try {
        const payload = JSON.parse(text)
        if (payload && typeof payload.message === 'string' && payload.message.trim()) {
          message = payload.message
        }
      } catch {
        message = 'The original PDF is unavailable'
      }
    }

    throw new ApiError(message, response.status)
  }

  const blob = await response.blob()

  if (!blob || blob.size < 5) {
    throw new ApiError('The original PDF is unavailable', 404)
  }

  return blob
}

export async function reviewPurchaseOrderMatch(purchaseOrderId, itemId, { action, productId }) {
  const payload = await request(
    `/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}/items/${encodeURIComponent(itemId)}/matches`,
    {
      method: 'PATCH',
      body: {
        action,
        product_id: productId,
      },
    },
  )
  const purchaseOrder = readPurchaseOrder(payload && payload.data && payload.data.purchase_order)

  if (!purchaseOrder) {
    throw new Error('The purchase order could not be read')
  }

  return purchaseOrder
}

export async function confirmPurchaseOrder(purchaseOrderId, details) {
  const payload = await request(`/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}/confirm`, {
    method: 'POST',
    body: {
      shipping_address: details.shipping_address,
      billing_address: details.billing_address,
      notes: details.notes,
    },
  })
  const data = payload && payload.data
  const purchaseOrder = readPurchaseOrder(data && data.purchase_order)
  const order = data && data.order

  if (!purchaseOrder || !order || !order.order_number || order.id === undefined || order.id === null) {
    throw new Error('The order could not be read')
  }

  return {
    message: typeof payload.message === 'string' ? payload.message : '',
    purchaseOrder,
    order,
    convertedLineCount: Number(data && data.converted_line_count),
    remainingLineCount: Number(data && data.remaining_line_count),
  }
}

export async function uploadPurchaseOrder(file) {
  const body = new FormData()
  body.append('file', file)
  const payload = await request('/api/purchase-orders/upload', {
    method: 'POST',
    body,
  })
  const data = payload && payload.data
  const purchaseOrder = readPurchaseOrder(data && data.purchase_order)

  if (!purchaseOrder) {
    throw new Error('The purchase order could not be read')
  }

  return {
    message: typeof payload.message === 'string' ? payload.message : '',
    purchaseOrder,
    extraction: data.extraction && typeof data.extraction === 'object' ? data.extraction : null,
  }
}
