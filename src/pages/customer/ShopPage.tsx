import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { CustomerSidebar } from '../../components/layout/CustomerSidebar'
import { Header } from '../../components/layout/Header'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import { productImages, resolveProductImage } from '../../utils/productImages'
import styles from './ShopPage.module.css'

type Category = 'All' | 'Vegetables' | 'Fruits' | 'Grains' | 'Flowers'

type Product = {
  id: string
  name: string
  category: Exclude<Category, 'All'>
  price: number
  stock: number
  unit: string
  image: string
  isAvailable: boolean
}

type CartItem = Product & { quantity: number }

const categories: Category[] = ['All', 'Vegetables', 'Fruits', 'Grains', 'Flowers']
const localImages: Record<string, string> = {
  APPLE: productImages['shop-apple.png'],
  BANANA: productImages['shop-banana.png'],
  'BELL PEPPER': productImages['shop-pepper.png'],
  CABBAGE: productImages['shop-cabbage.png'],
  CARROT: productImages['shop-carrot.png'],
  CORN: productImages['shop-corn.png'],
  CUCUMBER: productImages['shop-cucumber.png'],
  GUAVA: productImages['shop-guava.png'],
  GUMAMELA: productImages['shop-gumamela.png'],
}

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
          <strong>{currency(product.price)}</strong>
          <small>{product.stock}{product.unit} Stock</small>
        </div>
      </div>
      {quantity > 0 ? (
        <div className={styles.quantityControl}>
          <button type="button" aria-label={`Remove one ${product.name}`} onClick={() => onChange(quantity - 1)}>-</button>
          <span>{quantity}</span>
          <button type="button" aria-label={`Add one ${product.name}`} onClick={() => onChange(quantity + 1)}>+</button>
        </div>
      ) : product.stock <= 0 ? (
        <button type="button" className={styles.addButton} disabled>OUT OF STOCK</button>
      ) : !product.isAvailable ? (
        <button type="button" className={styles.addButton} disabled>UNAVAILABLE</button>
      ) : (
        <button type="button" className={styles.addButton} onClick={onAdd}>ADD TO CART</button>
      )}
    </article>
  )
}

function Cart({
  items,
  onChange,
  paymentMethod,
  onPaymentChange,
  onPlaceOrder,
  orderMessage,
  isCheckingOut,
}: {
  items: CartItem[]
  onChange: (id: string, quantity: number) => void
  paymentMethod: 'COD' | 'GCASH' | 'MAYA'
  onPaymentChange: (method: 'COD' | 'GCASH' | 'MAYA') => void
  onPlaceOrder: () => void
  orderMessage: string
  isCheckingOut: boolean
}) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0)
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
              <span>{currency(item.price)}<small>{item.quantity}x</small></span>
            </div>
            <strong>{currency(item.quantity * item.price)}</strong>
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
          {(['COD', 'GCASH', 'MAYA'] as const).map((method) => <button type="button" className={paymentMethod === method ? styles.activePayment : ''} key={method} onClick={() => onPaymentChange(method)}>{method}</button>)}
        </div>
        <button type="button" className={styles.placeOrder} disabled={items.length === 0 || isCheckingOut} onClick={onPlaceOrder}>{isCheckingOut ? 'PLACING ORDER...' : 'PLACE ORDER'}</button>
        {orderMessage && <p role="status">{orderMessage}</p>}
      </div>
    </aside>
  )
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={strong ? styles.strongRow : ''}><span>{label}</span><span>{value}</span></div>
}

export function ShopPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [category, setCategory] = useState<Category>('All')
  const [search, setSearch] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'GCASH' | 'MAYA'>('COD')
  const [orderMessage, setOrderMessage] = useState('')
  const [isCheckingOut, setIsCheckingOut] = useState(false)

  useEffect(() => {
    let isMounted = true
    let unsubscribeProducts: (() => void) | undefined

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      // Tear down any previous products listener before attaching a new one.
      if (unsubscribeProducts) {
        unsubscribeProducts()
        unsubscribeProducts = undefined
      }

      if (!user) {
        if (isMounted) {
          setIsLoading(false)
          setError('Please log in to view the shop.')
        }
        return
      }

      unsubscribeProducts = onSnapshot(
        collection(db, 'products'),
        (snapshot) => {
          if (!isMounted) return
          const loadedProducts = snapshot.docs.flatMap((product) => {
            const data = product.data()
            const name = typeof data.name === 'string' ? data.name.toUpperCase() : ''
            const rawCategory = typeof data.category === 'string' ? data.category.toLowerCase() : ''
            const categoryName = rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1)
            if (!categories.includes(categoryName as Category) || categoryName === 'All') return []

            return [{
              id: product.id,
              name,
              category: categoryName as Exclude<Category, 'All'>,
              price: typeof data.price === 'number' ? data.price : 0,
              stock: typeof data.stock === 'number' ? data.stock : 0,
              unit: typeof data.unit === 'string' ? data.unit : 'KG',
              image: resolveProductImage(data.imageUrl, localImages[name] ?? 'shop-apple.png'),
              isAvailable: typeof data.isAvailable === 'boolean' ? data.isAvailable : true,
            }]
          })
          setProducts(loadedProducts)
          setError('')
          setIsLoading(false)
        },
        (loadError) => {
          console.error('Loading shop products failed:', loadError)
          if (isMounted) {
            setError('Unable to load products. Please try again.')
            setIsLoading(false)
          }
        }
      )
    })

    return () => {
      isMounted = false
      unsubscribeAuth()
      if (unsubscribeProducts) unsubscribeProducts()
    }
  }, [])

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) => {
      const matchesCategory = category === 'All' || product.category === category
      const matchesSearch = !query || product.name.toLowerCase().includes(query)
      return matchesCategory && matchesSearch
    })
  }, [category, products, search])

  const cartItems = products
    .filter((product) => (quantities[product.id] ?? 0) > 0)
    .map((product) => ({ ...product, quantity: quantities[product.id] }))

  function updateQuantity(id: string, quantity: number) {
    const product = products.find((item) => item.id === id)
    if (!product) return
    if (quantity > 0 && (!product.isAvailable || product.stock <= 0)) return

    setQuantities((current) => {
      const next = { ...current }
      if (quantity <= 0) delete next[id]
      else next[id] = Math.min(quantity, product.stock)
      return next
    })
  }

  async function placeOrder() {
    if (cartItems.length === 0) return
    const user = auth.currentUser
    if (!user) {
      setOrderMessage('Please log in before placing an order.')
      return
    }

    setIsCheckingOut(true)
    setOrderMessage('')

    try {
      const profileSnapshot = await getDoc(doc(db, 'users', user.uid))
      if (!profileSnapshot.exists()) {
        setOrderMessage('Your customer profile could not be found. Please contact support.')
        return
      }

      const profile = profileSnapshot.data()
      const subtotal = cartItems.reduce((sum, item) => sum + item.quantity * item.price, 0)
      const deliveryFee = subtotal > 0 ? 100 : 0
      const tax = subtotal * 0.05
      const total = subtotal + deliveryFee + tax
      const items = cartItems.map((item) => ({
        productId: item.id,
        name: item.name,
        price: Number(item.price),
        quantity: Number(item.quantity),
        unit: item.unit,
      }))

      const orderRef = doc(collection(db, 'orders'))
      const productRefs = cartItems.map((item) => ({
        item,
        ref: doc(db, 'products', item.id),
      }))

      await runTransaction(db, async (transaction) => {
        const productSnapshots = await Promise.all(productRefs.map(({ ref }) => transaction.get(ref)))

        productSnapshots.forEach((productSnapshot, index) => {
          const { item, ref } = productRefs[index]
          if (!productSnapshot.exists()) {
            throw new Error('PRODUCT_NOT_FOUND')
          }

          const productData = productSnapshot.data()
          const stock = typeof productData.stock === 'number' ? productData.stock : 0
          if (productData.isAvailable !== true || item.quantity > stock) {
            throw new Error('INSUFFICIENT_STOCK')
          }

          const remainingStock = stock - item.quantity
          transaction.update(ref, {
            stock: remainingStock,
          })
        })

        transaction.set(orderRef, {
          orderNumber: `ORD-${Date.now()}`,
          userId: user.uid,
          customerName: `${typeof profile.firstName === 'string' ? profile.firstName : ''} ${typeof profile.lastName === 'string' ? profile.lastName : ''}`.trim(),
          customerEmail: typeof profile.email === 'string' ? profile.email : user.email ?? '',
          items,
          subtotal: Number(subtotal),
          deliveryFee: Number(deliveryFee),
          tax: Number(tax),
          total: Number(total),
          paymentMethod,
          status: 'pending',
          deliveryAddress: typeof profile.address === 'string' ? profile.address : '',
          createdAt: serverTimestamp(),
        })
      })

      setQuantities({})
      window.location.hash = '/orders'
    } catch (checkoutError) {
      console.error('Checkout failed:', checkoutError)
      if (checkoutError instanceof Error && checkoutError.message === 'PRODUCT_NOT_FOUND') {
        setOrderMessage('One or more products are no longer available.')
      } else if (checkoutError instanceof Error && checkoutError.message === 'INSUFFICIENT_STOCK') {
        setOrderMessage('The requested quantity is no longer available. Please review your cart.')
      } else {
        setOrderMessage('Unable to place your order. Please try again.')
      }
    } finally {
      setIsCheckingOut(false)
    }
  }

  return (
    <main className={styles.shop}>
      <CustomerSidebar active="shop" />
      <section className={styles.catalog}>
        <Header
          className={styles.catalogHeader}
          search={search}
          onSearchChange={(event) => setSearch(event.target.value)}
          secondary={<div className={styles.categories}>{categories.map((item) => (
            <button type="button" className={category === item ? styles.activeCategory : ''} key={item} onClick={() => setCategory(item)}>
              {item.toUpperCase()}
            </button>
          ))}</div>}
        />
        <div className={styles.productGrid}>
          {isLoading && <p className={styles.noResults}>Loading products...</p>}
          {!isLoading && error && <p className={styles.noResults} role="alert">{error}</p>}
          {!isLoading && !error && visibleProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              quantity={quantities[product.id] ?? 0}
              onAdd={() => updateQuantity(product.id, 1)}
              onChange={(quantity) => updateQuantity(product.id, quantity)}
            />
          ))}
          {!isLoading && !error && visibleProducts.length === 0 && <p className={styles.noResults}>{search.trim() ? 'No products match your search.' : 'No products found.'}</p>}
        </div>
      </section>
      <Cart items={cartItems} onChange={updateQuantity} paymentMethod={paymentMethod} onPaymentChange={setPaymentMethod} onPlaceOrder={placeOrder} orderMessage={orderMessage} isCheckingOut={isCheckingOut} />
    </main>
  )
}
