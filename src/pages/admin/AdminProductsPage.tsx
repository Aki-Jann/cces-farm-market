import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import { auth } from '../../firebase/auth'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import { ProductRating } from '../../components/common/ProductRating'
import { db } from '../../firebase/firestore'
import { uploadImageToCloudinary } from '../../utils/cloudinary'
import { productImageKey, productImages, resolveProductImage } from '../../utils/productImages'
import styles from './AdminProductsPage.module.css'

type ProductCategory = string
type Product = {
  id: string
  farmerId?: string
  name: string
  category: ProductCategory
  price: number
  stock: number
  unit: string
  image: string
  rawImageUrl?: string
  available: boolean
  sold: number
}
type ProductDraft = Omit<Product, 'id' | 'sold'>

const categories: ProductCategory[] = ['VEGETABLES', 'FRUITS', 'GRAINS', 'FLOWERS']
const imageOptions = [
  { label: 'Apple', value: productImages['shop-apple.png'] },
  { label: 'Banana', value: productImages['shop-banana.png'] },
  { label: 'Bell Pepper', value: productImages['shop-pepper.png'] },
  { label: 'Cabbage', value: productImages['shop-cabbage.png'] },
  { label: 'Carrot', value: productImages['shop-carrot.png'] },
  { label: 'Corn', value: productImages['shop-corn.png'] },
  { label: 'Cucumber', value: productImages['shop-cucumber.png'] },
  { label: 'Guava', value: productImages['shop-guava.png'] },
  { label: 'Gumamela', value: productImages['shop-gumamela.png'] },
]

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

function validateImageFile(file: File): string | null {
  const fileType = file.type.toLowerCase()
  const extension = file.name.split('.').pop()?.toLowerCase()
  const isValidType =
    ALLOWED_IMAGE_TYPES.includes(fileType) ||
    ['jpg', 'jpeg', 'png', 'webp'].includes(extension ?? '')

  if (!isValidType) {
    return 'Please select a valid image file (JPG, PNG, or WEBP).'
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'Image file size must be 5 MB or smaller.'
  }

  return null
}

function currency(value: number) {
  return `₱${value.toFixed(2)}`
}

function emptyDraft(): ProductDraft {
  return { name: '', category: 'VEGETABLES', price: 100, stock: 0, unit: 'KG', image: imageOptions[0].value, rawImageUrl: '', available: true }
}

function orderHasProduct(order: Record<string, unknown>, product: Product) {
  const status = typeof order.status === 'string' ? order.status.trim().toLowerCase() : 'pending'
  if (['delivered', 'cancelled', 'canceled', 'rejected'].includes(status)) return false
  if (!Array.isArray(order.items)) return false

  return order.items.some((item) => {
    if (!item || typeof item !== 'object') return false
    const itemData = item as Record<string, unknown>
    if (typeof itemData.productId === 'string' && itemData.productId) {
      return itemData.productId === product.id
    }
    return typeof itemData.name === 'string' &&
      itemData.name.trim().toLowerCase() === product.name.trim().toLowerCase()
  })
}

function ProductCard({
  product,
  selected,
  isUpdating,
  onEdit,
  onDelete,
  onToggleAvailability,
}: {
  product: Product
  selected: boolean
  isUpdating: boolean
  onEdit: () => void
  onDelete: () => void
  onToggleAvailability: () => void
}) {
  const isOutOfStock = product.stock <= 0
  const availabilityClass = isOutOfStock || !product.available ? styles.unavailable : styles.available
  const availabilityLabel = isOutOfStock ? 'OUT OF STOCK' : product.available ? 'AVAILABLE' : 'UNAVAILABLE'

  return (
    <article className={`${styles.productCard} ${selected ? styles.selectedCard : ''}`}>
      <div className={styles.productImage}>
        <img src={product.image} alt={product.name} />
        <span className={`${styles.stockBadge} ${availabilityClass}`}>{availabilityLabel}</span>
        <button
          aria-label={`Delete ${product.name}`}
          className={styles.deleteButton}
          disabled={isUpdating}
          title={`Delete ${product.name}`}
          type="button"
          onClick={onDelete}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" />
          </svg>
        </button>
      </div>
      <div className={styles.productInfo}>
        <div className={styles.productDetails}>
          <span className={styles.categoryLabel}>{product.category}</span>
          <strong>{product.name}</strong>
          <small className={styles.stockText}>{product.stock} {product.unit} in stock · {product.sold} sold</small>
          <ProductRating productId={product.id} showReviews />        </div>
        <div className={styles.price}><strong>{currency(product.price)}</strong><small>PER {product.unit}</small></div>
      </div>
      <div className={styles.productActions}>
        <button className={styles.editButton} type="button" onClick={onEdit}>EDIT / RESTOCK</button>
        <button
          className={styles.listingButton}
          disabled={isUpdating}
          type="button"
          onClick={onToggleAvailability}
        >
          {isUpdating ? 'UPDATING...' : product.available ? 'UNLIST' : 'LIST PRODUCT'}
        </button>
      </div>
    </article>
  )
}

function ProductForm({
  draft,
  editing,
  hasSelectedPhoto,
  isSaving,
  error,
  categoryOptions,
  onChange,
  onFileSelect,
  onSubmit,
  onCancel,
}: {
  draft: ProductDraft
  editing: boolean
  hasSelectedPhoto: boolean
  isSaving: boolean
  error: string
  categoryOptions: string[]
  onChange: (draft: ProductDraft) => void
  onFileSelect: (file: File) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [newCategory, setNewCategory] = useState('')

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      onFileSelect(file)
    }
    event.target.value = ''
  }

  function addCategory() {
    const category = newCategory.trim().toUpperCase()
    if (!category) return
    onChange({ ...draft, category })
    setNewCategory('')
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.formHeader}>
        <div>
          <span>{editing ? 'PRODUCT DETAILS' : 'INVENTORY'}</span>
          <h2>{editing ? 'Edit product' : 'Add a product'}</h2>
        </div>
        <button className={styles.closeForm} type="button" aria-label="Close product form" onClick={onCancel}>×</button>
      </div>
      <section className={styles.photoSection} aria-label="Product photo">
        <div className={styles.photoSectionHeading}>
          <div><h3>Product photo</h3><p>Add a clear photo to help customers recognize this product.</p></div>
          <span className={styles.photoStatus}>{hasSelectedPhoto ? 'NEW PHOTO' : editing ? 'CURRENT PHOTO' : 'PREVIEW'}</span>
        </div>
        <div className={styles.imagePreview}>
          <img src={draft.image} alt={`${draft.name || 'Product'} photo preview`} />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className={styles.fileInput}
          aria-label="Choose product photo"
          onChange={handleFileChange}
        />
        <div className={styles.photoActions}>
          <button className={styles.uploadButton} type="button" onClick={() => fileInputRef.current?.click()}>
            <span aria-hidden="true">↑</span>{editing || hasSelectedPhoto ? 'CHANGE PHOTO' : 'UPLOAD PHOTO'}
          </button>
          <span className={styles.photoHelp}>JPG, PNG, or WEBP · up to 5 MB</span>
        </div>
      </section>
      {error && <p className={styles.formError} role="alert">{error}</p>}
      <label>PRODUCT NAME
        <input required value={draft.name} placeholder="e.g. TOMATO" onChange={(event) => onChange({ ...draft, name: event.target.value.toUpperCase() })} />
      </label>
      <fieldset><legend>CATEGORY</legend><div className={styles.categoryGrid}>
        {[...new Set([...categoryOptions, draft.category])].map((category) => <button className={draft.category === category ? styles.selectedChip : ''} type="button" key={category} onClick={() => onChange({ ...draft, category })}>{category}</button>)}
      </div><div className={styles.newCategory}>
        <input aria-label="New category name" maxLength={40} value={newCategory} placeholder="Add a category" onChange={(event) => setNewCategory(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            addCategory()
          }
        }} />
        <button type="button" onClick={addCategory} disabled={!newCategory.trim()}>ADD CATEGORY</button>
      </div></fieldset>
      <div className={styles.formRow}>
        <label>STOCK / RESTOCK QUANTITY<input min="0" required type="number" value={draft.stock} onChange={(event) => onChange({ ...draft, stock: Number(event.target.value) })} /></label>
        <label>UNIT OF MEASURE
          <input
            required
            maxLength={20}
            value={draft.unit}
            placeholder="e.g. KG, PIECE, BUNDLE"
            onChange={(event) => onChange({ ...draft, unit: event.target.value.toUpperCase() })}
          />
        </label>
      </div>
      <fieldset><legend>PRICE</legend><div className={styles.priceOptions}>
        {[100, 200, 300].map((price) => <button className={draft.price === price ? styles.selectedChip : ''} type="button" key={price} onClick={() => onChange({ ...draft, price })}>₱{price}.00</button>)}
      </div>
      <input min="0" required step="0.01" type="number" value={draft.price} aria-label="PRICE" placeholder="e.g. ₱100.00" onChange={(event) => onChange({ ...draft, price: Number(event.target.value) })} /></fieldset>
      <label className={styles.availability}><input type="checkbox" checked={draft.available} onChange={(event) => onChange({ ...draft, available: event.target.checked })} /> AVAILABLE FOR ORDER</label>
      <button className={styles.submit} disabled={isSaving} type="submit">{isSaving ? 'SAVING...' : editing ? 'SAVE CHANGES' : 'SUBMIT'}</button>
    </form>
  )
}

export function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [salesError, setSalesError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [updatingProductIds, setUpdatingProductIds] = useState<Set<string>>(() => new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft())
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [pendingUnlist, setPendingUnlist] = useState<Product | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const cancelUnlistRef = useRef<HTMLButtonElement>(null)
  const cancelDeleteRef = useRef<HTMLButtonElement>(null)
  const productDocsForBackfill = useRef<Array<{ id: string; data: Record<string, unknown> }> | null>(null)
  const orderDocsForBackfill = useRef<Array<Record<string, unknown>> | null>(null)
  const salesBackfillStarted = useRef(false)
  const selectedProduct = products.find((product) => product.id === selectedId)
  const categoryOptions = useMemo(() => {
    const customCategories = [...new Set(products.map((product) => product.category)
      .filter((category) => category && !categories.includes(category as typeof categories[number])))]
      .sort((a, b) => a.localeCompare(b))
    return [...categories, ...customCategories]
  }, [products])
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((product) =>
      (selectedCategory === 'ALL' || product.category === selectedCategory) &&
      (!query || product.name.toLowerCase().includes(query) || product.category.toLowerCase().includes(query))
    )
  }, [products, search, selectedCategory])

  useEffect(() => {
    if (!pendingUnlist && !pendingDelete) return

    if (pendingDelete) cancelDeleteRef.current?.focus()
    else cancelUnlistRef.current?.focus()
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !deletingProductId) {
        setPendingUnlist(null)
        setPendingDelete(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pendingUnlist, pendingDelete, deletingProductId])

  useEffect(() => {
    let unsubscribeFarmerData: (() => void) | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeFarmerData?.()
      if (!user) {
        setError('Please log in to manage products.')
        setIsLoading(false)
        setSalesError('Please log in to load order sales totals.')
        return
      }

      const farmerId = user.uid
      async function backfillSalesCounts() {
        const productDocs = productDocsForBackfill.current
        const orderDocs = orderDocsForBackfill.current
        if (!productDocs || !orderDocs || orderDocs.length === 0 || salesBackfillStarted.current) return

        const productIds = new Set(productDocs.map(({ id }) => id))
        const productIdByName = new Map(
          productDocs.map(({ id, data }) => [
            typeof data.name === 'string' ? data.name.trim().toLowerCase() : '',
            id,
          ])
        )
        const soldByProductId = new Map<string, number>()

        orderDocs.forEach((order) => {
          if (!Array.isArray(order.items)) return
          order.items.forEach((item) => {
            if (!item || typeof item !== 'object') return
            const itemData = item as Record<string, unknown>
            const quantity = typeof itemData.quantity === 'number' ? itemData.quantity : 0
            if (!Number.isFinite(quantity) || quantity <= 0) return

            const itemProductId = typeof itemData.productId === 'string' ? itemData.productId : ''
            const productId = productIds.has(itemProductId)
              ? itemProductId
              : typeof itemData.name === 'string'
                ? productIdByName.get(itemData.name.trim().toLowerCase())
                : undefined
            if (productId) {
              soldByProductId.set(productId, (soldByProductId.get(productId) ?? 0) + quantity)
            }
          })
        })

        const productsToUpdate = productDocs.filter(({ data }) =>
          typeof data.sold !== 'number' || !Number.isFinite(data.sold)
        )
        try {
          for (let index = 0; index < productsToUpdate.length; index += 450) {
            const batch = writeBatch(db)
            productsToUpdate.slice(index, index + 450).forEach(({ id }) => {
              batch.update(doc(db, 'products', id), { sold: soldByProductId.get(id) ?? 0 })
            })
            await batch.commit()
          }
          setSalesError('')
        } catch (backfillError) {
          console.error('Initializing product sales totals failed:', backfillError)
          salesBackfillStarted.current = false
          setSalesError('Unable to initialize existing sales totals. Please refresh and try again.')
        }
      }

      const unsubscribeProducts = onSnapshot(
        query(collection(db, 'products'), where('farmerId', '==', farmerId)),
        (snapshot) => {
          productDocsForBackfill.current = snapshot.docs.map((product) => ({
            id: product.id,
            data: product.data(),
          }))
          setProducts(snapshot.docs.map((product) => {
            const data = product.data()
            const rawImageUrl = typeof data.imageUrl === 'string' ? data.imageUrl : ''
            const imageUrl = resolveProductImage(data.imageUrl, 'shop-apple.png')
            return {
              id: product.id,
              farmerId: typeof data.farmerId === 'string' ? data.farmerId : '',
              name: typeof data.name === 'string' ? data.name : '',
              category: typeof data.category === 'string' && data.category.trim() ? data.category.trim().toUpperCase() : 'VEGETABLES',
              price: typeof data.price === 'number' ? data.price : 0,
              stock: typeof data.stock === 'number' ? data.stock : 0,
              unit: typeof data.unit === 'string' && data.unit.trim() ? data.unit.trim().toUpperCase() : 'KG',
              image: imageUrl,
              rawImageUrl,
              available: typeof data.isAvailable === 'boolean' ? data.isAvailable : true,
              sold: typeof data.sold === 'number' && Number.isFinite(data.sold) ? data.sold : 0,
            }
          }))
          setError('')
          setIsLoading(false)
          void backfillSalesCounts()
        },
        (loadError) => {
          console.error('Loading products failed:', loadError)
          setError('Unable to load products. Please try again.')
          setIsLoading(false)
        }
      )

      const unsubscribeOrders = onSnapshot(
        query(collection(db, 'orders'), where('farmerId', '==', farmerId)),
        (snapshot) => {
          orderDocsForBackfill.current = snapshot.docs.map((order) => order.data())
          void backfillSalesCounts()
        },
        (loadError) => {
          console.error('Loading orders for product sales totals failed:', loadError)
          setSalesError('Unable to load order sales totals. Please refresh and try again.')
        }
      )

      unsubscribeFarmerData = () => {
        unsubscribeProducts()
        unsubscribeOrders()
      }
    })

    return () => {
      unsubscribeAuth()
      unsubscribeFarmerData?.()
    }
  }, [])

  function startAdd() {
    setSelectedId(null)
    setSelectedFile(null)
    setError('')
    setDraft(emptyDraft())
    setIsFormOpen(true)
  }

  function startEdit(product: Product) {
    setSelectedId(product.id)
    setSelectedFile(null)
    setError('')
    setDraft({ ...product })
    setIsFormOpen(true)
  }

  function closeForm() {
    setIsFormOpen(false)
    setSelectedId(null)
    setSelectedFile(null)
    setError('')
  }

  async function toggleAvailability(product: Product) {
    if (updatingProductIds.has(product.id)) return
    setError('')
    setUpdatingProductIds((current) => new Set(current).add(product.id))
    try {
      await updateDoc(doc(db, 'products', product.id), { isAvailable: !product.available })
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, available: !product.available } : item))
    } catch (updateError) {
      console.error('Updating product availability failed:', updateError)
      setError(`Unable to ${product.available ? 'unlist' : 'list'} ${product.name}. Please try again.`)
    } finally {
      setUpdatingProductIds((current) => {
        const next = new Set(current)
        next.delete(product.id)
        return next
      })
    }
  }

  function requestAvailabilityChange(product: Product) {
    if (product.available) {
      setPendingUnlist(product)
      return
    }
    void toggleAvailability(product)
  }

  async function confirmUnlist() {
    if (!pendingUnlist) return
    await toggleAvailability(pendingUnlist)
    setPendingUnlist(null)
  }

  async function confirmDelete() {
    if (!pendingDelete || deletingProductId) return

    const product = pendingDelete
    const productRef = doc(db, 'products', product.id)
    let temporarilyUnlisted = false
    setDeleteError('')
    setDeletingProductId(product.id)
    try {
      if (product.available) {
        await updateDoc(productRef, { isAvailable: false })
        temporarilyUnlisted = true
      }

      const farmerId = auth.currentUser?.uid
      if (!farmerId) throw new Error('No authenticated farmer is available.')
      const ordersSnapshot = await getDocs(query(collection(db, 'orders'), where('farmerId', '==', farmerId)))
      const activeOrders = ordersSnapshot.docs.filter((order) => orderHasProduct(order.data(), product))
      if (activeOrders.length > 0) {
        if (temporarilyUnlisted) {
          await updateDoc(productRef, { isAvailable: true })
          temporarilyUnlisted = false
        }
        setDeleteError(
          `This product is in ${activeOrders.length} active ${activeOrders.length === 1 ? 'order' : 'orders'}. Complete or cancel those orders before deleting it.`
        )
        return
      }

      await deleteDoc(productRef)
      setProducts((current) => current.filter((item) => item.id !== product.id))
      if (selectedId === product.id) {
        setSelectedId(null)
        setIsFormOpen(false)
      }
      setPendingDelete(null)
    } catch (deleteError) {
      console.error('Deleting product failed:', deleteError)
      if (temporarilyUnlisted) {
        try {
          await updateDoc(productRef, { isAvailable: true })
        } catch (restoreError) {
          console.error('Restoring product availability after failed deletion failed:', restoreError)
          setDeleteError('Could not complete the deletion or restore the product listing. Please check its availability and try again.')
          return
        }
      }
      setDeleteError('Unable to verify active orders or delete this product. Please try again.')
    } finally {
      setDeletingProductId(null)
    }
  }

  function handleFileSelect(file: File) {
    const validationError = validateImageFile(file)
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setSelectedFile(file)
    const previewUrl = URL.createObjectURL(file)
    setDraft((current) => ({ ...current, image: previewUrl }))
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return
    const normalized = {
      ...draft,
      name: draft.name.trim().toUpperCase(),
      unit: draft.unit.trim().toUpperCase(),
    }
    if (!normalized.name) {
      setError('Product name is required.')
      return
    }
    if (!normalized.unit) {
      setError('Unit of measure is required.')
      return
    }
    setError('')
    setIsSaving(true)

    try {
      const productDocRef = selectedProduct
        ? doc(db, 'products', selectedProduct.id)
        : doc(collection(db, 'products'))
      const productId = productDocRef.id

      let imageUrlToSave = draft.rawImageUrl || productImageKey(draft.image)

      if (selectedFile) {
        try {
          imageUrlToSave = await uploadImageToCloudinary(selectedFile)
        } catch (uploadError) {
          console.error('Cloudinary upload failed:', uploadError)
          throw uploadError
        }
      }

      const farmerId = auth.currentUser?.uid ?? selectedProduct?.farmerId ?? ''
      const productData = {
        farmerId,
        name: normalized.name,
        category: normalized.category,
        price: Number(normalized.price),
        stock: Number(normalized.stock),
        unit: normalized.unit,
        imageUrl: imageUrlToSave,
        isAvailable: Boolean(normalized.available),
      }

      if (selectedProduct) {
        await updateDoc(productDocRef, productData)
        setProducts((current) =>
          current.map((product) =>
            product.id === selectedProduct.id
              ? {
                  ...product,
                  ...normalized,
                  image: resolveProductImage(imageUrlToSave, 'shop-apple.png'),
                  rawImageUrl: imageUrlToSave,
                }
              : product
          )
        )
      } else {
        await setDoc(productDocRef, {
          ...productData,
          sold: 0,
          createdAt: serverTimestamp(),
        })
        const newProduct: Product = {
          ...normalized,
          id: productId,
          sold: 0,
          image: resolveProductImage(imageUrlToSave, 'shop-apple.png'),
          rawImageUrl: imageUrlToSave,
        }
        setProducts((current) => [...current, newProduct])
        setSelectedId(productId)
      }

      setSelectedFile(null)
      setDraft((current) => ({
        ...current,
        image: resolveProductImage(imageUrlToSave, 'shop-apple.png'),
        rawImageUrl: imageUrlToSave,
      }))
      setIsFormOpen(false)
    } catch (saveError) {
      console.error('Saving product failed:', saveError)
      if (saveError instanceof Error && saveError.message) {
        setError(saveError.message)
      } else {
        setError('Unable to save the product. Please try again.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className={styles.page}>
      <AdminSidebar active="products" />
      <section className={styles.content}>
        <Header title="PRODUCTS" search={search} onSearchChange={(event) => setSearch(event.target.value)} />
        <div className={`${styles.workspace} ${isFormOpen ? styles.workspaceWithForm : ''}`}>
          <section className={`${styles.grid} ${isFormOpen ? styles.gridWithForm : styles.gridList}`}>
            <div className={styles.toolbar}>
              <nav className={styles.categoryFilters} aria-label="Filter products by category">
                {['ALL', ...categoryOptions].map((category) => {
                  const count = category === 'ALL' ? products.length : products.filter((product) => product.category === category).length
                  return (
                    <button
                      aria-pressed={selectedCategory === category}
                      className={selectedCategory === category ? styles.activeCategoryFilter : ''}
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      type="button"
                    >
                      {category} <span>{count}</span>
                    </button>
                  )
                })}
              </nav>
              <button className={styles.addButton} type="button" onClick={startAdd}><span aria-hidden="true">+</span> ADD PRODUCT</button>
            </div>
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                selected={selectedId === product.id}
                isUpdating={updatingProductIds.has(product.id)}
                onEdit={() => startEdit(product)}
                onDelete={() => {
                  setDeleteError('')
                  setPendingDelete(product)
                }}
                onToggleAvailability={() => requestAvailabilityChange(product)}
              />
            ))}
            {isLoading && <p className={styles.empty}>Loading products...</p>}
            {!isLoading && error && !isFormOpen && <p className={styles.empty} role="alert">{error}</p>}
            {!isLoading && salesError && <p className={styles.empty} role="alert">{salesError}</p>}
            {!isLoading && !error && visibleProducts.length === 0 && <p className={styles.empty}>{search.trim() ? 'No products match your search and category filters.' : selectedCategory !== 'ALL' ? `No products in ${selectedCategory}.` : 'No products found.'}</p>}
          </section>
          {isFormOpen && (
            <ProductForm
              draft={draft}
              categoryOptions={categoryOptions}
              editing={Boolean(selectedId)}
              hasSelectedPhoto={Boolean(selectedFile)}
              isSaving={isSaving}
              error={error}
              onChange={setDraft}
              onFileSelect={handleFileSelect}
              onSubmit={saveProduct}
              onCancel={closeForm}
            />
          )}
        </div>
        {pendingUnlist && (
          <div
            className={styles.confirmOverlay}
            onClick={(event) => {
              if (event.target === event.currentTarget) setPendingUnlist(null)
            }}
          >
            <section
              className={styles.confirmDialog}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="unlist-title"
              aria-describedby="unlist-description"
            >
              <span className={styles.confirmEyebrow}>PRODUCT VISIBILITY</span>
              <h2 id="unlist-title">Unlist {pendingUnlist.name}?</h2>
              <p id="unlist-description">
                This product will no longer be visible to customers in the shop. You can list it again at any time.
              </p>
              <div className={styles.confirmActions}>
                <button
                  ref={cancelUnlistRef}
                  className={styles.cancelConfirm}
                  type="button"
                  onClick={() => setPendingUnlist(null)}
                >
                  CANCEL
                </button>
                <button
                  className={styles.confirmUnlist}
                  type="button"
                  disabled={updatingProductIds.has(pendingUnlist.id)}
                  onClick={() => void confirmUnlist()}
                >
                  {updatingProductIds.has(pendingUnlist.id) ? 'UNLISTING...' : 'UNLIST PRODUCT'}
                </button>
              </div>
            </section>
          </div>
        )}
        {pendingDelete && (
          <div
            className={styles.confirmOverlay}
            onClick={(event) => {
              if (event.target === event.currentTarget && !deletingProductId) setPendingDelete(null)
            }}
          >
            <section
              className={styles.confirmDialog}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-product-title"
              aria-describedby="delete-product-description"
            >
              <span className={styles.confirmEyebrow}>PERMANENT ACTION</span>
              <h2 id="delete-product-title">Delete {pendingDelete.name}?</h2>
              <p id="delete-product-description">
                This permanently removes the product. Products in active orders cannot be deleted.
              </p>
              {deleteError && <p className={styles.deleteError} role="alert">{deleteError}</p>}
              <div className={styles.confirmActions}>
                <button
                  ref={cancelDeleteRef}
                  className={styles.cancelConfirm}
                  disabled={Boolean(deletingProductId)}
                  type="button"
                  onClick={() => setPendingDelete(null)}
                >
                  CANCEL
                </button>
                <button
                  className={styles.confirmDelete}
                  disabled={Boolean(deletingProductId)}
                  type="button"
                  onClick={() => void confirmDelete()}
                >
                  {deletingProductId ? 'CHECKING ORDERS...' : 'DELETE PRODUCT'}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  )
}
