/**
 * The RPC host when there is no provider to host for. Legal only beside `NullAvatarProvider`:
 * the composition root refuses to start a real provider with this host, because a session the
 * gate cannot join is a session that must never be issued.
 */
import { AvatarProviderError } from '../../application/avatar/provider-error.ts'
import type { AvatarCredential, AvatarRpcHost, RpcHandle, ToolHandlers } from '../../ports/index.ts'

export class NullRpcHost implements AvatarRpcHost {
  async open(
    _runwaySessionId: string,
    _cred: AvatarCredential,
    _handlers: ToolHandlers,
  ): Promise<RpcHandle> {
    throw new AvatarProviderError('not_configured', 'No RPC host is configured.')
  }

  async close(_handle: RpcHandle): Promise<void> {}

  openCount(): number {
    return 0
  }
}
