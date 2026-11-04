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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

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
      setDoc(doc(db, 'users/customer-a'), {
        role: 'customer',
        firstName: 'Casey',
        lastName: 'Customer',
        email: 'customer-a@example.com',
      }),
      setDoc(doc(db, 'users/customer-b'), { role: 'customer' }),
      setDoc(doc(db, 'users/customer-rejected'), { role: 'customer' }),
      setDoc(doc(db, 'users/admin-a'), { role: 'admin' }),
      setDoc(doc(db, 'users/farmer-b'), { role: 'farmer' }),
      setDoc(doc(db, 'users/cces-admin-a'), { role: 'cces_admin' }),
      setDoc(doc(db, 'farmerProfiles/farmer-b'), {
        status: 'active',
        storeReady: true,
        farmName: 'Valley Farm',
        contactNumber: '09999999999',
        address: 'Valley Road',
        deliveryFee: 25,
        pickupLocation: 'Valley Road',
        pickupDays: 'Monday to Friday',
        pickupHours: '8 AM to 4 PM',
        gcashAccountName: 'Valley Farm',
        gcashAccountNumber: '09999999999',
        gcashQrUrl: 'https://example.com/gcash.png',
        mayaAccountName: '',
        mayaAccountNumber: '',
        mayaQrUrl: '',
        createdAt: new Date(),
      }),
      setDoc(doc(db, 'farmerApplications/customer-a'), {
        status: 'pending',
        farmName: 'Casey Farm',
        contactNumber: '09123456789',
        address: 'Farm Road',
        createdAt: new Date(),
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: '',
      }),
      setDoc(doc(db, 'farmerApplications/customer-rejected'), {
        status: 'rejected',
        farmName: 'Rejected Farm',
        contactNumber: '09111111111',
        address: 'Old Farm Road',
        createdAt: new Date(),
        reviewedBy: 'cces-admin-a',
        reviewedAt: new Date(),
        rejectionReason: 'Please provide complete details.',
      }),
      setDoc(doc(db, 'products/product-a'), {
        farmerId: 'admin-a',
        name: 'CARROTS',
        price: 10,
        stock: 10,
        sold: 0,
        unit: 'KG',
        isAvailable: true,
      }),
      setDoc(doc(db, 'products/product-other-farmer'), {
        farmerId: 'farmer-b',
        name: 'TOMATOES',
        price: 20,
        stock: 5,
        sold: 0,
        unit: 'KG',
        isAvailable: true,
      }),
      setDoc(doc(db, 'products/product-other-farmer-second'), {
        farmerId: 'farmer-b',
        name: 'CUCUMBERS',
        price: 30,
        stock: 7,
        sold: 0,
        unit: 'KG',
        isAvailable: true,
      }),
      ...['B', 'C', 'D', 'E', 'F'].map((suffix, index) =>
        setDoc(doc(db, `products/product-${suffix.toLowerCase()}`), {
          farmerId: 'admin-a',
          name: `PRODUCT ${index + 2}`,
          price: 10,
          stock: 10,
          sold: 0,
          unit: 'KG',
          isAvailable: true,
        })
      ),
      setDoc(doc(db, 'settings/storefront'), {
        legacyFarmerId: 'admin-a',
        storeReady: true,
        farmName: 'Original Farm',
        deliveryFee: 100,
        pickupLocation: 'Farm gate',
        pickupDays: 'Monday to Friday',
        pickupHours: '8 AM to 4 PM',
        gcashAccountName: 'Original Farm',
        gcashAccountNumber: '09999999999',
        gcashQrUrl: 'https://example.com/original-gcash.png',
        mayaAccountName: '',
        mayaAccountNumber: '',
        mayaQrUrl: '',
      }),
      setDoc(doc(db, 'orders/order-a'), {
        farmerId: 'admin-a',
        userId: 'customer-a',
        status: 'pending',
      }),
      setDoc(doc(db, 'orders/order-b'), {
        farmerId: 'admin-a',
        userId: 'customer-b',
        status: 'pending',
      }),
      setDoc(doc(db, 'orders/order-other-farmer'), {
        farmerId: 'farmer-b',
        userId: 'customer-a',
        status: 'pending',
      }),
      setDoc(doc(db, 'orders/online-awaiting'), {
        farmerId: 'admin-a',
        userId: 'customer-a',
        status: 'pending',
        paymentMethod: 'GCASH',
        paymentStatus: 'awaiting_verification',
        paymentReceiptUrl: 'https://example.com/receipt.png',
      }),
      setDoc(doc(db, 'orders/online-paid'), {
        farmerId: 'admin-a',
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
      setDoc(doc(db, 'conversations/customer-a/farmers/farmer-b'), {
        customerId: 'customer-a',
        farmerId: 'farmer-b',
        lastMessage: 'Hi from the valley farm',
        updatedAt: new Date(),
      }),
      setDoc(doc(db, 'conversations/customer-a/farmers/admin-a'), {
        customerId: 'customer-a',
        farmerId: 'admin-a',
        lastMessage: 'Hi from the original farm',
        updatedAt: new Date(),
      }),
      setDoc(doc(db, 'conversations/customer-a/farmers/farmer-b/messages/message-a'), {
        senderId: 'customer-a',
        senderRole: 'customer',
        text: 'Hello',
        createdAt: new Date(),
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

test('legacy admin role retains farmer access before migration', async () => {
  const db = environment.authenticatedContext('admin-a').firestore()
  await assertSucceeds(getDoc(doc(db, 'users/customer-a')))
  await assertSucceeds(getDoc(doc(db, 'orders/order-a')))
  await assertSucceeds(updateDoc(doc(db, 'products/product-a'), { stock: 9 }))
  await assertSucceeds(updateDoc(doc(db, 'orders/order-a'), { status: 'confirmed' }))
})

test('farmers cannot list orders without a farmerId filter', async () => {
  const db = environment.authenticatedContext('farmer-b').firestore()
  await assertFails(getDocs(collection(db, 'orders')))
})

test('farmers can list only their orders when filtered by farmerId', async () => {
  const db = environment.authenticatedContext('farmer-b').firestore()
  const snapshot = await getDocs(query(collection(db, 'orders'), where('farmerId', '==', 'farmer-b')))
  assert.deepEqual(snapshot.docs.map((order) => order.id), ['order-other-farmer'])
})

test('CCES admin role retains application and read-only administration access', async () => {
  const db = environment.authenticatedContext('cces-admin-a').firestore()
  await assertSucceeds(getDocs(collection(db, 'farmerApplications')))
  await assertSucceeds(getDocs(collection(db, 'farmerProfiles')))
  await assertSucceeds(getDocs(collection(db, 'orders')))
})

test('customers can read active farmer storefront profiles but farmers cannot edit another farmer data', async () => {
  const customerDb = environment.authenticatedContext('customer-a').firestore()
  await assertSucceeds(getDoc(doc(customerDb, 'farmerProfiles/farmer-b')))
  await assertSucceeds(getDoc(doc(customerDb, 'farmerProfiles/legacy-profile-not-created-yet')))

  const farmerDb = environment.authenticatedContext('admin-a').firestore()
  await assertFails(updateDoc(doc(farmerDb, 'products/product-other-farmer'), { name: 'CHANGED' }))
  await assertFails(updateDoc(doc(farmerDb, 'orders/order-other-farmer'), { status: 'confirmed' }))
})

test('only the legacy farmer can claim an unmarked storefront fallback', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'settings/storefront'), { legacyFarmerId: '' })
  })

  const newFarmerDb = environment.authenticatedContext('farmer-b').firestore()
  await assertFails(updateDoc(doc(newFarmerDb, 'settings/storefront'), {
    legacyFarmerId: 'farmer-b',
  }))

  const legacyFarmerDb = environment.authenticatedContext('admin-a').firestore()
  await assertSucceeds(updateDoc(doc(legacyFarmerDb, 'settings/storefront'), {
    legacyFarmerId: 'admin-a',
  }))
})

test('farmers can update only their own storefront settings', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'farmerProfiles/admin-a'), {
      status: 'active',
      storeReady: false,
      farmName: 'Legacy Farm',
      contactNumber: '09123456789',
      address: 'Farm Road',
      createdAt: new Date(),
    })
  })

  const farmerDb = environment.authenticatedContext('admin-a').firestore()
  await assertSucceeds(updateDoc(doc(farmerDb, 'farmerProfiles/admin-a'), {
    storeReady: false,
    pickupLocation: 'Gate 2',
    pickupDays: 'Monday to Friday',
    pickupHours: '8 AM to 4 PM',
    gcashAccountName: 'Legacy Farm',
    gcashAccountNumber: '09123456789',
    gcashQrUrl: '',
    mayaAccountName: '',
    mayaAccountNumber: '',
    mayaQrUrl: '',
  }))
  await assertFails(updateDoc(doc(farmerDb, 'farmerProfiles/farmer-b'), { pickupLocation: 'Changed' }))
  await assertFails(updateDoc(doc(farmerDb, 'farmerProfiles/admin-a'), { status: 'suspended' }))
})

test('farmers can set only a valid delivery fee in their own profile', async () => {
  const farmerDb = environment.authenticatedContext('farmer-b').firestore()
  const profileRef = doc(farmerDb, 'farmerProfiles/farmer-b')
  const settings = {
    storeReady: false,
    deliveryFee: 50,
    pickupLocation: 'Gate 2',
    pickupDays: 'Monday to Friday',
    pickupHours: '8 AM to 4 PM',
    gcashAccountName: 'Valley Farm',
    gcashAccountNumber: '09999999999',
    gcashQrUrl: '',
    mayaAccountName: '',
    mayaAccountNumber: '',
    mayaQrUrl: '',
  }
  await assertSucceeds(updateDoc(profileRef, settings))
  await assertFails(updateDoc(profileRef, { ...settings, deliveryFee: 10001 }))
})

test('customers cannot promote their own role or assign themselves the CCES admin role', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  await assertFails(updateDoc(doc(db, 'users/customer-a'), { role: 'farmer' }))
  await assertFails(updateDoc(doc(db, 'users/customer-a'), { role: 'cces_admin' }))
})

test('applicants can create and read only their own pending application', async () => {
  const db = environment.authenticatedContext('customer-b').firestore()
  const application = doc(db, 'farmerApplications/customer-b')
  await assertFails(setDoc(application, {
    status: 'approved',
    farmName: 'Green Valley',
    contactNumber: '09987654321',
    address: 'Valley Road',
    createdAt: serverTimestamp(),
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: '',
  }))
  await assertSucceeds(setDoc(application, {
    status: 'pending',
    farmName: 'Green Valley',
    contactNumber: '09987654321',
    address: 'Valley Road',
    createdAt: serverTimestamp(),
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: '',
  }))
  await assertSucceeds(getDoc(application))
  await assertFails(getDoc(doc(db, 'farmerApplications/customer-a')))
  await assertFails(updateDoc(application, { status: 'approved' }))
})

test('a rejected applicant can re-apply only to their own application', async () => {
  const db = environment.authenticatedContext('customer-rejected').firestore()
  await assertSucceeds(updateDoc(doc(db, 'farmerApplications/customer-rejected'), {
    status: 'pending',
    farmName: 'Updated Farm',
    contactNumber: '09222222222',
    address: 'New Farm Road',
    createdAt: serverTimestamp(),
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: '',
  }))
  await assertFails(updateDoc(doc(db, 'farmerApplications/customer-a'), {
    status: 'pending',
    farmName: 'Not Their Farm',
    contactNumber: '09222222222',
    address: 'New Farm Road',
    createdAt: serverTimestamp(),
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: '',
  }))
  await assertFails(updateDoc(doc(db, 'farmerApplications/customer-rejected'), {
    status: 'approved',
  }))
})

test('signup can create a customer profile and pending farmer application atomically', async () => {
  const db = environment.authenticatedContext('farmer-applicant').firestore()
  const batch = writeBatch(db)
  batch.set(doc(db, 'users/farmer-applicant'), {
    firstName: 'Taylor',
    lastName: 'Applicant',
    email: 'taylor@example.com',
    birthday: Timestamp.fromDate(new Date('2000-01-01T00:00:00Z')),
    contactNumber: '09123456789',
    address: 'Farm Road',
    role: 'customer',
    customerType: 'individual',
    farmNotes: '',
    createdAt: serverTimestamp(),
  })
  batch.set(doc(db, 'farmerApplications/farmer-applicant'), {
    status: 'pending',
    farmName: 'Taylor Farm',
    contactNumber: '09123456789',
    address: 'Farm Road',
    createdAt: serverTimestamp(),
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: '',
  })
  await assertSucceeds(batch.commit())
})

test('customers cannot approve their farmer applications', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  const batch = writeBatch(db)
  batch.update(doc(db, 'farmerApplications/customer-a'), {
    status: 'approved',
    reviewedBy: 'customer-a',
    reviewedAt: serverTimestamp(),
  })
  batch.update(doc(db, 'users/customer-a'), { role: 'farmer' })
  batch.set(doc(db, 'farmerProfiles/customer-a'), {
    status: 'active',
    farmName: 'Casey Farm',
    contactNumber: '09123456789',
    address: 'Farm Road',
    createdAt: serverTimestamp(),
  })
  await assertFails(batch.commit())
})

test('CCES admins approve applications and farmer roles atomically', async () => {
  const db = environment.authenticatedContext('cces-admin-a').firestore()
  await assertSucceeds(getDocs(collection(db, 'farmerApplications')))
  const batch = writeBatch(db)
  batch.update(doc(db, 'farmerApplications/customer-a'), {
    status: 'approved',
    reviewedBy: 'cces-admin-a',
    reviewedAt: serverTimestamp(),
  })
  batch.update(doc(db, 'users/customer-a'), { role: 'farmer' })
  batch.set(doc(db, 'farmerProfiles/customer-a'), {
    status: 'active',
    farmName: 'Casey Farm',
    contactNumber: '09123456789',
    address: 'Farm Road',
    createdAt: serverTimestamp(),
  })
  await assertSucceeds(batch.commit())
  await environment.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore()
    assert.equal((await getDoc(doc(adminDb, 'users/customer-a'))).data().role, 'farmer')
    assert.equal((await getDoc(doc(adminDb, 'farmerApplications/customer-a'))).data().status, 'approved')
    assert.equal((await getDoc(doc(adminDb, 'farmerProfiles/customer-a'))).data().status, 'active')
  })
})

test('suspended farmers cannot create, update, or delete products', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users/suspended-farmer'), { role: 'farmer' }),
      setDoc(doc(db, 'farmerProfiles/suspended-farmer'), {
        status: 'suspended',
        farmName: 'Suspended Farm',
        contactNumber: '09111111111',
        address: 'Closed Road',
        createdAt: new Date(),
      }),
    ])
  })

  const db = environment.authenticatedContext('suspended-farmer').firestore()
  await assertFails(setDoc(doc(db, 'products/suspended-farmer-product'), {
    name: 'NEW PRODUCT',
    price: 10,
    stock: 5,
    sold: 0,
    unit: 'KG',
    isAvailable: true,
  }))
  await assertFails(updateDoc(doc(db, 'products/product-a'), { stock: 0 }))
  await assertFails(deleteDoc(doc(db, 'products/product-a')))
})

test('customers cannot create or update products', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  await assertFails(setDoc(doc(db, 'products/customer-product'), { name: 'Unauthorized' }))
  await assertFails(updateDoc(doc(db, 'products/product-a'), { name: 'Changed' }))
})

function customerOrder(orderId, overrides = {}) {
  return {
    orderNumber: 'ORD-TEST',
    checkoutGroupId: 'checkout-group-test',
    farmerId: 'admin-a',
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

test('a farmer without a profile cannot sell until their profile has pickup and payment settings', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await deleteDoc(doc(db, 'farmerProfiles/farmer-b'))
    await setDoc(doc(db, 'farmerApplications/farmer-b'), {
      status: 'approved',
      farmName: 'Valley Farm',
      contactNumber: '09999999999',
      address: 'Valley Road',
    })
  })

  const customerDb = environment.authenticatedContext('customer-a').firestore()
  const orderId = 'new-farmer-unconfigured'
  const order = customerOrder(orderId, {
    farmerId: 'farmer-b',
    items: [{ productId: 'product-other-farmer', name: 'TOMATOES', price: 20, quantity: 1, unit: 'KG' }],
    subtotal: 20,
    deliveryFee: 25,
    tax: 1,
    total: 46,
  })
  await assertFails(submitCustomerOrder(customerDb, orderId, order))

  const farmerDb = environment.authenticatedContext('farmer-b').firestore()
  const profile = {
    status: 'active',
    storeReady: false,
    farmName: 'Valley Farm',
    contactNumber: '09999999999',
    address: 'Valley Road',
    createdAt: serverTimestamp(),
    deliveryFee: 25,
    pickupLocation: '',
    pickupDays: '',
    pickupHours: '',
    gcashAccountName: '',
    gcashAccountNumber: '',
    gcashQrUrl: '',
    mayaAccountName: '',
    mayaAccountNumber: '',
    mayaQrUrl: '',
  }
  await assertSucceeds(setDoc(doc(farmerDb, 'farmerProfiles/farmer-b'), profile))
  await assertFails(submitCustomerOrder(customerDb, orderId, order))
  await assertFails(updateDoc(doc(farmerDb, 'farmerProfiles/farmer-b'), {
    storeReady: true,
    pickupLocation: ' ',
    gcashAccountName: ' ',
    gcashAccountNumber: ' ',
    gcashQrUrl: ' ',
  }))
  await assertSucceeds(updateDoc(doc(farmerDb, 'farmerProfiles/farmer-b'), {
    storeReady: true,
    pickupLocation: 'Valley Road',
    pickupDays: 'Monday to Friday',
    pickupHours: '8 AM to 4 PM',
    gcashAccountName: 'Valley Farm',
    gcashAccountNumber: '09999999999',
    gcashQrUrl: 'https://example.com/gcash.png',
  }))
  await assertSucceeds(submitCustomerOrder(customerDb, orderId, order))
})

test('one checkout order for multiple products from one farmer uses that farmer delivery fee and validates stock and tax', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  const order = customerOrder('single-farmer-multi-item', {
    farmerId: 'farmer-b',
    items: [{
      productId: 'product-other-farmer',
      name: 'TOMATOES',
      price: 20,
      quantity: 1,
      unit: 'KG',
    }, {
      productId: 'product-other-farmer-second',
      name: 'CUCUMBERS',
      price: 30,
      quantity: 2,
      unit: 'KG',
    }],
    subtotal: 80,
    deliveryFee: 25,
    tax: 4,
    total: 109,
  })

  await assertSucceeds(submitOrderWithInventoryUpdates(db, 'single-farmer-multi-item', order, [
    { productId: 'product-other-farmer', quantity: 1, itemIndex: 0 },
    { productId: 'product-other-farmer-second', quantity: 2, itemIndex: 1 },
  ]))

  const [savedOrder, firstProduct, secondProduct] = await Promise.all([
    getDoc(doc(db, 'orders/single-farmer-multi-item')),
    getDoc(doc(db, 'products/product-other-farmer')),
    getDoc(doc(db, 'products/product-other-farmer-second')),
  ])
  assert.equal(savedOrder.data().farmerId, 'farmer-b')
  assert.equal(savedOrder.data().deliveryFee, 25)
  assert.equal(savedOrder.data().total, 109)
  assert.equal(firstProduct.data().stock, 4)
  assert.equal(secondProduct.data().stock, 5)
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

test('Farmers can mark an active unpaid COD order as paid only once', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'orders/cod-unpaid'), {
      farmerId: 'admin-a',
      userId: 'customer-a',
      paymentMethod: 'COD',
      paymentStatus: 'unpaid',
      status: 'pending',
    })
    await setDoc(doc(context.firestore(), 'orders/cod-cancelled'), {
      farmerId: 'admin-a',
      userId: 'customer-a',
      paymentMethod: 'COD',
      paymentStatus: 'unpaid',
      status: 'cancelled',
    })
    await setDoc(doc(context.firestore(), 'orders/cod-rejected'), {
      farmerId: 'admin-a',
      userId: 'customer-a',
      paymentMethod: 'COD',
      paymentStatus: 'rejected',
      status: 'cancelled',
    })
    await setDoc(doc(context.firestore(), 'orders/rejected-active'), {
      farmerId: 'admin-a',
      userId: 'customer-a',
      paymentMethod: 'COD',
      paymentStatus: 'rejected',
      status: 'pending',
    })
  })

  const farmerDb = environment.authenticatedContext('admin-a').firestore()
  await assertSucceeds(updateDoc(doc(farmerDb, 'orders/cod-unpaid'), {
    paymentStatus: 'paid',
    paymentVerifiedAt: serverTimestamp(),
    paymentVerifiedBy: 'admin-a',
  }))
  await assertFails(updateDoc(doc(farmerDb, 'orders/cod-unpaid'), {
    paymentStatus: 'paid',
    paymentVerifiedAt: serverTimestamp(),
    paymentVerifiedBy: 'admin-a',
  }))
  await assertFails(updateDoc(doc(farmerDb, 'orders/cod-cancelled'), {
    paymentStatus: 'paid',
    paymentVerifiedAt: serverTimestamp(),
    paymentVerifiedBy: 'admin-a',
  }))
  await assertFails(updateDoc(doc(farmerDb, 'orders/cod-rejected'), {
    paymentStatus: 'paid',
    paymentVerifiedAt: serverTimestamp(),
    paymentVerifiedBy: 'admin-a',
  }))
  await assertFails(updateDoc(doc(farmerDb, 'orders/cod-cancelled'), { status: 'confirmed' }))
  await assertFails(updateDoc(doc(farmerDb, 'orders/rejected-active'), { status: 'confirmed' }))
  await assertFails(updateDoc(doc(farmerDb, 'orders/rejected-active'), { paymentStatus: 'paid' }))

  const ccesAdminDb = environment.authenticatedContext('cces-admin-a').firestore()
  await assertFails(updateDoc(doc(ccesAdminDb, 'orders/cod-unpaid'), {
    paymentStatus: 'paid',
    paymentVerifiedAt: serverTimestamp(),
    paymentVerifiedBy: 'cces-admin-a',
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
  await assertFails(updateDoc(doc(farmerDb, 'orders/order-to-reject'), { status: 'confirmed' }))
  await assertFails(updateDoc(doc(farmerDb, 'orders/order-to-reject'), { paymentStatus: 'paid' }))

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

test('Farmers can cancel active orders and restore stock atomically', async () => {
  const customerDb = environment.authenticatedContext('customer-a').firestore()
  await assertSucceeds(submitCustomerOrder(
    customerDb,
    'order-to-cancel',
    customerOrder('order-to-cancel'),
  ))

  const farmerDb = environment.authenticatedContext('admin-a').firestore()
  await assertFails(updateDoc(doc(farmerDb, 'orders/order-to-cancel'), { status: 'cancelled' }))
  await assertSucceeds(runTransaction(farmerDb, async (transaction) => {
    const orderRef = doc(farmerDb, 'orders/order-to-cancel')
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
    transaction.update(orderRef, { status: 'cancelled' })
  }))

  const [orderSnapshot, productSnapshot] = await Promise.all([
    getDoc(doc(farmerDb, 'orders/order-to-cancel')),
    getDoc(doc(farmerDb, 'products/product-a')),
  ])
  assert.equal(orderSnapshot.data().status, 'cancelled')
  assert.equal(productSnapshot.data().stock, 10)
  assert.equal(productSnapshot.data().sold, 0)
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
  await assertFails(getDoc(doc(db, 'conversations/customer-b/farmers/farmer-b')))
})

test('farmers can read only conversations and messages assigned to their farmerId', async () => {
  const valleyFarm = environment.authenticatedContext('farmer-b').firestore()
  await assertSucceeds(getDoc(doc(valleyFarm, 'conversations/customer-a/farmers/farmer-b')))
  await assertSucceeds(getDoc(doc(valleyFarm, 'conversations/customer-a/farmers/farmer-b/messages/message-a')))
  await assertFails(getDoc(doc(valleyFarm, 'conversations/customer-a/farmers/admin-a')))
  await assertFails(getDocs(collection(valleyFarm, 'conversations/customer-a/farmers/admin-a/messages')))
  await assertFails(updateDoc(doc(valleyFarm, 'conversations/customer-a/farmers/admin-a'), {
    lastMessage: 'A cross-farmer update.',
    updatedAt: serverTimestamp(),
  }))

  const reply = writeBatch(valleyFarm)
  reply.update(doc(valleyFarm, 'conversations/customer-a/farmers/farmer-b'), {
    lastMessage: 'Thanks for your message.',
    updatedAt: serverTimestamp(),
  })
  reply.set(doc(valleyFarm, 'conversations/customer-a/farmers/farmer-b/messages/message-farmer-b'), {
    senderId: 'farmer-b',
    senderRole: 'farmer',
    text: 'Thanks for your message.',
    createdAt: serverTimestamp(),
  })
  await assertSucceeds(reply.commit())

  const originalFarm = environment.authenticatedContext('admin-a').firestore()
  await assertSucceeds(getDoc(doc(originalFarm, 'conversations/customer-b')))
  await assertFails(getDoc(doc(originalFarm, 'conversations/customer-a/farmers/farmer-b')))
})

test('customers can create a farmer-scoped conversation and first message atomically', async () => {
  const db = environment.authenticatedContext('customer-b').firestore()
  await assertSucceeds(getDocs(collection(db, 'conversations/customer-b/farmers/farmer-b/messages')))
  const batch = writeBatch(db)
  batch.set(doc(db, 'conversations/customer-b/farmers/farmer-b'), {
    customerId: 'customer-b',
    farmerId: 'farmer-b',
    lastMessage: 'I would like to ask about your tomatoes.',
    updatedAt: serverTimestamp(),
  })
  batch.set(doc(db, 'conversations/customer-b/farmers/farmer-b/messages/message-b'), {
    senderId: 'customer-b',
    senderRole: 'customer',
    text: 'I would like to ask about your tomatoes.',
    createdAt: serverTimestamp(),
  })
  await assertSucceeds(batch.commit())
})

test('a farmer cannot create a conversation under another farmer id', async () => {
  const db = environment.authenticatedContext('farmer-b').firestore()
  await assertFails(setDoc(doc(db, 'conversations/customer-b/farmers/admin-a'), {
    customerId: 'customer-b',
    farmerId: 'admin-a',
    lastMessage: 'Should not be visible to the wrong farmer.',
    updatedAt: serverTimestamp(),
  }))
})

test('customers can review a product from a delivered farmer order', async () => {
  const db = environment.authenticatedContext('customer-a').firestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'orders/order-farmer-b-delivered'), {
      farmerId: 'farmer-b',
      userId: 'customer-a',
      status: 'delivered',
      deliveryConfirmed: true,
      items: [{
        productId: 'product-other-farmer',
        name: 'TOMATOES',
        price: 20,
        quantity: 1,
        unit: 'KG',
      }],
    })
  })

  await assertSucceeds(setDoc(doc(db, 'products/product-other-farmer/reviews/order-farmer-b-delivered'), {
    orderId: 'order-farmer-b-delivered',
    productId: 'product-other-farmer',
    orderItem: {
      productId: 'product-other-farmer',
      name: 'TOMATOES',
      price: 20,
      quantity: 1,
      unit: 'KG',
    },
    userId: 'customer-a',
    rating: 5,
    comment: 'Fresh and delicious.',
    createdAt: serverTimestamp(),
  }))
})
