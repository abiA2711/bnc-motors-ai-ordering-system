import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { loadCurrentStock } from '../api/products.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { centsToAmount, moneyToCents } from '../utils/format.js'
import { readReorderLevel, readStockQuantity } from '../utils/stock.js'

const CartContext = createContext(null)

const readStock = readStockQuantity

const readPrice = (product) => {
  const cents = moneyToCents(product.price)
  return cents === null ? null : centsToAmount(cents)
}

const readStoredCart = (storageKey) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]')
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.flatMap((item) => {
      const stock = readStock(item)
      const price = readPrice(item)
      const quantity = Number(item.quantity)

      if (!item || stock === null || price === null || !Number.isInteger(quantity) || quantity < 1) {
        return []
      }

      return [{
        id: String(item.id),
        name: String(item.name || ''),
        sku: String(item.sku || ''),
        category: item.category || null,
        brand: item.brand || null,
        unit: item.unit || null,
        image_url: item.image_url || null,
        currency: item.currency || 'INR',
        price,
        reorder_level: readReorderLevel(item),
        is_active: item.is_active !== false,
        stock_quantity: stock,
        quantity: stock > 0 ? Math.min(quantity, stock) : quantity,
      }]
    })
  } catch {
    return []
  }
}

const snapshot = (product, quantity, stock, price) => {
  return {
    id: String(product.id),
    name: product.name,
    sku: product.sku,
    category: product.category || null,
    brand: product.brand || null,
    unit: product.unit || null,
    image_url: product.image_url || null,
    currency: product.currency || 'INR',
    price,
    reorder_level: readReorderLevel(product),
    is_active: product.is_active !== false,
    stock_quantity: stock,
    quantity,
  }
}

function CartState({ userId, children }) {
  const storageKey = `bnc.cart.${userId}`
  const [items, setItems] = useState(() => readStoredCart(storageKey))

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items))
  }, [items, storageKey])

  const itemCount = items.reduce((total, item) => total + item.quantity, 0)
  const subtotalCents = items.reduce((total, item) => {
    const cents = moneyToCents(item.price)
    return cents === null ? total : total + cents * item.quantity
  }, 0)

  const value = useMemo(() => {
    const addProduct = (product, amount = 1) => {
      const stock = readStock(product)
      const price = readPrice(product)
      const requested = Number.isInteger(amount) && amount > 0 ? amount : 1

      if (stock === null || price === null) {
        return { ok: false, message: 'This product cannot be added to the cart' }
      }

      if (stock < 1) {
        return { ok: false, message: 'This product is out of stock' }
      }

      const existing = items.find((item) => item.id === String(product.id))
      const nextQuantity = Math.min(stock, (existing ? existing.quantity : 0) + requested)
      const nextItem = snapshot(product, nextQuantity, stock, price)

      setItems((current) => {
        const currentItem = current.find((item) => item.id === nextItem.id)
        if (!currentItem) {
          return [...current, nextItem]
        }

        return current.map((item) => (item.id === nextItem.id ? nextItem : item))
      })

      return {
        ok: true,
        quantity: nextQuantity,
        capped: existing
          ? nextQuantity < existing.quantity + requested
          : nextQuantity < requested,
      }
    }

    const setQuantity = (productId, quantity) => {
      setItems((current) => current.flatMap((item) => {
        if (item.id !== String(productId)) {
          return [item]
        }

        if (item.stock_quantity < 1) {
          return [item]
        }

        const requested = typeof quantity === 'function' ? quantity(item.quantity) : quantity
        if (!Number.isInteger(requested)) {
          return [item]
        }

        const nextQuantity = Math.min(item.stock_quantity, Math.max(1, requested))
        return [{ ...item, quantity: nextQuantity }]
      }))
    }

    const refreshStock = async () => {
      if (items.length === 0) {
        return []
      }

      const { products, missing } = await loadCurrentStock(items.map((item) => item.id))
      const missingIds = new Set(missing)
      const notices = []
      const nextItems = items.flatMap((item) => {
        const product = products[item.id]

        if (missingIds.has(item.id) || !product || product.is_active === false) {
          notices.push(`${item.name} is inactive and cannot be ordered.`)
          return [{ ...item, is_active: false }]
        }

        const stock = readStock(product)
        const reorderLevel = readReorderLevel(product)

        if (stock === null) {
          notices.push(`Stock for ${item.name} could not be read.`)
          return [item]
        }

        const cataloguePrice = readPrice(product)
        const current = {
          ...item,
          name: product.name || item.name,
          sku: product.sku || item.sku,
          category: product.category || null,
          brand: product.brand || null,
          unit: product.unit || item.unit || null,
          image_url: product.image_url || null,
          currency: product.currency || item.currency || 'INR',
          price: cataloguePrice === null ? item.price : cataloguePrice,
          stock_quantity: stock,
          reorder_level: reorderLevel,
          is_active: true,
        }

        if (stock < 1) {
          notices.push(`${item.name} is out of stock.`)
          return [current]
        }

        if (item.quantity > stock) {
          const unit = stock === 1 ? 'is' : 'are'
          notices.push(`Only ${stock} ${item.name} ${unit} available. The quantity was reduced to ${stock}.`)
          return [{ ...current, quantity: stock }]
        }

        return [current]
      })

      setItems((current) => {
        const live = new Map(current.map((item) => [item.id, item]))
        return nextItems.flatMap((item) => {
          const existing = live.get(item.id)
          if (!existing) {
            return []
          }

          if (existing.quantity === item.quantity) {
            return [item]
          }

          const stock = Number(item.stock_quantity)
          const quantity = Number.isInteger(stock) && stock > 0 ? Math.min(existing.quantity, stock) : existing.quantity
          return [{ ...item, quantity }]
        })
      })
      return notices
    }

    const removeItem = (productId) => {
      setItems((current) => current.filter((item) => item.id !== String(productId)))
    }

    return {
      items,
      itemCount,
      subtotal: centsToAmount(subtotalCents),
      addProduct,
      setQuantity,
      removeItem,
      refreshStock,
      clearCart: () => setItems([]),
    }
  }, [items, itemCount, subtotalCents])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

const emptyCart = {
  items: [],
  itemCount: 0,
  subtotal: '0.00',
  addProduct: () => ({ ok: false, message: 'Sign in to add products' }),
  setQuantity: () => {},
  removeItem: () => {},
  refreshStock: async () => [],
  clearCart: () => {},
}

export function CartProvider({ children }) {
  const { user } = useAuth()

  if (!user) {
    return <CartContext.Provider value={emptyCart}>{children}</CartContext.Provider>
  }

  return (
    <CartState key={user.id} userId={user.id}>
      {children}
    </CartState>
  )
}

// The hook shares this provider's context. Fast refresh still updates CartProvider.
// eslint-disable-next-line react-refresh/only-export-components
export function useCart() {
  const context = useContext(CartContext)

  if (!context) {
    throw new Error('useCart must be used within CartProvider')
  }

  return context
}
