import type { ChangeEvent, ReactNode } from 'react'
import styles from './Header.module.css'

type HeaderProps = {
  title?: string
  search?: string
  onSearchChange?: (event: ChangeEvent<HTMLInputElement>) => void
  actions?: ReactNode
  secondary?: ReactNode
  logo?: ReactNode
  className?: string
}

export function Header({ title, search, onSearchChange, actions, secondary, logo, className = '' }: HeaderProps) {
  const hasSearch = search !== undefined && onSearchChange !== undefined

  return (
    <header className={`${styles.header} ${secondary ? styles.stacked : ''} ${className}`.trim()}>
      {title && <h1>{title}</h1>}
      {hasSearch && (
        <label className={styles.search}>
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={onSearchChange} placeholder="Search" />
        </label>
      )}
      {actions && <nav className={styles.actions}>{actions}</nav>}
      {logo && <div className={styles.logoSlot}>{logo}</div>}
      {secondary}
    </header>
  )
}
