import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { CustomerSidebar } from '../../components/layout/CustomerSidebar'
import { Header } from '../../components/layout/Header'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import { formatMonthDayYear } from '../../utils/dateFormat'
import styles from './OrdersPage.module.css'

type OrderStatus = 'DELIVERED' | 'PENDING' | 'CONFIRMED' | 'PACKED'
type OrderStatusFilter = 'ALL' | OrderStatus

const orderFilters: { value: OrderStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All orders' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PACKED', label: 'Packed' },
  { value: 'DELIVERED', label: 'Delivered' },
]

type Order = {
  firestoreId: string
  id: string
  date: string
  createdAtTime: number
  total: number
  payment: string
  fulfillmentType: 'delivery' | 'pickup'
  address: string
  pickupDays: string
  pickupHours: string
  sellerNotes: string
  paymentReceiptUrl: string
  status: OrderStatus
  deliveryConfirmed: boolean
  deliveryFee: number
  tax: number
  items: { productId: string; name: string; quantity: number; price: number; unit: string }[]
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

function currency(value: number) {
  return `₱${value.toFixed(2)}`
}

function isOnlinePayment(payment: string) {
  const normalizedPayment = payment.trim().toUpperCase()
  return normalizedPayment === 'GCASH' || normalizedPayment === 'MAYA' || normalizedPayment === 'PAYMAYA'
}

function ProductReview({ order, item }: { order: Order; item: Order['items'][number] }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasReview, setHasReview] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    void getDoc(doc(db, 'products', item.productId, 'reviews', order.firestoreId))
      .then((review) => {
        if (!isMounted) return
        if (review.exists()) {
          const data = review.data()
          setRating(typeof data.rating === 'number' ? data.rating : 0)
          setComment(typeof data.comment === 'string' ? data.comment : '')
          setHasReview(true)
        }
        setIsLoading(false)
      })
      .catch((loadError) => {
        console.error('Loading product review failed:', loadError)
        if (isMounted) {
          setError('Unable to load this review. Please try again.')
          setIsLoading(false)
        }
      })

    return () => { isMounted = false }
  }, [item.productId, order.firestoreId])

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!auth.currentUser) {
      setError('Please sign in again before submitting your review.')
      return
    }
    if (rating < 1 || rating > 5 || hasReview) return
    setIsSaving(true)
    setError('')

    try {
      await setDoc(doc(db, 'products', item.productId, 'reviews', order.firestoreId), {
        orderId: order.firestoreId,
        productId: item.productId,
        orderItem: {
          productId: item.productId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          unit: item.unit,
        },
        userId: auth.currentUser.uid,
        rating,
        comment: comment.trim(),
        createdAt: serverTimestamp(),
      })
      setHasReview(true)
    } catch (saveError) {
      console.error('Submitting product review failed:', saveError)
      setError('Unable to submit your review. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <p className={styles.reviewLoading}>Loading review form...</p>
  if (hasReview) {
    return (
      <div className={styles.submittedReview} role="status">
        <span aria-label={`Your rating: ${rating} out of 5`} className={styles.reviewStars}>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</span>
        <span>{comment || 'Thanks for your review.'}</span>
      </div>
    )
  }

  return (
    <form className={styles.reviewForm} onSubmit={submitReview}>
      <label>Rate {item.name}</label>
      <div className={styles.starPicker} role="group" aria-label={`Rate ${item.name}`}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            className={score <= rating ? styles.selectedStar : ''}
            aria-label={`${score} star${score === 1 ? '' : 's'}`}
            aria-pressed={rating === score}
            onClick={() => setRating(score)}
          >★</button>
        ))}
      </div>
      <textarea
        aria-label={`Write a review for ${item.name}`}
        maxLength={1000}
        placeholder="Share a few words about this product (optional)"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
      {error && <p className={styles.reviewError} role="alert">{error}</p>}
      <button className={styles.submitReview} disabled={isSaving || rating === 0} type="submit">
        {isSaving ? 'SENDING...' : 'SEND REVIEW'}
      </button>
    </form>
  )
}

export function OrderDetails({
  order,
  onConfirmDelivery,
  isConfirmingDelivery,
  deliveryError,
}: {
  order: Order
  onConfirmDelivery: () => void
  isConfirmingDelivery: boolean
  deliveryError: string
}) {
  const delivery = order.deliveryFee
  const tax = order.tax

  return (
    <div className={styles.details}>
      <div className={styles.detailsHeading}>
        <div>
          <h2>Order details</h2>
          <p>{order.items.length} {order.items.length === 1 ? 'item' : 'items'}</p>
        </div>
        <strong className={`${styles.detailsStatus} ${styles[order.status.toLowerCase()]}`}>{order.status}</strong>
      </div>
      <div className={styles.detailMeta}>
        <div><span>FULFILLMENT</span><strong>{order.fulfillmentType === 'pickup' ? 'Pickup' : 'Delivery'}</strong></div>
        <div><span>PAYMENT</span><strong>{order.payment || 'Not specified'}</strong></div>
      </div>
      <p className={styles.detailNote}>
        <strong>{order.fulfillmentType === 'pickup' ? 'Pickup location' : 'Delivery address'}</strong>
        <span>{order.address || 'Not provided'}</span>
      </p>
      {order.fulfillmentType === 'pickup' && order.pickupDays && <p className={styles.detailNote}><strong>Pickup days</strong><span>{order.pickupDays}</span></p>}
      {order.fulfillmentType === 'pickup' && order.pickupHours && <p className={styles.detailNote}><strong>Pickup hours</strong><span>{order.pickupHours}</span></p>}
      {order.sellerNotes && <p className={styles.detailNote}><strong>Note to seller</strong><span>{order.sellerNotes}</span></p>}
      {order.paymentReceiptUrl && <a className={styles.receiptLink} href={order.paymentReceiptUrl} target="_blank" rel="noreferrer">View payment receipt</a>}
      <div className={styles.detailTable}>
        <div className={styles.detailHeader}><span>ITEM</span><span>QTY</span><span>PRICE</span><span>AMOUNT</span></div>
        {order.items.map((item) => (
          <div className={styles.detailRow} key={`${item.name}-${item.unit}`}>
            <span>{item.name}</span><span>{item.quantity} {item.unit}</span><span>{currency(item.price)}</span><strong>{currency(item.price * item.quantity)}</strong>
          </div>
        ))}
        {delivery > 0 && <div className={styles.detailRow}><span>Delivery fee</span><span>-</span><span>-</span><strong>{currency(delivery)}</strong></div>}
        <div className={styles.detailRow}><span>Tax</span><span>5%</span><span>-</span><strong>{currency(tax)}</strong></div>
        <div className={styles.detailTotal}><span>Total</span><strong>{currency(order.total)}</strong></div>
      </div>
      {order.status === 'DELIVERED' && !order.deliveryConfirmed && (
        <div className={styles.deliveryConfirmation}>
          <p>Have you received your order?</p>
          <button type="button" disabled={isConfirmingDelivery} onClick={onConfirmDelivery}>
            {isConfirmingDelivery ? 'CONFIRMING...' : 'CONFIRM DELIVERY'}
          </button>
          {deliveryError && <p role="alert">{deliveryError}</p>}
        </div>
      )}
      {order.status === 'DELIVERED' && order.deliveryConfirmed && (
        <section className={styles.reviews}>
          <h3>Rate your products</h3>
          <p>Your feedback helps other buyers discover great products.</p>
          {order.items.map((item) => (
            item.productId
              ? <ProductReview key={`${item.productId}-${item.name}`} order={order} item={item} />
              : <p className={styles.reviewLoading} key={item.name}>This order item cannot be linked to a product for review.</p>
          ))}
        </section>
      )}
    </div>
  )
}

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null)
  const [deliveryError, setDeliveryError] = useState<{ orderId: string; message: string } | null>(null)
  const emptyState = window.location.hash.includes('empty')
  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase()
    return orders.filter((order) =>
      (statusFilter === 'ALL' || order.status === statusFilter) &&
      (!query ||
        order.id.toLowerCase().includes(query) ||
        order.items.some((item) => item.name.toLowerCase().includes(query)) ||
        order.payment.toLowerCase().includes(query) ||
        order.status.toLowerCase().includes(query))
    )
  }, [orders, search, statusFilter])

  function countOrders(filter: OrderStatusFilter) {
    return filter === 'ALL' ? orders.length : orders.filter((order) => order.status === filter).length
  }

  useEffect(() => {
    let isMounted = true
    let unsubscribeOrders: (() => void) | undefined

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      // Tear down any previous orders listener before attaching a new one.
      if (unsubscribeOrders) {
        unsubscribeOrders()
        unsubscribeOrders = undefined
      }

      if (!user) {
        if (isMounted) {
          setIsLoading(false)
          setError('Please log in to view your orders.')
        }
        return
      }

      unsubscribeOrders = onSnapshot(
        query(collection(db, 'orders'), where('userId', '==', user.uid)),
        (snapshot) => {
          if (!isMounted) return
          const loadedOrders = snapshot.docs.map((orderDocument) => {
            const data = orderDocument.data()
            const parsedDate = parseOrderDate(data.createdAt)
            const date = parsedDate ? formatMonthDayYear(parsedDate) : 'Pending'
            const createdAtTime = parsedDate ? parsedDate.getTime() : 0
            const items = Array.isArray(data.items) ? data.items : []

            const status: OrderStatus = data.status === 'delivered'
              ? 'DELIVERED'
              : data.status === 'confirmed'
                ? 'CONFIRMED'
                : data.status === 'packed'
                  ? 'PACKED'
                  : 'PENDING'

            return {
              firestoreId: orderDocument.id,
              id: typeof data.orderNumber === 'string' ? data.orderNumber : orderDocument.id,
              date,
              createdAtTime,
              total: typeof data.total === 'number' ? data.total : 0,
              payment: typeof data.paymentMethod === 'string' ? data.paymentMethod : '',
              fulfillmentType: data.fulfillmentType === 'pickup' ? 'pickup' as const : 'delivery' as const,
              address: typeof data.deliveryAddress === 'string' ? data.deliveryAddress : '',
              pickupDays: typeof data.pickupDays === 'string' ? data.pickupDays : '',
              pickupHours: typeof data.pickupHours === 'string' ? data.pickupHours : '',
              sellerNotes: typeof data.sellerNotes === 'string' ? data.sellerNotes : '',
              paymentReceiptUrl: typeof data.paymentReceiptUrl === 'string' ? data.paymentReceiptUrl : '',
              status,
              deliveryConfirmed: data.deliveryConfirmed === true,
              deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
              tax: typeof data.tax === 'number' ? data.tax : 0,
              items: items.flatMap((item) => {
                if (!item || typeof item !== 'object') return []
                const itemData = item as Record<string, unknown>
                return [{
                  productId: typeof itemData.productId === 'string' ? itemData.productId : '',
                  name: typeof itemData.name === 'string' ? itemData.name : 'Product',
                  quantity: typeof itemData.quantity === 'number' ? itemData.quantity : 0,
                  price: typeof itemData.price === 'number' ? itemData.price : 0,
                  unit: typeof itemData.unit === 'string' ? itemData.unit : 'kg',
                }]
              }),
            }
          })

          loadedOrders.sort((a, b) => b.createdAtTime - a.createdAtTime)
          setOrders(loadedOrders)
          setError('')
          setIsLoading(false)
        },
        (loadError) => {
          console.error('Loading orders failed:', loadError)
          if (isMounted) {
            setError('Unable to load your orders. Please try again.')
            setIsLoading(false)
          }
        }
      )
    })

    return () => {
      isMounted = false
      unsubscribeAuth()
      if (unsubscribeOrders) unsubscribeOrders()
    }
  }, [])

  async function confirmDelivery(order: Order) {
    if (!auth.currentUser || order.deliveryConfirmed || order.status !== 'DELIVERED') return
    setConfirmingOrderId(order.firestoreId)
    setDeliveryError(null)
    try {
      await updateDoc(doc(db, 'orders', order.firestoreId), {
        deliveryConfirmed: true,
        deliveryConfirmedAt: serverTimestamp(),
      })
    } catch (confirmError) {
      console.error('Confirming order delivery failed:', confirmError)
      setDeliveryError({ orderId: order.firestoreId, message: 'Unable to confirm delivery. Please try again.' })
    } finally {
      setConfirmingOrderId(null)
    }
  }

  return (
    <main className={styles.ordersPage}>
      <CustomerSidebar active="orders" />
      <section className={styles.ordersContent}>
        <Header title="ORDERS" search={search} onSearchChange={(event) => setSearch(event.target.value)} />
        <section className={styles.orderPanel}>
          <nav className={styles.statusFilters} aria-label="Filter orders by status">
            {orderFilters.map((filter) => (
              <button
                className={statusFilter === filter.value ? styles.activeFilter : ''}
                type="button"
                key={filter.value}
                aria-pressed={statusFilter === filter.value}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
                <span>{countOrders(filter.value)}</span>
              </button>
            ))}
          </nav>
          <div className={styles.tableHeader}>
            <span>Order ID</span><span>Date</span><span>Total</span><span>Payment</span><span>Order status</span><span>Digital receipt</span>
          </div>
          {isLoading ? (
            <div className={styles.emptyState}>Loading orders...</div>
          ) : error ? (
            <div className={styles.emptyState} role="alert">{error}</div>
          ) : emptyState || visibleOrders.length === 0 ? (
            search.trim() || statusFilter !== 'ALL' ? (
              <div className={`${styles.emptyState} ${styles.noMatches}`} role="status" aria-live="polite">
                <span className={styles.emptyIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>
                </span>
                <div className={styles.emptyCopy}>
                  <strong>No {statusFilter === 'ALL' ? 'matching orders' : statusFilter.toLowerCase() + ' orders'}</strong>
                  <p>{search.trim()
                    ? `No orders match “${search.trim()}”${statusFilter !== 'ALL' ? ` in ${statusFilter.toLowerCase()} status` : ''}.`
                    : `You don't have any ${statusFilter.toLowerCase()} orders right now.`}</p>
                </div>
                <button
                  className={styles.clearSearchButton}
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setStatusFilter('ALL')
                  }}
                >{search.trim() ? 'Clear filters' : 'View all orders'}</button>
              </div>
            ) : (
              <div className={styles.emptyState}>
                <strong>No Orders Yet</strong>
                <a href="#/shop">SHOP</a>
              </div>
            )
          ) : (
            <div className={styles.orderList}>
              {visibleOrders.map((order) => (
                <div className={styles.orderGroup} key={order.id}>
                  <div className={styles.orderLine}>
                    <button className={styles.orderRow} type="button" aria-expanded={selectedId === order.id} onClick={() => setSelectedId(selectedId === order.id ? null : order.id)}>
                      <strong className={styles.orderId}>{order.id}</strong>
                      <span className={styles.orderDate}>{order.date}</span>
                      <strong className={`${styles.green} ${styles.orderTotal}`}>{currency(order.total)}</strong>
                      <span className={styles.orderPayment}>{order.payment || 'Not specified'}</span>
                      <span className={`${styles.status} ${styles[order.status.toLowerCase()]}`}>{order.status}</span>
                    </button>
                    <span className={styles.receiptColumn}>
                      {isOnlinePayment(order.payment)
                        ? order.paymentReceiptUrl
                          ? <a className={styles.receiptAction} href={order.paymentReceiptUrl} target="_blank" rel="noreferrer" aria-label={`View digital receipt for order ${order.id}`}>View receipt</a>
                          : <span className={styles.receiptPending}>Not uploaded</span>
                        : <span className={styles.receiptNotNeeded}>—</span>}
                    </span>
                  </div>
                  {selectedId === order.id && (
                    <OrderDetails
                      order={order}
                      onConfirmDelivery={() => void confirmDelivery(order)}
                      isConfirmingDelivery={confirmingOrderId === order.firestoreId}
                      deliveryError={deliveryError?.orderId === order.firestoreId ? deliveryError.message : ''}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
