import { Link } from 'react-router-dom'
import { useCart } from '../../cart/CartContext.jsx'
import { useToast } from '../ui/ToastProvider.jsx'
import { formatMoney } from '../../utils/format.js'
import { readStockQuantity, stockProblem } from '../../utils/stock.js'
import { CartIcon } from '../auth/icons.jsx'
import ProductImage from './ProductImage.jsx'
import StockBadge from './StockBadge.jsx'

export default function ProductCard({ product, layout = 'grid' }) {
  const { addProduct } = useCart()
  const toast = useToast()
  const stock = readStockQuantity(product)
  const inactive = product.is_active === false
  const inStock = !inactive && stock !== null && stock > 0

  const add = () => {
    const key = `cart-add:${product.id}`
    const problem = stockProblem({ ...product, quantity: 1 })

    if (problem) {
      toast.error(problem, key)
      return
    }

    const result = addProduct(product, 1)

    if (result.ok) {
      toast.success(
        result.capped
          ? `Only ${stock} available. The cart now has ${result.quantity}.`
          : `${product.name} added to cart`,
        key,
      )
      return
    }

    toast.error(result.message, key)
  }

  return (
    <article className={`catalogue-card is-${layout}`}>
      <Link className="catalogue-media" to={`/products/${product.id}`} aria-label={product.name}>
        <ProductImage product={product} />
      </Link>
      <div className="catalogue-body">
        <h2><Link to={`/products/${product.id}`}>{product.name}</Link></h2>
        <p className="catalogue-sku">SKU: {product.sku}</p>
        <div className="catalogue-meta">
          <strong>{formatMoney(product.price, product.currency || 'INR')}</strong>
          <div className="catalogue-stock">
            <StockBadge product={product} />
            {stock !== null ? <span className="catalogue-qty">{stock.toLocaleString('en-IN')} in stock</span> : null}
          </div>
        </div>
        <button type="button" className="catalogue-cart" onClick={add} disabled={!inStock}>
          <CartIcon />
          {inStock ? 'Add to Cart' : inactive ? 'Unavailable' : 'Out of Stock'}
        </button>
      </div>
    </article>
  )
}
