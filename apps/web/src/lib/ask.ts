/**
 * The text tier behind Ask Uday: the deterministic engine, phrased by nobody.
 *
 * On the server it is `/ask`, `/ask/suggestions` and `/suitability/evaluate` — the same
 * `answer()` and `evaluate()` the avatar's tools call, so a reviewer who cannot get the one
 * live slot still gets the same sentences and the same refusal, and an advice record is still
 * written. Offline it is the same functions out of the lazy chunk, with nothing written.
 */
import type { Answer, AskSuggestions, Verdict } from '@dhan/contracts'
import { api } from '../api/client.ts'
import type { OfflineHandle } from './view.ts'

export interface AskBackend {
  suggestions: () => Promise<AskSuggestions>
  ask: (question: string) => Promise<Answer>
  /** The gate's verdict on a product at a monthly amount. */
  evaluate: (productId: string, amount: number) => Promise<Verdict>
}

export const serverAsk: AskBackend = {
  suggestions: () => api('askSuggestions'),
  ask: (question) => api('ask', { body: { question } }),
  evaluate: async (productId, amount) =>
    (await api('evaluateSuitability', { body: { productId, amount } })).verdict,
}

export function offlineAsk(handle: OfflineHandle): AskBackend {
  const { mod, state } = handle
  return {
    suggestions: async () => mod.suggestions(state),
    ask: async (question) => mod.ask(state, question),
    evaluate: async (productId, amount) => mod.evaluateProduct(state, productId, amount),
  }
}
