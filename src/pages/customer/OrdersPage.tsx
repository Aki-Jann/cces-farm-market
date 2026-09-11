import { useMemo, useState } from 'react'
import { CustomerSidebar } from '../../components/layout/CustomerSidebar'
import { Header } from '../../components/layout/Header'
import styles from './OrdersPage.module.css'

type OrderStatus = 'DELIVERED' | 'PENDING'

type Order = {
  id: string
  date: string
  total: number
  payment: string
  status: OrderStatus
  items: { name: string; quantity: number; price: number }[]
}

const orders: Order[] = [
  {
    id: 'ORD-0001',
    date: '09-02-2026',
    total: 315,
    payment: 'COD',
    status: 'DELIVERED',
    items: [{ name: 'Apple', quantity: 2, price: 100 }],
  },
  {
    id: 'ORD-0002',
    date: '09-02-2026',
    total: 520,
    payment: 'COD',
    status: 'PENDING',
    items: [
      { name: 'Apple', quantity: 1, price: 100 },
      { name: 'Bell Pepper', quantity: 2, price: 200 },
    ],
  },
]

function currency(value: number) {
  return `₱${value.toFixed(2)}`
}

export function OrderDetails({ order }: { order: Order }) {
  const subtotal = order.items.reduce((sum, item) => sum + item.quantity * item.price, 0)
  const delivery = 100
  const tax = order.total - subtotal - delivery

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
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const emptyState = window.location.hash.includes('empty')
  const visibleOrders = useMemo(() => orders.filter((order) => order.id.toLowerCase().includes(search.toLowerCase())), [search])

  return (
    <main className={styles.ordersPage}>
      <CustomerSidebar active="orders" />
      <section className={styles.ordersContent}>
        <Header title="ORDERS" search={search} onSearchChange={(event) => setSearch(event.target.value)} />
        <section className={styles.orderPanel}>
          <div className={styles.tableHeader}><span>Order ID</span><span>Date</span><span>Total</span><span>Payment</span><span>Order Status</span></div>
          {emptyState || visibleOrders.length === 0 ? (
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
