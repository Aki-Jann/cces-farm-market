import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const projectId = 'demo-cces-farm-market'
const timeoutMs = 300_000
const cacheDirectory = process.env.FIREBASE_EMULATORS_PATH
  ?? join(homedir(), '.cache', 'firebase', 'emulators')
const activeProcesses = new Set()
let timedOut = false

function findCachedFirestoreEmulator() {
  let fileNames
  try {
    fileNames = readdirSync(cacheDirectory)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }

  const emulatorFile = fileNames
    .filter((name) => /^cloud-firestore-emulator-v\d+(?:\.\d+)*\.jar$/.test(name))
    .sort(new Intl.Collator(undefined, { numeric: true }).compare)
    .at(-1)

  return emulatorFile ? join(cacheDirectory, emulatorFile) : null
}

function startProcess(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options })
  activeProcesses.add(child)
  child.once('close', () => activeProcesses.delete(child))

  const completion = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })

  return { child, completion }
}

function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve()

  return new Promise((resolve) => {
    const forceKill = setTimeout(() => child.kill('SIGKILL'), 5000)
    child.once('close', () => {
      clearTimeout(forceKill)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

async function waitForEmulator(child) {
  const endpoint = 'http://127.0.0.1:8080'
  const deadline = Date.now() + 30_000
  let lastError = 'no response received'

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('The Firestore emulator exited before becoming ready.')
    }

    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }

    await delay(250)
  }

  throw new Error(`Firestore emulator did not become ready: ${lastError}`)
}

async function runTestProcess() {
  const test = startProcess(process.execPath, [
    'tests/firestore.rules.test.mjs',
  ], {
    env: {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      GCLOUD_PROJECT: projectId,
    },
  })

  const result = await test.completion
  if (result.signal) {
    console.error(`Rules test process stopped by signal ${result.signal}.`)
    process.exitCode = 1
  } else {
    process.exitCode = result.code ?? 1
  }
}

async function runWithCachedEmulator(emulatorPath) {
  const emulator = startProcess('java', [
    '-jar',
    emulatorPath,
    '--host=127.0.0.1',
    '--port=8080',
    `--project_id=${projectId}`,
    `--rules=${join(process.cwd(), 'firestore.rules')}`,
    '--single_project_mode=true',
  ])

  await waitForEmulator(emulator.child)
  console.log('Firestore emulator is ready.')
  await runTestProcess()
}

async function runWithFirebaseCli() {
  console.log('No cached Firestore emulator found; starting it with Firebase CLI.')
  const firebase = startProcess('firebase', [
    'emulators:exec',
    '--only',
    'firestore',
    '--project',
    projectId,
    'node tests/firestore.rules.test.mjs',
  ])

  const result = await firebase.completion
  if (result.signal) {
    console.error(`Firebase CLI stopped by signal ${result.signal}.`)
    process.exitCode = 1
  } else {
    process.exitCode = result.code ?? 1
  }
}

const timeout = setTimeout(() => {
  timedOut = true
  console.error(`Rules tests exceeded ${timeoutMs / 1000} seconds; stopping the emulator and test process.`)
  for (const child of activeProcesses) child.kill('SIGTERM')
  setTimeout(() => {
    for (const child of activeProcesses) child.kill('SIGKILL')
  }, 5000).unref()
}, timeoutMs)

try {
  const emulatorPath = findCachedFirestoreEmulator()
  if (emulatorPath) {
    await runWithCachedEmulator(emulatorPath)
  } else {
    await runWithFirebaseCli()
  }
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
    console.error('Java was not found. Install a JDK 21 or later (for example, Eclipse Temurin 21) and ensure java is on PATH.')
  } else {
    console.error('Running Firestore rules tests failed:', error)
  }
  process.exitCode = 1
} finally {
  clearTimeout(timeout)
  await Promise.all([...activeProcesses].map(stopProcess))
  if (timedOut) process.exitCode = 124
}
