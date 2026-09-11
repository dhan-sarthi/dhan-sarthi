/**
 * Order placed.
 *
 * **This screen is not in the source.** It is designed, and the flow file is explicit that it has
 * to be: "No order-success screen. The single most important omission. The video cuts from
 * `verify-otp` straight to a title card." There is no confirmation, no reference number, no
 * post-purchase CTA anywhere in the nineteen frames — the narration says "Yes, it's that simple"
 * and the spot ends. So nothing below is a port; the only thing carried over is the shell.
 *
 * What it is built to do, in order:
 *
 * 1. **Say what was bought and when the money moves.** A SIP takes nothing today and a lump sum
 *    takes nothing next month, and the one question a customer has on this screen is which.
 * 2. **Say what happens next in the units they will actually see** — NAV cut-off, allotment,
 *    where the holding shows up — because "order placed" is not the same event as "you own it",
 *    and the gap between them is where support calls come from.
 * 3. **Say what did and did not happen.** The suitability check was real, ran on the server, and
 *    is in the hash-chained advice record; no instruction reached an AMC and no money moved,
 *    because this app has no order path and is not pretending to have grown one. That card is
 *    the reason this screen is not simply a green tick — an unqualified "Order placed" would be
 *    the only untrue sentence in the app.
 * 4. **Route to the record**, which is the thing this product has that the reference does not.
 *
 * The reference number is generated in the browser and is a demo artefact like everything else
 * on the screen; it is formatted the way a real one would be so the layout is honest, and it is
 * labelled as ours rather than as an AMC's.
 */
import type { ReactNode } from 'react'
import { Screen } from '../../components/Screen.tsx'
import { Amount, Button, Card, Head, Leader, TextLink } from '../../components/ui.tsx'
import { dayMonth, inr, longDate } from '../../lib/money.ts'
import { settlementOf, totals } from '../../lib/order.ts'
import type { OrderLine } from '../../lib/order.ts'
import { Art } from '../../components/Art.tsx'

export function OrderPlaced({
  lines,
  reference,
  asOf,
  rulesPassed,
  onSeeRecord,
  onDone,
}: {
  lines: readonly OrderLine[]
  reference: string
  asOf: string
  /** How many suitability rules this order cleared. The gate's receipt. */
  rulesPassed: number
  onSeeRecord: () => void
  onDone: () => void
}): ReactNode {
  const t = totals(lines)
  const included = lines.filter((l) => l.included)
  const firstDebit = included
    .map((l) => l.startDate)
    .filter((d): d is string => d !== null)
    .sort()[0]

  /*
   * The steps describe what this order actually does, not what a mutual-fund order does.
   *
   * A fund is allotted units at a NAV, a policy is issued and starts covering you, a deposit is
   * booked at the day's rate. The reference only ever sells funds, so it only ever has to say one
   * of those; IDBI's shelf carries all three and an order can mix them.
   */
  const kinds = new Set(included.map((l) => settlementOf(l.category)))
  const next: string[] = []
  if (kinds.has('units')) {
    next.push(
      'Units are allotted at the NAV that applies once the money is realised, before the ' +
        'scheme’s cut-off for the day, and the holding appears under Dashboard within two ' +
        'working days.',
    )
  }
  if (kinds.has('cover')) {
    next.push(
      'The policy is issued once the first premium is realised. Cover starts from the date on ' +
        'the policy document, not from today.',
    )
  }
  if (kinds.has('deposit')) {
    next.push('The deposit is booked at the rate applicable on the day the money is realised.')
  }
  if (t.monthly > 0 && firstDebit) {
    next.push(
      `The mandate is registered against your account. The first monthly debit is on ${longDate(
        firstDebit,
      )}, and you can pause or stop it at any time.`,
    )
  }

  return (
    <Screen
      header={<Head title="Order placed" sub={longDate(asOf)} />}
      footer={
        <Button full onClick={onDone}>
          Done
        </Button>
      }
    >
      <Card tint="sage">
        <div className="flex items-center gap-3">
          <Art name="order-recorded" size="sm" className="ds-pop -my-1" />
          <div className="min-w-0 flex-1">
            {t.today > 0 ? (
              <>
                <Amount value={t.today} size="lg" paise />
                <div className="mt-1 text-[13px] text-ink-mid">
                  debited today
                  {t.monthly > 0 ? `, then ${inr(t.monthly)} a month` : ''}
                </div>
              </>
            ) : (
              <>
                <Amount value={t.monthly} size="lg" />
                <div className="mt-1 text-[13px] text-ink-mid">
                  a month{firstDebit ? `, from ${dayMonth(firstDebit)}` : ''}. Nothing today.
                </div>
              </>
            )}
          </div>
        </div>
        <p className="mb-0 mt-3 border-0 border-t border-solid border-hairline-mint pt-3 text-[12.5px] text-ink-mid">
          Reference <b className="font-semibold tabular-nums text-ink">{reference}</b>
        </p>
      </Card>

      <Card>
        <h2>In this order</h2>
        <div className="mt-2">
          {included.map((line) => (
            <Leader
              key={line.id}
              filled
              label={line.name}
              value={line.mode === 'sip' ? `${inr(line.amount)}/month` : `${inr(line.amount)} once`}
            />
          ))}
          {/* A one-line order needs no total; restating the same figure under itself reads as
              an arithmetic slip rather than a sum. */}
          {included.length > 1 ? (
            <Leader
              total
              label={t.today > 0 ? 'Taken today' : 'Every month'}
              value={inr(t.today > 0 ? t.today : t.monthly)}
            />
          ) : null}
        </div>
      </Card>

      <Card tint="sky">
        <h2>What happens next</h2>
        <ol className="m-0 mt-2 list-none p-0 text-[13.5px] leading-relaxed text-ink-mid">
          {next.map((line, i) => (
            <Step key={line} n={i + 1}>
              {line}
            </Step>
          ))}
        </ol>
      </Card>

      {/*
       * The card that keeps the rest of the screen honest. Everything above it is what a bank app
       * says when it has placed an order; this app has not placed one, and the half that *is*
       * real is the half worth pointing at.
       */}
      <Card tint="clay">
        <h2>What actually happened</h2>
        <p className="mb-0 mt-1.5 text-[13.5px] leading-relaxed text-ink-mid">
          The suitability gate ran against your current position before any of this, and cleared{' '}
          {rulesPassed} {rulesPassed === 1 ? 'rule' : 'rules'} for every scheme in the order. That
          check is real and every verdict it reached — including a refusal — is written to the
          hash-chained advice record.
        </p>
        <p className="mb-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
          No instruction reached an AMC and no money moved. There is no order path behind this app,
          and this screen is not pretending it grew one.
        </p>
        <div className="mt-2">
          <TextLink flush size="sm" onClick={onSeeRecord}>
            See what was recorded
          </TextLink>
        </div>
      </Card>
    </Screen>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }): ReactNode {
  return (
    <li className="flex gap-2.5 py-1.5">
      <span
        aria-hidden="true"
        className="grid size-5 flex-none place-items-center rounded-pill bg-surface text-[11px] font-bold text-brand-deep"
      >
        {n}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  )
}
