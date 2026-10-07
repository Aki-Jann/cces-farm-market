import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from '../../firebase/storage'
import styles from './AdminPaymentPage.module.css'

type StorefrontSettings = {
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

const storefrontSettingsRef = doc(db, 'settings', 'storefront')
const emptyStorefrontSettings: StorefrontSettings = {
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

function CheckoutSettingsPanel() {
  const [settings, setSettings] = useState<StorefrontSettings>(emptyStorefrontSettings)
  const [draft, setDraft] = useState<StorefrontSettings>(emptyStorefrontSettings)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [uploadingMethod, setUploadingMethod] = useState<'GCASH' | 'MAYA' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const draftIsDirty = useRef(false)
  const legacyMigrationStarted = useRef(false)

  useEffect(() => onSnapshot(
    storefrontSettingsRef,
    (snapshot) => {
      const data = snapshot.data()
      const loadedSettings: StorefrontSettings = {
        pickupLocation: typeof data?.pickupLocation === 'string' ? data.pickupLocation : '',
        pickupDays: typeof data?.pickupDays === 'string' ? data.pickupDays : '',
        pickupHours: typeof data?.pickupHours === 'string' ? data.pickupHours : '',
        gcashAccountName: typeof data?.gcashAccountName === 'string' ? data.gcashAccountName : '',
        gcashAccountNumber: typeof data?.gcashAccountNumber === 'string' ? data.gcashAccountNumber : '',
        gcashQrUrl: typeof data?.gcashQrUrl === 'string' ? data.gcashQrUrl : '',
        gcashQrPath: typeof data?.gcashQrPath === 'string' ? data.gcashQrPath : '',
        mayaAccountName: typeof data?.mayaAccountName === 'string' ? data.mayaAccountName : '',
        mayaAccountNumber: typeof data?.mayaAccountNumber === 'string' ? data.mayaAccountNumber : '',
        mayaQrUrl: typeof data?.mayaQrUrl === 'string' ? data.mayaQrUrl : '',
        mayaQrPath: typeof data?.mayaQrPath === 'string' ? data.mayaQrPath : '',
      }
      setSettings(loadedSettings)
      if (!draftIsDirty.current) setDraft(loadedSettings)
      setError('')
      setIsLoading(false)
      if (!legacyMigrationStarted.current) {
        legacyMigrationStarted.current = true
        void getDoc(doc(db, 'storeSettings', 'checkout'))
          .then(async (legacySnapshot) => {
            if (!legacySnapshot.exists()) return
            const legacyData = legacySnapshot.data()
            const migratedSettings: Partial<StorefrontSettings> = {}
            if (!loadedSettings.pickupLocation && typeof legacyData.pickupAddress === 'string') {
              migratedSettings.pickupLocation = legacyData.pickupAddress
            }
            if (!loadedSettings.gcashQrUrl && typeof legacyData.gcashQrUrl === 'string') {
              migratedSettings.gcashQrUrl = legacyData.gcashQrUrl
            }
            if (!loadedSettings.mayaQrUrl && typeof legacyData.mayaQrUrl === 'string') {
              migratedSettings.mayaQrUrl = legacyData.mayaQrUrl
            }
            if (Object.keys(migratedSettings).length > 0) {
              await setDoc(storefrontSettingsRef, migratedSettings, { merge: true })
            }
          })
          .catch((migrationError) => {
            console.error('Migrating legacy checkout settings failed:', migrationError)
            setError('Unable to migrate existing checkout settings. Please review and save them here.')
          })
      }
    },
    (loadError) => {
      console.error('Loading storefront settings failed:', loadError)
      setError('Unable to load pickup and payment settings.')
      setIsLoading(false)
    }
  ), [])

  function updateField(field: keyof StorefrontSettings, value: string) {
    draftIsDirty.current = true
    setDraft((current) => ({ ...current, [field]: value }))
    setError('')
    setNotice('')
  }

  async function saveStorefrontSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.pickupLocation.trim()) {
      setError('Enter a pickup location before saving.')
      return
    }

    setIsSaving(true)
    setError('')
    setNotice('')
    const savedSettings = {
      pickupLocation: draft.pickupLocation.trim(),
      pickupDays: draft.pickupDays.trim(),
      pickupHours: draft.pickupHours.trim(),
      gcashAccountName: draft.gcashAccountName.trim(),
      gcashAccountNumber: draft.gcashAccountNumber.trim(),
      mayaAccountName: draft.mayaAccountName.trim(),
      mayaAccountNumber: draft.mayaAccountNumber.trim(),
    }
    try {
      await setDoc(storefrontSettingsRef, { ...savedSettings, updatedAt: serverTimestamp() }, { merge: true })
      setDraft((current) => ({ ...current, ...savedSettings }))
      draftIsDirty.current = false
      setNotice('Pickup and payment details saved.')
    } catch (saveError) {
      console.error('Saving storefront settings failed:', saveError)
      setError('Unable to save pickup and payment details.')
    } finally {
      setIsSaving(false)
    }
  }

  async function uploadQrCode(method: 'GCASH' | 'MAYA', file: File | undefined) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('QR codes must be JPG, PNG, or WebP images.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('QR code images must be 5 MB or smaller.')
      return
    }

    setUploadingMethod(method)
    setError('')
    setNotice('')
    let uploadedRef: ReturnType<typeof ref> | null = null
    try {
      const user = auth.currentUser
      if (!user) throw new Error('An admin must be signed in to upload payment QR codes.')
      const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
      const storagePath = `payment-qr/${method.toLowerCase()}/${user.uid}/${crypto.randomUUID()}.${extension}`
      uploadedRef = ref(storage, storagePath)
      const uploadedImage = await uploadBytes(uploadedRef, file, { contentType: file.type })
      const imageUrl = await getDownloadURL(uploadedImage.ref)
      const provider = method === 'GCASH' ? 'gcash' : 'maya'
      const oldPath = settings[`${provider}QrPath`]
      const savedDetails = {
        pickupLocation: draft.pickupLocation.trim(),
        pickupDays: draft.pickupDays.trim(),
        pickupHours: draft.pickupHours.trim(),
        gcashAccountName: draft.gcashAccountName.trim(),
        gcashAccountNumber: draft.gcashAccountNumber.trim(),
        mayaAccountName: draft.mayaAccountName.trim(),
        mayaAccountNumber: draft.mayaAccountNumber.trim(),
      }
      await setDoc(storefrontSettingsRef, {
        ...savedDetails,
        [`${provider}QrUrl`]: imageUrl,
        [`${provider}QrPath`]: storagePath,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setDraft((current) => ({
        ...current,
        ...savedDetails,
        [`${provider}QrUrl`]: imageUrl,
        [`${provider}QrPath`]: storagePath,
      }))
      draftIsDirty.current = false
      if (oldPath && oldPath !== storagePath) {
        try {
          await deleteObject(ref(storage, oldPath))
        } catch (deleteError) {
          console.error('Removing replaced payment QR image failed:', deleteError)
        }
      }
      setNotice(`${method === 'GCASH' ? 'GCash' : 'Maya'} QR code uploaded.`)
    } catch (uploadError) {
      console.error('Uploading payment QR code failed:', uploadError)
      if (uploadedRef) {
        try {
          await deleteObject(uploadedRef)
        } catch (cleanupError) {
          console.error('Cleaning up an unused payment QR image failed:', cleanupError)
        }
      }
      setError('Unable to upload the QR code. Please try again.')
    } finally {
      setUploadingMethod(null)
    }
  }

  return (
    <section className={styles.settingsPanel} aria-labelledby="checkout-settings-title">
      <div className={styles.settingsHeading}>
        <div><h2 id="checkout-settings-title">CUSTOMER CHECKOUT DETAILS</h2><p>Set the pickup location, schedule, payment details, and QR codes shown during checkout.</p></div>
      </div>
      {isLoading ? <p className={styles.settingsMessage}>Loading checkout settings...</p> : (
        <>
          <form className={styles.pickupForm} onSubmit={(event) => void saveStorefrontSettings(event)}>
            <label>Pickup location<input value={draft.pickupLocation} onChange={(event) => updateField('pickupLocation', event.target.value)} placeholder="Enter farm address or pickup instructions" /></label>
            <div className={styles.pickupSchedule}>
              <label>Pickup days<input value={draft.pickupDays} onChange={(event) => updateField('pickupDays', event.target.value)} placeholder="For example: Saturday–Sunday" /></label>
              <label>Pickup hours<input value={draft.pickupHours} onChange={(event) => updateField('pickupHours', event.target.value)} placeholder="For example: 8 AM–1 PM" /></label>
            </div>
            <div className={styles.qrSettings}>
              {(['GCASH', 'MAYA'] as const).map((method) => {
                const provider = method === 'GCASH' ? 'gcash' : 'maya'
                const accountNameField = `${provider}AccountName` as const
                const accountNumberField = `${provider}AccountNumber` as const
                return (
                  <div className={styles.paymentDetails} key={method}>
                    <strong>{method === 'GCASH' ? 'GCash' : 'Maya'} details</strong>
                    <label>Account name<input value={draft[accountNameField]} onChange={(event) => updateField(accountNameField, event.target.value)} placeholder="Account holder" /></label>
                    <label>Account number<input inputMode="tel" value={draft[accountNumberField]} onChange={(event) => updateField(accountNumberField, event.target.value)} placeholder="Account number" /></label>
                  </div>
                )
              })}
            </div>
            <button type="submit" disabled={isSaving}>{isSaving ? 'SAVING...' : 'SAVE PICKUP & PAYMENT DETAILS'}</button>
          </form>
          <div className={styles.qrSettings}>
            {(['GCASH', 'MAYA'] as const).map((method) => {
              const url = method === 'GCASH' ? settings.gcashQrUrl : settings.mayaQrUrl
              const title = method === 'GCASH' ? 'GCash QR code' : 'Maya QR code'
              return <div className={styles.qrSetting} key={method}>
                <div className={styles.qrPreview}>{url ? <img src={url} alt={`${title} preview`} /> : <span>No QR uploaded</span>}</div>
                <div><strong>{title}</strong><label className={styles.uploadButton}>{uploadingMethod === method ? 'UPLOADING...' : url ? 'REPLACE IMAGE' : 'UPLOAD IMAGE'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingMethod !== null} onChange={(event) => { void uploadQrCode(method, event.target.files?.[0]); event.currentTarget.value = '' }} /></label><small>JPG, PNG, or WebP, up to 5 MB.</small></div>
              </div>
            })}
          </div>
        </>
      )}
      {error && <p className={styles.settingsError} role="alert">{error}</p>}
      {notice && <p className={styles.settingsNotice} role="status">{notice}</p>}
    </section>
  )
}

type PaymentRecord = {
  firestoreId: string
  orderId: string
  customer: string
  customerEmail: string
  date: string
  items: string[]
  method: string
  paymentReceiptUrl: string
  amount: number
  // Firestore orders collection does not contain a separate payment status field.
  // We track the order fulfillment status here to calculate pending order totals.
  fulfillmentStatus: string
  createdAtDate: Date | null
}

function currency(value: number) {
  const safeValue = isNaN(value) || !isFinite(value) ? 0 : value
  return `₱${safeValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function parseOrderDate(createdAt: unknown): Date | null {
  if (!createdAt) return null
  if (typeof createdAt === 'object' && createdAt !== null) {
    if ('toDate' in createdAt && typeof (createdAt as { toDate: () => Date }).toDate === 'function') {
      return (createdAt as { toDate: () => Date }).toDate()
    }
    if ('seconds' in createdAt && typeof (createdAt as { seconds: number }).seconds === 'number') {
      return new Date((createdAt as { seconds: number }).seconds * 1000)
    }
  }
  if (typeof createdAt === 'string' || typeof createdAt === 'number') {
    const d = new Date(createdAt)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

function formatOrderDate(date: Date | null): string {
  if (!date) return 'Pending'
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const year = date.getFullYear()
  return `${month}-${day}-${year}`
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className={styles.summaryCard}>
      <h2>{label}</h2>
      <strong>{value}</strong>
    </article>
  )
}

function PaymentTable({
  records,
  isLoading,
  error,
  search,
}: {
  records: PaymentRecord[]
  isLoading: boolean
  error: string
  search: string
}) {
  return (
    <section className={styles.tablePanel}>
      <div className={styles.table} role="table" aria-label="Payment records">
        <div className={styles.tableRowHeader} role="row">
          <strong>ORDER</strong>
          <strong>CUSTOMER</strong>
          <strong>DATE</strong>
          <strong>ITEMS</strong>
          <strong>METHOD</strong>
          <strong>DIGITAL RECEIPT</strong>
          <strong>AMOUNT</strong>
        </div>
        {isLoading ? (
          <p className={styles.empty}>Loading payment records...</p>
        ) : error ? (
          <p className={styles.empty} role="alert">{error}</p>
        ) : records.length === 0 ? (
          <p className={styles.empty}>
            {search.trim() ? 'No payment records match your search.' : 'No payment records found.'}
          </p>
        ) : (
          records.map((payment) => (
            <div className={styles.tableRow} role="row" key={payment.firestoreId || payment.orderId}>
              <span>{payment.orderId}</span>
              <span>{payment.customer}</span>
              <span>{payment.date}</span>
              <span>{payment.items.length > 0 ? payment.items.join(', ') : '—'}</span>
              <span>{payment.method}</span>
              <span className={styles.receiptCell}>
                {payment.method === 'GCASH' || payment.method === 'MAYA'
                  ? payment.paymentReceiptUrl
                    ? <a href={payment.paymentReceiptUrl} target="_blank" rel="noreferrer" aria-label={`View payment receipt for order ${payment.orderId}`}><img src={payment.paymentReceiptUrl} alt={`Payment receipt for order ${payment.orderId}`} /><span>View receipt</span></a>
                    : <span className={styles.receiptMissing}>Not uploaded</span>
                  : <span className={styles.receiptNotRequired}>Not required</span>}
              </span>
              <strong>{currency(payment.amount)}</strong>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

export function AdminPaymentPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'orders'),
      (snapshot) => {
        const loadedPayments: PaymentRecord[] = snapshot.docs.map((orderDoc) => {
          const data = orderDoc.data()
          const parsedDate = parseOrderDate(data.createdAt)
          const rawItems = Array.isArray(data.items) ? data.items : []
          const items = rawItems.flatMap((item) => {
            if (!item || typeof item !== 'object') return []
            const itemData = item as Record<string, unknown>
            if (typeof itemData.name === 'string' && itemData.name.trim()) {
              return [itemData.name.trim().toUpperCase()]
            }
            return []
          })

          const method = typeof data.paymentMethod === 'string' && data.paymentMethod.trim()
            ? data.paymentMethod.trim().toUpperCase()
            : 'CASH'

          const rawStatus = typeof data.status === 'string' ? data.status.trim() : 'pending'

          return {
            firestoreId: orderDoc.id,
            orderId: typeof data.orderNumber === 'string' && data.orderNumber.trim() ? data.orderNumber : orderDoc.id,
            customer: typeof data.customerName === 'string' && data.customerName.trim() ? data.customerName : 'Unknown customer',
            customerEmail: typeof data.customerEmail === 'string' ? data.customerEmail.trim() : '',
            date: formatOrderDate(parsedDate),
            items,
            method,
            paymentReceiptUrl: typeof data.paymentReceiptUrl === 'string' ? data.paymentReceiptUrl : '',
            amount: typeof data.total === 'number' && !isNaN(data.total) ? data.total : 0,
            fulfillmentStatus: rawStatus,
            createdAtDate: parsedDate,
          }
        })

        // Sort newest orders first by createdAt
        loadedPayments.sort((a, b) => {
          const timeA = a.createdAtDate ? a.createdAtDate.getTime() : 0
          const timeB = b.createdAtDate ? b.createdAtDate.getTime() : 0
          return timeB - timeA
        })

        setPayments(loadedPayments)
        setError('')
        setIsLoading(false)
      },
      (loadError) => {
        console.error('Loading payment orders failed:', loadError)
        setError('Unable to load payment records. Please try again.')
        setIsLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  const visiblePayments = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return payments
    return payments.filter((payment) =>
      payment.orderId.toLowerCase().includes(query) ||
      payment.customer.toLowerCase().includes(query) ||
      payment.customerEmail.toLowerCase().includes(query)
    )
  }, [payments, search])

  const collected = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const pending = payments
  .filter((payment) => {
    const method = payment.method.toUpperCase()
    const status = payment.fulfillmentStatus.toUpperCase()

    if (method === 'COD') {
      return status !== 'DELIVERED'
    }

    return status === 'PENDING'
  })
  .reduce((sum, payment) => sum + payment.amount, 0)
  const average = payments.length > 0 ? collected / payments.length : 0

  return (
    <main className={styles.page}>
      <AdminSidebar active="orders" />
      <section className={styles.content}>
        <Header
          title="ORDERS"
          search={search}
          onSearchChange={(event) => setSearch(event.target.value)}
          actions={<><a href="#/admin/orders">CURRENT ORDERS</a><a href="#/admin/orders/archive">ARCHIVE</a><a aria-current="page" href="#/admin/payment">PAYMENT</a></>}
        />
        <div className={styles.dashboard}>
          <CheckoutSettingsPanel />
          <section className={styles.summary}>
            <SummaryCard label="TOTAL COLLECTED" value={currency(collected)} />
            <SummaryCard label="AVG TRANSACTION" value={currency(average)} />
            <SummaryCard label="PENDING REVENUE" value={currency(pending)} />
          </section>
          <PaymentTable
            records={visiblePayments}
            isLoading={isLoading}
            error={error}
            search={search}
          />
        </div>
      </section>
    </main>
  )
}
