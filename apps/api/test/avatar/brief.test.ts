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

  /*
   * "Talk me through this" has to survive the whole way to the provider.
   *
   * The screen-side half of this handoff was dead for as long as it existed: `spend.tsx` pushed
   * the headline as a route param and the Uday tab never read it, so the button was an ordinary
   * deep link. Nothing failed, nothing was logged, and the feature simply did not work. These
   * assert the server half so that at least this end cannot rot the same way.
   */
  describe('an insight the customer tapped', () => {
    const TOPIC = '₹1,86,240 at 34.8% costs you ₹5,401 a month.'

    it('opens the call on that finding instead of the general greeting', async () => {
      const { session } = await root.services.sessions.create(PERSONAS[0]!.customer.cif)
      const view = await root.services.advisory.view(session)

      const withTopic = buildBrief(view, [], view.shelfProducts, TOPIC)
      assert.ok(withTopic.startScript.includes(TOPIC))
      assert.ok(withTopic.personality.includes(TOPIC))
      // The generic "is there something on your mind?" opener is what the topic replaces; a
      // customer who just asked a specific question must not be asked what they want.
      assert.doesNotMatch(withTopic.startScript, /something on your mind/)
    })

    it('falls back to the general opening when nothing was tapped', async () => {
      const { session } = await root.services.sessions.create(PERSONAS[0]!.customer.cif)
      const view = await root.services.advisory.view(session)

      for (const topic of [undefined, null]) {
        const brief = buildBrief(view, [], view.shelfProducts, topic)
        assert.match(brief.startScript, /something on your mind/)
      }
    })

    it('still fits the provider caps with a topic attached', async () => {
      const { session } = await root.services.sessions.create(PERSONAS[0]!.customer.cif)
      const view = await root.services.advisory.view(session)
      const brief = buildBrief(view, [], view.shelfProducts, 'x'.repeat(200))

      assert.ok(brief.personality.length <= PERSONALITY_MAX)
      assert.ok(brief.startScript.length <= START_SCRIPT_MAX)
    })
  })
})
