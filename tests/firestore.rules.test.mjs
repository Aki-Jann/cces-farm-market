import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { deleteObject, getBytes, ref as storageRef, uploadBytes } from 'firebase/storage'

const projectId = 'demo-cces-farm-market'
const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
const storageRules = await readFile(new URL('../storage.rules', import.meta.url), 'utf8')
let environment

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
    storage: { rules: storageRules },
  })
})

beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users/customer-a'), {
        role: 'customer',
        firstName: 'Casey',
        lastName: 'Customer',
        email: 'customer-a@example.com',
      }),
      setDoc(doc(db, 'users/customer-b'), { role: 'customer' }),
      setDoc(doc(db, 'users/admin-a'), { role: 'admin' }),
      setDoc(doc(db, 'users/cces-admin-a'), { role: 'cces_admin' }),
      setDoc(doc(db, 'products/product-a'), {
        name: 'CARROTS',
        price: 10,
        stock: 10,
        sold: 0,
        unit: 'KG',
        isAvailable: true,
      }),
      ...['B', 'C', 'D', 'E', 'F'].map((suffix, index) =>
        setDoc(doc(db, `products/product-${suffix.toLowerCase()}`), {
          name: `PRODUCT ${index + 2}`,
          price: 10,
          stock: 10,
          sold: 0,
          unit: 'KG',
          isAvailable: true,
        })
      ),
      setDoc(doc(db, 'settings/storefront'), {
        pickupLocation: 'Farm gate',
        pickupDays: 'Monday to Friday',
        pickupHours: '8 AM to 4 PM',
      }),
      setDoc(doc(db, 'orders/order-a'), {
        userId: 'customer-a',
        status: 'pending',
      }),
      setDoc(doc(db, 'orders/order-b'), {
        userId: 'customer-b',
        status: 'pending',
      }),
      setDoc(doc(db, 'orders/online-awaiting'), {
        userId: 'customer-a',
        status: 'pending',
        paymentMethod: 'GCASH',
        paymentStatus: 'awaiting_verification',
        paymentReceiptUrl: 'https://example.com/receipt.png',
      }),
      setDoc(doc(db, 'orders/online-paid'), {
        userId: 'customer-a',
        status: 'pending',
        paymentMethod: 'MAYA',
        paymentStatus: 'paid',
        paymentReceiptUrl: 'https://example.com/receipt.png',
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

test('receipt uploads are owner-only and existing receipts cannot be overwritten', async () => {
  const image = new Uint8Array([1, 2, 3])
  const receiptPath = 'payment-receipts/customer-a/order-storage/receipt.png'
  const customerStorage = environment.authenticatedContext('customer-a').storage()
  const customerReceipt = storageRef(customerStorage, receiptPath)

  await assertSucceeds(uploadBytes(customerReceipt, image, { contentType: 'image/png' }))
  await assertSucceeds(getBytes(customerReceipt))
  await assertFails(uploadBytes(customerReceipt, image, { contentType: 'image/png' }))
  await assertSucceeds(getBytes(storageRef(
    environment.authenticatedContext('admin-a').storage(),
    receiptPath,
  )))

  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'orders/order-storage'), {
      userId: 'customer-a',
      paymentStatus: 'paid',
    })
  })
  await assertFails(deleteObject(customerReceipt))

  const orphanReceipt = storageRef(customerStorage, 'payment-receipts/customer-a/order-not-created/receipt.png')
  await assertSucceeds(uploadBytes(orphanReceipt, image, { contentType: 'image/png' }))
  await assertSucceeds(deleteObject(orphanReceipt))

  const otherCustomerStorage = environment.authenticatedContext('customer-b').storage()
  await assertFails(getBytes(storageRef(otherCustomerStorage, receiptPath)))
  await assertFails(uploadBytes(
    storageRef(otherCustomerStorage, 'payment-receipts/customer-a/order-storage/other.png'),
    image,
    { contentType: 'image/png' },
  ))
  await assertFails(uploadBytes(
    storageRef(customerStorage, 'payment-receipts/customer-a/order-storage/invalid.txt'),
    image,
    { contentType: 'text/plain' },
  ))
  await assertFails(uploadBytes(
    storageRef(environment.unauthenticatedContext().storage(), 'payment-receipts/customer-a/order-storage/anonymous.png'),
    image,
    { contentType: 'image/png' },
  ))
})

test('customers cannot create or update products', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  await assertFails(setDoc(doc(db, 'products/customer-product'), { name: 'Unauthorized' }))
  await assertFails(updateDoc(doc(db, 'products/product-a'), { name: 'Changed' }))
})

function customerOrder(orderId, overrides = {}) {
  return {
    orderNumber: 'ORD-TEST',
    userId: 'customer-a',
    customerName: 'Casey Customer',
    customerEmail: 'customer-a@example.com',
    items: [{
      productId: 'product-a',
      name: 'CARROTS',
      price: 10,
      quantity: 2,
      unit: 'KG',
    }],
    subtotal: 20,
    deliveryFee: 100,
    tax: 1,
    total: 121,
    paymentMethod: 'COD',
    paymentStatus: 'unpaid',
    status: 'pending',
    fulfillmentType: 'delivery',
    deliveryAddress: '12 Farm Road',
    pickupHours: '',
    pickupDays: '',
    sellerNotes: '',
    paymentReceiptUrl: '',
    createdAt: serverTimestamp(),
    ...overrides,
    orderId,
  }
}

function receiptUrl(userId, orderId) {
  return `https://res.cloudinary.com/test-cloud/image/upload/v1234567890/payment-receipts/${userId}/${orderId}/receipt.png`
}

async function submitCustomerOrder(db, orderId, order) {
  const { orderId: _ignoredOrderId, ...orderData } = order
  const orderRef = doc(db, 'orders', orderId)
  const items = orderData.items
  const productRefs = items.map((item) => doc(db, 'products', item.productId))

  await runTransaction(db, async (transaction) => {
    const productSnapshots = await Promise.all(productRefs.map((productRef) => transaction.get(productRef)))
    productSnapshots.forEach((productSnapshot, index) => {
      const item = items[index]
      const product = productSnapshot.data()
      transaction.update(productRefs[index], {
        stock: product.stock - item.quantity,
        sold: product.sold + item.quantity,
        checkoutOrderId: orderId,
        checkoutQuantity: item.quantity,
        checkoutAction: 'sale',
        checkoutItemIndex: index,
      })
    })
    transaction.set(orderRef, orderData)
  })
}

async function submitOrderWithInventoryUpdates(db, orderId, order, updates) {
  const { orderId: _ignoredOrderId, ...orderData } = order
  const orderRef = doc(db, 'orders', orderId)
  const productRefs = updates.map(({ productId }) => doc(db, 'products', productId))
  await runTransaction(db, async (transaction) => {
    const productSnapshots = await Promise.all(productRefs.map((productRef) => transaction.get(productRef)))
    productSnapshots.forEach((snapshot, index) => {
      const update = updates[index]
      const product = snapshot.data()
      transaction.update(productRefs[index], {
        stock: product.stock - update.quantity,
        sold: product.sold + update.quantity,
        checkoutOrderId: orderId,
        checkoutQuantity: update.quantity,
        checkoutAction: 'sale',
        checkoutItemIndex: update.itemIndex,
      })
    })
    transaction.set(orderRef, orderData)
  })
}

test('customers can create a valid order and decrement inventory in one transaction', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  await assertSucceeds(submitCustomerOrder(db, 'customer-order-valid', customerOrder('customer-order-valid')))
  const [orderSnapshot, productSnapshot] = await Promise.all([
    getDoc(doc(db, 'orders/customer-order-valid')),
    getDoc(doc(db, 'products/product-a')),
  ])
  assert.equal(orderSnapshot.data().total, 121)
  assert.equal(productSnapshot.data().stock, 8)
  assert.equal(productSnapshot.data().sold, 2)
})

test('customers can make a second valid purchase when checkoutAction remains sale', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  await assertSucceeds(submitCustomerOrder(db, 'customer-order-first', customerOrder('customer-order-first')))

  const secondOrder = customerOrder('customer-order-second', {
    items: [{
      productId: 'product-a',
      name: 'CARROTS',
      price: 10,
      quantity: 1,
      unit: 'KG',
    }],
    subtotal: 10,
    tax: 0.5,
    total: 110.5,
  })
  await assertSucceeds(submitCustomerOrder(db, 'customer-order-second', secondOrder))

  const [firstOrder, secondOrderSnapshot, productSnapshot] = await Promise.all([
    getDoc(doc(db, 'orders/customer-order-first')),
    getDoc(doc(db, 'orders/customer-order-second')),
    getDoc(doc(db, 'products/product-a')),
  ])
  assert.equal(firstOrder.exists(), true)
  assert.equal(secondOrderSnapshot.exists(), true)
  assert.equal(productSnapshot.data().checkoutAction, 'sale')
  assert.equal(productSnapshot.data().stock, 7)
  assert.equal(productSnapshot.data().sold, 3)
})

test('customers can checkout five distinct products within the rules validation limit', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  const items = [
    ['product-a', 'CARROTS'],
    ['product-b', 'PRODUCT 2'],
    ['product-c', 'PRODUCT 3'],
    ['product-d', 'PRODUCT 4'],
    ['product-e', 'PRODUCT 5'],
  ].map(([productId, name]) => ({
    productId,
    name,
    price: 10,
    quantity: 1,
    unit: 'KG',
  }))
  const order = customerOrder('order-five-products', {
    items,
    subtotal: 50,
    tax: 2.5,
    total: 152.5,
  })
  await assertSucceeds(submitCustomerOrder(db, 'order-five-products', order))
})

test('customers cannot create orders without atomic inventory updates', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  const { orderId: _ignoredOrderId, ...order } = customerOrder('order-no-stock-change')
  await assertFails(setDoc(doc(db, 'orders/order-no-stock-change'), order))
})

test('customers cannot cross-pair or add inventory updates outside the order items', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  const oneProductOrder = customerOrder('order-cross-pair')

  await assertFails(submitOrderWithInventoryUpdates(db, 'order-cross-pair', oneProductOrder, [
    { productId: 'product-b', quantity: 2, itemIndex: 0 },
  ]))

  await assertFails(submitOrderWithInventoryUpdates(db, 'order-extra-inventory', {
    ...oneProductOrder,
    orderId: 'order-extra-inventory',
  }, [
    { productId: 'product-a', quantity: 2, itemIndex: 0 },
    { productId: 'product-b', quantity: 1, itemIndex: 0 },
  ]))
})

test('customers cannot order nonexistent products or exceed available stock', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  const missingProductOrder = customerOrder('order-missing-product', {
    items: [{ productId: 'missing-product', name: 'CARROTS', price: 10, quantity: 1, unit: 'KG' }],
    subtotal: 10,
    tax: 0.5,
    total: 110.5,
  })
  const { orderId: _ignoredOrderId, ...orderData } = missingProductOrder
  await assertFails(setDoc(doc(db, 'orders/order-missing-product'), orderData))

  const overStockOrder = customerOrder('order-over-stock', {
    items: [{ productId: 'product-a', name: 'CARROTS', price: 10, quantity: 11, unit: 'KG' }],
    subtotal: 110,
    tax: 5.5,
    total: 215.5,
  })
  await assertFails(submitOrderWithInventoryUpdates(db, 'order-over-stock', overStockOrder, [
    { productId: 'product-a', quantity: 11, itemIndex: 0 },
  ]))
})

test('concurrent checkouts cannot oversell limited stock', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  const makeOrder = (orderId) => customerOrder(orderId, {
    items: [{ productId: 'product-a', name: 'CARROTS', price: 10, quantity: 7, unit: 'KG' }],
    subtotal: 70,
    tax: 3.5,
    total: 173.5,
  })

  const results = await Promise.allSettled([
    submitCustomerOrder(db, 'concurrent-order-a', makeOrder('concurrent-order-a')),
    submitCustomerOrder(db, 'concurrent-order-b', makeOrder('concurrent-order-b')),
  ])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1)

  let finalSnapshots
  await environment.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore()
    finalSnapshots = await Promise.all([
      getDoc(doc(adminDb, 'products/product-a')),
      getDoc(doc(adminDb, 'orders/concurrent-order-a')),
      getDoc(doc(adminDb, 'orders/concurrent-order-b')),
    ])
  })
  const [productSnapshot, orderASnapshot, orderBSnapshot] = finalSnapshots
  assert.equal(productSnapshot.data().stock, 3)
  assert.equal(productSnapshot.data().sold, 7)
  assert.equal(Number(orderASnapshot.exists()) + Number(orderBSnapshot.exists()), 1)
})

test('customers cannot forge item prices, totals, or paid status', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  const forgedPrice = customerOrder('order-forged-price', {
    items: [{ productId: 'product-a', name: 'CARROTS', price: 1, quantity: 2, unit: 'KG' }],
    subtotal: 2,
    deliveryFee: 100,
    tax: 0.1,
    total: 102.1,
  })
  await assertFails(submitCustomerOrder(db, 'order-forged-price', forgedPrice))

  const forgedTotal = customerOrder('order-forged-total', { total: 1 })
  await assertFails(submitCustomerOrder(db, 'order-forged-total', forgedTotal))

  const forgedPayment = customerOrder('order-forged-payment', {
    paymentMethod: 'GCASH',
    paymentStatus: 'paid',
    paymentReceiptUrl: receiptUrl('customer-a', 'order-forged-payment'),
  })
  await assertFails(submitCustomerOrder(db, 'order-forged-payment', forgedPayment))

  const otherCustomerReceipt = customerOrder('order-other-receipt', {
    paymentMethod: 'GCASH',
    paymentStatus: 'awaiting_verification',
    paymentReceiptUrl: receiptUrl('customer-b', 'order-other-receipt'),
  })
  await assertFails(submitCustomerOrder(db, 'order-other-receipt', otherCustomerReceipt))
})

test('customers cannot use an order ID to bypass receipt URL validation', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  const maliciousId = 'x|.*'
  const externalReceipt = customerOrder(maliciousId, {
    paymentMethod: 'GCASH',
    paymentStatus: 'awaiting_verification',
    paymentReceiptUrl: 'https://evil.example/fake%2Freceipt.png?alt=media&token=x',
  })
  await assertFails(submitCustomerOrder(db, maliciousId, externalReceipt))

  const wrongHostReceipt = customerOrder('order-wrong-receipt-host', {
    paymentMethod: 'GCASH',
    paymentStatus: 'awaiting_verification',
    paymentReceiptUrl: receiptUrl('customer-a', 'order-wrong-receipt-host')
      .replace('res.cloudinary.com', 'attacker.example'),
  })
  await assertFails(submitCustomerOrder(db, 'order-wrong-receipt-host', wrongHostReceipt))
})

test('customers cannot create orders for another user or more than five products', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  const otherUserOrder = customerOrder('order-other-user', { userId: 'customer-b' })
  await assertFails(submitCustomerOrder(db, 'order-other-user', otherUserOrder))

  const duplicateProduct = customerOrder('order-duplicate-product', {
    items: [
      { productId: 'product-a', name: 'CARROTS', price: 10, quantity: 1, unit: 'KG' },
      { productId: 'product-a', name: 'CARROTS', price: 10, quantity: 1, unit: 'KG' },
    ],
    subtotal: 20,
    tax: 1,
    total: 121,
  })
  await assertFails(submitCustomerOrder(db, 'order-duplicate-product', duplicateProduct))

  const sixItems = Array.from({ length: 6 }, (_, index) => ({
    productId: `product-${String.fromCharCode(97 + index)}`,
    name: `PRODUCT ${index + 1}`,
    price: 10,
    quantity: 1,
    unit: 'KG',
  }))
  await assertFails(submitCustomerOrder(db, 'order-too-many-items', customerOrder('order-too-many-items', {
    items: sixItems,
    subtotal: 60,
    deliveryFee: 100,
    tax: 3,
    total: 163,
  })))
})

test('customers cannot directly change inventory without a matching order', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  await assertFails(updateDoc(doc(db, 'products/product-a'), { stock: 9, sold: 1 }))
})

test('admins can update order status', async () => {
  const db = environment.authenticatedContext('admin-a').firestore()
  await assertSucceeds(updateDoc(doc(db, 'orders/order-a'), { status: 'confirmed' }))
})

test('admins cannot advance online orders before payment verification or write payment state directly', async () => {
  const db = environment.authenticatedContext('admin-a').firestore()
  await assertFails(updateDoc(doc(db, 'orders/online-awaiting'), { status: 'confirmed' }))
  await assertFails(updateDoc(doc(db, 'orders/online-awaiting'), { paymentStatus: 'paid' }))
  await assertSucceeds(updateDoc(doc(db, 'orders/online-paid'), { status: 'confirmed' }))
})

test('Farmers can verify an online payment but cannot claim verification as a Customer', async () => {
  const customerDb = environment.authenticatedContext('customer-a').firestore()
  await assertFails(updateDoc(doc(customerDb, 'orders/online-awaiting'), {
    paymentStatus: 'paid',
    paymentVerifiedAt: new Date(),
    paymentVerifiedBy: 'customer-a',
  }))

  const farmerDb = environment.authenticatedContext('admin-a').firestore()
  await assertSucceeds(updateDoc(doc(farmerDb, 'orders/online-awaiting'), {
    paymentStatus: 'paid',
    paymentVerifiedAt: serverTimestamp(),
    paymentVerifiedBy: 'admin-a',
  }))

  await assertFails(updateDoc(doc(farmerDb, 'orders/online-awaiting'), {
    paymentStatus: 'paid',
    paymentVerifiedAt: serverTimestamp(),
    paymentVerifiedBy: 'admin-a',
  }))
  await assertFails(updateDoc(doc(farmerDb, 'orders/online-awaiting'), {
    status: 'cancelled',
    paymentStatus: 'rejected',
    paymentRejectedAt: serverTimestamp(),
    paymentRejectedBy: 'admin-a',
  }))

  const ccesAdminDb = environment.authenticatedContext('cces-admin-a').firestore()
  await assertFails(updateDoc(doc(ccesAdminDb, 'orders/online-awaiting'), {
    paymentStatus: 'paid',
    paymentVerifiedAt: serverTimestamp(),
    paymentVerifiedBy: 'cces-admin-a',
  }))
  await assertFails(updateDoc(doc(ccesAdminDb, 'orders/online-awaiting'), {
    status: 'cancelled',
    paymentStatus: 'rejected',
    paymentRejectedAt: serverTimestamp(),
    paymentRejectedBy: 'cces-admin-a',
  }))
})

test('Farmers can reject a pending online payment and restore stock atomically', async () => {
  const customerDb = environment.authenticatedContext('customer-a').firestore()
  await assertSucceeds(submitCustomerOrder(
    customerDb,
    'order-to-reject',
    customerOrder('order-to-reject', {
      paymentMethod: 'GCASH',
      paymentStatus: 'awaiting_verification',
      paymentReceiptUrl: receiptUrl('customer-a', 'order-to-reject'),
    }),
  ))

  const farmerDb = environment.authenticatedContext('admin-a').firestore()
  await assertFails(updateDoc(doc(farmerDb, 'orders/order-to-reject'), {
    status: 'cancelled',
    paymentStatus: 'rejected',
    paymentRejectedAt: serverTimestamp(),
    paymentRejectedBy: 'admin-a',
  }))
  await assertSucceeds(runTransaction(farmerDb, async (transaction) => {
    const orderRef = doc(farmerDb, 'orders/order-to-reject')
    const productRef = doc(farmerDb, 'products/product-a')
    const [orderSnapshot, productSnapshot] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(productRef),
    ])
    const order = orderSnapshot.data()
    const product = productSnapshot.data()
    const quantity = order.items[0].quantity
    transaction.update(productRef, {
      stock: product.stock + quantity,
      sold: Math.max(0, product.sold - quantity),
      checkoutOrderId: orderRef.id,
      checkoutQuantity: quantity,
      checkoutAction: 'refund',
    })
    transaction.update(orderRef, {
      status: 'cancelled',
      paymentStatus: 'rejected',
      paymentRejectedAt: serverTimestamp(),
      paymentRejectedBy: 'admin-a',
    })
  }))

  const [orderSnapshot, productSnapshot] = await Promise.all([
    getDoc(doc(farmerDb, 'orders/order-to-reject')),
    getDoc(doc(farmerDb, 'products/product-a')),
  ])
  assert.equal(orderSnapshot.data().status, 'cancelled')
  assert.equal(orderSnapshot.data().paymentStatus, 'rejected')
  assert.equal(productSnapshot.data().stock, 10)
  assert.equal(productSnapshot.data().sold, 0)

  await assertFails(runTransaction(farmerDb, async (transaction) => {
    const orderRef = doc(farmerDb, 'orders/order-to-reject')
    const productRef = doc(farmerDb, 'products/product-a')
    const [currentOrder, currentProduct] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(productRef),
    ])
    const rejectedOrder = currentOrder.data()
    const currentInventory = currentProduct.data()
    const rejectedQuantity = rejectedOrder.items[0].quantity
    transaction.update(productRef, {
      stock: currentInventory.stock + rejectedQuantity,
      sold: Math.max(0, currentInventory.sold - rejectedQuantity),
      checkoutOrderId: orderRef.id,
      checkoutQuantity: rejectedQuantity,
      checkoutAction: 'refund',
      checkoutItemIndex: 0,
    })
    transaction.update(orderRef, {
      status: 'cancelled',
      paymentStatus: 'rejected',
      paymentRejectedAt: serverTimestamp(),
      paymentRejectedBy: 'admin-a',
    })
  }))

  const finalProduct = await getDoc(doc(farmerDb, 'products/product-a'))
  assert.equal(finalProduct.data().stock, 10)
  assert.equal(finalProduct.data().sold, 0)
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
