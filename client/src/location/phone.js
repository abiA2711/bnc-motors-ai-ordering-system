import { isValidPhoneNumber } from 'libphonenumber-js'

export function internationalPhone(country, nationalNumber) {
  return `${country.phoneCode}${nationalNumber}`
}

export function phoneError(nationalNumber, country) {
  if (!country) {
    return 'Select a country before entering a mobile number'
  }

  if (!nationalNumber) {
    return 'Mobile number is required'
  }

  if (!/^\d+$/.test(nationalNumber)) {
    return 'Enter the mobile number using digits only'
  }

  const phone = internationalPhone(country, nationalNumber)

  if (phone.length > 20) {
    return 'Mobile number is too long'
  }

  if (!isValidPhoneNumber(nationalNumber, country.isoCode)) {
    return 'Enter a valid mobile number for the selected country'
  }

  return ''
}
