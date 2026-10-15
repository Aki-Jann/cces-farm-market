import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'

const projectId = 'demo-cces-farm-market'
const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
let environment

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  })
})

beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users/customer-a'), { role: 'customer' }),
      setDoc(doc(db, 'users/customer-b'), { role: 'customer' }),
      setDoc(doc(db, 'users/admin-a'), { role: 'admin' }),
      setDoc(doc(db, 'users/cces-admin-a'), { role: 'cces_admin' }),
      setDoc(doc(db, 'products/product-a'), { name: 'Carrots', stock: 10, sold: 0 }),
      setDoc(doc(db, 'orders/order-a'), {
        userId: 'customer-a',
        status: 'pending',
      }),
      setDoc(doc(db, 'orders/order-b'), {
        userId: 'customer-b',
        status: 'pending',
      }),
      setDoc(doc(db, 'conversations/customer-b'), {
        customerId: 'customer-b',
        lastMessage: 'hello',
        updatedAt: new Date(),
      }),
    ])
  })
})

after(async () => {
  await environment?.cleanup()
})

test('unauthenticated users can read public products', async () => {
  const db = environment.unauthenticatedContext().firestore()
  await assertSucceeds(getDoc(doc(db, 'products/product-a')))
})

test('customers can read only their own user profile', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  await assertSucceeds(getDoc(doc(db, 'users/customer-a')))
  await assertFails(getDoc(doc(db, 'users/customer-b')))
})

test('customers cannot create or update products', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  await assertFails(setDoc(doc(db, 'products/customer-product'), { name: 'Unauthorized' }))
  await assertFails(updateDoc(doc(db, 'products/product-a'), { name: 'Changed' }))
})

test('customers cannot directly create orders', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  await assertFails(setDoc(doc(db, 'orders/customer-order'), {
    userId: 'customer-a',
    status: 'pending',
  }))
})

test('admins can update order status', async () => {
  const db = environment.authenticatedContext('admin-a').firestore()
  await assertSucceeds(updateDoc(doc(db, 'orders/order-a'), { status: 'confirmed' }))
})

test('CCES admins can read the analytics order data but cannot manage records', async () => {
  const db = environment.authenticatedContext('cces-admin-a').firestore()
  await assertSucceeds(getDocs(collection(db, 'orders')))
  await assertSucceeds(getDoc(doc(db, 'products/product-a')))
  await assertSucceeds(getDoc(doc(db, 'users/cces-admin-a')))
  await assertFails(getDocs(collection(db, 'users')))
  await assertFails(updateDoc(doc(db, 'orders/order-a'), { status: 'confirmed' }))
  await assertFails(updateDoc(doc(db, 'products/product-a'), { stock: 0 }))
  await assertFails(getDoc(doc(db, 'settings', 'storefront')))
  await assertFails(getDoc(doc(db, 'storeSettings', 'checkout')))
  await assertFails(getDoc(doc(db, 'conversations/customer-b')))
})

test('CCES admins can update only their own account fields', async () => {
  const db = environment.authenticatedContext('cces-admin-a').firestore()
  await assertSucceeds(updateDoc(doc(db, 'users/cces-admin-a'), { firstName: 'Casey' }))
  await assertFails(updateDoc(doc(db, 'users/cces-admin-a'), { role: 'admin' }))
  await assertFails(getDoc(doc(db, 'users/admin-a')))
})

test('customers cannot read another customer order or conversation', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  await assertFails(getDoc(doc(db, 'orders/order-b')))
  await assertFails(getDoc(doc(db, 'conversations/customer-b')))
})
