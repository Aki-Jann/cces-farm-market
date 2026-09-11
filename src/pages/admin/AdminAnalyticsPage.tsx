import { useMemo, useState } from 'react'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
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
  comparison: Point[]
  totalRevenue: number
  totalOrders: number
  average: number
  margin: number
  categories: { label: string; value: number; color: string }[]
  top: Product[]
  underperforming: Product[]
}

const data: Record<Period, AnalyticsData> = {
  DAY: {
    revenue: [{ label: 'Sep 3', value: 180 }, { label: 'Sep 4', value: 155 }, { label: 'Sep 5', value: 270 }, { label: 'Sep 6', value: 330 }, { label: 'Sep 7', value: 220 }, { label: 'Sep 8', value: 265 }, { label: 'Sep 9', value: 180 }],
    transactions: [{ label: 'Sun', value: 108 }, { label: 'Mon', value: 50 }, { label: 'Tue', value: 70 }, { label: 'Wed', value: 25 }, { label: 'Thu', value: 32 }, { label: 'Fri', value: 130 }, { label: 'Sat', value: 55 }],
    comparison: [{ label: 'Sun', value: 135 }, { label: 'Mon', value: 16 }, { label: 'Tue', value: 100 }, { label: 'Wed', value: 12 }, { label: 'Thu', value: 18 }, { label: 'Fri', value: 170 }, { label: 'Sat', value: 18 }],
    totalRevenue: 698812.33, totalOrders: 1323, average: 375, margin: 18,
    categories: [{ label: 'Vegetable', value: 37, color: '#0ea5d8' }, { label: 'Fruit', value: 30, color: '#ffd65a' }, { label: 'Grain', value: 23, color: '#71d34a' }, { label: 'Flowers', value: 10, color: '#ff6b58' }],
    top: [{ name: 'Apple', category: 'Fruit', sold: 141, image: apple }, { name: 'Mango', category: 'Fruit', sold: 123, image: banana }, { name: 'Sampaguita', category: 'Flower', sold: 99, image: gumamela }, { name: 'Carrot', category: 'Vegetable', sold: 98, image: carrot }, { name: 'Rice', category: 'Grain', sold: 95, image: corn }],
    underperforming: [{ name: 'Orchid', category: 'Flower', sold: 2, image: gumamela }, { name: 'Bell Peppers', category: 'Vegetables', sold: 5, image: banana }, { name: 'Corn', category: 'Grains', sold: 10, image: corn }, { name: 'Sweet Potato', category: 'Vegetable', sold: 14, image: carrot }, { name: 'Wheat', category: 'Grains', sold: 18, image: corn }],
  },
  WEEK: {
    revenue: [{ label: 'Sun', value: 190 }, { label: 'Mon', value: 155 }, { label: 'Tue', value: 260 }, { label: 'Wed', value: 340 }, { label: 'Thu', value: 230 }, { label: 'Fri', value: 185 }, { label: 'Sat', value: 125 }],
    transactions: [{ label: 'Sun', value: 108 }, { label: 'Mon', value: 50 }, { label: 'Tue', value: 70 }, { label: 'Wed', value: 25 }, { label: 'Thu', value: 32 }, { label: 'Fri', value: 130 }, { label: 'Sat', value: 55 }],
    comparison: [{ label: 'Sun', value: 135 }, { label: 'Mon', value: 16 }, { label: 'Tue', value: 100 }, { label: 'Wed', value: 12 }, { label: 'Thu', value: 18 }, { label: 'Fri', value: 170 }, { label: 'Sat', value: 18 }],
    totalRevenue: 698812.33, totalOrders: 1323, average: 375, margin: 18,
    categories: [{ label: 'Vegetable', value: 37, color: '#0ea5d8' }, { label: 'Fruit', value: 30, color: '#ffd65a' }, { label: 'Grain', value: 23, color: '#71d34a' }, { label: 'Flowers', value: 10, color: '#ff6b58' }],
    top: [{ name: 'Apple', category: 'Fruit', sold: 141, image: apple }, { name: 'Mango', category: 'Fruit', sold: 123, image: banana }, { name: 'Sampaguita', category: 'Flower', sold: 99, image: gumamela }, { name: 'Carrot', category: 'Vegetable', sold: 98, image: carrot }, { name: 'Rice', category: 'Grain', sold: 95, image: corn }],
    underperforming: [{ name: 'Orchid', category: 'Flower', sold: 2, image: gumamela }, { name: 'Bell Peppers', category: 'Vegetables', sold: 5, image: banana }, { name: 'Corn', category: 'Grains', sold: 10, image: corn }, { name: 'Sweet Potato', category: 'Vegetable', sold: 14, image: carrot }, { name: 'Wheat', category: 'Grains', sold: 18, image: corn }],
  },
  MONTH: {
    revenue: [{ label: 'Mar', value: 120 }, { label: 'Apr', value: 95 }, { label: 'May', value: 255 }, { label: 'Jun', value: 345 }, { label: 'Jul', value: 195 }, { label: 'Aug', value: 180 }, { label: 'Sep', value: 125 }],
    transactions: [{ label: 'Mar', value: 45 }, { label: 'Apr', value: 60 }, { label: 'May', value: 80 }, { label: 'Jun', value: 70 }, { label: 'Jul', value: 110 }, { label: 'Aug', value: 130 }, { label: 'Sep', value: 95 }],
    comparison: [{ label: 'Mar', value: 75 }, { label: 'Apr', value: 45 }, { label: 'May', value: 100 }, { label: 'Jun', value: 125 }, { label: 'Jul', value: 80 }, { label: 'Aug', value: 90 }, { label: 'Sep', value: 55 }],
    totalRevenue: 698812.33, totalOrders: 1323, average: 375, margin: 18,
    categories: [{ label: 'Vegetable', value: 37, color: '#0ea5d8' }, { label: 'Fruit', value: 30, color: '#ffd65a' }, { label: 'Grain', value: 23, color: '#71d34a' }, { label: 'Flowers', value: 10, color: '#ff6b58' }],
    top: [{ name: 'Mango', category: 'Fruit', sold: 167, image: banana }, { name: 'Apple', category: 'Fruit', sold: 141, image: apple }, { name: 'Carrot', category: 'Vegetable', sold: 120, image: carrot }, { name: 'Rice', category: 'Grain', sold: 113, image: corn }, { name: 'Sampaguita', category: 'Flower', sold: 102, image: gumamela }],
    underperforming: [{ name: 'Orchid', category: 'Flower', sold: 4, image: gumamela }, { name: 'Bell Peppers', category: 'Vegetables', sold: 11, image: banana }, { name: 'Corn', category: 'Grains', sold: 20, image: corn }, { name: 'Sweet Potato', category: 'Vegetable', sold: 25, image: carrot }, { name: 'Wheat', category: 'Grains', sold: 30, image: corn }],
  },
}

function currency(value: number) {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <article className={styles.metric}><h2>{label}</h2><strong>{value}</strong></article>
}

function chartPath(points: Point[], max: number, width: number, height: number) {
  const step = width / Math.max(points.length - 1, 1)
  const coordinates = points.map((point, index) => [index * step, height - (point.value / max) * height])
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
  const max = Math.ceil(Math.max(...points.map((point) => point.value), ...comparison.map((point) => point.value)) / 50) * 50
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
  const max = Math.ceil(Math.max(...points.map((point) => point.value), ...comparison.map((point) => point.value)) / 50) * 50
  return <section className={styles.panel}><h2>{title}</h2><div className={styles.transactionChart}>
    <div className={styles.barGrid}>{[0, 1, 2, 3].map((tick) => <span key={tick} style={{ bottom: `${(tick / 3) * 100}%` }}><b>{Math.round((max * tick) / 3)}</b></span>)}</div>
    <div className={styles.barGroups}>{points.map((point, index) => <div className={styles.barGroup} key={point.label}><i style={{ height: `${(point.value / max) * 100}%` }} /><b style={{ height: `${(comparison[index].value / max) * 100}%` }} /><small>{point.label}</small></div>)}</div>
  </div></section>
}

function CategoryChart({ categories }: { categories: AnalyticsData['categories'] }) {
  return <section className={styles.panel}><h2>CATEGORIES SALES</h2><div className={styles.donut} style={{ background: `conic-gradient(${categories.map((category, index) => `${category.color} ${categories.slice(0, index).reduce((sum, item) => sum + item.value, 0)}% ${categories.slice(0, index + 1).reduce((sum, item) => sum + item.value, 0)}%`).join(', ')})` }}><span>Total<strong>1,323</strong></span></div><div className={styles.legend}>{categories.map((category) => <span key={category.label}><i style={{ background: category.color }} />{category.label}<b>{category.value}%</b></span>)}</div></section>
}

function ProductRanking({ title, products, underperforming = false }: { title: string; products: Product[]; underperforming?: boolean }) {
  const max = Math.max(...products.map((product) => product.sold))
  return <section className={`${styles.panel} ${underperforming ? styles.underperforming : ''}`}><h2>{title}</h2><div className={styles.products}>{products.map((product) => <div className={styles.product} key={product.name}><img src={product.image} alt="" /><div><strong>{product.name}</strong><small>{product.category}</small><span><i style={{ width: `${(product.sold / max) * 100}%` }} /></span></div><b>{product.sold} Sold</b></div>)}</div></section>
}

export function AdminAnalyticsPage() {
  const [period, setPeriod] = useState<Period>('WEEK')
  const [search, setSearch] = useState('')
  const analytics = data[period]
  const title = period === 'DAY' ? 'DAILY' : period === 'WEEK' ? 'WEEKLY' : 'MONTHLY'
  const visibleTop = useMemo(() => analytics.top.filter((product) => product.name.toLowerCase().includes(search.toLowerCase())), [analytics.top, search])
  return <main className={styles.page}><AdminSidebar active="analytics" /><section className={styles.content}><Header title="ANALYTICS" search={search} onSearchChange={(event) => setSearch(event.target.value)} /><div className={styles.dashboard}><div className={styles.metrics}><MetricCard label="TOTAL REVENUE" value={currency(analytics.totalRevenue)} /><MetricCard label="TOTAL ORDER" value={analytics.totalOrders.toLocaleString()} /><MetricCard label="AVG REVENUE/ORDER" value={currency(analytics.average)} /><MetricCard label="PROFIT MARGIN" value={`${analytics.margin}%`} /></div><div className={styles.chartGrid}><div className={styles.chartWithFilter}><LineChart title={`${title} REVENUE TREND`} points={analytics.revenue} comparison={analytics.comparison} /><div className={styles.filters}>{(['DAY', 'WEEK', 'MONTH'] as Period[]).map((item) => <button className={period === item ? styles.activeFilter : ''} key={item} type="button" onClick={() => setPeriod(item)}>{item[0] + item.slice(1).toLowerCase()}</button>)}</div></div><div className={styles.chartWithFilter}><TransactionChart title={`${title} TRANSACTIONS`} points={analytics.transactions} comparison={analytics.comparison} /><div className={styles.filters}>{(['DAY', 'WEEK', 'MONTH'] as Period[]).map((item) => <button className={period === item ? styles.activeFilter : ''} key={item} type="button" onClick={() => setPeriod(item)}>{item[0] + item.slice(1).toLowerCase()}</button>)}</div></div></div><div className={styles.lowerGrid}><CategoryChart categories={analytics.categories} /><ProductRanking title="TOP SELLING PRODUCTS" products={visibleTop} /><ProductRanking title="UNDERPERFORMING PRODUCTS" products={analytics.underperforming} underperforming /></div></div></section></main>
}
