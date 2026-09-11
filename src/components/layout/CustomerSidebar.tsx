import { BrandLogo } from '../common/BrandLogo'
import styles from './CustomerSidebar.module.css'

export type CustomerNavItem = 'shop' | 'orders' | 'messages' | 'account'

const links: { key: CustomerNavItem; label: string; href: string }[] = [
  { key: 'shop', label: 'SHOP', href: '#/shop' },
  { key: 'orders', label: 'ORDERS', href: '#/orders' },
  { key: 'messages', label: 'MESSAGE', href: '#/messages' },
]

export function CustomerSidebar({ active }: { active: CustomerNavItem }) {
  return (
    <nav className={styles.sidebar} aria-label="Customer navigation">
      <div className={styles.top}>
        <BrandLogo compact />
        <div className={styles.rule} />
        {links.map((link) => (
          <a className={active === link.key ? styles.active : ''} href={link.href} key={link.key}>
            {link.label}
          </a>
        ))}
      </div>
      <a className={active === 'account' ? styles.active : ''} href="#/account">MY ACCOUNT</a>
    </nav>
  )
}
