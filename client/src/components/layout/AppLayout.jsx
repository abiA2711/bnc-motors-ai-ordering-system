import { Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'

export default function AppLayout() {
  const { user } = useAuth()

  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-main">
        {user && user.role === 'admin' ? <Header /> : <Topbar />}
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
