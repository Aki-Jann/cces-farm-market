import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { CustomerSidebar } from '../../components/layout/CustomerSidebar'
import { Header } from '../../components/layout/Header'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import { ROLES } from '../../constants/roles'
import { formatMonthDayYear, formatTime } from '../../utils/dateFormat'
import styles from './MessagesPage.module.css'

type Message = { id: string; text: string; timestamp: string; sender: typeof ROLES.CUSTOMER | 'market'; dayDivider?: string }
type LoadedMessage = Omit<Message, 'dayDivider'> & { createdAt: Date | null }
type ConversationTarget = { id: string; farmerId: string; farmName: string; active: boolean }

function parseMessageDate(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate()
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
  }
  return null
}

export function MessagesPage() {
  const [targets, setTargets] = useState<ConversationTarget[]>([
    { id: 'legacy', farmerId: '', farmName: 'Tiangge Verde', active: true },
  ])
  const [selectedTargetId, setSelectedTargetId] = useState('legacy')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const shouldScrollToBottom = useRef(true)
  const selectedTargetIdRef = useRef(selectedTargetId)
  const hasSelectedTargetRef = useRef(false)
  const selectedTarget = targets.find((target) => target.id === selectedTargetId)

  useEffect(() => {
    let unsubscribeOrders: (() => void) | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeOrders?.()
      unsubscribeOrders = undefined
      if (!user) {
        setTargets([{ id: 'legacy', farmerId: '', farmName: 'Tiangge Verde', active: true }])
        selectedTargetIdRef.current = 'legacy'
        hasSelectedTargetRef.current = false
        setSelectedTargetId('legacy')
        setMessages([])
        setError('Please log in to view your messages.')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError('')
      unsubscribeOrders = onSnapshot(
        query(collection(db, 'orders'), where('userId', '==', user.uid)),
        (snapshot) => {
          const farmerIds = [...new Set(snapshot.docs.flatMap((order) => {
            const farmerId = order.data().farmerId
            return typeof farmerId === 'string' && farmerId ? [farmerId] : []
          }))]
          void Promise.all(farmerIds.map(async (farmerId): Promise<ConversationTarget | null> => {
            try {
              const profile = await getDoc(doc(db, 'farmerProfiles', farmerId))
              if (profile.exists() && profile.data().status !== 'active') return null
              if (!profile.exists()) {
                return { id: 'legacy', farmerId: '', farmName: 'Tiangge Verde', active: true }
              }
              const profileData = profile.data()
              const farmName = typeof profileData.farmName === 'string' ? profileData.farmName : farmerId
              return { id: farmerId, farmerId, farmName, active: true }
            } catch (profileError) {
              console.error(`Loading farmer ${farmerId} for messaging failed:`, profileError)
              return null
            }
          })).then((loadedTargets) => {
            if (auth.currentUser?.uid !== user.uid) return
            const distinctFarmerTargets = new Map(
              loadedTargets
                .filter((target): target is ConversationTarget => target !== null && target.farmerId !== '')
                .map((target) => [target.id, target])
            )
            const nextTargets = [
              { id: 'legacy', farmerId: '', farmName: 'Tiangge Verde', active: true },
              ...distinctFarmerTargets.values(),
            ]
            setTargets(nextTargets)
            const currentTarget = selectedTargetIdRef.current
            const nextId = hasSelectedTargetRef.current && nextTargets.some((target) => target.id === currentTarget)
              ? currentTarget
              : nextTargets[1]?.id ?? 'legacy'
            if (nextId !== currentTarget) {
              setMessages([])
              setIsLoading(true)
            }
            selectedTargetIdRef.current = nextId
            setSelectedTargetId(nextId)
          })
        },
        (snapshotError) => {
          console.error('Loading message recipients failed:', snapshotError)
          setError('Unable to load your order-related conversations. Please try again.')
        }
      )
    })

    return () => {
      unsubscribeOrders?.()
      unsubscribeAuth()
    }
  }, [])

  useEffect(() => {
    if (!shouldScrollToBottom.current) return
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: 'auto',
    })
  }, [messages])

  useEffect(() => {
    const user = auth.currentUser
    if (!user || !selectedTarget) return
    const messagesQuery = selectedTarget.farmerId
      ? query(collection(db, 'conversations', user.uid, 'farmers', selectedTarget.farmerId, 'messages'))
      : query(collection(db, 'conversations', user.uid, 'messages'))
    return onSnapshot(messagesQuery, (snapshot) => {
        const sortedMessages = snapshot.docs
          .map((messageDocument): LoadedMessage => {
            const data = messageDocument.data()
            const createdAt = parseMessageDate(data.createdAt)
            return {
              id: messageDocument.id,
              sender: data.senderRole === ROLES.CUSTOMER ? ROLES.CUSTOMER : 'market',
              text: typeof data.text === 'string' ? data.text : '',
              timestamp: createdAt ? formatTime(createdAt) : 'Pending',
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
  }, [selectedTarget])

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    const user = auth.currentUser
    if (!text || !user || !selectedTarget || !selectedTarget.active || isSending) return

    setIsSending(true)
    setError('')
    try {
      const conversationRef = selectedTarget.farmerId
        ? doc(db, 'conversations', user.uid, 'farmers', selectedTarget.farmerId)
        : doc(db, 'conversations', user.uid)
      const batch = writeBatch(db)
      batch.set(conversationRef, selectedTarget.farmerId ? {
        customerId: user.uid,
        farmerId: selectedTarget.farmerId,
        lastMessage: text,
        updatedAt: serverTimestamp(),
      } : {
        customerId: user.uid,
        lastMessage: text,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      batch.set(doc(collection(conversationRef, 'messages')), {
        senderId: user.uid,
        senderRole: ROLES.CUSTOMER,
        text,
        createdAt: serverTimestamp(),
      })
      await batch.commit()
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
          <section className={styles.chat} aria-label={`Conversation with ${selectedTarget?.farmName ?? 'farmer'}`}>
            <div className={styles.conversationHeader}>
              <div className={styles.conversationAvatar} aria-hidden="true">T</div>
              <div className={styles.conversationIdentity}>
                <strong>{selectedTarget?.farmName ?? 'Farmer'}</strong>
                <span>Seller conversation</span>
              </div>
              <span className={styles.sellerBadge}>SELLER</span>
            </div>
            {targets.length > 1 && (
              <label className={styles.farmerSelectLabel}>
                Conversation
                <select value={selectedTargetId} onChange={(event) => {
                  selectedTargetIdRef.current = event.target.value
                  hasSelectedTargetRef.current = true
                  setMessages([])
                  setIsLoading(true)
                  setSelectedTargetId(event.target.value)
                }}>
                  {targets.map((target) => <option key={target.id} value={target.id}>{target.farmName}</option>)}
                </select>
              </label>
            )}
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
                  <span>Your conversation with {selectedTarget?.farmName ?? 'this farmer'} will appear here.</span>
                </div>
              ) : messages.map((message) => (
                <div className={styles.messageGroup} key={message.id}>
                  {message.dayDivider && (
                    <div className={styles.dayDivider} role="separator" aria-label={`Messages from ${message.dayDivider}`}>
                      <span>{message.dayDivider}</span>
                    </div>
                  )}
                  <article className={`${styles.message} ${message.sender === ROLES.CUSTOMER ? styles.outgoing : styles.incoming}`}>
                    <span className={styles.senderLabel}>{message.sender === ROLES.CUSTOMER ? 'You' : selectedTarget?.farmName ?? 'Farmer'}</span>
                    <p>{message.text}</p>
                    <time>{message.timestamp}</time>
                  </article>
                </div>
              ))}
            </div>
            {error && messages.length > 0 && <p className={styles.sendError} role="alert">{error}</p>}
            <form className={styles.composer} onSubmit={sendMessage}>
              <input value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck autoCapitalize="sentences" autoCorrect="on" placeholder="Write a message..." aria-label="Message" />
              <button disabled={isSending || !draft.trim() || !selectedTarget?.active} type="submit">
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
