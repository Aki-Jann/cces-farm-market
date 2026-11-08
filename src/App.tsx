import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
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
import { FarmerApplicationsPage } from './pages/admin/FarmerApplicationsPage'
import { auth } from './firebase/auth'
import { db } from './firebase/firestore'
import { normalizeRole, ROLES } from './constants/roles'
import type { UserRole } from './constants/roles'
export type Route = 'landing' | 'shop' | 'orders' | 'messages' | 'account' | 'admin' | 'admin-orders' | 'admin-payment' | 'admin-products' | 'admin-customers' | 'admin-analytics' | 'admin-account' | 'admin-farmer-applications' | 'login' | 'register' | 'forgot-password'

type ApplicationStatus = 'pending' | 'approved' | 'rejected' | null

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
  'admin-farmer-applications',
]

function canAccessRoute(role: UserRole | null, route: Route, applicationStatus: ApplicationStatus) {
  if (role === ROLES.CUSTOMER) {
    if (applicationStatus === 'pending' || applicationStatus === 'rejected') return route === 'account'
    return ['shop', 'orders', 'messages', 'account'].includes(route)
  }
  if (role === ROLES.FARMER) {
    return ['admin', 'admin-orders', 'admin-payment', 'admin-products', 'admin-customers', 'admin-analytics', 'admin-account'].includes(route)
  }
  return role === ROLES.CCES_ADMIN && ['admin', 'admin-analytics', 'admin-account', 'admin-farmer-applications'].includes(route)
}

function homeForRole(role: UserRole | null, applicationStatus: ApplicationStatus) {
  if (role === ROLES.CUSTOMER) {
    return applicationStatus === 'pending' || applicationStatus === 'rejected' ? '/account' : '/shop'
  }
  if (role === ROLES.CCES_ADMIN) return '/admin'
  return role === ROLES.FARMER ? '/admin' : '/login'
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
  if (path === 'admin/farmer-applications') return 'admin-farmer-applications'
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
  const [applicationStatus, setApplicationStatus] = useState<ApplicationStatus>(null)
  const [authResolved, setAuthResolved] = useState(false)
  const isApplicantRestricted = role === ROLES.CUSTOMER
    && (applicationStatus === 'pending' || applicationStatus === 'rejected')

  useEffect(() => {
    const handleHashChange = () => setRoute(getRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    let isMounted = true
    let requestId = 0
    let unsubscribeApplication: (() => void) | undefined
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const currentRequest = ++requestId
      unsubscribeApplication?.()
      unsubscribeApplication = undefined
      if (!user) {
        if (isMounted) {
          setRole(null)
          setApplicationStatus(null)
          setAuthResolved(true)
        }
        return
      }

      setAuthResolved(false)
      setRole(null)
      setApplicationStatus(null)
      try {
        const profile = await getDoc(doc(db, 'users', user.uid))
        if (!isMounted || currentRequest !== requestId) return
        const storedRole = profile.exists() ? profile.data().role : null
        const normalizedRole = normalizeRole(storedRole)
        if (normalizedRole === ROLES.CUSTOMER) {
          let applicationLoadFailed = false
          await new Promise<void>((resolve) => {
            let isInitialSnapshot = true
            unsubscribeApplication = onSnapshot(
              doc(db, 'farmerApplications', user.uid),
              (application) => {
                if (!isMounted || currentRequest !== requestId) return
                const status = application.exists() ? application.data().status : null
                setApplicationStatus(
                  status === 'pending' || status === 'rejected' || status === 'approved' ? status : null
                )
                if (isInitialSnapshot) {
                  isInitialSnapshot = false
                  resolve()
                }
              },
              (applicationError) => {
                console.error('Loading authenticated user farmer application failed:', applicationError)
                applicationLoadFailed = true
                if (isMounted && currentRequest === requestId) setRole(null)
                if (isInitialSnapshot) {
                  isInitialSnapshot = false
                  resolve()
                }
              }
            )
          })
          if (isMounted && currentRequest === requestId && !applicationLoadFailed) setRole(normalizedRole)
        } else {
          setRole(normalizedRole)
        }
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
      unsubscribeApplication?.()
    }
  }, [])

  useEffect(() => {
    if (!authResolved) return
    if (isApplicantRestricted && route !== 'account') {
      window.location.hash = '/account'
    } else if (protectedRoutes.includes(route) && !canAccessRoute(role, route, applicationStatus)) {
      window.location.hash = homeForRole(role, applicationStatus)
    }
  }, [applicationStatus, authResolved, isApplicantRestricted, role, route])

  if (!authResolved && auth.currentUser) return null
  if (isApplicantRestricted && route !== 'account') return null
  if (protectedRoutes.includes(route) && (!authResolved || !canAccessRoute(role, route, applicationStatus))) {
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
    return <AccountPage applicantOnly={applicationStatus === 'pending' || applicationStatus === 'rejected'} />
  }

  if (route === 'admin-account') {
    return <AdminAccountPage role={role === ROLES.CCES_ADMIN ? ROLES.CCES_ADMIN : ROLES.FARMER} />
  }

  if (route === 'admin') {
    return <AdminDashboard role={role === ROLES.CCES_ADMIN ? ROLES.CCES_ADMIN : ROLES.FARMER} />
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
    return <AdminAnalyticsPage role={role === ROLES.CCES_ADMIN ? ROLES.CCES_ADMIN : ROLES.FARMER} />
  }

  if (route === 'admin-farmer-applications') {
    return <FarmerApplicationsPage />
  }

  return <AuthPage type={route} />
}

export default App
