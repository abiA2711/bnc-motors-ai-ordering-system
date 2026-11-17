import { Link } from 'react-router-dom'
import { formatDate, formatStatus } from '../../utils/format.js'
import { supplierName } from './fields.js'

export default function PurchaseOrderList({ purchaseOrders }) {
  return (
    <ul className="po-list">
      {purchaseOrders.map((purchaseOrder) => {
        const supplier = supplierName(purchaseOrder)

        return (
          <li key={purchaseOrder.id}>
            <div>
              <strong>{purchaseOrder.po_number}</strong>
              <small>{purchaseOrder.file_name}</small>
            </div>
            <div>
              <small>Supplier</small>
              <span>{supplier || 'Not available'}</span>
            </div>
            <div>
              <small>Uploaded</small>
              <span>{formatDate(purchaseOrder.created_at)}</span>
            </div>
            <span className="status-pill">{formatStatus(purchaseOrder.status)}</span>
            <div>
              <small>Converted order</small>
              {purchaseOrder.converted_order_id ? (
                <Link to={`/orders/${purchaseOrder.converted_order_id}`}>View order</Link>
              ) : (
                <span>Not converted</span>
              )}
            </div>
            <Link to={`/purchase-orders/${purchaseOrder.id}`}>View details</Link>
          </li>
        )
      })}
    </ul>
  )
}
