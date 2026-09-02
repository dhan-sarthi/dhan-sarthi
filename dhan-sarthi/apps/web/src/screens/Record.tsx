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

export function Record({
  view,
  audit,
}: {
  view: View
  audit: AuditEntry[]
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
        <p className="meta" style={{ marginTop: 7 }}>
          Every recommendation you accept or decline is recorded here with the figures it was based
          on and the exact words you were shown. Retained five years.
        </p>
        {plan.primary ? (
          <p className="note" style={{ marginTop: 14 }}>
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
            <div style={{ display: 'flex', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
              <Pill tone={entry.kind === 'did_it' ? 'ok' : 'plain'}>
                {entry.kind === 'did_it' ? 'Accepted' : 'Declined'}
              </Pill>
              <Pill>{dayMonth(entry.at)}</Pill>
              {entry.amount > 0 ? <Pill>{inr(entry.amount)}</Pill> : null}
            </div>

            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.015em' }}>
              {entry.label}
            </div>
            {entry.productName ? <p className="meta" style={{ marginTop: 4 }}>{entry.productName}</p> : null}

            <div
              style={{
                marginTop: 12,
                paddingTop: 11,
                borderTop: '1px solid rgb(22 52 42 / 8%)',
              }}
            >
              <div className="note" style={{ fontWeight: 700, marginBottom: 5 }}>
                What you were shown
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: 0, color: 'var(--ink-mid)' }}>
                “{entry.shown}”
              </p>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="note" style={{ fontWeight: 700, marginBottom: 5 }}>
                The figures behind it
              </div>
              {entry.evidence.map((e) => (
                <div key={e} className="note" style={{ padding: '2px 0' }}>
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
        <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: '9px 0 0' }}>
          Whether a product suits you is decided by the rules below, in this order, before anything
          reaches you. Uday reads back the verdict — he cannot overrule it, and he cannot reach a
          recommendation by any other path. That is enforced in the code, not asked for in a prompt.
        </p>
      </Card>

      <Eyebrow>{view.rules.length} rules · earliest failure wins</Eyebrow>
      {view.rules.map((r, i) => (
        <Card key={r.id}>
          <div style={{ display: 'flex', gap: 10 }}>
            <span
              style={{
                width: 26,
                height: 26,
                flex: '0 0 auto',
                borderRadius: 999,
                background: 'var(--ground-deep)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {i + 1}
            </span>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  color: 'var(--ink-soft)',
                }}
              >
                {r.id}
              </div>
              <p style={{ fontSize: 14.5, lineHeight: 1.5, margin: '4px 0 0' }}>{r.description}</p>
            </div>
          </div>
        </Card>
      ))}

      <Eyebrow>What is on the shelf</Eyebrow>
      <Card>
        <p className="note" style={{ marginTop: 0, marginBottom: 12 }}>
          Including the ones we will refuse. A product list containing only suitable products
          cannot demonstrate suitability.
        </p>
        {view.shelf.map((p) => (
          <div className="txn" key={p.productId}>
            <span className="who">
              <b>{p.name}</b>
              <span>
                {p.manufacturer} · {p.riskometer}
                {p.lockInYears > 0 ? ` · ${p.lockInYears}y lock-in` : ' · no lock-in'}
              </span>
            </span>
            {p.bundlesProtectionAndInvestment ? <Pill tone="bad">Refused</Pill> : null}
          </div>
        ))}
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
        <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: '9px 0 0' }}>
          Four things, each with a reason. You can withdraw any of them and the advice recomputes in
          front of you — including getting worse, which is the honest consequence.
        </p>
      </Card>

      {items.map((i) => (
        <Card key={i.what}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>{i.what}</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-mid)', margin: '5px 0 0' }}>
                {i.why}
              </p>
              <p className="note" style={{ marginTop: 7 }}>{i.detail}</p>
            </div>
            <Pill tone="ok">Shared</Pill>
          </div>
        </Card>
      ))}

      <Card>
        <h2 style={{ fontSize: 17 }}>Never stored</h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-mid)', margin: '8px 0 0' }}>
          Health and medical details, caste, religion, politics, sexuality, legal matters, and
          anyone else&rsquo;s finances. Card numbers, PAN and Aadhaar are stripped before anything
          is written down.
        </p>
        <p className="note" style={{ marginTop: 11 }}>
          There is a product reason as well as a legal one: an advisor that remembers your medical
          history is not reassuring, it is uncanny — and the moment this feels like surveillance it
          is finished.
        </p>
      </Card>
    </>
  )
}
