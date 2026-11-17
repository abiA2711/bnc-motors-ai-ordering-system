import { stockStatus, stockStatusLabel } from '../../utils/stock.js'

export default function StockBadge({ product }) {
  const status = stockStatus(product)

  return <span className={`status-pill stock-${status}`}>{stockStatusLabel[status]}</span>
}
