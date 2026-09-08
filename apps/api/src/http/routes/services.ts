/**
 * What the route handlers may reach. Wired by the composition root; read by every route file.
 * Kept apart from the route index so the route files and the index do not import each other.
 */
import type { HealthResponse, OpenApiDocument } from '@dhan/contracts'
import type { AdvisoryService } from '../../application/advisory.service.ts'
import type { AvatarSessionService } from '../../application/avatar/avatar-session.service.ts'
import type { ConversationService } from '../../application/conversation.service.ts'
import type { DecisionService } from '../../application/decision.service.ts'
import type { RecordService } from '../../application/record.service.ts'
import type { SeedInfo } from '../../application/seed-info.ts'
import type { SessionService } from '../../application/session.service.ts'
import type { BankDataPort, ProductShelfPort } from '../../ports/index.ts'
import type { AaConsentService } from '../../application/aa-consent.service.ts'
import type { DeclaredProfileStore } from '../../ports/declared-profile.port.ts'
import type { HoldingsStore } from '../../ports/holdings.port.ts'

export interface AppServices {
  bank: BankDataPort
  /** The declared half of a profile: the facts no bank endpoint carries. */
  profiles: DeclaredProfileStore
  /** What a customer already owns, which IDBI has no endpoint for. */
  holdings: HoldingsStore
  /** The Account Aggregator consent flow: the only path to another bank's accounts. */
  aaConsent: AaConsentService
  shelf: ProductShelfPort
  sessions: SessionService
  advisory: AdvisoryService
  decisions: DecisionService
  conversation: ConversationService
  records: RecordService
  avatar: AvatarSessionService
  seed: SeedInfo
  health: () => Promise<HealthResponse>
  openapi: OpenApiDocument
}
