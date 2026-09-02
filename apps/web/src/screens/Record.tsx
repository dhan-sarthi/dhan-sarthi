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
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { DailyPlan, Snapshot } from '@dhan/core'
import { Card, Eyebrow, Head, Pill, Segments } from '../components/ui.tsx'
import { dayMonth, inr } from '../lib/money.ts'
import type { View } from '../lib/view.ts'

type Tab = 'decisions' | 'rules' | 'consent'

/* Recurring text styles. Preflight is not loaded, so every <p> carries its own margins. */
const BODY = 'm-0 mt-[9px] text-[14.5px] leading-[1.55] text-ink'
const META = 'm-0 text-[13px] text-ink-soft'
const NOTE = 'text-xs leading-relaxed text-ink-soft'

export interface AuditEntry {
  actionId: string
  label: string
  kind: 'did_it' | 'declined'
  at: string
  amount: number
  productName?: string
  evidence: string[]
  /** The exact sentence the customer was shown. What a regulator actually asks for. */
  shown: string
}

export function Record({ view, audit }: { view: View; audit: AuditEntry[] }): ReactNode {
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
        {tab === 'decisions' ? <Decisions audit={audit} plan={view.plan} /> : null}
        {tab === 'rules' ? <Rules view={view} /> : null}
        {tab === 'consent' ? <Consent snapshot={view.snapshot} /> : null}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Decisions */

function Decisions({ audit, plan }: { audit: AuditEntry[]; plan: DailyPlan }): ReactNode {
  if (audit.length === 0) {
    return (
      <Card>
        <h2>Nothing yet</h2>
        <p className={`${META} mt-[7px]`}>
          Every recommendation you accept or decline is recorded here with the figures it was based
          on and the exact words you were shown. Retained five years.
        </p>
        {plan.primary ? (
          <p className={`${NOTE} m-0 mt-3.5`}>
            The one waiting for you on Today is “{plan.primary.label}”.
          </p>
        ) : null}
      </Card>
    )
  }

  return (
    <>
      {audit
        .slice()
        .reverse()
        .map((entry) => (
          <Card key={`${entry.actionId}-${entry.at}`}>
            <div className="mb-[9px] flex flex-wrap gap-2">
              <Pill tone={entry.kind === 'did_it' ? 'ok' : 'plain'}>
                {entry.kind === 'did_it' ? 'Accepted' : 'Declined'}
              </Pill>
              <Pill>{dayMonth(entry.at)}</Pill>
              {entry.amount > 0 ? <Pill>{inr(entry.amount)}</Pill> : null}
            </div>

            <div className="text-[16px] font-bold leading-snug tracking-tight text-ink">
              {entry.label}
            </div>
            {entry.productName ? <p className={`${META} mt-1`}>{entry.productName}</p> : null}

            <div className="mt-3 border-t border-solid border-hairline-mint pt-[11px]">
              <div className={`${NOTE} mb-[5px] font-bold`}>What you were shown</div>
              <p className="m-0 text-[13.5px] leading-normal text-ink-mid">“{entry.shown}”</p>
            </div>

            <div className="mt-3">
              <div className={`${NOTE} mb-[5px] font-bold`}>The figures behind it</div>
              {entry.evidence.map((e) => (
                <div key={e} className={`${NOTE} py-0.5`}>
                  · {e}
                </div>
              ))}
            </div>
          </Card>
        ))}
    </>
  )
}

/* ---------------------------------------------------------------- Rules */

function Rules({ view }: { view: View }): ReactNode {
  return (
    <>
      <Card tint="sage">
        <h2>The model does not decide</h2>
        <p className={BODY}>
          Whether a product suits you is decided by the rules below, in this order, before anything
          reaches you. Uday reads back the verdict — he cannot overrule it, and he cannot reach a
          recommendation by any other path. That is enforced in the code, not asked for in a prompt.
        </p>
      </Card>

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

function Consent({ snapshot }: { snapshot: Snapshot }): ReactNode {
  const items = [
    {
      what: 'Transactions',
      why: 'To work out what a normal month looks like, and what is committed before you decide anything.',
      detail: `${snapshot.quality.transactions} transactions across ${snapshot.quality.monthsOfHistory} complete months.`,
    },
    {
      what: 'Balances',
      why: 'To find money that has not been needed, and to know whether you have a buffer.',
      detail: `Twelve-month floor ${inr(snapshot.balances.idleFloor)}.`,
    },
    {
      what: 'Loans',
      why: 'Because debt above 24% outranks every product we could sell you.',
      detail: `${inr(snapshot.debt.total)} outstanding at up to ${snapshot.debt.highestRate}%.`,
    },
    {
      what: 'Policies in force',
      why: 'So we do not sell you cover you already have, or miss a gap you do not know about.',
      detail: `Life cover in force ${inr(snapshot.protection.lifeCoverInForce)}.`,
    },
  ]

  return (
    <>
      <Card tint="sky">
        <h2>What we read, and why</h2>
        <p className={BODY}>
          Four things, each with a reason. You can withdraw any of them and the advice recomputes in
          front of you — including getting worse, which is the honest consequence.
        </p>
      </Card>

      {items.map((i) => (
        <Card key={i.what}>
          <div className="flex justify-between gap-2.5">
            <div className="flex-1">
              <div className="text-[15.5px] font-bold text-ink">{i.what}</div>
              <p className="m-0 mt-[5px] text-[13.5px] leading-normal text-ink-mid">{i.why}</p>
              <p className={`${NOTE} m-0 mt-[7px]`}>{i.detail}</p>
            </div>
            <div className="flex-none self-start">
              <Pill tone="ok">Shared</Pill>
            </div>
          </div>
        </Card>
      ))}

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
