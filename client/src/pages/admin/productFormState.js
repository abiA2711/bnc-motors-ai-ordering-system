const MAX_PRICE = 9999999999.99
const MAX_INTEGER = 2147483647

export function emptyProductForm() {
  return {
    name: '',
    sku: '',
    description: '',
    category: '',
    brand: '',
    unit: 'pcs',
    price: '',
    currency: 'INR',
    stock_quantity: '0',
    reorder_level: '0',
    image_url: '',
  }
}

export function productToForm(product) {
  return {
    name: product.name || '',
    sku: product.sku || '',
    description: product.description || '',
    category: product.category || '',
    brand: product.brand || '',
    unit: product.unit || 'pcs',
    price: product.price === undefined || product.price === null ? '' : String(product.price),
    currency: product.currency || 'INR',
    stock_quantity: product.stock_quantity === undefined || product.stock_quantity === null ? '0' : String(product.stock_quantity),
    reorder_level: product.reorder_level === undefined || product.reorder_level === null ? '0' : String(product.reorder_level),
    image_url: product.image_url || '',
  }
}

const moneyError = (value) => {
  if (!value) {
    return 'Price is required'
  }

  if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) > MAX_PRICE) {
    return 'Price must be a nonnegative amount with up to 2 decimal places'
  }

  return ''
}

const wholeNumberError = (value, label) => {
  if (!/^\d+$/.test(value) || Number(value) > MAX_INTEGER) {
    return `${label} must be a nonnegative whole number`
  }

  return ''
}

export function validateProductForm(values, { lockStock = false } = {}) {
  const errors = {}
  const name = values.name.trim()
  const sku = values.sku.trim()
  const description = values.description.trim()
  const category = values.category.trim()
  const brand = values.brand.trim()
  const unit = values.unit.trim()
  const currency = values.currency.trim()
  const imageUrl = values.image_url.trim()
  const priceError = moneyError(values.price.trim())
  const stockError = wholeNumberError(values.stock_quantity.trim(), 'Stock quantity')
  const reorderError = wholeNumberError(values.reorder_level.trim(), 'Reorder level')

  if (!name) {
    errors.name = 'Product name is required'
  } else if (name.length > 150) {
    errors.name = 'Product name must be 150 characters or fewer'
  }

  if (!sku) {
    errors.sku = 'SKU is required'
  } else if (sku.length > 50) {
    errors.sku = 'SKU must be 50 characters or fewer'
  }

  if (description.length > 5000) {
    errors.description = 'Description must be 5000 characters or fewer'
  }

  if (!category) {
    errors.category = 'Category is required'
  } else if (category.length > 100) {
    errors.category = 'Category must be 100 characters or fewer'
  }

  if (brand.length > 100) {
    errors.brand = 'Brand must be 100 characters or fewer'
  }

  if (!unit) {
    errors.unit = 'Unit is required'
  } else if (unit.length > 20) {
    errors.unit = 'Unit must be 20 characters or fewer'
  }

  if (priceError) {
    errors.price = priceError
  }

  if (!/^[A-Za-z]{3}$/.test(currency)) {
    errors.currency = 'Currency must be a 3-letter code'
  }

  if (!lockStock && stockError) {
    errors.stock_quantity = stockError
  }

  if (reorderError) {
    errors.reorder_level = reorderError
  }

  if (imageUrl.length > 2048) {
    errors.image_url = 'Image URL must be 2048 characters or fewer'
  }

  return errors
}

export function productFormPayload(values, { includeStock = true } = {}) {
  const payload = {
    name: values.name.trim(),
    sku: values.sku.trim(),
    description: values.description.trim(),
    category: values.category.trim(),
    brand: values.brand.trim(),
    unit: values.unit.trim(),
    price: values.price.trim(),
    currency: values.currency.trim().toUpperCase(),
    reorder_level: Number(values.reorder_level.trim()),
    image_url: values.image_url.trim(),
  }

  if (includeStock) {
    payload.stock_quantity = Number(values.stock_quantity.trim())
  }

  return payload
}

