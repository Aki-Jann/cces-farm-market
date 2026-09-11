import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { CustomerSidebar } from '../../components/layout/CustomerSidebar'
import { Header } from '../../components/layout/Header'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import styles from './OrdersPage.module.css'

type OrderStatus = 'DELIVERED' | 'PENDING' | 'CONFIRMED' | 'PACKED'

type Order = {
  id: string
  date: string
  total: number
  payment: string
  status: OrderStatus
  deliveryFee: number
  tax: number
  items: { name: string; quantity: number; price: number }[]
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
  const visibleOrders = useMemo(() => orders.filter((order) => order.id.toLowerCase().includes(search.toLowerCase())), [orders, search])

  useEffect(() => {
    async function loadOrders() {
      const user = auth.currentUser
      if (!user) {
        setIsLoading(false)
        setError('Please log in to view your orders.')
        return
      }

      try {
        const snapshot = await getDocs(query(collection(db, 'orders'), where('userId', '==', user.uid)))
        setOrders(snapshot.docs.map((orderDocument) => {
          const data = orderDocument.data()
          const createdAt = data.createdAt
          const date = createdAt && typeof createdAt === 'object' && 'toDate' in createdAt && typeof createdAt.toDate === 'function'
            ? createdAt.toDate().toLocaleDateString('en-US')
            : 'Pending'
          const items = Array.isArray(data.items) ? data.items : []

          return {
            id: typeof data.orderNumber === 'string' ? data.orderNumber : orderDocument.id,
            date,
            total: typeof data.total === 'number' ? data.total : 0,
            payment: typeof data.paymentMethod === 'string' ? data.paymentMethod : '',
            status: data.status === 'delivered'
              ? 'DELIVERED'
              : data.status === 'confirmed'
                ? 'CONFIRMED'
                : data.status === 'packed'
                  ? 'PACKED'
                  : 'PENDING',
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
        }))
      } catch (loadError) {
        console.error('Loading orders failed:', loadError)
        setError('Unable to load your orders. Please try again.')
      } finally {
        setIsLoading(false)
      }
    }

    void loadOrders()
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
              <strong>No Orders Yet</strong>
              <a href="#/shop">SHOP</a>
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
