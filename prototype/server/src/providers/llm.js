// The only module that talks to a model provider.
//
// Everything else calls chat() and embed() and does not care who answers. When IDBI's
// sandbox lands, this file changes and nothing else does — which is the whole point, because
// an Indian bank will want inference inside its own account and region rather than on a
// consumer API in another jurisdiction.
//
// Note on switching: text-embedding-3-small is 1536 dimensions, Titan Text Embeddings V2 is
// 1024. Changing embedding provider means a schema change and a re-embed of stored memories.
// Decide once, early.

const PROVIDER = process.env.LLM_PROVIDER || 'openai'

const OPENAI = {
  chatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini',
  embedModel: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
  key: () => process.env.OPENAI_API_KEY,
}

export const embeddingDimensions = 1536

export function configured() {
  if (PROVIDER === 'openai') return Boolean(OPENAI.key())
  return false
}

async function openaiChat({ system, user, json = false, maxTokens = 800, temperature = 0.2 }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI.key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI.chatModel,
      temperature,
      // Generous on purpose. A rival's entire demo truncates mid-sentence because reasoning
      // tokens ate their output budget.
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) throw new Error(`chat ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return { content: data.choices?.[0]?.message?.content ?? '', model: OPENAI.chatModel }
}

async function openaiEmbed(input) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI.key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OPENAI.embedModel, input }),
  })
  if (!res.ok) throw new Error(`embed ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return data.data?.[0]?.embedding ?? null
}

/** Mint a short-lived credential the browser can use to open a realtime voice session. */
export async function realtimeToken({ seconds = 600 } = {}) {
  const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI.key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds },
      session: { type: 'realtime', model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime' },
    }),
  })
  if (!res.ok) throw new Error(`token ${res.status}`)
  return res.json()
}

export async function chat(opts) {
  if (PROVIDER === 'openai') return openaiChat(opts)
  throw new Error(`unknown LLM_PROVIDER: ${PROVIDER}`)
}

export async function embed(input) {
  const text = String(input || '').slice(0, 8000)
  if (!text.trim()) throw new Error('embed: empty input')
  if (PROVIDER === 'openai') return openaiEmbed(text)
  throw new Error(`unknown LLM_PROVIDER: ${PROVIDER}`)
}
