/**
 * What the four opening calls came back with, and the four rows that report them.
 *
 * Split out of `Onboarding.tsx` when the funnel gained a screen per step: the connect step and
 * the closing step both read this, and the type is the contract between them.
 */
import { FileText, Landmark, ShieldCheck, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Account, Snapshot } from '@dhan/contracts'
import { inr } from '../../lib/money.ts'

export type StepKey = 'accounts' | 'statement' | 'consents' | 'holdings'

export interface Facts {
  accounts: number
  balance: number
  /**
   * Read off the statement page itself rather than off the snapshot's count, because this line
   * reports what its own call returned. `more` is set when the cursor says there are further
   * pages, so the figure is never quietly presented as a total when it is a page.
   */
  lines: number
  more: boolean
  months: number
  debt: number
  outgo: number
  consents: number
  holdings: number
  /**
   * The person and their primary account, as IDBI describes them.
   *
   * The reference's `05-profile-kyc-details` renders the fetched file back to the customer
   * before it asks for anything, and this is what ours has to render: a name, a masked account
   * number, a type, an IFSC, a vintage. Every field here is one IDBI actually sends. There is no
   * PAN and no demat, so there is no PAN row and no demat band.
   */
  customer: Snapshot['customer'] | null
  account: Account | null
}

export interface Probe {
  key: StepKey
  icon: LucideIcon
  doing: string
  /** What to say once the reply is in. Written from that reply, never from a guess. */
  done: (facts: Facts) => string
}

/**
 * One row per call, and there are exactly four calls.
 *
 * Not one call to `/view` with the rows revealed on a timer: the point of showing the steps is
 * that they are the work, and a progress bar that is really a `setTimeout` is precisely the
 * thing this screen exists to replace. They therefore land out of order sometimes, which is
 * honest — the statement is the slow one.
 */
export const PROBES: readonly Probe[] = [
  {
    key: 'accounts',
    icon: Landmark,
    doing: 'Finding your accounts',
    done: (f) =>
      f.accounts === 0
        ? 'No accounts on this feed'
        : `${f.accounts} ${f.accounts === 1 ? 'account' : 'accounts'} · ${inr(f.balance)}`,
  },
  {
    key: 'statement',
    icon: FileText,
    doing: 'Reading your statement',
    done: (f) =>
      f.lines === 0
        ? 'No statement lines on this feed'
        : `${f.lines}${f.more ? '+' : ''} ${f.lines === 1 && !f.more ? 'line' : 'lines'}`,
  },
  {
    key: 'consents',
    icon: ShieldCheck,
    doing: 'Checking your consents',
    done: (f) =>
      f.consents === 0 ? 'No accounts linked elsewhere' : `${f.consents} live at the aggregator`,
  },
  {
    key: 'holdings',
    icon: Wallet,
    doing: 'Looking for what you own',
    done: (f) =>
      f.holdings === 0
        ? 'Nothing on record here'
        : `${f.holdings} ${f.holdings === 1 ? 'thing' : 'things'} already recorded`,
  },
]

export const EMPTY_FACTS: Facts = {
  accounts: 0,
  balance: 0,
  lines: 0,
  more: false,
  months: 0,
  debt: 0,
  outgo: 0,
  consents: 0,
  holdings: 0,
  customer: null,
  account: null,
}

/** `2019-04-08` → `Apr 2019`. The reference shows a vintage; a full date is more than is meant. */
export function monthYear(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}
