/**
 * Record — the paper trail.
 *
 * This screen exists as much for the judge as for the customer, and that is a deliberate design
 * decision rather than a cynical one. A remote banker cannot feel a conversation, but they
 * recognise a compliance artefact immediately — and a customer who can see the rules that govern
 * the advice has a reason to trust it that no amount of friendly copy provides.
 *
 * Three things live here: what was recommended and what the customer did about it, the rule book
 * itself, and what data we read. All three are the answer to the question a risk committee asks
 * first, which is not "does it work" but "can you show me why it said that".
 *
 * The record is the server's, read from `/record` and checked by `/record/verify`: every advice
 * record carries the snapshot it was judged against and a hash chained to the one before it.
 * Nothing on this screen is remembered by the browser.
 *
 * Three surfaces, three roles, and never one inside another. The chain check is the single claim
 * this screen exists to make, so it gets the green panel and nothing else on the screen does.
 * Decisions are a timeline on a spine and the rule book is a numbered ladder on the same spine —
 * both are ordered sequences, and the layout should say so rather than leave it to the copy.
 * Everything else is a bare row on a hairline. Giving each of those a card of its own is what
 * made every block on the page weigh exactly the same.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type {
  AdviceRecord,
  ConsentScope,
  DecisionRecord,
  Provenance,
  RecordView,
  SessionState,
  View,
} from '@dhan/contracts'
import { Card, Eyebrow, Head, HeroPanel, Pill, Segments } from '../components/ui.tsx'
import type { Tier } from '../components/TierBadge.tsx'
import { riseDelay, useCountUp } from '../lib/motion.ts'
import { dayMonth, inr } from '../lib/money.ts'
import type { RecordState } from '../lib/record.ts'

type Tab = 'decisions' | 'rules' | 'consent'

/* Recurring text styles. Preflight is not loaded, so every <p> carries its own margins. */
const BODY = 'm-0 mt-[9px] text-[14.5px] leading-[1.55] text-ink'
const META = 'm-0 text-[13px] text-ink-soft'
const NOTE = 'text-xs leading-relaxed text-ink-soft'

/* A statement that opens a segment. It leads on type size alone: putting it in a card would make
   it weigh the same as the record it is introducing. */
const STATEMENT = 'm-0 text-[20px] font-semibold leading-tight text-ink'

/* An in-row label, quieter than an Eyebrow because a timeline repeats it once per entry. */
const MICRO = 'text-[11px] font-semibold uppercase tracking-wide text-ink-soft'

/* Ids and hashes. The one place a second family earns its keep: a snapshot id and a record hash
   are meant to be compared character by character, which a proportional font makes harder. */
const MONO = 'm-0 font-mono text-[11.5px] leading-relaxed text-ink-soft'

/* The ledger idiom, shared by the three reference lists below the timeline: hairline above, a
   hairline between rows, nothing around them. */
const LEDGER =
  'mb-3 min-w-0 px-1 divide-y divide-solid divide-hairline-mint border-0 border-t border-solid border-hairline-mint'

export function Record({
  view,
  record,
  session,
  tier,
  busy,
  notice,
  onConsent,
  onSwitchCustomer,
}: {
  view: View
  record: RecordState
  session: SessionState | null
  tier: Tier
  busy: boolean
  /** The last consent change failed; the server's sentence. */
  notice: string | null
  onConsent: (scope: ConsentScope, granted: boolean) => void
  onSwitchCustomer: () => void
}): ReactNode {
  const [tab, setTab] = useState<Tab>('decisions')

  return (
    <>
      <Head title="Record" sub="Every recommendation, and why" />
      <Segments
        value={tab}
        onChange={setTab}
        options={[
          { id: 'decisions', label: 'Decisions' },
          { id: 'rules', label: 'The rules' },
          { id: 'consent', label: 'Your data' },
        ]}
      />

      <div className="scroll">
        {tab === 'decisions' ? <Decisions record={record} view={view} tier={tier} /> : null}
        {tab === 'rules' ? <Rules view={view} /> : null}
        {tab === 'consent' ? (
          <Consent
            view={view}
            record={record.record}
            session={session}
            tier={tier}
            busy={busy}
            notice={notice}
            onConsent={onConsent}
          />
        ) : null}
        {tab === 'consent' ? (
          <div className="mb-4 border-0 border-t border-solid border-hairline-mint pt-3">
            <button
              type="button"
              onClick={onSwitchCustomer}
              disabled={busy}
              className="min-h-11 rounded-pill border border-solid border-hairline-mint bg-white px-4 text-sm font-semibold text-brand hover:bg-tint-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-55"
            >
              Switch customer
            </button>
            <p className="m-0 mt-2 text-xs leading-normal text-ink-soft">
              Open the reviewer picker. This session’s decisions stay on the record.
            </p>
          </div>
        ) : null}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Decisions */

const DECISION_LABEL: Record<DecisionRecord['kind'], string> = {
  did_it: 'Accepted',
  declined: 'Declined',
  deferred: 'Deferred',
  pushed_back: 'Pushed back',
}

const SOURCE_LABEL: Record<AdviceRecord['source'], string> = {
  screen: 'On Today',
  avatar_tool: 'Asked by Uday on a call',
  text: 'Checked in text',
  api: 'Checked by API',
}

function Decisions({
  record,
  view,
  tier,
}: {
  record: RecordState
  view: View
  tier: Tier
}): ReactNode {
  const plan = view.plan
  const chain = record.chain
  // The chain length is the figure the screen is about, so it resolves in front of you the way
  // the day's figure does on Today. Before the check comes back, the rows we hold stand in for it.
  const chainLength = chain?.length ?? record.record?.adviceRecords.length ?? 0
  const counted = useCountUp(chainLength)
  const brokenAt = chain && !chain.ok ? `at ${chain.brokenAt ?? 'an unknown record'}` : null

  if (tier === 'offline') {
    return (
      <div className="mt-3">
        <Card tint="white">
          <h2>Nothing is recorded offline</h2>
          <p className={`${META} mt-[7px]`}>
            The record is written by the advisor service, one row per recommendation, with the
            figures it was based on and the exact words you were shown. This browser is simulating
            without it, so nothing you do here is kept.
          </p>
        </Card>
      </div>
    )
  }

  if (record.error) {
    return (
      <div className="mt-3">
        <Card tint="white">
          <h2>The record could not be read</h2>
          <p role="alert" className={`${META} mt-[7px]`}>
            {record.error.message}
          </p>
          <button
            type="button"
            onClick={() => void record.refresh()}
            className="mt-3 h-11 rounded-pill border-[1.5px] border-solid border-accent bg-white px-4 text-[15px] font-semibold text-accent-text transition-transform duration-100 active:scale-[0.985]"
          >
            Try again
          </button>
        </Card>
      </div>
    )
  }

  const rec = record.record
  if (!rec) {
    return (
      <div className="mt-3">
        <Card tint="white">
          <p className={META} aria-live="polite">
            Reading the record…
          </p>
        </Card>
      </div>
    )
  }

  const adviceById = new Map(rec.adviceRecords.map((a) => [a.id, a]))
  const decidedAdvice = new Set(rec.decisions.map((d) => d.adviceRecordId))
  const checks = rec.adviceRecords.filter((a) => !decidedAdvice.has(a.id))
  const decisions = rec.decisions.slice().reverse()
  const productName = (id: string | null): string | null =>
    id ? (view.shelf.find((p) => p.productId === id)?.name ?? id) : null

  return (
    <>
      {/* ------------------------------------------------ The chain
          Tamper-evidence is the whole reason this screen exists, so it takes the one surface
          nothing else here has: the bank's green, its wave, and the count of chained records. */}
      <div className="mt-3">
        <HeroPanel
          /* An empty chain passes verification trivially, so saying "chain verified" over a
             count of zero is a claim with nothing behind it — precisely the sentence a reviewer
             is right to distrust. Until there is a record to chain, the panel says so. */
          label={
            chain
              ? chain.ok
                ? chainLength === 0
                  ? 'Nothing chained yet'
                  : 'Chain verified'
                : 'Chain broken'
              : 'Chain not checked'
          }
          {...(brokenAt
            ? { meta: brokenAt }
            : chain?.ok === true && chainLength === 0
              ? { meta: 'The first decision you take starts the chain.' }
              : {})}
          settled={`${chain ? (chain.ok ? 'ok' : 'broken') : 'unchecked'}-${chainLength}`}
          footer={
            rec.provenance ? (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] uppercase tracking-wide text-on-dark/60">Seed</span>
                <span className="font-mono text-[13px] text-on-dark/90">
                  {rec.provenance.seedRunId.slice(0, 8)}
                </span>
              </div>
            ) : null
          }
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[34px] font-bold leading-none tracking-tight tabular-nums">
              {counted}
            </span>
            <span className="text-[15px] font-semibold text-on-dark/75">
              {chainLength === 1 ? 'record' : 'records'}
            </span>
          </div>
        </HeroPanel>
      </div>

      {rec.decisions.length === 0 ? (
        <Card tint="white">
          <h2>Nothing yet</h2>
          <p className={`${META} mt-[7px]`}>
            Every recommendation you accept or decline is recorded here with the figures it was
            based on and the exact words you were shown. Retained five years.
          </p>
          {plan.primary ? (
            <p className={`${NOTE} m-0 mt-3.5`}>
              The one waiting for you on Today is “{plan.primary.label}”.
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* ------------------------------------------------ The timeline
          One node per record on a single rule, newest first. Six decisions were six identical
          cards, which read as six equally important things; on a spine they read as a sequence,
          which is what a paper trail is. */}
      {decisions.length > 0 ? (
        <ol className="m-0 mt-1 list-none p-0">
          {decisions.map((d, i) => {
            const advice = d.adviceRecordId ? adviceById.get(d.adviceRecordId) : undefined
            const name = productName(d.productId)
            return (
              <li key={d.id} className="rise flex gap-3" style={riseDelay(i)}>
                <div className="flex flex-none flex-col items-center pt-1.5">
                  {/* Solid for a decision acted on, a ring for one deferred or declined — the
                      same distinction the Leader rows draw between committed and flexible. */}
                  <span
                    className={`size-3 shrink-0 rounded-pill ${
                      d.kind === 'did_it'
                        ? 'bg-brand'
                        : 'border-[1.5px] border-solid border-brand bg-surface'
                    }`}
                  />
                  {i < decisions.length - 1 ? (
                    <span className="mt-1.5 w-px flex-1 bg-hairline-mint" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1 pb-5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <Pill tone={d.kind === 'did_it' ? 'ok' : 'plain'}>
                      {DECISION_LABEL[d.kind]}
                    </Pill>
                    {advice?.verdict === 'BLOCKED' ? <Pill tone="bad">Refused</Pill> : null}
                    <span className="text-[13px] tabular-nums text-ink-soft">
                      {dayMonth(d.atSim)}
                      {d.amount > 0 ? ` · ${inr(d.amount)}` : ''}
                    </span>
                  </div>

                  <div className="mt-2 text-[15.5px] font-semibold leading-snug text-ink">
                    {d.shown}
                  </div>
                  {name ? <p className={`${META} mt-1`}>{name}</p> : null}

                  {advice ? (
                    <>
                      <div className={`${MICRO} mt-3`}>What you were shown</div>
                      <p className="m-0 mt-1 text-[14px] leading-normal text-ink-mid">
                        “{advice.spoken ?? advice.recorded}”
                      </p>
                      <p className={`${MONO} mt-1.5`}>
                        {advice.verdict === 'PASS'
                          ? `Passed ${advice.rulesPassed.length} rules`
                          : `Rule ${advice.ruleId ?? '?'}`}{' '}
                        · snapshot {advice.snapshotId.slice(0, 8)} · record{' '}
                        {advice.recordHash.slice(0, 12)}…
                      </p>
                    </>
                  ) : null}

                  {d.evidence.length > 0 ? (
                    <>
                      <div className={`${MICRO} mt-3`}>The figures behind it</div>
                      {d.evidence.map((e) => (
                        <div key={e} className="py-[3px] text-[13px] text-ink-mid">
                          · {e}
                        </div>
                      ))}
                    </>
                  ) : null}
                  {d.note ? <p className={`${NOTE} m-0 mt-2`}>Your note: “{d.note}”</p> : null}
                </div>
              </li>
            )
          })}
        </ol>
      ) : null}

      {/* ------------------------------------------------ Everything else is reference
          Checks nobody decided on, plan versions and calls are evidence a reviewer scans rather
          than reads, so they are ledgers: hairline rules, no containers, smaller type. */}
      {checks.length > 0 ? (
        <>
          <Eyebrow>Also checked · {checks.length}</Eyebrow>
          <div className={LEDGER}>
            {checks
              .slice()
              .reverse()
              .map((a, i) => (
                <div key={a.id} className="rise py-3.5" style={riseDelay(i)}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <Pill
                      tone={a.verdict === 'PASS' ? 'ok' : a.verdict === 'BLOCKED' ? 'bad' : 'warn'}
                    >
                      {a.verdict === 'PASS'
                        ? 'Suitable'
                        : a.verdict === 'BLOCKED'
                          ? 'Refused'
                          : 'Not on the shelf'}
                    </Pill>
                    <span className="text-[13px] text-ink-soft">
                      {dayMonth(a.atSim)} · {SOURCE_LABEL[a.source]}
                    </span>
                  </div>
                  {productName(a.productId) ? (
                    <div className="mt-2 text-[14.5px] font-semibold leading-snug text-ink">
                      {productName(a.productId)}
                      {a.amount ? ` · ${inr(a.amount)} a month` : ''}
                    </div>
                  ) : null}
                  <p className="m-0 mt-1 text-[13.5px] leading-normal text-ink-mid">
                    “{a.spoken ?? a.recorded}”
                  </p>
                  <p className={`${MONO} mt-1.5`}>
                    {a.ruleId ? `Rule ${a.ruleId} · ` : ''}snapshot {a.snapshotId.slice(0, 8)} ·
                    record {a.recordHash.slice(0, 12)}…
                    {a.verifiedInTranscript === true ? ' · verified in the transcript' : ''}
                  </p>
                </div>
              ))}
          </div>
        </>
      ) : null}

      {rec.roadmapVersions.length > 0 ? (
        <>
          <Eyebrow>Plan versions · {rec.roadmapVersions.length}</Eyebrow>
          <div className={LEDGER}>
            {rec.roadmapVersions
              .slice()
              .reverse()
              .map((v) => (
                <div key={v.version} className="py-3.5">
                  {/* Version left, the date it was cut on right, a dotted rule between them —
                      the ledger line the rest of the app uses for a figure. The simulated date
                      is the one that means anything; the wall clock the row was written at
                      means nothing here. */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-[14.5px] font-semibold text-ink">
                      Version {v.version}
                    </span>
                    <span className="flex-1 -translate-y-1 border-b-[1.5px] border-dotted border-hairline-mint" />
                    <span className="text-[13px] tabular-nums text-ink-soft">
                      {dayMonth(v.atSim)} {v.atSim.slice(0, 4)}
                    </span>
                  </div>
                  <p className="m-0 mt-1.5 text-[14px] leading-normal text-ink-mid">
                    {v.reasonForChange}
                  </p>
                  <p className={`${MONO} mt-1.5`}>
                    {v.goal.purpose ?? v.goal.kind} · {inr(v.goal.targetAmount)} by{' '}
                    {dayMonth(v.goal.targetDate)} {v.goal.targetDate.slice(0, 4)} · snapshot{' '}
                    {v.snapshotId.slice(0, 8)}
                  </p>
                </div>
              ))}
          </div>
        </>
      ) : null}

      {rec.avatarSessions.length > 0 ? (
        <>
          <Eyebrow>Calls with Uday · {rec.avatarSessions.length}</Eyebrow>
          <div className={LEDGER}>
            {rec.avatarSessions.map((s) => (
              <div key={s.runwaySessionId} className="py-3.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <span className="text-[14.5px] font-semibold text-ink">
                    {dayMonth(s.openedAt.slice(0, 10))}
                  </span>
                  {s.minutesCharged !== null ? (
                    <span className="text-[13px] tabular-nums text-ink-soft">
                      {s.minutesCharged.toFixed(1)} min
                    </span>
                  ) : null}
                  {s.gateCoverage ? (
                    <Pill tone={s.gateCoverage.misses.length === 0 ? 'ok' : 'bad'}>
                      Gate fired {s.gateCoverage.fired}/{s.gateCoverage.expected}
                    </Pill>
                  ) : null}
                </div>
                <p className={`${NOTE} m-0 mt-1.5`}>
                  Transcript {s.transcriptStatus}
                  {s.endReason ? ` · ended by ${s.endReason.replace(/_/g, ' ')}` : ' · in progress'}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}

/* ---------------------------------------------------------------- Rules */

function Rules({ view }: { view: View }): ReactNode {
  return (
    <>
      {/* No card. The claim is the loudest thing in this segment and type size says so. */}
      <div className="mt-3">
        <h2 className={STATEMENT}>The model does not decide</h2>
        <p className={BODY}>
          Whether a product suits you is decided by the rules below, in this order, before anything
          reaches you. Uday reads back the verdict — he cannot overrule it, and he cannot reach a
          recommendation by any other path. That is enforced in the code, not asked for in a prompt.
        </p>
      </div>

      {/* ------------------------------------------------ The ladder
          Nine identical cards said the rules were nine independent things. They are a sequence
          evaluated top to bottom where the first failure wins, so they hang off one spine and
          carry their position in it. */}
      <Eyebrow>{view.rules.length} rules · earliest failure wins</Eyebrow>
      <ol className="m-0 mb-3 list-none p-0">
        {view.rules.map((r, i) => (
          <li key={r.id} className="rise flex gap-3" style={riseDelay(i)}>
            <div className="flex flex-none flex-col items-center">
              <span className="grid size-[26px] shrink-0 place-items-center rounded-pill bg-legend-chip text-xs font-bold tabular-nums text-brand">
                {i + 1}
              </span>
              {i < view.rules.length - 1 ? (
                <span className="mt-1 w-px flex-1 bg-hairline-mint" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 pb-4">
              <div className="font-mono text-[11.5px] font-semibold leading-[26px] text-ink-soft">
                {r.id}
              </div>
              <p className="m-0 mt-0.5 text-[14.5px] leading-normal text-ink">{r.description}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* The shelf is a list of objects rather than a sequence, so it gets the one container in
          this segment: a hairline card with rules between the rows, not a card per product. */}
      <Eyebrow>What is on the shelf</Eyebrow>
      <p className={`${NOTE} m-0 mb-2.5`}>
        Including the ones we will refuse. A product list containing only suitable products cannot
        demonstrate suitability.
      </p>
      <div className="mb-3 min-w-0 divide-y divide-solid divide-hairline-mint rounded-md border border-solid border-hairline-mint bg-surface px-3.5">
        {view.shelf.map((p) => (
          <div className="flex items-center gap-3 py-[11px]" key={p.productId}>
            <span className="min-w-0 flex-1">
              <b className="block text-[14.5px] font-semibold leading-snug text-ink">{p.name}</b>
              <span className="mt-0.5 block text-xs text-ink-soft">
                {p.manufacturer} · {p.riskometer}
                {p.lockInYears > 0 ? ` · ${p.lockInYears}y lock-in` : ' · no lock-in'}
                {p.verified ? '' : ' · rate unverified'}
              </span>
            </span>
            {p.bundlesProtectionAndInvestment ? <Pill tone="bad">Refused</Pill> : null}
          </div>
        ))}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Consent */

const PROVENANCE_LABEL: Record<Provenance, string> = {
  idbi: 'From IDBI',
  fixture: 'From the synthetic ledger',
  memory: 'From the synthetic ledger',
  postgres: 'From the seeded database',
}

function Consent({
  view,
  record,
  session,
  tier,
  busy,
  notice,
  onConsent,
}: {
  view: View
  record: RecordView | null
  session: SessionState | null
  tier: Tier
  busy: boolean
  notice: string | null
  onConsent: (scope: ConsentScope, granted: boolean) => void
}): ReactNode {
  const { snapshot } = view
  const consent = record?.consent ?? null
  const overrides = session?.scopeOverrides ?? []
  const editable = tier !== 'offline' && session !== null

  const items: { scope: ConsentScope; what: string; why: string; detail: string }[] = [
    {
      scope: 'PROFILE',
      what: 'Profile',
      why: 'Age, dependents and risk profile decide which products can even be considered for you.',
      detail: `${snapshot.customer.age}, ${snapshot.customer.dependents} dependents, ${snapshot.customer.riskProfile.toLowerCase()} risk profile.`,
    },
    {
      scope: 'TXN',
      what: 'Transactions',
      why: 'To work out what a normal month looks like, and what is committed before you decide anything.',
      detail: `${snapshot.quality.transactions} transactions across ${snapshot.quality.monthsOfHistory} complete months.`,
    },
    {
      scope: 'ACCOUNTS',
      what: 'Balances',
      why: 'To find money that has not been needed, and to know whether you have a buffer.',
      detail: `Twelve-month floor ${inr(snapshot.balances.idleFloor)}.`,
    },
    {
      scope: 'LIABILITIES',
      what: 'Loans',
      why: 'Because debt above 24% outranks every product we could sell you.',
      detail: `${inr(snapshot.debt.total)} outstanding at up to ${snapshot.debt.highestRate}%.`,
    },
    {
      scope: 'HOLDINGS',
      what: 'Investments and policies in force',
      why: 'So we do not sell you cover you already have, or miss a gap you do not know about.',
      detail: `Life cover in force ${inr(snapshot.protection.lifeCoverInForce)} · invested ${inr(snapshot.holdings.total)}.`,
    },
  ]

  const granted = (scope: ConsentScope): boolean =>
    (consent ? consent.scopes.includes(scope) : true) && !overrides.includes(scope)

  return (
    <>
      <div className="mt-3">
        <h2 className={STATEMENT}>What we read, and why</h2>
        <p className={BODY}>
          Five things, each with a reason. You can withdraw any of them and the advice recomputes in
          front of you — including getting worse, which is the honest consequence.
        </p>
        {consent ? (
          <p className={`${NOTE} m-0 mt-2.5`}>
            Consent <span className="font-mono">{consent.consentId}</span> ·{' '}
            {consent.status.toLowerCase()} · {consent.purpose} · valid to{' '}
            {dayMonth(consent.validTo)} {consent.validTo.slice(0, 4)}
          </p>
        ) : null}
      </div>

      {notice ? (
        <p role="alert" className="m-0 mb-3 mt-3 text-[13px] leading-normal text-danger">
          {notice}
        </p>
      ) : null}

      {/* Five switches are a settings list, and a settings list is rows on hairlines. In cards
          each scope read as a proposition to weigh; as rows they read as one control panel. */}
      <div className={`${LEDGER} mt-4`}>
        {items.map((i, n) => {
          const on = granted(i.scope)
          return (
            <div
              key={i.scope}
              className="rise flex items-start justify-between gap-3 py-4"
              style={riseDelay(n)}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[15.5px] font-semibold leading-snug text-ink">{i.what}</div>
                <p className="m-0 mt-1 text-[13.5px] leading-normal text-ink-mid">{i.why}</p>
                <p className={`${NOTE} m-0 mt-[7px]`}>
                  {i.detail} {PROVENANCE_LABEL[view.meta.provenance[i.scope]]}.
                </p>
              </div>
              <div className="flex-none self-start">
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${i.what}: ${on ? 'shared' : 'withdrawn'}`}
                  disabled={!editable || busy}
                  onClick={() => onConsent(i.scope, !on)}
                  className={`inline-flex h-9 items-center rounded-pill border-0 px-[13px] text-xs font-semibold transition-transform duration-100 active:scale-[0.985] disabled:opacity-55 ${
                    on ? 'bg-brand text-on-dark' : 'bg-accent-soft text-accent-text'
                  }`}
                >
                  {on ? 'Shared' : 'Withdrawn'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {!editable ? (
        <p className={`${NOTE} m-0 mb-3`}>
          {tier === 'offline'
            ? 'Consent is held by the advisor service. Reconnect to change what is shared.'
            : 'Reading your session…'}
        </p>
      ) : null}

      {/* The one card in this segment, and the legend chip on its edge is the bank's own way of
          titling a block. What is never stored is a boundary, so it gets an edge to sit on. */}
      <section className="relative mb-3 min-w-0 rounded-md border border-solid border-hairline bg-surface p-4 pt-5">
        <span className="absolute -top-2 left-3.5 rounded-pill bg-legend-chip px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-brand">
          Never stored
        </span>
        <p className="m-0 text-[13.5px] leading-[1.55] text-ink-mid">
          Health and medical details, caste, religion, politics, sexuality, legal matters, and
          anyone else&rsquo;s finances. Card numbers, PAN and Aadhaar are stripped before anything
          is written down.
        </p>
        <p className={`${NOTE} m-0 mt-[11px]`}>
          There is a product reason as well as a legal one: an advisor that remembers your medical
          history is not reassuring, it is uncanny — and the moment this feels like surveillance it
          is finished.
        </p>
      </section>
    </>
  )
}
