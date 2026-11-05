import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './ReceiptViewer.module.css'

export function ReceiptViewer({
  url,
  label,
  className,
  ariaLabel,
}: {
  url: string
  label: string
  className?: string
  ariaLabel?: string
}) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  return (
    <>
      <button type="button" className={className ?? styles.receiptButton} aria-label={ariaLabel} onClick={() => setIsOpen(true)}>
        {label}
      </button>
      {isOpen && createPortal(
        <div
          className={styles.receiptOverlay}
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false)
          }}
        >
          <section className={styles.receiptModal} role="dialog" aria-modal="true" aria-label="Payment receipt">
            <div className={styles.receiptModalHeader}>
              <h2>Payment receipt</h2>
              <button type="button" aria-label="Close receipt" onClick={() => setIsOpen(false)}>×</button>
            </div>
            <img src={url} alt="Payment receipt screenshot" />
          </section>
        </div>,
        document.body
      )}
    </>
  )
}
