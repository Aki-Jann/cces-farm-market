import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { AuthPage } from './pages/public/AuthPage'
import { LandingPage } from './pages/public/LandingPage'
import { ShopPage } from './pages/customer/ShopPage'
import { OrdersPage } from './pages/customer/OrdersPage'
import { MessagesPage } from './pages/customer/MessagesPage'
import { AccountPage } from './pages/customer/AccountPage'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage'
import { AdminPaymentPage } from './pages/admin/AdminPaymentPage'
import { AdminProductsPage } from './pages/admin/AdminProductsPage'
import { AdminCustomersPage } from './pages/admin/AdminCustomersPage'
import { AdminAnalyticsPage } from './pages/admin/AdminAnalyticsPage'
import { AdminAccountPage } from './pages/admin/AdminAccountPage'
import { auth } from './firebase/auth'
import { db } from './firebase/firestore'
export type Route = 'landing' | 'shop' | 'orders' | 'messages' | 'account' | 'admin' | 'admin-orders' | 'admin-payment' | 'admin-products' | 'admin-customers' | 'admin-analytics' | 'admin-account' | 'login' | 'register' | 'forgot-password'
type UserRole = 'customer' | 'admin' | 'cces_admin'

const protectedRoutes: Route[] = [
  'shop',
  'orders',
  'messages',
  'account',
  'admin',
  'admin-orders',
  'admin-payment',
  'admin-products',
  'admin-customers',
  'admin-analytics',
  'admin-account',
]

function canAccessRoute(role: UserRole | null, route: Route) {
  if (role === 'customer') {
    return ['shop', 'orders', 'messages', 'account'].includes(route)
  }
  if (role === 'admin') {
    return ['admin', 'admin-orders', 'admin-payment', 'admin-products', 'admin-customers', 'admin-analytics', 'admin-account'].includes(route)
  }
  return role === 'cces_admin' && ['admin', 'admin-analytics', 'admin-account'].includes(route)
}

function homeForRole(role: UserRole | null) {
  if (role === 'customer') return '/shop'
  if (role === 'cces_admin') return '/admin/analytics'
  return role === 'admin' ? '/admin' : '/login'
}

function getRoute(): Route {
  const path = window.location.hash.replace(/^#\/?/, '')
  if (path.startsWith('orders')) return 'orders'
  if (path === 'admin/account') return 'admin-account'
  if (path === 'admin/orders' || path === 'admin/orders/archive') return 'admin-orders'
  if (path === 'admin/payment') return 'admin-payment'
  if (path === 'admin/products') return 'admin-products'
  if (path === 'admin/customers') return 'admin-customers'
  if (path === 'admin/analytics') return 'admin-analytics'
  if (path === 'shop') return 'shop'
  if (path === 'messages') return 'messages'
  if (path === 'account') return 'account'
  if (path === 'admin') return 'admin'
  if (path === 'login') return 'login'
  if (path === 'register') return 'register'
  if (path === 'forgot-password') return 'forgot-password'
  return 'landing'
}

function App() {
  const [route, setRoute] = useState<Route>(getRoute)
  const [role, setRole] = useState<UserRole | null>(null)
  const [authResolved, setAuthResolved] = useState(false)

  useEffect(() => {
    const handleHashChange = () => setRoute(getRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    let isMounted = true
    let requestId = 0
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const currentRequest = ++requestId
      if (!user) {
        if (isMounted) {
          setRole(null)
          setAuthResolved(true)
        }
        return
      }

      setAuthResolved(false)
      setRole(null)
      try {
        const profile = await getDoc(doc(db, 'users', user.uid))
        if (!isMounted || currentRequest !== requestId) return
        const storedRole = profile.exists() ? profile.data().role : null
        setRole(storedRole === 'customer' || storedRole === 'admin' || storedRole === 'cces_admin' ? storedRole : null)
      } catch (error) {
        console.error('Loading authenticated user role failed:', error)
        if (isMounted && currentRequest === requestId) setRole(null)
      } finally {
        if (isMounted && currentRequest === requestId) setAuthResolved(true)
      }
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!authResolved || !protectedRoutes.includes(route)) return
    if (!canAccessRoute(role, route)) {
      window.location.hash = homeForRole(role)
    }
  }, [authResolved, role, route])

  if (protectedRoutes.includes(route) && (!authResolved || !canAccessRoute(role, route))) {
    return null
  }

  if (route === 'landing') {
    return <LandingPage />
  }

  if (route === 'shop') {
    return <ShopPage />
  }

  if (route === 'orders') {
    return <OrdersPage />
  }

  if (route === 'messages') {
    return <MessagesPage />
  }

  if (route === 'account') {
    return <AccountPage />
  }

  if (route === 'admin-account') {
    return <AdminAccountPage role={role === 'cces_admin' ? 'cces_admin' : 'farmer'} />
  }

  if (route === 'admin') {
    return <AdminDashboard role={role === 'cces_admin' ? 'cces_admin' : 'farmer'} />
  }

  if (route === 'admin-orders') {
    return <AdminOrdersPage />
  }

  if (route === 'admin-payment') {
    return <AdminPaymentPage />
  }

  if (route === 'admin-products') {
    return <AdminProductsPage />
  }

  if (route === 'admin-customers') {
    return <AdminCustomersPage />
  }

  if (route === 'admin-analytics') {
    return <AdminAnalyticsPage role={role === 'cces_admin' ? 'cces_admin' : 'farmer'} />
  }

  return <AuthPage type={route} />
}

export default App
