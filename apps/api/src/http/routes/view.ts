import { routeById } from '@dhan/contracts'
import type { View } from '@dhan/contracts'
import type { ServerView } from '../../application/advisory.service.ts'
import { reply } from '../register.ts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

/** The wire View: the server-side extras stay behind. */
export function toWireView(v: ServerView): View {
  return {
    snapshot: v.snapshot,
    goal: v.goal,
    roadmap: v.roadmap,
    plan: v.plan,
    insights: v.insights,
    shelf: v.shelf,
    rules: v.rules,
    meta: v.meta,
  }
}

export function viewRoutes(r: Registrar, s: AppServices): void {
  r(routeById('getView'), async ({ session }) => {
    const view = await s.advisory.view(session)
    return reply(toWireView(view), {
      etag: `"${view.meta.snapshotId}:${view.meta.roadmapVersion}"`,
    })
  })
}
