import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { CustomerSidebar } from '../../components/layout/CustomerSidebar'
import { Header } from '../../components/layout/Header'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import styles from './OrdersPage.module.css'

type OrderStatus = 'DELIVERED' | 'PENDING' | 'CONFIRMED' | 'PACKED'

type Order = {
  id: string
  date: string
  createdAtTime: number
  total: number
  payment: string
  status: OrderStatus
  deliveryFee: number
  tax: number
  items: { name: string; quantity: number; price: number }[]
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

export function OrderDetails({ order }: { order: Order }) {
  const delivery = order.deliveryFee
  const tax = order.tax

  return (
    <div className={styles.details}>
      <div className={styles.detailTable}>
        <div className={styles.detailHeader}><span>PRODUCT NAME</span><span>QTY</span><span>PRICE</span><span>TOTAL PRICE</span></div>
        {order.items.map((item) => (
          <div className={styles.detailRow} key={item.name}>
            <span>{item.name}</span><span>{item.quantity}</span><span>{currency(item.price)}</span><strong>{currency(item.price * item.quantity)}</strong>
          </div>
        ))}
        <div className={styles.detailRow}><span>Delivery Fee</span><span>-</span><span>{currency(delivery)}</span><strong>{currency(delivery)}</strong></div>
        <div className={styles.detailRow}><span>Tax</span><span>5%</span><span>{currency(tax)}</span><strong>{currency(tax)}</strong></div>
        <div className={styles.detailTotal}><strong>TOTAL</strong><strong>{currency(order.total)}</strong></div>
      </div>
    </div>
  )
}

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const emptyState = window.location.hash.includes('empty')
  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return orders
    return orders.filter((order) =>
      order.id.toLowerCase().includes(query) ||
      order.items.some((item) => item.name.toLowerCase().includes(query)) ||
      order.payment.toLowerCase().includes(query) ||
      order.status.toLowerCase().includes(query)
    )
  }, [orders, search])

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
            const date = parsedDate ? parsedDate.toLocaleDateString('en-US') : 'Pending'
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
              id: typeof data.orderNumber === 'string' ? data.orderNumber : orderDocument.id,
              date,
              createdAtTime,
              total: typeof data.total === 'number' ? data.total : 0,
              payment: typeof data.paymentMethod === 'string' ? data.paymentMethod : '',
              status,
              deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
              tax: typeof data.tax === 'number' ? data.tax : 0,
              items: items.flatMap((item) => {
                if (!item || typeof item !== 'object') return []
                const itemData = item as Record<string, unknown>
                return [{
                  name: typeof itemData.name === 'string' ? itemData.name : 'Product',
                  quantity: typeof itemData.quantity === 'number' ? itemData.quantity : 0,
                  price: typeof itemData.price === 'number' ? itemData.price : 0,
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

  return (
    <main className={styles.ordersPage}>
      <CustomerSidebar active="orders" />
      <section className={styles.ordersContent}>
        <Header title="ORDERS" search={search} onSearchChange={(event) => setSearch(event.target.value)} />
        <section className={styles.orderPanel}>
          <div className={styles.tableHeader}><span>Order ID</span><span>Date</span><span>Total</span><span>Payment</span><span>Order Status</span></div>
          {isLoading ? (
            <div className={styles.emptyState}>Loading orders...</div>
          ) : error ? (
            <div className={styles.emptyState} role="alert">{error}</div>
          ) : emptyState || visibleOrders.length === 0 ? (
            <div className={styles.emptyState}>
              <strong>{search.trim() ? 'No Matching Orders' : 'No Orders Yet'}</strong>
              {!search.trim() && <a href="#/shop">SHOP</a>}
            </div>
          ) : (
            <div className={styles.orderList}>
              {visibleOrders.map((order) => (
                <div className={styles.orderGroup} key={order.id}>
                  <button className={styles.orderRow} type="button" onClick={() => setSelectedId(selectedId === order.id ? null : order.id)}>
                    <strong>{order.id}</strong><span>{order.date}</span><strong className={styles.green}>{currency(order.total)}</strong><strong>{order.payment}</strong><span className={`${styles.status} ${order.status === 'DELIVERED' ? styles.delivered : styles.pending}`}>{order.status}</span>
                  </button>
                  {selectedId === order.id && <OrderDetails order={order} />}
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
