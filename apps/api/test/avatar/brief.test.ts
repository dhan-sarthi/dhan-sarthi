/**
 * The brief fits Runway's limits for every persona at every clock position a judge reaches,
 * and every rupee figure in it is a figure the snapshot holds.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openingRead, planAhead } from '@dhan/core'
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
        // The read Uday gives on a yes ends on the lead finding's headline, written by the engine.
        collect(view.insights)
        // The shelf lines quote product names as they are ("₹1 crore cover").
        collect(view.shelf)
        // A total said the way people say it ("about ₹52,000") is a View figure rounded to the
        // nearest thousand, and a price a day ("less than ₹33 a day") is a View figure over thirty
        // days, rounded up. Each is checked as the figure it came from.
        const rounded = new Set([...known].map((n) => Math.round(n / 1_000) * 1_000))
        const perDay = new Set([...known].map((n) => Math.ceil(n / 30)))
        for (const match of brief.personality.matchAll(/([Aa]bout )?₹([\d,]+)( a day)?/g)) {
          const figure = Number((match[2] ?? '').replace(/,/g, ''))
          assert.ok(
            known.has(figure) ||
              (match[1] !== undefined && rounded.has(figure)) ||
              (match[3] !== undefined && perDay.has(figure)),
            `${spec.slug} @ ${asOf}: ${match[0]} is not in the View`,
          )
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

    it('goes straight to that finding after the greeting', async () => {
      const { session } = await root.services.sessions.create(PERSONAS[0]!.customer.cif)
      const view = await root.services.advisory.view(session)

      const withTopic = buildBrief(view, [], view.shelfProducts, TOPIC)
      assert.ok(withTopic.personality.includes(TOPIC))
      assert.match(withTopic.personality, /go straight to what they asked about/)
      // A customer who just asked a specific question must not be offered the general read or
      // asked what they want; that is asking them twice.
      assert.doesNotMatch(withTopic.personality, /Would you like to hear it\?/)
      assert.doesNotMatch(withTopic.personality, /something on your mind/)
    })

    it('falls back to the general opening when nothing was tapped', async () => {
      const { session } = await root.services.sessions.create(PERSONAS[0]!.customer.cif)
      const view = await root.services.advisory.view(session)

      for (const topic of [undefined, null]) {
        const brief = buildBrief(view, [], view.shelfProducts, topic)
        assert.match(brief.personality, /Would you like to hear it\?/)
        assert.match(brief.personality, /something on their mind first/)
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

  /*
   * The opening is a conversation, not a speech.
   *
   * Uday used to say the whole diagnosis before the customer had spoken. Now he says hello, the
   * customer answers, he offers his read, and he gives it once they say yes. Runway speaks
   * `startScript` verbatim, so that has to be the greeting alone; everything after it lives in
   * the personality as instructions for the next turns.
   */
  describe('the opening', () => {
    it('greets by name and says nothing else until the customer answers', async () => {
      for (const spec of PERSONAS) {
        const { session } = await root.services.sessions.create(spec.customer.cif)
        const view = await root.services.advisory.view(session)
        const first = view.snapshot.customer.name.split(' ')[0]

        for (const topic of [null, '₹1,86,240 at 34.8% costs you ₹5,401 a month.']) {
          const brief = buildBrief(view, [], view.shelfProducts, topic)
          assert.equal(brief.startScript, `Hey ${first}!`, spec.slug)
          assert.match(brief.personality, /Wait for them to answer\./, spec.slug)
        }
      }
    })

    it('offers the read first, and gives it with its figures only after a yes', async () => {
      for (const spec of PERSONAS) {
        const { session } = await root.services.sessions.create(spec.customer.cif)
        const view = await root.services.advisory.view(session)
        const { personality } = buildBrief(view, [], view.shelfProducts)

        const offer = personality.indexOf('Would you like to hear it?')
        const yes = personality.indexOf('When they say yes')
        const ahead = planAhead(view.snapshot, view.roadmap, view.plan, view.shelfProducts)
        const read = personality.indexOf(openingRead(view.snapshot, { lead: ahead === null }))
        assert.ok(offer > 0 && yes > offer && read > yes, spec.slug)
        assert.match(personality, /keeping every number exactly as it is written/, spec.slug)
      }
    })

    it('suggests one joined-up plan where moments fall together, and the gate still fires', async () => {
      const rohan = PERSONAS.find((p) => p.slug === 'rohan')!
      const { session } = await root.services.sessions.create(rohan.customer.cif)
      const view = await root.services.advisory.view(session)
      const { personality } = buildBrief(view, [], view.shelfProducts)
      const ahead = planAhead(view.snapshot, view.roadmap, view.plan, view.shelfProducts)
      assert.ok(ahead)

      assert.ok(personality.includes(ahead.text))
      assert.match(personality, /a plan\s+that joins them up, and ask whether they want to hear it/)
      assert.doesNotMatch(personality, /one suggestion for today/)
      // Every product the plan recommends is named for check_suitability.
      for (const product of ahead.products) assert.ok(personality.includes(`"${product}"`), product)
      assert.match(personality, /What to do next is the plan above\./)
    })

    it('keeps the single suggestion where nothing falls together', async () => {
      const { session } = await root.services.sessions.create(PERSONAS[0]!.customer.cif)
      const view = await root.services.advisory.view(session)
      const { personality } = buildBrief(view, [], view.shelfProducts)

      assert.equal(planAhead(view.snapshot, view.roadmap, view.plan, view.shelfProducts), null)
      assert.match(personality, /one suggestion for today/)
      assert.doesNotMatch(personality, /Your plan for them\./)
    })

    it('says this is their first meeting only on the first call', async () => {
      const { session } = await root.services.sessions.create(PERSONAS[0]!.customer.cif)
      const view = await root.services.advisory.view(session)

      const firstCall = buildBrief(view, [], view.shelfProducts, null, false)
      assert.match(firstCall.personality, /This is our first time meeting/)
      assert.doesNotMatch(firstCall.personality, /Good to see you again/)

      const returning = buildBrief(view, [], view.shelfProducts, null, true)
      assert.match(returning.personality, /Good to see you again/)
      assert.doesNotMatch(returning.personality, /first time meeting/)
    })
  })

  /*
   * The language rule, which the model reads first and last.
   *
   * On a live call the customer asked in Hindi to be spoken to in Hindi and heard "I can only
   * speak English": the old rule's "if you cannot speak their language, answer in simple English"
   * was a way out, and the model took it. These pin the rule to what Uday can do.
   */
  describe('the language rule', () => {
    it('opens and closes the brief, even when the caps cut the middle', async () => {
      for (const spec of PERSONAS) {
        const { session } = await root.services.sessions.create(spec.customer.cif)
        const view = await root.services.advisory.view(session)
        const brief = buildBrief(view, [], view.shelfProducts)

        assert.ok(brief.personality.startsWith('Language. You speak English, Hindi'), spec.slug)
        assert.ok(brief.personality.endsWith('You can speak it.'), spec.slug)
      }
    })

    it('switches on a request by name and otherwise follows the last turn', async () => {
      const { session } = await root.services.sessions.create(PERSONAS[0]!.customer.cif)
      const view = await root.services.advisory.view(session)
      const { personality } = buildBrief(view, [], view.shelfProducts)

      assert.match(personality, /- Answer in the language of the customer's last turn/)
      assert.match(personality, /when they ask for a language by name/)
      assert.match(personality, /keep to it, even when they speak English, until they ask/)
    })

    it('never gives the model a reason to fall back to English', async () => {
      const { session } = await root.services.sessions.create(PERSONAS[0]!.customer.cif)
      const view = await root.services.advisory.view(session)
      const { personality } = buildBrief(view, [], view.shelfProducts)

      assert.doesNotMatch(personality, /cannot speak/i)
      assert.doesNotMatch(personality, /in simple English/i)
      assert.match(personality, /never say that you only speak English/)
    })
  })
})
