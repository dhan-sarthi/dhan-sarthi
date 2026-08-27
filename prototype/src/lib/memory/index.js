// Dhan Sarthi's memory — public interface.
//
//   remember(customerId, transcript)  after a conversation ends
//   recall(customerId, query, opts)   before the next one starts
//   forget / forgetAll                because consent has to be revocable to be real
//
// Everything degrades to "no memory" rather than throwing. A failed embedding call must
// never take down a voice session mid-demo.

import * as store from './store.js'
import { extractMemory, embed } from './extract.js'

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`)

/**
 * Process a finished conversation and store what matters.
 * Returns the stored memory, or null when there was nothing worth keeping.
 */
export async function remember(customerId, transcript, { signal } = {}) {
  try {
    const extracted = await extractMemory(transcript, { signal })
    if (!extracted) return null

    // Embed summary plus topics and felt tone together — Cleo's approach, and it means a
    // later query about anxiety surfaces the anxious conversation even when the words differ.
    const embedding = await embed(
      `${extracted.summary}\nTopics: ${extracted.topics.join(', ')}\nFeeling: ${extracted.emotionalTone}`,
      { signal },
    )

    const memory = {
      id: uid(),
      customerId,
      text: extracted.summary,
      topics: extracted.topics,
      emotionalTone: extracted.emotionalTone,
      commitment: extracted.commitment,
      embedding,
      createdAt: Date.now(),
    }
    await store.put(memory)
    return memory
  } catch (err) {
    console.warn('[memory] remember failed, continuing without:', err.message)
    return null
  }
}

/**
 * Retrieve the memories most worth having in mind for what is being discussed now.
 * Safe to call before every session; returns [] on any failure.
 */
export async function recall(customerId, query, { topics = [], limit = 5, signal } = {}) {
  try {
    const memories = await store.all(customerId)
    if (!memories.length) return []
    const queryEmbedding = await embed(query, { signal })
    return store.rank(memories, queryEmbedding, { topics, limit })
  } catch (err) {
    console.warn('[memory] recall failed, continuing without:', err.message)
    return []
  }
}

/** Open commitments, newest first — what the future self follows up on. */
export async function openCommitments(customerId) {
  try {
    const memories = await store.all(customerId)
    return memories
      .filter((m) => m.commitment?.what)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((m) => ({ ...m.commitment, since: m.createdAt, whenLabel: store.whenLabel(m.createdAt) }))
  } catch {
    return []
  }
}

export const forget = store.remove
export const forgetAll = store.clear
export const listMemories = store.all
