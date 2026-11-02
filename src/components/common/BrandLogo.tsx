import styles from './BrandLogo.module.css'

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.logo} ${compact ? styles.compact : ''}`}>
      <span>TIANGGE VERDE</span>
    </div>
  )
}
