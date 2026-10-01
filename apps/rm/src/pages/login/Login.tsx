import { ChevronDown, Eye, EyeOff, KeyRound, LockKeyhole } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { isApiError } from '../../api/client.ts'
import { useSignIn } from '../../api/queries.ts'
import { getEndReason, useSession } from '../../api/session.ts'
import { cn } from '../../lib/cn.ts'
import { duration, ease } from '../../lib/motion.ts'
import { Brand } from '../../shell/Brand.tsx'
import { Avatar, Button, Field, IconButton, Input, describeError } from '../../ui/index.ts'
import { DEMO_DESKS, type DemoDesk } from './demo-access.ts'

/**
 * Sign in. A split screen: the form on the left, and on the right one line about what the console
 * is for over the deep IDBI green, with a preview of the call list drawn as shapes, not figures.
 * Nothing on this page is a number from the book; there is no RM yet to show one to.
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

  function submit(event: FormEvent) {
    event.preventDefault()
    const next = { employeeNo: employeeNo.trim() === '', password: password === '' }
    setMissing(next)
    if (next.employeeNo || next.password) return
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
    <section className="flex flex-col rounded-xl border border-hairline bg-surface px-8 py-7 sm:px-12">
      <Brand />

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
        <h1 className="text-display text-ink">Sign in to RM Desk</h1>
        <p className="mt-2 text-body text-ink-soft">
          Your book, today&rsquo;s calls and the advice record, for IDBI Bank&rsquo;s relationship
          managers.
        </p>

        {ended ? (
          <p
            role="status"
            className="mt-6 flex items-center gap-2 rounded-md bg-ground px-3 py-2.5 text-label font-normal text-ink-soft"
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
              <motion.p
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
              </motion.p>
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

      <footer className="flex items-center justify-between gap-4 text-caption font-normal text-ink-faint">
        <span>Synthetic demo data. No real customer is shown.</span>
        <span className="tabular">Build {__BUILD_SHA__}</span>
      </footer>
    </section>
  )
}

function DemoAccess({ onFill }: { onFill: (desk: DemoDesk) => void }) {
  const [open, setOpen] = useState(false)
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
        <span className="text-caption font-normal text-ink-faint">Two desk logins</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 text-ink-hint transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
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
                    <p className="text-caption font-normal text-pretty text-ink-faint">
                      {desk.note}
                    </p>
                    <p className="mt-0.5 text-caption font-normal text-ink-soft">
                      Password <span className="font-mono text-ink">{desk.password}</span>
                    </p>
                  </div>
                  <Button size="sm" className="mt-0.5" onClick={() => onFill(desk)}>
                    Use
                  </Button>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/* ---------------------------------------------------------------- The story panel */

/** Abstract rows for the preview card: shapes of a call list, deliberately without figures. */
const PREVIEW_ROWS = [
  { name: 'w-28', why: 'w-44', tag: 'bg-danger-soft/90', tagW: 'w-14' },
  { name: 'w-24', why: 'w-52', tag: 'bg-streak-soft/90', tagW: 'w-16' },
  { name: 'w-32', why: 'w-40', tag: 'bg-budget/80', tagW: 'w-[4.5rem]' },
] as const

function StoryPanel() {
  return (
    <section
      aria-label="About RM Desk"
      className="relative hidden overflow-hidden rounded-xl bg-brand-deep lg:flex lg:flex-col"
    >
      {/* Depth from the tokens' own greens: lighter where the light falls, ink in the corner. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 85% 0%, color-mix(in oklab, var(--color-brand) 85%, transparent) 0%, transparent 60%), radial-gradient(90% 70% at 0% 100%, var(--color-ink) 0%, transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-on-ink) 1px, transparent 1px), linear-gradient(90deg, var(--color-on-ink) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(80% 60% at 70% 30%, black, transparent)',
        }}
      />

      <div className="relative px-14 pt-16">
        <p className="max-w-[15ch] text-figure text-balance text-on-ink">
          Every customer, every goal, one view.
        </p>
        <p className="mt-6 max-w-md text-body text-on-ink/75">
          Uday runs the daily loop for hundreds of customers and hands you only the moments that
          need a person, with the reason and the figure behind each one.
        </p>
      </div>

      <div className="relative flex flex-1 items-center px-14 py-10">
        <PreviewCard />
      </div>

      <div className="relative px-14 pb-12">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-caption text-on-ink/70">
          <li>Ranked calls with the why</li>
          <li aria-hidden>·</li>
          <li>Money across every bank</li>
          <li aria-hidden>·</li>
          <li>Every refusal, hash-chained</li>
        </ul>
      </div>
    </section>
  )
}

function PreviewCard() {
  return (
    <div aria-hidden className="relative w-full max-w-[34rem]">
      {/* A second sheet behind the first, so the card reads as one of a stack, not a sticker. */}
      <div className="absolute inset-x-6 -top-3 h-full rounded-xl bg-on-ink/6 ring-1 ring-on-ink/10" />
      <div className="relative rounded-xl bg-on-ink/[0.09] p-5 ring-1 ring-on-ink/15">
        <div className="flex items-center justify-between">
          <span className="text-micro tracking-micro text-on-ink/75 uppercase">Call today</span>
          <svg viewBox="0 0 120 32" className="h-8 w-28 text-success" fill="none">
            <defs>
              <linearGradient id="login-spark" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M2 26 C 18 24, 26 20, 38 21 S 58 14, 70 15 S 92 8, 104 7 L 118 4 L118 32 L2 32 Z"
              fill="url(#login-spark)"
            />
            <path
              d="M2 26 C 18 24, 26 20, 38 21 S 58 14, 70 15 S 92 8, 104 7 L 118 4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
            <circle cx="118" cy="4" r="2.5" fill="currentColor" />
          </svg>
        </div>
        <ul className="mt-4 grid gap-3">
          {PREVIEW_ROWS.map((row, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg bg-on-ink/[0.06] px-3 py-2.5">
              <span className="w-3 text-caption tabular text-on-ink/50">{i + 1}</span>
              <span className="size-7 shrink-0 rounded-full bg-on-ink/20" />
              <span className="grid flex-1 gap-1.5">
                <span className={cn('h-2 rounded-full bg-on-ink/45', row.name)} />
                <span className={cn('h-1.5 rounded-full bg-on-ink/20', row.why)} />
              </span>
              <span className={cn('h-4 rounded-sm', row.tag, row.tagW)} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
