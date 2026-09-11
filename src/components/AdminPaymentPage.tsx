import { useMemo, useState } from 'react'
import { AdminSidebar } from './AdminSidebar'
import { Header } from './Header'
import styles from './AdminPaymentPage.module.css'

type PaymentRecord = {
  orderId: string
  customer: string
  date: string
  items: string[]
  method: 'CASH' | 'GCASH'
  amount: number
  status: 'COLLECTED' | 'PENDING'
}

const payments: PaymentRecord[] = [
  { orderId: 'ORD-0001', customer: 'JASMIEN PAJIJI', date: '09-02-2026', items: ['APPLE', 'BANANA', 'BELL PEPPER'], method: 'CASH', amount: 525, status: 'PENDING' },
  { orderId: 'ORD-0004', customer: 'ABDULLAH RATAG', date: '09-02-2026', items: ['APPLE', 'BANANA'], method: 'CASH', amount: 375, status: 'COLLECTED' },
  { orderId: 'ORD-0005', customer: 'RONI BAUZON', date: '09-02-2026', items: ['CABBAGE'], method: 'CASH', amount: 375, status: 'COLLECTED' },
  { orderId: 'ORD-0006', customer: 'AJ NOBLEZA', date: '09-02-2026', items: ['SAMPAGUITA'], method: 'CASH', amount: 375, status: 'COLLECTED' },
]

function currency(value: number) {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className={styles.summaryCard}>
      <h2>{label}</h2>
      <strong>{value}</strong>
    </article>
  )
}

function PaymentTable({ records }: { records: PaymentRecord[] }) {
  return (
    <section className={styles.tablePanel}>
      <div className={styles.table} role="table" aria-label="Payment records">
        <div className={styles.tableRowHeader} role="row">
          <strong>ORDER</strong>
          <strong>CUSTOMER</strong>
          <strong>DATE</strong>
          <strong>ITEMS</strong>
          <strong>METHOD</strong>
          <strong>AMOUNT</strong>
        </div>
        {records.map((payment) => (
          <div className={styles.tableRow} role="row" key={payment.orderId}>
            <span>{payment.orderId}</span>
            <span>{payment.customer}</span>
            <span>{payment.date}</span>
            <span>{payment.items.join(', ')}</span>
            <span>{payment.method}</span>
            <strong>{currency(payment.amount)}</strong>
          </div>
        ))}
        {records.length === 0 && <p className={styles.empty}>No payment records match your search.</p>}
      </div>
    </section>
  )
}

export function AdminPaymentPage() {
  const [search, setSearch] = useState('')
  const visiblePayments = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return payments
    return payments.filter((payment) => `${payment.orderId} ${payment.customer} ${payment.date} ${payment.items.join(' ')} ${payment.method}`.toLowerCase().includes(query))
  }, [search])

  const collected = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const pending = payments.filter((payment) => payment.status === 'PENDING').reduce((sum, payment) => sum + payment.amount, 0)
  const average = payments.length ? payments.reduce((sum, payment) => sum + payment.amount, 0) / payments.length : 0

  return (
    <main className={styles.page}>
      <AdminSidebar active="orders" />
      <section className={styles.content}>
        <Header
          title="ORDERS"
          search={search}
          onSearchChange={(event) => setSearch(event.target.value)}
          actions={<><a href="#/admin/orders">CURRENT ORDERS</a><a href="#/admin/orders">ARCHIVE</a><a aria-current="page" href="#/admin/payment">PAYMENT</a></>}
        />
        <div className={styles.dashboard}>
          <section className={styles.summary}>
            <SummaryCard label="TOTAL COLLECTED" value={currency(collected)} />
            <SummaryCard label="AVG TRANSACTION" value={currency(average)} />
            <SummaryCard label="PENDING REVENUE" value={currency(pending)} />
          </section>
          <PaymentTable records={visiblePayments} />
        </div>
      </section>
    </main>
  )
}
