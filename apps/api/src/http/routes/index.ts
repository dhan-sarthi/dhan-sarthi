/**
 * Every route in the registry, registered. One group per contracts file, all through the same
 * registrar, so the no-undeclared-route test has nothing to find.
 */
import type { FastifyInstance } from 'fastify'
import { makeRegistrar } from '../register.ts'
import type { RegisterDeps } from '../register.ts'
import { actionRoutes } from './actions.ts'
import { askRoutes } from './ask.ts'
import { avatarRoutes } from './avatar.ts'
import { customerRoutes } from './customers.ts'
import { healthRoutes } from './health.ts'
import { operatorRoutes } from './operator.ts'
import { recordRoutes } from './record.ts'
import { rulesRoutes } from './rules.ts'
import type { AppServices } from './services.ts'
import { sessionRoutes } from './session.ts'
import { sessionsRoutes } from './sessions.ts'
import { consentAaRoutes } from './consent-aa.ts'
import { holdingsRoutes } from './holdings.ts'
import { profileRoutes } from './profile.ts'
import { shelfRoutes } from './shelf.ts'
import { suitabilityRoutes } from './suitability.ts'
import { transactionRoutes } from './transactions.ts'
import { viewRoutes } from './view.ts'

export type { AppServices } from './services.ts'

export function registerAllRoutes(
  app: FastifyInstance,
  deps: RegisterDeps,
  services: AppServices,
): void {
  const r = makeRegistrar(app, deps)
  healthRoutes(r, services)
  customerRoutes(r, services)
  sessionsRoutes(r, services)
  sessionRoutes(r, services)
  viewRoutes(r, services)
  transactionRoutes(r, services)
  actionRoutes(r, services)
  suitabilityRoutes(r, services)
  askRoutes(r, services)
  recordRoutes(r, services)
  shelfRoutes(r, services)
  profileRoutes(r, services)
  holdingsRoutes(r, services)
  consentAaRoutes(r, services)
  rulesRoutes(r, services)
  avatarRoutes(r, services)
  operatorRoutes(r, services)
}
