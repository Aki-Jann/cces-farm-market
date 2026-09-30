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
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-search" viewBox="0 0 16 16">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/>
          </svg>
          <input value={search} onChange={onSearchChange} placeholder="Search" />
        </label>
      )}
      {actions && <nav className={styles.actions}>{actions}</nav>}
      {logo && <div className={styles.logoSlot}>{logo}</div>}
      {secondary}
    </header>
  )
}
