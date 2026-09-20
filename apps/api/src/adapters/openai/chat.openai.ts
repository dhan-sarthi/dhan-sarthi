/**
 * OpenAI Chat Completions, behind `LanguageModelPort`.
 *
 * Deliberately the smallest thing that works: one POST, one deadline, one breaker, no SDK. The
 * API has no state we want and the port has one method, so a dependency would only add a
 * version to keep current.
 *
 * Three things this refuses to do, each because the text tier is the tier that has to keep
 * working:
 *
 *   - **It never throws.** Every failure — no key, a 429, a hung socket, a refusal, an empty
 *     choice — comes back as `null`, and the caller answers from the rules instead. The tier
 *     with no model is a shipped product, not a degraded one, so falling back to it costs
 *     nothing but the phrasing.
 *   - **It never retries.** A customer is waiting on this sentence. A second attempt buys a
 *     better sentence at the price of the only thing the deterministic answer already had.
 *   - **It never logs the prompt.** The prompt carries this customer's income, balances and
 *     debts. Failures log the status and the model id; the body stays out of the log.
 *
 * `max_completion_tokens` rather than `max_tokens`: the GPT-5 family rejects the older spelling
 * outright, and the 4-series accepts both.
 */
import { CircuitBreaker } from '../../infra/circuit.ts'
import type { Logger } from '../../infra/logger.ts'
import { isTimeout, withTimeout } from '../../infra/timeout.ts'
import type { ChatMessage, LanguageModelPort } from '../../ports/index.ts'

export interface OpenAiChatOptions {
  apiKey: string
  /** The model id, verbatim. Never defaulted here — config owns that choice. */
  model: string
  baseUrl: string
  timeoutMs: number
  maxOutputTokens: number
  temperature: number
  log: Logger
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[]
}

export class OpenAiChatModel implements LanguageModelPort {
  readonly name: string
  readonly live = true
  private readonly opts: OpenAiChatOptions
  private readonly breaker = new CircuitBreaker()

  constructor(options: OpenAiChatOptions) {
    this.opts = options
    this.name = `openai:${options.model}`
  }

  async complete(messages: readonly ChatMessage[]): Promise<string | null> {
    const { apiKey, model, baseUrl, timeoutMs, maxOutputTokens, temperature, log } = this.opts
    try {
      return await this.breaker.exec(
        () =>
          withTimeout(
            async (signal) => {
              const res = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                signal,
                headers: {
                  'content-type': 'application/json',
                  authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                  model,
                  messages,
                  temperature,
                  max_completion_tokens: maxOutputTokens,
                }),
              })
              if (!res.ok) {
                // Read and discard: the body names the model and the quota, never the prompt,
                // but it is not worth the risk of a provider echoing a message back into a log.
                await res.text().catch(() => '')
                log.warn({ model, status: res.status }, 'text model refused the request')
                // Thrown so the breaker counts it. The catch below turns it back into null.
                throw new Error(`openai ${res.status}`)
              }
              const body = (await res.json()) as ChatCompletion
              const choice = body.choices?.[0]?.message
              if (choice?.refusal) {
                log.warn({ model }, 'text model refused to answer')
                return null
              }
              const text = choice?.content?.trim()
              return text && text.length > 0 ? text : null
            },
            timeoutMs,
            `openai ${model}`,
          ),
        // Always a probe, so the first call after the open window is the one that closes it.
        { probe: true },
      )
    } catch (err) {
      if (isTimeout(err)) log.warn({ model, timeoutMs }, 'text model timed out')
      return null
    }
  }
}
