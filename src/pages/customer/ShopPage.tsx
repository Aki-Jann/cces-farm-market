import { useEffect, useMemo, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes, type StorageReference } from 'firebase/storage'
import { CustomerSidebar } from '../../components/layout/CustomerSidebar'
import { Header } from '../../components/layout/Header'
import { ProductRating } from '../../components/common/ProductRating'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import { storage } from '../../firebase/storage'
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
  sold: number
}

type CartItem = Product & { quantity: number }
type FulfillmentType = 'delivery' | 'pickup'
type CheckoutDetails = {
  fulfillmentType: FulfillmentType
  sellerNotes: string
  receiptFile: File | null
}

type StoreSettings = {
  pickupLocation: string
  pickupDays: string
  pickupHours: string
  gcashAccountName: string
  gcashAccountNumber: string
  gcashQrUrl: string
  mayaAccountName: string
  mayaAccountNumber: string
  mayaQrUrl: string
}

const categories: Category[] = ['All', 'Vegetables', 'Fruits', 'Grains', 'Flowers']
const defaultStoreSettings: StoreSettings = {
  pickupLocation: '',
  pickupDays: '',
  pickupHours: '',
  gcashAccountName: '',
  gcashAccountNumber: '',
  gcashQrUrl: '',
  mayaAccountName: '',
  mayaAccountNumber: '',
  mayaQrUrl: '',
}
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

function readSavedCart(userId: string): Record<string, number> {
  try {
    const storedCart = localStorage.getItem(`cces-farm-market-cart:${userId}`)
    if (!storedCart) return {}

    const parsedCart: unknown = JSON.parse(storedCart)
    if (typeof parsedCart !== 'object' || parsedCart === null || Array.isArray(parsedCart)) return {}

    return Object.fromEntries(
      Object.entries(parsedCart).filter(([, quantity]) =>
        typeof quantity === 'number' && Number.isInteger(quantity) && quantity > 0
      )
    )
  } catch {
    return {}
  }
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
  const [quantityInput, setQuantityInput] = useState<string | null>(null)
  const canAddProduct = product.isAvailable && product.stock > 0
  const isOutOfStock = product.stock <= 0

  function commitQuantity() {
    const value = quantityInput ?? String(quantity)
    const parsedQuantity = Number(value)
    if (value.trim() === '' || !Number.isFinite(parsedQuantity)) {
      setQuantityInput(null)
      return
    }

    const nextQuantity = Math.max(Math.floor(parsedQuantity), 0)
    onChange(nextQuantity)
    setQuantityInput(null)
  }

  return (
    <article
      className={`${styles.productCard} ${quantity > 0 ? styles.selected : ''} ${canAddProduct ? styles.clickable : ''} ${isOutOfStock ? styles.outOfStock : ''}`}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('button, input')) return
        if (canAddProduct) onChange(Math.min(quantity + 1, product.stock))
      }}
    >
      <div className={styles.productImage}>
        <img src={product.image} alt={product.name} />
        <span className={`${styles.stockBadge} ${canAddProduct ? styles.available : styles.unavailable}`}>
          {isOutOfStock ? 'OUT OF STOCK' : product.isAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}
        </span>
      </div>
      <div className={styles.productMeta}>
        <div className={styles.productDetails}>
          <small className={styles.categoryLabel}>{product.category.toUpperCase()}</small>
          <strong>{product.name}</strong>
          <div className={styles.productMetrics}>
            <small className={styles.stockText}>{product.stock} {product.unit} in stock · {product.sold} sold</small>
            <ProductRating productId={product.id} showReviews />
          </div>
        </div>
        <div className={styles.productPrice}>
          <strong>{currency(product.price)}</strong>
          <small>PER {product.unit}</small>
        </div>
      </div>
      {quantity > 0 ? (
        <div className={styles.quantityControl}>
          <button type="button" aria-label={`Remove one ${product.name}`} onClick={() => onChange(quantity - 1)}>-</button>
          <input
            type="number"
            aria-label={`${product.name} quantity`}
            min={0}
            max={product.stock}
            step={1}
            inputMode="numeric"
            value={quantityInput ?? String(quantity)}
            onFocus={() => setQuantityInput(String(quantity))}
            onChange={(event) => setQuantityInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
            onBlur={commitQuantity}
          />
          <button
            type="button"
            aria-label={`Add one ${product.name}`}
            disabled={quantity >= product.stock}
            onClick={() => onChange(quantity + 1)}
          >+</button>
        </div>
      ) : product.stock <= 0 ? (
        <button type="button" className={`${styles.addButton} ${styles.outOfStockButton}`} disabled>OUT OF STOCK</button>
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
  onClearAll,
  address,
  onAddressChange,
  paymentMethod,
  onPaymentChange,
  onPlaceOrder,
  onEmptyCartAttempt,
  onAddressError,
  orderMessage,
  addressError,
  isCheckingOut,
  storeSettings,
  storeSettingsError,
}: {
  items: CartItem[]
  onChange: (id: string, quantity: number) => void
  onClearAll: () => void
  address: string
  onAddressChange: (address: string) => void
  paymentMethod: 'COD' | 'GCASH' | 'MAYA'
  onPaymentChange: (method: 'COD' | 'GCASH' | 'MAYA') => void
  onPlaceOrder: (details: CheckoutDetails) => void
  onEmptyCartAttempt: () => void
  onAddressError: (message: string) => void
  orderMessage: string
  addressError: string
  isCheckingOut: boolean
  storeSettings: StoreSettings
  storeSettingsError: string
}) {
  const [isEditingAddress, setIsEditingAddress] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('delivery')
  const [sellerNotes, setSellerNotes] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptError, setReceiptError] = useState('')
  const [revealedItemId, setRevealedItemId] = useState<string | null>(null)
  const cartItemPointerStart = useRef<{ x: number; y: number } | null>(null)
  const didSwipeCartItem = useRef(false)
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0)
  const delivery = subtotal > 0 ? 100 : 0
  const tax = subtotal * 0.05
  const total = subtotal + delivery + tax
  const paymentProviderName = paymentMethod === 'GCASH' ? 'GCash' : 'Maya'
  const paymentQrUrl = paymentMethod === 'GCASH' ? storeSettings.gcashQrUrl : storeSettings.mayaQrUrl
  const paymentAccountName = paymentMethod === 'GCASH' ? storeSettings.gcashAccountName : storeSettings.mayaAccountName
  const paymentAccountNumber = paymentMethod === 'GCASH' ? storeSettings.gcashAccountNumber : storeSettings.mayaAccountNumber

  function openCheckout() {
    if (fulfillmentType === 'delivery' && !address.trim()) {
      onAddressError('Delivery address is required.')
      setIsEditingAddress(true)
      return
    }
    onAddressError('')
    setReceiptError('')
    setIsCheckoutOpen(true)
  }

  function submitCheckout() {
    if (fulfillmentType === 'delivery' && !address.trim()) {
      onAddressError('Delivery address is required.')
      setIsCheckoutOpen(false)
      setIsEditingAddress(true)
      return
    }
    if (paymentMethod !== 'COD' && !receiptFile) {
      setReceiptError('Upload a screenshot of your payment receipt to continue.')
      return
    }
    onPlaceOrder({ fulfillmentType, sellerNotes: sellerNotes.trim(), receiptFile })
  }

  return (
    <aside className={styles.cart}>
      <div className={styles.cartHeading}>
        <div className={styles.cartHeadingTitle}>
          <h1>My Cart</h1>
          {items.length > 0 && <button type="button" className={styles.clearCartButton} onClick={onClearAll}>CLEAR CART</button>}
        </div>
        <div className={styles.deliveryAddress}>
          {isEditingAddress ? (
            <div className={styles.addressEditGroup}>
              <div className={styles.addressEditor}>
                <input
                  autoFocus
                  type="text"
                  aria-label="Delivery address"
                  aria-invalid={Boolean(addressError)}
                  aria-describedby={addressError ? 'delivery-address-error' : undefined}
                  value={address}
                  onChange={(event) => onAddressChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      if (address.trim()) setIsEditingAddress(false)
                    }
                  }}
                  placeholder="Enter delivery address"
                />
                <button type="button" aria-label="Save delivery address" onClick={() => {
                  if (address.trim()) setIsEditingAddress(false)
                }}>
                  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
                </button>
              </div>
              {addressError && <p className={styles.addressError} id="delivery-address-error" role="alert">{addressError}</p>}
            </div>
          ) : (
            <>
              <button
                type="button"
                className={styles.addressText}
                aria-label="Edit delivery address"
                onClick={() => setIsEditingAddress(true)}
              >
                {address || 'Add delivery address'}
              </button>
              <button type="button" aria-label="Edit delivery address" onClick={() => setIsEditingAddress(true)}>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>
              </button>
            </>
          )}
        </div>
      </div>
      <div className={styles.cartItems}>
        {items.length === 0 ? (
          <div className={styles.emptyCart} role="status">
            <span className={styles.emptyCartIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="m5 10 1 10h12l1-10M3 10h18l-2-6H5zM9 14v2m6-2v2" /></svg>
            </span>
            <strong>Your cart is empty</strong>
            <p>Fresh finds are waiting. Add a few favorites to get started.</p>
          </div>
        ) : items.map((item) => (
          <div
            className={`${styles.cartItemShell} ${revealedItemId === item.id ? styles.cartItemShellRevealed : ''}`}
            key={item.id}
            onPointerDown={(event) => {
              cartItemPointerStart.current = { x: event.clientX, y: event.clientY }
              didSwipeCartItem.current = false
            }}
            onPointerUp={(event) => {
              const start = cartItemPointerStart.current
              cartItemPointerStart.current = null
              if (!start) return

              const deltaX = event.clientX - start.x
              const deltaY = event.clientY - start.y
              if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY)) return

              didSwipeCartItem.current = true
              setRevealedItemId(deltaX < 0 ? item.id : null)
              window.setTimeout(() => { didSwipeCartItem.current = false }, 0)
            }}
            onPointerCancel={() => { cartItemPointerStart.current = null }}
            onClick={(event) => {
              if (didSwipeCartItem.current) return
              if (event.target instanceof Element && event.target.closest('button')) return
              setRevealedItemId((current) => current === item.id ? null : item.id)
            }}
          >
            <button
              type="button"
              className={styles.cartItemDelete}
              aria-label={`Remove ${item.name} from cart`}
              aria-hidden={revealedItemId !== item.id}
              disabled={revealedItemId !== item.id}
              onClick={() => {
                onChange(item.id, 0)
                setRevealedItemId(null)
              }}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></svg>
            </button>
            <div className={`${styles.cartItem} ${revealedItemId === item.id ? styles.cartItemPriceShift : ''}`}>
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
        <button type="button" className={styles.placeOrder} disabled={isCheckingOut} onClick={() => {
          if (items.length === 0) {
            onEmptyCartAttempt()
            return
          }
          openCheckout()
        }}>PLACE ORDER</button>
        {orderMessage && <p role="status">{orderMessage}</p>}
      </div>
      {isCheckoutOpen && (
        <div className={styles.checkoutOverlay} onClick={(event) => {
          if (event.target === event.currentTarget && !isCheckingOut) setIsCheckoutOpen(false)
        }}>
          <section className={styles.checkoutModal} role="dialog" aria-modal="true" aria-labelledby="checkout-title">
            <div className={styles.checkoutHeader}>
              <h2 id="checkout-title">Complete your order</h2>
              <button type="button" aria-label="Close checkout" disabled={isCheckingOut} onClick={() => setIsCheckoutOpen(false)}>×</button>
            </div>
            {storeSettingsError && <p className={styles.storeSettingsError} role="alert">{storeSettingsError}</p>}
            <fieldset className={styles.fulfillmentOptions}>
              <legend>How would you like to receive your order?</legend>
              <label className={fulfillmentType === 'delivery' ? styles.optionSelected : ''}>
                <input type="radio" name="fulfillment" checked={fulfillmentType === 'delivery'} onChange={() => setFulfillmentType('delivery')} />
                Delivery
              </label>
              <label className={fulfillmentType === 'pickup' ? styles.optionSelected : ''}>
                <input type="radio" name="fulfillment" checked={fulfillmentType === 'pickup'} onChange={() => setFulfillmentType('pickup')} />
                Pickup
              </label>
            </fieldset>
            {fulfillmentType === 'delivery' ? (
              <p className={styles.checkoutAddress}>Delivering to: {address}</p>
            ) : (
              <div className={styles.pickupDetails}>
                <p><strong>Pickup location:</strong> {storeSettings.pickupLocation || 'To be confirmed by the seller.'}</p>
                {storeSettings.pickupDays && <p><strong>Pickup days:</strong> {storeSettings.pickupDays}</p>}
                {storeSettings.pickupHours && <p><strong>Pickup hours:</strong> {storeSettings.pickupHours}</p>}
              </div>
            )}
            <label className={styles.sellerNotes}>
              <span>Note to seller <small>(optional)</small></span>
              <textarea value={sellerNotes} onChange={(event) => setSellerNotes(event.target.value)} placeholder="Add instructions for the seller" rows={3} />
            </label>
            <p className={styles.messagePrompt}>Need to discuss your order? <a href="#/messages">Message the seller</a></p>
            {paymentMethod !== 'COD' && (
              <div className={styles.onlinePayment}>
                <h3>Pay with {paymentProviderName}</h3>
                <div className={styles.qrPlaceholder}>
                  {paymentQrUrl ? (
                    <img
                      className={styles.paymentQr}
                      src={paymentQrUrl}
                      alt={`${paymentProviderName} payment QR code`}
                    />
                  ) : null}
                  {!paymentQrUrl && (
                    <>
                      <span>QR</span>
                      <strong>{paymentProviderName} QR not configured</strong>
                      <small>Contact the seller for payment details before paying.</small>
                    </>
                  )}
                  {paymentAccountName && <strong>{paymentAccountName}</strong>}
                  {paymentAccountNumber && <small>{paymentAccountNumber}</small>}
                </div>
                <label className={styles.receiptUpload}>
                  <span>Payment receipt screenshot</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      if (file && file.size > 5 * 1024 * 1024) {
                        setReceiptFile(null)
                        setReceiptError('Receipt images must be 5 MB or smaller.')
                        return
                      }
                      setReceiptFile(file)
                      setReceiptError('')
                    }}
                  />
                </label>
                {receiptFile && <p className={styles.receiptName}>{receiptFile.name}</p>}
                {receiptError && <p className={styles.checkoutError} role="alert">{receiptError}</p>}
              </div>
            )}
            {orderMessage && <p className={styles.checkoutError} role="alert">{orderMessage}</p>}
            <div className={styles.checkoutActions}>
              <button type="button" disabled={isCheckingOut} onClick={() => setIsCheckoutOpen(false)}>Cancel</button>
              <button type="button" disabled={isCheckingOut} onClick={submitCheckout}>
                {isCheckingOut ? 'PLACING ORDER...' : paymentMethod === 'COD' ? 'PLACE ORDER' : 'UPLOAD RECEIPT & PLACE ORDER'}
              </button>
            </div>
          </section>
        </div>
      )}
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
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [addressError, setAddressError] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'GCASH' | 'MAYA'>('COD')
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(defaultStoreSettings)
  const [storeSettingsError, setStoreSettingsError] = useState('')
  const [orderMessage, setOrderMessage] = useState('')
  const [quantityNotice, setQuantityNotice] = useState<{ message: string } | null>(null)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const cartOwnerId = useRef<string | null>(null)

  useEffect(() => {
    const userId = cartOwnerId.current
    if (!userId) return

    try {
      localStorage.setItem(`cces-farm-market-cart:${userId}`, JSON.stringify(quantities))
    } catch (storageError) {
      console.error('Saving cart failed:', storageError)
    }
  }, [quantities])

  useEffect(() => {
    if (!quantityNotice) return

    const timeoutId = window.setTimeout(() => setQuantityNotice(null), 2800)
    return () => window.clearTimeout(timeoutId)
  }, [quantityNotice])

  useEffect(() => {
    let isMounted = true
    let unsubscribeProducts: (() => void) | undefined
    let unsubscribeStoreSettings: (() => void) | undefined

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      // Tear down any previous products listener before attaching a new one.
      if (unsubscribeProducts) {
        unsubscribeProducts()
        unsubscribeProducts = undefined
      }
      unsubscribeStoreSettings?.()
      unsubscribeStoreSettings = undefined

      if (!user) {
        if (isMounted) {
          cartOwnerId.current = null
          setQuantities({})
          setDeliveryAddress('')
          setStoreSettings(defaultStoreSettings)
          setStoreSettingsError('')
          setIsLoading(false)
          setError('Please log in to view the shop.')
        }
        return
      }

      cartOwnerId.current = user.uid
      setQuantities(readSavedCart(user.uid))
      unsubscribeStoreSettings = onSnapshot(
        doc(db, 'settings', 'storefront'),
        (snapshot) => {
          if (!isMounted) return
          if (!snapshot.exists()) {
            setStoreSettings(defaultStoreSettings)
            setStoreSettingsError('')
            return
          }
          const data = snapshot.data()
          setStoreSettings({
            pickupLocation: typeof data.pickupLocation === 'string' ? data.pickupLocation : '',
            pickupDays: typeof data.pickupDays === 'string' ? data.pickupDays : '',
            pickupHours: typeof data.pickupHours === 'string' ? data.pickupHours : '',
            gcashAccountName: typeof data.gcashAccountName === 'string' ? data.gcashAccountName : '',
            gcashAccountNumber: typeof data.gcashAccountNumber === 'string' ? data.gcashAccountNumber : '',
            gcashQrUrl: typeof data.gcashQrUrl === 'string' ? data.gcashQrUrl : '',
            mayaAccountName: typeof data.mayaAccountName === 'string' ? data.mayaAccountName : '',
            mayaAccountNumber: typeof data.mayaAccountNumber === 'string' ? data.mayaAccountNumber : '',
            mayaQrUrl: typeof data.mayaQrUrl === 'string' ? data.mayaQrUrl : '',
          })
          setStoreSettingsError('')
        },
        (settingsError) => {
          console.error('Loading store settings for checkout failed:', settingsError)
          setStoreSettingsError('Store pickup and payment settings could not be loaded. Contact the seller before paying or arranging pickup.')
        }
      )

      void getDoc(doc(db, 'users', user.uid))
        .then((profileSnapshot) => {
          if (!isMounted || auth.currentUser?.uid !== user.uid) return
          setDeliveryAddress(
            profileSnapshot.exists() && typeof profileSnapshot.data().address === 'string'
              ? profileSnapshot.data().address
              : ''
          )
        })
        .catch((profileError) => {
          console.error('Loading delivery address failed:', profileError)
        })

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
              sold: typeof data.sold === 'number' && Number.isFinite(data.sold) ? data.sold : 0,
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
      unsubscribeStoreSettings?.()
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
    const currentQuantity = quantities[id] ?? 0
    if (
      product.isAvailable &&
      product.stock > 0 &&
      quantity >= product.stock &&
      (currentQuantity < product.stock || quantity > product.stock)
    ) {
      setQuantityNotice({ message: `Maximum quantity reached for ${product.name}.` })
    }
    if (quantity > 0 && (!product.isAvailable || product.stock <= 0)) return

    setQuantities((current) => {
      const next = { ...current }
      if (quantity <= 0) delete next[id]
      else next[id] = Math.min(quantity, product.stock)
      return next
    })
  }

  async function placeOrder({ fulfillmentType, sellerNotes, receiptFile }: CheckoutDetails) {
    if (cartItems.length === 0) return
    if (fulfillmentType === 'pickup' && !storeSettings.pickupLocation.trim()) {
      setOrderMessage('Pickup location is not configured yet. Please contact the seller.')
      return
    }
    const paymentQrUrl = paymentMethod === 'GCASH' ? storeSettings.gcashQrUrl : storeSettings.mayaQrUrl
    if (paymentMethod !== 'COD' && !paymentQrUrl) {
      setOrderMessage('The selected payment QR code is not configured yet. Please contact the seller.')
      return
    }
    const addressForOrder = fulfillmentType === 'delivery' ? deliveryAddress.trim() : ''
    if (fulfillmentType === 'delivery' && !addressForOrder) {
      setAddressError('Delivery address is required.')
      return
    }
    setAddressError('')
    if (paymentMethod !== 'COD' && !receiptFile) {
      setOrderMessage('Upload a screenshot of your payment receipt to continue.')
      return
    }
    if (receiptFile && !['image/jpeg', 'image/png', 'image/webp'].includes(receiptFile.type)) {
      setOrderMessage('Upload a JPG, PNG, or WebP receipt image.')
      return
    }
    if (receiptFile && receiptFile.size > 5 * 1024 * 1024) {
      setOrderMessage('Receipt images must be 5 MB or smaller.')
      return
    }
    const user = auth.currentUser
    if (!user) {
      setOrderMessage('Please log in before placing an order.')
      return
    }

    setIsCheckingOut(true)
    setOrderMessage('')
    let uploadedReceiptRef: StorageReference | null = null

    try {
      const profileSnapshot = await getDoc(doc(db, 'users', user.uid))
      if (!profileSnapshot.exists()) {
        setOrderMessage('Your customer profile could not be found. Please contact support.')
        return
      }

      const profile = profileSnapshot.data()
      const subtotal = cartItems.reduce((sum, item) => sum + item.quantity * item.price, 0)
      const deliveryFee = fulfillmentType === 'delivery' && subtotal > 0 ? 100 : 0
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
      let paymentReceiptUrl = ''
      if (receiptFile) {
        uploadedReceiptRef = ref(storage, `payment-receipts/${user.uid}/${orderRef.id}/${Date.now()}-${receiptFile.name}`)
        const uploadedReceipt = await uploadBytes(uploadedReceiptRef, receiptFile, { contentType: receiptFile.type })
        paymentReceiptUrl = await getDownloadURL(uploadedReceipt.ref)
      }
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
          const sold = typeof productData.sold === 'number' && Number.isFinite(productData.sold)
            ? productData.sold
            : 0
          transaction.update(ref, {
            stock: remainingStock,
            sold: sold + item.quantity,
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
          paymentStatus: paymentMethod === 'COD' ? 'unpaid' : 'awaiting_verification',
          status: 'pending',
          fulfillmentType,
          deliveryAddress: fulfillmentType === 'pickup'
            ? storeSettings.pickupLocation || 'Pickup location to be confirmed by the seller.'
            : addressForOrder,
          pickupHours: fulfillmentType === 'pickup' ? storeSettings.pickupHours : '',
          pickupDays: fulfillmentType === 'pickup' ? storeSettings.pickupDays : '',
          sellerNotes,
          paymentReceiptUrl,
          createdAt: serverTimestamp(),
        })
      })

      try {
        localStorage.removeItem(`cces-farm-market-cart:${user.uid}`)
      } catch (storageError) {
        console.error('Clearing saved cart failed:', storageError)
      }
      setQuantities({})
      window.location.hash = '/orders'
    } catch (checkoutError) {
      console.error('Checkout failed:', checkoutError)
      if (uploadedReceiptRef) {
        try {
          await deleteObject(uploadedReceiptRef)
        } catch (cleanupError) {
          console.error('Cleaning up unused payment receipt failed:', cleanupError)
        }
      }
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
          title="SHOP"
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
          {!isLoading && !error && visibleProducts.length === 0 && (
            <div className={styles.searchEmptyState} role="status" aria-live="polite">
              <span className={styles.searchEmptyIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>
              </span>
              <div className={styles.searchEmptyCopy}>
                <strong>{search.trim() ? 'No matching products' : category === 'All' ? 'No products found' : `No products in ${category.toLowerCase()}`}</strong>
                <p>{search.trim()
                  ? `No products match “${search.trim()}”. Try another search or clear it.`
                  : category === 'All'
                    ? 'There are no products available right now.'
                    : `There are no products in ${category.toLowerCase()} right now. Browse all products instead.`}</p>
              </div>
              {search.trim() ? (
                <button className={styles.clearProductSearch} type="button" onClick={() => setSearch('')}>Clear search</button>
              ) : category !== 'All' ? (
                <button className={styles.clearProductSearch} type="button" onClick={() => setCategory('All')}>View all products</button>
              ) : null}
            </div>
          )}
        </div>
      </section>
      <Cart items={cartItems} onChange={updateQuantity} onClearAll={() => setQuantities({})} address={deliveryAddress} onAddressChange={(value) => {
        setDeliveryAddress(value)
        if (value.trim()) setAddressError('')
      }} paymentMethod={paymentMethod} onPaymentChange={setPaymentMethod} onPlaceOrder={placeOrder} onEmptyCartAttempt={() => {
        setQuantityNotice({ message: 'Add products to your cart before placing an order.' })
      }} onAddressError={setAddressError} orderMessage={orderMessage} addressError={addressError} isCheckingOut={isCheckingOut} storeSettings={storeSettings} storeSettingsError={storeSettingsError} />
      {quantityNotice && <div className={styles.quantityToast} role="status" aria-live="polite">{quantityNotice.message}</div>}
    </main>
  )
}
