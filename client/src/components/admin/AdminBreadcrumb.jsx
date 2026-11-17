import { Link, useLocation } from 'react-router-dom'
import { ChevronIcon } from './adminIcons.jsx'

const productDetails = /^\/admin\/products\/[^/]+$/
const productEdit = /^\/admin\/products\/[^/]+\/edit$/
const orderDetails = /^\/admin\/orders\/[^/]+$/
const purchaseOrderDetails = /^\/admin\/purchase-orders\/[^/]+$/

function pageCrumbs(pathname) {
  if (pathname === '/admin') {
    return [{ label: 'Dashboard' }]
  }

  if (pathname === '/admin/products') {
    return [{ label: 'Products' }]
  }

  if (pathname === '/admin/products/new') {
    return [
      { label: 'Products', to: '/admin/products' },
      { label: 'New product' },
    ]
  }

  if (productEdit.test(pathname)) {
    return [
      { label: 'Products', to: '/admin/products' },
      { label: 'Edit Product' },
    ]
  }

  if (productDetails.test(pathname)) {
    return [
      { label: 'Products', to: '/admin/products' },
      { label: 'Product Details' },
    ]
  }

  if (pathname === '/admin/inventory') {
    return [{ label: 'Inventory' }]
  }

  if (pathname === '/admin/orders') {
    return [{ label: 'Orders' }]
  }

  if (orderDetails.test(pathname)) {
    return [
      { label: 'Orders', to: '/admin/orders' },
      { label: 'Order details' },
    ]
  }

  if (pathname === '/admin/purchase-orders') {
    return [{ label: 'Purchase Orders' }]
  }

  if (purchaseOrderDetails.test(pathname)) {
    return [
      { label: 'Purchase Orders', to: '/admin/purchase-orders' },
      { label: 'Purchase order' },
    ]
  }

  return [{ label: 'Admin' }]
}

export default function AdminBreadcrumb() {
  const { pathname } = useLocation()
  const crumbs = [{ label: 'Admin', to: '/admin' }, ...pageCrumbs(pathname)]

  return (
    <nav className="admin-breadcrumb" aria-label="Breadcrumb">
      <ol>
        {crumbs.map((crumb, index) => {
          const current = index === crumbs.length - 1

          return (
            <li key={`${crumb.label}-${index}`}>
              {index > 0 ? <ChevronIcon /> : null}
              {current || !crumb.to ? (
                <span aria-current={current ? 'page' : undefined}>{crumb.label}</span>
              ) : (
                <Link to={crumb.to}>{crumb.label}</Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
