/**
 * `cas-enter-otp` — the consent, and the code that would authorise the pull.
 *
 * The frame: a blank top half, a decorative gradient hairline, `Enter OTP`, a three-line helper
 * naming MF Central and a masked mobile, six cells, a frozen `Resend OTP in 56s` beside
 * `Send on email instead ?`, an already-ticked consent paragraph, `Verify`, and the iOS numeric
 * keypad. `invest/VerifyOtp.tsx` is built from the same spec and settles most of it; this screen
 * follows those decisions rather than re-arguing them, and departs from the frame in four places.
 *
 * **There is an app bar.** Neither OTP frame has one and both specs mark it `unclear`. A screen
 * with no way out is a trap, and consent you cannot decline is not consent.
 *
 * **The consent box is not pre-ticked.** This is the one place this screen refuses the frame
 * outright. A bank app that arrives with "I hereby give consent to source my mutual fund
 * investment details through MF Central and store for my use" already ticked has not obtained a
 * consent; it has obtained a screenshot of one. India's DPDP Act wants a free, specific,
 * informed, unambiguous affirmative action, and a box somebody else ticked is none of those.
 * This app's whole argument is that its consents are real — `LinkAccountsSheet` will not even
 * believe an approval until the bank confirms it — so `Verify` stays disabled until the customer
 * ticks the box themselves. The sentence itself is the reference's, near enough word for word,
 * because that part of the frame is right.
 *
 * **`Send on email instead ?` is gone.** There is no email channel behind this app.
 *
 * **The keypad is gone.** It is iOS device chrome, not app UI, and the web does not draw one.
 *
 * The masked mobile is not invented either. IDBI's feed carries masked account numbers and no
 * phone number, so — as on `VerifyOtp` — the screen names where the code *would* go in the
 * abstract and prints the code that nothing sent, in the strip at the foot.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Screen } from '../../components/Screen.tsx'
import { OtpInput } from '../../components/OtpInput.tsx'
import { Button, Head, TextLink } from '../../components/ui.tsx'
import { Checkbox } from '../../components/Form.tsx'
import { DemoStrip } from './parts.tsx'
import { CAS_FOLIOS } from './cas.ts'

const RESEND_SECONDS = 30

export function CasConsent({
  code,
  folios,
  persisted,
  busy,
  error,
  onResend,
  onVerified,
  onBack,
}: {
  /** The demo code. Printed, because nothing sent one and a hidden code would be theatre. */
  code: string
  /** How many folios this run would bring in. */
  folios: number
  /** The import can be written to the record. False: it is held for this session only. */
  persisted: boolean
  busy: boolean
  error: string | null
  onResend: () => void
  onVerified: () => void
  onBack: () => void
}): ReactNode {
  const [entered, setEntered] = useState('')
  const [wrong, setWrong] = useState(false)
  const [consented, setConsented] = useState(false)
  const [left, setLeft] = useState(RESEND_SECONDS)

  /* One interval for the life of the screen. A resend is a new mount — the parent keys this
     component on the code — so the countdown, the digits and any error all restart as initial
     state rather than being re-synced from an effect. Same reasoning as `VerifyOtp`. */
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(id)
  }, [])

  const submit = (value: string): void => {
    if (!consented) return
    if (value !== code) {
      setWrong(true)
      setEntered('')
      return
    }
    onVerified()
  }

  return (
    <Screen header={<Head onBack={onBack} backLabel="Back to the statement" title="Enter OTP" />}>
      <div className="pt-2">
        <p className="mb-0 text-[15px] leading-relaxed text-ink-mid">
          MF Central sends a 6-digit code to the mobile registered against your PAN. Enter it to
          bring {folios === 1 ? 'the folio' : `all ${folios} folios`}{' '}
          {persisted ? 'into your record' : 'onto your list of holdings'}.
        </p>

        <div className="mt-6">
          <OtpInput
            autoFocus
            label="6-digit code from MF Central"
            value={entered}
            invalid={wrong}
            disabled={busy}
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
              {left > 0 ? `Ask again in ${left}s` : 'Did not get it?'}
            </p>
          )}
          <TextLink size="sm" disabled={left > 0 || busy} onClick={onResend}>
            Send again
          </TextLink>
        </div>

        {/* The reference's consent sentence, on this app's terms: ticked by the customer, and
            naming the bank that would hold the data rather than the one in the source app. */}
        <div className="mt-3 rounded-md border border-solid border-hairline bg-surface px-3.5 py-1">
          <Checkbox checked={consented} onChange={setConsented} disabled={busy}>
            I give my consent to IDBI Bank to source my mutual fund investment details through MF
            Central and store them for my use.
          </Checkbox>
        </div>

        {error !== null ? (
          <p
            role="alert"
            className="mb-0 mt-3 rounded-sm bg-danger-soft px-3 py-2.5 text-[13px] leading-snug text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-5">
          <Button
            full
            disabled={entered.length < 6 || !consented}
            busy={busy}
            onClick={() => submit(entered)}
          >
            Verify
          </Button>
        </div>

        {!consented ? (
          <p className="mb-0 mt-2 text-center text-[12.5px] text-ink-soft">
            Nothing is fetched or stored until you tick the box.
          </p>
        ) : null}

        <div className="mt-6">
          <DemoStrip>
            No request went to MF Central and no message was sent — there is no MF Central
            integration and no SMS gateway. The code is{' '}
            <b className="text-[15px] font-bold tabular-nums tracking-widest text-ink">{code}</b>.
            Verifying brings in the {CAS_FOLIOS.length} fixture folios{' '}
            {persisted
              ? 'by writing them to your holdings record, marked as held outside IDBI'
              : 'and holds them for this session, because this data source serves its own holdings and will not take a write'}
            ; nothing is read from anywhere.
          </DemoStrip>
        </div>
      </div>
    </Screen>
  )
}
