/**
 * Canonical JSON and sha256, the two primitives every hash in the system is built from.
 *
 * Three things are hashed and all three have to be reproducible years later by someone who
 * was not here: the inputs to a snapshot (so a cache hit is a proof of sameness, not a guess),
 * the snapshot itself (what an advice record cites), and the record chain. So the serialisation
 * is pinned: keys sorted at every depth, `undefined` dropped exactly as JSON.stringify drops it,
 * arrays in order, no whitespace. Both the memory and the Postgres audit stores call
 * `recordHash` with the same input shape, which is what makes `GET /record/verify` mean the
 * same thing under either.
 */
import { createHash } from 'node:crypto'
import type { AdviceRecord } from '@dhan/contracts'

export const GENESIS_HASH = '0'.repeat(64)

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v !== undefined) out[key] = sortKeys(v)
    }
    return out
  }
  return value
}

/** Deterministic JSON: same facts, same bytes, on any machine. */
export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

/** sha256 of the canonical form. */
export function hashOf(value: unknown): string {
  return sha256Hex(canonical(value))
}

/** The fields of an advice record that are chained. Everything but the hashes themselves. */
export type AdviceRecordHashInput = Omit<AdviceRecord, 'prevHash' | 'recordHash'>

/**
 * `record_hash = sha256(prev_hash ‖ canonical(row minus hashes))`.
 *
 * The previous hash is prepended as raw hex so a record cannot be moved to another position in
 * the chain without its own hash changing.
 */
export function recordHash(prevHash: string, row: AdviceRecordHashInput): string {
  return sha256Hex(prevHash + canonical(row))
}

/** The chained subset of a stored record, so a verifier hashes exactly what the writer did. */
export function adviceRecordHashInput(record: AdviceRecord): AdviceRecordHashInput {
  const { prevHash: _prev, recordHash: _own, ...rest } = record
  return rest
}
