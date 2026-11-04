import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import styles from './FarmerApplicationStatus.module.css'

type ApplicationStatus = 'pending' | 'approved' | 'rejected'

export function FarmerApplicationStatus() {
  const [status, setStatus] = useState<ApplicationStatus | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [farmName, setFarmName] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [address, setAddress] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState('')

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
          setFarmName(typeof data.farmName === 'string' ? data.farmName : '')
          setContactNumber(typeof data.contactNumber === 'string' ? data.contactNumber : '')
          setAddress(typeof data.address === 'string' ? data.address : '')
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

  async function reapply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const user = auth.currentUser
    if (!user || status !== 'rejected') return
    const nextFarmName = farmName.trim()
    const nextContactNumber = contactNumber.trim()
    const nextAddress = address.trim()
    if (!nextFarmName || !nextContactNumber || !nextAddress) {
      setError('Enter your farm name, contact number, and address before re-applying.')
      return
    }

    setIsSubmitting(true)
    setError('')
    setNotice('')
    try {
      await updateDoc(doc(db, 'farmerApplications', user.uid), {
        status: 'pending',
        farmName: nextFarmName,
        contactNumber: nextContactNumber,
        address: nextAddress,
        createdAt: serverTimestamp(),
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: '',
      })
      setNotice('Your updated application has been submitted for CCES review.')
    } catch (submitError) {
      console.error('Re-applying as a farmer failed:', submitError)
      setError('Unable to re-submit your application. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

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
        {status === 'rejected' && (
          <form className={styles.reapplyForm} onSubmit={(event) => void reapply(event)}>
            <label>Farm name<input required maxLength={200} value={farmName} onChange={(event) => setFarmName(event.target.value)} /></label>
            <label>Contact number<input required maxLength={40} value={contactNumber} onChange={(event) => setContactNumber(event.target.value)} /></label>
            <label>Farm address<textarea required maxLength={1000} value={address} onChange={(event) => setAddress(event.target.value)} /></label>
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'SUBMITTING...' : 'RE-APPLY AS A FARMER'}</button>
            {error && <p role="alert">{error}</p>}
            {notice && <p role="status">{notice}</p>}
          </form>
        )}
      </div>
      <span className={`${styles.status} ${styles[status]}`}>{status}</span>
    </section>
  )
}
