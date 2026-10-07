import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import { db } from '../../firebase/firestore'
import { formatMonthDayYear } from '../../utils/dateFormat'
import styles from './AdminPaymentPage.module.css'

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
  return date ? formatMonthDayYear(date) : 'Pending'
}

function normalizePaymentMethod(method: string): string {
  const normalized = method.trim().toUpperCase()
  return normalized === 'PAYMAYA' ? 'MAYA' : normalized
}

function PaymentTable({
  records,
  isLoading,
  error,
  search,
  selectedMethod,
}: {
  records: PaymentRecord[]
  isLoading: boolean
  error: string
  search: string
  selectedMethod: string | null
}) {
  return (
    <div className={styles.tableViewport}>
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
            {search.trim() || selectedMethod ? 'No payment records match these filters.' : 'No payment records found.'}
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
    </div>
  )
}

export function AdminPaymentPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null)

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
            ? normalizePaymentMethod(data.paymentMethod)
            : 'CASH'

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
    return payments.filter((payment) =>
      (!selectedMethod || payment.method === selectedMethod) &&
      (!query ||
        payment.orderId.toLowerCase().includes(query) ||
        payment.customer.toLowerCase().includes(query) ||
        payment.customerEmail.toLowerCase().includes(query))
    )
  }, [payments, search, selectedMethod])
  const paymentMethods = useMemo(() => [...new Set(['COD', 'GCASH', 'MAYA', ...payments.map((payment) => payment.method)])]
    .sort((a, b) => {
      const methodOrder = ['COD', 'GCASH', 'MAYA', 'CASH']
      const aOrder = methodOrder.indexOf(a)
      const bOrder = methodOrder.indexOf(b)
      if (aOrder === -1 && bOrder === -1) return a.localeCompare(b)
      if (aOrder === -1) return 1
      if (bOrder === -1) return -1
      return aOrder - bOrder
    }), [payments])

  return (
    <main className={styles.page}>
      <AdminSidebar active="payments" />
      <section className={styles.content}>
        <Header
          title="PAYMENTS"
          search={search}
          onSearchChange={(event) => setSearch(event.target.value)}
        />
        <div className={styles.dashboard}>
          <section className={styles.pageIntro} aria-label="Payments overview">
            <span>TRANSACTION REVIEW</span>
            <h2>Payment records</h2>
            <p>Review order payment methods, submitted receipts, and transaction amounts.</p>
          </section>
          <section className={styles.paymentPanel} aria-label="Payment records and filters">
            <nav className={styles.methodFilters} aria-label="Filter payments by method">
              <span className={styles.filterLabel}>PAYMENT METHOD</span>
              <div className={styles.filterButtons}>
                <button
                  aria-pressed={selectedMethod === null}
                  className={selectedMethod === null ? styles.activeFilter : ''}
                  onClick={() => setSelectedMethod(null)}
                  type="button"
                >
                  ALL <span>{payments.length}</span>
                </button>
                {paymentMethods.map((method) => (
                  <button
                    aria-pressed={selectedMethod === method}
                    className={selectedMethod === method ? styles.activeFilter : ''}
                    key={method}
                    onClick={() => setSelectedMethod((current) => current === method ? null : method)}
                    type="button"
                  >
                    {method} <span>{payments.filter((payment) => payment.method === method).length}</span>
                  </button>
                ))}
              </div>
            </nav>
            <PaymentTable
              records={visiblePayments}
              isLoading={isLoading}
              error={error}
              search={search}
              selectedMethod={selectedMethod}
            />
          </section>
        </div>
      </section>
    </main>
  )
}
