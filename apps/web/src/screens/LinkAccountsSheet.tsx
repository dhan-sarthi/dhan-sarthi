/**
 * Linking accounts held at other banks, through the Account Aggregator.
 *
 * Six calls at IDBI, four steps for the customer: we ask the bank for a consent handle, they
 * approve it at OneMoney, the bank tells us what they decided, and we ask the bank to confirm
 * it. This sheet is the customer's side of that, and it is the only place in the app where
 * something is granted rather than read.
 *
 * The state on screen is always the bank's answer, never the aggregator's. A consent shows as
 * live only after 591 has said so, which is why "I have approved it" runs a verification rather
 * than simply marking it done: the approval arrives through the customer's own browser, and a
 * screen that believed it would be a screen that could be lied to.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowUpRight, Check, Link2, RefreshCw } from 'lucide-react'
import type { ConsentRequestResponse } from '@dhan/contracts'
import { Sheet } from '../components/Sheet.tsx'
import { Button, Skeleton } from '../components/ui.tsx'
import { api, isApiError } from '../api/client.ts'

const STATUS_COPY: Record<ConsentRequestResponse['status'], { label: string; note: string }> = {
  REQUESTED: {
    label: 'Requested',
    note: 'The bank has the request. There is no approval link for it yet.',
  },
  AWAITING_APPROVAL: {
    label: 'Waiting for you',
    note: 'Open the link, approve it, then come back and confirm.',
  },
  REPORTED: {
    label: 'Checking',
    note: 'Something came back. We are asking the bank to confirm it before trusting it.',
  },
  ACTIVE: { label: 'Live', note: 'The bank has confirmed it. Those accounts are being read.' },
  CLOSED: { label: 'Closed', note: 'The bank says this one is no longer active.' },
}

export function LinkAccountsSheet({
  open,
  onClose,
  onLinked,
}: {
  open: boolean
  onClose: () => void
  onLinked: (message: string) => void
}): ReactNode {
  const [requests, setRequests] = useState<ConsentRequestResponse[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      const next = await api('listConsentRequests')
      setRequests(next)
      setError(null)
    } catch (err) {
      setError(isApiError(err) ? err.message : 'That could not be read.')
    }
  }, [])

  useEffect(() => {
    if (!open) return
    // Off the effect's own tick, as everywhere else in this app: state changes when the reply
    // arrives, never during the effect that asked for it.
    queueMicrotask(() => void load())
  }, [open, load])

  const start = async (): Promise<void> => {
    setBusy('start')
    setError(null)
    try {
      const made = await api('startConsentRequest')
      setRequests((prev) => [
        made,
        ...(prev ?? []).filter((r) => r.consentHandle !== made.consentHandle),
      ])
      if (made.redirectionUrl === null) {
        setError('The bank raised the request but gave no approval link for it.')
      }
    } catch (err) {
      setError(isApiError(err) ? err.message : 'The request could not be raised.')
    } finally {
      setBusy(null)
    }
  }

  const verify = async (handle: string): Promise<void> => {
    setBusy(handle)
    setError(null)
    try {
      const checked = await api('verifyConsentRequest', { params: { consentHandle: handle } })
      setRequests((prev) => (prev ?? []).map((r) => (r.consentHandle === handle ? checked : r)))
      if (checked.status === 'ACTIVE') {
        onLinked('Linked. Those accounts are being read now.')
      } else {
        setError(
          `The bank still reports this as ${STATUS_COPY[checked.status].label.toLowerCase()}.`,
        )
      }
    } catch (err) {
      setError(isApiError(err) ? err.message : 'That could not be confirmed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Accounts elsewhere"
      sub="Link what you hold at other banks, so the advice is about all of your money."
      footer={
        <Button full busy={busy === 'start'} onClick={() => void start()}>
          <Link2 size={17} strokeWidth={2.6} />
          Ask to link an account
        </Button>
      }
    >
      {error ? (
        <p
          role="alert"
          className="mb-3 mt-1 rounded-sm bg-danger-soft px-3 py-2.5 text-[13px] leading-snug text-danger"
        >
          {error}
        </p>
      ) : null}

      {requests === null ? (
        <div className="pt-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} h={96} className="mb-2.5" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="ds-rise rounded-md bg-tint-sage p-4">
          <p className="m-0 text-[14.5px] font-semibold leading-snug text-ink">
            Only your IDBI accounts are being read
          </p>
          <p className="m-0 mt-1.5 text-[13px] leading-normal text-ink-mid">
            Linking an account elsewhere lets the plan work from what you actually have, not just
            the part of it that happens to sit here. You approve it at the aggregator, and you can
            withdraw it at any time.
          </p>
        </div>
      ) : (
        <ul className="m-0 list-none p-0 pt-1">
          {requests.map((r, i) => {
            const copy = STATUS_COPY[r.status]
            const live = r.status === 'ACTIVE'
            return (
              <li
                key={r.consentHandle}
                className="ds-rise ds-stagger mb-2.5 rounded-md border border-solid border-hairline-mint bg-surface p-3.5"
                style={{ '--i': i } as React.CSSProperties}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-wide ${
                      live ? 'bg-brand text-on-dark' : 'bg-accent-soft text-accent-text'
                    }`}
                  >
                    {live ? <Check size={12} strokeWidth={3} /> : null}
                    {copy.label}
                  </span>
                  <span className="truncate text-[11.5px] tabular-nums text-ink-faint">
                    {r.consentId ?? r.consentHandle.slice(0, 8)}
                  </span>
                </div>

                <p className="m-0 mt-2 text-[13px] leading-snug text-ink-mid">{copy.note}</p>

                {r.events.length > 0 ? (
                  <p className="m-0 mt-1.5 text-[12px] leading-snug text-ink-soft">
                    {r.events.length} {r.events.length === 1 ? 'update' : 'updates'} from the bank,
                    latest{' '}
                    {r.events[r.events.length - 1]?.eventStatus.toLowerCase().replace(/_/g, ' ')}.
                  </p>
                ) : null}

                {!live ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.redirectionUrl !== null ? (
                      <a
                        href={r.redirectionUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="ds-press inline-flex h-10 items-center gap-1.5 rounded-pill border-0 bg-accent px-4 text-[14px] font-semibold text-white no-underline"
                      >
                        Approve it
                        <ArrowUpRight size={15} strokeWidth={2.6} />
                      </a>
                    ) : null}
                    <Button
                      tone="secondary"
                      size="sm"
                      busy={busy === r.consentHandle}
                      onClick={() => void verify(r.consentHandle)}
                    >
                      <RefreshCw size={14} strokeWidth={2.6} />I have approved it
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <p className="mb-1 mt-4 text-xs leading-relaxed text-ink-soft">
        Nothing is read until the bank itself confirms the consent. An approval that arrives any
        other way is recorded and then checked, never acted on.
      </p>
    </Sheet>
  )
}
