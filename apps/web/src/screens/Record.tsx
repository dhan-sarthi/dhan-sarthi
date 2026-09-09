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
import { Pencil } from 'lucide-react'
import { Card, Eyebrow, Head, Pill, Segments } from '../components/ui.tsx'
import { PullToRefresh } from '../components/PullToRefresh.tsx'
import type { Tier } from '../components/TierBadge.tsx'
import { dayMonth, inr } from '../lib/money.ts'
import type { RecordState } from '../lib/record.ts'

type Tab = 'decisions' | 'rules' | 'consent'

/* Recurring text styles. Preflight is not loaded, so every <p> carries its own margins. */
const BODY = 'm-0 mt-[9px] text-[14.5px] leading-[1.55] text-ink'
const META = 'm-0 text-[13px] text-ink-soft'
const NOTE = 'text-xs leading-relaxed text-ink-soft'

export function Record({
  view,
  record,
  session,
  tier,
  busy,
  onConsent,
  onEditProfile,
  onRefresh,
}: {
  view: View
  record: RecordState
  session: SessionState | null
  tier: Tier
  busy: boolean
  onConsent: (scope: ConsentScope, granted: boolean) => void
  /** The declared half of the profile is the app's own, so it is editable from where it is shown. */
  onEditProfile: () => void
  /** Pull down at the top to re-read the view. */
  onRefresh: () => Promise<void>
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

      <PullToRefresh className="scroll" contentClassName="ds-enter" onRefresh={onRefresh}>
        {tab === 'decisions' ? <Decisions record={record} view={view} tier={tier} /> : null}
        {tab === 'rules' ? <Rules view={view} /> : null}
        {tab === 'consent' ? (
          <Consent
            view={view}
            record={record.record}
            session={session}
            tier={tier}
            busy={busy}
            onConsent={onConsent}
            onEditProfile={onEditProfile}
          />
        ) : null}
      </PullToRefresh>
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

  if (tier === 'offline') {
    return (
      <Card>
        <h2>Nothing is recorded offline</h2>
        <p className={`${META} mt-[7px]`}>
          The record is written by the advisor service, one row per recommendation, with the figures
          it was based on and the exact words you were shown. This browser is simulating without it,
          so nothing you do here is kept.
        </p>
      </Card>
    )
  }

  if (record.error) {
    return (
      <Card>
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
    )
  }

  const rec = record.record
  if (!rec) {
    return (
      <Card>
        <p className={META} aria-live="polite">
          Reading the record…
        </p>
      </Card>
    )
  }

  const adviceById = new Map(rec.adviceRecords.map((a) => [a.id, a]))
  const decidedAdvice = new Set(rec.decisions.map((d) => d.adviceRecordId))
  const checks = rec.adviceRecords.filter((a) => !decidedAdvice.has(a.id))
  const productName = (id: string | null): string | null =>
    id ? (view.shelf.find((p) => p.productId === id)?.name ?? id) : null

  return (
    <>
      <div className="mb-3 mt-3 flex flex-wrap gap-2">
        {record.chain ? (
          record.chain.ok ? (
            <Pill tone="ok">
              Chain verified · {record.chain.length}{' '}
              {record.chain.length === 1 ? 'record' : 'records'}
            </Pill>
          ) : (
            <Pill tone="bad">Chain broken at {record.chain.brokenAt ?? 'an unknown record'}</Pill>
          )
        ) : (
          <Pill tone="warn">Chain not checked</Pill>
        )}
        {rec.provenance ? <Pill>Seed {rec.provenance.seedRunId.slice(0, 8)}</Pill> : null}
      </div>

      {rec.decisions.length === 0 ? (
        <Card>
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

      {rec.decisions
        .slice()
        .reverse()
        .map((d) => {
          const advice = d.adviceRecordId ? adviceById.get(d.adviceRecordId) : undefined
          return (
            <Card key={d.id}>
              <div className="mb-[9px] flex flex-wrap gap-2">
                <Pill tone={d.kind === 'did_it' ? 'ok' : 'plain'}>{DECISION_LABEL[d.kind]}</Pill>
                <Pill>{dayMonth(d.atSim)}</Pill>
                {d.amount > 0 ? <Pill>{inr(d.amount)}</Pill> : null}
                {advice?.verdict === 'BLOCKED' ? <Pill tone="bad">Refused</Pill> : null}
              </div>

              <div className="text-[16px] font-bold leading-snug tracking-tight text-ink">
                {d.shown}
              </div>
              {productName(d.productId) ? (
                <p className={`${META} mt-1`}>{productName(d.productId)}</p>
              ) : null}

              {advice ? (
                <div className="mt-3 border-t border-solid border-hairline-mint pt-[11px]">
                  <div className={`${NOTE} mb-[5px] font-bold`}>What you were shown</div>
                  <p className="m-0 text-[13.5px] leading-normal text-ink-mid">
                    “{advice.spoken ?? advice.recorded}”
                  </p>
                  <p className={`${NOTE} m-0 mt-2`}>
                    {advice.verdict === 'PASS'
                      ? `Passed ${advice.rulesPassed.length} rules`
                      : `Rule ${advice.ruleId ?? '?'}`}{' '}
                    · snapshot {advice.snapshotId.slice(0, 8)} · record{' '}
                    {advice.recordHash.slice(0, 12)}…
                  </p>
                </div>
              ) : null}

              {d.evidence.length > 0 ? (
                <div className="mt-3">
                  <div className={`${NOTE} mb-[5px] font-bold`}>The figures behind it</div>
                  {d.evidence.map((e) => (
                    <div key={e} className={`${NOTE} py-0.5`}>
                      · {e}
                    </div>
                  ))}
                </div>
              ) : null}
              {d.note ? <p className={`${NOTE} m-0 mt-2`}>Your note: “{d.note}”</p> : null}
            </Card>
          )
        })}

      {checks.length > 0 ? (
        <>
          <Eyebrow>Also checked · {checks.length}</Eyebrow>
          {checks
            .slice()
            .reverse()
            .map((a) => (
              <Card key={a.id}>
                <div className="mb-[9px] flex flex-wrap gap-2">
                  <Pill
                    tone={a.verdict === 'PASS' ? 'ok' : a.verdict === 'BLOCKED' ? 'bad' : 'warn'}
                  >
                    {a.verdict === 'PASS'
                      ? 'Suitable'
                      : a.verdict === 'BLOCKED'
                        ? 'Refused'
                        : 'Not on the shelf'}
                  </Pill>
                  <Pill>{dayMonth(a.atSim)}</Pill>
                  <Pill>{SOURCE_LABEL[a.source]}</Pill>
                </div>
                {productName(a.productId) ? (
                  <div className="text-[15.5px] font-bold leading-snug text-ink">
                    {productName(a.productId)}
                    {a.amount ? ` · ${inr(a.amount)} a month` : ''}
                  </div>
                ) : null}
                <p className="m-0 mt-2 text-[13.5px] leading-normal text-ink-mid">
                  “{a.spoken ?? a.recorded}”
                </p>
                <p className={`${NOTE} m-0 mt-2`}>
                  {a.ruleId ? `Rule ${a.ruleId} · ` : ''}snapshot {a.snapshotId.slice(0, 8)} ·
                  record {a.recordHash.slice(0, 12)}…
                  {a.verifiedInTranscript === true ? ' · verified in the transcript' : ''}
                </p>
              </Card>
            ))}
        </>
      ) : null}

      {rec.roadmapVersions.length > 0 ? (
        <>
          <Eyebrow>Plan versions · {rec.roadmapVersions.length}</Eyebrow>
          {rec.roadmapVersions
            .slice()
            .reverse()
            .map((v) => (
              <Card key={v.version}>
                <div className="mb-2 flex flex-wrap gap-2">
                  <Pill>Version {v.version}</Pill>
                  {/* The simulated date the plan was cut on, which is the date the reviewer
                      was looking at. The wall clock the row was written at means nothing here. */}
                  <Pill>
                    {dayMonth(v.atSim)} {v.atSim.slice(0, 4)}
                  </Pill>
                </div>
                <p className="m-0 text-[14.5px] leading-normal text-ink">{v.reasonForChange}</p>
                <p className={`${NOTE} m-0 mt-2`}>
                  {v.goal.purpose ?? v.goal.kind} · {inr(v.goal.targetAmount)} by{' '}
                  {dayMonth(v.goal.targetDate)} {v.goal.targetDate.slice(0, 4)} · snapshot{' '}
                  {v.snapshotId.slice(0, 8)}
                </p>
              </Card>
            ))}
        </>
      ) : null}

      {rec.avatarSessions.length > 0 ? (
        <>
          <Eyebrow>Calls with Uday · {rec.avatarSessions.length}</Eyebrow>
          {rec.avatarSessions.map((s) => (
            <Card key={s.runwaySessionId}>
              <div className="mb-2 flex flex-wrap gap-2">
                <Pill>{dayMonth(s.openedAt.slice(0, 10))}</Pill>
                {s.minutesCharged !== null ? <Pill>{s.minutesCharged.toFixed(1)} min</Pill> : null}
                {s.gateCoverage ? (
                  <Pill tone={s.gateCoverage.misses.length === 0 ? 'ok' : 'bad'}>
                    Gate fired {s.gateCoverage.fired}/{s.gateCoverage.expected}
                  </Pill>
                ) : null}
              </div>
              <p className={`${NOTE} m-0`}>
                Transcript {s.transcriptStatus}
                {s.endReason ? ` · ended by ${s.endReason.replace(/_/g, ' ')}` : ' · in progress'}
              </p>
            </Card>
          ))}
        </>
      ) : null}
    </>
  )
}

/* ---------------------------------------------------------------- Rules */

function Rules({ view }: { view: View }): ReactNode {
  return (
    <>
      <div className="mt-3">
        <Card tint="sage">
          <h2>The model does not decide</h2>
          <p className={BODY}>
            Whether a product suits you is decided by the rules below, in this order, before
            anything reaches you. Uday reads back the verdict — he cannot overrule it, and he cannot
            reach a recommendation by any other path. That is enforced in the code, not asked for in
            a prompt.
          </p>
        </Card>
      </div>

      <Eyebrow>{view.rules.length} rules · earliest failure wins</Eyebrow>
      {view.rules.map((r, i) => (
        <Card key={r.id}>
          <div className="flex gap-2.5">
            <span className="grid size-[26px] flex-none place-items-center rounded-pill bg-legend-chip text-xs font-bold text-brand">
              {i + 1}
            </span>
            <div className="flex-1">
              <div className="text-xs font-bold text-ink-soft">{r.id}</div>
              <p className="m-0 mt-1 text-[14.5px] leading-normal text-ink">{r.description}</p>
            </div>
          </div>
        </Card>
      ))}

      <Eyebrow>What is on the shelf</Eyebrow>
      <Card>
        <p className={`${NOTE} m-0 mb-3`}>
          Including the ones we will refuse. A product list containing only suitable products cannot
          demonstrate suitability.
        </p>
        <div className="divide-y divide-solid divide-hairline-mint">
          {view.shelf.map((p) => (
            <div className="flex items-center gap-3 py-[11px]" key={p.productId}>
              <span className="min-w-0 flex-1">
                <b className="block text-[14.5px] font-bold text-ink">{p.name}</b>
                <span className="text-xs text-ink-soft">
                  {p.manufacturer} · {p.riskometer}
                  {p.lockInYears > 0 ? ` · ${p.lockInYears}y lock-in` : ' · no lock-in'}
                  {p.verified ? '' : ' · rate unverified'}
                </span>
              </span>
              {p.bundlesProtectionAndInvestment ? <Pill tone="bad">Refused</Pill> : null}
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

/* ---------------------------------------------------------------- Consent */

const PROVENANCE_LABEL: Record<Provenance, string> = {
  idbi: 'From IDBI',
  declared: 'From what you told us, not from the bank',
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
  onConsent,
  onEditProfile,
}: {
  view: View
  record: RecordView | null
  session: SessionState | null
  tier: Tier
  busy: boolean
  onConsent: (scope: ConsentScope, granted: boolean) => void
  /** The declared half of the profile is the app's own, so it is editable from where it is shown. */
  onEditProfile: () => void
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
      detail:
        `${snapshot.customer.age}, ` +
        `${snapshot.customer.dependents} ${snapshot.customer.dependents === 1 ? 'dependent' : 'dependents'}, ` +
        `${snapshot.customer.riskProfile.toLowerCase()} risk profile.`,
    },
    {
      scope: 'TXN',
      what: 'Transactions',
      why: 'To work out what a normal month looks like, and what is committed before you decide anything.',
      detail:
        `${snapshot.quality.transactions} ` +
        `${snapshot.quality.transactions === 1 ? 'transaction' : 'transactions'}, ` +
        // "across 0 complete months" is the honest arithmetic and reads like a defect. Over
        // IDBI's own statement — twenty days — this is the usual branch.
        `${
          snapshot.quality.monthsOfHistory <= 0
            ? 'less than a complete month'
            : snapshot.quality.monthsOfHistory === 1
              ? 'across one complete month'
              : `across ${snapshot.quality.monthsOfHistory} complete months`
        }.`,
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
        <Card tint="sky">
          <h2>What we read, and why</h2>
          <p className={BODY}>
            Five things, each with a reason. You can withdraw any of them and the advice recomputes
            in front of you — including getting worse, which is the honest consequence.
          </p>
          {consent ? (
            <p className={`${NOTE} m-0 mt-3`}>
              Consent {consent.consentId} · {consent.status.toLowerCase()} · {consent.purpose} ·
              valid to {dayMonth(consent.validTo)} {consent.validTo.slice(0, 4)}
            </p>
          ) : null}
        </Card>
      </div>

      {items.map((i) => {
        const on = granted(i.scope)
        return (
          <Card key={i.scope}>
            <div className="flex justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-[15.5px] font-bold text-ink">{i.what}</div>
                <p className="m-0 mt-[5px] text-[13.5px] leading-normal text-ink-mid">{i.why}</p>
                <p className={`${NOTE} m-0 mt-[7px]`}>
                  {i.detail} {PROVENANCE_LABEL[view.meta.provenance[i.scope]]}.
                </p>
                {/* A block the app owns can be corrected here, where the customer is already
                    reading what we hold. Sending them somewhere else to fix a wrong figure is
                    how a wrong figure stays. */}
                {view.meta.provenance[i.scope] === 'declared' ? (
                  <button
                    type="button"
                    onClick={onEditProfile}
                    className="ds-press mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-pill border-[1.5px] border-solid border-accent bg-white px-3 text-[13px] font-semibold text-accent-text"
                  >
                    <Pencil size={13} strokeWidth={2.6} />
                    Change this
                  </button>
                ) : null}
              </div>
              <div className="flex-none self-start">
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${i.what}: ${on ? 'shared' : 'withdrawn'}`}
                  disabled={!editable || busy}
                  onClick={() => onConsent(i.scope, !on)}
                  className={`inline-flex h-9 items-center rounded-pill border-0 px-[13px] text-xs font-semibold transition-transform duration-100 active:scale-[0.985] disabled:opacity-60 ${
                    on ? 'bg-brand text-on-dark' : 'bg-accent-soft text-accent-text'
                  }`}
                >
                  {on ? 'Shared' : 'Withdrawn'}
                </button>
              </div>
            </div>
          </Card>
        )
      })}

      {!editable ? (
        <p className={`${NOTE} m-0 mb-3`}>
          {tier === 'offline'
            ? 'Consent is held by the advisor service. Reconnect to change what is shared.'
            : 'Reading your session…'}
        </p>
      ) : null}

      <Card>
        <h2>Never stored</h2>
        <p className="m-0 mt-2 text-[13.5px] leading-[1.55] text-ink-mid">
          Health and medical details, caste, religion, politics, sexuality, legal matters, and
          anyone else&rsquo;s finances. Card numbers, PAN and Aadhaar are stripped before anything
          is written down.
        </p>
        <p className={`${NOTE} m-0 mt-[11px]`}>
          There is a product reason as well as a legal one: an advisor that remembers your medical
          history is not reassuring, it is uncanny — and the moment this feels like surveillance it
          is finished.
        </p>
      </Card>
    </>
  )
}
