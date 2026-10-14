import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { CustomerSidebar } from '../../components/layout/CustomerSidebar'
import { Header } from '../../components/layout/Header'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import { formatMonthDayYear, formatMonthDayYearTime } from '../../utils/dateFormat'
import styles from './MessagesPage.module.css'

type Message = { id: string; text: string; timestamp: string; sender: 'customer' | 'market'; dayDivider?: string }
type LoadedMessage = Omit<Message, 'dayDivider'> & { createdAt: Date | null }

function parseMessageDate(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate()
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
  }
  return null
}

export function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const shouldScrollToBottom = useRef(true)

  useEffect(() => {
    if (!shouldScrollToBottom.current) return
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: 'auto',
    })
  }, [messages])

  useEffect(() => {
    let unsubscribeMessages: (() => void) | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeMessages?.()
      unsubscribeMessages = undefined

      if (!user) {
        setMessages([])
        setError('Please log in to view your messages.')
        setIsLoading(false)
        return
      }

      const messagesQuery = query(collection(db, 'conversations', user.uid, 'messages'))
      unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
        const sortedMessages = snapshot.docs
          .map((messageDocument): LoadedMessage => {
            const data = messageDocument.data()
            const createdAt = parseMessageDate(data.createdAt)
            return {
              id: messageDocument.id,
              sender: data.senderRole === 'customer' ? 'customer' : 'market',
              text: typeof data.text === 'string' ? data.text : '',
              timestamp: createdAt ? formatMonthDayYearTime(createdAt) : 'Pending',
              createdAt,
            }
          })
          .filter((message) => message.text)
          .sort((first, second) => {
            const firstTime = first.createdAt?.getTime() ?? 0
            const secondTime = second.createdAt?.getTime() ?? 0
            return firstTime - secondTime
          })
        let previousDay = ''
        const loadedMessages = sortedMessages.map(({ createdAt, ...message }) => {
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
        setError('')
      }, (snapshotError) => {
        console.error('Loading messages failed:', snapshotError)
        setError('Unable to load messages. Please try again.')
        setIsLoading(false)
      })
    })

    return () => {
      unsubscribeMessages?.()
      unsubscribeAuth()
    }
  }, [])

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    const user = auth.currentUser
    if (!text || !user || isSending) return

    setIsSending(true)
    setError('')
    try {
      const conversationRef = doc(db, 'conversations', user.uid)
      await addDoc(collection(conversationRef, 'messages'), {
        senderId: user.uid,
        senderRole: 'customer',
        text,
        createdAt: serverTimestamp(),
      })
      await setDoc(conversationRef, {
        customerId: user.uid,
        lastMessage: text,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setDraft('')
    } catch (sendError) {
      console.error('Sending message failed:', sendError)
      setError('Unable to send your message. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <main className={styles.page}>
      <CustomerSidebar active="messages" />
      <section className={styles.content}>
        <Header title="MESSAGE" />
        <div className={styles.messaging}>
          <section className={styles.chat} aria-label="Conversation with GreenMarket">
            <div className={styles.conversationHeader}>
              <div className={styles.conversationAvatar} aria-hidden="true">G</div>
              <div className={styles.conversationIdentity}>
                <strong>GreenMarket</strong>
                <span>Seller conversation</span>
              </div>
              <span className={styles.sellerBadge}>SELLER</span>
            </div>
            <div
              className={styles.messageList}
              onScroll={(event) => {
                const element = event.currentTarget
                shouldScrollToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24
              }}
              ref={messageListRef}
            >
              {isLoading ? (
                <p className={styles.listNotice}>Loading messages...</p>
              ) : error && messages.length === 0 ? (
                <p className={styles.listNotice} role="alert">{error}</p>
              ) : messages.length === 0 ? (
                <div className={styles.emptyConversation}>
                  <strong>No messages yet</strong>
                  <span>Your conversation with GreenMarket will appear here.</span>
                </div>
              ) : messages.map((message) => (
                <div className={styles.messageGroup} key={message.id}>
                  {message.dayDivider && (
                    <div className={styles.dayDivider} role="separator" aria-label={`Messages from ${message.dayDivider}`}>
                      <span>{message.dayDivider}</span>
                    </div>
                  )}
                  <article className={`${styles.message} ${message.sender === 'customer' ? styles.outgoing : styles.incoming}`}>
                    <span className={styles.senderLabel}>{message.sender === 'customer' ? 'You' : 'GreenMarket'}</span>
                    <p>{message.text}</p>
                    <time>{message.timestamp}</time>
                  </article>
                </div>
              ))}
            </div>
            {error && messages.length > 0 && <p className={styles.sendError} role="alert">{error}</p>}
            <form className={styles.composer} onSubmit={sendMessage}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message..." aria-label="Message" />
              <button disabled={isSending || !draft.trim()} type="submit">
                <span>{isSending ? 'SENDING' : 'SEND'}</span>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
              </button>
            </form>
          </section>
        </div>
      </section>
    </main>
  )
}
