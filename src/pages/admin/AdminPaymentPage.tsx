import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import { auth } from '../../firebase/auth'
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
  paymentStatus: string
  orderStatus: string
  amount: number
  createdAtDate: Date | null
}

function PaymentReviewActions({ payment }: { payment: PaymentRecord }) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [message, setMessage] = useState('')

  async function reviewPayment(decision: 'approve' | 'reject') {
    if (decision === 'reject' && !window.confirm(
      'Reject this receipt and cancel the pending order? Its inventory will be returned to stock.'
    )) {
      return
    }

    setIsUpdating(true)
    setMessage('')
    try {
      const reviewerId = auth.currentUser?.uid
      if (!reviewerId) throw new Error('Log in again before reviewing this payment.')
      const orderRef = doc(db, 'orders', payment.firestoreId)
      await runTransaction(db, async (transaction) => {
        const orderSnapshot = await transaction.get(orderRef)
        if (!orderSnapshot.exists()) throw new Error('The order could not be found.')
        const order = orderSnapshot.data()
        if (order.paymentStatus !== 'awaiting_verification') {
          throw new Error('This payment has already been reviewed.')
        }

        if (decision === 'approve') {
          transaction.update(orderRef, {
            paymentStatus: 'paid',
            paymentVerifiedAt: serverTimestamp(),
            paymentVerifiedBy: reviewerId,
          })
          return
        }

        if (order.status !== 'pending') {
          throw new Error('Only pending orders can be cancelled after a payment is rejected.')
        }
        if (!Array.isArray(order.items) || order.items.length === 0 || order.items.length > 5) {
          throw new Error('The order items are invalid; inventory was not changed.')
        }
        const items = order.items.map((item) => {
          if (
            !item ||
            typeof item !== 'object' ||
            typeof item.productId !== 'string' ||
            !item.productId ||
            !Number.isInteger(item.quantity) ||
            item.quantity < 1
          ) {
            throw new Error('The order items are invalid; inventory was not changed.')
          }
          return { productId: item.productId, quantity: item.quantity }
        })
        if (new Set(items.map((item) => item.productId)).size !== items.length) {
          throw new Error('The order contains duplicate products; inventory was not changed.')
        }

        const productRefs = items.map(({ productId }) => doc(db, 'products', productId))
        const productSnapshots = await Promise.all(productRefs.map((productRef) => transaction.get(productRef)))
        productSnapshots.forEach((productSnapshot, index) => {
          if (!productSnapshot.exists()) {
            throw new Error('Inventory could not be restored because a product is missing.')
          }
          const item = items[index]
          const product = productSnapshot.data()
          const stock = typeof product.stock === 'number' && Number.isFinite(product.stock)
            ? product.stock
            : 0
          const sold = typeof product.sold === 'number' && Number.isFinite(product.sold)
            ? product.sold
            : 0
          transaction.update(productRefs[index], {
            stock: stock + item.quantity,
            sold: Math.max(0, sold - item.quantity),
            checkoutOrderId: orderRef.id,
            checkoutQuantity: item.quantity,
            checkoutAction: 'refund',
          })
        })
        transaction.update(orderRef, {
          status: 'cancelled',
          paymentStatus: 'rejected',
          paymentRejectedAt: serverTimestamp(),
          paymentRejectedBy: reviewerId,
        })
      })
      setMessage(decision === 'approve'
        ? 'Payment verified.'
        : 'Payment rejected. The order was cancelled and inventory restored.')
    } catch (reviewError) {
      console.error('Reviewing online payment failed:', reviewError)
      setMessage(reviewError instanceof Error
        ? reviewError.message
        : 'Unable to update payment status. Please try again.')
    } finally {
      setIsUpdating(false)
    }
  }

  if (
    !['GCASH', 'MAYA'].includes(payment.method) ||
    payment.paymentStatus !== 'awaiting_verification' ||
    !payment.paymentReceiptUrl
  ) return null

  return (
    <>
      <span className={styles.reviewActions}>
        <button
          type="button"
          className={styles.reviewButton}
          disabled={isUpdating}
          onClick={() => void reviewPayment('approve')}
        >
          {isUpdating ? 'UPDATING...' : 'VERIFY'}
        </button>
        <button
          type="button"
          className={`${styles.reviewButton} ${styles.rejectButton}`}
          disabled={isUpdating || payment.orderStatus !== 'pending'}
          onClick={() => void reviewPayment('reject')}
        >
          REJECT & CANCEL
        </button>
      </span>
      {payment.orderStatus !== 'pending' && (
        <span className={styles.reviewMessage}>Only pending orders can be rejected.</span>
      )}
      {message && <span className={styles.reviewMessage} role="status">{message}</span>}
    </>
  )
}

function CodPaymentAction({ payment }: { payment: PaymentRecord }) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [message, setMessage] = useState('')

  async function markAsPaid() {
    setIsUpdating(true)
    setMessage('')
    try {
      const verifierId = auth.currentUser?.uid
      if (!verifierId) throw new Error('Log in again before updating this payment.')
      const orderRef = doc(db, 'orders', payment.firestoreId)
      await runTransaction(db, async (transaction) => {
        const orderSnapshot = await transaction.get(orderRef)
        if (!orderSnapshot.exists()) throw new Error('The order could not be found.')
        const order = orderSnapshot.data()
        const orderStatus = typeof order.status === 'string' ? order.status.toLowerCase() : ''
        if (normalizePaymentMethod(order.paymentMethod ?? '') !== 'COD') {
          throw new Error('Only COD orders can be marked as paid.')
        }
        if (order.paymentStatus !== 'unpaid') {
          throw new Error('This payment is no longer unpaid.')
        }
        if (!['pending', 'confirmed', 'packed', 'delivered'].includes(orderStatus)) {
          throw new Error('Cancelled or rejected orders cannot be marked as paid.')
        }

        transaction.update(orderRef, {
          paymentStatus: 'paid',
          paymentVerifiedAt: serverTimestamp(),
          paymentVerifiedBy: verifierId,
        })
      })
      setMessage('COD payment marked as paid.')
    } catch (paymentError) {
      console.error('Marking COD payment as paid failed:', paymentError)
      setMessage(paymentError instanceof Error
        ? paymentError.message
        : 'Unable to update payment status. Please try again.')
    } finally {
      setIsUpdating(false)
    }
  }

  const orderStatus = payment.orderStatus.toLowerCase()
  const canMarkAsPaid = payment.method === 'COD' &&
    payment.paymentStatus === 'unpaid' &&
    ['pending', 'confirmed', 'packed', 'delivered'].includes(orderStatus)

  if (!canMarkAsPaid && !message) return null

  return (
    <>
      {canMarkAsPaid && (
        <button
          type="button"
          className={styles.reviewButton}
          disabled={isUpdating}
          onClick={() => void markAsPaid()}
        >
          {isUpdating ? 'UPDATING...' : 'MARK AS PAID'}
        </button>
      )}
      {message && <span className={styles.reviewMessage} role="status">{message}</span>}
    </>
  )
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
          <strong>DIGITAL RECEIPT / REVIEW</strong>
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
                    ? <a href={payment.paymentReceiptUrl} target="_blank" rel="noreferrer" aria-label={`View payment receipt for order ${payment.orderId}`}>View receipt</a>
                    : <span className={styles.receiptMissing}>Not uploaded</span>
                  : <span className={styles.receiptNotRequired}>Not required</span>}
                <span className={styles.paymentStatus}>{payment.paymentStatus.replaceAll('_', ' ')}</span>
                <PaymentReviewActions payment={payment} />
                <CodPaymentAction payment={payment} />
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
            paymentStatus: typeof data.paymentStatus === 'string' ? data.paymentStatus : 'unpaid',
            orderStatus: typeof data.status === 'string' ? data.status : 'pending',
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
