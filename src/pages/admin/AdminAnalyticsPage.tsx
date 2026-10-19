import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import { db } from '../../firebase/firestore'
import { isOrderEligibleForFinancialTotals } from '../../utils/orderFinancials'
import { resolveProductImage } from '../../utils/productImages'
import apple from '../../assets/shop-apple.png'
import banana from '../../assets/shop-banana.png'
import carrot from '../../assets/shop-carrot.png'
import corn from '../../assets/shop-corn.png'
import gumamela from '../../assets/shop-gumamela.png'
import styles from './AdminAnalyticsPage.module.css'

type Product = { id: string; name: string; category: string; sold: number; image: string; stock: number; unit: string; isAvailable: boolean; listedAt: Date | null }
type CategorySale = { label: string; value: number; percentage: number; color: string }
type AnalyticsPanel = 'order-value' | 'units-sold' | 'products-listed' | 'out-of-stock' | 'category-sales' | 'inventory' | 'top-products' | 'underperforming'
type Period = 'daily' | 'monthly' | 'yearly'
type ProductPerformance = { product: Product; units: number; revenue: number }
type TrendPoint = { label: string; tooltip: string; value: number }
type AnalyticsData = {
  totalRevenue: number
  financialOrders: FirestoreOrder[]
  unitsSold: number
  listedProducts: number
  outOfStockProducts: number
  categories: CategorySale[]
  inventory: Product[]
  allProducts: Product[]
  orders: FirestoreOrder[]
}

type OrderItem = {
  productId?: string
  name?: string
  price?: number
  quantity?: number
  unit?: string
}

type FirestoreOrder = { id: string; orderNumber: string; customerName: string; status: string; paymentStatus: string; total: number; createdAt: unknown; items: OrderItem[] }

type FirestoreProduct = {
  id: string
  name: string
  category: string
  stock: number
  unit: string
  isAvailable: boolean
  imageUrl?: string
  createdAt?: unknown
}

const categoryColors = ['#017632', '#79a94b', '#d3a32d', '#78a9a0', '#7492b8', '#a788b5']

function currency(value: number) {
  const safeValue = isNaN(value) || !isFinite(value) ? 0 : value
  return `₱${safeValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function compactCurrency(value: number) {
  return `₱${value.toLocaleString('en-PH', { notation: 'compact', maximumFractionDigits: 1 })}`
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (value && typeof value === 'object') {
    if ('toDate' in value && typeof value.toDate === 'function') {
      const date = value.toDate()
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
    }
    if ('seconds' in value && typeof value.seconds === 'number') {
      const date = new Date(value.seconds * 1000)
      return Number.isNaN(date.getTime()) ? null : date
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

function getPeriodBounds(period: Period, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'monthly') start.setDate(1)
  if (period === 'yearly') {
    start.setMonth(0, 1)
  }
  const end = new Date(start)
  if (period === 'daily') end.setDate(end.getDate() + 1)
  if (period === 'monthly') end.setMonth(end.getMonth() + 1)
  if (period === 'yearly') end.setFullYear(end.getFullYear() + 1)
  return { start, end }
}

function periodDateKey(date: Date, period: Period) {
  if (period === 'yearly') return String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  if (period === 'monthly') return `${date.getFullYear()}-${month}`
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, '0')}`
}

function getBucketLabel(date: Date, period: Period) {
  if (period === 'yearly') return String(date.getFullYear())
  if (period === 'monthly') return date.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' })
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function getChartPeriods(period: Period, dates: Date[], now = new Date()) {
  const keys: { key: string; label: string; tooltip: string }[] = []
  if (dates.length === 0) return keys
  if (period === 'yearly') {
    const firstYear = Math.min(...dates.map((date) => date.getFullYear()))
    for (let year = firstYear; year <= now.getFullYear(); year += 1) {
      keys.push({ key: String(year), label: String(year), tooltip: String(year) })
    }
    return keys
  }

  const periods = period === 'daily' ? 30 : 12
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'daily') start.setDate(start.getDate() - periods + 1)
  else start.setMonth(start.getMonth() - periods + 1, 1)
  if (period === 'monthly') start.setDate(1)

  for (let index = 0; index < periods; index += 1) {
    const date = new Date(start)
    if (period === 'daily') date.setDate(start.getDate() + index)
    else date.setMonth(start.getMonth() + index)
    const key = periodDateKey(date, period)
    const tooltip = period === 'daily'
      ? date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
      : date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
    keys.push({ key, label: getBucketLabel(date, period), tooltip })
  }
  return keys
}

function makeTrendPoints(
  orders: FirestoreOrder[],
  period: Period,
  valueForOrder: (order: FirestoreOrder) => number,
) {
  const datedOrders = orders.flatMap((order) => {
    const date = parseDate(order.createdAt)
    return date ? [{ order, date }] : []
  })
  const buckets = getChartPeriods(period, datedOrders.map(({ date }) => date))
  const bucketKeys = new Set(buckets.map((bucket) => bucket.key))
  const values = new Map<string, number>()
  datedOrders.forEach(({ order, date }) => {
    const key = periodDateKey(date, period)
    if (!bucketKeys.has(key)) return
    values.set(key, (values.get(key) ?? 0) + valueForOrder(order))
  })
  return buckets.map((bucket) => ({
    label: bucket.label,
    tooltip: bucket.tooltip,
    value: values.get(bucket.key) ?? 0,
  }))
}

function PeriodFilters({ value, onChange, label }: { value: Period; onChange: (period: Period) => void; label: string }) {
  return (
    <div className={styles.periodFilters} role="group" aria-label={`${label} period`}>
      {(['daily', 'monthly', 'yearly'] as const).map((period) => (
        <button
          aria-pressed={value === period}
          className={value === period ? styles.selectedPeriod : ''}
          key={period}
          onClick={() => onChange(period)}
          type="button"
        >
          {period[0].toUpperCase() + period.slice(1)}
        </button>
      ))}
    </div>
  )
}

function PanelState({ loading, error, empty }: { loading: boolean; error: string; empty: string }) {
  if (loading) return <p className={styles.emptyState}>Loading analytics…</p>
  if (error) return <p className={styles.errorState} role="alert">{error}</p>
  return <p className={styles.emptyState}>{empty}</p>
}

function MetricCard({ label, value, detail, icon, onClick }: { label: string; value: string; detail: string; icon: 'sales' | 'units' | 'products' | 'stock'; onClick: () => void }) {
  const paths = {
    sales: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 14 4-4 3 2 5-6" /><path d="M15 6h4v4" /></>,
    units: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 16 9 5 9-5" /></>,
    products: <><path d="M4 7h16v13H4z" /><path d="M8 7V4h8v3" /><path d="M8 12h8" /><path d="M8 16h5" /></>,
    stock: <><path d="M12 3 21 19H3L12 3Z" /><path d="M12 9v4" /><path d="M12 16h.01" /></>,
  }

  return (
    <button className={`${styles.metric} ${styles[`metric${icon[0].toUpperCase()}${icon.slice(1)}`]}`} type="button" onClick={onClick} aria-label={`${label}: ${value}. View details`}>
      <div className={styles.metricHeading}>
        <h2>{label}</h2>
        <span className={styles.metricIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
            {paths[icon]}
          </svg>
        </span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
      <span className={styles.metricAction}>View details <span aria-hidden="true">→</span></span>
    </button>
  )
}

function CategoryChart({ categories, total, loading, error, onClick }: { categories: CategorySale[]; total: number; loading: boolean; error: string; onClick: () => void }) {
  const totalSales = categories.reduce((sum, item) => sum + item.value, 0)
  const totalPercentage = categories.reduce((sum, item) => sum + item.percentage, 0)
  const conicGradient = totalPercentage > 0
    ? `conic-gradient(${categories.map((category, index) => `${category.color} ${categories.slice(0, index).reduce((sum, item) => sum + item.percentage, 0)}% ${categories.slice(0, index + 1).reduce((sum, item) => sum + item.percentage, 0)}%`).join(', ')})`
    : '#e7ece9'
  return (
    <button className={styles.panel} type="button" onClick={onClick} aria-label="Sales by category. View category sales details">
      <h2>CATEGORIES SALES</h2>
      <p className={styles.panelDescription}>Sales share by product category.</p>
      {loading || error ? <PanelState error={error} loading={loading} empty="" /> : categories.length === 0 || totalSales === 0 ? (
        <PanelState error="" loading={false} empty="No category sales recorded yet." />
      ) : (
        <>
          <div className={styles.categoryContent}>
            <div className={styles.donut} style={{ background: conicGradient }}>
              <span>Total sales<strong>{currency(totalSales)}</strong></span>
            </div>
            <div className={styles.legend}>
              {categories.filter((category) => category.value > 0).map((category) => (
                <span key={category.label}>
                  <i style={{ background: category.color }} />
                  <span>{category.label}<small>{currency(category.value)}</small></span>
                  <b>{category.percentage}%</b>
                </span>
              ))}
            </div>
          </div>
          <p className={styles.chartFootnote}>Across {total.toLocaleString()} paid orders</p>
        </>
      )}
      <span className={styles.panelClickHint}>View category details <span aria-hidden="true">→</span></span>
    </button>
  )
}

function RevenueTrend({ points, period, onPeriodChange, loading, error }: { points: TrendPoint[]; period: Period; onPeriodChange: (period: Period) => void; loading: boolean; error: string }) {
  const maxValue = Math.max(1, ...points.map((point) => point.value))
  const plotPoints = points.map((point, index) => ({
    ...point,
    x: points.length <= 1 ? 180 : 34 + (index / (points.length - 1)) * 312,
    y: 150 - (point.value / maxValue) * 118,
  }))
  const labelIndexes = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div><h2>REVENUE TREND</h2><p className={styles.panelDescription}>Paid-order value over time.</p></div>
        <PeriodFilters label="Revenue trend" onChange={onPeriodChange} value={period} />
      </div>
      {loading || error ? <PanelState error={error} loading={loading} empty="" /> : points.length === 0 ? (
        <PanelState error="" loading={false} empty="No dated orders available for this trend." />
      ) : (
        <div className={styles.trendChart}>
          <svg aria-label={`Revenue grouped ${period}`} role="img" viewBox="0 0 360 190">
            {[32, 91, 150].map((y, index) => (
              <g key={y}>
                <line className={styles.chartGridline} x1="34" x2="346" y1={y} y2={y} />
                <text className={styles.axisLabel} textAnchor="end" x="29" y={y + 3}>{compactCurrency(maxValue * (2 - index) / 2)}</text>
              </g>
            ))}
            <polyline className={styles.revenueLine} points={plotPoints.map((point) => `${point.x},${point.y}`).join(' ')} />
            {plotPoints.map((point, index) => (
              <g key={`${point.tooltip}-${index}`}>
                <circle className={styles.revenuePoint} cx={point.x} cy={point.y} r={points.length > 20 ? 2.5 : 4}>
                  <title>{`${point.tooltip}: ${currency(point.value)}`}</title>
                </circle>
                {labelIndexes.has(index) && <text className={styles.axisLabel} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} x={point.x} y="177">{point.label}</text>}
              </g>
            ))}
          </svg>
        </div>
      )}
      <p className={styles.chartFootnote}>{period === 'daily' ? 'Last 30 days' : period === 'monthly' ? 'Last 12 months' : 'By calendar year'}</p>
    </section>
  )
}

function TransactionsTrend({ points, period, onPeriodChange, loading, error }: { points: TrendPoint[]; period: Period; onPeriodChange: (period: Period) => void; loading: boolean; error: string }) {
  const maxValue = Math.max(1, ...points.map((point) => point.value))
  const plotPoints = points.map((point, index) => ({
    ...point,
    x: points.length <= 1 ? 180 : 38 + (index / points.length) * 308,
    height: (point.value / maxValue) * 118,
  }))
  const labelIndexes = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div><h2>TRANSACTIONS TREND</h2><p className={styles.panelDescription}>Orders placed, counted once each.</p></div>
        <PeriodFilters label="Transactions trend" onChange={onPeriodChange} value={period} />
      </div>
      {loading || error ? <PanelState error={error} loading={loading} empty="" /> : points.length === 0 ? (
        <PanelState error="" loading={false} empty="No dated orders available for this trend." />
      ) : (
        <div className={styles.trendChart}>
          <svg aria-label={`Transactions grouped ${period}`} role="img" viewBox="0 0 360 190">
            {[32, 91, 150].map((y, index) => (
              <g key={y}>
                <line className={styles.chartGridline} x1="34" x2="346" y1={y} y2={y} />
                <text className={styles.axisLabel} textAnchor="end" x="29" y={y + 3}>{Math.round(maxValue * (2 - index) / 2)}</text>
              </g>
            ))}
            {plotPoints.map((point, index) => (
              <g key={`${point.tooltip}-${index}`}>
                <rect className={styles.transactionBar} height={Math.max(point.value > 0 ? 1 : 0, point.height)} rx="2" width={points.length > 20 ? 5 : 12} x={point.x} y={150 - point.height}>
                  <title>{`${point.tooltip}: ${point.value} ${point.value === 1 ? 'order' : 'orders'}`}</title>
                </rect>
                {labelIndexes.has(index) && <text className={styles.axisLabel} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} x={point.x + (points.length > 20 ? 2.5 : 6)} y="177">{point.label}</text>}
              </g>
            ))}
          </svg>
        </div>
      )}
      <p className={styles.chartFootnote}>{period === 'daily' ? 'Last 30 days' : period === 'monthly' ? 'Last 12 months' : 'By calendar year'}</p>
    </section>
  )
}

function InventoryChart({ products, loading, error, onClick }: { products: Product[]; loading: boolean; error: string; onClick: () => void }) {
  const inventory = products.filter((product) => product.stock <= 0).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 5)

  return (
    <section className={styles.panel}>
      <h2>PRODUCTS TO CHECK</h2>
      <p className={styles.panelDescription}>Products with an actionable out-of-stock alert.</p>
      {loading || error ? (
        <PanelState error={error} loading={loading} empty="" />
      ) : inventory.length === 0 ? (
        <PanelState error="" loading={false} empty="No out-of-stock products need attention." />
      ) : (
        <div className={styles.inventoryList}>
          {inventory.map((product) => (
            <div className={styles.inventoryItem} key={product.id}>
              <img src={product.image} alt="" />
              <div className={styles.inventoryInfo}>
                <strong>{product.name}</strong>
                <small>{product.category}</small>
                <span className={styles.inventoryTrack}><i className={styles.outOfStockBar} style={{ width: '100%' }} /></span>
              </div>
              <b>Out of stock</b>
            </div>
          ))}
        </div>
      )}
      <button className={styles.panelLink} onClick={onClick} type="button">View inventory details <span aria-hidden="true">→</span></button>
    </section>
  )
}

function ProductRanking({ title, products, period, onPeriodChange, loading, error, empty, underperforming = false, description, onClick }: { title: string; products: ProductPerformance[]; period: Period; onPeriodChange: (period: Period) => void; loading: boolean; error: string; empty: string; underperforming?: boolean; description: string; onClick: () => void }) {
  const max = Math.max(1, ...products.map((product) => product.units))
  return (
    <section className={`${styles.panel} ${underperforming ? styles.underperforming : ''}`}>
      <div className={styles.panelHeading}>
        <div><h2>{title}</h2><p className={styles.panelDescription}>{description}</p></div>
        <PeriodFilters label={title} onChange={onPeriodChange} value={period} />
      </div>
      {loading || error ? <PanelState error={error} loading={loading} empty="" /> : products.length === 0 ? (
        <PanelState error="" loading={false} empty={empty} />
      ) : (
        <div className={styles.products}>
          {products.map(({ product, units, revenue }, index) => (
            <div className={styles.product} key={product.id}>
              <span className={styles.productRank}>{index + 1}</span>
              <img src={product.image} alt="" />
              <div>
                <strong>{product.name}</strong>
                <small>{units.toLocaleString()} sold · {currency(revenue)}</small>
                <span><i style={{ width: `${(units / max) * 100}%` }} /></span>
              </div>
            </div>
          ))}
        </div>
      )}
      <button className={styles.panelLink} onClick={onClick} type="button">View all products <span aria-hidden="true">→</span></button>
    </section>
  )
}

function normalizeCategory(categoryStr?: string): 'Vegetable' | 'Fruit' | 'Grain' | 'Flowers' | null {
  const lower = (categoryStr || '').toLowerCase().trim()
  if (lower.startsWith('veg') || lower.includes('carrot') || lower.includes('cabbage') || lower.includes('pepper') || lower.includes('cucumber') || lower.includes('potato')) return 'Vegetable'
  if (lower.startsWith('fruit') || lower.includes('apple') || lower.includes('banana') || lower.includes('guava') || lower.includes('mango')) return 'Fruit'
  if (lower.startsWith('grain') || lower.includes('corn') || lower.includes('rice') || lower.includes('wheat')) return 'Grain'
  if (lower.startsWith('flower') || lower.includes('gumamela') || lower.includes('orchid') || lower.includes('sampaguita')) return 'Flowers'
  return null
}

function formatCategoryLabel(rawCategory?: string): string {
  const normalized = normalizeCategory(rawCategory)
  if (normalized === 'Vegetable') return 'Vegetable'
  if (normalized === 'Fruit') return 'Fruit'
  if (normalized === 'Grain') return 'Grain'
  if (normalized === 'Flowers') return 'Flower'
  if (!rawCategory) return 'Vegetable'
  return rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1).toLowerCase()
}

function getProductFallbackImage(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('banana') || lower.includes('mango')) return banana
  if (lower.includes('carrot') || lower.includes('pepper') || lower.includes('cabbage') || lower.includes('potato') || lower.includes('cucumber')) return carrot
  if (lower.includes('corn') || lower.includes('rice') || lower.includes('grain') || lower.includes('wheat')) return corn
  if (lower.includes('gumamela') || lower.includes('flower') || lower.includes('orchid') || lower.includes('sampaguita')) return gumamela
  return apple
}

export function AdminAnalyticsPage({ role = 'farmer' }: { role?: 'farmer' | 'cces_admin' }) {
  const [search, setSearch] = useState('')
  const [activePanel, setActivePanel] = useState<AnalyticsPanel | null>(null)
  const [orders, setOrders] = useState<FirestoreOrder[]>([])
  const [products, setProducts] = useState<FirestoreProduct[]>([])
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [productsLoaded, setProductsLoaded] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [productsError, setProductsError] = useState('')
  const [revenuePeriod, setRevenuePeriod] = useState<Period>('daily')
  const [transactionsPeriod, setTransactionsPeriod] = useState<Period>('daily')
  const [topProductsPeriod, setTopProductsPeriod] = useState<Period>('daily')
  const [underperformingPeriod, setUnderperformingPeriod] = useState<Period>('daily')

  useEffect(() => {
    // Orders and products are independent collections, so each gets its own
    // real-time listener rather than merging unrelated data into one.
    const unsubscribeOrders = onSnapshot(
      collection(db, 'orders'),
      (ordersSnapshot) => {
        const loadedOrders: FirestoreOrder[] = ordersSnapshot.docs.map((docSnap) => {
          const data = docSnap.data()
          return {
            id: docSnap.id,
            orderNumber: typeof data.orderNumber === 'string' ? data.orderNumber : docSnap.id,
            customerName: typeof data.customerName === 'string' ? data.customerName : 'Customer',
            status: typeof data.status === 'string' ? data.status : 'pending',
            paymentStatus: typeof data.paymentStatus === 'string' ? data.paymentStatus : '',
            total: typeof data.total === 'number' ? data.total : 0,
            createdAt: data.createdAt,
            items: Array.isArray(data.items)
              ? data.items.map((item) => {
                  const itemData = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
                  return {
                    productId: typeof itemData.productId === 'string' ? itemData.productId : undefined,
                    name: typeof itemData.name === 'string' ? itemData.name : undefined,
                    price: typeof itemData.price === 'number' ? itemData.price : 0,
                    quantity: typeof itemData.quantity === 'number' ? itemData.quantity : 0,
                    unit: typeof itemData.unit === 'string' ? itemData.unit : undefined,
                  }
                })
              : [],
          }
        })
        setOrders(loadedOrders)
        setOrdersError('')
        setOrdersLoaded(true)
      },
      (loadError) => {
        console.error('Loading analytics orders failed:', loadError)
        setOrdersError('Unable to load order analytics. Please try again.')
        setOrdersLoaded(true)
      }
    )

    const unsubscribeProducts = onSnapshot(
      collection(db, 'products'),
      (productsSnapshot) => {
        const loadedProducts: FirestoreProduct[] = productsSnapshot.docs.map((docSnap) => {
          const data = docSnap.data()
          return {
            id: docSnap.id,
            name: typeof data.name === 'string' ? data.name : 'Product',
            category: typeof data.category === 'string' ? data.category : 'VEGETABLES',
            stock: typeof data.stock === 'number' && Number.isFinite(data.stock) ? Math.max(data.stock, 0) : 0,
            unit: typeof data.unit === 'string' ? data.unit : 'units',
            isAvailable: typeof data.isAvailable === 'boolean' ? data.isAvailable : true,
            imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
            createdAt: data.createdAt,
          }
        })
        setProducts(loadedProducts)
        setProductsError('')
        setProductsLoaded(true)
      },
      (loadError) => {
        console.error('Loading analytics products failed:', loadError)
        setProductsError('Unable to load product analytics. Please try again.')
        setProductsLoaded(true)
      }
    )

    return () => {
      unsubscribeOrders()
      unsubscribeProducts()
    }
  }, [])

  const analytics: AnalyticsData = useMemo(() => {
    const salesOrders = orders.filter(isOrderEligibleForFinancialTotals)
    const totalRevenue = salesOrders.reduce((sum, order) => sum + (typeof order.total === 'number' ? order.total : 0), 0)

    const productMap = new Map<string, Product>()
    const productLookupByName = new Map<string, string>()

    products.forEach((prod) => {
      const displayCat = formatCategoryLabel(prod.category)
      const image = resolveProductImage(prod.imageUrl, getProductFallbackImage(prod.name))
      productMap.set(prod.id, {
        id: prod.id,
        name: prod.name,
        category: displayCat,
        sold: 0,
        image,
        stock: prod.stock,
        unit: prod.unit,
        isAvailable: prod.isAvailable,
        listedAt: parseDate(prod.createdAt),
      })
      productLookupByName.set(prod.name.toLowerCase().trim(), prod.id)
    })

    const salesByCategory = new Map<string, number>()

    salesOrders.forEach((order) => {
      order.items.forEach((item) => {
        const qty = typeof item.quantity === 'number' ? item.quantity : 0
        const price = typeof item.price === 'number' ? item.price : 0
        const saleAmount = qty * price
        const rawName = item.name || 'Product'
        const productId = item.productId || ''

        let matchedProduct: Product | undefined = undefined
        if (productId && productMap.has(productId)) {
          matchedProduct = productMap.get(productId)
        } else if (productLookupByName.has(rawName.toLowerCase().trim())) {
          const matchedId = productLookupByName.get(rawName.toLowerCase().trim())!
          matchedProduct = productMap.get(matchedId)
        }

        const categoryLabel = matchedProduct
          ? normalizeCategory(matchedProduct.category) || formatCategoryLabel(matchedProduct.category)
          : normalizeCategory(rawName) || 'Other'

        if (matchedProduct) {
          matchedProduct.sold += qty
        } else {
          const key = productId || rawName.toLowerCase().trim()
          const existing = productMap.get(key)
          if (existing) {
            existing.sold += qty
          } else {
            productMap.set(key, {
              id: key,
              name: rawName,
              category: categoryLabel,
              sold: qty,
              image: resolveProductImage(undefined, getProductFallbackImage(rawName)),
              stock: 0,
              unit: typeof item.unit === 'string' ? item.unit : 'units',
              isAvailable: false,
              listedAt: null,
            })
          }
        }

        salesByCategory.set(categoryLabel, (salesByCategory.get(categoryLabel) ?? 0) + saleAmount)
      })
    })

    const categoryLabels = [...new Set([
      'Vegetable',
      'Fruit',
      'Grain',
      'Flowers',
      ...products.map((product) => normalizeCategory(product.category) || formatCategoryLabel(product.category)),
      ...salesByCategory.keys(),
    ])]
    const categoryAmounts = categoryLabels.map((label, index) => ({
      label,
      value: salesByCategory.get(label) ?? 0,
      color: categoryColors[index % categoryColors.length],
    }))
    const totalCategorySales = categoryAmounts.reduce((sum, category) => sum + category.value, 0)
    const lastPositiveCategory = categoryAmounts.reduce((last, category, index) => category.value > 0 ? index : last, -1)
    let assignedPercentage = 0
    const categories: CategorySale[] = categoryAmounts.map((category, index) => {
      const percentage = totalCategorySales <= 0
        ? 0
        : category.value <= 0
          ? 0
          : index === lastPositiveCategory
          ? Math.max(0, 100 - assignedPercentage)
          : Math.round((category.value / totalCategorySales) * 100)
      assignedPercentage += percentage
      return { ...category, percentage }
    })

    const allProducts = Array.from(productMap.values())
    const unitsSold = salesOrders.reduce((sum, order) => sum + order.items.reduce((orderSum, item) => {
      const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0
        ? item.quantity
        : 0
      return orderSum + quantity
    }, 0), 0)
    const listedProducts = products.length
    const outOfStockProducts = products.filter((product) => product.stock <= 0).length
    const inventory = products
      .map((product) => productMap.get(product.id))
      .filter((product): product is Product => product !== undefined)
      .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name))

    return {
      totalRevenue,
      financialOrders: salesOrders,
      unitsSold,
      listedProducts,
      outOfStockProducts,
      categories,
      inventory,
      allProducts,
      orders,
    }
  }, [orders, products])

  const revenueTrend = useMemo(() => makeTrendPoints(
    analytics.financialOrders,
    revenuePeriod,
    (order) => order.total,
  ), [analytics.financialOrders, revenuePeriod])

  const transactionsTrend = useMemo(() => makeTrendPoints(
    analytics.orders,
    transactionsPeriod,
    () => 1,
  ), [analytics.orders, transactionsPeriod])

  function getProductPerformance(orders: FirestoreOrder[], products: Product[], period: Period) {
    const { start, end } = getPeriodBounds(period)
    const productById = new Map(products.map((product) => [product.id, product]))
    const productIdByName = new Map(products.map((product) => [product.name.toLowerCase().trim(), product.id]))
    const results = new Map<string, { product: Product; units: number; revenue: number }>()

    orders.forEach((order) => {
      const orderDate = parseDate(order.createdAt)
      if (!orderDate || orderDate < start || orderDate >= end) return
      order.items.forEach((item) => {
        const quantity = item.quantity
        const price = item.price
        if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 ||
            typeof price !== 'number' || !Number.isFinite(price) || price < 0) return
        const productId = typeof item.productId === 'string' && productById.has(item.productId)
          ? item.productId
          : productIdByName.get((item.name ?? '').toLowerCase().trim())
        const product = productId ? productById.get(productId) : undefined
        if (!product) return
        const current = results.get(product.id) ?? { product, units: 0, revenue: 0 }
        current.units += quantity
        current.revenue += quantity * price
        results.set(product.id, current)
      })
    })
    return Array.from(results.values())
  }

  const topProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return getProductPerformance(analytics.financialOrders, analytics.allProducts, topProductsPeriod)
      .filter(({ product }) => !query ||
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query))
      .sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.product.name.localeCompare(b.product.name))
      .slice(0, 5)
  }, [analytics.allProducts, analytics.financialOrders, search, topProductsPeriod])

  const underperformingProducts = useMemo(() => {
    const { start } = getPeriodBounds(underperformingPeriod)
    const cohort = analytics.allProducts.filter((product) =>
      product.isAvailable && product.listedAt !== null && product.listedAt < start)
    const periodSales = getProductPerformance(analytics.financialOrders, analytics.allProducts, underperformingPeriod)
    if (cohort.length < 2) return []
    const salesByProduct = new Map(periodSales.map((result) => [result.product.id, result]))
    const cohortRevenue = cohort.reduce((sum, product) => sum + (salesByProduct.get(product.id)?.revenue ?? 0), 0)
    if (cohortRevenue <= 0) return []
    const averageRevenue = cohortRevenue / cohort.length
    return cohort
      .map((product) => salesByProduct.get(product.id) ?? { product, units: 0, revenue: 0 })
      .filter((result) => result.revenue < averageRevenue)
      .sort((a, b) => a.revenue - b.revenue || a.units - b.units || a.product.name.localeCompare(b.product.name))
      .slice(0, 5)
  }, [analytics.allProducts, analytics.financialOrders, underperformingPeriod])

  function openPanel(panel: AnalyticsPanel) {
    setActivePanel(panel)
  }

  function returnToOverview() {
    setActivePanel(null)
  }

  const detailTitle: Record<AnalyticsPanel, string> = {
    'order-value': 'TOTAL ORDER VALUE',
    'units-sold': 'UNITS SOLD',
    'products-listed': 'PRODUCTS LISTED',
    'out-of-stock': 'OUT OF STOCK',
    'category-sales': 'SALES BY CATEGORY',
    inventory: 'INVENTORY DETAILS',
    'top-products': 'TOP SELLING PRODUCTS',
    underperforming: 'UNDERPERFORMING PRODUCTS',
  }

  const inventoryProducts = activePanel === 'out-of-stock'
    ? analytics.inventory.filter((product) => product.stock <= 0)
    : analytics.inventory
  const rankedProducts = activePanel === 'top-products'
    ? [...analytics.allProducts].sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name))
    : [...analytics.allProducts].sort((a, b) => a.sold - b.sold || a.name.localeCompare(b.name))
  const detailProducts = activePanel === 'inventory' || activePanel === 'out-of-stock' || activePanel === 'products-listed'
    ? inventoryProducts
    : activePanel === 'top-products' || activePanel === 'underperforming'
      ? rankedProducts
      : activePanel === 'units-sold'
        ? [...analytics.allProducts].sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name))
        : []

  return (
    <main className={styles.page}>
      <AdminSidebar active="analytics" role={role} />
      <section className={styles.content}>
        <Header title="ANALYTICS" search={search} onSearchChange={(event) => setSearch(event.target.value)} />
        {activePanel ? (
          <div className={styles.dashboard}>
            <div className={styles.detailHeader}>
              <div>
                <button className={styles.backButton} type="button" onClick={returnToOverview}>← Back to analytics</button>
                <h2>{detailTitle[activePanel]}</h2>
                <p>Expanded information from your live farm market data.</p>
              </div>
            </div>
            {activePanel === 'order-value' ? (
              <>
                <div className={styles.detailSummary}><span>Total value across {analytics.financialOrders.length} paid orders</span><strong>{currency(analytics.totalRevenue)}</strong></div>
                <div className={styles.dataList}>
                  <div className={styles.dataListHeading}><span>ORDER</span><span>CUSTOMER</span><span>ITEMS</span><span>ORDER VALUE</span></div>
                  {analytics.financialOrders.length === 0 ? <p className={styles.emptyState}>No paid orders yet.</p> : analytics.financialOrders.map((order) => (
                    <div className={styles.dataRow} key={order.id}><strong>{order.orderNumber}</strong><span>{order.customerName}</span><span>{order.items.reduce((sum, item) => sum + (item.quantity ?? 0), 0)} units</span><b>{currency(order.total)}</b></div>
                  ))}
                </div>
              </>
            ) : activePanel === 'category-sales' ? (
              <div className={`${styles.dataList} ${styles.categorySalesList}`}>
                <div className={styles.dataListHeading}><span>CATEGORY</span><span>SHARE OF SALES</span><span>SALES VALUE</span></div>
                {analytics.categories.map((category) => <div className={styles.categoryDetailRow} key={category.label}><i style={{ background: category.color }} /><strong>{category.label}</strong><span className={styles.categoryShare}><i style={{ width: `${category.percentage}%`, background: category.color }} /></span><b>{category.percentage}%</b><strong>{currency(category.value)}</strong></div>)}
              </div>
            ) : (
              <>
                <div className={styles.detailSummary}>
                  <span>{activePanel === 'out-of-stock' ? 'Products that need restocking' : activePanel === 'inventory' ? 'Current product stock levels' : activePanel === 'units-sold' ? 'Total units ordered' : `Showing ${detailProducts.length} products`}</span>
                  <strong>{activePanel === 'out-of-stock' ? inventoryProducts.length : activePanel === 'products-listed' ? analytics.listedProducts : activePanel === 'units-sold' ? analytics.unitsSold.toLocaleString() : detailProducts.length}</strong>
                </div>
                <div className={styles.dataList}>
                  <div className={styles.dataListHeading}><span>PRODUCT</span><span>CATEGORY</span><span>{activePanel === 'inventory' || activePanel === 'out-of-stock' || activePanel === 'products-listed' ? 'CURRENT STOCK' : 'UNITS SOLD'}</span><span>STATUS</span></div>
                  {detailProducts.length === 0 ? <p className={styles.emptyState}>{activePanel === 'out-of-stock' ? 'All listed products have stock.' : 'No product data available yet.'}</p> : detailProducts.map((product) => (
                    <div className={styles.dataRow} key={product.id}><span className={styles.detailProduct}><img src={product.image} alt="" /><strong>{product.name}</strong></span><span>{product.category}</span><b>{activePanel === 'inventory' || activePanel === 'out-of-stock' || activePanel === 'products-listed' ? `${product.stock} ${product.unit}` : `${product.sold} sold`}</b><span className={product.stock <= 0 ? styles.statusOut : styles.statusAvailable}>{product.stock <= 0 ? 'Out of stock' : product.isAvailable ? 'Available' : 'Not listed'}</span></div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : <div className={styles.dashboard}>
          <div className={styles.metrics}>
            <MetricCard label="TOTAL ORDER VALUE" value={currency(analytics.totalRevenue)} detail="Value across all orders" icon="sales" onClick={() => openPanel('order-value')} />
            <MetricCard label="UNITS SOLD" value={analytics.unitsSold.toLocaleString()} detail="Items ordered by customers" icon="units" onClick={() => openPanel('units-sold')} />
            <MetricCard label="PRODUCTS LISTED" value={analytics.listedProducts.toLocaleString()} detail="Products in your catalog" icon="products" onClick={() => openPanel('products-listed')} />
            <MetricCard label="OUT OF STOCK" value={analytics.outOfStockProducts.toLocaleString()} detail="Products that may need restocking" icon="stock" onClick={() => openPanel('out-of-stock')} />
          </div>
          {(!ordersLoaded || !productsLoaded || ordersError || productsError) && (
            <p className={ordersError || productsError ? styles.errorState : styles.dataNotice} role={ordersError || productsError ? 'alert' : 'status'}>
              {ordersError || productsError
                ? 'Some analytics data could not be loaded; displayed totals may be incomplete.'
                : 'Loading live analytics data…'}
            </p>
          )}
          <div className={styles.chartGrid}>
            <CategoryChart categories={analytics.categories} total={analytics.financialOrders.length} loading={!ordersLoaded} error={ordersError} onClick={() => openPanel('category-sales')} />
            <RevenueTrend points={revenueTrend} period={revenuePeriod} onPeriodChange={setRevenuePeriod} loading={!ordersLoaded} error={ordersError} />
            <TransactionsTrend points={transactionsTrend} period={transactionsPeriod} onPeriodChange={setTransactionsPeriod} loading={!ordersLoaded} error={ordersError} />
          </div>
          <div className={styles.lowerGrid}>
            <ProductRanking
              title="TOP SELLING PRODUCTS"
              products={topProducts}
              period={topProductsPeriod}
              onPeriodChange={setTopProductsPeriod}
              loading={!ordersLoaded}
              error={ordersError}
              empty="No products sold during this period."
              description="Ranked by units sold, then revenue."
              onClick={() => openPanel('top-products')}
            />
            <ProductRanking
              title="UNDERPERFORMING PRODUCTS"
              products={underperformingProducts}
              period={underperformingPeriod}
              onPeriodChange={setUnderperformingPeriod}
              loading={!ordersLoaded || !productsLoaded}
              error={ordersError || productsError}
              empty="Not enough comparable sales history for this period."
              underperforming
              description="Available products below the cohort's average revenue."
              onClick={() => openPanel('underperforming')}
            />
            <InventoryChart products={analytics.inventory} loading={!productsLoaded} error={productsError} onClick={() => openPanel('inventory')} />
          </div>
        </div>}
      </section>
    </main>
  )
}
