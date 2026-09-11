import { useMemo, useState } from 'react'
import { AdminSidebar } from './AdminSidebar'
import styles from './AdminDashboard.module.css'

type RevenuePoint = { day: string; amount: number; fill: 'green' | 'lime' | 'empty' }
type RecentOrder = { id: string; customer: string; total: number; status: 'PENDING' | 'DELIVERED' }
type InventoryItem = { name: string; category: string; stock: string }

const revenue: RevenuePoint[] = [
  { day: 'Sun', amount: 5000, fill: 'green' },
  { day: 'Mon', amount: 8000, fill: 'green' },
  { day: 'Tue', amount: 3200, fill: 'green' },
  { day: 'Wed', amount: 3000, fill: 'lime' },
  { day: 'Thu', amount: 5000, fill: 'empty' },
  { day: 'Fri', amount: 6300, fill: 'empty' },
  { day: 'Sat', amount: 5000, fill: 'empty' },
]

const recentOrders: RecentOrder[] = [
  { id: 'ORD-0001', customer: 'Jasmien Pajiji', total: 525, status: 'PENDING' },
  { id: 'ORD-0002', customer: 'Aaron Jann Enriquez', total: 375, status: 'PENDING' },
  { id: 'ORD-0003', customer: 'Stephen David', total: 375, status: 'PENDING' },
]

const inventory: InventoryItem[] = [
  { name: 'Apple', category: 'Fruits', stock: '340kg' },
  { name: 'Banana', category: 'Fruits', stock: '340kg' },
  { name: 'Bell Pepper', category: 'Vegetables', stock: '340kg' },
  { name: 'Cabbage', category: 'Vegetables', stock: '340kg' },
]

function currency(value: number) {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className={styles.statCard}>
      <h2>{label}</h2>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  )
}

function RevenueChart() {
  const maxAmount = Math.max(...revenue.map((point) => point.amount))
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}><h2>WEEKLY REVENUE</h2><button type="button">See more</button></div>
      <div className={styles.chart}>
        {revenue.map((point) => (
          <div className={styles.barColumn} key={point.day}>
            <span>{currency(point.amount).replace('.00', '')}</span>
            <div className={styles.barTrack}>
              <div className={`${styles.barFill} ${styles[point.fill]}`} style={{ height: `${point.fill === 'empty' ? 0 : (point.amount / maxAmount) * 100}%` }} />
            </div>
            <small>{point.day}</small>
          </div>
        ))}
      </div>
    </section>
  )
}

function RecentOrders({ orders }: { orders: RecentOrder[] }) {
  return (
    <section className={styles.bottomPanel}>
      <div className={styles.panelHeading}><h2>RECENT ORDERS</h2><a href="#/orders">See more</a></div>
      <div className={styles.orderList}>
        {orders.map((order) => (
          <div className={styles.orderRow} key={order.id}>
            <div><strong>{order.customer}</strong><small>{order.id}</small></div>
            <span className={styles.status}>{order.status}</span>
            <strong>{currency(order.total)}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function ProductInventory({ items }: { items: InventoryItem[] }) {
  return (
    <section className={styles.bottomPanel}>
      <div className={styles.panelHeading}><h2>PRODUCT INVENTORY</h2><a href="#/shop">See more</a></div>
      <div className={styles.inventoryList}>
        {items.map((item) => (
          <div className={styles.inventoryRow} key={item.name}>
            <div><strong>{item.name}</strong><small>{item.category}</small></div>
            <strong>{item.stock}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

export function AdminDashboard() {
  const [search, setSearch] = useState('')
  const filteredOrders = useMemo(() => recentOrders.filter((order) => `${order.customer} ${order.id}`.toLowerCase().includes(search.toLowerCase())), [search])
  const filteredInventory = useMemo(() => inventory.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase())), [search])

  return (
    <main className={styles.page}>
      <AdminSidebar active="dashboard" />
      <section className={styles.content}>
        <header className={styles.header}>
          <h1>DASHBOARD</h1>
          <label className={styles.search}><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" /></label>
        </header>
        <div className={styles.dashboard}>
          <section className={styles.stats}>
            <StatCard label="REVENUE THIS WEEK" value="₱19,200.00" note="+18% vs last week" />
            <StatCard label="ACTIVE ORDERS" value="3" note="3 need attention" />
            <StatCard label="FRESH INVENTORY" value="6,800kg" note="Across all crops" />
            <StatCard label="LISTED PRODUCTS" value="20" note="of 21 total" />
          </section>
          <RevenueChart />
          <div className={styles.bottomPanels}>
            <RecentOrders orders={filteredOrders} />
            <ProductInventory items={filteredInventory} />
          </div>
        </div>
      </section>
    </main>
  )
}
