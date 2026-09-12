import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import { db } from '../../firebase/firestore'
import styles from './AdminDashboard.module.css'

type RevenuePoint = { day: string; amount: number; fill: 'green' | 'lime' | 'empty' }
type RecentOrder = { id: string; customer: string; total: number; status: 'PENDING' | 'CONFIRMED' | 'PACKED' | 'DELIVERED'; createdAtTime: number }
type InventoryItem = { name: string; category: string; stock: string; stockNum: number; isAvailable: boolean }

type FirestoreOrder = {
  id: string
  orderNumber?: string
  customerName?: string
  total: number
  status: string
  createdAt: unknown
}

type FirestoreProduct = {
  id: string
  name: string
  category: string
  stock: number
  unit: string
  isAvailable: boolean
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

function formatCategory(category?: string): string {
  if (!category) return 'Vegetables'
  const lower = category.toLowerCase().trim()
  if (lower.startsWith('veg')) return 'Vegetables'
  if (lower.startsWith('fruit')) return 'Fruits'
  if (lower.startsWith('grain')) return 'Grains'
  if (lower.startsWith('flower')) return 'Flowers'
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase()
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

function RevenueChart({ revenue }: { revenue: RevenuePoint[] }) {
  const maxAmount = Math.max(0, ...revenue.map((point) => point.amount))
  const safeMax = maxAmount > 0 ? maxAmount : 1
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}><h2>WEEKLY REVENUE</h2><a href="#/admin/analytics">See more</a></div>
      <div className={styles.chart}>
        {revenue.map((point) => (
          <div className={styles.barColumn} key={point.day}>
            <span>{point.amount > 0 ? currency(point.amount).replace('.00', '') : '₱0'}</span>
            <div className={styles.barTrack}>
              <div className={`${styles.barFill} ${styles[point.fill]}`} style={{ height: `${point.fill === 'empty' ? 0 : (point.amount / safeMax) * 100}%` }} />
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
      <div className={styles.panelHeading}><h2>RECENT ORDERS</h2><a href="#/admin/orders">See more</a></div>
      <div className={styles.orderList}>
        {orders.length === 0 ? (
          <p style={{ color: '#6c7175', fontSize: '13px', margin: '16px 0' }}>No orders found.</p>
        ) : (
          orders.slice(0, 4).map((order) => (
            <div className={styles.orderRow} key={order.id}>
              <div><strong>{order.customer}</strong><small>{order.id}</small></div>
              <span className={styles.status}>{order.status}</span>
              <strong>{currency(order.total)}</strong>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function ProductInventory({ items }: { items: InventoryItem[] }) {
  return (
    <section className={styles.bottomPanel}>
      <div className={styles.panelHeading}><h2>PRODUCT INVENTORY</h2><a href="#/admin/products">See more</a></div>
      <div className={styles.inventoryList}>
        {items.length === 0 ? (
          <p style={{ color: '#6c7175', fontSize: '13px', margin: '16px 0' }}>No products found.</p>
        ) : (
          items.slice(0, 4).map((item) => (
            <div className={styles.inventoryRow} key={item.name}>
              <div><strong>{item.name}</strong><small>{item.category}</small></div>
              <strong>{item.stock}</strong>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

export function AdminDashboard() {
  const [search, setSearch] = useState('')
  const [orders, setOrders] = useState<FirestoreOrder[]>([])
  const [products, setProducts] = useState<FirestoreProduct[]>([])
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [productsLoaded, setProductsLoaded] = useState(false)
  const isLoading = !ordersLoaded || !productsLoaded

  // Orders and products are independent collections, so each gets its own
  // real-time listener rather than merging unrelated data into one.
  useEffect(() => {
    const unsubscribeOrders = onSnapshot(
      collection(db, 'orders'),
      (snapshot) => {
        const loadedOrders: FirestoreOrder[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data()
          return {
            id: docSnap.id,
            orderNumber: typeof data.orderNumber === 'string' ? data.orderNumber : undefined,
            customerName: typeof data.customerName === 'string' ? data.customerName : undefined,
            total: typeof data.total === 'number' ? data.total : 0,
            status: typeof data.status === 'string' ? data.status : 'pending',
            createdAt: data.createdAt,
          }
        })
        setOrders(loadedOrders)
        setOrdersLoaded(true)
      },
      (loadError) => {
        console.error('Loading dashboard orders failed:', loadError)
        setOrdersLoaded(true)
      }
    )

    const unsubscribeProducts = onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        const loadedProducts: FirestoreProduct[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data()
          return {
            id: docSnap.id,
            name: typeof data.name === 'string' ? data.name : 'Product',
            category: typeof data.category === 'string' ? data.category : 'VEGETABLES',
            stock: typeof data.stock === 'number' ? data.stock : 0,
            unit: typeof data.unit === 'string' ? data.unit : 'kg',
            isAvailable: typeof data.isAvailable === 'boolean' ? data.isAvailable : true,
          }
        })
        setProducts(loadedProducts)
        setProductsLoaded(true)
      },
      (loadError) => {
        console.error('Loading dashboard products failed:', loadError)
        setProductsLoaded(true)
      }
    )

    return () => {
      unsubscribeOrders()
      unsubscribeProducts()
    }
  }, [])

  // Calculate stats and series
  const { weeklyRevenue, revenuePoints, activeOrdersCount, totalFreshStock, availableProductsCount, totalProductsCount, recentOrdersList, inventoryList, revenueGrowthText } = useMemo(() => {
    const now = new Date()

    // Build 7-day intervals for current week (last 7 days grouped by day) and previous 7 days
    const days: Array<{
      dayLabel: string
      start: number
      end: number
      compStart: number
      compEnd: number
      amount: number
    }> = []

    for (let i = 0; i < 7; i++) {
      const offset = 6 - i
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime()

      const compOffset = 13 - i
      const compD = new Date(now.getFullYear(), now.getMonth(), now.getDate() - compOffset)
      const compStart = new Date(compD.getFullYear(), compD.getMonth(), compD.getDate(), 0, 0, 0, 0).getTime()
      const compEnd = new Date(compD.getFullYear(), compD.getMonth(), compD.getDate(), 23, 59, 59, 999).getTime()

      days.push({
        dayLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
        start,
        end,
        compStart,
        compEnd,
        amount: 0,
      })
    }

    let thisWeekRevenue = 0
    let lastWeekRevenue = 0
    let activeOrders = 0

    const parsedOrders: RecentOrder[] = []

    orders.forEach((order) => {
      const date = parseOrderDate(order.createdAt)
      const time = date ? date.getTime() : 0
      const total = typeof order.total === 'number' ? order.total : 0
      const rawStatus = (order.status || 'pending').toUpperCase()
      const normalizedStatus: RecentOrder['status'] =
        rawStatus === 'DELIVERED' ? 'DELIVERED' :
        rawStatus === 'CONFIRMED' ? 'CONFIRMED' :
        rawStatus === 'PACKED' ? 'PACKED' : 'PENDING'

      if (normalizedStatus !== 'DELIVERED') {
        activeOrders += 1
      }

      parsedOrders.push({
        id: order.orderNumber || order.id,
        customer: order.customerName || 'Customer',
        total,
        status: normalizedStatus,
        createdAtTime: time,
      })

      days.forEach((day) => {
        if (time >= day.start && time <= day.end) {
          day.amount += total
          thisWeekRevenue += total
        }
        if (time >= day.compStart && time <= day.compEnd) {
          lastWeekRevenue += total
        }
      })
    })

    // Sort recent orders newest first
    parsedOrders.sort((a, b) => b.createdAtTime - a.createdAtTime)

    // Compute weekly revenue growth percentage
    const growthText = lastWeekRevenue > 0
      ? `${Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100) >= 0 ? '+' : ''}${Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100)}% vs last week`
      : thisWeekRevenue > 0
        ? '+100% vs last week'
        : '0% vs last week'

    // Revenue chart points fill determination
    const maxDayAmount = Math.max(0, ...days.map((d) => d.amount))
    const revPoints: RevenuePoint[] = days.map((day) => {
      let fill: 'green' | 'lime' | 'empty' = 'empty'
      if (day.amount > 0) {
        fill = day.amount >= maxDayAmount * 0.7 ? 'green' : 'lime'
      }
      return {
        day: day.dayLabel,
        amount: day.amount,
        fill,
      }
    })

    // Inventory metrics
    let freshStockSum = 0
    let availableCount = 0
    const invItems: InventoryItem[] = []
    for (const p of products) {
      const isAvail = p.isAvailable && p.stock > 0
      if (isAvail) availableCount += 1
      freshStockSum += p.stock
      invItems.push({
        name: p.name,
        category: formatCategory(p.category),
        stock: `${p.stock.toLocaleString()}${p.unit.toLowerCase()}`,
        stockNum: p.stock,
        isAvailable: isAvail,
      })
    }

    return {
      weeklyRevenue: thisWeekRevenue,
      revenuePoints: revPoints,
      activeOrdersCount: activeOrders,
      totalFreshStock: freshStockSum,
      availableProductsCount: availableCount,
      totalProductsCount: products.length,
      recentOrdersList: parsedOrders,
      inventoryList: invItems,
      revenueGrowthText: growthText,
    }
  }, [orders, products])

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return recentOrdersList
    return recentOrdersList.filter((order) =>
      order.customer.toLowerCase().includes(query) ||
      order.id.toLowerCase().includes(query) ||
      order.status.toLowerCase().includes(query)
    )
  }, [recentOrdersList, search])

  const filteredInventory = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return inventoryList
    return inventoryList.filter((item) =>
      item.name.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    )
  }, [inventoryList, search])

  return (
    <main className={styles.page}>
      <AdminSidebar active="dashboard" />
      <section className={styles.content}>
        <Header title="DASHBOARD" search={search} onSearchChange={(event) => setSearch(event.target.value)} />
        <div className={styles.dashboard}>
          <section className={styles.stats}>
            <StatCard
              label="REVENUE THIS WEEK"
              value={isLoading ? '...' : currency(weeklyRevenue)}
              note={isLoading ? 'Calculating...' : revenueGrowthText}
            />
            <StatCard
              label="ACTIVE ORDERS"
              value={isLoading ? '...' : activeOrdersCount.toLocaleString()}
              note={isLoading ? 'Loading...' : `${activeOrdersCount} need attention`}
            />
            <StatCard
              label="FRESH INVENTORY"
              value={isLoading ? '...' : `${totalFreshStock.toLocaleString()}kg`}
              note="Across all crops"
            />
            <StatCard
              label="LISTED PRODUCTS"
              value={isLoading ? '...' : availableProductsCount.toLocaleString()}
              note={`of ${totalProductsCount} total`}
            />
          </section>
          <RevenueChart revenue={revenuePoints} />
          <div className={styles.bottomPanels}>
            <RecentOrders orders={filteredOrders} />
            <ProductInventory items={filteredInventory} />
          </div>
        </div>
      </section>
    </main>
  )
}

