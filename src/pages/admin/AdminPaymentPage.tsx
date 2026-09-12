import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import { db } from '../../firebase/firestore'
import styles from './AdminPaymentPage.module.css'

type PaymentRecord = {
  firestoreId: string
  orderId: string
  customer: string
  customerEmail: string
  date: string
  items: string[]
  method: string
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
    async function loadPayments() {
      try {
        const snapshot = await getDocs(collection(db, 'orders'))
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
      } catch (loadError) {
        console.error('Loading payment orders failed:', loadError)
        setError('Unable to load payment records. Please try again.')
      } finally {
        setIsLoading(false)
      }
    }

    void loadPayments()
  }, [])

  const visiblePayments = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return payments
    return payments.filter((payment) =>
      `${payment.orderId} ${payment.customer} ${payment.customerEmail} ${payment.date} ${payment.items.join(' ')} ${payment.method}`
        .toLowerCase()
        .includes(query)
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

