// Everything the client asks the backend for.
//
// One module so there is a single place to see what the app depends on, and a single place
// to change when the base URL moves into the bank's environment.

const BASE = import.meta.env?.VITE_API_URL || ''

async function req(path, options) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

/** The whole customer, plus derived behaviour signals. Every surface reads from this. */
export const getSnapshot = (cif) => req(`/api/snapshot/${encodeURIComponent(cif)}`)

/** Run a proposed recommendation through the suitability gate. */
export const evaluateAdvice = (body) =>
  req('/api/advice/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

/** The advice register — every recommendation and whether the gate passed it. */
export const getAdviceRecords = (customerId) => req(`/api/advice/${encodeURIComponent(customerId)}`)
