import { useEffect, useState } from 'react'
import { AuthPage } from './components/AuthPage'
import { LandingPage } from './components/LandingPage'

export type Route = 'landing' | 'login' | 'register' | 'forgot-password'

function getRoute(): Route {
  const path = window.location.hash.replace(/^#\/?/, '')
  if (path === 'login' || path === 'register' || path === 'forgot-password') {
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

  return <AuthPage type={route} />
}

export default App
