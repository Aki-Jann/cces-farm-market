import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import { db } from '../../firebase/firestore'
import { productImageKey, productImages, resolveProductImage } from '../../utils/productImages'
import styles from './AdminProductsPage.module.css'

type ProductCategory = 'VEGETABLES' | 'FRUITS' | 'GRAINS' | 'FLOWERS'
type Product = {
  id: string
  name: string
  category: ProductCategory
  price: number
  stock: number
  unit: string
  image: string
  rawImageUrl?: string
  available: boolean
}
type ProductDraft = Omit<Product, 'id'>

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

const wrndeogt = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined
const cces_product_images = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined

async function uploadImageToCloudinary(file: File): Promise<string> {
  if (!wrndeogt || !cces_product_images) {
    throw new Error('Cloudinary is not configured. Please set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.')
  }

  const uploadUrl = `https://api.cloudinary.com/v1_1/${wrndeogt}/image/upload`
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', cces_product_images)

  let response: Response
  try {
    response = await fetch(uploadUrl, { method: 'POST', body: formData })
  } catch {
    throw new Error('Could not reach Cloudinary. Please check your internet connection and try again.')
  }

  if (!response.ok) {
    let message = `Cloudinary upload failed (HTTP ${response.status}).`
    try {
      const errorBody = (await response.json()) as { error?: { message?: string } }
      if (errorBody?.error?.message) {
        message = `Cloudinary upload failed: ${errorBody.error.message}`
      }
    } catch {
      // response body wasn't JSON; keep the generic message
    }
    throw new Error(message)
  }

  const data = (await response.json()) as { secure_url?: string }
  if (!data.secure_url) {
    throw new Error('Cloudinary upload succeeded but did not return an image URL.')
  }

  return data.secure_url
}

function currency(value: number) {
  return `₱${value.toFixed(2)}`
}

function emptyDraft(): ProductDraft {
  return { name: '', category: 'VEGETABLES', price: 100, stock: 0, unit: 'KG', image: imageOptions[0].value, rawImageUrl: '', available: true }
}

function ProductCard({ product, selected, onEdit }: { product: Product; selected: boolean; onEdit: () => void }) {
  const isOutOfStock = product.stock <= 0
  const availabilityClass = isOutOfStock || !product.available ? styles.unavailable : styles.available
  const availabilityLabel = isOutOfStock ? 'OUT OF STOCK' : product.available ? 'AVAILABLE' : 'UNAVAILABLE'

  return (
    <article className={`${styles.productCard} ${selected ? styles.selectedCard : ''}`}>
      <img src={product.image} alt={product.name} />
      <div className={styles.productInfo}>
        <div>
          <strong>{product.name}</strong>
          <small>{product.category}</small>
          <small className={availabilityClass}>
            {product.stock} {product.unit} {availabilityLabel}
          </small>
        </div>
        <div className={styles.price}><strong>{currency(product.price)}</strong><small>PER {product.unit}</small></div>
      </div>
      <button type="button" onClick={onEdit}>EDIT</button>
    </article>
  )
}

function ProductForm({
  draft,
  editing,
  isSaving,
  error,
  onChange,
  onFileSelect,
  onSubmit,
}: {
  draft: ProductDraft
  editing: boolean
  isSaving: boolean
  error: string
  onChange: (draft: ProductDraft) => void
  onFileSelect: (file: File) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      onFileSelect(file)
    }
    event.target.value = ''
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div
        className={styles.imagePreview}
        role="button"
        tabIndex={0}
        title="Click to choose a product image"
        aria-label="Upload product image"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
      >
        <img src={draft.image} alt="Product preview" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
      {error && <p className={styles.formError} role="alert">{error}</p>}
      <label>PRODUCT NAME
        <input required value={draft.name} placeholder="e.g. TOMATO" onChange={(event) => onChange({ ...draft, name: event.target.value.toUpperCase() })} />
      </label>
      <fieldset><legend>CATEGORY</legend><div className={styles.categoryGrid}>
        {categories.map((category) => <button className={draft.category === category ? styles.selectedChip : ''} type="button" key={category} onClick={() => onChange({ ...draft, category })}>{category}</button>)}
      </div></fieldset>
      <div className={styles.formRow}>
        <label>STOCK<input min="0" required type="number" value={draft.stock} onChange={(event) => onChange({ ...draft, stock: Number(event.target.value) })} /></label>
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
  const [isSaving, setIsSaving] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft())
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selectedProduct = products.find((product) => product.id === selectedId)
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return products
    return products.filter((product) =>
      product.name.toLowerCase().includes(query) ||
      product.category.toLowerCase().includes(query)
    )
  }, [products, search])

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        setProducts(snapshot.docs.map((product) => {
          const data = product.data()
          const rawImageUrl = typeof data.imageUrl === 'string' ? data.imageUrl : ''
          const imageUrl = resolveProductImage(data.imageUrl, 'shop-apple.png')
          return {
            id: product.id,
            name: typeof data.name === 'string' ? data.name : '',
            category: categories.includes(data.category) ? data.category : 'VEGETABLES',
            price: typeof data.price === 'number' ? data.price : 0,
            stock: typeof data.stock === 'number' ? data.stock : 0,
            unit: typeof data.unit === 'string' ? data.unit : 'KG',
            image: imageUrl,
            rawImageUrl,
            available: typeof data.isAvailable === 'boolean' ? data.isAvailable : true,
          }
        }))
        setError('')
        setIsLoading(false)
      },
      (loadError) => {
        console.error('Loading products failed:', loadError)
        setError('Unable to load products. Please try again.')
        setIsLoading(false)
      }
    )

    return () => unsubscribe()
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
    const normalized = { ...draft, name: draft.name.trim().toUpperCase() }
    if (!normalized.name) return
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

      const productData = {
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
          createdAt: serverTimestamp(),
        })
        const newProduct: Product = {
          ...normalized,
          id: productId,
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
            <button className={`${styles.addTile} ${isFormOpen && !selectedId ? styles.activeTile : ''}`} type="button" onClick={startAdd}><span>+</span><strong>ADD NEW PRODUCT</strong></button>
            {visibleProducts.map((product) => <ProductCard key={product.id} product={product} selected={selectedId === product.id} onEdit={() => startEdit(product)} />)}
            {isLoading && <p className={styles.empty}>Loading products...</p>}
            {!isLoading && error && !isFormOpen && <p className={styles.empty} role="alert">{error}</p>}
            {!isLoading && !error && visibleProducts.length === 0 && <p className={styles.empty}>{search.trim() ? 'No products match your search.' : 'No products found.'}</p>}
          </section>
          {isFormOpen && (
            <ProductForm
              draft={draft}
              editing={Boolean(selectedId)}
              isSaving={isSaving}
              error={error}
              onChange={setDraft}
              onFileSelect={handleFileSelect}
              onSubmit={saveProduct}
            />
          )}
        </div>
      </section>
    </main>
  )
}
