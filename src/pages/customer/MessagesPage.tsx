import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { CustomerSidebar } from '../../components/layout/CustomerSidebar'
import { BrandLogo } from '../../components/common/BrandLogo'
import { Header } from '../../components/layout/Header'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import styles from './MessagesPage.module.css'

type Message = { id: string; text: string; timestamp: string; sender: 'customer' | 'market' }
type LoadedMessage = Message & { createdAt: unknown }

function formatTimestamp(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toLocaleString('en-US')
  }
  return 'Pending'
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
        const loadedMessages = snapshot.docs
          .map((messageDocument): LoadedMessage => {
            const data = messageDocument.data()
            return {
              id: messageDocument.id,
              sender: data.senderRole === 'customer' ? 'customer' : 'market',
              text: typeof data.text === 'string' ? data.text : '',
              timestamp: formatTimestamp(data.createdAt),
              createdAt: data.createdAt,
            }
          })
          .filter((message) => message.text)
          .sort((first, second) => {
            const firstTime = first.createdAt && typeof first.createdAt === 'object' && 'toDate' in first.createdAt && typeof first.createdAt.toDate === 'function' ? first.createdAt.toDate().getTime() : 0
            const secondTime = second.createdAt && typeof second.createdAt === 'object' && 'toDate' in second.createdAt && typeof second.createdAt.toDate === 'function' ? second.createdAt.toDate().getTime() : 0
            return firstTime - secondTime
          })
          .map(({ id, sender, text, timestamp }) => ({ id, sender, text, timestamp }))
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
        <Header title="MESSAGE" logo={<BrandLogo compact />} />
        <div className={styles.messaging}>
          <section className={styles.chat} aria-label="Conversation with GreenMarket">
            <div
              className={styles.messageList}
              onScroll={(event) => {
                const element = event.currentTarget
                shouldScrollToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24
              }}
              ref={messageListRef}
            >
              {isLoading ? <p>Loading messages...</p> : error && messages.length === 0 ? <p role="alert">{error}</p> : messages.map((message) => (
                <article className={`${styles.message} ${message.sender === 'customer' ? styles.outgoing : styles.incoming}`} key={message.id}>
                  <p>{message.text}</p>
                  <time>{message.timestamp}</time>
                </article>
              ))}
            </div>
            <form className={styles.composer} onSubmit={sendMessage}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message..." aria-label="Message" />
              <button disabled={isSending} type="submit">SEND</button>
            </form>
            {error && messages.length > 0 && <p role="alert">{error}</p>}
          </section>
        </div>
      </section>
    </main>
  )
}
