/**
 * The transaction spine, as one state machine.
 *
 *   pick → setup → cart → ⟨gate⟩ → otp → done
 *                   ↑        ↓
 *                   └─── blocked
 *
 * One component owns the basket and the step because the basket has nowhere else to live: there
 * is no cart on the server and no route to hold in a URL, so a cart that survived a screen change
 * would have to survive a component unmounting, and it does not. Pushed rather than routed, the
 * same way `More` pushes `Record` — one flow does not need a router, and the day a second one
 * does, this is the state to lift.
 *
 * ## Where the gate is
 *
 * On `Place order`, and nowhere else. `07-DECISIONS.md` §3 requires suitability to be evaluated
 * *before* checkout can proceed, on the same snapshot the order is built from, so:
 *
 * - `runGate` is the only path from `cart` to `otp`. There is no second edge.
 * - `BLOCKED` routes to `OrderBlocked`, which is given no callback that reaches `otp`. Not
 *   disabled, not confirmed-away — absent.
 * - **A gate that cannot be reached fails closed.** If `/suitability/evaluate` throws, the order
 *   stays on the cart with the reason on screen. Proceeding on a failed check would be worse than
 *   having no check, because it would look like one.
 *
 * `evaluate` is injected rather than imported: on the server tier it is
 * `POST /api/v1/suitability/evaluate`, which runs the same `evaluate()` over the session's stored
 * snapshot **and writes the hash-chained advice record**; offline it is the lazy chunk, with the
 * verdict real and nothing recorded. Either way `@dhan/core` stays out of the main bundle, which
 * is ADR-0001.
 *
 * ## What is a suitability judgement and what is not
 *
 * The gate is the only thing here that refuses on *advice* grounds. Two other checks refuse for
 * ordinary reasons and are deliberately kept apart from it, in the cart rather than in this file:
 * an amount below the scheme's minimum, and a lump sum larger than the account's available
 * balance. Folding either into the gate would dilute what a refusal from it means.
 */
import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ShelfProduct, Verdict, View } from '@dhan/contracts'
import { Screen } from '../../components/Screen.tsx'
import { Sheet } from '../../components/Sheet.tsx'
import { Head, Leader } from '../../components/ui.tsx'
import { inr } from '../../lib/money.ts'
import { runGate, totals } from '../../lib/order.ts'
import type { OrderLine } from '../../lib/order.ts'
import { AddSchemeInvest } from './AddSchemeInvest.tsx'
import { CartReview } from './CartReview.tsx'
import type { AvailableBalance } from './CartReview.tsx'
import { OrderBlocked } from './OrderBlocked.tsx'
import { OrderPlaced } from './OrderPlaced.tsx'
import { plannedIds } from './planned.ts'
import { ShelfList } from './ShelfList.tsx'
import { VerifyOtp } from './VerifyOtp.tsx'

type Step = 'pick' | 'setup' | 'cart' | 'blocked' | 'otp' | 'done'

interface Blocked {
  line: OrderLine
  verdict: Verdict
  amountChecked: number
}

/** Six digits from the platform CSPRNG. `randomUUID` needs a secure context; this does not. */
function mintCode(): string {
  const [n = 0] = crypto.getRandomValues(new Uint32Array(1))
  return String(n % 1_000_000).padStart(6, '0')
}

/** Ours, and shaped like a reference so the layout is honest about how much room one needs. */
function mintReference(asOf: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3))
  const tail = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  return `IDBI-${asOf.replace(/-/g, '')}-${tail}`
}

/**
 * The account a debit would come out of.
 *
 * `effectiveAvailableBalance` is IDBI's own spendable floor — `AVAIL` less `LIEN`, exact to the
 * paisa on every account captured — and it is the number a "can I afford this" answer has to be
 * built on. `currentBalance` includes money a lien has already promised elsewhere.
 */
function debitAccount(view: View): AvailableBalance | null {
  const savings = view.accounts
    .filter((a) => a.accountType === 'Savings')
    .map((a) => ({
      masked: a.accountNumberMasked,
      amount: a.effectiveAvailableBalance ?? a.currentBalance,
    }))
    .sort((a, b) => b.amount - a.amount)
  return savings[0] ?? null
}

export function Invest({
  view,
  initial,
  evaluate,
  onExit,
  onSeeRecord,
}: {
  view: View
  /** The scheme tapped on Discover. The flow opens on its setup screen. */
  initial: ShelfProduct
  /** The gate. `POST /suitability/evaluate` on the server tier, the lazy chunk offline. */
  evaluate: (productId: string, monthly: number) => Promise<Verdict>
  onExit: () => void
  onSeeRecord: () => void
}): ReactNode {
  const [step, setStep] = useState<Step>('setup')
  const [lines, setLines] = useState<readonly OrderLine[]>([])
  const [product, setProduct] = useState<ShelfProduct>(initial)
  const [editing, setEditing] = useState<OrderLine | null>(null)
  const [terms, setTerms] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [gateError, setGateError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<Blocked | null>(null)
  const [breakdown, setBreakdown] = useState(false)
  const [code, setCode] = useState('')
  const [reference, setReference] = useState('')
  const [cleared, setCleared] = useState(0)

  const planned = useMemo(() => plannedIds(view.roadmap), [view.roadmap])
  const account = useMemo(() => debitAccount(view), [view])
  const asOf = view.meta.asOf

  const open = useCallback((p: ShelfProduct, line: OrderLine | null): void => {
    setProduct(p)
    setEditing(line)
    setStep('setup')
  }, [])

  const commit = useCallback((line: OrderLine): void => {
    setLines((current) => {
      const at = current.findIndex((l) => l.id === line.id)
      if (at === -1) return [...current, line]
      return current.map((l) => (l.id === line.id ? line : l))
    })
    // Any change to the basket invalidates the verdict that was reached on the old one.
    setGateError(null)
    setEditing(null)
    setStep('cart')
  }, [])

  /**
   * Checkout. The one edge into the OTP, and it goes through the rules.
   */
  const place = useCallback(async (): Promise<void> => {
    setPlacing(true)
    setGateError(null)
    try {
      const result = await runGate(lines, evaluate)
      if (result.blocked) {
        const last = result.checked[result.checked.length - 1]
        setBlocked({ ...result.blocked, amountChecked: last?.amount ?? 0 })
        setStep('blocked')
        return
      }
      const passed = result.checked.map((c) => c.verdict.passed.length)
      setCleared(passed.length > 0 ? Math.min(...passed) : 0)
      setCode(mintCode())
      setStep('otp')
    } catch {
      // Fail closed. A check that did not run is not a check that passed.
      setGateError(
        'The suitability check could not be run, so nothing has been placed. Try again in a moment.',
      )
    } finally {
      setPlacing(false)
    }
  }, [lines, evaluate])

  const drop = useCallback((id: string): void => {
    setLines((current) => current.filter((l) => l.id !== id))
    setGateError(null)
  }, [])

  /* ------------------------------------------------------------------ */

  if (step === 'pick') {
    return (
      <Screen
        header={
          <Head
            onBack={() => setStep('cart')}
            backLabel="Back to the order"
            title="Add scheme"
            sub="Everything IDBI can put you into"
          />
        }
      >
        <ShelfList
          shelf={view.shelf}
          planned={planned}
          onPick={(p) => {
            open(p, null)
          }}
        />
      </Screen>
    )
  }

  if (step === 'setup') {
    return (
      <AddSchemeInvest
        product={product}
        planned={planned.has(product.productId)}
        asOf={asOf}
        editing={editing}
        onBack={() => {
          setEditing(null)
          if (lines.length > 0) setStep('cart')
          else onExit()
        }}
        onCommit={commit}
      />
    )
  }

  if (step === 'blocked' && blocked) {
    const rule = view.rules.find((r) => r.id === blocked.verdict.ruleId)
    return (
      <OrderBlocked
        line={blocked.line}
        verdict={blocked.verdict}
        amountChecked={blocked.amountChecked}
        ruleDescription={rule?.description ?? null}
        otherLines={lines.filter((l) => l.id !== blocked.line.id).length}
        onSwap={(productId) => {
          const alternative = view.shelf.find((p) => p.productId === productId)
          drop(blocked.line.id)
          setBlocked(null)
          if (alternative) open(alternative, null)
          else setStep('cart')
        }}
        onRemove={() => {
          drop(blocked.line.id)
          setBlocked(null)
          setStep('cart')
        }}
        onBack={() => {
          setBlocked(null)
          setStep('cart')
        }}
      />
    )
  }

  if (step === 'otp') {
    return (
      <VerifyOtp
        /* A new code is a new mount: the countdown, the digits and any error all restart. */
        key={code}
        code={code}
        destination={account?.masked ?? 'your IDBI account'}
        schemes={totals(lines).count}
        amounts={totals(lines)}
        submitting={false}
        onResend={() => setCode(mintCode())}
        onVerified={() => {
          setReference(mintReference(asOf))
          setStep('done')
        }}
        onBack={() => setStep('cart')}
      />
    )
  }

  if (step === 'done') {
    return (
      <OrderPlaced
        lines={lines}
        reference={reference}
        asOf={asOf}
        rulesPassed={cleared}
        onSeeRecord={onSeeRecord}
        onDone={onExit}
      />
    )
  }

  const t = totals(lines)
  return (
    <>
      <CartReview
        lines={lines}
        available={account}
        terms={terms}
        placing={placing}
        gateError={gateError}
        onSetTerms={setTerms}
        onToggle={(id) => {
          setLines((current) =>
            current.map((l) => (l.id === id ? { ...l, included: !l.included } : l)),
          )
          setGateError(null)
        }}
        onEdit={(line) => {
          const p = view.shelf.find((s) => s.productId === line.productId)
          if (p) open(p, line)
        }}
        onRemove={drop}
        onAddMore={() => setStep('pick')}
        onBreakdown={() => setBreakdown(true)}
        onPlace={() => void place()}
        onBack={onExit}
      />
      <Sheet
        open={breakdown}
        onClose={() => setBreakdown(false)}
        title="What is payable"
        sub="A lump sum leaves today; a SIP leaves on its start date and every month after it."
      >
        <div className="pb-2">
          {lines
            .filter((l) => l.included)
            .map((l) => (
              <Leader
                key={l.id}
                filled={l.mode === 'lumpsum'}
                label={l.name}
                value={l.mode === 'lumpsum' ? `${inr(l.amount)} today` : `${inr(l.amount)}/month`}
              />
            ))}
          <Leader total label="Today" value={inr(t.today)} />
          <Leader total label="Every month" value={inr(t.monthly)} />
        </div>
      </Sheet>
    </>
  )
}
