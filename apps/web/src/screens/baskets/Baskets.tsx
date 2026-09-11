/**
 * Ready-made baskets, as one state machine.
 *
 *   input → basket → ⟨runGate⟩ ─┬→ blocked
 *                               └→ otp → done
 *
 * ## Why the gate runs here and not inside `Invest`
 *
 * `07-DECISIONS.md` §3 has one rule with no exceptions: nothing reaches an order without
 * `packages/core/src/suitability.ts` in front of it, evaluated on the same snapshot the order is
 * built from. The transaction spine in `screens/invest/` is where that lives, and the obvious move
 * is to hand a basket to it. `Invest` cannot take one: its entry point is
 * `initial: ShelfProduct` — a single scheme — and there is no way to seed its cart with three.
 *
 * Splitting a basket into three single-scheme orders would satisfy the letter of the rule and
 * break it in fact, and `lib/order.ts` says exactly why in the header of `runGate`:
 *
 * > The amount a SIP line is judged on is the basket's running monthly total, not the line's own
 * > figure … Three ₹5,000 SIPs authorised under one OTP commit ₹15,000 a month, so checking each
 * > against ₹5,000 would wave through an order none of them could fund alone.
 *
 * Three separate carts are three separate running totals, and `AFFORDABILITY` would clear a basket
 * the customer cannot fund. So the basket stays one cart and takes one trip through the gate:
 * **one `runGate` call over every included line, in order, first refusal wins.** There is no second
 * door — `OrderBlocked` is given no callback that reaches the OTP, and a gate that throws leaves
 * the customer on the basket with the reason on screen rather than letting them past.
 *
 * Nothing after the gate is written here. `OrderBlocked`, `VerifyOtp` and `OrderPlaced` are the
 * spine's own screens, imported unchanged; this file is the entry the spine does not have. If
 * `Invest` ever grows an optional `initialLines`, the three steps below collapse into a handoff and
 * this comment is the reason they existed.
 */
import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ShelfProduct, Verdict, View } from '@dhan/contracts'
import { runGate, totals } from '../../lib/order.ts'
import type { OrderLine } from '../../lib/order.ts'
import { OrderBlocked } from '../invest/OrderBlocked.tsx'
import { OrderPlaced } from '../invest/OrderPlaced.tsx'
import { VerifyOtp } from '../invest/VerifyOtp.tsx'
import { BasketInput } from './BasketInput.tsx'
import { SelectBasket } from './SelectBasket.tsx'
import { AddScheme, EditLine } from './sheets.tsx'
import { BASKETS, composeAll, eligible, firstSipDay, planStance } from './compose.ts'
import type { BasketId, Group } from './compose.ts'
import { nextOnDay } from '../../lib/order.ts'

type Step = 'input' | 'basket' | 'blocked' | 'otp' | 'done'

interface Blocked {
  line: OrderLine
  verdict: Verdict
  amountChecked: number
}

/** Six digits from the platform CSPRNG. The spine mints its own the same way. */
function mintCode(): string {
  const [n = 0] = crypto.getRandomValues(new Uint32Array(1))
  return String(n % 1_000_000).padStart(6, '0')
}

function mintReference(asOf: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3))
  const tail = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  return `IDBI-${asOf.replace(/-/g, '')}-${tail}`
}

/** The savings account a debit would come from. Biggest spendable floor wins, as in the spine. */
function debitMask(view: View): string | null {
  const best = view.accounts
    .filter((a) => a.accountType === 'Savings')
    .sort(
      (a, b) =>
        (b.effectiveAvailableBalance ?? b.currentBalance) -
        (a.effectiveAvailableBalance ?? a.currentBalance),
    )[0]
  return best?.accountNumberMasked ?? null
}

export function Baskets({
  view,
  evaluate,
  onExit,
  onSeeRecord,
  onOpenProfile,
  onOpenPlan,
}: {
  view: View
  /** The suitability gate, injected. `askBackend.evaluate` in `App.tsx`, as Discover passes it. */
  evaluate: (productId: string, monthly: number) => Promise<Verdict>
  onExit: () => void
  onSeeRecord: () => void
  /** The profile banner's arrow. Left out, the banner reads the profile back and offers no way in. */
  onOpenProfile?: (() => void) | undefined
  /** The plan card's link. Left out, the card still says what Plan decides. */
  onOpenPlan?: (() => void) | undefined
}): ReactNode {
  const { snapshot, roadmap, shelf } = view
  const asOf = snapshot.asOf
  const stance = planStance(roadmap)

  /* The roadmap's growing stage is the honest default: it is what the engine already says this
     customer can put in each month, so the amount the basket splits is not a number we invented. */
  const suggested = stance?.kind === 'now' ? stance.grow.monthly : snapshot.surplus.deployable

  const [step, setStep] = useState<Step>('input')
  const [sip, setSip] = useState(suggested)
  const [sipOn, setSipOn] = useState(true)
  const [lump, setLump] = useState(0)
  const [lumpOn, setLumpOn] = useState(false)

  const [drafts, setDrafts] = useState<Record<BasketId, Group[]> | null>(null)
  const [basketId, setBasketId] = useState<BasketId>('open')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [editing, setEditing] = useState<OrderLine | null>(null)
  const [adding, setAdding] = useState<Group['mode'] | null>(null)

  const [placing, setPlacing] = useState(false)
  const [gateError, setGateError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<Blocked | null>(null)
  const [code, setCode] = useState('')
  const [reference, setReference] = useState('')
  const [cleared, setCleared] = useState(0)

  /* Memoised because `lines` derives from it, and `?? []` is a new array on every render. */
  const groups = useMemo(() => drafts?.[basketId] ?? [], [drafts, basketId])
  const lines = useMemo(() => groups.flatMap((g) => g.lines), [groups])

  /** Every change to the basket invalidates whatever the gate last said about it. */
  const editGroups = useCallback(
    (fn: (gs: Group[]) => Group[]) => {
      setDrafts((current) =>
        current ? { ...current, [basketId]: fn(current[basketId]) } : current,
      )
      setGateError(null)
    },
    [basketId],
  )

  const mapLines = useCallback(
    (fn: (l: OrderLine) => OrderLine | null) =>
      editGroups((gs) =>
        gs.map((g) => ({
          ...g,
          lines: g.lines.map(fn).filter((l): l is OrderLine => l !== null),
        })),
      ),
    [editGroups],
  )

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

  /* ------------------------------------------------------------------ */

  if (step === 'input') {
    return (
      <BasketInput
        snapshot={snapshot}
        roadmap={roadmap}
        shelf={shelf}
        accounts={view.accounts}
        sip={sip}
        sipOn={sipOn}
        lump={lump}
        lumpOn={lumpOn}
        onSip={setSip}
        onSipOn={setSipOn}
        onLump={setLump}
        onLumpOn={setLumpOn}
        onBack={onExit}
        onOpenProfile={onOpenProfile}
        onOpenPlan={onOpenPlan}
        onContinue={() => {
          const built = composeAll(
            shelf,
            { sip: sipOn ? sip : 0, lumpsum: lumpOn ? lump : 0 },
            asOf,
          )
          const next = {} as Record<BasketId, Group[]>
          for (const b of built) next[b.spec.id] = b.groups
          setDrafts(next)
          setBasketId(BASKETS[0]?.id ?? 'open')
          setSelecting(false)
          setSelected(new Set())
          setGateError(null)
          setStep('basket')
        }}
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
        otherLines={lines.filter((l) => l.id !== blocked.line.id && l.included).length}
        onSwap={(productId) => {
          const alt = shelf.find((p) => p.productId === productId)
          const gone = blocked.line
          setBlocked(null)
          setStep('basket')
          if (!alt) {
            mapLines((l) => (l.id === gone.id ? null : l))
            return
          }
          /* The alternative takes the refused line's place in its own group, at whichever is
             larger: the amount the basket had allotted, or the scheme's own minimum. */
          mapLines((l) =>
            l.id === gone.id
              ? {
                  ...l,
                  id: `B-${basketId}-${l.mode}-${alt.productId}`,
                  productId: alt.productId,
                  name: alt.name,
                  manufacturer: alt.manufacturer,
                  category: alt.category,
                  amount: Math.max(l.amount, alt.minInvestment),
                }
              : l,
          )
        }}
        onRemove={() => {
          const gone = blocked.line
          setBlocked(null)
          setStep('basket')
          mapLines((l) => (l.id === gone.id ? null : l))
        }}
        onBack={() => {
          setBlocked(null)
          setStep('basket')
        }}
      />
    )
  }

  if (step === 'otp') {
    return (
      <VerifyOtp
        key={code}
        code={code}
        destination={debitMask(view) ?? 'your IDBI account'}
        schemes={totals(lines).count}
        amounts={totals(lines)}
        submitting={false}
        onResend={() => setCode(mintCode())}
        onVerified={() => {
          setReference(mintReference(asOf))
          setStep('done')
        }}
        onBack={() => setStep('basket')}
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

  const held = new Set(lines.map((l) => l.productId))
  const spec = BASKETS.find((b) => b.id === basketId)
  const options = shelf.filter(
    (p) => eligible(p) && (spec ? spec.holds(p) : true) && !held.has(p.productId),
  )

  return (
    <>
      <SelectBasket
        basketId={basketId}
        groups={groups}
        shelf={shelf}
        collapsed={collapsed}
        selecting={selecting}
        selected={selected}
        placing={placing}
        gateError={gateError}
        onBasket={(id) => {
          setBasketId(id)
          setSelecting(false)
          setSelected(new Set())
          setGateError(null)
        }}
        onCollapse={(mode) =>
          setCollapsed((c) => {
            const next = new Set(c)
            if (next.has(mode)) next.delete(mode)
            else next.add(mode)
            return next
          })
        }
        onSelecting={(on) => {
          setSelecting(on)
          if (!on) setSelected(new Set())
        }}
        onSelect={(id, on) =>
          setSelected((s) => {
            const next = new Set(s)
            if (on) next.add(id)
            else next.delete(id)
            return next
          })
        }
        onSelectAll={(on) => setSelected(on ? new Set(lines.map((l) => l.id)) : new Set())}
        onRemoveSelected={() => {
          const gone = selected
          mapLines((l) => (gone.has(l.id) ? null : l))
          setSelected(new Set())
          setSelecting(false)
        }}
        onToggleLine={(id) => mapLines((l) => (l.id === id ? { ...l, included: !l.included } : l))}
        onEdit={setEditing}
        onRemove={(id) => mapLines((l) => (l.id === id ? null : l))}
        onAdd={setAdding}
        onPlace={() => void place()}
        onBack={() => setStep('input')}
      />
      <EditLine
        line={editing}
        product={shelf.find((p) => p.productId === editing?.productId)}
        asOf={asOf}
        onClose={() => setEditing(null)}
        onSave={(next) => {
          mapLines((l) => (l.id === next.id ? next : l))
          setEditing(null)
        }}
      />
      <AddScheme
        open={adding !== null}
        options={options}
        onClose={() => setAdding(null)}
        onPick={(p: ShelfProduct) => {
          const mode = adding
          setAdding(null)
          if (mode === null) return
          const day = firstSipDay(asOf)
          const line: OrderLine = {
            id: `B-${basketId}-${mode}-${p.productId}`,
            productId: p.productId,
            name: p.name,
            manufacturer: p.manufacturer,
            category: p.category,
            mode,
            amount: p.minInvestment,
            startDate: mode === 'sip' ? nextOnDay(day, asOf) : null,
            installments: null,
            folio: 'new',
            included: true,
          }
          editGroups((gs) =>
            gs.map((g) => (g.mode === mode ? { ...g, lines: [...g.lines, line] } : g)),
          )
        }}
      />
    </>
  )
}
