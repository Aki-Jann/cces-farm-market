import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { addDoc, collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import styles from './AdminCustomersPage.module.css'

type Message = { id: string; text: string; timestamp: string; sender: 'customer' | 'admin' }
type LoadedMessage = Message & { createdAt: unknown }
type Order = { id: string; date: string; status: 'DELIVERED' | 'PENDING' | 'CONFIRMED' | 'PACKED'; total: number }
type Customer = {
  id: string
  initials: string
  name: string
  phone: string
  email: string
  segment: string
  joined: string
  farmNotes: string
  notes: string
  orders: Order[]
  messages: Message[]
}

function currency(value: number) {
  return `₱${value.toFixed(2)}`
}

function formatDate(value: unknown, fallback = 'Unknown') {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate()
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`
  }
  return fallback
}

function formatMessageTimestamp(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toLocaleString('en-US')
  }
  return 'Pending'
}

const customerTypes = ['Individual', 'Retail', 'Wholesale'] as const
type CustomerType = typeof customerTypes[number]

function normalizeCustomerType(value: unknown): CustomerType {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return customerTypes.find((type) => type.toLowerCase() === normalized) ?? 'Individual'
}

function orderStatus(value: unknown): Order['status'] {
  if (value === 'delivered') return 'DELIVERED'
  if (value === 'confirmed') return 'CONFIRMED'
  if (value === 'packed') return 'PACKED'
  return 'PENDING'
}

function CustomerList({ customers, selectedId, onSelect }: { customers: Customer[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <aside className={styles.customerList} aria-label="Customers">
      {customers.map((customer) => (
        <button className={selectedId === customer.id ? styles.selectedCustomer : ''} key={customer.id} type="button" onClick={() => onSelect(customer.id)}>
          <span className={styles.avatar}>{customer.initials}</span>
          <span className={styles.customerSummary}><strong>{customer.name}</strong><small>{customer.phone}</small><small>{customer.orders.length} ORDER{customer.orders.length === 1 ? '' : 'S'}</small></span>
          <span className={styles.segment}>{customer.segment}</span>
          <strong className={styles.spent}>{currency(customer.orders.reduce((sum, order) => sum + order.total, 0))} spent</strong>
        </button>
      ))}
    </aside>
  )
}

function CustomerHeader({ customer, onChangeCustomerType }: { customer: Customer; onChangeCustomerType: (customerType: CustomerType) => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const customerType = normalizeCustomerType(customer.segment)

  return <div className={styles.customerHeader}><span className={styles.largeAvatar}>{customer.initials}</span><div><h2>{customer.name}</h2><p>{customer.phone} <a href={`mailto:${customer.email}`}>{customer.email}</a></p></div><div className={styles.headerMeta}>{isEditing ? <select className={styles.customerTypeSelect} aria-label="Customer type" autoFocus value={customerType} onChange={(event) => { onChangeCustomerType(event.target.value as CustomerType); setIsEditing(false) }} onBlur={() => setIsEditing(false)}>{customerTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select> : <strong onClick={() => setIsEditing(true)} role="button" tabIndex={0}>{customer.segment}</strong>}<small>Since {customer.joined}</small></div></div>
}

function Profile({ customer, onSaveNotes, isSaving }: {
  customer: Customer
  onSaveNotes: (notes: string) => Promise<void>
  isSaving: boolean
}) {
  const spent = customer.orders.reduce((sum, order) => sum + order.total, 0)
  const active = customer.orders.filter((order) => order.status === 'PENDING').length
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [notes, setNotes] = useState(customer.farmNotes)
  async function saveNotes(value: string) {
    setNotes(value)
    setIsEditingNotes(false)
    if (value !== customer.farmNotes) await onSaveNotes(value)
  }

  return <div className={styles.profile}>
    <div className={styles.stats}><article><strong>{customer.orders.length}</strong><span>TOTAL ORDER{customer.orders.length === 1 ? '' : 'S'}</span></article><article><strong>{currency(spent)}</strong><span>SPENT</span></article><article><strong>{active}</strong><span>ACTIVE ORDER{active === 1 ? '' : 'S'}</span></article></div>
    <h3>FARM NOTES</h3>{isEditingNotes ? <textarea className={styles.notesEditor} aria-label="Farm notes" autoFocus value={notes} disabled={isSaving} onChange={(event) => setNotes(event.target.value)} onBlur={() => void saveNotes(notes)} onKeyDown={(event) => { if (event.key === 'Escape') { setNotes(customer.farmNotes); setIsEditingNotes(false) } }} /> : <p className={styles.notes} onClick={() => setIsEditingNotes(true)}>{notes || 'No farm notes.'}</p>}
    <h3>ORDER HISTORY</h3><div className={styles.orderHistory}>{customer.orders.map((order) => <div key={order.id}><span>{order.id}</span><span>{order.date}</span><b>{order.status}</b><strong>{currency(order.total)}</strong></div>)}</div>
  </div>
}

function Messages({ customer }: { customer: Customer }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const shouldScrollToBottom = useRef(true)

  useEffect(() => {
    shouldScrollToBottom.current = true
    const messagesQuery = query(collection(db, 'conversations', customer.id, 'messages'))
    return onSnapshot(messagesQuery, (snapshot) => {
      const loadedMessages = snapshot.docs
        .map((messageDocument): LoadedMessage => {
          const data = messageDocument.data()
          return {
            id: messageDocument.id,
            sender: data.senderRole === 'admin' ? 'admin' : 'customer',
            text: typeof data.text === 'string' ? data.text : '',
            timestamp: formatMessageTimestamp(data.createdAt),
            createdAt: data.createdAt,
          }
        })
        .filter((message) => message.text)
        .sort((first, second) => {
          const firstTime = first.createdAt && typeof first.createdAt === 'object' && 'toDate' in first.createdAt && typeof first.createdAt.toDate === 'function' ? first.createdAt.toDate().getTime() : 0
          const secondTime = second.createdAt && typeof second.createdAt === 'object' && 'toDate' in second.createdAt && typeof second.createdAt.toDate === 'function' ? second.createdAt.toDate().getTime() : 0
          return firstTime - secondTime
        })
        .map(({ id, text, timestamp, sender }) => ({ id, text, timestamp, sender }))
      setMessages(loadedMessages)
      setIsLoading(false)
    }, (snapshotError) => {
      console.error('Loading customer messages failed:', snapshotError)
      setError('Unable to load messages. Please try again.')
      setIsLoading(false)
    })
  }, [customer.id])

  useEffect(() => {
    if (!shouldScrollToBottom.current) return
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: 'auto',
    })
  }, [messages])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    const admin = auth.currentUser
    if (!text || isSending) return
    if (!admin) {
      setError('Please log in to send messages.')
      return
    }

    setIsSending(true)
    setError('')
    try {
      const conversationRef = doc(db, 'conversations', customer.id)
      await addDoc(collection(conversationRef, 'messages'), {
        senderId: admin.uid,
        senderRole: 'admin',
        text,
        createdAt: serverTimestamp(),
      })
      await setDoc(conversationRef, {
        customerId: customer.id,
        lastMessage: text,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setDraft('')
    } catch (sendError) {
      console.error('Sending customer message failed:', sendError)
      setError('Unable to send message. Please try again.')
    } finally {
      setIsSending(false)
    }
  }
  return <div className={styles.chat}><div className={styles.messageList} onScroll={(event) => { const element = event.currentTarget; shouldScrollToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24 }} ref={messageListRef}>{isLoading ? <p>Loading messages...</p> : error && messages.length === 0 ? <p role="alert">{error}</p> : messages.map((message) => <article className={`${styles.message} ${message.sender === 'admin' ? styles.outgoing : styles.incoming}`} key={message.id}><p>{message.text}</p><time>{message.timestamp}</time></article>)}</div><form className={styles.composer} onSubmit={submit}><input aria-label={`Message ${customer.name}`} placeholder={`Message ${customer.name}...`} value={draft} onChange={(event) => setDraft(event.target.value)} /><button disabled={isSending} type="submit">SEND</button></form>{error && messages.length > 0 && <p role="alert">{error}</p>}</div>
}

export function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [tab, setTab] = useState<'profile' | 'messages'>('profile')
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const selected = customers.find((customer) => customer.id === selectedId) ?? customers[0]
  const visibleCustomers = useMemo(() => customers.filter((customer) => `${customer.name} ${customer.email} ${customer.segment}`.toLowerCase().includes(search.toLowerCase())), [customers, search])

  useEffect(() => {
    async function loadCustomers() {
      try {
        const [usersSnapshot, ordersSnapshot] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'orders')),
        ])
        const loadedCustomers = usersSnapshot.docs.flatMap((customerDocument) => {
          const data = customerDocument.data()
          if (data.role !== 'customer') return []

          const firstName = typeof data.firstName === 'string' ? data.firstName.trim() : ''
          const lastName = typeof data.lastName === 'string' ? data.lastName.trim() : ''
          const name = `${firstName} ${lastName}`.trim() || 'Unnamed customer'
          const customerType = normalizeCustomerType(data.customerType)
          const farmNotes = typeof data.farmNotes === 'string' ? data.farmNotes.trim() : ''
          const profileNotes = farmNotes
          const orders = ordersSnapshot.docs.flatMap((orderDocument) => {
            const orderData = orderDocument.data()
            if (orderData.userId !== customerDocument.id) return []
            return [{
              id: typeof orderData.orderNumber === 'string' ? orderData.orderNumber : orderDocument.id,
              date: formatDate(orderData.createdAt, 'Pending'),
              status: orderStatus(orderData.status),
              total: typeof orderData.total === 'number' ? orderData.total : 0,
            }]
          })

          return [{
            id: customerDocument.id,
            initials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
            name: name.toUpperCase(),
            phone: typeof data.contactNumber === 'string' ? data.contactNumber : '',
            email: typeof data.email === 'string' ? data.email : '',
            segment: customerType.toUpperCase(),
            joined: formatDate(data.createdAt),
            farmNotes,
            notes: profileNotes || 'No farm notes.',
            orders,
            messages: [],
          }]
        })
        setCustomers(loadedCustomers)
        setSelectedId((current) => current || loadedCustomers[0]?.id || '')
      } catch (loadError) {
        console.error('Loading customers failed:', loadError)
        setError('Unable to load customers. Please try again.')
      } finally {
        setIsLoading(false)
      }
    }

    void loadCustomers()
  }, [])

  async function updateCustomerProfile(field: 'farmNotes' | 'customerType', value: string) {
    if (!selected) return
    setError('')
    setIsSaving(true)
    try {
      await updateDoc(doc(db, 'users', selected.id), { [field]: value })
      setCustomers((current) => current.map((customer) => {
        if (customer.id !== selected.id) return customer
        if (field === 'farmNotes') {
          return { ...customer, farmNotes: value, notes: value.trim() || 'No farm notes.' }
        }
        return { ...customer, segment: value.toUpperCase() }
      }))
    } catch (saveError) {
      console.error('Updating customer profile failed:', saveError)
      setError('Unable to save customer information. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return <main className={styles.page}><AdminSidebar active="customers" /><section className={styles.content}><Header title="CUSTOMERS" search={search} onSearchChange={(event) => setSearch(event.target.value)} />{isLoading ? <div className={styles.workspace}><p>Loading customers...</p></div> : error && customers.length === 0 ? <div className={styles.workspace}><p role="alert">{error}</p></div> : !selected ? <div className={styles.workspace}><p>No customer profiles found.</p></div> : <div className={styles.workspace}><CustomerList customers={visibleCustomers} selectedId={selected.id} onSelect={(id) => { setSelectedId(id); setTab('profile') }} /><section className={styles.details}><CustomerHeader customer={selected} onChangeCustomerType={(customerType) => void updateCustomerProfile('customerType', customerType)} /><nav className={styles.tabs}><button className={tab === 'profile' ? styles.activeTab : ''} type="button" onClick={() => setTab('profile')}>PROFILE</button><button className={tab === 'messages' ? styles.activeTab : ''} type="button" onClick={() => setTab('messages')}>MESSAGES</button></nav>{tab === 'profile' ? <Profile key={selected.id} customer={selected} isSaving={isSaving} onSaveNotes={(notes) => updateCustomerProfile('farmNotes', notes)} /> : <Messages key={selected.id} customer={selected} />}</section></div>}</section></main>
}
