import { Link } from 'react-router-dom'
import { formatDate, formatMoney, formatStatus } from '../../utils/format.js'

export default function OrderList({ orders }) {
  return (
    <ul className="order-list">
      {orders.map((order) => {
        const lineCount = Array.isArray(order.items) ? order.items.length : null

        return (
          <li key={order.id}>
            <div>
              <strong><Link to={`/orders/${order.id}`}>{order.order_number}</Link></strong>
              <small>{formatDate(order.created_at)}</small>
            </div>
            <span className="status-pill">{formatStatus(order.status)}</span>
            <div className="order-total">
              <strong>{formatMoney(order.total_amount, 'INR')}</strong>
              {lineCount !== null ? <small>{lineCount} {lineCount === 1 ? 'line' : 'lines'}</small> : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
