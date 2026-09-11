import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import { db } from '../../firebase/firestore'
import apple from '../../assets/shop-apple.png'
import banana from '../../assets/shop-banana.png'
import pepper from '../../assets/shop-pepper.png'
import cabbage from '../../assets/shop-cabbage.png'
import carrot from '../../assets/shop-carrot.png'
import corn from '../../assets/shop-corn.png'
import cucumber from '../../assets/shop-cucumber.png'
import guava from '../../assets/shop-guava.png'
import gumamela from '../../assets/shop-gumamela.png'
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
  available: boolean
}
type ProductDraft = Omit<Product, 'id'>

const categories: ProductCategory[] = ['VEGETABLES', 'FRUITS', 'GRAINS', 'FLOWERS']
const imageOptions = [
  { label: 'Apple', value: apple },
  { label: 'Banana', value: banana },
  { label: 'Bell Pepper', value: pepper },
  { label: 'Cabbage', value: cabbage },
  { label: 'Carrot', value: carrot },
  { label: 'Corn', value: corn },
  { label: 'Cucumber', value: cucumber },
  { label: 'Guava', value: guava },
  { label: 'Gumamela', value: gumamela },
]

function currency(value: number) {
  return `₱${value.toFixed(2)}`
}

function emptyDraft(): ProductDraft {
  return { name: '', category: 'VEGETABLES', price: 100, stock: 0, unit: 'KG', image: imageOptions[0].value, available: true }
}

function ProductCard({ product, selected, onEdit }: { product: Product; selected: boolean; onEdit: () => void }) {
  return (
    <article className={`${styles.productCard} ${selected ? styles.selectedCard : ''}`}>
      <img src={product.image} alt={product.name} />
      <div className={styles.productInfo}>
        <div>
          <strong>{product.name}</strong>
          <small>{product.category}</small>
          <small className={product.available ? styles.available : styles.unavailable}>{product.stock} {product.unit} {product.available ? 'AVAILABLE' : 'UNAVAILABLE'}</small>
        </div>
        <div className={styles.price}><strong>{currency(product.price)}</strong><small>PER {product.unit}</small></div>
      </div>
      <button type="button" onClick={onEdit}>EDIT</button>
    </article>
  )
}

function ProductForm({ draft, editing, isSaving, onChange, onSubmit }: {
  draft: ProductDraft
  editing: boolean
  isSaving: boolean
  onChange: (draft: ProductDraft) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.imagePreview}><img src={draft.image} alt="Product preview" /></div>
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
      <button className={styles.submit} disabled={isSaving} type="submit">{editing ? 'SAVE CHANGES' : 'SUBMIT'}</button>
    </form>
  )
}

export function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft())
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selectedProduct = products.find((product) => product.id === selectedId)
  const visibleProducts = useMemo(() => products.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(search.toLowerCase())), [products, search])

  useEffect(() => {
    async function loadProducts() {
      try {
        const snapshot = await getDocs(collection(db, 'products'))
        setProducts(snapshot.docs.map((product) => {
          const data = product.data()
          const imageUrl = typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : imageOptions[0].value
          return {
            id: product.id,
            name: typeof data.name === 'string' ? data.name : '',
            category: categories.includes(data.category) ? data.category : 'VEGETABLES',
            price: typeof data.price === 'number' ? data.price : 0,
            stock: typeof data.stock === 'number' ? data.stock : 0,
            unit: typeof data.unit === 'string' ? data.unit : 'KG',
            image: imageUrl,
            available: typeof data.isAvailable === 'boolean' ? data.isAvailable : true,
          }
        }))
      } catch (loadError) {
        console.error('Loading products failed:', loadError)
        setError('Unable to load products. Please try again.')
      } finally {
        setIsLoading(false)
      }
    }

    void loadProducts()
  }, [])

  function startAdd() {
    setSelectedId(null)
    setDraft(emptyDraft())
    setIsFormOpen(true)
  }

  function startEdit(product: Product) {
    setSelectedId(product.id)
    setDraft({ ...product })
    setIsFormOpen(true)
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = { ...draft, name: draft.name.trim().toUpperCase() }
    if (!normalized.name) return
    setError('')
    setIsSaving(true)

    const productData = {
      name: normalized.name,
      category: normalized.category,
      price: Number(normalized.price),
      stock: Number(normalized.stock),
      unit: normalized.unit,
      imageUrl: normalized.image,
      isAvailable: Boolean(normalized.available),
    }

    try {
      if (selectedProduct) {
        await updateDoc(doc(db, 'products', selectedProduct.id), productData)
        setProducts((current) => current.map((product) => product.id === selectedProduct.id ? { ...product, ...normalized } : product))
      } else {
        const created = await addDoc(collection(db, 'products'), { ...productData, createdAt: serverTimestamp() })
        setProducts((current) => [...current, { ...normalized, id: created.id }])
        setSelectedId(created.id)
      }
    } catch (saveError) {
      console.error('Saving product failed:', saveError)
      setError('Unable to save the product. Please try again.')
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
            {!isLoading && error && <p className={styles.empty} role="alert">{error}</p>}
            {!isLoading && !error && visibleProducts.length === 0 && <p className={styles.empty}>No products found.</p>}
          </section>
          {isFormOpen && <ProductForm draft={draft} editing={Boolean(selectedId)} isSaving={isSaving} onChange={setDraft} onSubmit={saveProduct} />}
        </div>
      </section>
    </main>
  )
}
