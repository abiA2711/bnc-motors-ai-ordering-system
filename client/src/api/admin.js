import { request } from './client.js'

const RANGES = new Set([7, 30, 90])
const ORDER_STATUSES = new Set(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])
const PURCHASE_ORDER_STATUS_ORDER = ['uploaded', 'processing', 'review_required', 'partially_converted', 'confirmed', 'failed']
const PURCHASE_ORDER_STATUSES = new Set(PURCHASE_ORDER_STATUS_ORDER)

const invalid = () => {
  throw new Error('The dashboard could not be read')
}

const count = (value) => {
  if (!Number.isInteger(value) || value < 0) {
    invalid()
  }

  return value
}

const readSummary = (summary) => {
  if (!summary || typeof summary !== 'object') {
    invalid()
  }

  const totals = {
    totalCustomers: count(summary.totalCustomers),
    activeProducts: count(summary.activeProducts),
    totalOrders: count(summary.totalOrders),
    pendingOrders: count(summary.pendingOrders),
    totalPurchaseOrders: count(summary.totalPurchaseOrders),
    partiallyConvertedPurchaseOrders: count(summary.partiallyConvertedPurchaseOrders),
  }

  if (totals.pendingOrders > totals.totalOrders || totals.partiallyConvertedPurchaseOrders > totals.totalPurchaseOrders) {
    invalid()
  }

  return totals
}

const readTrend = (points, rangeDays) => {
  if (!Array.isArray(points) || points.length !== rangeDays) {
    invalid()
  }

  return points.map((point, index) => {
    if (!point || typeof point.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(point.date)) {
      invalid()
    }

    if (index > 0 && point.date <= points[index - 1].date) {
      invalid()
    }

    return { date: point.date, count: count(point.count) }
  })
}

const readStatuses = (rows, summary) => {
  if (!Array.isArray(rows) || rows.length !== PURCHASE_ORDER_STATUS_ORDER.length) {
    invalid()
  }

  const statuses = rows.map((row, index) => {
    if (!row || row.status !== PURCHASE_ORDER_STATUS_ORDER[index]) {
      invalid()
    }

    return { status: row.status, count: count(row.count) }
  })
  const total = statuses.reduce((sum, row) => sum + row.count, 0)
  const partial = statuses.find((row) => row.status === 'partially_converted')

  if (total !== summary.totalPurchaseOrders || (partial ? partial.count : 0) !== summary.partiallyConvertedPurchaseOrders) {
    invalid()
  }

  return statuses
}

const readRecentOrders = (rows) => {
  if (!Array.isArray(rows) || rows.length > 5) {
    invalid()
  }

  return rows.map((row) => {
    if (!row || typeof row.id !== 'string' || !/^[1-9]\d*$/.test(row.id) || typeof row.orderNumber !== 'string' || !row.orderNumber.trim() || !ORDER_STATUSES.has(row.status)) {
      invalid()
    }

    if (typeof row.totalAmount !== 'string' || !/^\d+\.\d{2}$/.test(row.totalAmount)) {
      invalid()
    }

    return {
      id: row.id,
      orderNumber: row.orderNumber,
      customerName: typeof row.customerName === 'string' ? row.customerName.trim() : '',
      itemCount: count(row.itemCount),
      totalAmount: row.totalAmount,
      currency: 'INR',
      status: row.status,
    }
  })
}

const readRecentPurchaseOrders = (rows) => {
  if (!Array.isArray(rows) || rows.length > 5) {
    invalid()
  }

  return rows.map((row) => {
    if (!row || typeof row.id !== 'string' || !/^[1-9]\d*$/.test(row.id) || typeof row.poNumber !== 'string' || !row.poNumber.trim() || !PURCHASE_ORDER_STATUSES.has(row.status)) {
      invalid()
    }

    const itemCount = count(row.itemCount)
    const convertedItemCount = count(row.convertedItemCount)

    if (convertedItemCount > itemCount) {
      invalid()
    }

    return {
      id: row.id,
      poNumber: row.poNumber,
      customerName: typeof row.customerName === 'string' ? row.customerName.trim() : '',
      itemCount,
      convertedItemCount,
      status: row.status,
    }
  })
}

export async function loadAdminDashboard(range = 30) {
  const rangeDays = Number(range)

  if (!RANGES.has(rangeDays)) {
    throw new Error('Date range must be 7, 30, or 90 days')
  }

  const payload = await request(`/api/admin/dashboard/stats?range=${rangeDays}`)
  const data = payload && payload.data

  if (!payload || payload.success !== true || !data || data.rangeDays !== rangeDays) {
    invalid()
  }

  const summary = readSummary(data.summary)

  return {
    summary,
    rangeDays,
    ordersTrend: readTrend(data.ordersTrend, rangeDays),
    purchaseOrdersByStatus: readStatuses(data.purchaseOrdersByStatus, summary),
    recentOrders: readRecentOrders(data.recentOrders),
    recentPurchaseOrders: readRecentPurchaseOrders(data.recentPurchaseOrders),
  }
}
