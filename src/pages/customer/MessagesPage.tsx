import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { CustomerSidebar } from '../../components/layout/CustomerSidebar'
import { Header } from '../../components/layout/Header'
import farmerStyles from '../admin/AdminCustomersPage.module.css'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import { ROLES } from '../../constants/roles'
import { formatMonthDayYear, formatTime } from '../../utils/dateFormat'
import { getFarmerDisplayName } from '../../utils/farmerDisplayName'
import styles from './MessagesPage.module.css'

type Message = { id: string; text: string; timestamp: string; sender: typeof ROLES.CUSTOMER | 'market'; dayDivider?: string }
type LoadedMessage = Omit<Message, 'dayDivider'> & { createdAt: Date | null }
type ConversationTarget = { id: string; farmerId: string; farmName: string; hasConversation: boolean; lastMessage: string }

function parseMessageDate(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate()
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
  }
  return null
}

export function MessagesPage() {
  const [targets, setTargets] = useState<ConversationTarget[]>([])
  const [selectedTargetId, setSelectedTargetId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const shouldScrollToBottom = useRef(true)
  const selectedTargetIdRef = useRef(selectedTargetId)
  const hasSelectedTargetRef = useRef(false)
  const selectedTarget = targets.find((target) => target.id === selectedTargetId)

  useEffect(() => {
    let unsubscribeFarmers: (() => void) | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeFarmers?.()
      unsubscribeFarmers = undefined
      if (!user) {
        setTargets([])
        selectedTargetIdRef.current = ''
        hasSelectedTargetRef.current = false
        setSelectedTargetId('')
        setMessages([])
        setError('Please log in to view your messages.')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError('')
      unsubscribeFarmers = onSnapshot(
        query(collection(db, 'farmerProfiles'), where('status', '==', 'active')),
        (snapshot) => {
          void Promise.all(snapshot.docs.map(async (profile): Promise<ConversationTarget> => {
            try {
              const conversation = await getDoc(doc(db, 'conversations', user.uid, 'farmers', profile.id))
              const profileData = profile.data()
              const lastMessage = conversation.exists() && typeof conversation.data().lastMessage === 'string'
                ? conversation.data().lastMessage
                : ''
              return {
                id: profile.id,
                farmerId: profile.id,
                farmName: getFarmerDisplayName(profileData, 'Farmer'),
                hasConversation: conversation.exists(),
                lastMessage,
              }
            } catch (profileError) {
              console.error(`Loading conversation with farmer ${profile.id} failed:`, profileError)
              const profileData = profile.data()
              return {
                id: profile.id,
                farmerId: profile.id,
                farmName: getFarmerDisplayName(profileData, 'Farmer'),
                hasConversation: false,
                lastMessage: '',
              }
            }
          })).then((loadedTargets) => {
            if (auth.currentUser?.uid !== user.uid) return
            const nextTargets = loadedTargets.sort((first, second) =>
              Number(second.hasConversation) - Number(first.hasConversation)
              || first.farmName.localeCompare(second.farmName)
            )
            setTargets(nextTargets)
            const currentTarget = selectedTargetIdRef.current
            const nextId = hasSelectedTargetRef.current && nextTargets.some((target) => target.id === currentTarget)
              ? currentTarget
              : nextTargets[0]?.id ?? ''
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
          setError('Unable to load active farmers. Please try again.')
          setIsLoading(false)
        }
      )
    })

    return () => {
      unsubscribeFarmers?.()
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
    const messagesQuery = query(collection(db, 'conversations', user.uid, 'farmers', selectedTarget.farmerId, 'messages'))
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
    if (!text || !user || !selectedTarget || isSending) return

    setIsSending(true)
    setError('')
    try {
      const conversationRef = doc(db, 'conversations', user.uid, 'farmers', selectedTarget.farmerId)
      const batch = writeBatch(db)
      batch.set(conversationRef, {
        customerId: user.uid,
        farmerId: selectedTarget.farmerId,
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
        <div className={`${styles.messaging} ${mobileChatOpen ? styles.mobileChatOpen : ''}`}>
          <aside className={`${farmerStyles.customerList} ${styles.farmerList}`} aria-label="Farmers you can message">
            <div className={farmerStyles.customerListHeader}>
              <div><h2>Farmers</h2><span>{targets.length} active</span></div>
            </div>
            {targets.map((target) => (
              <button
                className={selectedTargetId === target.id ? farmerStyles.selectedCustomer : ''}
                key={target.id}
                type="button"
                onClick={() => {
                  selectedTargetIdRef.current = target.id
                  hasSelectedTargetRef.current = true
                  setMessages([])
                  setIsLoading(true)
                  setSelectedTargetId(target.id)
                  setMobileChatOpen(true)
                }}
              >
                <span className={farmerStyles.avatar} aria-hidden="true">{target.farmName.charAt(0).toUpperCase()}</span>
                <span className={farmerStyles.customerSummary}>
                  <strong>{target.farmName}</strong>
                  <small>{target.hasConversation ? target.lastMessage || 'Conversation started' : 'Start a conversation'}</small>
                </span>
                <span className={farmerStyles.segment}>{target.hasConversation ? 'CHAT' : 'MESSAGE'}</span>
              </button>
            ))}
            {!isLoading && targets.length === 0 && <p className={styles.noFarmers}>No active farmers are available.</p>}
          </aside>
          <section className={styles.chat} aria-label={`Conversation with ${selectedTarget?.farmName ?? 'farmer'}`}>
            <div className={styles.conversationHeader}>
              <button
                className={styles.mobileConversationBack}
                type="button"
                onClick={() => setMobileChatOpen(false)}
              >
                <span aria-hidden="true">‹</span> Conversations
              </button>
              <div className={styles.conversationAvatar} aria-hidden="true">{selectedTarget?.farmName.charAt(0).toUpperCase() ?? 'F'}</div>
              <div className={styles.conversationIdentity}>
                <strong>{selectedTarget?.farmName ?? 'Farmer'}</strong>
                <span>Tiangge Verde marketplace</span>
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
              ) : !selectedTarget ? (
                <p className={styles.listNotice}>Select an active farmer to start messaging.</p>
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
              <input disabled={!selectedTarget} value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck autoCapitalize="sentences" autoCorrect="on" placeholder="Write a message..." aria-label="Message" />
              <button disabled={isSending || !draft.trim() || !selectedTarget} type="submit">
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
