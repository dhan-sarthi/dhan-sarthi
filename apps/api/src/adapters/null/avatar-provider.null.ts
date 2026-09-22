/**
 * The avatar provider when there is none: `AVATAR_PROVIDER=none` or the `AVATAR_ENABLED=false`
 * kill switch. Every call fails with `not_configured`, which the session service turns into the
 * honest 503 and the text tier. Nothing is ever billed through this class.
 */
import type { BreakerState, ConversationTurn } from '@dhan/contracts'
import { AvatarProviderError } from '../../application/avatar/provider-error.ts'
import type {
  AvatarCredential,
  AvatarProvider,
  AvatarSessionOptions,
  IssuedGrant,
} from '../../ports/index.ts'

const refuse = (): never => {
  throw new AvatarProviderError(
    'not_configured',
    'The voice service is not configured in this build.',
  )
}

export class NullAvatarProvider implements AvatarProvider {
  async probe(_cred: AvatarCredential): Promise<{ ok: boolean; character: string | null }> {
    return { ok: false, character: null }
  }

  async credits(_cred: AvatarCredential): Promise<number | null> {
    return null
  }

  async sessionsLeftToday(_cred: AvatarCredential): Promise<number | null> {
    return null
  }

  async createSession(
    _cred: AvatarCredential,
    _opts: AvatarSessionOptions,
  ): Promise<{ runwaySessionId: string }> {
    return refuse()
  }

  async awaitIssuable(
    _cred: AvatarCredential,
    _id: string,
    _opts: { timeoutMs: number },
  ): Promise<void> {
    return refuse()
  }

  async issueGrant(_cred: AvatarCredential, _id: string): Promise<IssuedGrant> {
    return refuse()
  }

  async cancel(_cred: AvatarCredential, _id: string, _opts?: { graceMs?: number }): Promise<void> {
    return refuse()
  }

  async getConversation(_cred: AvatarCredential, _id: string): Promise<ConversationTurn[] | null> {
    return null
  }

  breakerState(_cred?: AvatarCredential): BreakerState {
    return 'closed'
  }
}
