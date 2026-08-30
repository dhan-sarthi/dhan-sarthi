// Memory, from the client's side: a thin API client.
//
// The pipeline itself — extraction, safeguards, embedding, ranking — lives on the server
// (server/src/memory.js). It moved there because a bank's memory of a customer has to be
// auditable and revocable, and neither is true of a store that lives in the browser.
//
// Every call degrades to "no memory" rather than throwing. A failed request must never take
// down a live voice session.

const API = import.meta.env?.VITE_API_URL || ''

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json()
}

/** Process a finished conversation. Returns the stored memory, or null if nothing was kept. */
export async function remember(customerId, transcript) {
  try {
    const r = await post('/api/memory/remember', { customerId, transcript })
    if (!r.stored) console.info('[memory] not stored —', r.reason)
    return r.stored ? r : null
  } catch (err) {
    console.warn('[memory] remember failed, continuing without:', err.message)
    return null
  }
}

/** Memories worth having in mind for what is being discussed now. Safe to call every session. */
export async function recall(customerId, query, { topics = [], limit = 5 } = {}) {
  try {
    const { memories } = await post('/api/memory/recall', { customerId, query, topics, limit })
    return memories || []
  } catch (err) {
    console.warn('[memory] recall failed, continuing without:', err.message)
    return []
  }
}

async function get(customerId) {
  const res = await fetch(`${API}/api/memory/${encodeURIComponent(customerId)}`)
  if (!res.ok) throw new Error(`memory ${res.status}`)
  return res.json()
}

export async function openCommitments(customerId) {
  try { return (await get(customerId)).commitments || [] } catch { return [] }
}

export async function listMemories(customerId) {
  try { return (await get(customerId)).memories || [] } catch { return [] }
}

/** Consent revocation. Actually deletes. */
export async function forgetAll(customerId) {
  try {
    const res = await fetch(`${API}/api/memory/${encodeURIComponent(customerId)}`, { method: 'DELETE' })
    return res.ok ? res.json() : { deleted: 0 }
  } catch { return { deleted: 0 } }
}
