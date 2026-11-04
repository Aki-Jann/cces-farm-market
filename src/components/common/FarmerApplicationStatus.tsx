import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import styles from './FarmerApplicationStatus.module.css'

type ApplicationStatus = 'pending' | 'approved' | 'rejected'

export function FarmerApplicationStatus() {
  const [status, setStatus] = useState<ApplicationStatus | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let unsubscribeApplication: (() => void) | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeApplication?.()
      unsubscribeApplication = undefined
      setStatus(null)
      setRejectionReason('')
      setError('')

      if (!user) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      unsubscribeApplication = onSnapshot(
        doc(db, 'farmerApplications', user.uid),
        (snapshot) => {
          setError('')
          if (!snapshot.exists()) {
            setStatus(null)
            setIsLoading(false)
            return
          }

          const data = snapshot.data()
          if (data.status !== 'pending' && data.status !== 'approved' && data.status !== 'rejected') {
            setError('The farmer application has an invalid status. Please contact CCES support.')
            setIsLoading(false)
            return
          }

          setStatus(data.status)
          setRejectionReason(typeof data.rejectionReason === 'string' ? data.rejectionReason : '')
          setIsLoading(false)
        },
        (loadError) => {
          console.error('Loading farmer application status failed:', loadError)
          setError('Unable to load your farmer application status.')
          setIsLoading(false)
        }
      )
    })

    return () => {
      unsubscribeApplication?.()
      unsubscribeAuth()
    }
  }, [])

  if (isLoading) return null

  if (error) {
    return <section className={styles.applicationStatus}><p role="alert">{error}</p></section>
  }
  if (!status) return null

  const descriptions: Record<ApplicationStatus, string> = {
    pending: 'Your application is awaiting CCES review. Your account remains a customer until approval.',
    approved: 'Your farmer application has been approved.',
    rejected: rejectionReason
      ? `Your application was not approved: ${rejectionReason}`
      : 'Your farmer application was not approved.',
  }

  return (
    <section className={styles.applicationStatus} aria-live="polite">
      <div>
        <h3>Farmer application</h3>
        <p>{descriptions[status]}</p>
      </div>
      <span className={`${styles.status} ${styles[status]}`}>{status}</span>
    </section>
  )
}
