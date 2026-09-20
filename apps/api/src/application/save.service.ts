/**
 * The savings pot: read it, switch one hack on or off, put money in by hand.
 *
 * There is no scheduler behind this product and there must not be one. The clock is simulated
 * and moves only when a reviewer moves it, so a cron that woke up at midnight would be awake in
 * the wrong universe — it would accrue against wall-clock Tuesdays while the session sat on a
 * simulated March. The pot therefore catches up lazily, inside whichever request happened to
 * notice that the simulated day had changed, and that is what `accrued()` below is.
 *
 * Doing it that way is only safe because `accrue` is deterministic over a date range: the same
 * range over the same statement yields the same deposits with the same ids, every time. So the
 * read runs it from `save.accruedTo` — the last simulated day already paid for, exclusive — to
 * `session.asOf`, inclusive, and moves `accruedTo` to `asOf` in the same write. A second read on
 * the same simulated day then asks for the range `(asOf, asOf]`, which is empty, and adds
 * nothing; a read after the reviewer jumps a month asks for the thirty days in between and adds
 * each of them exactly once. `accrue` also filters against the ids already in the pot, so even a
 * range covered twice — a clock wound backwards, a replayed request — cannot double-credit. Two
 * defences rather than one, because the failure here is money appearing out of nowhere on a
 * screen somebody is watching.
 *
 * The write happens only when the range produced something. A read that generated no deposits
 * leaves `accruedTo` where it was, which costs a slightly wider recomputation on the next read
 * and buys the common case — opening the app twice in a simulated day — no database write at
 * all.
 *
 * `accruedTo` is also stamped whenever the hacks change, and that is the other half of the
 * design: a hack starts earning on the day it is switched on, never retroactively. Turning
 * round-ups on does not reach back through four weeks of coffee and produce ₹900 the customer
 * never set aside.
 */
import {
  CHALLENGE_WINDOW_DAYS,
  SAVE_HACK_IDS,
  accrue,
  addDays,
  daysBetween,
  idFor,
  interestEarned,
  potTotal,
  projectHacks,
  recommendedWeeklySave,
  savingsRatePct,
  topSpendTargets,
} from '@dhan/core'
import type { SaveDeposit, SaveHackId, SaveHacks, SaveState } from '@dhan/core'
import type { SaveHackCard, SaveHackPatch, SaveView } from '@dhan/contracts'
import type { AdvisoryService, ServerView } from './advisory.service.ts'
import { SaveHackUnavailable, StaleClock } from './errors.ts'
import type { Clock, Session, SessionStore } from '../ports/index.ts'

/**
 * Weeks in a month, the same 4.345 `recommendedWeeklySave` divides by.
 *
 * Restated here rather than exported from core because the two uses are opposite ends of one
 * conversion and both have to survive the day somebody decides a month is 4.3 weeks. The pot's
 * projected monthly inflow is the four-week figure scaled by `WEEKS_IN_MONTH / WINDOW_WEEKS`,
 * so "what it put aside over the last four weeks" and "what it puts in each month" cannot
 * differ by the 8.6% that treating four weeks as a month would introduce.
 */
const WEEKS_IN_MONTH = 4.345
const WINDOW_WEEKS = 4

/** How many merchants the swear jar offers to be set over. Five fits the sheet without paging. */
const SWEAR_JAR_CANDIDATES = 5

/**
 * How much of the pot's history the Activity list is given.
 *
 * Round-ups accrue one deposit per purchase, so a month of an active pot is eighty-odd rows
 * and a year is a thousand — a feed nobody scrolls, rendered in full on every read. The cap is
 * the same twenty the challenge's transaction list uses, and it is safe because it applies only
 * to the feed: `saved`, `progress` and the interest are all summed over the whole stored list
 * before this slice is taken, so the headline figure never disagrees with the balance.
 */
const MAX_LISTED_DEPOSITS = 20

const HACK_TITLE: Record<SaveHackId, string> = {
  roundups: 'Round-ups',
  set_forget: 'Set & forget',
  smart_save: 'Smart Save',
  swear_jar: 'Swear jar',
  payday_saver: 'Payday saver',
}

/**
 * The sentence under the title while the hack is off.
 *
 * Written here and not on the client because the card's second line changes meaning with the
 * state — it is the configuration when the hack is on and the pitch when it is off — and two
 * clients writing that sentence independently is one editorial decision taken twice.
 */
const HACK_PITCH: Record<SaveHackId, string> = {
  roundups: 'Round every purchase up to the next ₹10 and keep the difference.',
  set_forget: 'The same amount aside every Monday, whatever the week turned out to look like.',
  smart_save: 'Let the engine pick the amount from what your spending can actually spare.',
  swear_jar: 'Charge yourself a fixed amount every time you spend somewhere you would rather not.',
  payday_saver: 'Take a slice off the top of every salary credit, before it is spendable.',
}

export interface SaveServiceDeps {
  sessions: SessionStore
  advisory: AdvisoryService
  /** Wall clock, and only ever for the id of a deposit the customer made by hand. */
  clock: Clock
}

/** The session after any catch-up, the view its figures came from, and the pot as it now stands. */
interface AccruedPot {
  session: Session
  server: ServerView
  state: SaveState
  recommendedWeekly: number
}

export class SaveService {
  private readonly deps: SaveServiceDeps

  constructor(deps: SaveServiceDeps) {
    this.deps = deps
  }

  async view(session: Session): Promise<SaveView> {
    return this.compose(await this.accrued(session))
  }

  /**
   * One hack, set whole, with whatever configuration it had kept where the body is silent.
   *
   * The pot is accrued first and only then are the new settings written, so the days already
   * lived are paid for at the settings they were lived under. Changing the weekly amount on a
   * Thursday does not reprice the Monday that has already landed.
   */
  async setHack(session: Session, patch: SaveHackPatch): Promise<SaveView> {
    const pot = await this.accrued(session)
    const hacks = withPatch(pot.state.hacks, patch)
    this.refuseUnrunnable(pot, patch, hacks)

    const updated = await this.patch(pot.session, {
      save: { hacks, deposits: pot.state.deposits, accruedTo: pot.session.asOf },
    })
    return this.compose({ ...pot, session: updated, state: updated.save })
  }

  /** Money the customer moved themselves, on top of whatever the hacks are doing. */
  async deposit(session: Session, amount: number): Promise<SaveView> {
    const pot = await this.accrued(session)
    /*
     * The id is the wall-clock instant, not the simulated date.
     *
     * A customer may genuinely add to their goal twice in one afternoon, and both belong in the
     * pot — so the id cannot be derived from `asOf` the way a hack's is. The double-tap this
     * would otherwise expose is caught a layer up instead: the route is `idempotent: true`, and
     * the registrar replays the stored answer for a repeated Idempotency-Key without ever
     * reaching this method.
     */
    const made: SaveDeposit = {
      id: idFor('manual', this.deps.clock.now().toISOString()),
      atSim: pot.session.asOf,
      amount: Math.round(amount),
      source: 'manual',
      note: 'Added to your goal',
    }

    const updated = await this.patch(pot.session, {
      save: { ...pot.state, deposits: [...pot.state.deposits, made] },
    })
    return this.compose({ ...pot, session: updated, state: updated.save })
  }

  /**
   * The pot brought up to the simulated today, and everything the view is built out of.
   *
   * The advisory view is read rather than recomputed: the goal the pot is filling, the surplus
   * the recommended weekly amount is sized against and the salary the payday saver rides on are
   * all in it already, and deriving a second set here would be a second set free to disagree
   * with the Plan tab. Save state is deliberately *not* folded into the snapshot — the snapshot
   * is memoised on the statements and the engine version, and a pot that changed it would
   * invalidate the memo on every deposit.
   */
  private async accrued(session: Session): Promise<AccruedPot> {
    const server = await this.deps.advisory.view(session)
    const recommendedWeekly = recommendedWeeklySave(server.snapshot.surplus.deployable)
    const state = session.save

    const fresh = accrue(state, server.file.transactions, {
      from: state.accruedTo ?? session.asOf,
      to: session.asOf,
      recommendedWeekly,
    })
    if (fresh.length === 0) return { session, server, state, recommendedWeekly }

    const updated = await this.patch(session, {
      save: {
        hacks: state.hacks,
        deposits: [...state.deposits, ...fresh],
        accruedTo: session.asOf,
      },
    })
    return { session: updated, server, state: updated.save, recommendedWeekly }
  }

  /**
   * The two hacks that can be switched on with nothing to run on.
   *
   * Both are refused rather than accepted and left idle. A swear jar with no merchant and a
   * payday saver over an income that arrives in unpredictable lumps would each sit on the
   * screen reading "on" and put nothing aside for weeks, and a savings feature the customer
   * has stopped believing is worse than one they never switched on.
   */
  private refuseUnrunnable(pot: AccruedPot, patch: SaveHackPatch, hacks: SaveHacks): void {
    if (patch.id === 'swear_jar' && hacks.swearJar.enabled && hacks.swearJar.merchant === null) {
      throw new SaveHackUnavailable(
        'The swear jar needs a merchant to charge you for. Pick one and switch it on again.',
      )
    }
    if (patch.id === 'payday_saver' && hacks.paydaySaver.enabled) {
      const income = pot.server.snapshot.income
      if (income.stability !== 'regular') {
        throw new SaveHackUnavailable(
          'Your income arrives in uneven amounts, so there is no salary credit to take a ' +
            'percentage off. Set & forget puts money aside on a week of your choosing instead.',
        )
      }
    }
  }

  /** Everything the Save screens read, from a pot already brought up to date. No I/O. */
  private compose(pot: AccruedPot): SaveView {
    const { session, server, state, recommendedWeekly } = pot
    const asOf = session.asOf
    const txns = server.file.transactions
    const window = { from: addDays(asOf, -CHALLENGE_WINDOW_DAYS), to: asOf, recommendedWeekly }

    const candidates = topSpendTargets(
      txns,
      asOf,
      CHALLENGE_WINDOW_DAYS,
      SWEAR_JAR_CANDIDATES,
    ).merchants

    /*
     * One projection, with every hack forced on.
     *
     * The five rules do not interact — a round-up is computed from a transaction and a Monday
     * deposit from a date, and neither reads the others — so what a hack would have put aside
     * is the same figure whether or not its neighbours were running. That means the card list's
     * two questions, "what did this put aside" for the ones that are on and "what would it
     * have" for the ones that are off, are answered by a single pass over the statement instead
     * of six.
     */
    const everyHackOn = allEnabled(hacksWithFallbackMerchant(state.hacks, candidates))
    const projected = new Map(projectHacks(everyHackOn, txns, window).map((p) => [p.id, p]))

    const cards: SaveHackCard[] = SAVE_HACK_IDS.map((id) => {
      const row = projected.get(id)
      const enabled = isEnabled(state.hacks, id)
      return {
        id,
        title: HACK_TITLE[id],
        detail: enabled ? (row?.note ?? HACK_PITCH[id]) : HACK_PITCH[id],
        enabled,
        lastFourWeeks: row?.amount ?? 0,
      }
    })

    const monthlyInflow = Math.round(
      (cards.filter((c) => c.enabled).reduce((sum, c) => sum + c.lastFourWeeks, 0) *
        WEEKS_IN_MONTH) /
        WINDOW_WEEKS,
    )

    const goal = server.goal
    const saved = potTotal(state.deposits)
    const income = server.snapshot.income

    return {
      pot: {
        purpose: goal.purpose ?? 'Your goal',
        target: goal.targetAmount,
        saved,
        targetDate: goal.targetDate,
        daysLeft: Math.max(0, daysBetween(asOf, goal.targetDate)),
        // Served rather than divided on each client, because a zero target is a real state
        // early in a session and every client would otherwise guard the division separately.
        progress: goal.targetAmount > 0 ? Math.min(1, saved / goal.targetAmount) : 0,
        monthlyInflow,
      },
      hacks: state.hacks,
      cards,
      // Newest first, and only the most recent page of them: the Activity list is a feed, and
      // the deposits are stored in the order they accrued, which is oldest first.
      deposits: [...state.deposits]
        .sort((a, b) => (a.atSim < b.atSim ? 1 : a.atSim > b.atSim ? -1 : 0))
        .slice(0, MAX_LISTED_DEPOSITS),
      interest: {
        ratePct: savingsRatePct(saved),
        earned: interestEarned(state.deposits, asOf),
        asOf,
      },
      recommendedWeekly,
      swearJarCandidates: candidates.map((c) => ({
        merchant: c.target.name,
        fourWeekSpend: c.spent,
      })),
      payday: {
        // The observed salary where the statement carries one, and the declared figure where it
        // does not — IDBI's feed names no payroll credit, and a payday saver sized at 5% of zero
        // is a hack that silently never fires.
        monthly:
          income.monthly > 0 ? income.monthly : server.snapshot.customer.declaredMonthlyIncome,
        stability: income.stability,
        nextPayDate: income.nextPayDate,
        // The nominal day, or the one the next pay date falls on where no series was recognised.
        payDay: income.payDay ?? Number(income.nextPayDate.slice(8, 10)),
      },
      asOf,
    }
  }

  /** A patch against the version the caller holds; a stale caller is told to refetch. */
  private async patch(
    session: Session,
    patch: Parameters<SessionStore['patch']>[1],
  ): Promise<Session> {
    const updated = await this.deps.sessions.patch(session.id, patch, session.version)
    if (!updated) {
      const current = await this.deps.sessions.getById(session.id)
      throw new StaleClock(current?.version ?? session.version)
    }
    return updated
  }
}

function isEnabled(hacks: SaveHacks, id: SaveHackId): boolean {
  switch (id) {
    case 'roundups':
      return hacks.roundups.enabled
    case 'set_forget':
      return hacks.setForget.enabled
    case 'smart_save':
      return hacks.smartSave.enabled
    case 'swear_jar':
      return hacks.swearJar.enabled
    case 'payday_saver':
      return hacks.paydaySaver.enabled
  }
}

/**
 * The counterfactual needs a merchant for a jar that has never been set, or it answers ₹0 to
 * "what would this have put aside" — which reads as "nothing to save here" rather than as "you
 * have not chosen a merchant yet". The biggest four-week merchant is the one the screen would
 * offer first anyway. A jar the customer has already set keeps its own.
 */
function hacksWithFallbackMerchant(
  hacks: SaveHacks,
  candidates: readonly { target: { name: string } }[],
): SaveHacks {
  if (hacks.swearJar.merchant !== null) return hacks
  const first = candidates[0]
  if (first === undefined) return hacks
  return { ...hacks, swearJar: { ...hacks.swearJar, merchant: first.target.name } }
}

function allEnabled(hacks: SaveHacks): SaveHacks {
  return {
    roundups: { ...hacks.roundups, enabled: true },
    setForget: { ...hacks.setForget, enabled: true },
    smartSave: { ...hacks.smartSave, enabled: true },
    swearJar: { ...hacks.swearJar, enabled: true },
    paydaySaver: { ...hacks.paydaySaver, enabled: true },
  }
}

/**
 * One hack replaced whole, the other four untouched.
 *
 * Every configuration field on the wire is optional and an absent one keeps what was there, so
 * the customer who turns Set & Forget back on next month does not have to choose ₹500 again.
 * `merchant` is the one field where absent and explicitly null differ — clearing the jar's
 * merchant is a thing the screen can ask for — so it is compared against `undefined` rather
 * than coalesced, which would silently turn a clear into a no-op.
 */
function withPatch(hacks: SaveHacks, patch: SaveHackPatch): SaveHacks {
  switch (patch.id) {
    case 'roundups':
      return {
        ...hacks,
        roundups: {
          enabled: patch.enabled,
          toNearest: patch.toNearest ?? hacks.roundups.toNearest,
        },
      }
    case 'set_forget':
      return {
        ...hacks,
        setForget: { enabled: patch.enabled, weekly: patch.weekly ?? hacks.setForget.weekly },
      }
    case 'smart_save':
      return {
        ...hacks,
        smartSave: { enabled: patch.enabled, level: patch.level ?? hacks.smartSave.level },
      }
    case 'swear_jar':
      return {
        ...hacks,
        swearJar: {
          enabled: patch.enabled,
          merchant: patch.merchant === undefined ? hacks.swearJar.merchant : patch.merchant,
          perSpend: patch.perSpend ?? hacks.swearJar.perSpend,
        },
      }
    case 'payday_saver':
      return {
        ...hacks,
        paydaySaver: {
          enabled: patch.enabled,
          percent: patch.percent ?? hacks.paydaySaver.percent,
        },
      }
  }
}
