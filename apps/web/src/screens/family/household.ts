/**
 * The household, and the one thing this file exists to keep honest.
 *
 * SmartWealth's Family Wealth surface links customers to each other and adds up what the whole
 * family holds. **This app has no household.** `snapshot.customer.dependents` is an integer and
 * there is nothing else — no relationship, no second customer file, no consent record between two
 * CIFs, no endpoint that would return one. `07-DECISIONS.md` §5 was reversed and says to build the
 * surface anyway, with the members and their aggregate as demo state, under a rule that does not
 * move: *a screen may be driven by demo data, but it may never claim the data is real.*
 *
 * So the split is drawn here, in the model, rather than left to whichever card happens to render
 * a figure:
 *
 * - **One member is the customer and every number on that member is computed.** It is
 *   `portfolioOf()` — the same declared-holdings block the Dashboard's Holdings pane reads, from
 *   the same fetch, so the figure on this screen and the figure on that one are the same figure.
 *   Nothing about the self member is invented.
 * - **Every other member is a demo person** and carries `real: false` all the way to the pixel.
 *   `Household.demoValue` and `.realValue` are kept apart so a screen can say which part of a
 *   total it computed, which is the sentence the hero card actually prints.
 *
 * A household total that mixes the two is still drawn, because that is the feature, and it is
 * drawn *labelled*: the aggregate is honest as long as the screen never lets it pass for a figure
 * IDBI holds. If the demo members are ever removed the total collapses to the customer's own and
 * the split sentence says so — the arithmetic does not need a special case for it.
 *
 * ## What the reference has here that this cannot produce
 *
 * - **XIRR.** Every member card and every holding card in the frames carries one. There is no
 *   price feed in this app and no dated cashflow behind a declared holding — `portfolio.ts` is
 *   explicit that `currentValue` is what the customer typed — so a money-weighted return has
 *   neither the prices nor the dates it needs. The cell is dropped rather than filled. Its slot in
 *   the 2×2 takes the monthly mandate, which is a real figure sitting in the same block.
 * - **"Market Value".** Same reason, and it is a wording rather than a gap: the label everywhere
 *   on this surface is `Recorded value`, matching the Dashboard.
 * - **A `Demat` chip.** There is no demat feed. The product chips are the four groups this app
 *   actually models.
 *
 * No JSX and no runtime imports, for the reason `portfolio.ts` gives for being the same: the parts
 * of a household that can be wrong in a way nobody notices are all arithmetic — a total that
 * double-counts the self member, a gain quoted over rows that carry no cost, a "yours" figure that
 * quietly includes a demo person. Those are in `household.test.ts`.
 */
import type { GroupId, Portfolio, Position } from '../dashboard/portfolio.ts'
import { GROUP_CATALOGUE } from '../dashboard/portfolio.ts'

/* ---------------------------------------------------------------- Model */

/** One line of money, however it was arrived at. */
export interface Figures {
  /** What it is recorded as being worth. Never called a market value; there is no price feed. */
  value: number
  /** Null where no cost was recorded against it — which is not the same as a zero. */
  invested: number | null
  /** Only quotable over the rows that carry a cost. Null where none do. */
  gain: number | null
  gainPct: number | null
  /** What is going in every month under a live mandate. */
  sipMonthly: number
}

export interface HouseholdHolding extends Figures {
  id: string
  memberId: string
  memberName: string
  name: string
  group: GroupId
  groupLabel: string
  /** False on every row that belongs to a demo member. Drawn, never inferred. */
  real: boolean
}

export interface Member extends Figures {
  id: string
  name: string
  /** The customer this session belongs to. Exactly one member is the self member. */
  self: boolean
  /** True only where the figures were computed from statements this app actually read. */
  real: boolean
  holdings: readonly HouseholdHolding[]
}

export interface Household extends Figures {
  members: readonly Member[]
  holdings: readonly HouseholdHolding[]
  /** The part of `value` computed from the customer's own record. */
  realValue: number
  /** The part of `value` that is demo state. `realValue + demoValue === value`. */
  demoValue: number
  /** How many of `members` are demo people. */
  demoMembers: number
  /** The groups present across the household, in catalogue order. For the chip row. */
  groups: readonly { id: GroupId; label: string }[]
}

/** Somebody who has asked to be linked, and has not been answered. */
export interface LinkRequest {
  id: string
  name: string
  /** Their masked Customer ID, as the request carries it. */
  customerId: string
}

/* ---------------------------------------------------------------- The demo people */

/**
 * Everybody this surface invents, written out in one place so it can be counted.
 *
 * Five people. Three are in the household when the screen opens; the other two are the pending
 * requests — **the same five records**, which is the point of listing them together. Accepting
 * `Vandana Gupta` links `Vandana Gupta`, with the holdings declared here and no others. The
 * alternative, minting a member when a request is accepted, would put somebody on the screen that
 * this file never declared, and this is the one file that has to be able to account for every
 * invented rupee on the surface.
 *
 * The figures are deliberately ordinary. The point of the screen is the design, and a demo
 * aggregate that dwarfs the customer's real one would make the real one look like a rounding
 * error — which is the opposite of what the split sentence in the hero is for.
 *
 * `Vandana Gupta` and `Arun Gupta` are the two names the reference's own accept/decline frame
 * carries. They are kept: they are already demo names in the source, and this is already the demo
 * half of the screen.
 */
interface DemoHolding {
  name: string
  group: GroupId
  value: number
  invested: number | null
  sipMonthly: number
}

interface DemoMember {
  id: string
  name: string
  /** What a request from them shows, and what a Customer ID looks like on this screen. */
  customerId: string
  holdings: readonly DemoHolding[]
}

export const DEMO_MEMBERS: readonly DemoMember[] = [
  {
    id: 'demo-lakshmi',
    name: 'Lakshmi Iyer',
    customerId: '••••1174',
    holdings: [
      {
        name: 'Balanced advantage fund',
        group: 'funds',
        value: 196000,
        invested: 170000,
        sipMonthly: 3000,
      },
      {
        name: 'Five-year term deposit',
        group: 'deposits',
        value: 120000,
        invested: 112000,
        sipMonthly: 0,
      },
      {
        name: 'Public Provident Fund',
        group: 'retirement',
        value: 88000,
        invested: 80000,
        sipMonthly: 0,
      },
    ],
  },
  {
    id: 'demo-vikram',
    name: 'Vikram Iyer',
    customerId: '••••3390',
    holdings: [
      {
        name: 'Large cap index fund',
        group: 'funds',
        value: 148000,
        invested: 132000,
        sipMonthly: 3000,
      },
      {
        name: 'National Pension System',
        group: 'retirement',
        value: 62000,
        invested: 58000,
        sipMonthly: 1500,
      },
    ],
  },
  {
    id: 'demo-sneha',
    name: 'Sneha Iyer',
    customerId: '••••8021',
    holdings: [
      {
        name: 'Short duration debt fund',
        group: 'funds',
        value: 46000,
        invested: 45000,
        sipMonthly: 2000,
      },
      {
        name: 'Recurring deposit',
        group: 'deposits',
        value: 24000,
        invested: 23000,
        sipMonthly: 2000,
      },
    ],
  },
  {
    id: 'demo-vandana',
    name: 'Vandana Gupta',
    customerId: '••••4038',
    holdings: [
      {
        name: 'ELSS tax saver fund',
        group: 'funds',
        value: 132000,
        invested: 115000,
        sipMonthly: 2500,
      },
      {
        name: 'Two-year term deposit',
        group: 'deposits',
        value: 75000,
        invested: 70000,
        sipMonthly: 0,
      },
    ],
  },
  {
    id: 'demo-arun',
    name: 'Arun Gupta',
    customerId: '••••7261',
    holdings: [
      {
        name: 'Public Provident Fund',
        group: 'retirement',
        value: 164000,
        invested: 150000,
        sipMonthly: 0,
      },
    ],
  },
]

/** Who is in the household when the screen opens. The rest are the pending requests. */
export const DEFAULT_LINKED: readonly string[] = ['demo-lakshmi', 'demo-vikram', 'demo-sneha']

/**
 * The inbound requests: the demo members not linked yet, as requests from them.
 *
 * A request's id **is** its member's id, so accepting one is `linked + request.id` and cannot link
 * somebody other than the person whose name was on the button.
 */
export const DEMO_REQUESTS: readonly LinkRequest[] = DEMO_MEMBERS.filter(
  (m) => !DEFAULT_LINKED.includes(m.id),
).map((m) => ({ id: m.id, name: m.name, customerId: m.customerId }))

const LABEL_OF: Record<GroupId, string> = Object.fromEntries(
  GROUP_CATALOGUE.map((g) => [g.id, g.label]),
) as Record<GroupId, string>

/* ---------------------------------------------------------------- Arithmetic */

/**
 * Roll a set of rows up into one line of figures.
 *
 * The gain rule is `portfolio.ts`'s and is repeated rather than approximated: a gain is quoted
 * only over the rows that carry a cost, and against the value of *those* rows. Comparing a whole
 * household's value against the invested amount of half of it is the arithmetic that makes a flat
 * portfolio look like it doubled.
 */
function roll(rows: readonly Figures[]): Figures {
  const value = rows.reduce((n, r) => n + r.value, 0)
  const priced = rows.filter((r) => r.invested !== null)
  const invested = priced.length > 0 ? priced.reduce((n, r) => n + (r.invested ?? 0), 0) : null
  const pricedValue = priced.reduce((n, r) => n + r.value, 0)
  const gain = invested === null ? null : pricedValue - invested
  return {
    value,
    invested,
    gain,
    gainPct: gain === null || invested === null || invested <= 0 ? null : (gain / invested) * 100,
    sipMonthly: rows.reduce((n, r) => n + r.sipMonthly, 0),
  }
}

/**
 * The customer's own positions, as household holdings.
 *
 * Cover is left out and that is the same call `portfolio.ts` makes for the same reason: a sum
 * assured is not capital, and adding a term policy to a household total is the single worst
 * arithmetic this surface could do. Cover stays on the Dashboard's Holdings pane where it is
 * labelled as cover.
 */
function ownHoldings(
  positions: readonly Position[],
  memberId: string,
  memberName: string,
): HouseholdHolding[] {
  return positions
    .filter((p) => p.group !== 'cover')
    .map((p) => ({
      id: `${memberId}:${p.id}`,
      memberId,
      memberName,
      name: p.name,
      group: p.group,
      groupLabel: LABEL_OF[p.group],
      real: true,
      value: p.value,
      invested: p.invested,
      gain: p.invested === null ? null : p.value - p.invested,
      gainPct:
        p.invested === null || p.invested <= 0 ? null : ((p.value - p.invested) / p.invested) * 100,
      sipMonthly: p.sipMonthly,
    }))
}

function demoHoldings(member: DemoMember): HouseholdHolding[] {
  return member.holdings.map((h, i) => ({
    id: `${member.id}:${String(i)}`,
    memberId: member.id,
    memberName: member.name,
    name: h.name,
    group: h.group,
    groupLabel: LABEL_OF[h.group],
    real: false,
    value: h.value,
    invested: h.invested,
    gain: h.invested === null ? null : h.value - h.invested,
    gainPct:
      h.invested === null || h.invested <= 0 ? null : ((h.value - h.invested) / h.invested) * 100,
    sipMonthly: h.sipMonthly,
  }))
}

/**
 * Build the household.
 *
 * `portfolio` is null while the holdings block is loading or after it failed. The self member is
 * still present in that case, with nothing in it — the screen shows the household it *does* know
 * about rather than an empty page, and the split sentence then reads that none of the total is
 * yours, which is true.
 *
 * `linked` is the ids of the demo members currently in the household. It is state the screen owns:
 * accepting a request adds one, the trash icon removes one. The default is all of them.
 */
export function householdOf(
  self: { id: string; name: string },
  portfolio: Portfolio | null,
  linked: readonly string[] = DEFAULT_LINKED,
): Household {
  const own = portfolio === null ? [] : ownHoldings(portfolio.positions, self.id, self.name)
  const selfMember: Member = {
    id: self.id,
    name: self.name,
    self: true,
    real: true,
    holdings: own,
    ...roll(own),
  }

  const demo: Member[] = DEMO_MEMBERS.filter((m) => linked.includes(m.id)).map((m) => {
    const rows = demoHoldings(m)
    return { id: m.id, name: m.name, self: false, real: false, holdings: rows, ...roll(rows) }
  })

  const members = [selfMember, ...demo]
  const holdings = members.flatMap((m) => [...m.holdings])
  const groups = GROUP_CATALOGUE.filter((g) => holdings.some((h) => h.group === g.id)).map((g) => ({
    id: g.id,
    label: g.label,
  }))

  return {
    members,
    holdings,
    ...roll(holdings),
    realValue: selfMember.value,
    demoValue: demo.reduce((n, m) => n + m.value, 0),
    demoMembers: demo.length,
    groups,
  }
}

/* ---------------------------------------------------------------- Consent */

/**
 * The re-request cooldown, in days.
 *
 * `05-family-request-sent.md` is where this feature's consent rules are actually written down, and
 * they are two: nothing is linked until the other person accepts, and a declined request cannot be
 * re-sent for five days. Both are kept, and the date is computed off the *simulated* clock rather
 * than off `Date.now()` — so advancing the clock on the Dashboard moves this date with it, which
 * is the only way a cooldown means anything in a demo.
 */
export const COOLDOWN_DAYS = 5

/** `YYYY-MM-DD` plus n days, via UTC so no local timezone can move the date. */
export function addDays(iso: string, days: number): string {
  const at = new Date(`${iso}T00:00:00.000Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/**
 * The last four digits of a Customer ID, masked the way the request-sent screen prints it.
 *
 * The reference masks as `****4038` on a screen where `129209661` was typed — a placeholder
 * inconsistency its own spec flags, not a masking rule. Ours masks what was actually entered, so
 * the two screens agree.
 */
export function maskCustomerId(id: string): string {
  const digits = id.replace(/\D/g, '')
  return digits.length <= 4 ? `••••${digits}` : `••••${digits.slice(-4)}`
}

/** A Customer ID is eight to twelve digits. The only check there is; there is no directory. */
export function isCustomerId(id: string): boolean {
  return /^\d{8,12}$/.test(id.trim())
}
