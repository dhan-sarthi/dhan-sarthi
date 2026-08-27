// Server-side proxy for the non-realtime model calls: memory extraction and embeddings.
//
// Same reasoning as api/realtime-token.js — OPENAI_API_KEY never reaches the browser. In the
// bank's sandbox this becomes a Bedrock call from inside the VPC and the client stays identical.

const CHAT_MODEL = 'gpt-4.1-mini'
const EMBED_MODEL = 'text-embedding-3-small'

const ALLOWED_ORIGINS = [
  'https://krishna3451.github.io',
  'http://localhost:4173',
  'http://localhost:5173',
]

const WINDOW_MS = 60 * 60 * 1000
const MAX_CALLS_PER_WINDOW = 120
const hits = new Map()

function rateLimited(ip) {
  const now = Date.now()
  const entry = hits.get(ip) || { count: 0, start: now }
  if (now - entry.start > WINDOW_MS) { entry.count = 0; entry.start = now }
  entry.count += 1
  hits.set(ip, entry)
  if (hits.size > 5000) hits.clear()
  return entry.count > MAX_CALLS_PER_WINDOW
}

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  const sameHost = !origin || origin.includes(req.headers.host || ' ')
  if (sameHost || ALLOWED_ORIGINS.includes(origin) || /https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Vary', 'Origin')
  }

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
  if (rateLimited(ip)) return json(res, 429, { error: 'Too many requests — try again later.' })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return json(res, 503, { error: 'Memory backend not configured.' })

  let body
  try { body = await readBody(req) } catch { return json(res, 400, { error: 'Bad JSON.' }) }

  const auth = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }

  try {
    if (body.task === 'embed') {
      if (typeof body.input !== 'string' || !body.input.trim()) {
        return json(res, 400, { error: 'input required' })
      }
      const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ model: EMBED_MODEL, input: body.input.slice(0, 8000) }),
      })
      if (!r.ok) return json(res, 502, { error: 'Embedding failed.' })
      const data = await r.json()
      return json(res, 200, { embedding: data.data?.[0]?.embedding ?? null })
    }

    if (body.task === 'chat') {
      if (typeof body.user !== 'string' || !body.user.trim()) {
        return json(res, 400, { error: 'user required' })
      }
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          model: CHAT_MODEL,
          temperature: 0.2,
          // Generous, because a truncated reply is the defect that broke a rival's entire demo.
          max_tokens: 800,
          ...(body.json ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            ...(body.system ? [{ role: 'system', content: body.system }] : []),
            { role: 'user', content: body.user.slice(0, 12000) },
          ],
        }),
      })
      if (!r.ok) return json(res, 502, { error: 'Chat failed.' })
      const data = await r.json()
      return json(res, 200, { content: data.choices?.[0]?.message?.content ?? '' })
    }

    return json(res, 400, { error: 'Unknown task.' })
  } catch {
    return json(res, 502, { error: 'Upstream call failed.' })
  }
}
