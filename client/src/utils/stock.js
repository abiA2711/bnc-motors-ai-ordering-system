export function readStockQuantity(product) {
  const stock = Number(product && product.stock_quantity)
  return Number.isInteger(stock) && stock >= 0 ? stock : null
}

export function readReorderLevel(product) {
  const reorder = Number(product && product.reorder_level)
  return Number.isInteger(reorder) && reorder >= 0 ? reorder : 0
}

export function stockStatus(product) {
  const stock = readStockQuantity(product)

  if (stock === null) {
    return 'unknown'
  }

  if (stock === 0) {
    return 'out'
  }

  if (stock <= readReorderLevel(product)) {
    return 'low'
  }

  return 'in'
}

export const stockStatusLabel = {
  in: 'In Stock',
  low: 'Low Stock',
  out: 'Out of Stock',
  unknown: 'Stock unavailable',
}

export function stockProblem(item) {
  if (!item) {
    return ''
  }

  if (item.is_active === false) {
    return `${item.name} is inactive and cannot be ordered.`
  }

  const stock = readStockQuantity(item)

  if (stock === null) {
    return `Stock for ${item.name} could not be read.`
  }

  if (stock < 1) {
    return `${item.name} is out of stock.`
  }

  if (item.quantity > stock) {
    const unit = stock === 1 ? 'is' : 'are'
    return `Only ${stock} ${item.name} ${unit} available.`
  }

  return ''
}
