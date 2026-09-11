import styles from './BrandLogo.module.css'

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.logo} ${compact ? styles.compact : ''}`}>
      <span>GreenMarket</span>
      <small>CENTER FOR COMMUNITY EXTENSION SERVICES</small>
    </div>
  )
}
