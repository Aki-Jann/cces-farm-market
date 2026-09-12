import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { CustomerSidebar } from '../../components/layout/CustomerSidebar'
import { Header } from '../../components/layout/Header'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
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
    const date = value.toDate()
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`
  }
  return 'Not provided'
}

function accountName(account: AccountData) {
  return `${account.firstName} ${account.lastName}`.trim() || 'Customer'
}

export function AccountPage() {
  const [account, setAccount] = useState<AccountData | null>(null)
  const [draft, setDraft] = useState<AccountData | null>(null)
  const [editing, setEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    let unsubscribeProfile: (() => void) | undefined

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      // Tear down any previous profile listener before attaching a new one.
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

  function updateField(field: 'firstName' | 'lastName' | 'email' | 'contact' | 'address', value: string) {
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
        email: draft.email.trim(),
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
            <div><h2>{accountName(account)}</h2><p>{account.email}</p></div>
            <a href="#/" className={styles.logout}>LOG OUT</a>
          </div>
          <div className={styles.sectionHeading}>
            <strong>Personal Information</strong>
            {!editing && <button type="button" onClick={() => { setDraft(account); setEditing(true) }}>EDIT INFO</button>}
          </div>
          {editing ? (
            <form className={styles.form} onSubmit={save}>
              <label>First Name<input value={draft?.firstName ?? ''} onChange={(event) => updateField('firstName', event.target.value)} /></label>
              <label>Last Name<input value={draft?.lastName ?? ''} onChange={(event) => updateField('lastName', event.target.value)} /></label>
              <label>Email Address<input type="email" value={draft?.email ?? ''} onChange={(event) => updateField('email', event.target.value)} /></label>
              <label>Contact Number<input value={draft?.contact ?? ''} onChange={(event) => updateField('contact', event.target.value)} /></label>
              <label>Address<input value={draft?.address ?? ''} onChange={(event) => updateField('address', event.target.value)} /></label>
              <div className={styles.actions}><button disabled={isSaving} type="button" onClick={() => setEditing(false)}>CANCEL</button><button disabled={isSaving} type="submit">{isSaving ? 'SAVING...' : 'SAVE'}</button></div>
            </form>
          ) : (
            <dl className={styles.details}>
              <div><dt>First Name</dt><dd>{account.firstName || 'Not provided'}</dd></div>
              <div><dt>Last Name</dt><dd>{account.lastName || 'Not provided'}</dd></div>
              <div><dt>Email Address</dt><dd>{account.email}</dd></div>
              <div><dt>Contact Number</dt><dd>{account.contact}</dd></div>
              <div><dt>Address</dt><dd>{account.address}</dd></div>
              <div><dt>Birthday</dt><dd>{account.birthday}</dd></div>
            </dl>
          )}
        </section>
      </section>
    </main>
  )
}
