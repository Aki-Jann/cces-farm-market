import { useMemo, useState } from 'react'
import { AdminSidebar } from './AdminSidebar'
import styles from './AdminOrdersPage.module.css'

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PACKED' | 'DELIVERED'
type OrderItem = { name: string; quantity: number; price: number }
type Order = {
  id: string
  customer: string
  email: string
  date: string
  status: OrderStatus
  payment: string
  items: OrderItem[]
}

const statusOrder: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PACKED', 'DELIVERED']
const mockOrders: Order[] = [
  {
    id: 'ORD-0001',
    customer: 'Jasmien Pajiji',
    email: 'email@gmail.com',
    date: '09-02-2026',
    status: 'PENDING',
    payment: 'COD',
    items: [{ name: 'APPLE', quantity: 2, price: 100 }, { name: 'BANANA', quantity: 1, price: 100 }, { name: 'BELL PEPPER', quantity: 1, price: 100 }],
  },
  {
    id: 'ORD-0002',
    customer: 'Aaron Enriquez',
    email: 'email@gmail.com',
    date: '09-02-2026',
    status: 'PENDING',
    payment: 'GCASH',
    items: [{ name: 'APPLE', quantity: 1, price: 100 }, { name: 'BELL PEPPER', quantity: 1, price: 100 }],
  },
  {
    id: 'ORD-0003',
    customer: 'Stephen David',
    email: 'email@gmail.com',
    date: '09-02-2026',
    status: 'CONFIRMED',
    payment: 'COD',
    items: [{ name: 'CABBAGE', quantity: 2, price: 100 }],
  },
  {
    id: 'ORD-0004',
    customer: 'Abdullah Ratag',
    email: 'email@gmail.com',
    date: '09-02-2026',
    status: 'DELIVERED',
    payment: 'COD',
    items: [{ name: 'BANANA', quantity: 2, price: 100 }],
  },
]

function currency(value: number) {
  return `₱${value.toFixed(2)}`
}

function totals(order: Order) {
  const subtotal = order.items.reduce((sum, item) => sum + item.quantity * item.price, 0)
  const delivery = 100
  const tax = subtotal * 0.05
  return { subtotal, delivery, tax, total: subtotal + delivery + tax }
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

function OrderDetails({ order, onAdvance }: { order: Order; onAdvance: () => void }) {
  const { delivery, tax, total } = totals(order)
  const nextStatus = statusOrder[statusOrder.indexOf(order.status) + 1]
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
      <div className={styles.detailFooter}><span>Payment: <strong>{order.payment}</strong></span>{nextStatus && <button type="button" onClick={onAdvance}>{nextStatus}</button>}</div>
    </section>
  )
}

export function AdminOrdersPage() {
  const [orders, setOrders] = useState(mockOrders)
  const [selectedId, setSelectedId] = useState(mockOrders[0].id)
  const [archive, setArchive] = useState(false)
  const [search, setSearch] = useState('')
  const selected = orders.find((order) => order.id === selectedId) ?? orders[0]
  const visibleOrders = useMemo(() => orders.filter((order) => (archive ? order.status === 'DELIVERED' : order.status !== 'DELIVERED') && `${order.id} ${order.customer}`.toLowerCase().includes(search.toLowerCase())), [archive, orders, search])
  const counts = statusOrder.reduce<Record<OrderStatus, number>>((result, status) => ({ ...result, [status]: orders.filter((order) => order.status === status).length }), {} as Record<OrderStatus, number>)

  function advanceSelected() {
    if (!selected) return
    const next = statusOrder[statusOrder.indexOf(selected.status) + 1]
    if (!next) return
    setOrders((current) => current.map((order) => order.id === selected.id ? { ...order, status: next } : order))
  }

  return (
    <main className={styles.page}>
      <AdminSidebar active="orders" />
      <section className={styles.content}>
        <header className={styles.header}><h1>ORDERS</h1><label className={styles.search}><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" /></label><button className={archive ? '' : styles.activeTab} type="button" onClick={() => setArchive(false)}>CURRENT ORDERS</button><button className={archive ? styles.activeTab : ''} type="button" onClick={() => setArchive(true)}>ARCHIVE</button><a href="#/admin/payment">PAYMENT</a></header>
        <div className={styles.dashboard}>
          <div className={styles.stats}>{statusOrder.map((status) => <div className={styles.stat} key={status}><strong>{counts[status]}</strong><span>{status}</span></div>)}</div>
          <div className={styles.ordersPanel}>
            <aside className={styles.orderList}>{visibleOrders.map((order) => <button className={selected.id === order.id ? styles.selected : ''} type="button" key={order.id} onClick={() => setSelectedId(order.id)}><div><strong>{order.customer}</strong><small>{order.id}</small><small>{order.date}</small><u>{order.email}</u></div><StatusBadge status={order.status} /><b>{currency(totals(order).total)}</b></button>)}</aside>
            {selected && <OrderDetails order={selected} onAdvance={advanceSelected} />}
          </div>
        </div>
      </section>
    </main>
  )
}
