import '../../styles/product-details-modal.css'

function catalogueProductId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value)
  }

  if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) {
    return value.trim()
  }

  return null
}

export default function CatalogueProductName({ productId, children, onOpen }) {
  const id = catalogueProductId(productId)

  if (!id) {
    return <span className="catalogue-product-name">{children}</span>
  }

  return (
    <button type="button" className="catalogue-product-link" onClick={() => onOpen(id)}>
      {children}
    </button>
  )
}
