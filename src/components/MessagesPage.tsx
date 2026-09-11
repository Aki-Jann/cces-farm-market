import { useState } from 'react'
import type { FormEvent } from 'react'
import { BrandLogo } from './BrandLogo'
import { CustomerSidebar } from './CustomerSidebar'
import styles from './MessagesPage.module.css'

type Message = { id: string; text: string; timestamp: string; sender: 'customer' | 'market' }
type Conversation = { id: string; title: string; preview: string; messages: Message[] }

const initialConversations: Conversation[] = [
  {
    id: 'heirlooms',
    title: 'GreenMarket',
    preview: 'Hi! Do you have any heirlooms available this Saturday?',
    messages: [
      { id: 'm1', sender: 'customer', text: 'Hi! Do you have any heirlooms available this Saturday? We need about 20 lbs.', timestamp: '2026-08-17 09:12' },
      { id: 'm2', sender: 'market', text: 'Hi Jasmien! Yes, we have fresh heirloom tomatoes available for Saturday pickup.', timestamp: '2026-08-17 09:18' },
    ],
  },
  {
    id: 'order-help',
    title: 'GreenMarket Support',
    preview: 'Your order is ready for pickup.',
    messages: [
      { id: 'm3', sender: 'market', text: 'Your order is ready for pickup this Saturday from 8am to 1pm.', timestamp: '2026-08-15 16:40' },
    ],
  },
]

export function MessagesPage() {
  const [conversations, setConversations] = useState(initialConversations)
  const [selectedId, setSelectedId] = useState(initialConversations[0].id)
  const [draft, setDraft] = useState('')
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0]

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    setConversations((current) => current.map((conversation) => conversation.id === selected.id
      ? { ...conversation, preview: text, messages: [...conversation.messages, { id: `m-${Date.now()}`, sender: 'customer', text, timestamp: '2026-08-17 09:30' }] }
      : conversation))
    setDraft('')
  }

  return (
    <main className={styles.page}>
      <CustomerSidebar active="messages" />
      <section className={styles.content}>
        <header className={styles.header}>
          <h1>MESSAGE</h1>
          <BrandLogo compact />
        </header>
        <div className={styles.messaging}>
          <aside className={styles.conversations} aria-label="Conversations">
            <h2>Messages</h2>
            {conversations.map((conversation) => (
              <button className={selected.id === conversation.id ? styles.selectedConversation : ''} key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)}>
                <strong>{conversation.title}</strong>
                <span>{conversation.preview}</span>
              </button>
            ))}
          </aside>
          <section className={styles.chat} aria-label={`Conversation with ${selected.title}`}>
            <div className={styles.messageList}>
              {selected.messages.map((message) => (
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
