import { useState } from 'react'
import { productImageSources } from './productImages.js'

export default function ProductImage({ product, className = '' }) {
  const sources = productImageSources(product)
  const sourceKey = sources.join('|')
  const [trackedKey, setTrackedKey] = useState(sourceKey)
  const [index, setIndex] = useState(0)

  if (trackedKey !== sourceKey) {
    setTrackedKey(sourceKey)
    setIndex(0)
  }

  const src = sources[Math.min(index, sources.length - 1)]

  return (
    <img
      className={className}
      src={src}
      alt={product.name || 'Product'}
      onError={() => setIndex((current) => Math.min(current + 1, sources.length - 1))}
    />
  )
}
