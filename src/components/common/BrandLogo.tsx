import styles from './BrandLogo.module.css'

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.logo} ${compact ? styles.compact : ''}`}>
      <img src="/tiangge-verde.svg" alt="Tiangge Verde" />
    </div>
  )
}
