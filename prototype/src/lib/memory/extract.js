// Turning a conversation into something worth remembering.
//
// Cleo's described pipeline: summarise the conversation, pull out key topics, read the
// emotional tone, and — the part most people skip — use those topics to decide what should
// *not* be stored at all. We keep that shape and harden the last step, because under DPDP a
// bank storing the wrong inference about a customer is a different order of problem than a
// consumer app doing it.

const ENDPOINT = '/api/llm'

/**
 * Topics that must never reach the vector store, however relevant they seem.
 *
 * Two reasons. Legally, several of these are sensitive personal data and we hold consent for
 * wealth advisory, not for this. Practically, a future self that remembers your medical
 * history is not reassuring, it is uncanny — and the moment a customer feels surveilled the
 * product is finished.
 */
export const NEVER_REMEMBER = [
  'health', 'medical', 'illness', 'diagnosis', 'disability', 'pregnancy', 'mental-health',
  'caste', 'religion', 'politics', 'ethnicity',
  'sexuality', 'sexual-orientation', 'gender-identity',
  'legal-trouble', 'criminal', 'litigation',
  'credentials', 'password', 'otp', 'pin', 'account-number', 'card-number',
  'third-party-finances',
]

const SENSITIVE_PATTERNS = [
  /\b\d{12}\b/,                      // Aadhaar-shaped
  /\b[A-Z]{5}\d{4}[A-Z]\b/,          // PAN-shaped
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // card-shaped
  /\b(otp|password|pin)\b/i,
]

export function isSafeToStore({ topics = [], summary = '' } = {}) {
  const blocked = topics.map((t) => String(t).toLowerCase()).filter((t) => NEVER_REMEMBER.includes(t))
  if (blocked.length) return { safe: false, reason: `blocked topic: ${blocked.join(', ')}` }
  const pattern = SENSITIVE_PATTERNS.find((re) => re.test(summary))
  if (pattern) return { safe: false, reason: 'summary contains identifier-like text' }
  return { safe: true }
}

/** Strip anything identifier-shaped before text is embedded or persisted. */
export function redact(text = '') {
  return String(text)
    .replace(/\b\d{12}\b/g, '[id]')
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, '[pan]')
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[card]')
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
- Do NOT remember pleasantries, small talk, or anything already obvious from their account data.
- Topics must describe the subject, never the person. "sip-increase", not "irresponsible".`

/**
 * Extract a memory from a transcript. Returns null when there is nothing worth keeping —
 * which is the common case and should be, since most exchanges are not memorable.
 */
export async function extractMemory(transcript, { signal } = {}) {
  const text = Array.isArray(transcript)
    ? transcript.map((t) => `${t.role === 'assistant' ? 'Coach' : 'Person'}: ${t.text}`).join('\n')
    : String(transcript || '')

  if (text.trim().length < 40) return null

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      task: 'chat',
      system: EXTRACTION_PROMPT,
      user: redact(text).slice(0, 8000),
      json: true,
    }),
  })
  if (!res.ok) throw new Error(`extraction failed: ${res.status}`)

  const { content } = await res.json()
  let parsed
  try { parsed = JSON.parse(content) } catch { return null }

  if (!parsed?.worthRemembering || !parsed.summary) return null

  const guard = isSafeToStore(parsed)
  if (!guard.safe) {
    console.info('[memory] discarded —', guard.reason)
    return null
  }

  return {
    summary: redact(parsed.summary),
    topics: (parsed.topics || []).slice(0, 4).map((t) => String(t).toLowerCase()),
    emotionalTone: parsed.emotionalTone || 'neutral',
    commitment: parsed.commitment || null,
  }
}

/** Embed text for storage or querying. */
export async function embed(text, { signal } = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ task: 'embed', input: redact(text).slice(0, 8000) }),
  })
  if (!res.ok) throw new Error(`embedding failed: ${res.status}`)
  const { embedding } = await res.json()
  return embedding
}
