import {
  ChevronDown,
  CircleAlert,
  Eye,
  EyeOff,
  Hand,
  KeyRound,
  Landmark,
  ListOrdered,
  LockKeyhole,
  ShieldCheck,
  TimerReset,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { useId, useRef, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { isApiError } from '../../api/client.ts'
import { useSignIn } from '../../api/queries.ts'
import { getEndReason, useSession } from '../../api/session.ts'
import { cn } from '../../lib/cn.ts'
import { duration, ease } from '../../lib/motion.ts'
import {
  Avatar,
  Button,
  Chip,
  Field,
  IconButton,
  Input,
  describeError,
  type ChipTone,
} from '../../ui/index.ts'
import { DEMO_DESKS, type DemoDesk } from './demo-access.ts'

/**
 * Sign in. A split screen: the form on the left, and on the right what the console is for over
 * the deep IDBI green, the three things it does, and a call list drawn in words, not figures.
 * Nothing on this page is a number from the book; there is no RM yet to show one to.
 *
 * Both columns hang from the same top line, so the two headings start level and the form grows
 * downward when Demo access opens instead of jumping up to stay centred.
 */
export function Login() {
  const session = useSession()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (session) return <Navigate to={from} replace />

  return (
    <div className="grid min-h-screen grid-cols-1 gap-4 bg-ground p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
      <FormPanel redirectTo={from} />
      <StoryPanel />
    </div>
  )
}

/** Where both columns' content starts, below the lockup: one line, so the headings sit level. */
const CONTENT_TOP = 'pt-[clamp(5.5rem,13vh,8.5rem)]'

/**
 * Whose desk this is, set in type: the product's name, then the bank's on its own quiet line
 * under it, rather than a label stacked above the name. Deliberately not the bank's logo, which
 * is IDBI's to supply.
 */
function Lockup() {
  return (
    <div className="grid gap-0.5">
      <p className="text-title text-ink">Dhan Sarthi</p>
      <p className="text-caption-plain text-ink-faint">
        For <span className="font-medium text-brand">IDBI Bank</span> · Relationship Manager Desk
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------- The form */

function signInError(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 401) return 'That employee number and password do not match.'
    if (error.code === 'RATE_LIMITED') {
      return 'Too many attempts from this browser. Wait a few minutes, then try again.'
    }
    if (error.status === 400) return 'Enter your employee number and password.'
  }
  return describeError(error)
}

function FormPanel({ redirectTo }: { redirectTo: string }) {
  const navigate = useNavigate()
  const signIn = useSignIn()
  const [employeeNo, setEmployeeNo] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [missing, setMissing] = useState<{ employeeNo?: boolean; password?: boolean }>({})
  const [ended] = useState(getEndReason)
  const submitRef = useRef<HTMLButtonElement>(null)
  const employeeRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    const next = { employeeNo: employeeNo.trim() === '', password: password === '' }
    if (next.employeeNo || next.password) {
      // The errors render first, then focus moves to the first field that needs one: its
      // aria-describedby then reads the error, rather than focus staying silent on Sign in. A
      // server error from an earlier attempt is about other values, so it goes.
      flushSync(() => {
        setMissing(next)
        signIn.reset()
      })
      ;(next.employeeNo ? employeeRef : passwordRef).current?.focus()
      return
    }
    setMissing(next)
    signIn.mutate(
      { employeeNo: employeeNo.trim(), password },
      { onSuccess: () => navigate(redirectTo, { replace: true }) },
    )
  }

  function fill(desk: DemoDesk) {
    setEmployeeNo(desk.employeeNo)
    setPassword(desk.password)
    setMissing({})
    signIn.reset()
    // The fill is one click; signing in stays a deliberate second one.
    submitRef.current?.focus()
  }

  return (
    <main
      id="main"
      tabIndex={-1}
      className={cn(
        'relative flex flex-col rounded-xl border border-hairline bg-surface px-8 pb-7 outline-none sm:px-12',
        CONTENT_TOP,
      )}
    >
      <div className="absolute top-7 left-8 sm:left-12">
        <Lockup />
      </div>

      <div className="mx-auto flex w-full max-w-[26rem] flex-1 flex-col pb-8">
        <h1 className="text-display text-ink">Sign in to RM Desk</h1>
        <p className="mt-2 text-body text-ink-soft">
          Your book, today&rsquo;s calls and the advice record.
        </p>

        {ended ? (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 rounded-md bg-ground px-3 py-2.5 text-label-plain text-ink-soft"
          >
            <LockKeyhole aria-hidden className="size-4 shrink-0 text-ink-hint" />
            {ended === 'expired'
              ? 'Your session ended. Sign in again to carry on where you were.'
              : 'You are signed out.'}
          </p>
        ) : null}

        <form onSubmit={submit} noValidate className="mt-8 grid gap-5">
          <Field
            label="Employee number"
            error={missing.employeeNo ? 'Enter your employee number.' : undefined}
          >
            {(control) => (
              <Input
                {...control}
                ref={employeeRef}
                inputSize="lg"
                name="employeeNo"
                inputMode="numeric"
                autoComplete="username"
                autoFocus
                spellCheck={false}
                placeholder="6 digits"
                value={employeeNo}
                onChange={(e) => setEmployeeNo(e.target.value)}
              />
            )}
          </Field>

          <Field label="Password" error={missing.password ? 'Enter your password.' : undefined}>
            {(control) => (
              <Input
                {...control}
                ref={passwordRef}
                inputSize="lg"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                trailing={
                  <IconButton
                    label={showPassword ? 'Hide password' : 'Show password'}
                    icon={showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                    size="sm"
                    tooltip={false}
                    onClick={() => setShowPassword((v) => !v)}
                  />
                }
              />
            )}
          </Field>

          <AnimatePresence initial={false}>
            {signIn.isError ? (
              <m.p
                role="alert"
                initial={{ opacity: 0, height: 0 }}
                animate={{
                  opacity: 1,
                  height: 'auto',
                  transition: { duration: duration.state, ease: ease.out },
                }}
                exit={{ opacity: 0, height: 0, transition: { duration: duration.feedback } }}
                className="overflow-hidden rounded-md bg-danger-soft px-3 py-2.5 text-label text-danger"
              >
                {signInError(signIn.error)}
              </m.p>
            ) : null}
          </AnimatePresence>

          <Button
            ref={submitRef}
            type="submit"
            variant="primary"
            size="lg"
            block
            loading={signIn.isPending}
          >
            {signIn.isPending ? 'Signing in' : 'Sign in'}
          </Button>
        </form>

        <DemoAccess onFill={fill} />
      </div>

      <footer className="flex items-center justify-between gap-4 text-caption-plain text-ink-faint">
        <span>Synthetic demo data. No real customer is shown.</span>
        <span className="tabular">Build {__BUILD_SHA__}</span>
      </footer>
    </main>
  )
}

/** Open from the start: this is a demo build, and a judge should not have to find the logins. */
function DemoAccess({ onFill }: { onFill: (desk: DemoDesk) => void }) {
  const [open, setOpen] = useState(true)
  const panelId = useId()
  return (
    <div className="mt-6 rounded-lg border border-hairline">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg px-4 py-3 text-left transition-colors hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
      >
        <KeyRound aria-hidden className="size-4 text-brand" />
        <span className="flex-1 text-label text-ink">Demo access</span>
        <span className="text-caption-plain text-ink-faint">Two desk logins</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 text-ink-hint transition-transform duration-state',
            open && 'rotate-180',
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <m.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
              transition: { duration: duration.state, ease: ease.out },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: { duration: duration.feedback, ease: ease.in },
            }}
            className="overflow-hidden"
          >
            <ul className="grid grid-cols-1 gap-1 border-t border-hairline-soft p-2">
              {DEMO_DESKS.map((desk) => (
                <li
                  key={desk.employeeNo}
                  className="flex min-w-0 items-start gap-3 rounded-md px-2 py-2"
                >
                  <Avatar name={desk.name} size="sm" tone="brand" className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label text-ink">
                      {desk.name}
                      <span className="ml-2 font-normal text-ink-faint tabular">
                        {desk.employeeNo}
                      </span>
                    </p>
                    <p className="text-caption-plain text-pretty text-ink-faint">{desk.note}</p>
                    <p className="mt-0.5 text-caption-plain text-ink-soft">
                      Password <span className="font-mono text-ink">{desk.password}</span>
                    </p>
                  </div>
                  <Button size="sm" className="mt-0.5" onClick={() => onFill(desk)}>
                    Use
                  </Button>
                </li>
              ))}
            </ul>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/* ---------------------------------------------------------------- The story panel */

/** The console's three stories, each a page an RM opens: Today, the customer file, the Record. */
const PROOFS: readonly { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ListOrdered,
    title: 'Ranked calls with the why',
    body: 'Who to call first, and the reason in a sentence.',
  },
  {
    icon: Landmark,
    title: 'Money across every bank',
    body: 'Balances, loans and cover, at IDBI and beyond.',
  },
  {
    icon: ShieldCheck,
    title: 'Every refusal, hash-chained',
    body: 'What Uday would not sell, and the words it used.',
  },
]

function StoryPanel() {
  return (
    <section
      aria-label="About RM Desk"
      className={cn(
        'hidden overflow-hidden rounded-xl bg-brand-deep lg:flex lg:flex-col',
        CONTENT_TOP,
      )}
    >
      <div className="px-14">
        <p className="max-w-[15ch] text-figure text-balance text-on-ink">
          Every customer, every goal, one view.
        </p>
        <p className="mt-5 max-w-lg text-body text-on-ink-muted">
          Uday runs the daily loop for hundreds of customers and hands you only the moments that
          need a person, with the reason behind each one.
        </p>

        <ul className="mt-8 grid max-w-xl gap-3.5">
          {PROOFS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-start gap-3.5">
              <span
                aria-hidden
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-on-ink/10 text-success ring-1 ring-on-ink/15"
              >
                <Icon className="size-4" />
              </span>
              <span className="grid gap-0.5 pt-px">
                <span className="text-heading text-on-ink">{title}</span>
                <span className="text-label-plain text-on-ink-muted">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-14 pt-11 pb-10">
        <PreviewCard />
      </div>
    </section>
  )
}

/**
 * Three rows of a call list as the console draws them: who, what kind of call, and why, in words.
 * No names and no figures: before sign-in there is no book to read them from.
 */
const PREVIEW_ROWS: readonly {
  initials: string
  kind: string
  tone: ChipTone
  icon: LucideIcon
  why: string
}[] = [
  {
    initials: 'DK',
    kind: 'Asked for a call',
    tone: 'brand',
    icon: Hand,
    why: 'Wants to talk about clearing the card first',
  },
  {
    initials: 'NV',
    kind: 'Deposit maturing',
    tone: 'streak',
    icon: TimerReset,
    why: 'Matures this month; left alone it renews at the counter rate',
  },
  {
    initials: 'TS',
    kind: 'Expensive card debt',
    tone: 'danger',
    icon: CircleAlert,
    why: 'Uday holds back every investment until it clears',
  },
]

function PreviewCard() {
  return (
    <figure
      aria-hidden
      className="w-full max-w-[34rem] overflow-hidden rounded-xl bg-surface shadow-overlay ring-1 ring-on-ink/20"
    >
      <figcaption className="flex items-center justify-between border-b border-hairline-soft px-5 py-2.5">
        <span className="text-micro tracking-micro text-ink-faint uppercase">Call today</span>
        <span className="text-caption-plain text-ink-hint">Ranked by Uday</span>
      </figcaption>
      <ul className="divide-y divide-hairline-soft">
        {PREVIEW_ROWS.map((row) => (
          <li key={row.initials} className="flex items-center gap-3.5 px-5 py-3">
            <Avatar name={row.initials} initials={row.initials} size="md" />
            <span className="grid min-w-0 flex-1 justify-items-start gap-1">
              <Chip tone={row.tone} icon={<row.icon aria-hidden />}>
                {row.kind}
              </Chip>
              <span className="truncate text-label-plain text-ink-soft">{row.why}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
