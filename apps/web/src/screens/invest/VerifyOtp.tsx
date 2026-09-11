/**
 * `verify-otp` — one code for the whole basket, which is the feature the source video is named
 * after.
 *
 * Two specs describe it: `10-diy-otp/06-verify-otp.md` and, with cleaner geometry,
 * `05-cas-import/04-cas-enter-otp.md`. Title, masked destination, six cells, a countdown on the
 * left and an alternate channel on the right, then the primary button. That shape is here; the
 * device keypad under it is iOS, not app UI, and does not exist on the web.
 *
 * What changed, and why:
 *
 * - **There is an app bar.** Neither frame shows one, and both specs mark it `unclear`; a screen
 *   with no way out is a trap, and this app has exactly one way to draw a pushed screen.
 * - **`Send on email instead ?` is gone.** There is no email channel behind this app, and a link
 *   that does nothing is worse than no link.
 * - **The destination is the registered mobile for a real account.** IDBI's feed carries masked
 *   account numbers and no phone number, so the account is named and the number is not invented.
 * - **The code is on screen.** No SMS is sent, because nothing here talks to a gateway. Printing
 *   the code in a labelled demo strip is the honest version of that; the alternative is a field
 *   that silently accepts anything, which teaches a reviewer that the step is theatre.
 *
 * The wrong-code, expired-countdown and resend states are all designed here — the source shows
 * one frozen frame at 56s with the button disabled and nothing else.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Screen } from '../../components/Screen.tsx'
import { OtpInput } from '../../components/OtpInput.tsx'
import { Button, Head, TextLink } from '../../components/ui.tsx'
import { inr } from '../../lib/money.ts'
import type { OrderTotals } from '../../lib/order.ts'

const RESEND_SECONDS = 30

export function VerifyOtp({
  code,
  destination,
  schemes,
  amounts,
  submitting,
  onResend,
  onVerified,
  onBack,
}: {
  /** The demo code. Shown, because no message was sent and pretending otherwise is the lie. */
  code: string
  /** The masked account whose registered mobile the code would go to. */
  destination: string
  schemes: number
  amounts: OrderTotals
  submitting: boolean
  onResend: () => void
  onVerified: () => void
  onBack: () => void
}): ReactNode {
  const [entered, setEntered] = useState('')
  const [wrong, setWrong] = useState(false)
  const [left, setLeft] = useState(RESEND_SECONDS)

  /*
   * One interval for the life of the screen. Resending does not reset the clock from in here —
   * `Invest` keys this component on the code, so a new code is a new mount and the countdown,
   * the entered digits and any error all start again as initial state. Re-syncing three pieces
   * of state from an effect is the cascading render React 19 now warns about, and a remount is
   * both cheaper and exactly what "a new code was sent" means.
   */
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(id)
  }, [])

  const submit = (value: string): void => {
    if (value !== code) {
      setWrong(true)
      setEntered('')
      return
    }
    onVerified()
  }

  return (
    <Screen
      header={<Head onBack={onBack} backLabel="Back to the order" title="Verify OTP" />}
      footer={
        <Button
          full
          disabled={entered.length < 6}
          busy={submitting}
          onClick={() => submit(entered)}
        >
          Verify
        </Button>
      }
    >
      <p className="mb-0 mt-4 text-[15px] leading-relaxed text-ink-mid">
        One 6-digit code for {schemes === 1 ? 'the scheme' : `all ${schemes} schemes`} in this
        order, sent to the mobile registered for {destination}.
      </p>
      <p className="mb-0 mt-1 text-[13px] leading-snug text-ink-soft">
        {amounts.today > 0 ? `${inr(amounts.today)} today` : 'Nothing today'}
        {amounts.monthly > 0 ? ` · ${inr(amounts.monthly)} a month` : ''}
      </p>

      <div className="mt-6">
        <OtpInput
          autoFocus
          label="6-digit code"
          value={entered}
          invalid={wrong}
          disabled={submitting}
          onChange={(next) => {
            setEntered(next)
            if (wrong) setWrong(false)
          }}
          onComplete={submit}
        />
      </div>

      <div className="mt-3 flex min-h-9 items-center justify-between gap-3">
        {wrong ? (
          <p role="alert" className="m-0 text-[13px] font-semibold text-danger">
            That code is not right. Try again.
          </p>
        ) : (
          <p className="m-0 text-[13px] text-ink-soft">
            {left > 0 ? `Resend the code in ${left}s` : 'Did not get it?'}
          </p>
        )}
        <TextLink size="sm" disabled={left > 0 || submitting} onClick={onResend}>
          Resend
        </TextLink>
      </div>

      {/* Not a hint and not a placeholder: the code, said plainly, because nothing sent it. */}
      <div className="mt-6 rounded-md bg-tint-clay p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-text">
          Demonstration
        </div>
        <p className="mb-0 mt-1.5 text-[13px] leading-relaxed text-ink-mid">
          No message was sent — this app has no SMS gateway. The code is{' '}
          <b className="text-[15px] font-bold tabular-nums tracking-widest text-ink">{code}</b>.
        </p>
      </div>
    </Screen>
  )
}
