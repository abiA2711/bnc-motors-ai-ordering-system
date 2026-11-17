import { getCountries, getCountryByCode } from 'world-country-state-district/src/core/country.js'

const subdivisionFiles = import.meta.glob(
  '../../node_modules/world-country-state-district/src/data/??.json',
  { import: 'default' },
)

const cache = new Map()

const fileFor = (countryCode) => {
  const code = countryCode.toUpperCase()
  return Object.keys(subdivisionFiles).find((key) => key.endsWith(`/${code}.json`)) || ''
}

const loadCountryData = async (countryCode) => {
  if (!countryCode || typeof countryCode !== 'string') {
    return null
  }

  const code = countryCode.toUpperCase().trim()

  if (cache.has(code)) {
    return cache.get(code)
  }

  const key = fileFor(code)

  if (!key) {
    cache.set(code, null)
    return null
  }

  try {
    const data = await subdivisionFiles[key]()
    cache.set(code, data && typeof data === 'object' ? data : null)
    return cache.get(code)
  } catch (error) {
    cache.set(code, null)
    throw error
  }
}

export { getCountries, getCountryByCode }

export function searchCountries(query) {
  if (!query || typeof query !== 'string') {
    return []
  }

  const term = query.toLowerCase().trim()

  if (!term) {
    return []
  }

  return getCountries().filter((country) => (
    country.name.toLowerCase().includes(term)
    || country.isoCode.toLowerCase() === term
    || country.iso3Code.toLowerCase() === term
    || (country.officialName && country.officialName.toLowerCase().includes(term))
    || (country.phoneCode && country.phoneCode.includes(term))
  ))
}

export async function getSubdivisions(countryCode) {
  const data = await loadCountryData(countryCode)

  if (!data || !Array.isArray(data.subdivisions)) {
    return []
  }

  return data.subdivisions
}

export async function getSubdivisionChildren(countryCode, subdivisionName) {
  if (!subdivisionName) {
    return []
  }

  const subdivisions = await getSubdivisions(countryCode)
  const query = subdivisionName.toLowerCase().trim()
  const found = subdivisions.find((item) => item.name.toLowerCase() === query)

  if (!found || !Array.isArray(found.children)) {
    return []
  }

  return found.children
}

export async function getAdminLevels(countryCode) {
  const data = await loadCountryData(countryCode)

  if (!data || !Array.isArray(data.adminLevels)) {
    return []
  }

  return data.adminLevels
}
