import { useMemo, useState } from 'react'
import { BrandLogo } from './BrandLogo'
import styles from './ShopPage.module.css'
import apple from '../assets/shop-apple.png'
import banana from '../assets/shop-banana.png'
import pepper from '../assets/shop-pepper.png'
import cabbage from '../assets/shop-cabbage.png'
import carrot from '../assets/shop-carrot.png'
import corn from '../assets/shop-corn.png'
import cucumber from '../assets/shop-cucumber.png'
import guava from '../assets/shop-guava.png'
import gumamela from '../assets/shop-gumamela.png'

type Category = 'All' | 'Vegetables' | 'Fruits' | 'Grains' | 'Flowers'

type Product = {
  id: string
  name: string
  category: Exclude<Category, 'All'>
  image: string
}

type CartItem = Product & { quantity: number }

const products: Product[] = [
  { id: 'apple', name: 'APPLE', category: 'Fruits', image: apple },
  { id: 'banana', name: 'BANANA', category: 'Fruits', image: banana },
  { id: 'bell-pepper', name: 'BELL PEPPER', category: 'Vegetables', image: pepper },
  { id: 'cabbage', name: 'CABBAGE', category: 'Vegetables', image: cabbage },
  { id: 'carrot', name: 'CARROT', category: 'Vegetables', image: carrot },
  { id: 'corn', name: 'CORN', category: 'Grains', image: corn },
  { id: 'cucumber', name: 'CUCUMBER', category: 'Vegetables', image: cucumber },
  { id: 'guava', name: 'GUAVA', category: 'Fruits', image: guava },
  { id: 'gumamela', name: 'GUMAMELA', category: 'Flowers', image: gumamela },
]

const categories: Category[] = ['All', 'Vegetables', 'Fruits', 'Grains', 'Flowers']

function currency(value: number) {
  return `₱${value.toFixed(2)}`
}

function ProductCard({
  product,
  quantity,
  onAdd,
  onChange,
}: {
  product: Product
  quantity: number
  onAdd: () => void
  onChange: (quantity: number) => void
}) {
  return (
    <article className={`${styles.productCard} ${quantity > 0 ? styles.selected : ''}`}>
      <img src={product.image} alt={product.name} />
      <div className={styles.productMeta}>
        <div>
          <strong>{product.name}</strong>
          <small>{product.category.toUpperCase()}</small>
        </div>
        <div className={styles.productPrice}>
          <strong>{currency(100)}</strong>
          <small>340Kg Stock</small>
        </div>
      </div>
      {quantity > 0 ? (
        <div className={styles.quantityControl}>
          <button type="button" aria-label={`Remove one ${product.name}`} onClick={() => onChange(quantity - 1)}>-</button>
          <span>{quantity}</span>
          <button type="button" aria-label={`Add one ${product.name}`} onClick={() => onChange(quantity + 1)}>+</button>
        </div>
      ) : (
        <button type="button" className={styles.addButton} onClick={onAdd}>ADD TO CART</button>
      )}
    </article>
  )
}

function Cart({
  items,
  onChange,
}: {
  items: CartItem[]
  onChange: (id: string, quantity: number) => void
}) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * 100, 0)
  const delivery = subtotal > 0 ? 100 : 0
  const tax = subtotal * 0.05
  const total = subtotal + delivery + tax

  return (
    <aside className={styles.cart}>
      <div className={styles.cartHeading}>
        <h1>Cart</h1>
        <p>Address Here</p>
      </div>
      <div className={styles.cartItems}>
        {items.length === 0 ? (
          <p className={styles.emptyCart}>Your cart is empty.</p>
        ) : items.map((item) => (
          <div className={styles.cartItem} key={item.id}>
            <img src={item.image} alt="" />
            <div>
              <strong>{item.name}</strong>
              <span>{currency(100)}<small>{item.quantity}x</small></span>
            </div>
            <strong>{currency(item.quantity * 100)}</strong>
            <div className={styles.cartQuantity}>
              <button type="button" aria-label={`Remove one ${item.name}`} onClick={() => onChange(item.id, item.quantity - 1)}>-</button>
              <button type="button" aria-label={`Add one ${item.name}`} onClick={() => onChange(item.id, item.quantity + 1)}>+</button>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.cartFooter}>
        <div className={styles.receipt}>
          <SummaryRow label="Sub Total" value={currency(subtotal)} />
          <SummaryRow label="Delivery Fee" value={currency(delivery)} />
          <SummaryRow label="Tax 5%" value={currency(tax)} />
          <hr />
          <SummaryRow label="Total Amount" value={currency(total)} strong />
        </div>
        <div className={styles.paymentOptions}>
          <button type="button" className={styles.activePayment}>COD</button>
          <button type="button">GCASH</button>
          <button type="button">MAYA</button>
        </div>
        <button type="button" className={styles.placeOrder}>PLACE ORDER</button>
      </div>
    </aside>
  )
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={strong ? styles.strongRow : ''}><span>{label}</span><span>{value}</span></div>
}

export function ShopPage() {
  const [category, setCategory] = useState<Category>('All')
  const [search, setSearch] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === 'All' || product.category === category
    return matchesCategory && product.name.toLowerCase().includes(search.toLowerCase())
  }), [category, search])

  const cartItems = products
    .filter((product) => (quantities[product.id] ?? 0) > 0)
    .map((product) => ({ ...product, quantity: quantities[product.id] }))

  function updateQuantity(id: string, quantity: number) {
    setQuantities((current) => {
      const next = { ...current }
      if (quantity <= 0) delete next[id]
      else next[id] = quantity
      return next
    })
  }

  return (
    <main className={styles.shop}>
      <nav className={styles.sidebar}>
        <div>
          <BrandLogo compact />
          <div className={styles.sideRule} />
          <a className={styles.activeNav} href="#/shop">SHOP</a>
          <a href="#/shop">ORDERS</a>
          <a href="#/shop">MESSAGE</a>
        </div>
        <a href="#/login">MY ACCOUNT</a>
      </nav>
      <section className={styles.catalog}>
        <header className={styles.catalogHeader}>
          <label className={styles.search}>
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" />
          </label>
          <div className={styles.categories}>
            {categories.map((item) => (
              <button type="button" className={category === item ? styles.activeCategory : ''} key={item} onClick={() => setCategory(item)}>
                {item.toUpperCase()}
              </button>
            ))}
          </div>
        </header>
        <div className={styles.productGrid}>
          {visibleProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              quantity={quantities[product.id] ?? 0}
              onAdd={() => updateQuantity(product.id, 1)}
              onChange={(quantity) => updateQuantity(product.id, quantity)}
            />
          ))}
          {visibleProducts.length === 0 && <p className={styles.noResults}>No products found.</p>}
        </div>
      </section>
      <Cart items={cartItems} onChange={updateQuantity} />
    </main>
  )
}
