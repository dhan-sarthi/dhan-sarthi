// Memory, server-side.
//
// Same pipeline as the client prototype — summarise, extract topics and felt tone, screen
// against a block-list, embed, store — but the store is now Postgres rather than the
// browser, because a bank's memory of a customer has to be auditable and revocable.
//
// Ranking stays in JS rather than SQL. pgvector can do the cosine search, but recency decay
// and topic-overlap weighting are product decisions that should be readable, not buried in
// an ORDER BY. At sandbox scale the difference is immaterial.

import { randomUUID } from 'node:crypto'
import { query, toVector } from './db.js'
import { chat, embed } from './providers/llm.js'

/** Categories that must never be stored, whatever the model decides is relevant. */
export const NEVER_REMEMBER = [
  'health', 'medical', 'illness', 'diagnosis', 'disability', 'pregnancy', 'mental-health',
  'caste', 'religion', 'politics', 'ethnicity',
  'sexuality', 'sexual-orientation', 'gender-identity',
  'legal-trouble', 'criminal', 'litigation',
  'credentials', 'password', 'otp', 'pin', 'account-number', 'card-number',
  'third-party-finances',
]

const IDENTIFIER_PATTERNS = [
  /\b\d{12}\b/,                                   // Aadhaar-shaped
  /\b[A-Z]{5}\d{4}[A-Z]\b/,                       // PAN-shaped
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,   // card-shaped
  /\b(otp|password|pin)\b/i,
]

export function redact(text = '') {
  return String(text)
    .replace(/\b\d{12}\b/g, '[id]')
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, '[pan]')
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[card]')
}

export function isSafeToStore({ topics = [], summary = '' } = {}) {
  const blocked = topics.map((t) => String(t).toLowerCase()).filter((t) => NEVER_REMEMBER.includes(t))
  if (blocked.length) return { safe: false, reason: `blocked topic: ${blocked.join(', ')}` }
  if (IDENTIFIER_PATTERNS.some((re) => re.test(summary))) {
    return { safe: false, reason: 'summary contains identifier-like text' }
  }
  return { safe: true }
}

const EXTRACTION_PROMPT = `You process a conversation between a person and their financial coach,
and produce what is worth remembering for next time.

Return JSON only, matching exactly:
{
  "summary": "one or two sentences, third person, specific. Include commitments made and amounts agreed.",
  "topics": ["lowercase-kebab-case", "max 4"],
  "emotionalTone": "one of: anxious, motivated, frustrated, hopeful, resigned, proud, neutral",
  "commitment": null | { "what": "...", "amount": <number|null>, "cadence": "monthly|one-off|null" },
  "worthRemembering": true | false
}

Rules:
- Remember commitments, goals, life events affecting money, stated preferences, and their
  reasons for hesitating. These are what make the next conversation feel continuous.
- Do NOT remember: health, medical or disability details; caste, religion, politics; sexuality;
  legal trouble; other people's finances; any password, OTP, PIN, PAN, Aadhaar or card number.
  If the conversation is mainly about any of those, set worthRemembering to false.
- Do NOT remember pleasantries, small talk, or anything already obvious from account data.
- Topics describe the subject, never the person. "sip-increase", not "irresponsible".`

export function transcriptToText(transcript) {
  if (!Array.isArray(transcript)) return String(transcript || '')
  return transcript
    .map((t) => `${t.role === 'assistant' ? 'Coach' : 'Person'}: ${t.text}`)
    .join('\n')
}

/** Extract a memory, or null when there is nothing worth keeping — which is the common case. */
export async function extract(transcript) {
  const text = transcriptToText(transcript)
  if (text.trim().length < 40) return null

  const { content } = await chat({
    system: EXTRACTION_PROMPT,
    user: redact(text).slice(0, 8000),
    json: true,
  })

  let parsed
  try { parsed = JSON.parse(content) } catch { return null }
  if (!parsed?.worthRemembering || !parsed.summary) return null

  const guard = isSafeToStore(parsed)
  if (!guard.safe) return { discarded: guard.reason }

  return {
    summary: redact(parsed.summary),
    topics: (parsed.topics || []).slice(0, 4).map((t) => String(t).toLowerCase()),
    emotionalTone: parsed.emotionalTone || 'neutral',
    commitment: parsed.commitment || null,
  }
}

export async function remember(customerId, transcript) {
  const extracted = await extract(transcript)
  if (!extracted) return { stored: false, reason: 'nothing worth remembering' }
  if (extracted.discarded) return { stored: false, reason: extracted.discarded }

  const embedding = await embed(
    `${extracted.summary}\nTopics: ${extracted.topics.join(', ')}\nFeeling: ${extracted.emotionalTone}`,
  )

  const id = randomUUID()
  await query(
    `INSERT INTO memories (id, customer_id, text, topics, emotional_tone, commitment, embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, customerId, extracted.summary, extracted.topics, extracted.emotionalTone,
     extracted.commitment ? JSON.stringify(extracted.commitment) : null, toVector(embedding)],
  )
  return { stored: true, id, ...extracted }
}

/** Half-life of 60 days, floored so nothing important disappears entirely. */
export function recencyWeight(createdAt, now = Date.now()) {
  const days = Math.max(0, (now - new Date(createdAt).getTime()) / 86_400_000)
  return 0.55 + 0.45 * Math.pow(0.5, days / 60)
}

export function whenLabel(createdAt, now = Date.now()) {
  const days = Math.floor((now - new Date(createdAt).getTime()) / 86_400_000)
  if (days <= 0) return 'earlier today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  if (days < 45) return `${Math.round(days / 7)} weeks ago`
  if (days < 400) return `${Math.round(days / 30)} months ago`
  return 'a while back'
}

export async function recall(customerId, queryText, { topics = [], limit = 5, minScore = 0.25 } = {}) {
  const embedding = await embed(queryText)
  // Pull a wider candidate set by pure similarity, then apply the product weighting in JS.
  const { rows } = await query(
    `SELECT id, text, topics, emotional_tone, commitment, created_at,
            1 - (embedding <=> $2) AS similarity
       FROM memories
      WHERE customer_id = $1 AND embedding IS NOT NULL
      ORDER BY embedding <=> $2
      LIMIT $3`,
    [customerId, toVector(embedding), limit * 4],
  )

  const active = new Set(topics.map((t) => String(t).toLowerCase()))
  const now = Date.now()
  return rows
    .map((r) => {
      const overlap = (r.topics || []).filter((t) => active.has(String(t).toLowerCase())).length
      const contextBoost = active.size ? Math.min(0.15, overlap * 0.05) : 0
      return {
        id: r.id, text: r.text, topics: r.topics, emotionalTone: r.emotional_tone,
        commitment: r.commitment, createdAt: r.created_at,
        similarity: Number(r.similarity),
        score: Number(r.similarity) * recencyWeight(r.created_at, now) + contextBoost,
        whenLabel: whenLabel(r.created_at, now),
      }
    })
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export async function openCommitments(customerId) {
  const { rows } = await query(
    `SELECT commitment, created_at FROM memories
      WHERE customer_id = $1 AND commitment IS NOT NULL
      ORDER BY created_at DESC LIMIT 10`,
    [customerId],
  )
  return rows.map((r) => ({ ...r.commitment, since: r.created_at, whenLabel: whenLabel(r.created_at) }))
}

/** Consent revocation has to actually delete something, or it is theatre. */
export async function forgetAll(customerId) {
  const { rowCount } = await query('DELETE FROM memories WHERE customer_id = $1', [customerId])
  return { deleted: rowCount }
}

export const listMemories = async (customerId) => (
  await query(
    `SELECT id, text, topics, emotional_tone, commitment, created_at
       FROM memories WHERE customer_id = $1 ORDER BY created_at DESC`,
    [customerId],
  )
).rows
