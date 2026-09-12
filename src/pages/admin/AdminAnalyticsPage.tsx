import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import { db } from '../../firebase/firestore'
import { resolveProductImage } from '../../utils/productImages'
import apple from '../../assets/shop-apple.png'
import banana from '../../assets/shop-banana.png'
import carrot from '../../assets/shop-carrot.png'
import corn from '../../assets/shop-corn.png'
import gumamela from '../../assets/shop-gumamela.png'
import styles from './AdminAnalyticsPage.module.css'

type Period = 'DAY' | 'WEEK' | 'MONTH'
type Point = { label: string; value: number }
type Product = { name: string; category: string; sold: number; image: string }
type AnalyticsData = {
  revenue: Point[]
  transactions: Point[]
  revenueComparison: Point[]
  transactionComparison: Point[]
  totalRevenue: number
  totalOrders: number
  average: number
  unitsSold: number
  categories: { label: string; value: number; color: string }[]
  top: Product[]
  underperforming: Product[]
}

type OrderItem = {
  productId?: string
  name?: string
  price?: number
  quantity?: number
  unit?: string
}

type FirestoreOrder = {
  id: string
  total: number
  createdAt: unknown
  items: OrderItem[]
}

type FirestoreProduct = {
  id: string
  name: string
  category: string
  imageUrl?: string
}

function currency(value: number) {
  const safeValue = isNaN(value) || !isFinite(value) ? 0 : value
  return `₱${safeValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <article className={styles.metric}><h2>{label}</h2><strong>{value}</strong></article>
}

function chartPath(points: Point[], max: number, width: number, height: number) {
  const safeMax = max > 0 ? max : 50
  const step = width / Math.max(points.length - 1, 1)
  const coordinates = points.map((point, index) => [index * step, height - (point.value / safeMax) * height])
  return coordinates.reduce((path, [x, y], index) => {
    if (index === 0) return `M ${x} ${y}`
    const [previousX, previousY] = coordinates[index - 1]
    const midpoint = (previousX + x) / 2
    return `${path} C ${midpoint} ${previousY}, ${midpoint} ${y}, ${x} ${y}`
  }, '')
}

function LineChart({ title, points, comparison }: { title: string; points: Point[]; comparison: Point[] }) {
  const width = 360
  const height = 112
  const maxVal = Math.max(0, ...points.map((point) => point.value), ...comparison.map((point) => point.value))
  const max = maxVal > 0 ? Math.ceil(maxVal / 50) * 50 : 50
  return <section className={styles.panel}><h2>{title}</h2><div className={styles.lineChart}>
    <svg viewBox={`0 0 ${width + 32} ${height + 28}`} role="img" aria-label={`${title} line chart`}>
      {[0, 1, 2, 3, 4].map((tick) => {
        const y = height - (tick / 4) * height
        return <g key={tick}><line x1="28" x2={width + 28} y1={y} y2={y} className={styles.gridLine} /><text x="0" y={y + 4} className={styles.axisLabel}>{Math.round((max * tick) / 4)}</text></g>
      })}
      <g transform="translate(28 0)"><path d={chartPath(comparison, max, width, height)} className={styles.comparisonLine} /><path d={chartPath(points, max, width, height)} className={styles.revenueLine} />{points.map((point, index) => <circle key={point.label} cx={(index * width) / Math.max(points.length - 1, 1)} cy={height - (point.value / max) * height} r="2.5" className={styles.revenuePoint} />)}</g>
      {points.map((point, index) => <text key={point.label} x={28 + (index * width) / Math.max(points.length - 1, 1)} y={height + 22} textAnchor="middle" className={styles.axisLabel}>{point.label}</text>)}
    </svg>
  </div></section>
}

function TransactionChart({ title, points, comparison }: { title: string; points: Point[]; comparison: Point[] }) {
  const maxVal = Math.max(0, ...points.map((point) => point.value), ...comparison.map((point) => point.value))
  const max = maxVal > 0 ? Math.ceil(maxVal / 50) * 50 : 50
  return <section className={styles.panel}><h2>{title}</h2><div className={styles.transactionChart}>
    <div className={styles.barGrid}>{[0, 1, 2, 3].map((tick) => <span key={tick} style={{ bottom: `${(tick / 3) * 100}%` }}><b>{Math.round((max * tick) / 3)}</b></span>)}</div>
    <div className={styles.barGroups}>{points.map((point, index) => <div className={styles.barGroup} key={point.label}><i style={{ height: `${Math.min(100, Math.max(0, (point.value / max) * 100))}%` }} /><b style={{ height: `${Math.min(100, Math.max(0, ((comparison[index]?.value ?? 0) / max) * 100))}%` }} /><small>{point.label}</small></div>)}</div>
  </div></section>
}

function CategoryChart({ categories, total }: { categories: AnalyticsData['categories']; total: number }) {
  const totalPercentage = categories.reduce((sum, item) => sum + item.value, 0)
  const conicGradient = totalPercentage > 0
    ? `conic-gradient(${categories.map((category, index) => `${category.color} ${categories.slice(0, index).reduce((sum, item) => sum + item.value, 0)}% ${categories.slice(0, index + 1).reduce((sum, item) => sum + item.value, 0)}%`).join(', ')})`
    : '#e7ece9'
  return <section className={styles.panel}><h2>CATEGORIES SALES</h2><div className={styles.donut} style={{ background: conicGradient }}><span>Total<strong>{total.toLocaleString()}</strong></span></div><div className={styles.legend}>{categories.map((category) => <span key={category.label}><i style={{ background: category.color }} />{category.label}<b>{category.value}%</b></span>)}</div></section>
}

function ProductRanking({ title, products, underperforming = false }: { title: string; products: Product[]; underperforming?: boolean }) {
  const max = Math.max(1, ...products.map((product) => product.sold))
  return <section className={`${styles.panel} ${underperforming ? styles.underperforming : ''}`}><h2>{title}</h2><div className={styles.products}>{products.map((product, index) => <div className={styles.product} key={`${product.name}-${index}`}><img src={product.image} alt="" /><div><strong>{product.name}</strong><small>{product.category}</small><span><i style={{ width: `${max > 0 ? (product.sold / max) * 100 : 0}%` }} /></span></div><b>{product.sold} Sold</b></div>)}</div></section>
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

export function AdminAnalyticsPage() {
  const [period, setPeriod] = useState<Period>('WEEK')
  const [search, setSearch] = useState('')
  const [orders, setOrders] = useState<FirestoreOrder[]>([])
  const [products, setProducts] = useState<FirestoreProduct[]>([])

  useEffect(() => {
    async function loadData() {
      try {
        const [ordersSnapshot, productsSnapshot] = await Promise.all([
          getDocs(collection(db, 'orders')),
          getDocs(collection(db, 'products')),
        ])

        const loadedOrders: FirestoreOrder[] = ordersSnapshot.docs.map((docSnap) => {
          const data = docSnap.data()
          return {
            id: docSnap.id,
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

        const loadedProducts: FirestoreProduct[] = productsSnapshot.docs.map((docSnap) => {
          const data = docSnap.data()
          return {
            id: docSnap.id,
            name: typeof data.name === 'string' ? data.name : 'Product',
            category: typeof data.category === 'string' ? data.category : 'VEGETABLES',
            imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
          }
        })

        setOrders(loadedOrders)
        setProducts(loadedProducts)
      } catch (loadError) {
        console.error('Loading analytics data failed:', loadError)
      }
    }

    void loadData()
  }, [])

  const analytics: AnalyticsData = useMemo(() => {
    const totalRevenue = orders.reduce((sum, order) => sum + (typeof order.total === 'number' ? order.total : 0), 0)
    const totalOrders = orders.length
    const average = totalOrders > 0 ? totalRevenue / totalOrders : 0

    // Build product map for sales tracking
    const productMap = new Map<string, Product>()
    const productLookupByName = new Map<string, string>()

    products.forEach((prod) => {
      const displayCat = formatCategoryLabel(prod.category)
      const image = resolveProductImage(prod.imageUrl, getProductFallbackImage(prod.name))
      productMap.set(prod.id, {
        name: prod.name,
        category: displayCat,
        sold: 0,
        image,
      })
      productLookupByName.set(prod.name.toLowerCase().trim(), prod.id)
    })

    let vegetableSales = 0
    let fruitSales = 0
    let grainSales = 0
    let flowersSales = 0

    orders.forEach((order) => {
      order.items.forEach((item) => {
        const qty = typeof item.quantity === 'number' ? item.quantity : 0
        const price = typeof item.price === 'number' ? item.price : 0
        const saleAmount = qty * price > 0 ? qty * price : qty
        const rawName = item.name || 'Product'
        const productId = item.productId || ''

        let matchedProduct: Product | undefined = undefined
        if (productId && productMap.has(productId)) {
          matchedProduct = productMap.get(productId)
        } else if (productLookupByName.has(rawName.toLowerCase().trim())) {
          const matchedId = productLookupByName.get(rawName.toLowerCase().trim())!
          matchedProduct = productMap.get(matchedId)
        }

        const cat = normalizeCategory(matchedProduct?.category) || normalizeCategory(rawName) || 'Vegetable'

        if (matchedProduct) {
          matchedProduct.sold += qty
        } else {
          const key = productId || rawName.toLowerCase().trim()
          const existing = productMap.get(key)
          if (existing) {
            existing.sold += qty
          } else {
            productMap.set(key, {
              name: rawName,
              category: formatCategoryLabel(cat),
              sold: qty,
              image: resolveProductImage(undefined, getProductFallbackImage(rawName)),
            })
          }
        }

        if (cat === 'Vegetable') vegetableSales += saleAmount
        else if (cat === 'Fruit') fruitSales += saleAmount
        else if (cat === 'Grain') grainSales += saleAmount
        else if (cat === 'Flowers') flowersSales += saleAmount
      })
    })

    const totalCategorySales = vegetableSales + fruitSales + grainSales + flowersSales
    const categories = totalCategorySales > 0 ? [
      { label: 'Vegetable', value: Math.round((vegetableSales / totalCategorySales) * 100), color: '#0ea5d8' },
      { label: 'Fruit', value: Math.round((fruitSales / totalCategorySales) * 100), color: '#ffd65a' },
      { label: 'Grain', value: Math.round((grainSales / totalCategorySales) * 100), color: '#71d34a' },
      { label: 'Flowers', value: Math.round((flowersSales / totalCategorySales) * 100), color: '#ff6b58' },
    ] : [
      { label: 'Vegetable', value: 0, color: '#0ea5d8' },
      { label: 'Fruit', value: 0, color: '#ffd65a' },
      { label: 'Grain', value: 0, color: '#71d34a' },
      { label: 'Flowers', value: 0, color: '#ff6b58' },
    ]

    const allProducts = Array.from(productMap.values())
    const top = [...allProducts].sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name)).slice(0, 5)
    const underperforming = [...allProducts].sort((a, b) => a.sold - b.sold || a.name.localeCompare(b.name)).slice(0, 5)

    // Calculate chart series based on period
    const now = new Date()
    const intervals: Array<{
      revenueLabel: string
      txLabel: string
      start: number
      end: number
      compStart: number
      compEnd: number
    }> = []

    if (period === 'DAY') {
      for (let i = 0; i < 7; i++) {
        const offset = 6 - i
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime()

        const compOffset = 13 - i
        const compD = new Date(now.getFullYear(), now.getMonth(), now.getDate() - compOffset)
        const compStart = new Date(compD.getFullYear(), compD.getMonth(), compD.getDate(), 0, 0, 0, 0).getTime()
        const compEnd = new Date(compD.getFullYear(), compD.getMonth(), compD.getDate(), 23, 59, 59, 999).getTime()

        intervals.push({
          revenueLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          txLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
          start,
          end,
          compStart,
          compEnd,
        })
      }
    } else if (period === 'WEEK') {
      for (let i = 0; i < 7; i++) {
        const offset = 6 - i
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime()

        const compOffset = 13 - i
        const compD = new Date(now.getFullYear(), now.getMonth(), now.getDate() - compOffset)
        const compStart = new Date(compD.getFullYear(), compD.getMonth(), compD.getDate(), 0, 0, 0, 0).getTime()
        const compEnd = new Date(compD.getFullYear(), compD.getMonth(), compD.getDate(), 23, 59, 59, 999).getTime()

        intervals.push({
          revenueLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
          txLabel: d.toLocaleDateString('en-US', { weekday: 'short' }),
          start,
          end,
          compStart,
          compEnd,
        })
      }
    } else {
      // MONTH
      for (let i = 0; i < 7; i++) {
        const offset = 6 - i
        const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
        const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime()
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime()

        const compOffset = 13 - i
        const compD = new Date(now.getFullYear(), now.getMonth() - compOffset, 1)
        const compStart = new Date(compD.getFullYear(), compD.getMonth(), 1, 0, 0, 0, 0).getTime()
        const compEnd = new Date(compD.getFullYear(), compD.getMonth() + 1, 0, 23, 59, 59, 999).getTime()

        intervals.push({
          revenueLabel: d.toLocaleDateString('en-US', { month: 'short' }),
          txLabel: d.toLocaleDateString('en-US', { month: 'short' }),
          start,
          end,
          compStart,
          compEnd,
        })
      }
    }

    const revenue: Point[] = intervals.map((interval) => ({ label: interval.revenueLabel, value: 0 }))
    const transactions: Point[] = intervals.map((interval) => ({ label: interval.txLabel, value: 0 }))
    const revenueComparison: Point[] = intervals.map((interval) => ({ label: interval.revenueLabel, value: 0 }))
    const transactionComparison: Point[] = intervals.map((interval) => ({ label: interval.txLabel, value: 0 }))

    let unitsSold = 0

    const periodMinTime = intervals.length > 0 ? intervals[0].start : 0
    const periodMaxTime = intervals.length > 0 ? intervals[intervals.length - 1].end : 0

    orders.forEach((order) => {
      const orderDate = parseOrderDate(order.createdAt)
      if (!orderDate) return
      const orderTime = orderDate.getTime()
      const total = typeof order.total === 'number' ? order.total : 0

      if (orderTime >= periodMinTime && orderTime <= periodMaxTime) {
        order.items.forEach((item) => {
          const qty = typeof item.quantity === 'number' && isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 0
          unitsSold += qty
        })
      }

      intervals.forEach((interval, index) => {
        if (orderTime >= interval.start && orderTime <= interval.end) {
          revenue[index].value += total
          transactions[index].value += 1
        }
        if (orderTime >= interval.compStart && orderTime <= interval.compEnd) {
          revenueComparison[index].value += total
          transactionComparison[index].value += 1
        }
      })
    })

    return {
      revenue,
      transactions,
      revenueComparison,
      transactionComparison,
      totalRevenue,
      totalOrders,
      average,
      unitsSold,
      categories,
      top,
      underperforming,
    }
  }, [orders, products, period])

  const title = period === 'DAY' ? 'DAILY' : period === 'WEEK' ? 'WEEKLY' : 'MONTHLY'
  const visibleTop = useMemo(() => analytics.top.filter((product) => product.name.toLowerCase().includes(search.toLowerCase())), [analytics.top, search])

  return (
    <main className={styles.page}>
      <AdminSidebar active="analytics" />
      <section className={styles.content}>
        <Header title="ANALYTICS" search={search} onSearchChange={(event) => setSearch(event.target.value)} />
        <div className={styles.dashboard}>
          <div className={styles.metrics}>
            <MetricCard label="TOTAL REVENUE" value={currency(analytics.totalRevenue)} />
            <MetricCard label="TOTAL ORDER" value={analytics.totalOrders.toLocaleString()} />
            <MetricCard label="AVG REVENUE/ORDER" value={currency(analytics.average)} />
            <MetricCard label="UNITS SOLD" value={analytics.unitsSold.toLocaleString()} />
          </div>
          <div className={styles.chartGrid}>
            <div className={styles.chartWithFilter}>
              <LineChart title={`${title} REVENUE TREND`} points={analytics.revenue} comparison={analytics.revenueComparison} />
              <div className={styles.filters}>
                {(['DAY', 'WEEK', 'MONTH'] as Period[]).map((item) => (
                  <button
                    className={period === item ? styles.activeFilter : ''}
                    key={item}
                    type="button"
                    onClick={() => setPeriod(item)}
                  >
                    {item[0] + item.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.chartWithFilter}>
              <TransactionChart title={`${title} TRANSACTIONS`} points={analytics.transactions} comparison={analytics.transactionComparison} />
              <div className={styles.filters}>
                {(['DAY', 'WEEK', 'MONTH'] as Period[]).map((item) => (
                  <button
                    className={period === item ? styles.activeFilter : ''}
                    key={item}
                    type="button"
                    onClick={() => setPeriod(item)}
                  >
                    {item[0] + item.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.lowerGrid}>
            <CategoryChart categories={analytics.categories} total={analytics.totalOrders} />
            <ProductRanking title="TOP SELLING PRODUCTS" products={visibleTop} />
            <ProductRanking title="UNDERPERFORMING PRODUCTS" products={analytics.underperforming} underperforming />
          </div>
        </div>
      </section>
    </main>
  )
}

