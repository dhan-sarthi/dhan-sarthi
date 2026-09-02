/**
 * Deterministic randomness.
 *
 * Every number in the app is derived from the ledger, so the ledger has to be reproducible or
 * nothing downstream can be tested and no two runs of the demo are the same. Same seed, same
 * ledger, always — including on a different machine, which rules out Math.random entirely.
 *
 * mulberry32: 32-bit state, fast, and good enough for synthetic spending. Not for anything
 * that needs cryptographic randomness.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number
  /** True with probability p. */
  chance(p: number): boolean
  /** A uniform element. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T
  /** A weighted element. Weights need not sum to anything in particular. */
  weighted<T>(items: readonly (readonly [T, number])[]): T
  /** `base` scaled by ±pct, rounded to the nearest rupee. */
  jitter(base: number, pct: number): number
  /** Roughly normal via the mean of three uniforms. Keeps spending off a flat distribution. */
  normalish(): number
  /** A distinct stream derived from this one, so adding a caller cannot shift another's draws. */
  fork(label: string): Rng
}

function hash(label: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < label.length; i += 1) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0
  }
  return h >>> 0
}

export function rng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const self: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() on an empty list')
      const item = items[Math.floor(next() * items.length)]
      // noUncheckedIndexedAccess cannot see that the index is in range.
      return item as NonNullable<typeof item>
    },
    weighted: (items) => {
      if (items.length === 0) throw new Error('weighted() on an empty list')
      const total = items.reduce((sum, [, w]) => sum + w, 0)
      let roll = next() * total
      for (const [value, weight] of items) {
        roll -= weight
        if (roll <= 0) return value
      }
      const last = items[items.length - 1]
      return (last as NonNullable<typeof last>)[0]
    },
    jitter: (base, pct) => Math.round(base * (1 + (next() * 2 - 1) * pct)),
    normalish: () => (next() + next() + next()) / 3,
    fork: (label) => rng(hash(label, state)),
  }

  return self
}
