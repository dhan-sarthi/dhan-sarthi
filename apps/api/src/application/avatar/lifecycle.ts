/**
 * The life of one avatar call, as a state machine rather than as a sequence of awaits.
 *
 * The transition that matters is `gated → granted`: `consume()` is one shot and hands the
 * browser its LiveKit credentials, so it may run only after the RPC host has joined the room.
 * Making that a thrown error rather than a code-review convention is how "an ungated session
 * is never issued" becomes something a test can prove.
 */
export type AvatarState =
  'claimed' | 'creating' | 'ready' | 'gated' | 'granted' | 'live' | 'ended' | 'reaped' | 'failed'

export const TRANSITIONS: Readonly<Record<AvatarState, readonly AvatarState[]>> = {
  claimed: ['creating', 'failed'],
  creating: ['ready', 'failed'],
  ready: ['gated', 'failed'],
  gated: ['granted', 'failed'],
  granted: ['live', 'ended', 'reaped', 'failed'],
  live: ['ended', 'reaped'],
  ended: [],
  reaped: [],
  failed: [],
}

export class IllegalTransition extends Error {
  readonly from: AvatarState
  readonly to: AvatarState

  constructor(from: AvatarState, to: AvatarState) {
    super(`avatar lifecycle: ${from} → ${to} is not a legal transition`)
    this.name = 'IllegalTransition'
    this.from = from
    this.to = to
  }
}

export class Lifecycle {
  private current: AvatarState

  constructor(initial: AvatarState = 'claimed') {
    this.current = initial
  }

  get state(): AvatarState {
    return this.current
  }

  canGo(next: AvatarState): boolean {
    return TRANSITIONS[this.current].includes(next)
  }

  to(next: AvatarState): void {
    if (!this.canGo(next)) throw new IllegalTransition(this.current, next)
    this.current = next
  }

  /** Move if legal, else stay. For teardown paths that may run from any state. */
  tryTo(next: AvatarState): boolean {
    if (!this.canGo(next)) return false
    this.current = next
    return true
  }

  /** The gate: consuming the session is legal from `gated` and nowhere else. */
  assertConsumable(): void {
    if (this.current !== 'gated') throw new IllegalTransition(this.current, 'granted')
  }

  get isTerminal(): boolean {
    return TRANSITIONS[this.current].length === 0
  }
}
