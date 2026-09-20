/**
 * No model. Wired whenever `OPENAI_API_KEY` is absent, which is the configuration the product
 * was built to survive: `/ask` answers from the rules, every figure is still real, and the only
 * thing missing is the phrasing.
 */
import type { LanguageModelPort } from '../../ports/index.ts'

export class NoLanguageModel implements LanguageModelPort {
  readonly name = 'none'
  readonly live = false

  async complete(): Promise<string | null> {
    return null
  }
}
