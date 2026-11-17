import { lineCustomerState, readMatches } from '../components/purchase-orders/fields.js'

export const PO_STATUS_LABELS = {
  uploaded: 'Uploaded',
  processing: 'Processing',
  review_required: 'Review Required',
  partially_converted: 'Partially Converted',
  confirmed: 'Confirmed',
  failed: 'Failed',
}

export const LINE_STATE_LABELS = {
  accepted: 'Accepted',
  rejected: 'Rejected',
  pending: 'Pending',
  converted: 'Converted',
}

const readCount = (value) => {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

export function purchaseOrderStatusLabel(status) {
  if (PO_STATUS_LABELS[status]) {
    return PO_STATUS_LABELS[status]
  }

  if (typeof status !== 'string' || !status.trim()) {
    return 'Unknown'
  }

  const text = status.trim().replaceAll('_', ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function primaryMatch(item) {
  const matches = readMatches(item)
  const selected = matches.find((match) => match.is_selected === true && match.match_status === 'accepted')
  return selected || matches[0] || null
}

export function matchScoreLabel(score) {
  const value = Number(score)

  if (!Number.isFinite(value)) {
    return ''
  }

  const percent = Math.round(value * 1000) / 10
  return `${percent}%`
}

const percentFrom = (converted, accepted, convertedQuantity, acceptedQuantity) => {
  const quantities = convertedQuantity + acceptedQuantity
  const numerator = quantities > 0 ? convertedQuantity : converted
  const denominator = quantities > 0 ? quantities : converted + accepted
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100)
}

export function progressFromCounts(row) {
  const converted = readCount(row && row.converted_count)
  const accepted = readCount(row && row.accepted_count)
  const rejected = readCount(row && row.rejected_count)
  const pending = readCount(row && row.pending_count)
  const total = readCount(row && row.item_count)
  const convertedQuantity = readCount(row && row.converted_quantity)
  const acceptedQuantity = readCount(row && row.accepted_quantity)

  if (converted === null || accepted === null || rejected === null || pending === null || total === null) {
    return null
  }

  return {
    total,
    accepted: accepted + converted,
    remaining: accepted,
    rejected,
    pending,
    converted,
    percent: percentFrom(converted, accepted, convertedQuantity || 0, acceptedQuantity || 0),
  }
}

export function progressFromItems(items) {
  const lines = Array.isArray(items) ? items : []
  const summary = {
    total: lines.length,
    acceptedOpen: 0,
    rejected: 0,
    pending: 0,
    converted: 0,
    convertedQuantity: 0,
    acceptedQuantity: 0,
  }

  lines.forEach((item) => {
    const state = lineCustomerState(item)
    const quantity = readCount(item.quantity) || 0

    if (state === 'converted') {
      summary.converted += 1
      summary.convertedQuantity += readCount(item.converted_quantity) || 0
      return
    }

    if (state === 'accepted') {
      summary.acceptedOpen += 1
      summary.acceptedQuantity += quantity
      return
    }

    if (state === 'rejected') {
      summary.rejected += 1
      return
    }

    summary.pending += 1
  })

  return {
    total: summary.total,
    accepted: summary.acceptedOpen + summary.converted,
    remaining: summary.acceptedOpen,
    rejected: summary.rejected,
    pending: summary.pending,
    converted: summary.converted,
    percent: percentFrom(summary.converted, summary.acceptedOpen, summary.convertedQuantity, summary.acceptedQuantity),
  }
}
