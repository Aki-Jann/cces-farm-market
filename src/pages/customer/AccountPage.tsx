import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { onAuthStateChanged, sendPasswordResetEmail, verifyBeforeUpdateEmail, reauthenticateWithCredential, EmailAuthProvider, signOut } from 'firebase/auth'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { CustomerSidebar } from '../../components/layout/CustomerSidebar'
import { Header } from '../../components/layout/Header'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import { formatMonthDayYear } from '../../utils/dateFormat'
import styles from './AccountPage.module.css'

type AccountData = {
  firstName: string
  lastName: string
  email: string
  birthday: string
  contact: string
  address: string
  customerType: string
  farmNotes: string
}

function formatBirthday(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return formatMonthDayYear(value.toDate())
  }
  return 'Not provided'
}

const hiddenValue = '••••••••'

function accountName(account: AccountData) {
  return `${account.firstName} ${account.lastName}`.trim() || 'Customer'
}

export function AccountPage() {
  const [account, setAccount] = useState<AccountData | null>(null)
  const [draft, setDraft] = useState<AccountData | null>(null)
  const [editing, setEditing] = useState(false)
  const [detailsHidden, setDetailsHidden] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetNotice, setResetNotice] = useState('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [emailNotice, setEmailNotice] = useState('')

  useEffect(() => {
    let isMounted = true
    let unsubscribeProfile: (() => void) | undefined

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeProfile) {
        unsubscribeProfile()
        unsubscribeProfile = undefined
      }

      if (!user) {
        if (isMounted) {
          setError('Please log in to view your account.')
          setIsLoading(false)
        }
        return
      }

      unsubscribeProfile = onSnapshot(
        doc(db, 'users', user.uid),
        (snapshot) => {
          if (!isMounted) return
          if (!snapshot.exists()) {
            setError('Your account profile could not be found.')
            setIsLoading(false)
            return
          }
        
          const data = snapshot.data()
          const loadedAccount: AccountData = {
            firstName: typeof data.firstName === 'string' ? data.firstName : '',
            lastName: typeof data.lastName === 'string' ? data.lastName : '',
            email: typeof data.email === 'string' ? data.email : user.email ?? '',
            birthday: formatBirthday(data.birthday),
            contact: typeof data.contactNumber === 'string' ? data.contactNumber : '',
            address: typeof data.address === 'string' ? data.address : '',
            customerType: typeof data.customerType === 'string' ? data.customerType : 'Not provided',
            farmNotes: typeof data.farmNotes === 'string' ? data.farmNotes : '',
          }
          if (user.email && data.email !== user.email) {
            updateDoc(doc(db, 'users', user.uid), { email: user.email })
              .catch((e) => console.error('Syncing email to profile failed:', e))
          }

          setAccount(loadedAccount)
          // Only sync the edit draft when the user isn't actively editing,
          // so a live update doesn't overwrite unsaved changes.
          setEditing((currentlyEditing) => {
            if (!currentlyEditing) {
              setDraft(loadedAccount)
            }
            return currentlyEditing
          })
          setError('')
          setIsLoading(false)
        },
        (loadError) => {
          console.error('Loading account profile failed:', loadError)
          if (isMounted) {
            setError('Unable to load your account information.')
            setIsLoading(false)
          }
        }
      )
    })

    return () => {
      isMounted = false
      unsubscribeAuth()
      if (unsubscribeProfile) unsubscribeProfile()
    }
  }, [])

  function updateField(field: 'firstName' | 'lastName' | 'contact' | 'address', value: string) {
    setDraft((current) => current ? { ...current, [field]: value } : current)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const user = auth.currentUser
    if (!user || !draft) return

    setIsSaving(true)
    setError('')
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        contactNumber: draft.contact.trim(),
        address: draft.address.trim(),
      })
      setAccount(draft)
      setEditing(false)
    } catch (saveError) {
      console.error('Updating account profile failed:', saveError)
      setError('Unable to save your account information.')
    } finally {
      setIsSaving(false)
    }
  }

  async function requestEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const user = auth.currentUser
    const trimmed = newEmail.trim()

    if (!user || !user.email) {
      setEmailError('You must be logged in to change your email.')
      return
    }
    if (trimmed.toLowerCase() === user.email.toLowerCase()) {
      setEmailError('That is already your current email address.')
      return
    }

    setEmailError('')
    setEmailNotice('')
    setIsUpdatingEmail(true)

    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)

      await verifyBeforeUpdateEmail(user, trimmed)

      setEmailNotice(`A verification link was sent to ${trimmed}. Your email will change once you confirm it.`)
      setNewEmail('')
      setCurrentPassword('')
      setShowEmailForm(false)
    } catch (err) {
      console.error('Email change failed:', err)
      const code = (err as { code?: string }).code
      switch (code) {
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setEmailError('Your current password is incorrect.')
          break
        case 'auth/invalid-email':
          setEmailError('Please enter a valid email address.')
          break
        case 'auth/email-already-in-use':
          setEmailError('That email address is already in use.')
          break
        case 'auth/requires-recent-login':
          setEmailError('Please log out and log back in, then try again.')
          break
        case 'auth/too-many-requests':
          setEmailError('Too many attempts. Please try again later.')
          break
        default:
          setEmailError('Unable to start the email change. Please try again.')
      }
    } finally {
      setIsUpdatingEmail(false)
    }
  } 

  async function sendPasswordReset() {
    const email = auth.currentUser?.email
    if (!email) {
      setResetError('Your account does not have an email address for password recovery.')
      return
    }

    setResetError('')
    setResetNotice('')
    setIsSendingReset(true)
    try {
      await sendPasswordResetEmail(auth, email)
      setResetNotice(`A password reset link was sent to ${email}.`)
    } catch (resetEmailError) {
      console.error('Sending customer password reset email failed:', resetEmailError)
      setResetError('Unable to send a password reset link. Please try again.')
    } finally {
      setIsSendingReset(false)
    }
  }

  async function logout() {
      setIsLoggingOut(true)
      setError('')
      try {
        await signOut(auth)
        window.location.hash = '/login'
      } catch (logoutError) {
        console.error('Signing out of account failed:', logoutError)
        setError('Unable to log out. Please try again.')
        setIsLoggingOut(false)
      }
    }

  if (isLoading) {
    return <main className={styles.page}><CustomerSidebar active="account" /><section className={styles.content}><Header title="MY ACCOUNT" /><section className={styles.card}><p>Loading account information...</p></section></section></main>
  }

  if (!account || error) {
    return <main className={styles.page}><CustomerSidebar active="account" /><section className={styles.content}><Header title="MY ACCOUNT" /><section className={styles.card}><p role="alert">{error || 'Account information is unavailable.'}</p></section></section></main>
  }

  return (
    <main className={styles.page}>
      <CustomerSidebar active="account" />
      <section className={styles.content}>
        <Header title="MY ACCOUNT" />
        <section className={styles.card}>
          <div className={styles.profileHeader}>
            <div className={styles.avatar}>{accountName(account).charAt(0)}</div>
            <div className={styles.identity}>
              <div className={styles.identityTitle}>
                <h2>{accountName(account)}</h2>
                <span className={styles.role}>CUSTOMER</span>
              </div>
              <p>{detailsHidden ? hiddenValue : account.email}</p>
            </div>
            <button className={styles.logout} type="button" disabled={isLoggingOut} onClick={() => void logout()}>
                {isLoggingOut ? 'LOGGING OUT...' : 'LOG OUT'}
              </button>
          </div>
          <div className={styles.sectionHeading}>
            <div>
              <h3>Personal information</h3>
              <p>Manage the details associated with your account.</p>
            </div>
            {!editing && (
              <div className={styles.headingActions}>
                <button type="button" aria-pressed={detailsHidden} onClick={() => setDetailsHidden((hidden) => !hidden)}>{detailsHidden ? 'SHOW DETAILS' : 'HIDE DETAILS'}</button>
                <button type="button" onClick={() => { setDraft(account); setEditing(true) }}>EDIT PROFILE</button>
              </div>
            )}
          </div>
          {editing ? (
            <form className={styles.form} onSubmit={save}>
              <label>First Name<input value={draft?.firstName ?? ''} onChange={(event) => updateField('firstName', event.target.value)} /></label>
              <label>Last Name<input value={draft?.lastName ?? ''} onChange={(event) => updateField('lastName', event.target.value)} /></label>
              
              <label>Contact Number<input value={draft?.contact ?? ''} onChange={(event) => updateField('contact', event.target.value)} /></label>
              <label>Address<input value={draft?.address ?? ''} onChange={(event) => updateField('address', event.target.value)} /></label>
              <div className={styles.actions}><button disabled={isSaving} type="button" onClick={() => setEditing(false)}>CANCEL</button><button disabled={isSaving} type="submit">{isSaving ? 'SAVING...' : 'SAVE CHANGES'}</button></div>
            </form>
          ) : (
            <dl className={styles.details}>
              <div><dt>First Name</dt><dd>{account.firstName || 'Not provided'}</dd></div>
              <div><dt>Last Name</dt><dd>{account.lastName || 'Not provided'}</dd></div>
              <div><dt>Email Address</dt><dd>{detailsHidden ? hiddenValue : account.email}</dd></div>
              <div><dt>Contact Number</dt><dd>{detailsHidden ? hiddenValue : account.contact}</dd></div>
              <div><dt>Address</dt><dd>{detailsHidden ? hiddenValue : account.address}</dd></div>
              <div><dt>Birthday</dt><dd>{detailsHidden ? hiddenValue : account.birthday}</dd></div>
            </dl>
          )}
          <div className={styles.security}>
            <div>
              <h3>Email</h3>
              <p>Change your email. We'll send a verification link to the new address.</p>
            </div>
            {!showEmailForm && (
              <button type="button" onClick={() => setShowEmailForm(true)}>CHANGE EMAIL</button>
            )}
          </div>
          {showEmailForm && (
            <form className={styles.form} onSubmit={requestEmailChange}>
              <label>New Email
                <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </label>
              <label>Current Password
                <input type="password" required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </label>
              <div className={styles.actions}>
                <button type="button" disabled={isUpdatingEmail} onClick={() => { setShowEmailForm(false); setEmailError('') }}>CANCEL</button>
                <button type="submit" disabled={isUpdatingEmail}>{isUpdatingEmail ? 'SENDING...' : 'SEND VERIFICATION'}</button>
              </div>
            </form>
          )}
          {emailError && <p className={styles.resetError} role="alert">{emailError}</p>}
          {emailNotice && <p className={styles.resetNotice} role="status">{emailNotice}</p>}
          <div className={styles.security}>
            <div>
              <h3>Password</h3>
              <p>Send a password reset link to your account email address.</p>
            </div>
            <button type="button" disabled={isSendingReset} onClick={() => void sendPasswordReset()}>
              {isSendingReset ? 'SENDING...' : 'SEND RESET LINK'}
            </button>
          </div>
          {resetError && <p className={styles.resetError} role="alert">{resetError}</p>}
          {resetNotice && <p className={styles.resetNotice} role="status">{resetNotice}</p>}
        </section>
      </section>
    </main>
  )
}
