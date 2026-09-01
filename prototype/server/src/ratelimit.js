/**
 * Best-effort per-IP limiter for the routes that cost money when called.
 *
 * Per-instance and in-memory on purpose: the real backstop is the spend cap on the account.
 * This exists so a stuck client loop cannot quietly mint sessions all afternoon.
 */
export function createLimiter({ windowMs = 60 * 60 * 1000, max = 20 } = {}) {
  const hits = new Map()
  return function limited(ip) {
    const now = Date.now()
    const e = hits.get(ip) || { count: 0, start: now }
    if (now - e.start > windowMs) { e.count = 0; e.start = now }
    e.count += 1
    hits.set(ip, e)
    if (hits.size > 5000) hits.clear()
    return e.count > max
  }
}
