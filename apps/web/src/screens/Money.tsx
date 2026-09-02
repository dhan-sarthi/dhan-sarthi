/**
 * Money — the 360° view. Boring on purpose.
 *
 * The product notes call this the "you know everything about me" proof, and that is the whole job.
 * It is also where every number on Today and Plan can be traced back to, which matters when a
 * judge decides to check one.
 *
 * The commitments tab carries the distinction the engine works hardest for: a *commitment* is
 * money that leaves whether you think about it or not, and a *habit* is money you choose to
 * spend. Sixty-seven Swiggy orders is not a subscription, and telling a customer it is would read
 * as broken.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { CustomerFile, Snapshot } from '@dhan/core'
import { Amount, Bar, Card, Eyebrow, Head, Leader, Pill, Segments, Tile } from '../components/ui.tsx'
import { dayMonth, inr } from '../lib/money.ts'
import { prettyMerchant } from './Today.tsx'

type Tab = 'accounts' | 'spending' | 'commitments'

export function Money({
  snapshot,
  file,
}: {
  snapshot: Snapshot
  file: CustomerFile
}): ReactNode {
  const [tab, setTab] = useState<Tab>('accounts')

  return (
    <>
      <Head title="Money" sub="Everything, in one place" />
      <Segments
        value={tab}
        onChange={setTab}
        options={[
          { id: 'accounts', label: 'Accounts' },
          { id: 'spending', label: 'Spending' },
          { id: 'commitments', label: 'Commitments' },
        ]}
      />

      <div className="scroll">
        {tab === 'accounts' ? <Accounts snapshot={snapshot} file={file} /> : null}
        {tab === 'spending' ? <Spending snapshot={snapshot} file={file} /> : null}
        {tab === 'commitments' ? <Commitments snapshot={snapshot} /> : null}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Accounts */

function Accounts({ snapshot, file }: { snapshot: Snapshot; file: CustomerFile }): ReactNode {
  return (
    <>
      {file.accounts.map((a) => (
        <Card key={a.accountNumberMasked}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <p className="meta">{a.accountNumberMasked}</p>
            <Pill>{a.accountType}</Pill>
          </div>
          <div style={{ marginTop: 8 }}>
            <Amount value={a.currentBalance} size="lg" paise />
          </div>
          {a.minBalance12m !== undefined ? (
            <p className="note" style={{ marginTop: 8 }}>
              Never fell below {inr(a.minBalance12m)} in twelve months — that part has not been
              needed once.
            </p>
          ) : null}
          {a.maturityDate ? (
            <p className="note" style={{ marginTop: 8 }}>
              Matures {dayMonth(a.maturityDate)} at {a.interestRate}%.
            </p>
          ) : null}
        </Card>
      ))}

      {file.holdings.length > 0 ? (
        <>
          <Eyebrow>Investments</Eyebrow>
          {file.holdings.map((h) => (
            <Card key={h.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700 }}>{h.name}</div>
                  <p className="meta" style={{ marginTop: 3 }}>
                    {h.assetClass}
                    {h.sipActive && h.sipAmount ? ` · ${inr(h.sipAmount)}/month` : ''}
                    {h.heldOutsideIdbi ? ' · held elsewhere' : ''}
                  </p>
                </div>
                <Amount value={h.currentValue} size="md" />
              </div>
              {h.heldOutsideIdbi ? (
                <p className="note" style={{ marginTop: 10 }}>
                  Somebody else sold you this and it is doing its job. I am not going to tell you
                  to move it so that IDBI earns the trail.
                </p>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}

      {file.liabilities.length > 0 ? (
        <>
          <Eyebrow>What you owe</Eyebrow>
          {file.liabilities.map((l) => (
            <Card key={l.loanType} {...(l.loanInterestRate >= 24 ? ({ tint: 'clay' } as const) : {})}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700 }}>{l.loanType}</div>
                  <p className="meta" style={{ marginTop: 3 }}>
                    {inr(l.emiAmount)}/month at {l.loanInterestRate}% ·{' '}
                    {l.tenureRemainingMonths} left
                  </p>
                </div>
                <Amount value={l.outstandingPrincipal} size="md" />
              </div>
              {l.dpdStatus > 0 ? (
                <p style={{ fontSize: 13.5, marginTop: 10, color: 'var(--danger)' }}>
                  {l.dpdStatus} days past due. This blocks every investment recommendation until
                  it is cleared.
                </p>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}

      <Eyebrow>Position</Eyebrow>
      <Card tint="sage">
        <div className="tiles" style={{ marginTop: 0 }}>
          <Tile label="Reachable savings" value={snapshot.balances.total} />
          <Tile label="Invested" value={snapshot.holdings.total} />
          <Tile label="Owed" value={snapshot.debt.total} />
          <Tile
            label="Net"
            value={snapshot.balances.total + snapshot.holdings.total - snapshot.debt.total}
          />
        </div>
      </Card>
    </>
  )
}

/* ---------------------------------------------------------------- Spending */

function Spending({ snapshot, file }: { snapshot: Snapshot; file: CustomerFile }): ReactNode {
  const cats = snapshot.discretionary.byCategory
  const max = cats[0]?.[1] ?? 1

  return (
    <>
      <Card tint="sage">
        <h2>A normal month</h2>
        <p className="meta">Median of the last twelve, so one Diwali does not distort it</p>
        <div style={{ margin: '14px 0 4px' }}>
          <Amount value={snapshot.discretionary.monthly} size="xl" />
        </div>
        <p className="meta">
          on everything you choose, out of {inr(snapshot.income.monthly)} coming in
        </p>
        <div className="tiles">
          <Tile label="Committed each month" value={snapshot.commitments.total} />
          <Tile label="Left over" value={snapshot.surplus.monthly} />
        </div>
      </Card>

      <Eyebrow>Where it goes · last twelve months</Eyebrow>
      <Card>
        {cats.map(([category, total]) => {
          const trend = snapshot.discretionary.categoryTrends.find((t) => t.category === category)
          return (
            <div key={category} style={{ padding: '9px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14.5 }}>
                <span style={{ fontWeight: 600 }}>
                  {category}
                  {trend ? (
                    <span
                      style={{
                        marginLeft: 7,
                        fontSize: 12,
                        fontWeight: 700,
                        color: trend.changePct > 0 ? 'var(--danger)' : 'var(--good)',
                      }}
                    >
                      {trend.changePct > 0 ? '▲' : '▼'}
                      {Math.round(Math.abs(trend.changePct) * 100)}%
                    </span>
                  ) : null}
                </span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {inr(total / 12)}
                  <span style={{ color: 'var(--ink-faint)', fontWeight: 500 }}>/mo</span>
                </span>
              </div>
              <div style={{ marginTop: 6 }}>
                <Bar used={(total / max) * 100} />
              </div>
            </div>
          )
        })}
      </Card>

      <Eyebrow>Habits · not commitments</Eyebrow>
      <Card>
        <p className="note" style={{ marginTop: 0, marginBottom: 12 }}>
          Merchants you use often. These are choices, not obligations — which is exactly why they
          are the only real lever you have.
        </p>
        {snapshot.discretionary.topHabits.map((h) => (
          <div className="txn" key={h.key}>
            <span className="avatar-glyph" style={{ width: 34, height: 34, fontSize: 12 }}>
              {(h.merchant ?? h.key)[0]}
            </span>
            <span className="who">
              <b>{h.merchant ?? prettyMerchant(h.key)}</b>
              <span>
                {h.timesPerMonth}× a month · typically {inr(h.typicalAmount)}
              </span>
            </span>
            <span className="amt">{inr(h.annualTotal)}/yr</span>
          </div>
        ))}
      </Card>

      <Eyebrow>Recent</Eyebrow>
      <Card>
        {file.transactions
          .slice(-14)
          .reverse()
          .map((t) => (
            <div className="txn" key={t.txnId}>
              <span className="avatar-glyph" style={{ width: 32, height: 32, fontSize: 11 }}>
                {t.spendCategory[0]}
              </span>
              <span className="who">
                <b>{prettyMerchant(t.narration)}</b>
                <span>
                  {dayMonth(t.txnDate)} · {t.spendCategory} · {t.txnMode}
                </span>
              </span>
              <span className="amt" style={{ color: t.txnType === 'CREDIT' ? 'var(--good)' : undefined }}>
                {t.txnType === 'CREDIT' ? '+' : '−'}
                {inr(t.txnAmount)}
              </span>
            </div>
          ))}
      </Card>
    </>
  )
}

/* ---------------------------------------------------------------- Commitments */

function Commitments({ snapshot }: { snapshot: Snapshot }): ReactNode {
  const c = snapshot.commitments

  return (
    <>
      <Card tint="clay">
        <h2>Gone before you decide</h2>
        <p className="meta">Detected from the pattern of your statements, not from a form</p>
        <div style={{ margin: '14px 0 4px' }}>
          <Amount value={c.total} size="xl" />
        </div>
        <p className="meta">a month, {inr(c.total * 12)} a year</p>

        <div style={{ marginTop: 16 }}>
          <Leader label="Rent" value={inr(c.rent)} filled />
          <Leader label="Loan repayments" value={inr(c.emis)} filled />
          <Leader label="Bills" value={inr(c.bills)} filled />
          <Leader label="Family and fees" value={inr(c.obligations)} filled />
          <Leader label="Subscriptions" value={inr(c.subscriptions)} filled />
          <Leader label="Already investing" value={inr(c.investments)} />
        </div>
      </Card>

      <Eyebrow>Every mandate we found</Eyebrow>
      {c.series.map((s) => (
        <Card key={s.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>
                {s.merchant ?? prettyMerchant(s.key)}
              </div>
              <p className="meta" style={{ marginTop: 3 }}>
                {s.cadence}
                {s.dayOfMonth ? ` on day ${s.dayOfMonth}` : ''} · {s.occurrences} charges ·{' '}
                {s.fixed ? 'same amount every time' : 'varies'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Amount value={s.monthlyCost} size="md" />
              <div className="note">{inr(s.annualCost)}/yr</div>
            </div>
          </div>

          {s.priceChanges.length > 0 ? (
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.5,
                marginTop: 11,
                padding: '10px 12px',
                borderRadius: 'var(--r-sm)',
                background: 'var(--accent-soft)',
                color: '#6d3a10',
              }}
            >
              Went from {inr(s.priceChanges[0]?.from ?? 0)} to {inr(s.priceChanges[0]?.to ?? 0)} in{' '}
              {dayMonth(s.priceChanges[0]?.on ?? '')} — {inr(((s.priceChanges[0]?.to ?? 0) - (s.priceChanges[0]?.from ?? 0)) * 12)} a
              year you did not agree to.
            </p>
          ) : null}

          <p className="note" style={{ marginTop: 9 }}>
            Counted as a commitment because: {s.reason.replace(/-/g, ' ')}.
          </p>
        </Card>
      ))}
    </>
  )
}
