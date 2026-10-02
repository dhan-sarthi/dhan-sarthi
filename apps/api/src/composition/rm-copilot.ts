/**
 * Owned by the copilot builder.
 *
 * The one place the RM copilot is wired: its own language model, and the service the brief and
 * ask routes read. `root.ts` calls `copilotModel` while it builds `Deps` (so a test can replace
 * the model with a fake through `RootOptions.deps.copilotModel`) and `wireRmCopilot` once the
 * book and the activity service exist; it never names a copilot class itself.
 *
 * The model is a second instance, never the text tier's: its own circuit breaker, its own
 * deadline and its own output cap (`RM_COPILOT_*` in config.ts), so a brief that times out can
 * open the console's breaker and leave the customer's `/ask` untouched. It shares the key and
 * the `TEXT_MODEL_ENABLED` kill switch, and with either missing it is the null model and the
 * copilot answers from the rules.
 */
import { NoLanguageModel } from '../adapters/null/language-model.null.ts'
import { OpenAiChatModel } from '../adapters/openai/chat.openai.ts'
import { RmCopilotService } from '../application/rm/copilot.service.ts'
import type { RmAccessLog } from '../application/rm/access-log.ts'
import type { RmActivityService } from '../application/rm/activity.service.ts'
import type { RmBookService } from '../application/rm/book.service.ts'
import { textModelIsLive } from '../config.ts'
import type { Config } from '../config.ts'
import type { Logger } from '../infra/logger.ts'
import type { Clock, LanguageModelPort, ProductShelfPort } from '../ports/index.ts'

export function copilotModel(config: Config, log: Logger): LanguageModelPort {
  if (!textModelIsLive(config)) return new NoLanguageModel()
  return new OpenAiChatModel({
    apiKey: config.OPENAI_API_KEY ?? '',
    model: config.RM_COPILOT_MODEL ?? config.OPENAI_MODEL,
    baseUrl: config.OPENAI_API_BASE,
    timeoutMs: config.RM_COPILOT_TIMEOUT_MS,
    maxOutputTokens: config.RM_COPILOT_MAX_OUTPUT_TOKENS,
    temperature: config.OPENAI_TEMPERATURE,
    log,
  })
}

export interface RmCopilotWiringContext {
  config: Config
  log: Logger
  clock: Clock
  /** The copilot's own instance, from `copilotModel` or a test's fake. */
  model: LanguageModelPort
  shelf: ProductShelfPort
  book: RmBookService
  activity: RmActivityService
  accessLog: RmAccessLog
}

export function wireRmCopilot(ctx: RmCopilotWiringContext): RmCopilotService {
  return new RmCopilotService({
    book: ctx.book,
    activity: ctx.activity,
    accessLog: ctx.accessLog,
    shelf: ctx.shelf,
    model: ctx.model,
    clock: ctx.clock,
    log: ctx.log,
  })
}
