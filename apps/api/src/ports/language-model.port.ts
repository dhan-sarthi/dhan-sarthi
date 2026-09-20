/**
 * A model that writes sentences, and nothing else.
 *
 * The text tier's numbers come from `core/query.ts` and its product verdicts come from the
 * suitability rules; both run before anything here is called. What this port buys is the last
 * step only — turning figures that are already true into English that sounds like a person
 * said it, and answering the questions the rule set has no branch for.
 *
 * `complete` returns `null` rather than throwing, for the missing key and the failed call
 * alike, because the tier has a correct answer either way: the deterministic one. A model that
 * can take the conversation down with it has no business being in the path.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LanguageModelPort {
  /** What the boot log prints and what an answer's provenance names. `none` when unwired. */
  readonly name: string
  /** False for the null implementation, so a caller can skip building a prompt nobody reads. */
  readonly live: boolean
  complete(messages: readonly ChatMessage[]): Promise<string | null>
}
