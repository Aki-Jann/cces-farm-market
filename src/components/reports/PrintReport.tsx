import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './PrintReport.module.css'

export function PrintReport({
  title,
  scope,
  children,
  buttonClassName,
}: {
  title: string
  scope: string
  children: ReactNode
  buttonClassName?: string
}) {
  const [printedAt, setPrintedAt] = useState<Date | null>(null)
  const previousTitle = useRef('')
  const titleRef = useRef(title)
  titleRef.current = title

  useEffect(() => {
    if (!printedAt) return
    const cleanup = () => {
      document.body.removeAttribute('data-printing-report')
      document.title = previousTitle.current
    }

    previousTitle.current = document.title
    document.title = titleRef.current
    document.body.setAttribute('data-printing-report', 'true')
    window.addEventListener('afterprint', cleanup, { once: true })
    const frame = window.requestAnimationFrame(() => window.print())
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('afterprint', cleanup)
      cleanup()
    }
  }, [printedAt])

  return (
    <>
      <button
        className={buttonClassName ?? styles.printButton}
        onClick={() => setPrintedAt(new Date())}
        type="button"
      >
        PRINT / SAVE AS PDF
      </button>
      {createPortal(
        <div className={styles.reportRoot} data-print-report="true">
          <header className={styles.reportHeader}>
            <h1>{title}</h1>
            <p>Filter: {scope}</p>
            <p>Printed {printedAt?.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
          </header>
          {children}
        </div>,
        document.body,
      )}
    </>
  )
}
