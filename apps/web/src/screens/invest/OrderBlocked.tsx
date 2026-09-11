/**
 * The refusal. A screen, not a toast.
 *
 * `07-DECISIONS.md` §3: a `BLOCKED` verdict stops the sale; show the named rule's reason — the
 * same sentence the audit record carries — and the alternative the rule names; design the blocked
 * state as carefully as the happy path. This is that screen, and it exists because SmartWealth
 * has nothing like it: across a hundred screens the reference app never tells a customer no.
 *
 * Four things it does deliberately.
 *
 * **The sentence is the rule's, verbatim.** `suitability.ts` says so at the top: the rules are
 * written as data so that "the reason recorded in the audit trail is the same sentence the
 * customer hears". Nothing here rewords `spoken`, softens it, or wraps it in an apology of our
 * own. The advisor did not write it and neither did this screen.
 *
 * **The alternative is the primary action.** A refusal with no alternative is just a no, and
 * several rules go to the trouble of naming a product from the shelf that would work. Where one
 * is named it gets the orange button; the way back to the cart is the quiet one beside it.
 *
 * **There is no way past.** Not a disabled button, not a confirm dialog, not a "proceed anyway"
 * behind a warning — this component is not given a callback that reaches the OTP, so there is no
 * state in which one could be wired up by accident.
 *
 * **The audit line is shown next to the spoken one.** Two wordings of one judgement, on screen
 * together, is the cheapest possible proof that the app is not saying one thing to the customer
 * and filing another.
 */
import type { ReactNode } from 'react'
import { Ban } from 'lucide-react'
import type { Verdict } from '@dhan/contracts'
import { Screen } from '../../components/Screen.tsx'
import { Button, Card, Head, Leader, TextLink } from '../../components/ui.tsx'
import { inr } from '../../lib/money.ts'
import type { OrderLine } from '../../lib/order.ts'

export function OrderBlocked({
  line,
  verdict,
  amountChecked,
  ruleDescription,
  otherLines,
  onSwap,
  onRemove,
  onBack,
}: {
  /** The line the gate stopped on. Earlier lines cleared; later ones were never reached. */
  line: OrderLine
  verdict: Verdict
  /** The monthly figure the rules were asked about — the basket's running total, not the line's. */
  amountChecked: number
  /** The rule's own description, off `/view`'s rule book. */
  ruleDescription: string | null
  /** How many other schemes are in the order, so "remove it" can say what is left. */
  otherLines: number
  onSwap: (productId: string) => void
  onRemove: () => void
  onBack: () => void
}): ReactNode {
  const alt = verdict.alternative

  return (
    <Screen
      header={<Head onBack={onBack} backLabel="Back to the order" title="Order not placed" />}
      footer={
        <Button full tone={alt ? 'secondary' : 'primary'} onClick={onBack}>
          Back to the order
        </Button>
      }
    >
      {/* The refusal itself. Danger-soft with the body ink on it, which is how `Pill tone="bad"`
          already colours a refusal in this app; the sentence is too long to live in a pill. */}
      <section className="mb-3 rounded-md bg-danger-soft p-4">
        <div className="flex items-center gap-2">
          <Ban size={17} strokeWidth={2.4} className="flex-none text-danger" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-danger">
            Refused · {verdict.ruleId ?? 'rule'}
          </span>
        </div>
        <p className="mb-0 mt-2.5 text-[16.5px] leading-relaxed text-ink">
          {verdict.spoken ?? verdict.recorded}
        </p>
      </section>

      {alt ? (
        <Card tint="sage">
          {/* Margin on the eyebrow, not the heading: `Card` sets `[&_h2]:m-0`, which outranks a
              utility on the h2 itself. */}
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-deep">
            What to do instead
          </div>
          <h2>{alt.name}</h2>
          {alt.monthly > 0 ? (
            <p className="mb-0 mt-1 text-sm text-ink-mid">From {inr(alt.monthly)} a month.</p>
          ) : null}
          <div className="mt-4">
            <Button full onClick={() => onSwap(alt.productId)}>
              Set this up instead
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <h2>What was checked</h2>
        <div className="mt-2">
          <Leader label={line.name} value={inr(line.amount)} filled />
          <Leader
            label="Checked at"
            value={line.mode === 'sip' ? `${inr(amountChecked)} a month` : 'a one-off'}
          />
        </div>
        {ruleDescription ? (
          <p className="mb-0 mt-3 border-0 border-t border-solid border-hairline-mint pt-3 text-[13.5px] leading-relaxed text-ink-mid">
            <b className="font-semibold text-ink">{verdict.ruleId}</b> — {ruleDescription}
          </p>
        ) : null}
        {verdict.passed.length > 0 ? (
          <p className="mb-0 mt-2 text-xs leading-relaxed text-ink-soft">
            Cleared first: {verdict.passed.join(', ')}.
          </p>
        ) : (
          <p className="mb-0 mt-2 text-xs leading-relaxed text-ink-soft">
            The first rule in the book answered, so nothing else was reached. The most fundamental
            objection wins, not the most technical one.
          </p>
        )}
        <div className="mt-2">
          <TextLink flush size="sm" onClick={onRemove}>
            {otherLines > 0 ? 'Take this out and keep the rest' : 'Take this out of the order'}
          </TextLink>
        </div>
      </Card>

      <Card>
        <h2>What goes in your record</h2>
        <p className="mb-0 mt-1.5 text-[13.5px] leading-relaxed text-ink-mid">
          “{verdict.recorded}”
        </p>
        <p className="mb-0 mt-2 text-xs leading-relaxed text-ink-soft">
          The same judgement you just read, in the words a reviewer needs. It is written to the
          hash-chained advice record whether you go ahead with anything else or not — you can read
          it under More → Record.
        </p>
      </Card>
    </Screen>
  )
}
