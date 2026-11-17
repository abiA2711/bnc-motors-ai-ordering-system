import { emptyAddress, textOf } from './address.js'
import { normalizePaymentMethod } from '../orders/payment.js'

const DRAFT_KEY = 'bnc.checkout.draft'
const CONFIRMED_KEY = 'bnc.checkout.confirmed'

const addressOf = (value) => ({
  ...emptyAddress,
  ...(value && typeof value === 'object' ? value : {}),
})

export function readDraft() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null')

    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    return {
      shipping: addressOf(parsed.shipping),
      billing: addressOf(parsed.billing),
      sameBilling: parsed.sameBilling !== false,
      notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 500) : '',
      paymentMethod: normalizePaymentMethod(parsed.paymentMethod),
    }
  } catch {
    return null
  }
}

export function writeDraft(draft) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
    shipping: addressOf(draft.shipping),
    billing: addressOf(draft.billing),
    sameBilling: draft.sameBilling !== false,
    notes: textOf(draft.notes).slice(0, 500),
    paymentMethod: normalizePaymentMethod(draft.paymentMethod),
  }))
}

export function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY)
}

const requiredAddress = (address) => ['full_name', 'phone', 'line1', 'city', 'state', 'postal_code', 'country']
  .every((key) => textOf(address[key]))

export function draftIsReady(draft) {
  if (!draft || !requiredAddress(draft.shipping)) {
    return false
  }

  return draft.sameBilling || requiredAddress(draft.billing)
}

export function rememberConfirmation(orderId) {
  sessionStorage.setItem(CONFIRMED_KEY, String(orderId))
}

export function confirmationFor(orderId) {
  return sessionStorage.getItem(CONFIRMED_KEY) === String(orderId)
}

export function clearConfirmation() {
  sessionStorage.removeItem(CONFIRMED_KEY)
}
