/**
 * The Runway credentials the API may spend. Runway's Tier 1 allows one live session per
 * account, so concurrency is the number of entries here — an env change, not a deploy.
 * Who holds which one lives in the LeaseStore, not in this class.
 */
import type { AvatarCredential } from '../../ports/index.ts'

export class CredentialPool {
  private readonly credentials: readonly AvatarCredential[]

  constructor(credentials: readonly AvatarCredential[]) {
    this.credentials = credentials
  }

  get size(): number {
    return this.credentials.length
  }

  list(): readonly AvatarCredential[] {
    return this.credentials
  }

  byLabel(label: string): AvatarCredential | null {
    return this.credentials.find((c) => c.label === label) ?? null
  }
}
