import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const args = process.argv.slice(2)
const positionalArguments = args.filter((argument) => !argument.startsWith('--'))
const serviceAccountPath = positionalArguments[0]
const farmerEmail = optionValue('--farmer-email=')
const ccesEmail = optionValue('--cces-email=')
const hasDryRun = args.includes('--dry-run')
const hasApply = args.includes('--apply')
const dryRun = !hasApply

function optionValue(prefix) {
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length).trim() ?? ''
}

if (positionalArguments.length !== 1 || !farmerEmail || !ccesEmail || hasDryRun && hasApply
  || args.some((argument) => argument.startsWith('--') && !argument.startsWith('--farmer-email=')
    && !argument.startsWith('--cces-email=') && argument !== '--dry-run' && argument !== '--apply')) {
  console.error('Usage: node scripts/migrate-multi-farmer.mjs <service-account.json> --farmer-email=<email> --cces-email=<email> [--dry-run | --apply]')
  process.exit(2)
}

const collectionStats = new Map()
const operations = []

function statsFor(collectionName) {
  if (!collectionStats.has(collectionName)) {
    collectionStats.set(collectionName, { found: 0, wouldChange: 0, changed: 0, skipped: 0 })
  }
  return collectionStats.get(collectionName)
}

function recordFound(collectionName, count = 1) {
  statsFor(collectionName).found += count
}

function recordSkipped(collectionName, count = 1) {
  statsFor(collectionName).skipped += count
}

function planWrite(collectionName, operation) {
  statsFor(collectionName).wouldChange += 1
  operations.push({ collectionName, operation })
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function isMissingFarmerId(value) {
  return typeof value !== 'string' || value.trim() === ''
}

function usableFarmName(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  const name = value.trim()
  return name.toLocaleLowerCase() === 'tiangge verde' ? '' : name
}

function storeSettingsReady(settings) {
  const pickupConfigured = typeof settings.pickupLocation === 'string' && settings.pickupLocation.trim()
  const gcashConfigured = ['gcashAccountName', 'gcashAccountNumber', 'gcashQrUrl']
    .every((field) => typeof settings[field] === 'string' && settings[field].trim())
  const mayaConfigured = ['mayaAccountName', 'mayaAccountNumber', 'mayaQrUrl']
    .every((field) => typeof settings[field] === 'string' && settings[field].trim())
  return Boolean(pickupConfigured && (gcashConfigured || mayaConfigured))
}

async function findUserByEmail(db, email, label) {
  const users = await db.collection('users').get()
  const matches = users.docs.filter((document) => normalizeEmail(document.data().email) === normalizeEmail(email))
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label} user matching the supplied email; found ${matches.length}.`)
  }
  recordFound('users')
  return matches[0]
}

async function queueRoleChange(document, expectedRole) {
  const currentRole = document.data().role
  if (currentRole === expectedRole) {
    recordSkipped('users')
    return
  }
  planWrite('users', (batch) => batch.update(document.ref, { role: expectedRole }))
}

function asTimestamp(value, fallback) {
  return value && typeof value.toDate === 'function' ? value : fallback
}

function sameValue(first, second) {
  if (first === second) return true
  if (first && second && typeof first.toMillis === 'function' && typeof second.toMillis === 'function') {
    return first.toMillis() === second.toMillis()
  }
  return false
}

function queueCollectionUpdates(collectionName, snapshot, updates) {
  for (const document of snapshot.docs) {
    recordFound(collectionName)
    const update = updates(document)
    if (!update) {
      recordSkipped(collectionName)
      continue
    }
    planWrite(collectionName, (batch) => batch.update(document.ref, update))
  }
}

async function copyLegacyConversations(db, farmerUid) {
  const conversations = await db.collection('conversations').get()
  for (const conversation of conversations.docs) {
    recordFound('conversations')
    const legacyData = conversation.data()
    if (typeof legacyData.farmerId === 'string' && legacyData.farmerId) {
      recordSkipped('conversations')
      continue
    }

    const destinationRef = db.doc(`conversations/${conversation.id}/farmers/${farmerUid}`)
    const destination = await destinationRef.get()
    if (!destination.exists) {
      const destinationData = { ...legacyData, customerId: conversation.id, farmerId: farmerUid }
      planWrite('conversations', (batch) => batch.set(destinationRef, destinationData))
    } else {
      recordSkipped('conversations')
    }

    const sourceMessages = await conversation.ref.collection('messages').get()
    const destinationMessagesRef = destinationRef.collection('messages')
    const destinationMessageIds = new Set((await destinationMessagesRef.get()).docs.map((document) => document.id))

    for (const message of sourceMessages.docs) {
      recordFound('conversations/messages')
      const destinationMessage = destinationMessagesRef.doc(message.id)
      if (destinationMessageIds.has(message.id)) {
        recordSkipped('conversations/messages')
      } else {
        planWrite('conversations/messages', (batch) => batch.set(destinationMessage, message.data()))
      }
      planWrite('conversations/messages', (batch) => batch.delete(message.ref))
    }

    planWrite('conversations', (batch) => batch.delete(conversation.ref))
  }
}

async function commitOperations(db) {
  for (let offset = 0; offset < operations.length; offset += 500) {
    const chunk = operations.slice(offset, offset + 500)
    const batch = db.batch()
    chunk.forEach(({ operation }) => operation(batch))
    await batch.commit()
    chunk.forEach(({ collectionName }) => statsFor(collectionName).changed += 1)
  }
}

function printSummary() {
  console.log(dryRun ? 'DRY RUN — no documents were written.' : 'Migration writes completed.')
  console.log('Collection summary (found | would change | changed | skipped):')
  for (const [collectionName, stats] of [...collectionStats.entries()].sort(([first], [second]) => first.localeCompare(second))) {
    console.log(`  ${collectionName}: ${stats.found} | ${stats.wouldChange} | ${stats.changed} | ${stats.skipped}`)
  }
}

try {
  let serviceAccount
  try {
    serviceAccount = JSON.parse(await readFile(resolve(serviceAccountPath), 'utf8'))
  } catch {
    throw new Error('Unable to read a valid service-account JSON file; credential contents were not displayed.')
  }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('The service account JSON is missing required credential fields.')
  }
  const app = initializeApp({ credential: cert(serviceAccount) })
  const db = getFirestore(app)

  const [farmer, ccesAdmin] = await Promise.all([
    findUserByEmail(db, farmerEmail, 'farmer'),
    findUserByEmail(db, ccesEmail, 'CCES admin'),
  ])
  if (farmer.id === ccesAdmin.id) throw new Error('The farmer and CCES admin must be different users.')

  const farmerData = farmer.data()
  const storefrontRef = db.doc('settings/storefront')
  const [storefrontSnapshot, profileSnapshot, applicationSnapshot] = await Promise.all([
    storefrontRef.get(),
    db.doc(`farmerProfiles/${farmer.id}`).get(),
    db.doc(`farmerApplications/${farmer.id}`).get(),
  ])
  const storefront = storefrontSnapshot.data() ?? {}
  if (storefrontSnapshot.exists) recordFound('settings/storefront')
  else recordSkipped('settings/storefront')
  if (storefrontSnapshot.exists) {
    const legacyFarmerId = storefront.legacyFarmerId
    if (typeof legacyFarmerId === 'string' && legacyFarmerId && legacyFarmerId !== farmer.id) {
      throw new Error('The storefront is already tagged to a different legacy farmer.')
    }
    const storefrontUpdates = {}
    if (!legacyFarmerId) storefrontUpdates.legacyFarmerId = farmer.id
    const legacyStoreReady = storeSettingsReady(storefront)
    if (storefront.storeReady !== legacyStoreReady) storefrontUpdates.storeReady = legacyStoreReady
    if (Object.keys(storefrontUpdates).length > 0) {
      planWrite('settings/storefront', (batch) => batch.update(storefrontRef, storefrontUpdates))
    } else {
      recordSkipped('settings/storefront')
    }
  }
  const applicationData = applicationSnapshot.data() ?? {}
  const profileData = profileSnapshot.data() ?? {}
  const displayName = typeof farmerData.displayName === 'string' && farmerData.displayName.trim()
    ? farmerData.displayName.trim()
    : `${farmerData.firstName ?? ''} ${farmerData.lastName ?? ''}`.trim()
  const farmName = usableFarmName(applicationData.farmName)
    || usableFarmName(profileData.farmName)
    || usableFarmName(storefront.farmName)
    || displayName
    || 'Original farm'
  const contactNumber = typeof profileData.contactNumber === 'string' && profileData.contactNumber
    ? profileData.contactNumber
    : typeof applicationData.contactNumber === 'string' && applicationData.contactNumber
      ? applicationData.contactNumber
      : typeof farmerData.contactNumber === 'string' ? farmerData.contactNumber : ''
  const address = typeof profileData.address === 'string' && profileData.address
    ? profileData.address
    : typeof applicationData.address === 'string' && applicationData.address
      ? applicationData.address
      : typeof farmerData.address === 'string' ? farmerData.address : ''
  const now = Timestamp.now()

  await queueRoleChange(farmer, 'farmer')
  await queueRoleChange(ccesAdmin, 'cces_admin')

  if (applicationSnapshot.exists) recordFound('farmerApplications')
  const application = {
    ...applicationData,
    status: 'approved',
    farmName,
    contactNumber,
    address,
    createdAt: asTimestamp(applicationData.createdAt, asTimestamp(farmerData.createdAt, now)),
    reviewedBy: ccesAdmin.id,
    reviewedAt: asTimestamp(applicationData.reviewedAt, now),
    rejectionReason: '',
  }
  const applicationNeedsWrite = !applicationSnapshot.exists
    || Object.entries(application).some(([key, value]) => !sameValue(applicationData[key], value))
  if (applicationNeedsWrite) {
    planWrite('farmerApplications', (batch) => batch.set(
      db.doc(`farmerApplications/${farmer.id}`),
      application
    ))
  } else {
    recordSkipped('farmerApplications')
  }

  if (profileSnapshot.exists) recordFound('farmerProfiles')
  if (!profileSnapshot.exists) {
    planWrite('farmerProfiles', (batch) => batch.set(
      db.doc(`farmerProfiles/${farmer.id}`),
      {
        ...storefront,
        status: 'active',
        storeReady: storeSettingsReady(storefront),
        farmName,
        ...(displayName ? { displayName } : {}),
        contactNumber,
        address,
        createdAt: now,
      }
    ))
  } else {
    const profileUpdates = {}
    if (!sameValue(profileData.farmName, farmName)) profileUpdates.farmName = farmName
    if (displayName && !sameValue(profileData.displayName, displayName)) profileUpdates.displayName = displayName
    const farmerStoreReady = storeSettingsReady(profileData)
    if (profileData.storeReady !== farmerStoreReady) profileUpdates.storeReady = farmerStoreReady
    if (Object.keys(profileUpdates).length > 0) {
      planWrite('farmerProfiles', (batch) => batch.update(
        db.doc(`farmerProfiles/${farmer.id}`),
        profileUpdates
      ))
    } else {
      recordSkipped('farmerProfiles')
    }
  }
  const [products, orders] = await Promise.all([
    db.collection('products').get(),
    db.collection('orders').get(),
  ])
  queueCollectionUpdates('products', products, (document) =>
    isMissingFarmerId(document.data().farmerId) ? { farmerId: farmer.id } : null
  )
  queueCollectionUpdates('orders', orders, (document) =>
    isMissingFarmerId(document.data().farmerId) ? { farmerId: farmer.id } : null
  )

  await copyLegacyConversations(db, farmer.id)

  if (!dryRun) await commitOperations(db)
  printSummary()
  if (dryRun) {
    console.log('Review the counts, then rerun the same command with --apply to write changes.')
  }
} catch (error) {
  console.error('Multi-farmer migration failed:', error instanceof Error ? error.message : 'Unknown error')
  if (hasApply) {
    console.error('Some earlier batches may have committed. Rerun without --apply to inspect the remaining changes before retrying.')
  }
  process.exitCode = 1
}
