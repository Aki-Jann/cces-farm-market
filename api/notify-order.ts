import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import nodemailer from 'nodemailer'

const MAX_ORDER_AGE_MS = 10 * 60 * 1000 // only notify for orders created in the last 10 minutes

type Claim =
  | { status: 'ok'; order: FirebaseFirestore.DocumentData }
  | { status: 'missing' }
  | { status: 'forbidden' }
  | { status: 'skip' }
  | { status: 'expired' }

function initAdmin() {
  if (getApps().length) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set')
  initializeApp({ credential: cert(JSON.parse(raw)) })
}

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
  ))

const peso = (n: unknown) =>
  `PHP ${Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    initAdmin()
    const db = getFirestore()

    // 1. Verify the caller's Firebase ID token
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) return res.status(401).json({ error: 'Missing token' })
    const { uid } = await getAuth().verifyIdToken(token)

    // 2. Validate the order id
    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId : ''
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(orderId)) return res.status(400).json({ error: 'Bad order id' })

    // 3. Claim the order in a transaction (prevents duplicate emails)
    const orderRef = db.collection('orders').doc(orderId)
    const claim: Claim = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef)
      if (!snap.exists) return { status: 'missing' }
      const order = snap.data() as FirebaseFirestore.DocumentData
      if (order.userId !== uid) return { status: 'forbidden' }
      if (order.notifiedAt || order.notifyClaimedAt) return { status: 'skip' }
      const createdMs = order.createdAt?.toMillis?.() ?? 0
      if (Date.now() - createdMs > MAX_ORDER_AGE_MS) return { status: 'expired' }
      tx.update(orderRef, { notifyClaimedAt: FieldValue.serverTimestamp() })
      return { status: 'ok', order }
    })

    if (claim.status === 'missing') return res.status(404).json({ error: 'Order not found' })
    if (claim.status === 'forbidden') return res.status(403).json({ error: 'Not your order' })
    if (claim.status === 'skip') return res.status(200).json({ sent: false, reason: 'already notified' })
    if (claim.status === 'expired') return res.status(200).json({ sent: false, reason: 'order too old' })
    const order = claim.order

    // 4. Notify only the farmer assigned to this order.
    const recipients = new Set<string>()
    if (typeof order.farmerId === 'string' && order.farmerId) {
      const farmer = await db.doc(`users/${order.farmerId}`).get()
      const email = farmer.data()?.email
      if (typeof email === 'string' && email) recipients.add(email)
    }
    const storefront = await db.doc('settings/storefront').get()
    const extra = storefront.data()?.notificationEmail
    if (typeof extra === 'string' && extra) recipients.add(extra)

    if (recipients.size === 0) {
      await orderRef.update({ notifyClaimedAt: FieldValue.delete() })
      return res.status(200).json({ sent: false, reason: 'no recipients' })
    }

    // 5. Build the email
    const items: Array<{ name: string; quantity: number; unit: string; price: number }> =
      Array.isArray(order.items) ? order.items : []
    const lines = items.map((i) => `${i.quantity} ${i.unit} ${i.name} @ ${peso(i.price)}`)
    const payment = order.paymentStatus === 'awaiting_verification'
      ? `${order.paymentMethod} (receipt awaiting your verification)`
      : `${order.paymentMethod} (${order.paymentStatus})`
    const appUrl = process.env.APP_URL ?? ''
    const link = appUrl ? `${appUrl}/#/admin/orders` : '' // confirm this matches your admin orders route

    const text = [
      `New order ${order.orderNumber}`,
      `Customer: ${order.customerName}`,
      '',
      ...lines,
      '',
      `Subtotal: ${peso(order.subtotal)}`,
      `Delivery fee: ${peso(order.deliveryFee)}`,
      `Tax: ${peso(order.tax)}`,
      `Total: ${peso(order.total)}`,
      `Payment: ${payment}`,
      `Fulfillment: ${order.fulfillmentType}`,
      link ? `\nOpen orders: ${link}` : '',
    ].join('\n')

    const html = `
      <h2>New order ${escapeHtml(order.orderNumber)}</h2>
      <p><strong>Customer:</strong> ${escapeHtml(order.customerName)}</p>
      <ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
      <p>Subtotal: ${escapeHtml(peso(order.subtotal))}<br>
         Delivery fee: ${escapeHtml(peso(order.deliveryFee))}<br>
         Tax: ${escapeHtml(peso(order.tax))}<br>
         <strong>Total: ${escapeHtml(peso(order.total))}</strong></p>
      <p><strong>Payment:</strong> ${escapeHtml(payment)}<br>
         <strong>Fulfillment:</strong> ${escapeHtml(order.fulfillmentType)}</p>
      ${link ? `<p><a href="${escapeHtml(link)}">Open orders</a></p>` : ''}`

    // 6. Send via Gmail (App Password)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    })

    try {
      await transporter.sendMail({
        from: `CCES Farm to Market <${process.env.GMAIL_USER}>`,
        to: [...recipients].join(', '),
        subject: `New order ${order.orderNumber} - ${peso(order.total)}`,
        text,
        html,
      })
    } catch (sendError) {
      console.error('notify-order: send failed', sendError)
      await orderRef.update({ notifyClaimedAt: FieldValue.delete() }) // allow a retry
      return res.status(502).json({ error: 'Email failed' })
    }

    await orderRef.update({ notifiedAt: FieldValue.serverTimestamp() })
    return res.status(200).json({ sent: true })
  } catch (error) {
    console.error('notify-order failed', error)
    return res.status(500).json({ error: 'Server error' })
  }
}