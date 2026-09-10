import { useEffect, useState } from 'react'
import { AuthPage } from './components/AuthPage'
import { LandingPage } from './components/LandingPage'
import { ShopPage } from './components/ShopPage'

export type Route = 'landing' | 'shop' | 'login' | 'register' | 'forgot-password'

function getRoute(): Route {
  const path = window.location.hash.replace(/^#\/?/, '')
  if (path === 'shop' || path === 'login' || path === 'register' || path === 'forgot-password') {
    return path
  }
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

  return <AuthPage type={route} />
}

export default App
