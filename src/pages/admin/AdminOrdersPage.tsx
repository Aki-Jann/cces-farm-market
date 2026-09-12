import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import { db } from '../../firebase/firestore'
import styles from './AdminOrdersPage.module.css'

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PACKED' | 'DELIVERED'
type OrderItem = { name: string; quantity: number; price: number }
type Order = {
  firestoreId: string
  id: string
  customer: string
  email: string
  date: string
  createdAtTime: number
  status: OrderStatus
  payment: string
  deliveryFee: number
  tax: number
  total: number
  address: string
  items: OrderItem[]
}

const statusOrder: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PACKED', 'DELIVERED']

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

function totals(order: Order) {
  return { delivery: order.deliveryFee, tax: order.tax, total: order.total }
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`${styles.statusBadge} ${styles[status.toLowerCase()]}`}>{status}</span>
}

function StatusTimeline({ status }: { status: OrderStatus }) {
  const currentIndex = statusOrder.indexOf(status)
  return (
    <div className={styles.timeline}>
      {statusOrder.map((item, index) => (
        <div className={`${styles.timelineStep} ${index <= currentIndex ? styles.reached : ''}`} key={item}>
          <span>{index + 1}</span><strong>{item}</strong>{index < statusOrder.length - 1 && <i />}
        </div>
      ))}
    </div>
  )
}

function OrderDetails({ order, onAdvance, onBack, isUpdating }: { order: Order; onAdvance: () => void; onBack: () => void; isUpdating: boolean }) {
  const { delivery, tax, total } = totals(order)
  const statusIndex = statusOrder.indexOf(order.status)
  const previousStatus = statusOrder[statusIndex - 1]
  const nextStatus = statusOrder[statusIndex + 1]
  return (
    <section className={styles.details}>
      <div className={styles.customer}>
        <div><h2>{order.customer}</h2><p>{order.id}</p><p>{order.date}</p><p>{order.email}</p></div>
        <StatusBadge status={order.status} />
      </div>
      <StatusTimeline status={order.status} />
      <div className={styles.items}>
        {order.items.map((item) => <div className={styles.itemRow} key={item.name}><span>{item.name}</span><span>{item.quantity}kg</span><span>{currency(item.price)}</span><strong>{currency(item.quantity * item.price)}</strong></div>)}
        <div className={styles.itemRow}><span>DELIVERY FEE</span><span>-</span><span>{currency(delivery)}</span><strong>{currency(delivery)}</strong></div>
        <div className={styles.itemRow}><span>TAX 5%</span><span>-</span><span>{currency(tax)}</span><strong>{currency(tax)}</strong></div>
        <div className={styles.totalRow}><strong>TOTAL</strong><strong>{currency(total)}</strong></div>
      </div>
      <div className={styles.detailFooter}>
        {previousStatus && (
          <button
            disabled={isUpdating}
            type="button"
            className={styles.completedButton}
            onClick={onBack}
          >
            {isUpdating ? 'UPDATING...' : previousStatus}
          </button>
        )}

        {nextStatus && (
          <button
            disabled={isUpdating}
            type="button"
            className={styles.nextButton}
            onClick={onAdvance}
          >
            {isUpdating ? 'UPDATING...' : nextStatus}
          </button>
        )}
      </div>
    </section>
  )
}

export function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [archive, setArchive] = useState(() => window.location.hash.replace(/^#\/?/, '') === 'admin/orders/archive')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const syncArchiveState = () => setArchive(window.location.hash.replace(/^#\/?/, '') === 'admin/orders/archive')
    window.addEventListener('hashchange', syncArchiveState)
    return () => window.removeEventListener('hashchange', syncArchiveState)
  }, [])
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'orders'),
      (snapshot) => {
        const loadedOrders = snapshot.docs.map((orderDocument) => {
          const data = orderDocument.data()
          const rawStatus = typeof data.status === 'string' ? data.status.toUpperCase() : 'PENDING'
          const status = statusOrder.includes(rawStatus as OrderStatus) ? rawStatus as OrderStatus : 'PENDING'
          const parsedDate = parseOrderDate(data.createdAt)
          const date = parsedDate ? parsedDate.toLocaleString('en-US') : 'Pending'
          const createdAtTime = parsedDate ? parsedDate.getTime() : 0
          const items = Array.isArray(data.items) ? data.items : []

          return {
            firestoreId: orderDocument.id,
            id: typeof data.orderNumber === 'string' ? data.orderNumber : orderDocument.id,
            customer: typeof data.customerName === 'string' ? data.customerName : 'Unknown customer',
            email: typeof data.customerEmail === 'string' ? data.customerEmail : '',
            date,
            createdAtTime,
            status,
            payment: typeof data.paymentMethod === 'string' ? data.paymentMethod : '',
            deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
            tax: typeof data.tax === 'number' ? data.tax : 0,
            total: typeof data.total === 'number' ? data.total : 0,
            address: typeof data.deliveryAddress === 'string' ? data.deliveryAddress : '',
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
        setSelectedId((current) => current ?? loadedOrders[0]?.id ?? null)
        setError('')
        setIsLoading(false)
      },
      (loadError) => {
        console.error('Loading admin orders failed:', loadError)
        setError('Unable to load orders. Please try again.')
        setIsLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])
  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase()
    return orders.filter((order) => {
      const matchesArchive = archive ? order.status === 'DELIVERED' : order.status !== 'DELIVERED'
      if (!matchesArchive) return false
      if (!query) return true
      return (
        order.id.toLowerCase().includes(query) ||
        order.customer.toLowerCase().includes(query) ||
        order.email.toLowerCase().includes(query)
      )
    })
  }, [archive, orders, search])
  const selected = visibleOrders.find((order) => order.id === selectedId) ?? visibleOrders[0]
  const counts = statusOrder.reduce<Record<OrderStatus, number>>((result, status) => ({ ...result, [status]: orders.filter((order) => order.status === status).length }), {} as Record<OrderStatus, number>)

  async function updateSelectedStatus(direction: -1 | 1) {
    if (!selected) return
    const targetStatus = statusOrder[statusOrder.indexOf(selected.status) + direction]
    if (!targetStatus) return
    setError('')
    setIsUpdating(true)
    try {
      await updateDoc(doc(db, 'orders', selected.firestoreId), { status: targetStatus.toLowerCase() })
      setOrders((current) => current.map((order) => order.id === selected.id ? { ...order, status: targetStatus } : order))
    } catch (updateError) {
      console.error('Updating order status failed:', updateError)
      setError('Unable to update the order status. Please try again.')
    } finally {
      setIsUpdating(false)
    }
  }

  function advanceSelected() {
    return updateSelectedStatus(1)
  }

  function reverseSelected() {
    return updateSelectedStatus(-1)
  }

  return (
    <main className={styles.page}>
      <AdminSidebar active="orders" />
      <section className={styles.content}>
        <Header
          title="ORDERS"
          search={search}
          onSearchChange={(event) => setSearch(event.target.value)}
          actions={<><button aria-current={!archive ? 'page' : undefined} type="button" onClick={() => setArchive(false)}>CURRENT ORDERS</button><button aria-current={archive ? 'page' : undefined} type="button" onClick={() => setArchive(true)}>ARCHIVE</button><a href="#/admin/payment">PAYMENT</a></>}
        />
        <div className={styles.dashboard}>
          <div className={styles.stats}>{statusOrder.map((status) => <div className={styles.stat} key={status}><strong>{counts[status]}</strong><span>{status}</span></div>)}</div>
          {error && orders.length > 0 && <p role="alert">{error}</p>}
          <div className={styles.ordersPanel}>
            {isLoading ? (
              <p className={styles.empty}>Loading orders...</p>
            ) : error && orders.length === 0 ? (
              <p className={styles.empty} role="alert">{error}</p>
            ) : visibleOrders.length === 0 ? (
              <p className={styles.empty}>{search.trim() ? 'No orders match your search.' : 'No orders found.'}</p>
            ) : (
              <>
                <aside className={styles.orderList}>
                  {visibleOrders.map((order) => (
                    <button
                      className={selected?.id === order.id ? styles.selected : ''}
                      type="button"
                      key={order.id}
                      onClick={() => setSelectedId(order.id)}
                    >
                      <div>
                        <strong>{order.customer}</strong>
                        <small>{order.id}</small>
                        <small>{order.date}</small>
                        <u>{order.email}</u>
                      </div>
                      <StatusBadge status={order.status} />
                      <b>{currency(totals(order).total)}</b>
                    </button>
                  ))}
                </aside>
                {selected && <OrderDetails order={selected} onAdvance={advanceSelected} onBack={reverseSelected} isUpdating={isUpdating} />}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
