import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import { ROLES } from '../../constants/roles'
import styles from './AdminCustomersPage.module.css'
import { formatMonthDayYear, formatTime } from '../../utils/dateFormat'

type Message = { id: string; text: string; timestamp: string; sender: typeof ROLES.CUSTOMER | typeof ROLES.FARMER; dayDivider?: string }
type LoadedMessage = Omit<Message, 'dayDivider'> & { createdAt: Date | null }
type Order = { id: string; date: string; status: 'DELIVERED' | 'PENDING' | 'CONFIRMED' | 'PACKED'; total: number }
type Customer = {
  id: string
  initials: string
  name: string
  photoUrl: string
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
    return formatMonthDayYear(value.toDate())
  }
  return fallback
}

function parseMessageDate(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate()
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
  }
  return null
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

function CustomerAvatar({ customer, large = false }: { customer: Customer; large?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <span className={large ? styles.largeAvatar : styles.avatar}>
      {customer.photoUrl && !imageFailed
        ? <img alt="" onError={() => setImageFailed(true)} src={customer.photoUrl} />
        : customer.initials}
    </span>
  )
}

function CustomerList({ customers, selectedId, onSelect }: {
  customers: Customer[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <aside className={styles.customerList} aria-label="Customers">
      <div className={styles.customerListHeader}>
        <div><h2>Customers</h2><span>{customers.length} profiles</span></div>
      </div>
      {customers.map((customer) => (
        <button className={selectedId === customer.id ? styles.selectedCustomer : ''} key={customer.id} type="button" onClick={() => onSelect(customer.id)}>
          <CustomerAvatar key={`${customer.id}-${customer.photoUrl}`} customer={customer} />
          <span className={styles.customerSummary}><strong>{customer.name}</strong><small>{customer.phone || customer.email || 'No contact details'}</small><small>{customer.orders.length} ORDER{customer.orders.length === 1 ? '' : 'S'}</small></span>
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

  return <div className={styles.customerHeader}><CustomerAvatar key={`${customer.id}-${customer.photoUrl}`} customer={customer} large /><div className={styles.customerIdentity}><h2>{customer.name}</h2><p>{customer.phone || 'Phone not provided'}{customer.email && <> <a href={`mailto:${customer.email}`}>{customer.email}</a></>}</p></div><div className={styles.headerMeta}>{isEditing ? <select className={styles.customerTypeSelect} aria-label="Customer type" autoFocus value={customerType} onChange={(event) => { onChangeCustomerType(event.target.value as CustomerType); setIsEditing(false) }} onBlur={() => setIsEditing(false)}>{customerTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select> : <button className={styles.customerTypeButton} type="button" onClick={() => setIsEditing(true)}>{customer.segment} <span aria-hidden="true">⌄</span></button>}<small>Customer since {customer.joined}</small></div></div>
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
    <div className={styles.sectionHeading}><h3>Farm notes</h3>{!isEditingNotes && <button type="button" onClick={() => setIsEditingNotes(true)}>EDIT NOTES</button>}</div>
    {isEditingNotes ? <textarea className={styles.notesEditor} aria-label="Farm notes" autoFocus value={notes} disabled={isSaving} onChange={(event) => setNotes(event.target.value)} onBlur={() => void saveNotes(notes)} onKeyDown={(event) => { if (event.key === 'Escape') { setNotes(customer.farmNotes); setIsEditingNotes(false) } }} /> : <p className={styles.notes}>{notes || 'No farm notes yet. Add details about this customer’s farm, preferences, or delivery requirements.'}</p>}
    <div className={styles.sectionHeading}><h3>Order history</h3><span>{customer.orders.length} orders</span></div>
    {customer.orders.length ? <div className={styles.orderHistory}><div className={styles.orderHistoryHeading}><span>ORDER</span><span>DATE</span><span>STATUS</span><span>TOTAL</span></div>{customer.orders.map((order) => <div className={styles.orderRow} key={order.id}><span>{order.id}</span><span>{order.date}</span><b className={styles[order.status.toLowerCase()]}>{order.status}</b><strong>{currency(order.total)}</strong></div>)}</div> : <p className={styles.emptyOrders}>No orders from this customer yet.</p>}
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
    const farmer = auth.currentUser
    let unsubscribeMessages: (() => void) | undefined
    if (!farmer) return

    const messagesQuery = query(collection(db, 'conversations', customer.id, 'farmers', farmer.uid, 'messages'))
    unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
        const sortedMessages = snapshot.docs
          .map((messageDocument): LoadedMessage => {
            const data = messageDocument.data()
            const createdAt = parseMessageDate(data.createdAt)
            return {
              id: messageDocument.id,
              sender: data.senderRole === ROLES.CUSTOMER ? ROLES.CUSTOMER : ROLES.FARMER,
              text: typeof data.text === 'string' ? data.text : '',
              timestamp: createdAt ? formatTime(createdAt) : 'Pending',
              createdAt,
            }
          })
          .filter((message) => message.text)
          .sort((first, second) => (first.createdAt?.getTime() ?? 0) - (second.createdAt?.getTime() ?? 0))

        let previousDay = ''
        const loadedMessages: Message[] = sortedMessages.map(({ createdAt, ...message }) => {
          const currentDay = createdAt
            ? `${createdAt.getFullYear()}-${createdAt.getMonth()}-${createdAt.getDate()}`
            : ''
          const dayDivider = createdAt && currentDay !== previousDay
            ? formatMonthDayYear(createdAt)
            : undefined
          if (currentDay) previousDay = currentDay
          return { ...message, ...(dayDivider ? { dayDivider } : {}) }
        })

        setMessages(loadedMessages)
        setIsLoading(false)
      }, (snapshotError) => {
        console.error('Loading customer messages failed:', snapshotError)
        setError('Unable to load messages. Please try again.')
        setIsLoading(false)
    })
    return () => {
      unsubscribeMessages?.()
    }
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
    const farmer = auth.currentUser
    if (!text || isSending || isLoading) return
    if (!farmer) {
      setError('Please log in to send messages.')
      return
    }

    setIsSending(true)
    setError('')
    try {
      const conversationRef = doc(db, 'conversations', customer.id, 'farmers', farmer.uid)
      const batch = writeBatch(db)
      batch.set(conversationRef, {
        customerId: customer.id,
        farmerId: farmer.uid,
        lastMessage: text,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      batch.set(doc(collection(conversationRef, 'messages')), {
        senderId: farmer.uid,
        senderRole: ROLES.FARMER,
        text,
        createdAt: serverTimestamp(),
      })
      await batch.commit()
      setDraft('')
    } catch (sendError) {
      console.error('Sending customer message failed:', sendError)
      setError('Unable to send message. Please try again.')
    } finally {
      setIsSending(false)
    }
  }
  return <div className={styles.chat}><div className={styles.messageList} onScroll={(event) => { const element = event.currentTarget; shouldScrollToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24 }} ref={messageListRef}>{isLoading ? <p>Loading messages...</p> : error && messages.length === 0 ? <p role="alert">{error}</p> : messages.map((message) => (
  <div className={styles.messageGroup} key={message.id}>
    {message.dayDivider && (
      <div className={styles.dayDivider} role="separator" aria-label={`Messages from ${message.dayDivider}`}>
        <span>{message.dayDivider}</span>
      </div>
    )}
    <article className={`${styles.message} ${message.sender !== ROLES.CUSTOMER ? styles.outgoing : styles.incoming}`}>
      <p>{message.text}</p>
      <time>{message.timestamp}</time>
    </article>
  </div>
))}</div><form className={styles.composer} onSubmit={submit}><input aria-label={`Message ${customer.name}`} placeholder={`Message ${customer.name}...`} value={draft} onChange={(event) => setDraft(event.target.value)} /><button disabled={isSending || isLoading} type="submit">SEND</button></form>{error && messages.length > 0 && <p role="alert">{error}</p>}</div>
}

type RawUserRecord = { id: string; data: Record<string, unknown> }
type RawOrderRecord = { id: string; data: Record<string, unknown> }

export function AdminCustomersPage() {
  const [rawUsers, setRawUsers] = useState<RawUserRecord[]>([])
  const [rawOrders, setRawOrders] = useState<RawOrderRecord[]>([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [tab, setTab] = useState<'profile' | 'messages'>('messages')
  const [search, setSearch] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [notesByCustomer, setNotesByCustomer] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const isLoading = !usersLoaded || !ordersLoaded

  const customers = useMemo<Customer[]>(() => {
    const farmerCustomerIds = new Set(rawOrders
      .map(({ data }) => data.userId)
      .filter((userId): userId is string => typeof userId === 'string'))
    return rawUsers.flatMap(({ id, data }) => {
      if (data.role !== ROLES.CUSTOMER || !farmerCustomerIds.has(id)) return []

      const firstName = typeof data.firstName === 'string' ? data.firstName.trim() : ''
      const lastName = typeof data.lastName === 'string' ? data.lastName.trim() : ''
      const name = `${firstName} ${lastName}`.trim() || 'Unnamed customer'
      const customerType = normalizeCustomerType(data.customerType)
      const farmNotes = notesByCustomer[id] ?? ''
      const orders = rawOrders.flatMap(({ id: orderId, data: orderData }) => {
        if (orderData.userId !== id) return []
        return [{
          id: typeof orderData.orderNumber === 'string' ? orderData.orderNumber : orderId,
          date: formatDate(orderData.createdAt, 'Pending'),
          status: orderStatus(orderData.status),
          total: typeof orderData.total === 'number' ? orderData.total : 0,
        }]
      })

      return [{
        id,
        initials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
        name: name.toUpperCase(),
        photoUrl: [data.photoURL, data.photoUrl, data.profilePicture, data.profileImage, data.avatarUrl]
          .find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '',
        phone: typeof data.contactNumber === 'string' ? data.contactNumber : '',
        email: typeof data.email === 'string' ? data.email : '',
        segment: customerType.toUpperCase(),
        joined: formatDate(data.createdAt),
        farmNotes,
        notes: farmNotes || 'No farm notes.',
        orders,
        messages: [],
      }]
    })
  }, [notesByCustomer, rawUsers, rawOrders])

  const visibleCustomers = useMemo(() => {
    const query = search.trim().toLowerCase()
    return customers
      .filter((customer) =>
        !query ||
        customer.name.toLowerCase().includes(query) ||
        customer.email.toLowerCase().includes(query) ||
        customer.segment.toLowerCase().includes(query) ||
        customer.phone.toLowerCase().includes(query)
      )
  }, [customers, search])

  const selected = visibleCustomers.find((customer) => customer.id === selectedId) ?? visibleCustomers[0]

  useEffect(() => {
    const farmer = auth.currentUser
    if (!farmer || !selected?.id) return
    return onSnapshot(
      doc(db, 'farmerProfiles', farmer.uid, 'customerNotes', selected.id),
      (snapshot) => {
        setNotesByCustomer((current) => {
          if (!snapshot.exists() || typeof snapshot.data().notes !== 'string') {
            const { [selected.id]: _removed, ...remaining } = current
            return remaining
          }
          return { ...current, [selected.id]: snapshot.data().notes }
        })
      },
      (loadError) => {
        console.error('Loading farmer-specific customer notes failed:', loadError)
        setError('Unable to load farm notes. Please try again.')
      }
    )
  }, [selected?.id])

  // Users and orders are independent collections, so each gets its own
  // real-time listener; the customer list above is derived from both.
  useEffect(() => {
    const unsubscribeUsers = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        setRawUsers(snapshot.docs.map((userDocument) => ({ id: userDocument.id, data: userDocument.data() })))
        setUsersLoaded(true)
        setError('')
      },
      (loadError) => {
        console.error('Loading customers failed:', loadError)
        setError('Unable to load customers. Please try again.')
        setUsersLoaded(true)
      }
    )

    const farmer = auth.currentUser
    if (!farmer) {
      return () => unsubscribeUsers()
    }

    const unsubscribeOrders = onSnapshot(
      query(collection(db, 'orders'), where('farmerId', '==', farmer.uid)),
      (snapshot) => {
        setRawOrders(snapshot.docs.map((orderDocument) => ({ id: orderDocument.id, data: orderDocument.data() })))
        setOrdersLoaded(true)
      },
      (loadError) => {
        console.error('Loading customer orders failed:', loadError)
        setError('Unable to load customers. Please try again.')
        setOrdersLoaded(true)
      }
    )

    return () => {
      unsubscribeUsers()
      unsubscribeOrders()
    }
  }, [])

  async function updateCustomerProfile(field: 'customerType', value: string) {
    if (!selected) return
    setError('')
    setIsSaving(true)
    try {
      await updateDoc(doc(db, 'users', selected.id), { [field]: value })
    } catch (saveError) {
      console.error('Updating customer profile failed:', saveError)
      setError('Unable to save customer information. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  async function saveFarmNotes(value: string) {
    const farmer = auth.currentUser
    if (!selected || !farmer) return
    setError('')
    setIsSaving(true)
    try {
      await setDoc(doc(db, 'farmerProfiles', farmer.uid, 'customerNotes', selected.id), {
        notes: value,
        updatedBy: farmer.uid,
        updatedAt: serverTimestamp(),
      })
    } catch (saveError) {
      console.error('Saving farmer-specific customer notes failed:', saveError)
      setError('Unable to save farm notes. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }
  return <main className={styles.page}><AdminSidebar active="customers" />
  <section className={styles.content}>
    <Header title="MESSAGES" search={search} onSearchChange={(event) => setSearch(event.target.value)} />
      {isLoading ? <div className={styles.workspace}>
          <p>Loading customers...</p>
          </div> : error && customers.length === 0 ? 
          <div className={styles.workspace}><p role="alert">{error}</p>
          </div> : !selected ? <div className={styles.workspace}>
            <p>{search.trim() ? 'No customer profiles match your search.' : 'No customer profiles found.'}</p>
          </div> : <div className={styles.workspace}>
            <CustomerList customers={visibleCustomers} selectedId={selected.id} onSelect={(id) => { setSelectedId(id); setTab('messages') }} />
              <section className={styles.details}>
                <CustomerHeader customer={selected} onChangeCustomerType={(customerType) => void updateCustomerProfile('customerType', customerType)} />
                  <nav className={styles.tabs}>
                    <button className={tab === 'messages' ? styles.activeTab : ''} type="button" onClick={() => setTab('messages')}>MESSAGES</button>
                    <button className={tab === 'profile' ? styles.activeTab : ''} type="button" onClick={() => setTab('profile')}>PROFILE</button>
                    </nav>{tab === 'profile' ? <Profile key={selected.id} customer={selected} isSaving={isSaving} onSaveNotes={saveFarmNotes} /> : <Messages key={selected.id} customer={selected} />}</section></div>}</section></main>
}
