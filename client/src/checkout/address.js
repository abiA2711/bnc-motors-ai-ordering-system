import { isValidPhoneNumber } from 'libphonenumber-js'

export const textOf = (value) => (typeof value === 'string' ? value.trim() : '')

export const emptyAddress = {
  full_name: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'India',
}

export const addressFromUser = (user) => ({
  ...emptyAddress,
  full_name: textOf(user && user.name),
  phone: textOf(user && user.phone),
  country: textOf(user && user.country) || 'India',
  state: textOf(user && user.state),
})

export const countryIso = (countries, name) => {
  const match = countries.find((country) => country.name.toLowerCase() === textOf(name).toLowerCase())
  return match ? match.isoCode : ''
}

const phoneMessage = (value, iso) => {
  const text = textOf(value)

  if (!text) {
    return 'Phone number is required'
  }

  const compact = text.replace(/[\s()-]/g, '')

  if (compact.startsWith('+')) {
    return isValidPhoneNumber(compact) ? '' : 'Enter a valid phone number'
  }

  if (iso && isValidPhoneNumber(compact, iso)) {
    return ''
  }

  return 'Enter a valid phone number'
}

const postalMessage = (value, country) => {
  const text = textOf(value)

  if (!text) {
    return 'Postal code is required'
  }

  if (country.toLowerCase() === 'india') {
    return /^[1-9]\d{5}$/.test(text) ? '' : 'Enter a 6-digit postal code'
  }

  return /^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/.test(text) ? '' : 'Enter a valid postal code'
}

export const validateAddress = (fields, iso) => {
  const errors = {}
  const name = textOf(fields.full_name)

  if (!name) {
    errors.full_name = 'Full name is required'
  } else if (name.length > 100) {
    errors.full_name = 'Name must be 100 characters or fewer'
  }

  const phone = phoneMessage(fields.phone, iso)
  if (phone) {
    errors.phone = phone
  }

  if (!textOf(fields.line1)) {
    errors.line1 = 'Address line 1 is required'
  } else if (textOf(fields.line1).length > 200) {
    errors.line1 = 'Address line 1 must be 200 characters or fewer'
  }

  if (textOf(fields.line2).length > 200) {
    errors.line2 = 'Address line 2 must be 200 characters or fewer'
  }

  if (!textOf(fields.city)) {
    errors.city = 'City is required'
  } else if (textOf(fields.city).length > 100) {
    errors.city = 'City must be 100 characters or fewer'
  }

  if (!textOf(fields.state)) {
    errors.state = 'State is required'
  }

  const postal = postalMessage(fields.postal_code, fields.country)
  if (postal) {
    errors.postal_code = postal
  }

  if (!textOf(fields.country)) {
    errors.country = 'Country is required'
  }

  return errors
}

export const toAddress = (fields) => {
  const address = {
    full_name: textOf(fields.full_name),
    phone: textOf(fields.phone),
    line1: textOf(fields.line1),
    city: textOf(fields.city),
    state: textOf(fields.state),
    postal_code: textOf(fields.postal_code),
    country: textOf(fields.country),
  }
  const line2 = textOf(fields.line2)

  if (line2) {
    address.line2 = line2
  }

  return address
}

export const firstField = (errors) => {
  const names = ['full_name', 'phone', 'line1', 'line2', 'city', 'state', 'postal_code', 'country']
  return names.find((name) => errors[name]) || ''
}

export const formatAddressLines = (address) => {
  if (!address) {
    return []
  }

  const cityLine = [textOf(address.city), textOf(address.state)].filter(Boolean).join(', ')
  const locality = [cityLine, textOf(address.postal_code)].filter(Boolean).join(' - ')

  return [
    textOf(address.full_name),
    textOf(address.phone),
    textOf(address.line1),
    textOf(address.line2),
    locality,
    textOf(address.country),
  ].filter(Boolean)
}
