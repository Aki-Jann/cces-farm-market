import { useState } from 'react'
import type { FormEvent } from 'react'
import { CustomerSidebar } from './CustomerSidebar'
import styles from './AccountPage.module.css'

type AccountData = { name: string; email: string; contact: string; address: string }

const initialAccount: AccountData = {
  name: 'Jasmien Pajiji',
  email: 'jasmienpajiji@example.com',
  contact: '09XX XXX XXXX',
  address: 'Zone 1, Zamboanga City, Philippines',
}

export function AccountPage() {
  const [account, setAccount] = useState(initialAccount)
  const [draft, setDraft] = useState(initialAccount)
  const [editing, setEditing] = useState(false)

  function updateField(field: keyof AccountData, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAccount(draft)
    setEditing(false)
  }

  return (
    <main className={styles.page}>
      <CustomerSidebar active="account" />
      <section className={styles.content}>
        <header className={styles.header}><h1>MY ACCOUNT</h1></header>
        <section className={styles.card}>
          <div className={styles.profileHeader}>
            <div className={styles.avatar}>{account.name.charAt(0)}</div>
            <div><h2>{account.name}</h2><p>{account.email}</p></div>
            <a href="#/" className={styles.logout}>LOG OUT</a>
          </div>
          <div className={styles.sectionHeading}>
            <strong>Personal Information</strong>
            {!editing && <button type="button" onClick={() => { setDraft(account); setEditing(true) }}>EDIT INFO</button>}
          </div>
          {editing ? (
            <form className={styles.form} onSubmit={save}>
              <label>Name<input value={draft.name} onChange={(event) => updateField('name', event.target.value)} /></label>
              <label>Email Address<input type="email" value={draft.email} onChange={(event) => updateField('email', event.target.value)} /></label>
              <label>Contact Number<input value={draft.contact} onChange={(event) => updateField('contact', event.target.value)} /></label>
              <label>Address<input value={draft.address} onChange={(event) => updateField('address', event.target.value)} /></label>
              <div className={styles.actions}><button type="button" onClick={() => setEditing(false)}>CANCEL</button><button type="submit">SAVE</button></div>
            </form>
          ) : (
            <dl className={styles.details}>
              <div><dt>Name</dt><dd>{account.name}</dd></div>
              <div><dt>Email Address</dt><dd>{account.email}</dd></div>
              <div><dt>Contact Number</dt><dd>{account.contact}</dd></div>
              <div><dt>Address</dt><dd>{account.address}</dd></div>
            </dl>
          )}
        </section>
      </section>
    </main>
  )
}
