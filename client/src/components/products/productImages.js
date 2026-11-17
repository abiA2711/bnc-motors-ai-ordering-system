import airFilter from '../../assets/images/products/air-filter.jpg'
import alternator from '../../assets/images/products/alternator.jpg'
import brakePads from '../../assets/images/products/brake-pads.jpg'
import clutchKit from '../../assets/images/products/clutch-kit.jpg'
import headlamp from '../../assets/images/products/headlamp.jpg'
import oilFilter from '../../assets/images/products/oil-filter.jpg'
import fallback from '../../assets/images/products/parts-fallback.jpg'
import radiator from '../../assets/images/products/radiator.jpg'
import shockAbsorber from '../../assets/images/products/shock-absorber.jpg'
import sparkPlug from '../../assets/images/products/spark-plug.jpg'
import timingBelt from '../../assets/images/products/timing-belt.jpg'

const bySku = {
  'BNC-AF-310': airFilter,
  'BNC-ALT-90A': alternator,
  'BNC-ALT-90axz': brakePads,
  'BNC-BP-FR-01': brakePads,
  'BNC-CK-240': clutchKit,
  'BNC-HL-LH-01': headlamp,
  'BNC-OF-220': oilFilter,
  'BNC-RAD-AL16': radiator,
  'BNC-SH-RR-01': shockAbsorber,
  'BNC-SP-IR4': sparkPlug,
  'BNC-TB-118': timingBelt,
}

const byName = [
  [/air\s*filters?/i, airFilter],
  [/alternators?/i, alternator],
  [/brake\s*pads?/i, brakePads],
  [/clutch(es)?/i, clutchKit],
  [/head\s?lamps?|headlights?/i, headlamp],
  [/oil\s*filters?/i, oilFilter],
  [/radiators?/i, radiator],
  [/shock\s*absorbers?/i, shockAbsorber],
  [/spark\s*plugs?/i, sparkPlug],
  [/timing\s*belts?/i, timingBelt],
]

const localImage = (product) => {
  const name = typeof product?.name === 'string' ? product.name : ''
  const named = byName.find(([pattern]) => pattern.test(name))

  if (named) {
    return named[1]
  }

  const sku = typeof product?.sku === 'string' ? product.sku.trim() : ''
  return bySku[sku] || null
}

export const productFallbackImage = fallback

export function productImageSources(product) {
  const sources = []
  const remote = typeof product?.image_url === 'string' ? product.image_url.trim() : ''

  if (remote) {
    sources.push(remote)
  }

  const local = localImage(product)

  if (local && local !== remote) {
    sources.push(local)
  }

  if (!sources.includes(fallback)) {
    sources.push(fallback)
  }

  return sources
}
