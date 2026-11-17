export const PAYMENT_METHODS = ['pay_later', 'cod']

export function normalizePaymentMethod(value) {
  return value === 'cod' ? 'cod' : 'pay_later'
}

export function paymentMethodLabel(value) {
  return normalizePaymentMethod(value) === 'cod' ? 'Cash on Delivery' : 'Pay Later'
}

export function paymentMethodTitle(value) {
  return normalizePaymentMethod(value) === 'cod' ? 'Cash on Delivery' : 'Pay Later – Business Terms'
}

export function paymentMethodDetail(value) {
  return normalizePaymentMethod(value) === 'cod'
    ? 'Payment is collected when the order is delivered.'
    : 'Payment is settled separately according to agreed business terms.'
}

export function paymentStatusLabel(value) {
  if (value === 'paid') {
    return 'Paid'
  }

  if (value === 'failed') {
    return 'Failed'
  }

  return 'Pending'
}

export function paymentStatusKey(value) {
  return value === 'paid' || value === 'failed' ? value : 'pending'
}
