import { useEffect, useState } from 'react'
import { AuthPage } from './components/AuthPage'
import { LandingPage } from './components/LandingPage'
import { ShopPage } from './components/ShopPage'
import { OrdersPage } from './components/OrdersPage'
import { MessagesPage } from './components/MessagesPage'
import { AccountPage } from './components/AccountPage'
import { AdminDashboard } from './components/AdminDashboard'
import { AdminOrdersPage } from './components/AdminOrdersPage'
import { AdminPaymentPage } from './components/AdminPaymentPage'
import { AdminProductsPage } from './components/AdminProductsPage'
import { AdminCustomersPage } from './components/AdminCustomersPage'
import { AdminAnalyticsPage } from './components/AdminAnalyticsPage'

export type Route = 'landing' | 'shop' | 'orders' | 'messages' | 'account' | 'admin' | 'admin-orders' | 'admin-payment' | 'admin-products' | 'admin-customers' | 'admin-analytics' | 'login' | 'register' | 'forgot-password'

function getRoute(): Route {
  const path = window.location.hash.replace(/^#\/?/, '')
  if (path.startsWith('orders')) return 'orders'
  if (path === 'admin/orders') return 'admin-orders'
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

  useEffect(() => {
    const handleHashChange = () => setRoute(getRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

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

  if (route === 'admin') {
    return <AdminDashboard />
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
    return <AdminAnalyticsPage />
  }

  return <AuthPage type={route} />
}

export default App
