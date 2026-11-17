import { Link } from 'react-router-dom'
import { formatMoney } from '../../utils/format.js'
import { dashboardStatusLabel } from './dashboardLabels.js'
import { EyeIcon } from './dashboardIcons.jsx'

const customerName = (name) => name || 'Name unavailable'

const conversionClass = (converted, total) => {
  if (converted === 0) {
    return 'is-none'
  }

  if (total > 0 && converted === total) {
    return 'is-complete'
  }

  return 'is-partial'
}

export function RecentOrders({ orders }) {
  return (
    <section className="admin-table-card" aria-label="Recent orders">
      <header>
        <h2>Recent Orders</h2>
        <Link to="/admin/orders">View all</Link>
      </header>
      {orders.length === 0 ? (
        <p className="admin-empty">No orders have been created yet.</p>
      ) : (
        <div className="admin-table-scroll">
          <table>
            <colgroup>
              <col className="admin-col-id" />
              <col className="admin-col-customer" />
              <col className="admin-col-count" />
              <col className="admin-col-money" />
              <col className="admin-col-status" />
              <col className="admin-col-action" />
            </colgroup>
            <thead>
              <tr>
                <th>Order Number</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const name = customerName(order.customerName)

                return (
                  <tr key={order.id}>
                    <td className="is-clip" data-label="Order Number" title={order.orderNumber}>{order.orderNumber}</td>
                    <td className="is-clip" data-label="Customer" title={name}>{name}</td>
                    <td data-label="Items">{order.itemCount}</td>
                    <td data-label="Amount">{formatMoney(order.totalAmount, order.currency)}</td>
                    <td data-label="Status"><span className={`admin-badge-status is-${order.status}`}>{dashboardStatusLabel(order.status)}</span></td>
                    <td className="is-action" data-label="Action">
                      <Link className="admin-view-link" to={`/admin/orders/${order.id}`} aria-label={`View details for ${order.orderNumber}`}>
                        <EyeIcon />
                        View details
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function RecentPurchaseOrders({ purchaseOrders }) {
  return (
    <section className="admin-table-card" aria-label="Recent purchase orders">
      <header>
        <h2>Recent Purchase Orders</h2>
        <Link to="/admin/purchase-orders">View all</Link>
      </header>
      {purchaseOrders.length === 0 ? (
        <p className="admin-empty">No purchase orders have been uploaded yet.</p>
      ) : (
        <div className="admin-table-scroll">
          <table>
            <colgroup>
              <col className="admin-col-id" />
              <col className="admin-col-customer" />
              <col className="admin-col-count" />
              <col className="admin-col-money" />
              <col className="admin-col-status" />
              <col className="admin-col-action" />
            </colgroup>
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Customer</th>
                <th>Total Items</th>
                <th>Converted Items</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((purchaseOrder) => {
                const name = customerName(purchaseOrder.customerName)

                return (
                  <tr key={purchaseOrder.id}>
                    <td className="is-clip" data-label="PO Number" title={purchaseOrder.poNumber}>{purchaseOrder.poNumber}</td>
                    <td className="is-clip" data-label="Customer" title={name}>{name}</td>
                    <td data-label="Total Items">{purchaseOrder.itemCount}</td>
                    <td data-label="Converted Items">
                      <span className={`admin-fraction ${conversionClass(purchaseOrder.convertedItemCount, purchaseOrder.itemCount)}`}>
                        <strong>{purchaseOrder.convertedItemCount}</strong>
                        <span> / {purchaseOrder.itemCount}</span>
                      </span>
                    </td>
                    <td data-label="Status">
                      <span className={`admin-badge-status is-${purchaseOrder.status}`}>{dashboardStatusLabel(purchaseOrder.status)}</span>
                    </td>
                    <td className="is-action" data-label="Action">
                      <Link className="admin-view-link" to={`/admin/purchase-orders/${purchaseOrder.id}`} aria-label={`View details for ${purchaseOrder.poNumber}`}>
                        <EyeIcon />
                        View details
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
