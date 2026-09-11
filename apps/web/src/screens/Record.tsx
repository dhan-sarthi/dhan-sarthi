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
import { Pencil, Trash2 } from 'lucide-react'
import { Button, Card, Eyebrow, Head, Pill, Segments, TextLink } from '../components/ui.tsx'
import { Screen } from '../components/Screen.tsx'
import type { Tier } from '../components/TierBadge.tsx'
import { api, isApiError } from '../api/client.ts'
import { clearSession } from '../api/session.ts'
import { dayMonth, inr } from '../lib/money.ts'
import type { RecordState } from '../lib/record.ts'
import { useRipple } from '../lib/motion.ts'

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
  onEditRiskProfile,
  onBack,
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
  /**
   * The risk profile has its own screen under More, because it is the one declared fact the rule
   * book on this screen actually enforces. The rules tab links to it rather than restating it.
   */
  onEditRiskProfile: () => void
  /** Back to the More menu. Record is pushed from there rather than being a tab of its own. */
  onBack: () => void
  /** Pull down at the top to re-read the view. */
  onRefresh: () => Promise<void>
}): ReactNode {
  const [tab, setTab] = useState<Tab>('decisions')

  return (
    <Screen
      header={<Head title="Record" sub="Every recommendation, and why" onBack={onBack} />}
      tabs={
        <Segments
          value={tab}
          onChange={setTab}
          options={[
            { id: 'decisions', label: 'Decisions' },
            { id: 'rules', label: 'The rules' },
            { id: 'consent', label: 'Your data' },
          ]}
        />
      }
      onRefresh={onRefresh}
    >
      {tab === 'decisions' ? <Decisions record={record} view={view} tier={tier} /> : null}
      {tab === 'rules' ? <Rules view={view} onEditRiskProfile={onEditRiskProfile} /> : null}
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
    </Screen>
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

/**
 * Where the ledger behind a record came from, in the words the More menu's footer already uses.
 *
 * Real provenance, and it belongs on an audit record — but it was rendering `Seed memory-0`,
 * eight characters of an internal run id, on a customer's screen. Over IDBI's own feed the
 * `Read from IDBI` chip says this instead and this one is not drawn.
 */
const LEDGER_SOURCE: Record<string, string> = {
  memory: 'Synthetic ledger',
  postgres: 'Seeded database',
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
          The record is written by the advisor service — one row per recommendation, with the
          figures it was based on and the exact words you were shown. This browser is simulating, so
          nothing here is kept.
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
          className="ds-press mt-3 h-11 rounded-pill border-[1.5px] border-solid border-accent bg-white px-4 text-[15px] font-semibold text-accent-text"
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
        {/* The chain covers *advice* records — a decision is not hashed, the recommendation it
            answered is. On a customer whose every recommendation is behavioural there is nothing
            to chain, and "Chain verified · 0 records" over a page of decisions reads as a broken
            counter rather than as the truth it is. */}
        {record.chain ? (
          !record.chain.ok ? (
            <Pill tone="bad">Chain broken at {record.chain.brokenAt ?? 'an unknown record'}</Pill>
          ) : record.chain.length > 0 ? (
            <Pill tone="ok">
              Chain verified · {record.chain.length}{' '}
              {record.chain.length === 1 ? 'record' : 'records'}
            </Pill>
          ) : (
            <Pill>Nothing checked against a product yet</Pill>
          )
        ) : (
          <Pill tone="warn">Chain not checked</Pill>
        )}
        {/* Where the ledger behind this record came from.
            It is real provenance and belongs on an audit record, but it was printing
            `Seed memory-0` — eight characters of an internal run id, on a customer's screen.
            The same source is already named in words two screens away in the More menu, so it
            is named in words here. Over a bank feed the chip below says so instead. */}
        {rec.provenance && view.meta.source !== 'idbi-sandbox' ? (
          <Pill>{LEDGER_SOURCE[view.meta.source] ?? 'Synthetic ledger'}</Pill>
        ) : null}
        {view.meta.source === 'idbi-sandbox' ? <Pill>Read from IDBI</Pill> : null}
      </div>

      {rec.decisions.length === 0 ? (
        <Card>
          <h2>Nothing yet</h2>
          <p className={`${META} mt-[7px]`}>
            Every recommendation you accept or decline is recorded here — the figures it was based
            on, the exact words you were shown. Retained five years.
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
                      ? `Passed ${advice.rulesPassed.length} ${advice.rulesPassed.length === 1 ? 'rule' : 'rules'}`
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

function Rules({
  view,
  onEditRiskProfile,
}: {
  view: View
  onEditRiskProfile: () => void
}): ReactNode {
  return (
    <>
      <div className="mt-3">
        <Card tint="sage">
          <h2>The model does not decide</h2>
          <p className={BODY}>
            The rules below decide, in this order, before anything reaches you. Uday reads back the
            verdict — he cannot overrule it or reach one by any other path. Enforced in the code,
            not asked for in a prompt.
          </p>
        </Card>
      </div>

      {/*
       * The one input to this rule book that is the customer's own.
       *
       * Everything else the rules read is derived from the statement. `RISK_CEILING` reads a value
       * the customer declared, so the screen that lists the rules is the right place to show what
       * it is currently set to and to offer the way to change it.
       */}
      <Card tint="clay">
        <h2>Your risk profile: {view.snapshot.customer.riskProfile}</h2>
        <p className={BODY}>
          RISK_CEILING below reads this, the only input to the rule book that is not from your
          statement. Narrowing it refuses more; widening it never adds a recommendation.
        </p>
        <div className="mt-1.5">
          <TextLink flush size="sm" onClick={onEditRiskProfile}>
            Change it, or answer six questions
          </TextLink>
        </div>
      </Card>

      <Eyebrow>
        {view.rules.length} {view.rules.length === 1 ? 'rule' : 'rules'} · earliest failure wins
      </Eyebrow>
      {view.rules.map((r, i) => (
        <Card key={r.id}>
          <div className="flex gap-2.5">
            <span className="grid size-[26px] flex-none place-items-center rounded-pill bg-legend-chip text-xs font-bold text-brand-deep">
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
          Including the ones we will refuse — a shelf of only suitable products cannot demonstrate
          suitability.
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
  const ripple = useRipple()
  const overrides = session?.scopeOverrides ?? []
  const editable = tier !== 'offline' && session !== null

  const items: { scope: ConsentScope; what: string; why: string; detail: string }[] = [
    {
      scope: 'PROFILE',
      what: 'Profile',
      why: 'Age, dependents and risk profile decide which products can be considered at all.',
      detail:
        `${snapshot.customer.age}, ` +
        `${snapshot.customer.dependents} ${snapshot.customer.dependents === 1 ? 'dependent' : 'dependents'}, ` +
        `${snapshot.customer.riskProfile.toLowerCase()} risk profile.`,
    },
    {
      scope: 'TXN',
      what: 'Transactions',
      why: 'To work out what a normal month looks like, and what is already committed.',
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
      why: 'To find money you have not needed, and whether you have a buffer.',
      detail: `Twelve-month floor ${inr(snapshot.balances.idleFloor)}.`,
    },
    {
      scope: 'LIABILITIES',
      what: 'Loans',
      why: 'Because debt above 24% outranks every product we could sell you.',
      /* The rate only where the bank sends one. IDBI returns no interest rate on Neha's loans,
         and "outstanding at up to 0%" contradicts the Money tab, which says so plainly. */
      detail:
        snapshot.debt.total === 0
          ? 'Nothing owed.'
          : snapshot.debt.highestRate > 0
            ? `${inr(snapshot.debt.total)} outstanding at up to ${snapshot.debt.highestRate}%.`
            : `${inr(snapshot.debt.total)} outstanding. The bank sends no rate for it.`,
    },
    {
      scope: 'HOLDINGS',
      what: 'Investments and policies in force',
      why: 'So we do not sell you cover you already have, or miss a gap.',
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
            Five things, each with a reason. Withdraw any of them and the advice recomputes in front
            of you — including getting worse.
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
                  onPointerDown={ripple}
                  onClick={() => onConsent(i.scope, !on)}
                  className={`ds-press inline-flex h-9 items-center rounded-pill border-0 px-[13px] text-xs font-semibold disabled:opacity-60 ${
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
          history is uncanny, not reassuring.
        </p>
      </Card>

      <Erase editable={editable} />
    </>
  )
}

/**
 * Erasure, which the DPDP Act gives a customer the right to and the API has always supported.
 *
 * There was no button. A right nobody can exercise is a paragraph, and this screen spends four
 * cards telling a customer what is held about them, so ending it with no way to say "delete
 * this" is the wrong note to finish on.
 *
 * Two presses, and the second one names what goes. Not a modal: a confirmation that appears in
 * place, under the finger that asked for it, is harder to dismiss by accident than one that
 * takes over the screen.
 */
function Erase({ editable }: { editable: boolean }): ReactNode {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const erase = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await api('eraseSession')
      // Back to the picker with nothing held: the token was the only thing this browser kept.
      clearSession()
    } catch (err) {
      setError(isApiError(err) ? err.message : 'That could not be erased.')
      setBusy(false)
    }
  }

  if (!editable) return null

  return (
    <Card>
      <h2>Erase all of this</h2>
      <p className="m-0 mt-2 text-[13.5px] leading-[1.55] text-ink-mid">
        Deletes everything held about this session: the profile you gave, what you told us you own,
        the snapshots and the decisions.
      </p>
      <p className={`${NOTE} m-0 mt-[11px]`}>
        The advice records stay — an audit trail that can be deleted is not one. They are unlinked
        from you and cannot be traced back.
      </p>

      {error ? (
        <p role="alert" className={`${NOTE} m-0 mt-3 text-danger`}>
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {armed ? (
          <>
            <Button tone="danger" size="sm" busy={busy} onClick={() => void erase()}>
              <Trash2 size={15} strokeWidth={2.4} />
              Yes, erase it
            </Button>
            <Button tone="quiet" size="sm" disabled={busy} onClick={() => setArmed(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button tone="secondary" size="sm" onClick={() => setArmed(true)}>
            Erase my data
          </Button>
        )}
      </div>
    </Card>
  )
}
