import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const serviceAccountPath = process.argv[2]

if (!serviceAccountPath || process.argv.length !== 3) {
  console.error('Usage: node scripts/backup-firestore.mjs <service-account.json>')
  process.exit(2)
}

function serialize(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(serialize)
  if (value && typeof value === 'object') {
    if (typeof value.path === 'string' && value.constructor?.name === 'DocumentReference') {
      return { __type: 'DocumentReference', path: value.path }
    }
    if (value.constructor?.name === 'GeoPoint') {
      return { __type: 'GeoPoint', latitude: value.latitude, longitude: value.longitude }
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serialize(child)]))
  }
  return value
}

async function exportCollection(db, collectionRef, outputDirectory) {
  const snapshot = await collectionRef.get()
  const records = snapshot.docs.map((document) => ({
    id: document.id,
    data: serialize(document.data()),
  }))
  const outputPath = join(outputDirectory, `${collectionRef.path}.json`)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8')

  for (const document of snapshot.docs) {
    const subcollections = await document.ref.listCollections()
    for (const subcollection of subcollections) {
      await exportCollection(db, subcollection, outputDirectory)
    }
  }
  return snapshot.size
}

try {
  const credentialPath = resolve(serviceAccountPath)
  let serviceAccount
  try {
    serviceAccount = JSON.parse(await readFile(credentialPath, 'utf8'))
  } catch {
    throw new Error('Unable to read a valid service-account JSON file; credential contents were not displayed.')
  }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('The service account JSON is missing required credential fields.')
  }

  const app = initializeApp({ credential: cert(serviceAccount) })
  const db = getFirestore(app)
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const outputDirectory = join(repositoryRoot, 'backups', timestamp)
  await mkdir(outputDirectory, { recursive: true })

  const counts = {}
  const collections = await db.listCollections()
  for (const collection of collections) {
    counts[collection.path] = await exportCollection(db, collection, outputDirectory)
  }

  console.info(`Firestore backup written to backups/${timestamp}/`)
  console.info('Document counts by collection path:')
  for (const [path, count] of Object.entries(counts).sort(([first], [second]) => first.localeCompare(second))) {
    console.info(`  ${path}: ${count}`)
  }
} catch (error) {
  console.error('Firestore backup failed:', error instanceof Error ? error.message : 'Unknown error')
  process.exitCode = 1
}
