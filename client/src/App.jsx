import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext.jsx'
import { CartProvider } from './cart/CartContext.jsx'
import AdminLayout from './components/admin/AdminLayout.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import { ToastProvider } from './components/ui/ToastProvider.jsx'
import Login from './pages/Login.jsx'
import MyOrders from './pages/MyOrders.jsx'
import NotFound from './pages/NotFound.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Cart from './pages/Cart.jsx'
import Checkout from './pages/Checkout.jsx'
import ReviewOrder from './pages/ReviewOrder.jsx'
import OrderDetail from './pages/OrderDetail.jsx'
import ProductDetail from './pages/ProductDetail.jsx'
import Products from './pages/Products.jsx'
import Register from './pages/Register.jsx'
import PurchaseOrderDetail from './pages/PurchaseOrderDetail.jsx'
import PurchaseOrders from './pages/PurchaseOrders.jsx'
import UploadPurchaseOrder from './pages/UploadPurchaseOrder.jsx'
import ConfirmPurchaseOrder from './pages/ConfirmPurchaseOrder.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import AdminPurchaseOrderDetail from './pages/admin/AdminPurchaseOrderDetail.jsx'
import AdminPurchaseOrders from './pages/admin/AdminPurchaseOrders.jsx'
import AdminOrderDetail from './pages/admin/AdminOrderDetail.jsx'
import AdminOrders from './pages/admin/AdminOrders.jsx'
import AdminProductDetail from './pages/admin/AdminProductDetail.jsx'
import AdminProductEditor from './pages/admin/AdminProductEditor.jsx'
import AdminInventory from './pages/admin/AdminInventory.jsx'
import AdminProducts from './pages/admin/AdminProducts.jsx'
import ProtectedRoute from './routes/ProtectedRoute.jsx'
import RoleRoute from './routes/RoleRoute.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
      <AuthProvider>
        <CartProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<RoleRoute allow="customer" />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/products" element={<Products />} />
                <Route path="/products/:id" element={<ProductDetail />} />
                <Route path="/orders" element={<MyOrders />} />
                <Route path="/orders/:id" element={<OrderDetail />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/checkout/review" element={<ReviewOrder />} />
                <Route path="/purchase-orders" element={<PurchaseOrders />} />
                <Route path="/purchase-orders/upload" element={<UploadPurchaseOrder />} />
                <Route path="/purchase-orders/:id/confirm" element={<ConfirmPurchaseOrder />} />
                <Route path="/purchase-orders/:id" element={<PurchaseOrderDetail />} />
              </Route>
            </Route>
            <Route element={<RoleRoute allow="admin" />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/products" element={<AdminProducts />} />
                <Route path="/admin/products/new" element={<AdminProductEditor />} />
                <Route path="/admin/products/:id/edit" element={<AdminProductEditor />} />
                <Route path="/admin/products/:id" element={<AdminProductDetail />} />
                <Route path="/admin/inventory" element={<AdminInventory />} />
                <Route path="/admin/orders" element={<AdminOrders />} />
                <Route path="/admin/orders/:id" element={<AdminOrderDetail />} />
                <Route path="/admin/purchase-orders" element={<AdminPurchaseOrders />} />
                <Route path="/admin/purchase-orders/:id" element={<AdminPurchaseOrderDetail />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </CartProvider>
      </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
