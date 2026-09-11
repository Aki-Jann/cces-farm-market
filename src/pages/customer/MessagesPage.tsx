import { useState } from 'react'
import type { FormEvent } from 'react'
import { CustomerSidebar } from '../../components/layout/CustomerSidebar'
import { BrandLogo } from '../../components/common/BrandLogo'
import { Header } from '../../components/layout/Header'
import styles from './MessagesPage.module.css'

type Message = { id: string; text: string; timestamp: string; sender: 'customer' | 'market' }

const initialMessages: Message[] = [
  { id: 'm1', sender: 'customer', text: 'Hi! Do you have any heirlooms available this Saturday? We need about 20 lbs.', timestamp: '2026-08-17 09:12' },
  { id: 'm2', sender: 'market', text: 'Hi Jasmien! Yes, we have fresh heirloom tomatoes available for Saturday pickup.', timestamp: '2026-08-17 09:18' },
  { id: 'm3', sender: 'market', text: 'Your order is ready for pickup this Saturday from 8am to 1pm.', timestamp: '2026-08-15 16:40' },
]

export function MessagesPage() {
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    setMessages((current) => [...current, { id: `m-${Date.now()}`, sender: 'customer', text, timestamp: '2026-08-17 09:30' }])
    setDraft('')
  }

  return (
    <main className={styles.page}>
      <CustomerSidebar active="messages" />
      <section className={styles.content}>
        <Header title="MESSAGE" logo={<BrandLogo compact />} />
        <div className={styles.messaging}>
          <section className={styles.chat} aria-label="Conversation with GreenMarket">
            <div className={styles.messageList}>
              {messages.map((message) => (
                <article className={`${styles.message} ${message.sender === 'customer' ? styles.outgoing : styles.incoming}`} key={message.id}>
                  <p>{message.text}</p>
                  <time>{message.timestamp}</time>
                </article>
              ))}
            </div>
            <form className={styles.composer} onSubmit={sendMessage}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message..." aria-label="Message" />
              <button type="submit">SEND</button>
            </form>
          </section>
        </div>
      </section>
    </main>
  )
}
