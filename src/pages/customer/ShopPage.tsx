import { useEffect, useMemo, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { CustomerSidebar } from '../../components/layout/CustomerSidebar'
import { Header } from '../../components/layout/Header'
import { ProductRating } from '../../components/common/ProductRating'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import { normalizeRole, ROLES } from '../../constants/roles'
import { uploadImageToCloudinary } from '../../utils/cloudinary'
import { getFarmerDisplayName } from '../../utils/farmerDisplayName'
import { productImages, resolveProductImage } from '../../utils/productImages'
import styles from './ShopPage.module.css'

type Category = string

type Product = {
  id: string
  farmerId?: string
  farmName: string
  name: string
  category: string
  price: number
  stock: number
  unit: string
  image: string
  isAvailable: boolean
  sold: number
}

type CartItem = Product & { quantity: number }
type FulfillmentType = 'delivery' | 'pickup'
type PaymentMethod = 'COD' | 'GCASH' | 'MAYA'
type FarmerStoreSettings = StoreSettings & {
  farmName: string
  status: 'active' | 'suspended' | 'loading' | 'unconfigured'
}
type CheckoutDetails = {
  fulfillmentType: FulfillmentType
  sellerNotes: string
  paymentMethod: PaymentMethod
  receiptFile: File | null
}

type StoreSettings = {
  deliveryFee: number
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

const defaultCategories = ['VEGETABLES', 'FRUITS', 'GRAINS', 'FLOWERS']
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

function notifyOrder(orderId: string) {
  void (async () => {
    const user = auth.currentUser
    if (!user) throw new Error('Cannot notify about an order without an authenticated user.')
    const token = await user.getIdToken()
    const response = await fetch('/api/notify-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId }),
    })
    if (!response.ok) throw new Error(`Order notification request failed with status ${response.status}.`)
  })().catch((notifyError: unknown) => {
    console.error('Email notification failed:', notifyError)
  })
}

function readStoreSettings(data: Record<string, unknown>, fallbackName: string): FarmerStoreSettings {
  return {
    farmName: getFarmerDisplayName(data, fallbackName),
    status: data.status === 'suspended' ? 'suspended' : data.status === 'loading' ? 'loading' : 'active',
    deliveryFee: typeof data.deliveryFee === 'number' && Number.isInteger(data.deliveryFee) && data.deliveryFee >= 0
      ? data.deliveryFee
      : 100,
    pickupLocation: typeof data.pickupLocation === 'string' ? data.pickupLocation : '',
    pickupDays: typeof data.pickupDays === 'string' ? data.pickupDays : '',
    pickupHours: typeof data.pickupHours === 'string' ? data.pickupHours : '',
    gcashAccountName: typeof data.gcashAccountName === 'string' ? data.gcashAccountName : '',
    gcashAccountNumber: typeof data.gcashAccountNumber === 'string' ? data.gcashAccountNumber : '',
    gcashQrUrl: typeof data.gcashQrUrl === 'string' ? data.gcashQrUrl : '',
    mayaAccountName: typeof data.mayaAccountName === 'string' ? data.mayaAccountName : '',
    mayaAccountNumber: typeof data.mayaAccountNumber === 'string' ? data.mayaAccountNumber : '',
    mayaQrUrl: typeof data.mayaQrUrl === 'string' ? data.mayaQrUrl : '',
  }
}

function hasRequiredStoreSettings(settings: FarmerStoreSettings) {
  const pickupConfigured = Boolean(settings.pickupLocation.trim())
  const paymentConfigured = Boolean(
    settings.gcashAccountName.trim() && settings.gcashAccountNumber.trim() && settings.gcashQrUrl.trim()
    || settings.mayaAccountName.trim() && settings.mayaAccountNumber.trim() && settings.mayaQrUrl.trim()
  )
  return pickupConfigured && paymentConfigured
}

function cartGroups(items: CartItem[], stores: Record<string, FarmerStoreSettings>, fulfillmentType: FulfillmentType) {
  const grouped = new Map<string, { farmerId: string; farmName: string; items: CartItem[]; subtotal: number; deliveryFee: number; tax: number; total: number; settings: FarmerStoreSettings }>()
  items.forEach((item) => {
    const farmerId = item.farmerId ?? ''
    const key = farmerId || 'unassigned'
    const group = grouped.get(key)
    if (group) {
      group.items.push(item)
      group.subtotal += item.quantity * item.price
    } else {
      const settings = stores[key] ?? readStoreSettings({}, item.farmName || 'Farm')
      grouped.set(key, {
        farmerId,
        farmName: settings.farmName || item.farmName || 'Farm',
        items: [item],
        subtotal: item.quantity * item.price,
        deliveryFee: 0,
        tax: 0,
        total: 0,
        settings,
      })
    }
  })

  return [...grouped.values()].map((group) => {
    const deliveryFee = fulfillmentType === 'delivery' && group.subtotal > 0 ? group.settings.deliveryFee : 0
    const tax = group.subtotal * 0.05
    return { ...group, deliveryFee, tax, total: group.subtotal + deliveryFee + tax }
  })
}

function isFarmerActive(product: Product, stores: Record<string, FarmerStoreSettings>) {
  const store = stores[product.farmerId || '']
  return store?.status === 'active'
    && Boolean(store && hasRequiredStoreSettings(store))
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
          <small className={styles.farmName}>{product.farmName || 'Local farm'}</small>
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
  onPlaceOrder,
  onEmptyCartAttempt,
  onAddressError,
  orderMessage,
  cartRestriction,
  addressError,
  isCheckingOut,
  farmerStores,
  storeSettingsError,
}: {
  items: CartItem[]
  onChange: (id: string, quantity: number) => void
  onClearAll: () => void
  address: string
  onAddressChange: (address: string) => void
  onPlaceOrder: (details: CheckoutDetails) => void
  onEmptyCartAttempt: () => void
  onAddressError: (message: string) => void
  orderMessage: string
  cartRestriction: string
  addressError: string
  isCheckingOut: boolean
  farmerStores: Record<string, FarmerStoreSettings>
  storeSettingsError: string
}) {
  const [isEditingAddress, setIsEditingAddress] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('delivery')
  const [sellerNotes, setSellerNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptError, setReceiptError] = useState('')
  const [revealedItemId, setRevealedItemId] = useState<string | null>(null)
  const cartItemPointerStart = useRef<{ x: number; y: number } | null>(null)
  const didSwipeCartItem = useRef(false)
  const groups = cartGroups(items, farmerStores, fulfillmentType)
  const subtotal = groups.reduce((sum, group) => sum + group.subtotal, 0)
  const delivery = groups.reduce((sum, group) => sum + group.deliveryFee, 0)
  const tax = groups.reduce((sum, group) => sum + group.tax, 0)
  const total = groups.reduce((sum, group) => sum + group.total, 0)
  const group = groups[0]
  const paymentProviderName = paymentMethod === 'GCASH' ? 'GCash' : 'Maya'
  const paymentQrUrl = paymentMethod === 'GCASH' ? group?.settings.gcashQrUrl : group?.settings.mayaQrUrl
  const paymentAccountName = paymentMethod === 'GCASH' ? group?.settings.gcashAccountName : group?.settings.mayaAccountName
  const paymentAccountNumber = paymentMethod === 'GCASH' ? group?.settings.gcashAccountNumber : group?.settings.mayaAccountNumber

  useEffect(() => {
    if (!isConfirmOpen) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsConfirmOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isConfirmOpen])

  function openCheckout() {
    if (groups.length !== 1) {
      onAddressError('')
      setReceiptError('Your cart can only contain products from one farmer. Clear your cart and try again.')
      return
    }
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
    if (groups.length !== 1 || !group) {
      setReceiptError('Your cart can only contain products from one farmer. Clear your cart and try again.')
      return
    }
    if ((paymentMethod === 'GCASH' || paymentMethod === 'MAYA') && !paymentQrUrl) {
      setReceiptError(`${group.farmName} has not configured the selected payment QR code.`)
      return
    }
    if (paymentMethod !== 'COD' && !receiptFile) {
      setReceiptError('Upload a payment receipt to continue.')
      return
    }
    setIsConfirmOpen(true)
  }

  function confirmOrder() {
    setIsConfirmOpen(false)
    onPlaceOrder({
      fulfillmentType,
      sellerNotes: sellerNotes.trim(),
      paymentMethod,
      receiptFile,
    })
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
        ) : groups.map((group) => (
          <section className={styles.cartFarmerGroup} key={group.farmerId || 'unassigned'}>
            <h2>Farm: {group.farmName}</h2>
            {group.items.map((item) => (
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
          </section>
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
        <div className={styles.paymentOptions} role="group" aria-label="Payment method">
          {(['COD', 'GCASH', 'MAYA'] as const).map((method) => (
            <button
              type="button"
              className={paymentMethod === method ? styles.activePayment : ''}
              key={method}
              onClick={() => {
                setPaymentMethod(method)
                setReceiptError('')
              }}
            >
              {method}
            </button>
          ))}
        </div>
        {cartRestriction && (
          <div className={styles.cartRestriction} role="alert">
            <p>{cartRestriction}</p>
            <button type="button" onClick={onClearAll}>Clear cart</button>
          </div>
        )}
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
            {fulfillmentType === 'delivery' && (
              <p className={styles.checkoutAddress}>Delivering to: {address}</p>
            )}
            {group && (
              <section className={styles.checkoutFarmerGroup}>
                    <h3>{group.farmName}</h3>
                    <div className={styles.pickupDetails}>
                      <p><strong>Subtotal:</strong> {currency(group.subtotal)}</p>
                      <p><strong>Delivery fee:</strong> {currency(group.deliveryFee)}</p>
                      <p><strong>Tax:</strong> {currency(group.tax)}</p>
                      <p><strong>Order total:</strong> {currency(group.total)}</p>
                    </div>
                    <div className={styles.pickupDetails}>
                        {fulfillmentType === 'pickup' && (
                        <>
                          <p><strong>Pickup location:</strong> {group.settings.pickupLocation || 'To be confirmed by the seller.'}</p>
                          {group.settings.pickupDays && <p><strong>Pickup days:</strong> {group.settings.pickupDays}</p>}
                          {group.settings.pickupHours && <p><strong>Pickup hours:</strong> {group.settings.pickupHours}</p>}
                        </>
                      )}
                    </div>
                    {paymentMethod !== 'COD' && (
                      <div className={styles.onlinePayment}>
                        <h4>Pay {currency(group.total)} with {paymentProviderName}</h4>
                        <div className={styles.qrPlaceholder}>
                          {paymentQrUrl ? (
                            <img className={styles.paymentQr} src={paymentQrUrl} alt={`${group.farmName} ${paymentProviderName} payment QR code`} />
                          ) : (
                            <>
                              <span>QR</span>
                              <strong>{paymentProviderName} QR not configured</strong>
                              <small>Contact this farmer for payment details before paying.</small>
                            </>
                          )}
                          {paymentAccountName && <strong>{paymentAccountName}</strong>}
                          {paymentAccountNumber && <small>{paymentAccountNumber}</small>}
                        </div>
                        <div className={styles.receiptUpload}>
                          <span>Payment receipt for {group.farmName}</span>
                          <div className={styles.fileRow}>
                            <span className={styles.fileStatus}>{receiptFile?.name ?? 'No file chosen.'}</span>
                            <label className={styles.fileLink}>
                              Choose File
                              <input
                                className={styles.fileInput}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(event) => {
                                  const file = event.target.files?.[0] ?? null
                                  if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                                    setReceiptFile(null)
                                    setReceiptError('Upload a JPG, PNG, or WebP receipt image.')
                                    return
                                  }
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
                          </div>
                        </div>
                      </div>
                    )}
              </section>
            )}
            <label className={styles.sellerNotes}>
              <span>Note to seller <small>(optional)</small></span>
              <textarea value={sellerNotes} onChange={(event) => setSellerNotes(event.target.value)} placeholder="Add instructions for the seller" rows={3} />
            </label>
            <p className={styles.messagePrompt}>Need to discuss your order? <a href="#/messages">Message the seller</a></p>
            {receiptError && <p className={styles.checkoutError} role="alert">{receiptError}</p>}
            {orderMessage && <p className={styles.checkoutError} role="alert">{orderMessage}</p>}
            <div className={styles.checkoutActions}>
              <button type="button" disabled={isCheckingOut} onClick={() => setIsCheckoutOpen(false)}>Cancel</button>
              <button type="button" disabled={isCheckingOut} onClick={submitCheckout}>
                {isCheckingOut ? 'PLACING ORDER...' : 'REVIEW ORDER'}
              </button>
            </div>
          </section>
        </div>
      )}
      {isCheckoutOpen && isConfirmOpen && (
        <div className={styles.confirmOverlay} onClick={(event) => {
          if (event.target === event.currentTarget) setIsConfirmOpen(false)
        }}>
          <section
            className={styles.confirmModal}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-order-title"
            aria-describedby="confirm-order-description"
          >
            <h2 id="confirm-order-title">Confirm your order</h2>
            <p className={styles.confirmLead} id="confirm-order-description">
              Please review your order before you continue.{' '}
              <strong>Once placed, an order cannot be cancelled or changed by you.</strong>
            </p>
            <div className={styles.confirmOrders}>
              {group && (
              <div className={styles.confirmSummary}>
                <span>{group.farmName} · {group.items.length} {group.items.length === 1 ? 'product' : 'products'} · {fulfillmentType === 'delivery' ? 'Delivery' : 'Pickup'} · {paymentMethod === 'COD' ? 'Cash on Delivery' : paymentProviderName}</span>
                <strong>{currency(group.total)}</strong>
              </div>
              )}
            </div>
            <ul className={styles.confirmList}>
              <li>Products, quantities and prices are final once the order is placed.</li>
              <li>Have a question? Go back and tap “Message the seller” before ordering.</li>
            </ul>
            <div className={styles.checkoutActions}>
              <button type="button" autoFocus onClick={() => setIsConfirmOpen(false)}>GO BACK</button>
              <button type="button" onClick={confirmOrder}>YES, PLACE ORDER</button>
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
  const [farmerStores, setFarmerStores] = useState<Record<string, FarmerStoreSettings>>({})
  const [storeSettingsError, setStoreSettingsError] = useState('')
  const [orderMessage, setOrderMessage] = useState('')
  const [cartRestriction, setCartRestriction] = useState('')
  const [quantityNotice, setQuantityNotice] = useState<{ message: string } | null>(null)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const isSubmittingOrder = useRef(false)
  const cartOwnerId = useRef<string | null>(null)
  const cartQuantitiesRef = useRef<Record<string, number>>({})

  function updateCartQuantities(
    update: Record<string, number> | ((current: Record<string, number>) => Record<string, number>)
  ) {
    const next = typeof update === 'function' ? update(cartQuantitiesRef.current) : update
    cartQuantitiesRef.current = next
    setQuantities(next)
  }

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
    const farmerProfileUnsubscribers = new Map<string, () => void>()

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeProducts?.()
      unsubscribeProducts = undefined
      farmerProfileUnsubscribers.forEach((unsubscribe) => unsubscribe())
      farmerProfileUnsubscribers.clear()
      setFarmerStores({})
      setProducts([])
      setStoreSettingsError('')

      if (!user) {
        if (isMounted) {
          cartOwnerId.current = null
          updateCartQuantities({})
          setDeliveryAddress('')
          setFarmerStores({})
          setStoreSettingsError('')
          setIsLoading(false)
          setError('Please log in to view the shop.')
        }
        return
      }

      cartOwnerId.current = user.uid
      updateCartQuantities(readSavedCart(user.uid))

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
          if (!isMounted || auth.currentUser?.uid !== user.uid) return
          const loadedProducts = snapshot.docs.flatMap((product) => {
            const data = product.data()
            const farmerId = typeof data.farmerId === 'string' ? data.farmerId : ''
            const name = typeof data.name === 'string' ? data.name.toUpperCase() : ''
            const categoryName = typeof data.category === 'string' && data.category.trim()
              ? data.category.trim().toUpperCase()
              : 'VEGETABLES'

            return [{
              id: product.id,
              farmerId,
              farmName: getFarmerDisplayName(data, 'Farmer'),
              name,
              category: categoryName,
              price: typeof data.price === 'number' ? data.price : 0,
              stock: typeof data.stock === 'number' ? data.stock : 0,
              unit: typeof data.unit === 'string' ? data.unit : 'KG',
              image: resolveProductImage(data.imageUrl, localImages[name] ?? 'shop-apple.png'),
              isAvailable: typeof data.isAvailable === 'boolean' ? data.isAvailable : true,
              sold: typeof data.sold === 'number' && Number.isFinite(data.sold) ? data.sold : 0,
            }]
          })
          const farmerIds = new Set(loadedProducts.map((product) => product.farmerId).filter((id): id is string => Boolean(id)))
          farmerProfileUnsubscribers.forEach((unsubscribe, farmerId) => {
            if (!farmerIds.has(farmerId)) {
              unsubscribe()
              farmerProfileUnsubscribers.delete(farmerId)
            }
          })
          farmerIds.forEach((farmerId) => {
            if (farmerProfileUnsubscribers.has(farmerId)) return
            setFarmerStores((current) => ({
              ...current,
              [farmerId]: { ...readStoreSettings({}, 'Loading farm'), status: 'loading' },
            }))
            const unsubscribe = onSnapshot(
              doc(db, 'farmerProfiles', farmerId),
              (profileSnapshot) => {
                if (!isMounted || auth.currentUser?.uid !== user.uid) return
                if (profileSnapshot.exists()) {
                  const store = readStoreSettings(profileSnapshot.data(), 'Farm')
                  setFarmerStores((current) => ({ ...current, [farmerId]: store }))
                  setProducts((current) => current.map((product) =>
                    product.farmerId === farmerId ? { ...product, farmName: store.farmName } : product
                  ))
                } else {
                  const store = { ...readStoreSettings({}, 'Farm'), status: 'unconfigured' as const }
                  setFarmerStores((current) => ({ ...current, [farmerId]: store }))
                  setProducts((current) => current.map((product) =>
                    product.farmerId === farmerId
                      ? { ...product, farmName: getFarmerDisplayName(store, product.farmName) }
                      : product
                  ))
                }
              },
              (profileError) => {
                console.error(`Loading farmer profile ${farmerId} failed:`, profileError)
                if (isMounted && auth.currentUser?.uid === user.uid) {
                  setStoreSettingsError('A farmer’s pickup and payment settings could not be loaded.')
                }
              }
            )
            farmerProfileUnsubscribers.set(farmerId, unsubscribe)
          })
          const availableProductIds = new Set(loadedProducts.filter((product) => product.isAvailable).map((product) => product.id))
          const availableQuantities = Object.fromEntries(
            Object.entries(cartQuantitiesRef.current).filter(([productId, quantity]) =>
              quantity > 0 && availableProductIds.has(productId)
            )
          )
          if (Object.keys(availableQuantities).length < Object.keys(cartQuantitiesRef.current).filter((productId) => cartQuantitiesRef.current[productId] > 0).length) {
            setQuantityNotice({ message: 'An unavailable product was removed from your cart.' })
          }
          const firstCartProduct = loadedProducts.find((product) =>
            Object.prototype.hasOwnProperty.call(availableQuantities, product.id)
          )
          const firstFarmerId = firstCartProduct?.farmerId ?? ''
          const mixedSavedCart = loadedProducts.some((product) =>
            Object.prototype.hasOwnProperty.call(availableQuantities, product.id)
            && product.farmerId !== firstFarmerId
          )
          const nextQuantities = mixedSavedCart
            ? Object.fromEntries(Object.entries(availableQuantities).filter(([productId]) =>
                loadedProducts.find((product) => product.id === productId)?.farmerId === firstFarmerId
              ))
            : availableQuantities
          if (mixedSavedCart) {
            const farmName = firstCartProduct?.farmName || 'that farmer'
            setCartRestriction(`Your cart has items from ${farmName}. Check out or clear your cart before adding products from another farmer.`)
          } else {
            setCartRestriction('')
          }
          updateCartQuantities(nextQuantities)
          setProducts(loadedProducts)
          setError('')
          setIsLoading(false)
        },
        (loadError) => {
          console.error('Loading shop products failed:', loadError)
          if (isMounted && auth.currentUser?.uid === user.uid) {
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
      farmerProfileUnsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [])

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) => {
      const matchesCategory = product.isAvailable && isFarmerActive(product, farmerStores) && (category === 'All' || product.category === category)
      const matchesSearch = !query ||
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query) ||
        product.farmName.toLowerCase().includes(query)
      return matchesCategory && matchesSearch
    })
  }, [category, farmerStores, products, search])
  const productCategories = useMemo(() => [...new Set([
    ...defaultCategories,
    ...products.filter((product) => product.isAvailable && isFarmerActive(product, farmerStores)).map((product) => product.category),
  ])], [farmerStores, products])

  const cartItems = products
    .filter((product) => (quantities[product.id] ?? 0) > 0 && isFarmerActive(product, farmerStores))
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
    if (quantity > 0 && (!product.isAvailable || product.stock <= 0 || !isFarmerActive(product, farmerStores))) return

    if (quantity > 0) {
      const currentCartProduct = Object.keys(cartQuantitiesRef.current)
        .filter((productId) => cartQuantitiesRef.current[productId] > 0 && productId !== id)
        .map((productId) => products.find((candidate) => candidate.id === productId))
        .find((candidate) => candidate !== undefined)
      if (currentCartProduct && (currentCartProduct.farmerId ?? '') !== (product.farmerId ?? '')) {
        const farmName = currentCartProduct.farmName || 'that farmer'
        setCartRestriction(`Your cart has items from ${farmName}. Check out or clear your cart before adding products from another farmer.`)
        return
      }
    }

    const next = { ...cartQuantitiesRef.current }
    if (quantity <= 0) delete next[id]
    else next[id] = Math.min(quantity, product.stock)
    if (quantity <= 0) {
      const remainingFarmerIds = new Set(Object.keys(next)
        .filter((productId) => next[productId] > 0)
        .map((productId) => products.find((candidate) => candidate.id === productId)?.farmerId)
        .filter((farmerId): farmerId is string => Boolean(farmerId)))
      if (remainingFarmerIds.size <= 1) setCartRestriction('')
    }
    updateCartQuantities(next)
  }

  async function placeOrder({ fulfillmentType, sellerNotes, paymentMethod, receiptFile }: CheckoutDetails) {
    if (isSubmittingOrder.current || cartItems.length === 0) return
    const cartFarmerIds = new Set(cartItems.map((item) => item.farmerId ?? ''))
    if (cartFarmerIds.size !== 1 || cartFarmerIds.has('')) {
      setOrderMessage('Your cart can only contain products from one farmer. Clear your cart and try again.')
      return
    }
    if (cartItems.length > 5) {
      setOrderMessage('Orders can include up to 5 different products. Remove an item and try again.')
      return
    }
    const groups = cartGroups(cartItems, farmerStores, fulfillmentType)
    if (groups.length !== 1 || !groups[0]?.farmerId) {
      setOrderMessage('Your cart can only contain products from one farmer. Clear your cart and try again.')
      return
    }
    const [group] = groups
    const addressForOrder = fulfillmentType === 'delivery' ? deliveryAddress.trim() : ''
    if (fulfillmentType === 'delivery' && !addressForOrder) {
      setAddressError('Delivery address is required.')
      return
    }
    setAddressError('')
    if (fulfillmentType === 'pickup' && !group.settings.pickupLocation.trim()) {
      setOrderMessage(`${group.farmName} has not configured pickup details. Please contact the farmer.`)
      return
    }
    if (paymentMethod !== 'COD') {
      const qrUrl = paymentMethod === 'GCASH' ? group.settings.gcashQrUrl : group.settings.mayaQrUrl
      if (!qrUrl) {
        setOrderMessage(`${group.farmName} has not configured a ${paymentMethod} QR code. Please choose another payment method or contact the farmer.`)
        return
      }
      if (!receiptFile) {
        setOrderMessage(`Upload a payment receipt for ${group.farmName}.`)
        return
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(receiptFile.type)) {
        setOrderMessage('Upload a JPG, PNG, or WebP receipt image.')
        return
      }
      if (receiptFile.size > 5 * 1024 * 1024) {
        setOrderMessage('Receipt images must be 5 MB or smaller.')
        return
      }
    }
    const user = auth.currentUser
    if (!user) {
      setOrderMessage('Please log in before placing an order.')
      return
    }

    isSubmittingOrder.current = true
    setIsCheckingOut(true)
    setOrderMessage('')

    try {
      const orderRef = doc(collection(db, 'orders'))
      const checkoutGroupId = orderRef.id
      const orderNumber = `ORD-${Date.now()}-${orderRef.id.slice(0, 6)}`
      const paymentReceiptUrl = receiptFile && paymentMethod !== 'COD'
        ? await uploadImageToCloudinary(receiptFile, `payment-receipts/${user.uid}/${orderRef.id}`)
        : ''
      const profileRef = doc(db, 'users', user.uid)
      const productRefs = cartItems.map((item) => doc(db, 'products', item.id))
      try {
        await runTransaction(db, async (transaction) => {
          const [profileSnapshot, ...productSnapshots] = await Promise.all([
            transaction.get(profileRef),
            ...productRefs.map((ref) => transaction.get(ref)),
          ])
          if (!profileSnapshot.exists() || normalizeRole(profileSnapshot.data().role) !== ROLES.CUSTOMER) {
            throw new Error('CUSTOMER_PROFILE_REQUIRED')
          }

          productSnapshots.forEach((productSnapshot, index) => {
            const item = cartItems[index]
            if (!productSnapshot.exists()) throw new Error('PRODUCT_NOT_FOUND')
            const product = productSnapshot.data()
            const stock = typeof product.stock === 'number' ? product.stock : 0
            if (product.isAvailable !== true || item.quantity > stock) throw new Error('INSUFFICIENT_STOCK')
            if (typeof product.price !== 'number' || product.price !== item.price) throw new Error('PRICE_CHANGED')
            if (product.farmerId !== group.farmerId) throw new Error('FARMER_CHANGED')
            const sold = typeof product.sold === 'number' && Number.isFinite(product.sold) ? product.sold : 0
            transaction.update(productRefs[index], {
              stock: stock - item.quantity,
              sold: sold + item.quantity,
              checkoutOrderId: orderRef.id,
              checkoutQuantity: item.quantity,
              checkoutAction: 'sale',
              checkoutItemIndex: index,
            })
          })

          const profile = profileSnapshot.data()
          const orderItems = cartItems.map((item) => ({
            productId: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            unit: item.unit,
          }))
          transaction.set(orderRef, {
            orderNumber,
            checkoutGroupId,
            farmerId: group.farmerId,
            userId: user.uid,
            customerName: `${typeof profile.firstName === 'string' ? profile.firstName : ''} ${typeof profile.lastName === 'string' ? profile.lastName : ''}`.trim(),
            customerEmail: typeof profile.email === 'string' ? profile.email : user.email ?? '',
            items: orderItems,
            subtotal: group.subtotal,
            deliveryFee: group.deliveryFee,
            tax: group.tax,
            total: group.total,
            paymentMethod,
            paymentStatus: paymentMethod === 'COD' ? 'unpaid' : 'awaiting_verification',
            status: 'pending',
            fulfillmentType,
            deliveryAddress: fulfillmentType === 'pickup' ? group.settings.pickupLocation : addressForOrder,
            pickupHours: fulfillmentType === 'pickup' ? group.settings.pickupHours : '',
            pickupDays: fulfillmentType === 'pickup' ? group.settings.pickupDays : '',
            sellerNotes,
            paymentReceiptUrl,
            createdAt: serverTimestamp(),
          })
        })
      } catch (transactionError) {
        let orderCommitted = false
        try {
          const savedOrder = await getDoc(orderRef)
          orderCommitted = savedOrder.exists()
            && savedOrder.data().userId === user.uid
            && savedOrder.data().checkoutGroupId === checkoutGroupId
        } catch (verificationError) {
          console.error('Verifying checkout result failed:', verificationError)
        }
        if (!orderCommitted) throw transactionError
      }
      notifyOrder(orderRef.id)
      try {
        localStorage.removeItem(`cces-farm-market-cart:${user.uid}`)
      } catch (storageError) {
        console.error('Clearing saved cart failed:', storageError)
      }
      updateCartQuantities({})
      try {
        sessionStorage.setItem(
          'cces-farm-market-order-placed',
          JSON.stringify({
            checkoutGroupId,
            orderNumbers: [orderNumber],
            paymentMethods: [paymentMethod],
          })
        )
      } catch (storageError) {
        console.error('Saving order confirmation failed:', storageError)
      }
      window.location.hash = '/orders'
    } catch (checkoutError) {
      console.error('Checkout failed:', checkoutError)
      const errorCode = typeof checkoutError === 'object' && checkoutError !== null && 'code' in checkoutError
        && typeof checkoutError.code === 'string'
        ? checkoutError.code
        : ''
      if (checkoutError instanceof Error && checkoutError.message === 'CUSTOMER_PROFILE_REQUIRED') {
        setOrderMessage('Your customer profile could not be found. Please contact support.')
      } else if (checkoutError instanceof Error && checkoutError.message === 'PRODUCT_NOT_FOUND') {
        setOrderMessage('One or more products are no longer available.')
      } else if (checkoutError instanceof Error && checkoutError.message === 'INSUFFICIENT_STOCK') {
        setOrderMessage('The requested quantity is no longer available. Please review your cart.')
      } else if (checkoutError instanceof Error && checkoutError.message === 'PRICE_CHANGED') {
        setOrderMessage('A product price changed. Review your cart and try again.')
      } else if (checkoutError instanceof Error && checkoutError.message === 'FARMER_CHANGED') {
        setOrderMessage('A product’s farmer changed. Refresh your cart and try again.')
      } else if (errorCode === 'permission-denied') {
        setOrderMessage('Your order could not be authorized. Refresh your cart and try again.')
      } else {
        setOrderMessage('Unable to place your order. Please try again.')
      }
    } finally {
      isSubmittingOrder.current = false
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
          secondary={<div className={styles.categories}>{['All', ...productCategories].map((item) => (
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
      <Cart items={cartItems} onChange={updateQuantity} onClearAll={() => {
        updateCartQuantities({})
        setCartRestriction('')
        setOrderMessage('')
      }} address={deliveryAddress} onAddressChange={(value) => {
        setDeliveryAddress(value)
        if (value.trim()) setAddressError('')
      }} onPlaceOrder={placeOrder} onEmptyCartAttempt={() => {
        setQuantityNotice({ message: 'Add products to your cart before placing an order.' })
      }} onAddressError={setAddressError} orderMessage={orderMessage} cartRestriction={cartRestriction} addressError={addressError} isCheckingOut={isCheckingOut} farmerStores={farmerStores} storeSettingsError={storeSettingsError} />
      {quantityNotice && <div className={styles.quantityToast} role="status" aria-live="polite">{quantityNotice.message}</div>}
    </main>
  )
}
