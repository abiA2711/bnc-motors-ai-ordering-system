export function readExtracted(purchaseOrder) {
  const data = purchaseOrder && purchaseOrder.extracted_data

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null
  }

  return data
}

export function supplierName(purchaseOrder) {
  const data = readExtracted(purchaseOrder)
  const name = data && typeof data.supplier_name === 'string' ? data.supplier_name.trim() : ''
  return name
}

export function extractedLineCount(purchaseOrder) {
  const data = readExtracted(purchaseOrder)

  if (data && Array.isArray(data.items)) {
    return data.items.length
  }

  if (purchaseOrder && Array.isArray(purchaseOrder.items)) {
    return purchaseOrder.items.length
  }

  if (purchaseOrder && Number.isInteger(purchaseOrder.item_count)) {
    return purchaseOrder.item_count
  }

  return null
}

export function readMatches(item) {
  return item && Array.isArray(item.matches) ? item.matches : []
}

export function selectedMatches(item) {
  return readMatches(item).filter((match) => match.is_selected === true && match.match_status === 'accepted')
}

export function isConvertedLine(item) {
  return Boolean(item && item.converted_order_id)
}

export function lineReviewState(item) {
  if (isConvertedLine(item)) {
    return 'converted'
  }

  const matches = readMatches(item)
  const selectedCount = selectedMatches(item).length

  if (selectedCount === 1) {
    return 'accepted'
  }

  if (matches.some((match) => match.match_status === 'suggested')) {
    return 'pending'
  }

  return 'unresolved'
}

export function lineCustomerState(item) {
  const state = lineReviewState(item)

  if (state !== 'unresolved') {
    return state
  }

  return readMatches(item).some((match) => match.match_status === 'rejected') ? 'rejected' : 'pending'
}

export function reviewSummary(items) {
  const lines = Array.isArray(items) ? items : []
  const summary = {
    total: lines.length,
    accepted: 0,
    pending: 0,
    rejected: 0,
    converted: 0,
    unresolved: 0,
    ready: false,
  }

  lines.forEach((item) => {
    const state = lineCustomerState(item)

    if (state === 'converted') {
      summary.converted += 1
      return
    }

    if (state === 'accepted') {
      summary.accepted += 1
      return
    }

    if (state === 'rejected') {
      summary.rejected += 1
      summary.unresolved += 1
      return
    }

    summary.pending += 1
  })

  summary.ready = summary.accepted > 0
  return summary
}

export function formatMatchScore(score) {
  if (score === null || score === undefined || score === '') {
    return 'Not scored'
  }

  const value = Number(score)

  if (!Number.isFinite(value)) {
    return String(score)
  }

  const percent = Math.round(value * 1000) / 10
  return `${percent}%`
}

export function extractionSource(purchaseOrder, extraction) {
  const data = readExtracted(purchaseOrder)
  const provider = extraction && typeof extraction.provider === 'string'
    ? extraction.provider
    : data && typeof data.provider === 'string'
      ? data.provider
      : ''
  const mock = extraction && typeof extraction.mock === 'boolean'
    ? extraction.mock
    : data && typeof data.mock === 'boolean'
      ? data.mock
      : null
  const notice = extraction && typeof extraction.notice === 'string'
    ? extraction.notice
    : data && typeof data.notice === 'string'
      ? data.notice
      : ''

  return {
    provider: provider.trim(),
    mock,
    notice: notice.trim(),
  }
}
