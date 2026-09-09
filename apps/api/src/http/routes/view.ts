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
    accounts: v.accounts,
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
  r(routeById('getView'), async ({ session, log }) => {
    const view = await s.advisory.view(session)
    const { snapshot, roadmap, ms } = view.timing
    // Where the snapshot came from and whether a version was cut are the two facts that
    // explain a slow or a surprising view; they go on the log line and, as Server-Timing, to
    // anyone with curl.
    log.info({ asOf: session.asOf, snapshot, roadmap, ms }, 'view')
    return reply(toWireView(view), {
      etag: `"${view.meta.snapshotId}:${view.meta.roadmapVersion}"`,
      headers: {
        'Server-Timing': `snapshot;desc=${snapshot}, roadmap;desc=${roadmap}, view;dur=${ms}`,
      },
    })
  })
}
