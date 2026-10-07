import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { onAuthStateChanged, sendPasswordResetEmail } from 'firebase/auth'
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes, type StorageReference } from 'firebase/storage'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import { storage } from '../../firebase/storage'
import { formatMonthDayYear } from '../../utils/dateFormat'
import styles from './AdminAccountPage.module.css'

type AdminProfile = {
  firstName: string
  lastName: string
  contactNumber: string
  address: string
  email: string
  birthday: string
}

type StoreSettings = {
  pickupLocation: string
  pickupDays: string
  pickupHours: string
  gcashAccountName: string
  gcashAccountNumber: string
  gcashQrUrl: string
  gcashQrPath: string
  mayaAccountName: string
  mayaAccountNumber: string
  mayaQrUrl: string
  mayaQrPath: string
}

type PaymentProvider = 'gcash' | 'maya'

const emptyStoreSettings: StoreSettings = {
  pickupLocation: '',
  pickupDays: '',
  pickupHours: '',
  gcashAccountName: '',
  gcashAccountNumber: '',
  gcashQrUrl: '',
  gcashQrPath: '',
  mayaAccountName: '',
  mayaAccountNumber: '',
  mayaQrUrl: '',
  mayaQrPath: '',
}

function readStoreSettings(data: Record<string, unknown>): StoreSettings {
  return {
    pickupLocation: typeof data.pickupLocation === 'string' ? data.pickupLocation : '',
    pickupDays: typeof data.pickupDays === 'string' ? data.pickupDays : '',
    pickupHours: typeof data.pickupHours === 'string' ? data.pickupHours : '',
    gcashAccountName: typeof data.gcashAccountName === 'string' ? data.gcashAccountName : '',
    gcashAccountNumber: typeof data.gcashAccountNumber === 'string' ? data.gcashAccountNumber : '',
    gcashQrUrl: typeof data.gcashQrUrl === 'string' ? data.gcashQrUrl : '',
    gcashQrPath: typeof data.gcashQrPath === 'string' ? data.gcashQrPath : '',
    mayaAccountName: typeof data.mayaAccountName === 'string' ? data.mayaAccountName : '',
    mayaAccountNumber: typeof data.mayaAccountNumber === 'string' ? data.mayaAccountNumber : '',
    mayaQrUrl: typeof data.mayaQrUrl === 'string' ? data.mayaQrUrl : '',
    mayaQrPath: typeof data.mayaQrPath === 'string' ? data.mayaQrPath : '',
  }
}

function validQrFile(file: File) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 5 * 1024 * 1024
}

function displayName(profile: AdminProfile) {
  return `${profile.firstName} ${profile.lastName}`.trim() || 'Admin'
}

function displayBirthday(value: unknown) {
  const date = value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function'
    ? value.toDate()
    : typeof value === 'string'
      ? new Date(value)
      : null
  return date && !Number.isNaN(date.getTime())
    ? formatMonthDayYear(date)
    : 'Not provided'
}

export function AdminAccountPage() {
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [draft, setDraft] = useState<AdminProfile | null>(null)
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(emptyStoreSettings)
  const [storeSettingsDraft, setStoreSettingsDraft] = useState<StoreSettings>(emptyStoreSettings)
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false)
  const [qrFiles, setQrFiles] = useState<Record<PaymentProvider, File | null>>({ gcash: null, maya: null })
  const [qrInputRevision, setQrInputRevision] = useState<Record<PaymentProvider, number>>({ gcash: 0, maya: 0 })
  const [removeQr, setRemoveQr] = useState<Record<PaymentProvider, boolean>>({ gcash: false, maya: false })
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSettingsLoading, setIsSettingsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [settingsNotice, setSettingsNotice] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const storeSettingsDirty = useRef(false)

  useEffect(() => {
    let isMounted = true
    let unsubscribeProfile: (() => void) | undefined
    let unsubscribeSettings: (() => void) | undefined

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeProfile?.()
      unsubscribeProfile = undefined
      unsubscribeSettings?.()
      unsubscribeSettings = undefined

      if (!user) {
        if (isMounted) {
          setError('Please log in to manage your admin account.')
          setIsLoading(false)
          setIsSettingsLoading(false)
          setHasLoadedSettings(false)
        }
        return
      }

      unsubscribeProfile = onSnapshot(
        doc(db, 'users', user.uid),
        (snapshot) => {
          if (!isMounted) return
          if (!snapshot.exists() || snapshot.data().role !== 'admin') {
            setProfile(null)
            setError('An admin account profile could not be found.')
            setIsLoading(false)
            setIsSettingsLoading(false)
            return
          }

          const data = snapshot.data()
          const loadedProfile: AdminProfile = {
            firstName: typeof data.firstName === 'string' ? data.firstName : '',
            lastName: typeof data.lastName === 'string' ? data.lastName : '',
            contactNumber: typeof data.contactNumber === 'string' ? data.contactNumber : '',
            address: typeof data.address === 'string' ? data.address : '',
            email: user.email ?? (typeof data.email === 'string' ? data.email : ''),
            birthday: displayBirthday(data.birthday),
          }
          setProfile(loadedProfile)
          setIsEditing((currentlyEditing) => {
            if (!currentlyEditing) setDraft(loadedProfile)
            return currentlyEditing
          })
          setError('')
          setIsLoading(false)
          if (!unsubscribeSettings) {
            unsubscribeSettings = onSnapshot(
              doc(db, 'settings', 'storefront'),
              (settingsSnapshot) => {
                if (!isMounted) return
                const loadedSettings = settingsSnapshot.exists()
                  ? readStoreSettings(settingsSnapshot.data())
                  : emptyStoreSettings
                setStoreSettings(loadedSettings)
                if (!storeSettingsDirty.current) setStoreSettingsDraft(loadedSettings)
                setSettingsError('')
                setHasLoadedSettings(true)
                setIsSettingsLoading(false)
              },
              (loadError) => {
                console.error('Loading store settings failed:', loadError)
                if (isMounted) {
                  setSettingsError('Unable to load store pickup and payment settings.')
                  setHasLoadedSettings(false)
                  setIsSettingsLoading(false)
                }
              }
            )
          }
        },
        (loadError) => {
          console.error('Loading admin account failed:', loadError)
          if (isMounted) {
            setError('Unable to load your admin account information.')
            setIsLoading(false)
            setIsSettingsLoading(false)
          }
        }
      )
    })

    return () => {
      isMounted = false
      unsubscribeAuth()
      unsubscribeProfile?.()
      unsubscribeSettings?.()
    }
  }, [])

  function updateField(field: 'firstName' | 'lastName' | 'contactNumber' | 'address', value: string) {
    setDraft((current) => current ? { ...current, [field]: value } : current)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const user = auth.currentUser
    if (!user || !draft) return

    setError('')
    setNotice('')
    setIsSaving(true)
    const updatedProfile = {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      contactNumber: draft.contactNumber.trim(),
      address: draft.address.trim(),
    }

    try {
      await updateDoc(doc(db, 'users', user.uid), updatedProfile)
      setDraft((current) => current ? { ...current, ...updatedProfile } : current)
      setProfile((current) => current ? { ...current, ...updatedProfile } : current)
      setIsEditing(false)
      setNotice('Your account details have been saved.')
    } catch (saveError) {
      console.error('Updating admin account failed:', saveError)
      setError('Unable to save your account details. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  async function sendPasswordReset() {
    const email = auth.currentUser?.email
    if (!email) {
      setError('Your account does not have an email address for password recovery.')
      return
    }

    setError('')
    setNotice('')
    setIsSendingReset(true)
    try {
      await sendPasswordResetEmail(auth, email)
      setNotice(`A password reset link was sent to ${email}.`)
    } catch (resetError) {
      console.error('Sending admin password reset email failed:', resetError)
      setError('Unable to send a password reset link. Please try again.')
    } finally {
      setIsSendingReset(false)
    }
  }

  function updateStoreField(field: keyof StoreSettings, value: string) {
    storeSettingsDirty.current = true
    setStoreSettingsDraft((current) => ({ ...current, [field]: value }))
    setSettingsError('')
    setSettingsNotice('')
  }

  function chooseQr(provider: PaymentProvider, file: File | null) {
    setSettingsError('')
    setSettingsNotice('')
    if (file && !validQrFile(file)) {
      setSettingsError('QR images must be JPG, PNG, or WebP and 5 MB or smaller.')
      return
    }
    storeSettingsDirty.current = true
    setQrFiles((current) => ({ ...current, [provider]: file }))
    setRemoveQr((current) => ({ ...current, [provider]: false }))
  }

  async function saveStoreSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const user = auth.currentUser
    if (!user) {
      setSettingsError('Please log in to save store settings.')
      return
    }
    if (!hasLoadedSettings) {
      setSettingsError('Store settings have not loaded yet. Refresh the page before saving.')
      return
    }

    setSettingsError('')
    setSettingsNotice('')
    setIsSavingSettings(true)
    const uploadedRefs: StorageReference[] = []
    const nextSettings: StoreSettings = {
      ...storeSettingsDraft,
      pickupLocation: storeSettingsDraft.pickupLocation.trim(),
      pickupDays: storeSettingsDraft.pickupDays.trim(),
      pickupHours: storeSettingsDraft.pickupHours.trim(),
      gcashAccountName: storeSettingsDraft.gcashAccountName.trim(),
      gcashAccountNumber: storeSettingsDraft.gcashAccountNumber.trim(),
      mayaAccountName: storeSettingsDraft.mayaAccountName.trim(),
      mayaAccountNumber: storeSettingsDraft.mayaAccountNumber.trim(),
    }

    try {
      const uploadResults = await Promise.allSettled((['gcash', 'maya'] as const).map(async (provider) => {
        const file = qrFiles[provider]
        if (!file) return null
        const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
        const storagePath = `payment-qr/${provider}/${user.uid}/${Date.now()}-${crypto.randomUUID()}.${extension}`
        const uploadRef = ref(storage, storagePath)
        uploadedRefs.push(uploadRef)
        const upload = await uploadBytes(uploadRef, file, { contentType: file.type })
        const url = await getDownloadURL(upload.ref)
        return { provider, url, storagePath }
      }))
      const failedUpload = uploadResults.find((result) => result.status === 'rejected')
      if (failedUpload?.status === 'rejected') throw failedUpload.reason
      const uploadedQr = uploadResults.flatMap((result) =>
        result.status === 'fulfilled' && result.value ? [result.value] : []
      )
      for (const result of uploadedQr) {
        nextSettings[`${result.provider}QrUrl`] = result.url
        nextSettings[`${result.provider}QrPath`] = result.storagePath
      }
      for (const provider of ['gcash', 'maya'] as const) {
        if (removeQr[provider] && !qrFiles[provider]) {
          nextSettings[`${provider}QrUrl`] = ''
          nextSettings[`${provider}QrPath`] = ''
        }
      }

      await setDoc(doc(db, 'settings', 'storefront'), nextSettings, { merge: true })
      storeSettingsDirty.current = false
      setStoreSettings(nextSettings)
      setStoreSettingsDraft(nextSettings)
      setQrFiles({ gcash: null, maya: null })
      setQrInputRevision((current) => ({ gcash: current.gcash + 1, maya: current.maya + 1 }))
      setRemoveQr({ gcash: false, maya: false })
      const obsoletePaths = (['gcash', 'maya'] as const)
        .map((provider) => ({
          oldPath: storeSettings[`${provider}QrPath`],
          newPath: nextSettings[`${provider}QrPath`],
        }))
        .filter(({ oldPath, newPath }) => oldPath && oldPath !== newPath)

      setSettingsNotice('Pickup and payment settings have been saved.')
      void Promise.allSettled(obsoletePaths.map(({ oldPath }) => deleteObject(ref(storage, oldPath))))
        .then((results) => {
          const failures = results.filter((result) => result.status === 'rejected')
          failures.forEach((failure) => console.error('Removing replaced payment QR image failed:', failure.reason))
          if (failures.length > 0) {
            setSettingsNotice('Settings were saved, but an old QR image could not be removed.')
          }
        })
    } catch (saveError) {
      console.error('Saving store settings failed:', saveError)
      void Promise.allSettled(uploadedRefs.map((uploadRef) => deleteObject(uploadRef)))
        .then((results) => results
          .filter((result) => result.status === 'rejected')
          .forEach((failure) => console.error('Cleaning up an unused payment QR image failed:', failure.reason)))
      setSettingsError('Unable to save pickup and payment settings. Please try again.')
    } finally {
      setIsSavingSettings(false)
    }
  }

  function paymentSettingsFields(provider: PaymentProvider, label: string) {
    const accountNameField = `${provider}AccountName` as const
    const accountNumberField = `${provider}AccountNumber` as const
    const qrUrlField = `${provider}QrUrl` as const
    const qrPathField = `${provider}QrPath` as const
    const qrFile = qrFiles[provider]
    const isMarkedForRemoval = removeQr[provider]

    return (
      <section className={styles.paymentSettings} aria-labelledby={`${provider}-settings-heading`}>
        <h4 id={`${provider}-settings-heading`}>{label}</h4>
        <div className={styles.form}>
          <label>Account Name<input autoComplete="name" disabled={isSavingSettings} value={storeSettingsDraft[accountNameField]} onChange={(event) => updateStoreField(accountNameField, event.target.value)} /></label>
          <label>Account Number<input inputMode="tel" disabled={isSavingSettings} value={storeSettingsDraft[accountNumberField]} onChange={(event) => updateStoreField(accountNumberField, event.target.value)} /></label>
          <label className={styles.fullWidth}>QR Code<input key={`${provider}-${storeSettings[qrPathField]}-${qrInputRevision[provider]}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={isSavingSettings} onChange={(event) => chooseQr(provider, event.target.files?.[0] ?? null)} /></label>
        </div>
        {storeSettings[qrUrlField] && !qrFile && !isMarkedForRemoval && (
          <div className={styles.qrPreview}>
            <img src={storeSettings[qrUrlField]} alt={`${label} payment QR code`} />
            <button className={styles.removePhotoButton} disabled={isSavingSettings} type="button" onClick={() => {
              storeSettingsDirty.current = true
              setRemoveQr((current) => ({ ...current, [provider]: true }))
              setSettingsError('')
              setSettingsNotice('')
            }}>REMOVE QR CODE</button>
          </div>
        )}
        {qrFile && (
          <div className={styles.selectedPhoto}>
            <p className={styles.fileName}>Selected: {qrFile.name}</p>
            <button className={styles.removePhotoButton} disabled={isSavingSettings} type="button" onClick={() => {
              chooseQr(provider, null)
              setQrInputRevision((current) => ({ ...current, [provider]: current[provider] + 1 }))
            }}>REMOVE SELECTED IMAGE</button>
          </div>
        )}
        {isMarkedForRemoval && (
          <div className={styles.selectedPhoto}>
            <p className={styles.fileName}>Current QR code will be removed when settings are saved.</p>
            <button className={styles.removePhotoButton} disabled={isSavingSettings} type="button" onClick={() => {
              storeSettingsDirty.current = true
              setRemoveQr((current) => ({ ...current, [provider]: false }))
              setSettingsError('')
              setSettingsNotice('')
            }}>UNDO REMOVE</button>
          </div>
        )}
      </section>
    )
  }

  return (
    <main className={styles.page}>
      <AdminSidebar active="account" />
      <section className={styles.content}>
        <Header title="MY ACCOUNT" />
        {isLoading ? (
          <section className={styles.card}><p>Loading account information...</p></section>
        ) : !profile ? (
          <section className={styles.card}><p role="alert">{error || 'Account information is unavailable.'}</p></section>
        ) : (
          <section className={styles.card}>
            <div className={styles.profileHeader}>
              <div className={styles.avatar} aria-hidden="true">{displayName(profile).charAt(0).toUpperCase()}</div>
              <div className={styles.identity}>
                <h2>{displayName(profile)}</h2>
                <p>{profile.email}</p>
              </div>
              <span className={styles.role}>ADMIN</span>
            </div>

            <div className={styles.sectionHeading}>
              <div>
                <h3>Personal information</h3>
                <p>Manage the details associated with your admin account.</p>
              </div>
              {!isEditing && <button type="button" onClick={() => { setDraft(profile); setError(''); setNotice(''); setIsEditing(true) }}>EDIT PROFILE</button>}
            </div>

            {isEditing ? (
              <form className={styles.form} onSubmit={(event) => void save(event)}>
                <label>First Name<input autoComplete="given-name" value={draft?.firstName ?? ''} onChange={(event) => updateField('firstName', event.target.value)} /></label>
                <label>Last Name<input autoComplete="family-name" value={draft?.lastName ?? ''} onChange={(event) => updateField('lastName', event.target.value)} /></label>
                <label>Email Address<input type="email" value={profile.email} readOnly /></label>
                <label>Contact Number<input autoComplete="tel" value={draft?.contactNumber ?? ''} onChange={(event) => updateField('contactNumber', event.target.value)} /></label>
                <label className={styles.fullWidth}>Address<input autoComplete="street-address" value={draft?.address ?? ''} onChange={(event) => updateField('address', event.target.value)} /></label>
                <div className={styles.actions}>
                  <button disabled={isSaving} type="button" onClick={() => { setDraft(profile); setIsEditing(false); setError('') }}>CANCEL</button>
                  <button disabled={isSaving} type="submit">{isSaving ? 'SAVING...' : 'SAVE CHANGES'}</button>
                </div>
              </form>
            ) : (
              <dl className={styles.details}>
                <div><dt>First Name</dt><dd>{profile.firstName || 'Not provided'}</dd></div>
                <div><dt>Last Name</dt><dd>{profile.lastName || 'Not provided'}</dd></div>
                <div><dt>Email Address</dt><dd>{profile.email || 'Not provided'}</dd></div>
                <div><dt>Contact Number</dt><dd>{profile.contactNumber || 'Not provided'}</dd></div>
                <div><dt>Address</dt><dd>{profile.address || 'Not provided'}</dd></div>
                <div><dt>Birthday</dt><dd>{profile.birthday}</dd></div>
              </dl>
            )}

            <div className={styles.security}>
              <div>
                <h3>Password</h3>
                <p>Send a password reset link to your account email address.</p>
              </div>
              <button type="button" disabled={isSendingReset} onClick={() => void sendPasswordReset()}>
                {isSendingReset ? 'SENDING...' : 'SEND RESET LINK'}
              </button>
            </div>
            {error && <p className={styles.error} role="alert">{error}</p>}
            {notice && <p className={styles.notice} role="status">{notice}</p>}

            <section className={styles.storeSettings} aria-labelledby="store-settings-heading">
              <div className={styles.sectionHeading}>
                <div>
                  <h3 id="store-settings-heading">Pickup &amp; payment settings</h3>
                  <p>These details are shown to customers during checkout.</p>
                </div>
              </div>
              {isSettingsLoading ? (
                <p>Loading pickup and payment settings...</p>
              ) : !hasLoadedSettings ? (
                <p className={styles.error} role="alert">{settingsError || 'Unable to load store settings. Refresh the page to try again.'}</p>
              ) : (
                <form onSubmit={(event) => void saveStoreSettings(event)}>
                  <div className={styles.form}>
                    <label className={styles.fullWidth}>Pickup Location<input disabled={isSavingSettings} value={storeSettingsDraft.pickupLocation} onChange={(event) => updateStoreField('pickupLocation', event.target.value)} placeholder="Enter the pickup address" /></label>
                    <label>Pickup Days<input disabled={isSavingSettings} value={storeSettingsDraft.pickupDays} onChange={(event) => updateStoreField('pickupDays', event.target.value)} placeholder="For example: Monday–Saturday" /></label>
                    <label>Pickup Hours<input disabled={isSavingSettings} value={storeSettingsDraft.pickupHours} onChange={(event) => updateStoreField('pickupHours', event.target.value)} placeholder="For example: 9 AM–5 PM" /></label>
                  </div>
                  {paymentSettingsFields('gcash', 'GCash')}
                  {paymentSettingsFields('maya', 'Maya')}
                  {settingsError && <p className={styles.error} role="alert">{settingsError}</p>}
                  {settingsNotice && <p className={styles.notice} role="status">{settingsNotice}</p>}
                  <div className={styles.actions}>
                    <button disabled={isSavingSettings} type="submit">{isSavingSettings ? 'SAVING...' : 'SAVE STORE SETTINGS'}</button>
                  </div>
                </form>
              )}
            </section>
          </section>
        )}
      </section>
    </main>
  )
}
