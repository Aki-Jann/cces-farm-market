import { BrandLogo } from '../common/BrandLogo'
import { ROLES } from '../../constants/roles'
import type { ManagementRole } from '../../constants/roles'
import styles from './AdminSidebar.module.css'

type AdminNavItem = 'dashboard' | 'orders' | 'payments' | 'products' | 'customers' | 'analytics' | 'applications' | 'account'

const links: { key: AdminNavItem; label: string; href: string }[] = [
  { key: 'dashboard', label: 'DASHBOARD', href: '#/admin' },
  { key: 'orders', label: 'ORDERS', href: '#/admin/orders' },
  { key: 'payments', label: 'PAYMENTS', href: '#/admin/payment' },
  { key: 'products', label: 'PRODUCTS', href: '#/admin/products' },
  { key: 'customers', label: 'MESSAGES', href: '#/admin/customers' },
  { key: 'analytics', label: 'ANALYTICS', href: '#/admin/analytics' },
  { key: 'applications', label: 'FARMER APPLICATIONS', href: '#/admin/farmer-applications' },
]

export function AdminSidebar({ active, role = ROLES.FARMER }: { active: AdminNavItem; role?: ManagementRole }) {
  const visibleLinks = role === ROLES.CCES_ADMIN
    ? links.filter((link) => link.key === 'dashboard' || link.key === 'analytics' || link.key === 'applications')
    : links.filter((link) => link.key !== 'applications')

  return (
    <nav className={styles.sidebar} aria-label="Management navigation">
      <div className={styles.top}>
        <div className={styles.logo}><BrandLogo compact /></div>
        <div className={styles.rule} />
        {visibleLinks.map((link) => (
          <a className={active === link.key ? styles.active : ''} href={link.href} key={link.key}>
            {link.label}
          </a>
        ))}
      </div>
      <a className={active === 'account' ? styles.active : ''} href="#/admin/account">
        MY ACCOUNT
      </a>
    </nav>
  )
}
