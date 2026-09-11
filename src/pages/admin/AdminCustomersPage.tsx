import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { AdminSidebar } from '../../components/layout/AdminSidebar'
import { Header } from '../../components/layout/Header'
import styles from './AdminCustomersPage.module.css'

type Message = { id: string; text: string; timestamp: string; sender: 'customer' | 'admin' }
type Order = { id: string; date: string; status: 'DELIVERED' | 'PENDING'; total: number }
type Customer = {
  id: string
  initials: string
  name: string
  phone: string
  email: string
  segment: 'RESTAURANT' | 'RETAIL' | 'WHOLESALE'
  joined: string
  notes: string
  orders: Order[]
  messages: Message[]
}

const initialCustomers: Customer[] = [
  {
    id: 'jasmien',
    initials: 'JP',
    name: 'JASMIEN PAJIJI',
    phone: '0912-345-2026',
    email: 'jasmienpajiji@gmail.com',
    segment: 'RESTAURANT',
    joined: 'September 7, 2026',
    notes: 'Chef prefers Grade A tomatoes only.\nWeekly order most summers.\nPays promptly.',
    orders: [{ id: 'ORD-0001', date: '09-09-2026', status: 'DELIVERED', total: 525 }],
    messages: [
      { id: 'm1', sender: 'customer', text: 'Hi! Do you have any heirlooms available this Saturday? We need about 20 lbs.', timestamp: '2026-08-17 09:12' },
      { id: 'm2', sender: 'admin', text: 'Yes, we have plenty! Just confirmed your order ORD-2848. See you Saturday.', timestamp: '2026-08-17 09:45' },
      { id: 'm3', sender: 'customer', text: 'Perfect. Could we also grab some basil if you have extra? Maybe 3–4 bunches.', timestamp: '2026-08-17 10:02' },
    ],
  },
  {
    id: 'aaron',
    initials: 'AE',
    name: 'AARON JANN ENRIQUEZ',
    phone: '0912-345-2026',
    email: 'aaron.enriquez@gmail.com',
    segment: 'RESTAURANT',
    joined: 'September 6, 2026',
    notes: 'Orders mixed vegetables for weekly meal preparation.',
    orders: [{ id: 'ORD-0002', date: '09-08-2026', status: 'PENDING', total: 375 }],
    messages: [{ id: 'm4', sender: 'customer', text: 'Can I update the quantities on my order?', timestamp: '2026-08-16 14:20' }],
  },
  {
    id: 'stephen',
    initials: 'SD',
    name: 'STEPHEN DAVID',
    phone: '0912-345-2026',
    email: 'stephen.david@gmail.com',
    segment: 'RESTAURANT',
    joined: 'September 5, 2026',
    notes: 'Prefers Saturday pickup.',
    orders: [{ id: 'ORD-0003', date: '09-07-2026', status: 'DELIVERED', total: 375 }],
    messages: [],
  },
  {
    id: 'abdullah',
    initials: 'AR',
    name: 'ABDULLAH RATAG',
    phone: '0912-345-2026',
    email: 'abdullah.ratag@gmail.com',
    segment: 'RETAIL',
    joined: 'September 4, 2026',
    notes: 'Retail buyer.',
    orders: [{ id: 'ORD-0004', date: '09-02-2026', status: 'DELIVERED', total: 375 }],
    messages: [],
  },
  { id: 'roni', initials: 'RB', name: 'RONI BAUZON', phone: '0912-345-2026', email: 'roni.bauzon@gmail.com', segment: 'RETAIL', joined: 'September 3, 2026', notes: 'Retail buyer.', orders: [{ id: 'ORD-0005', date: '09-02-2026', status: 'DELIVERED', total: 375 }], messages: [] },
  { id: 'aj', initials: 'AN', name: 'AJ NOBLEZA', phone: '0912-345-2026', email: 'aj.nobleza@gmail.com', segment: 'WHOLESALE', joined: 'September 2, 2026', notes: 'Wholesale customer with recurring orders.', orders: [{ id: 'ORD-0006', date: '09-02-2026', status: 'DELIVERED', total: 375 }, { id: 'ORD-0007', date: '09-01-2026', status: 'DELIVERED', total: 375 }], messages: [] },
]

function currency(value: number) {
  return `₱${value.toFixed(2)}`
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

function CustomerHeader({ customer }: { customer: Customer }) {
  return <div className={styles.customerHeader}><span className={styles.largeAvatar}>{customer.initials}</span><div><h2>{customer.name}</h2><p>{customer.phone} <a href={`mailto:${customer.email}`}>{customer.email}</a></p></div><div className={styles.headerMeta}><strong>{customer.segment}</strong><small>Since {customer.joined}</small></div></div>
}

function Profile({ customer }: { customer: Customer }) {
  const spent = customer.orders.reduce((sum, order) => sum + order.total, 0)
  const active = customer.orders.filter((order) => order.status === 'PENDING').length
  return <div className={styles.profile}>
    <div className={styles.stats}><article><strong>{customer.orders.length}</strong><span>TOTAL ORDER{customer.orders.length === 1 ? '' : 'S'}</span></article><article><strong>{currency(spent)}</strong><span>SPENT</span></article><article><strong>{active}</strong><span>ACTIVE ORDER{active === 1 ? '' : 'S'}</span></article></div>
    <h3>FARM NOTES</h3><p className={styles.notes}>{customer.notes}</p>
    <h3>ORDER HISTORY</h3><div className={styles.orderHistory}>{customer.orders.map((order) => <div key={order.id}><span>{order.id}</span><span>{order.date}</span><b>{order.status}</b><strong>{currency(order.total)}</strong></div>)}</div>
  </div>
}

function Messages({ customer, onSend }: { customer: Customer; onSend: (text: string) => void }) {
  const [draft, setDraft] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }
  return <div className={styles.chat}><div className={styles.messageList}>{customer.messages.map((message) => <article className={`${styles.message} ${message.sender === 'admin' ? styles.outgoing : styles.incoming}`} key={message.id}><p>{message.text}</p><time>{message.timestamp}</time></article>)}</div><form className={styles.composer} onSubmit={submit}><input aria-label={`Message ${customer.name}`} placeholder={`Message ${customer.name}...`} value={draft} onChange={(event) => setDraft(event.target.value)} /><button type="submit">SEND</button></form></div>
}

export function AdminCustomersPage() {
  const [customers, setCustomers] = useState(initialCustomers)
  const [selectedId, setSelectedId] = useState(initialCustomers[0].id)
  const [tab, setTab] = useState<'profile' | 'messages'>('profile')
  const [search, setSearch] = useState('')
  const selected = customers.find((customer) => customer.id === selectedId) ?? customers[0]
  const visibleCustomers = useMemo(() => customers.filter((customer) => `${customer.name} ${customer.email} ${customer.segment}`.toLowerCase().includes(search.toLowerCase())), [customers, search])

  function sendMessage(text: string) {
    setCustomers((current) => current.map((customer) => customer.id === selected.id ? { ...customer, messages: [...customer.messages, { id: `message-${Date.now()}`, sender: 'admin', text, timestamp: '2026-09-11 08:40' }] } : customer))
  }

  return <main className={styles.page}><AdminSidebar active="customers" /><section className={styles.content}><Header title="CUSTOMERS" search={search} onSearchChange={(event) => setSearch(event.target.value)} /><div className={styles.workspace}><CustomerList customers={visibleCustomers} selectedId={selected.id} onSelect={(id) => { setSelectedId(id); setTab('profile') }} /><section className={styles.details}><CustomerHeader customer={selected} /><nav className={styles.tabs}><button className={tab === 'profile' ? styles.activeTab : ''} type="button" onClick={() => setTab('profile')}>PROFILE</button><button className={tab === 'messages' ? styles.activeTab : ''} type="button" onClick={() => setTab('messages')}>MESSAGES</button></nav>{tab === 'profile' ? <Profile customer={selected} /> : <Messages customer={selected} onSend={sendMessage} />}</section></div></section></main>
}
