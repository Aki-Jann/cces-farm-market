import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import { ROLES } from '../../constants/roles'
import styles from './FarmerApplicationsPage.module.css'

type ApplicationStatus = 'pending' | 'approved' | 'rejected'
type ProfileStatus = 'active' | 'suspended'
type StatusFilter = 'all' | ApplicationStatus

type FarmerApplication = {
  id: string
  status: ApplicationStatus
  farmName: string
  contactNumber: string
  address: string
  createdAt: unknown
  reviewedAt: unknown
  rejectionReason: string
}

function timestampDate(value: unknown) {
  if (value && typeof value === 'object') {
    if ('toDate' in value && typeof value.toDate === 'function') {
      const date = value.toDate()
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
    }
    if ('seconds' in value && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000)
    }
  }
  return null
}

function applicationDate(value: unknown) {
  const date = timestampDate(value)
  return date
    ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Date unavailable'
}

export function FarmerApplicationsPage() {
  const [applications, setApplications] = useState<FarmerApplication[]>([])
  const [profileStatuses, setProfileStatuses] = useState<Record<string, ProfileStatus>>({})
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({})
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [isLoading, setIsLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let unsubscribeApplications: (() => void) | undefined
    let unsubscribeProfiles: (() => void) | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeApplications?.()
      unsubscribeProfiles?.()
      unsubscribeApplications = undefined
      unsubscribeProfiles = undefined

      if (!user) {
        setApplications([])
        setError('Please log in as a CCES admin to review farmer applications.')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError('')
      unsubscribeApplications = onSnapshot(
        collection(db, 'farmerApplications'),
        (snapshot) => {
          setApplications(snapshot.docs.flatMap((application) => {
            const data = application.data()
            if (data.status !== 'pending' && data.status !== 'approved' && data.status !== 'rejected') return []
            return [{
              id: application.id,
              status: data.status,
              farmName: typeof data.farmName === 'string' ? data.farmName : 'Unnamed farm',
              contactNumber: typeof data.contactNumber === 'string' ? data.contactNumber : '',
              address: typeof data.address === 'string' ? data.address : '',
              createdAt: data.createdAt,
              reviewedAt: data.reviewedAt,
              rejectionReason: typeof data.rejectionReason === 'string' ? data.rejectionReason : '',
            }]
          }))
          setIsLoading(false)
        },
        (loadError) => {
          console.error('Loading farmer applications failed:', loadError)
          setError('Unable to load farmer applications.')
          setIsLoading(false)
        }
      )
      unsubscribeProfiles = onSnapshot(
        collection(db, 'farmerProfiles'),
        (snapshot) => {
          setProfileStatuses(Object.fromEntries(snapshot.docs.flatMap((profile) => {
            const status = profile.data().status
            return status === 'active' || status === 'suspended' ? [[profile.id, status]] : []
          })))
        },
        (loadError) => {
          console.error('Loading farmer profile statuses failed:', loadError)
          setError('Unable to load farmer suspension statuses.')
        }
      )
    })

    return () => {
      unsubscribeApplications?.()
      unsubscribeProfiles?.()
      unsubscribeAuth()
    }
  }, [])

  const visibleApplications = useMemo(() => applications
    .filter((application) => statusFilter === 'all' || application.status === statusFilter)
    .sort((first, second) =>
      (timestampDate(second.createdAt)?.getTime() ?? 0) - (timestampDate(first.createdAt)?.getTime() ?? 0)
    ),
  [applications, statusFilter])

  async function reviewApplication(application: FarmerApplication, decision: 'approved' | 'rejected') {
    const reviewer = auth.currentUser
    if (!reviewer) {
      setError('Your CCES admin session ended. Log in again before reviewing applications.')
      return
    }

    const rejectionReason = decision === 'rejected' ? (rejectionReasons[application.id] ?? '').trim() : ''
    setProcessingId(application.id)
    setError('')
    setNotice('')
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'farmerApplications', application.id), {
        status: decision,
        reviewedBy: reviewer.uid,
        reviewedAt: serverTimestamp(),
        rejectionReason,
      })

      if (decision === 'approved') {
        batch.update(doc(db, 'users', application.id), { role: ROLES.FARMER })
        batch.set(doc(db, 'farmerProfiles', application.id), {
          status: 'active',
          farmName: application.farmName,
          contactNumber: application.contactNumber,
          address: application.address,
          createdAt: serverTimestamp(),
        })
      }

      await batch.commit()
      setNotice(decision === 'approved'
        ? `${application.farmName} was approved as a farmer.`
        : `${application.farmName} was rejected.`)
    } catch (reviewError) {
      console.error(`Reviewing farmer application as ${decision} failed:`, reviewError)
      setError(`Unable to ${decision === 'approved' ? 'approve' : 'reject'} this farmer application. Please try again.`)
    } finally {
      setProcessingId(null)
    }
  }

  async function updateFarmerStatus(application: FarmerApplication, status: ProfileStatus) {
    setProcessingId(application.id)
    setError('')
    setNotice('')
    try {
      await updateDoc(doc(db, 'farmerProfiles', application.id), { status })
      setNotice(`${application.farmName} is now ${status}.`)
    } catch (statusError) {
      console.error(`Updating farmer status to ${status} failed:`, statusError)
      setError('Unable to update this farmer’s status. Please try again.')
    } finally {
      setProcessingId(null)
    }
  }

  async function revokeApproval(application: FarmerApplication) {
    const reviewer = auth.currentUser
    if (!reviewer) {
      setError('Your CCES admin session ended. Log in again before reviewing applications.')
      return
    }

    setProcessingId(application.id)
    setError('')
    setNotice('')
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'farmerApplications', application.id), {
        status: 'rejected',
        reviewedBy: reviewer.uid,
        reviewedAt: serverTimestamp(),
        rejectionReason: (rejectionReasons[application.id] ?? '').trim(),
      })
      batch.update(doc(db, 'users', application.id), { role: ROLES.CUSTOMER })
      batch.update(doc(db, 'farmerProfiles', application.id), { status: 'suspended' })
      await batch.commit()
      setNotice(`${application.farmName}’s farmer approval was revoked.`)
    } catch (revokeError) {
      console.error('Revoking farmer approval failed:', revokeError)
      setError('Unable to revoke this farmer’s approval. Please try again.')
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <main className={styles.page}>
      <AdminSidebar active="applications" role={ROLES.CCES_ADMIN} />
      <section className={styles.content}>
        <Header title="FARMER APPLICATIONS" />
        <div className={styles.main}>
          <div className={styles.heading}>
            <div>
              <p className={styles.eyebrow}>CCES ADMINISTRATION</p>
              <h1>Farmer applications</h1>
              <p>Review applications and manage approved farmer access.</p>
            </div>
            <label className={styles.filter}>
              <span>Show</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All applications</option>
              </select>
            </label>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}
          {notice && <p className={styles.notice} role="status">{notice}</p>}
          {isLoading ? (
            <p className={styles.emptyState}>Loading applications...</p>
          ) : visibleApplications.length === 0 ? (
            <p className={styles.emptyState}>No {statusFilter === 'all' ? '' : `${statusFilter} `}farmer applications.</p>
          ) : (
            <div className={styles.applicationList}>
              {visibleApplications.map((application) => {
                const isProcessing = processingId === application.id
                const farmerStatus = profileStatuses[application.id]
                return (
                  <article className={styles.applicationCard} key={application.id}>
                    <div className={styles.cardHeader}>
                      <div>
                        <h2>{application.farmName}</h2>
                        <p>Applicant UID: {application.id}</p>
                      </div>
                      <span className={`${styles.status} ${styles[application.status]}`}>{application.status}</span>
                    </div>
                    <dl className={styles.details}>
                      <div><dt>Contact number</dt><dd>{application.contactNumber || 'Not provided'}</dd></div>
                      <div><dt>Farm address</dt><dd>{application.address || 'Not provided'}</dd></div>
                      <div><dt>Submitted</dt><dd>{applicationDate(application.createdAt)}</dd></div>
                      {Boolean(application.reviewedAt) && <div><dt>Reviewed</dt><dd>{applicationDate(application.reviewedAt)}</dd></div>}
                    </dl>

                    {(application.status === 'pending' || application.status === 'approved') && (
                      <label className={styles.reasonField}>
                        {application.status === 'pending' ? 'Rejection reason (optional)' : 'Revocation reason (optional)'}
                        <textarea
                          value={rejectionReasons[application.id] ?? ''}
                          onChange={(event) => setRejectionReasons((current) => ({
                            ...current,
                            [application.id]: event.target.value,
                          }))}
                          maxLength={1000}
                        />
                      </label>
                    )}

                    {application.status === 'pending' && (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.approveButton}
                          disabled={isProcessing}
                          onClick={() => void reviewApplication(application, 'approved')}
                        >{isProcessing ? 'SAVING...' : 'APPROVE FARMER'}</button>
                        <button
                          type="button"
                          className={styles.rejectButton}
                          disabled={isProcessing}
                          onClick={() => void reviewApplication(application, 'rejected')}
                        >REJECT APPLICATION</button>
                      </div>
                    )}

                    {application.status === 'approved' && (
                      <div className={styles.actions}>
                        {farmerStatus ? (
                          <span className={`${styles.profileStatus} ${styles[farmerStatus]}`}>Farmer account {farmerStatus}</span>
                        ) : (
                          <span className={styles.profileWarning}>Farmer profile unavailable</span>
                        )}
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          disabled={isProcessing || !farmerStatus}
                          onClick={() => void updateFarmerStatus(application, farmerStatus === 'active' ? 'suspended' : 'active')}
                        >{isProcessing ? 'SAVING...' : farmerStatus === 'active' ? 'SUSPEND FARMER' : 'REACTIVATE FARMER'}</button>
                        <button
                          type="button"
                          className={styles.rejectButton}
                          disabled={isProcessing}
                          onClick={() => {
                            if (window.confirm(`Revoke ${application.farmName}’s farmer approval?`)) {
                              void revokeApproval(application)
                            }
                          }}
                        >REVOKE APPROVAL</button>
                      </div>
                    )}

                    {application.status === 'rejected' && application.rejectionReason && (
                      <p className={styles.rejectionReason}>Reason: {application.rejectionReason}</p>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
