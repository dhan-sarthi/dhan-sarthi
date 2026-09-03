/**
 * AvatarProvider over the Runway transport. Translates transport failures into the one error
 * kind the session service reads, and the provider's transcript into the turn shape the
 * reconciler reads. Nothing about Runway's wording leaks past this file.
 */
import type { BreakerState, ConversationTurn } from '@dhan/contracts'
import { AvatarProviderError } from '../../application/avatar/provider-error.ts'
import { BreakerOpenError } from '../../infra/circuit.ts'
import { isTimeout } from '../../infra/timeout.ts'
import type { AvatarCredential, AvatarProvider, AvatarSessionOptions } from '../../ports/index.ts'
import { RunwayError, type RunwayTransport } from './transport.ts'

function toProviderError(err: unknown): AvatarProviderError {
  if (err instanceof AvatarProviderError) return err
  if (err instanceof BreakerOpenError) return new AvatarProviderError('breaker_open', err.message)
  if (isTimeout(err)) return new AvatarProviderError('timeout', err.message)
  if (err instanceof RunwayError) {
    if (err.code === 'QUEUED') return new AvatarProviderError('queued', err.message, err.status)
    if (err.code === 'FAILED' || err.code === 'CANCELLED') {
      return new AvatarProviderError('failed', err.message, err.status)
    }
    if (err.code === 'NOT_READY') return new AvatarProviderError('timeout', err.message, err.status)
    return new AvatarProviderError('http', err.message, err.status)
  }
  return new AvatarProviderError('http', err instanceof Error ? err.message : String(err))
}

type Json = Record<string, unknown>

function asRecord(value: unknown): Json | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : null
}

/** One transcript turn, keeping what the reconciler reads and passing the rest through. */
function toTurn(raw: unknown): ConversationTurn | null {
  const turn = asRecord(raw)
  if (!turn) return null
  const text = turn['content'] ?? turn['text'] ?? ''
  const calls = Array.isArray(turn['toolCalls']) ? turn['toolCalls'] : null
  const results = Array.isArray(turn['toolResults']) ? turn['toolResults'] : null

  return {
    ...turn,
    role: String(turn['role'] ?? 'unknown'),
    text: typeof text === 'string' ? text : JSON.stringify(text),
    ...(calls
      ? {
          toolCalls: calls.map((c) => {
            const r = asRecord(c) ?? {}
            return {
              name: String(r['name'] ?? r['tool'] ?? ''),
              args: r['args'] ?? r['arguments'] ?? null,
            }
          }),
        }
      : {}),
    ...(results
      ? {
          toolResults: results.map((c) => {
            const r = asRecord(c) ?? {}
            return { name: String(r['name'] ?? r['tool'] ?? ''), result: r['result'] ?? r }
          }),
        }
      : {}),
  }
}

export class RunwayAvatarProvider implements AvatarProvider {
  private readonly transport: RunwayTransport

  constructor(transport: RunwayTransport) {
    this.transport = transport
  }

  async probe(cred: AvatarCredential): Promise<{ ok: boolean; character: string | null }> {
    try {
      const character = await this.transport.describeCharacter(cred)
      const name = character?.['name']
      return { ok: true, character: typeof name === 'string' ? name : null }
    } catch {
      return { ok: false, character: null }
    }
  }

  async createSession(
    cred: AvatarCredential,
    opts: AvatarSessionOptions,
  ): Promise<{ runwaySessionId: string }> {
    try {
      const runwaySessionId = await this.transport.createSession(cred, {
        personality: opts.personality,
        startScript: opts.startScript,
        tools: opts.tools,
        maxDuration: opts.maxSeconds,
      })
      return { runwaySessionId }
    } catch (err) {
      throw toProviderError(err)
    }
  }

  async waitUntilReady(
    cred: AvatarCredential,
    runwaySessionId: string,
    opts: { timeoutMs: number },
  ): Promise<{ sessionKey: string }> {
    try {
      return await this.transport.waitUntilReady(cred, runwaySessionId, opts)
    } catch (err) {
      throw toProviderError(err)
    }
  }

  async consume(
    runwaySessionId: string,
    sessionKey: string,
  ): Promise<{ url: string; token: string }> {
    try {
      return await this.transport.consumeSession(runwaySessionId, sessionKey)
    } catch (err) {
      throw toProviderError(err)
    }
  }

  async cancel(cred: AvatarCredential, runwaySessionId: string): Promise<void> {
    try {
      await this.transport.cancelSession(cred, runwaySessionId)
    } catch (err) {
      throw toProviderError(err)
    }
  }

  async getConversation(
    cred: AvatarCredential,
    runwaySessionId: string,
  ): Promise<ConversationTurn[] | null> {
    try {
      const body = await this.transport.getConversation(cred, runwaySessionId)
      const raw = body?.['transcript'] ?? asRecord(body?.['data'])?.['transcript'] ?? null
      if (!Array.isArray(raw) || raw.length === 0) return null
      const turns = raw.map(toTurn).filter((t): t is ConversationTurn => t !== null)
      return turns.length === 0 ? null : turns
    } catch (err) {
      throw toProviderError(err)
    }
  }

  breakerState(): BreakerState {
    return this.transport.breaker.state()
  }
}
