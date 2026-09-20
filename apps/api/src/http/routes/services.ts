/**
 * What the route handlers may reach. Wired by the composition root; read by every route file.
 * Kept apart from the route index so the route files and the index do not import each other.
 *
 * Almost every member is an application module, and that is the point: the rule a route serves
 * belongs behind one, so the handler is a translation from HTTP and back. `bank`, `profiles`,
 * `holdings`, `mappingReport` and `seed` used to be ports here and are not any more — each one
 * grew the module the handler had been standing in for.
 *
 * Two ports are left, on purpose, and a third would need the same argument made in writing:
 *
 * - `avatarTools` is the tool gate's public front door. There is no rule to put behind it that
 *   is not already in the adapter: it answers "may this request be answered, and by which
 *   handler", the provider chooses the implementation once in the composition root, and
 *   ADR-0013 §4 records why the route exists under every provider. The handler's own job is
 *   the outcome-to-status mapping, which is HTTP translation and belongs in http/.
 * - `shelf` is a catalogue read with no rule attached — `getShelf` has no parameters and no
 *   filtering. A module between the handler and the port would be a pass-through today: delete
 *   it and nothing reappears anywhere. It earns one the moment the route takes a query, and
 *   that is the change to watch for rather than pre-empt.
 *
 * What stops the list growing back quietly is `route-handlers-do-not-name-ports` in
 * .dependency-cruiser.cjs: a handler file may not import from ports/ at all, so a port can
 * only arrive here, in the one file a reviewer reads to see the surface.
 */
import type { HealthResponse, OpenApiDocument } from '@dhan/contracts'
import type { AdvisoryService } from '../../application/advisory.service.ts'
import type { AvatarSessionService } from '../../application/avatar/avatar-session.service.ts'
import type { ChallengeService } from '../../application/challenge.service.ts'
import type { ConversationService } from '../../application/conversation.service.ts'
import type { DecisionService } from '../../application/decision.service.ts'
import type { HistoryService } from '../../application/history.service.ts'
import type { HoldingsView } from '../../application/holdings-view.ts'
import type { LedgerQuery } from '../../application/ledger-query.ts'
import type { OperatorService } from '../../application/operator.service.ts'
import type { ProfileService } from '../../application/profile.service.ts'
import type { RecordService } from '../../application/record.service.ts'
import type { SaveService } from '../../application/save.service.ts'
import type { SessionService } from '../../application/session.service.ts'
import type { AvatarToolWebhook, ProductShelfPort } from '../../ports/index.ts'
import type { AaConsentService } from '../../application/aa-consent.service.ts'

export interface AppServices {
  /** The statement, paged: the asOf clamp, the ordering and the cursor live behind this. */
  ledger: LedgerQuery
  /** What the customer owns, and the only place the app's own portfolio can be edited. */
  holdingsView: HoldingsView
  /** The declared half of a profile, and what the app is still waiting on the customer for. */
  profile: ProfileService
  /** The two operator reads that go to the bank. */
  operator: OperatorService
  /** The Account Aggregator consent flow: the only path to another bank's accounts. */
  aaConsent: AaConsentService
  /** The months of use laid down behind a session at creation. */
  history: HistoryService
  shelf: ProductShelfPort
  sessions: SessionService
  advisory: AdvisoryService
  /** The savings pot, which accrues on read: every call through it may write the session. */
  save: SaveService
  /** The one spending challenge that can be running, and the wizard behind the next one. */
  challenges: ChallengeService
  decisions: DecisionService
  conversation: ConversationService
  records: RecordService
  avatar: AvatarSessionService
  /** The gate's public front door, used only by providers that call tools over HTTP. */
  avatarTools: AvatarToolWebhook
  health: () => Promise<HealthResponse>
  openapi: OpenApiDocument
}
