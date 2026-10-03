import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
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

type Product = { id: string; name: string; category: string; sold: number; image: string; stock: number; unit: string; isAvailable: boolean }
type CategorySale = { label: string; value: number; percentage: number; color: string }
type AnalyticsPanel = 'order-value' | 'units-sold' | 'products-listed' | 'out-of-stock' | 'category-sales' | 'inventory' | 'top-products' | 'underperforming'
type AnalyticsData = {
  totalRevenue: number
  unitsSold: number
  listedProducts: number
  outOfStockProducts: number
  categories: CategorySale[]
  top: Product[]
  underperforming: Product[]
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

type FirestoreOrder = { id: string; orderNumber: string; customerName: string; status: string; total: number; items: OrderItem[] }

type FirestoreProduct = {
  id: string
  name: string
  category: string
  stock: number
  unit: string
  isAvailable: boolean
  imageUrl?: string
}

function currency(value: number) {
  const safeValue = isNaN(value) || !isFinite(value) ? 0 : value
  return `₱${safeValue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

function CategoryChart({ categories, total, onClick }: { categories: CategorySale[]; total: number; onClick: () => void }) {
  const totalSales = categories.reduce((sum, item) => sum + item.value, 0)
  const totalPercentage = categories.reduce((sum, item) => sum + item.percentage, 0)
  const conicGradient = totalPercentage > 0
    ? `conic-gradient(${categories.map((category, index) => `${category.color} ${categories.slice(0, index).reduce((sum, item) => sum + item.percentage, 0)}% ${categories.slice(0, index + 1).reduce((sum, item) => sum + item.percentage, 0)}%`).join(', ')})`
    : '#e7ece9'
  return <button className={styles.panel} type="button" onClick={onClick} aria-label="Sales by category. View category sales details"><h2>SALES BY CATEGORY</h2><p className={styles.panelDescription}>See which crops bring in the most sales.</p><div className={styles.categoryContent}><div className={styles.donut} style={{ background: conicGradient }}><span>Total sales<strong>{currency(totalSales)}</strong></span></div><div className={styles.legend}>{categories.map((category) => <span key={category.label}><i style={{ background: category.color }} /><span>{category.label}<small>{currency(category.value)}</small></span><b>{category.percentage}%</b></span>)}</div></div><p className={styles.chartFootnote}>Across {total.toLocaleString()} orders</p><span className={styles.panelClickHint}>View category details <span aria-hidden="true">→</span></span></button>
}

function InventoryChart({ products, onClick }: { products: Product[]; onClick: () => void }) {
  const inventory = [...products].sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name)).slice(0, 4)
  const maxStock = Math.max(1, ...inventory.map((product) => product.stock))

  return (
    <button className={styles.panel} type="button" onClick={onClick} aria-label="Products to check. View inventory details">
      <h2>PRODUCTS TO CHECK</h2>
      <p className={styles.panelDescription}>Current stock for your six lowest-stock products.</p>
      {inventory.length === 0 ? (
        <p className={styles.emptyState}>No products are listed yet.</p>
      ) : (
        <div className={styles.inventoryList}>
          {inventory.map((product) => (
            <div className={styles.inventoryItem} key={product.name}>
              <img src={product.image} alt="" />
              <div className={styles.inventoryInfo}>
                <strong>{product.name}</strong>
                <small>{product.category}</small>
                <span className={styles.inventoryTrack}><i className={!product.isAvailable || product.stock <= 0 ? styles.outOfStockBar : ''} style={{ width: `${Math.min(100, (product.stock / maxStock) * 100)}%` }} /></span>
              </div>
              <b>{product.stock <= 0 ? 'Out of stock' : !product.isAvailable ? 'Not listed' : `${product.stock} ${product.unit} left`}</b>
            </div>
          ))}
        </div>
      )}
      <span className={styles.panelClickHint}>View inventory details <span aria-hidden="true">→</span></span>
    </button>
  )
}

function ProductRanking({ title, products, underperforming = false, onClick }: { title: string; products: Product[]; underperforming?: boolean; onClick: () => void }) {
  const max = Math.max(1, ...products.map((product) => product.sold))
  return <button className={`${styles.panel} ${underperforming ? styles.underperforming : ''}`} type="button" onClick={onClick} aria-label={`${title}. View expanded product data`}><h2>{title}</h2><div className={styles.products}>{products.map((product) => <div className={styles.product} key={product.id}><img src={product.image} alt="" /><div><strong>{product.name}</strong><small>{product.category}</small><span><i style={{ width: `${max > 0 ? (product.sold / max) * 100 : 0}%` }} /></span></div><b>{product.sold} Sold</b></div>)}</div><span className={styles.panelClickHint}>View all products <span aria-hidden="true">→</span></span></button>
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
  const [search, setSearch] = useState('')
  const [activePanel, setActivePanel] = useState<AnalyticsPanel | null>(null)
  const [orders, setOrders] = useState<FirestoreOrder[]>([])
  const [products, setProducts] = useState<FirestoreProduct[]>([])

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
            total: typeof data.total === 'number' ? data.total : 0,
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
      },
      (loadError) => {
        console.error('Loading analytics orders failed:', loadError)
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
          }
        })
        setProducts(loadedProducts)
      },
      (loadError) => {
        console.error('Loading analytics products failed:', loadError)
      }
    )

    return () => {
      unsubscribeOrders()
      unsubscribeProducts()
    }
  }, [])

  const analytics: AnalyticsData = useMemo(() => {
    const totalRevenue = orders.reduce((sum, order) => sum + (typeof order.total === 'number' ? order.total : 0), 0)

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
              id: key,
              name: rawName,
              category: formatCategoryLabel(cat),
              sold: qty,
              image: resolveProductImage(undefined, getProductFallbackImage(rawName)),
              stock: 0,
              unit: typeof item.unit === 'string' ? item.unit : 'units',
              isAvailable: false,
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
    const categoryAmounts = [
      { label: 'Vegetable', value: vegetableSales, color: '#0ea5d8' },
      { label: 'Fruit', value: fruitSales, color: '#ffd65a' },
      { label: 'Grain', value: grainSales, color: '#71d34a' },
      { label: 'Flowers', value: flowersSales, color: '#ff6b58' },
    ]
    let assignedPercentage = 0
    const categories: CategorySale[] = categoryAmounts.map((category, index) => {
      const percentage = totalCategorySales <= 0
        ? 0
        : index === categoryAmounts.length - 1
          ? Math.max(0, 100 - assignedPercentage)
          : Math.round((category.value / totalCategorySales) * 100)
      assignedPercentage += percentage
      return { ...category, percentage }
    })

    const allProducts = Array.from(productMap.values())
    const top = [...allProducts].sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name)).slice(0, 5)
    const underperforming = [...allProducts].sort((a, b) => a.sold - b.sold || a.name.localeCompare(b.name)).slice(0, 5)
    const unitsSold = orders.reduce((sum, order) => sum + order.items.reduce((orderSum, item) => {
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
      unitsSold,
      listedProducts,
      outOfStockProducts,
      categories,
      top,
      underperforming,
      inventory,
      allProducts,
      orders,
    }
  }, [orders, products])

  const visibleTop = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return analytics.top
    return analytics.top.filter((product) =>
      product.name.toLowerCase().includes(query) ||
      product.category.toLowerCase().includes(query)
    )
  }, [analytics.top, search])

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
      <AdminSidebar active="analytics" />
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
                <div className={styles.detailSummary}><span>Total value across {orders.length} orders</span><strong>{currency(analytics.totalRevenue)}</strong></div>
                <div className={styles.dataList}>
                  <div className={styles.dataListHeading}><span>ORDER</span><span>CUSTOMER</span><span>ITEMS</span><span>ORDER VALUE</span></div>
                  {orders.length === 0 ? <p className={styles.emptyState}>No orders yet.</p> : orders.map((order) => (
                    <div className={styles.dataRow} key={order.id}><strong>{order.orderNumber}</strong><span>{order.customerName}</span><span>{order.items.reduce((sum, item) => sum + (item.quantity ?? 0), 0)} units</span><b>{currency(order.total)}</b></div>
                  ))}
                </div>
              </>
            ) : activePanel === 'category-sales' ? (
              <div className={styles.dataList}>
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
          <div className={styles.chartGrid}>
            <CategoryChart categories={analytics.categories} total={orders.length} onClick={() => openPanel('category-sales')} />
            <InventoryChart products={analytics.inventory} onClick={() => openPanel('inventory')} />
          </div>
          <div className={styles.lowerGrid}>
            <ProductRanking title="TOP SELLING PRODUCTS" products={visibleTop} onClick={() => openPanel('top-products')} />
            <ProductRanking title="UNDERPERFORMING PRODUCTS" products={analytics.underperforming} underperforming onClick={() => openPanel('underperforming')} />
          </div>
        </div>}
      </section>
    </main>
  )
}
