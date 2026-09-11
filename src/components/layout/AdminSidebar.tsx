import { BrandLogo } from '../common/BrandLogo'
import styles from './AdminSidebar.module.css'

type AdminNavItem = 'dashboard' | 'orders' | 'products' | 'customers' | 'analytics'

const links: { key: AdminNavItem; label: string; href: string }[] = [
  { key: 'dashboard', label: 'DASHBOARD', href: '#/admin' },
  { key: 'orders', label: 'ORDERS', href: '#/admin/orders' },
  { key: 'products', label: 'PRODUCTS', href: '#/admin/products' },
  { key: 'customers', label: 'CUSTOMERS', href: '#/admin/customers' },
  { key: 'analytics', label: 'ANALYTICS', href: '#/admin/analytics' },
]

export function AdminSidebar({ active }: { active: AdminNavItem }) {
  return (
    <nav className={styles.sidebar} aria-label="Admin navigation">
      <div className={styles.top}>
        <div className={styles.logo}><BrandLogo compact /></div>
        <div className={styles.rule} />
        {links.map((link) => (
          <a className={active === link.key ? styles.active : ''} href={link.href} key={link.key}>
            {link.label}
          </a>
        ))}
      </div>
      <a href="#/" className={styles.logout}>LOGOUT</a>
    </nav>
  )
}
