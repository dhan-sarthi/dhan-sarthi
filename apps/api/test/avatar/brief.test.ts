/**
 * The brief fits Runway's limits for every persona at every clock position a judge reaches,
 * and every rupee figure in it is a figure the snapshot holds.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PERSONAS } from '@dhan/fixtures'
import {
  PERSONALITY_MAX,
  START_SCRIPT_MAX,
  buildBrief,
} from '../../src/application/avatar/brief.builder.ts'
import type { Session } from '../../src/ports/index.ts'
import { CLOCK_POSITIONS, makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

describe('the personality brief', () => {
  let root: TestRoot

  before(async () => {
    root = await makeRoot()
  })
  after(() => root.close())

  it('stays inside the provider caps for every persona at six clock positions', async () => {
    for (const spec of PERSONAS) {
      const { session } = await root.services.sessions.create(spec.customer.cif)
      for (const asOf of CLOCK_POSITIONS) {
        const at: Session = { ...session, asOf }
        const view = await root.services.advisory.view(at)
        const brief = buildBrief(view, [], view.shelfProducts)

        assert.ok(brief.personality.length <= PERSONALITY_MAX, `${spec.slug} @ ${asOf}`)
        assert.ok(brief.startScript.length <= START_SCRIPT_MAX, `${spec.slug} @ ${asOf}`)
        assert.ok(brief.personality.includes('check_suitability'))
        assert.ok(brief.personality.includes('LIC_ULIP_401'))
        assert.ok(brief.startScript.includes(spec.customer.custName.split(' ')[0] ?? ''))

        // Every rupee figure the brief states is one the View holds — as a number, or inside a
        // sentence the engine itself wrote (a stage's "why", the action's detail).
        const known = new Set<number>()
        const collect = (value: unknown): void => {
          if (typeof value === 'number') known.add(Math.round(value))
          else if (typeof value === 'string') {
            for (const m of value.matchAll(/₹([\d,]+)/g)) {
              known.add(Number((m[1] ?? '').replace(/,/g, '')))
            }
          } else if (Array.isArray(value)) value.forEach(collect)
          else if (value && typeof value === 'object') Object.values(value).forEach(collect)
        }
        collect(view.snapshot)
        collect(view.plan)
        collect(view.goal)
        collect(view.roadmap)
        // The shelf lines quote product names as they are ("₹1 crore cover").
        collect(view.shelf)
        for (const match of brief.personality.matchAll(/₹([\d,]+)/g)) {
          const figure = Number((match[1] ?? '').replace(/,/g, ''))
          assert.ok(known.has(figure), `${spec.slug} @ ${asOf}: ₹${figure} is not in the View`)
        }
      }
    }
  })

  it('carries what the customer decided last time', async () => {
    const { session } = await root.services.sessions.create(PERSONAS[0]?.customer.cif ?? '')
    const view = await root.services.advisory.view(session)
    const brief = buildBrief(
      view,
      [
        {
          id: 'd1',
          sessionId: session.id,
          adviceRecordId: null,
          actionId: 'a',
          actionKind: 'start_sip',
          kind: 'declined',
          amount: 10_000,
          productId: null,
          shown: 'Start ₹10,000 a month',
          evidence: [],
          note: 'Not this month',
          atSim: '2026-09-01',
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      view.shelfProducts,
    )
    assert.match(brief.personality, /declined "Start ₹10,000 a month" and said: "Not this month"/)
  })
})
