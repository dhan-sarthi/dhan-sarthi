// Vector store for Dhan Sarthi's memory.
//
// IndexedDB in the browser, an in-memory map everywhere else (tests, SSR). In production
// this becomes pgvector in the bank's own RDS — the interface is deliberately narrow so
// that swap is a one-file change.

const DB_NAME = 'dhan-sarthi-memory'
const DB_VERSION = 1
const STORE = 'memories'

const hasIDB = typeof indexedDB !== 'undefined'
const fallback = new Map() // customerId -> Memory[]

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' })
        os.createIndex('customerId', 'customerId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx(mode, fn) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const store = t.objectStore(STORE)
    let out
    try { out = fn(store) } catch (e) { reject(e); return }
    t.oncomplete = () => { db.close(); resolve(out) }
    t.onerror = () => { db.close(); reject(t.error) }
  })
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Memories fade. Half-life of 60 days, floored so nothing important vanishes entirely. */
export function recencyWeight(createdAt, now = Date.now()) {
  const days = Math.max(0, (now - createdAt) / 86_400_000)
  return 0.55 + 0.45 * Math.pow(0.5, days / 60)
}

export function whenLabel(createdAt, now = Date.now()) {
  const days = Math.floor((now - createdAt) / 86_400_000)
  if (days <= 0) return 'earlier today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  if (days < 45) return `${Math.round(days / 7)} weeks ago`
  if (days < 400) return `${Math.round(days / 30)} months ago`
  return 'a while back'
}

export async function put(memory) {
  if (!hasIDB) {
    const list = fallback.get(memory.customerId) || []
    list.push(memory)
    fallback.set(memory.customerId, list)
    return memory
  }
  await tx('readwrite', (s) => s.put(memory))
  return memory
}

export async function all(customerId) {
  if (!hasIDB) return fallback.get(customerId) || []
  return tx('readonly', (s) => {
    const out = []
    const req = s.index('customerId').openCursor(IDBKeyRange.only(customerId))
    req.onsuccess = () => {
      const c = req.result
      if (c) { out.push(c.value); c.continue() }
    }
    return out
  })
}

export async function remove(id, customerId) {
  if (!hasIDB) {
    const list = (fallback.get(customerId) || []).filter((m) => m.id !== id)
    fallback.set(customerId, list)
    return
  }
  await tx('readwrite', (s) => s.delete(id))
}

export async function clear(customerId) {
  if (!hasIDB) { fallback.delete(customerId); return }
  const items = await all(customerId)
  await tx('readwrite', (s) => items.forEach((m) => s.delete(m.id)))
}

/**
 * Rank memories against a query embedding.
 *
 * Cleo describe retrieving "based on meaning, filtering for recency and context". Meaning is
 * cosine similarity; recency is the decay above; context is topic overlap with whatever is
 * being discussed right now, which stops a six-month-old aside about tax outranking last
 * week's promise about a SIP.
 */
export function rank(memories, queryEmbedding, { topics = [], limit = 5, minScore = 0.25, now = Date.now() } = {}) {
  const active = new Set(topics.map((t) => t.toLowerCase()))
  return memories
    .map((m) => {
      const similarity = cosine(m.embedding, queryEmbedding)
      const overlap = (m.topics || []).filter((t) => active.has(String(t).toLowerCase())).length
      const contextBoost = active.size ? Math.min(0.15, overlap * 0.05) : 0
      const score = similarity * recencyWeight(m.createdAt, now) + contextBoost
      return { ...m, similarity, score, whenLabel: whenLabel(m.createdAt, now) }
    })
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
