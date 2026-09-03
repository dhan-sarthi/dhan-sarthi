/**
 * What an avatar provider throws. One class, one `kind`, so the session service maps it to a
 * tier without inspecting provider wording. Defined here rather than in an adapter because the
 * Runway, null and fake adapters all throw it and adapters may not import one another.
 */
import type { AvatarFailureKind, AvatarProviderFailure } from '../../ports/index.ts'

export class AvatarProviderError extends Error implements AvatarProviderFailure {
  override readonly name = 'AvatarProviderError' as const
  readonly kind: AvatarFailureKind
  readonly status?: number

  constructor(kind: AvatarFailureKind, message: string, status?: number) {
    super(message)
    this.kind = kind
    if (status !== undefined) this.status = status
  }
}

export function isAvatarProviderFailure(err: unknown): err is AvatarProviderFailure {
  return err instanceof Error && err.name === 'AvatarProviderError' && 'kind' in err
}
