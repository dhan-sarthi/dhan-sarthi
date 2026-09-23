// Step 1 — who is signing in.
//
// The bank already knows this customer, so there is no account to create: a mobile
// number is the whole of it. Cleo's equivalent first step is one field and one
// button on an otherwise empty screen, and the emptiness is the point — it reads as
// a short flow rather than a form.
//
// The customer list underneath is the demo seam. Each synthetic customer has a stable number —
// their place in the API's list, counted on from one fixed seed — so the flow stays a real
// login rather than a picker wearing a login's clothes. Tapping a customer fills the field the
// way a password manager would, and typing a customer's number picks them. The number and the
// choice are one fact: the radio shows whoever the field names, so editing the number away from
// a customer un-picks them, and "Continue" is never live for a number nobody has.
//
// There is no code step. It asked for "any six digits", and people stopped there not knowing what
// to type, so the number is the sign-in: Continue creates the session and goes straight to consent.
// A failure says whose it was — the bank refusing, the rate limit, or the connection.
//
// The field takes digits only and sets them the way a number is read aloud, in two fives. A
// number pasted or autofilled with its "+91" in front keeps its own ten digits: the field used to
// cap its length at eleven characters, which cut "+91 98200 10004" down to "+91 98200 1" before
// anything could read it. Its placeholder says what goes in rather than showing a number, because
// a demo customer's number in grey read as already typed, over a disabled button.
// Finding the customers is a wait with a name, and not finding them is a sentence with a Try
// again, never a port number.
import { useCallback, useEffect, useState } from 'react'
import { Keyboard, View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Type } from '~/ui/Text'
import { Field } from '~/ui/Field'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { SelectCard } from '~/ui/SelectCard'
import { Thinking } from '~/ui/Thinking'
import { RetryLine } from '~/ui/SnapshotScroll'
import { leave } from '~/ui/NavRow'
import { ApiError, api } from '~/api/client'
import { useOnboarding } from '~/state/onboarding'
import type { CustomerSummary } from '@dhan/contracts'

/** The first customer's number. The rest follow it, one apart, in the order the API lists them. */
const DEMO_SEED = 9_820_010_001

function digitsOf(text: string): string {
  return text.replace(/\D/g, '')
}

/** What may stand in front of a pasted or autofilled number: the country code, or a trunk 0. */
const PREFIXES = new Set(['0', '91', '0091'])

/**
 * The ten digits a change leaves in the field. Digits past ten are a prefix to drop only when
 * they are exactly one ("+91 98200 10004", "098200 10004"); anything else is a digit typed into
 * a full field, and it is refused rather than pushing the last digit out.
 */
function tenDigits(text: string, current: string): string {
  const all = digitsOf(text)
  if (all.length <= 10) return all
  if (PREFIXES.has(all.slice(0, -10))) return all.slice(-10)
  return current.length === 10 ? current : all.slice(0, 10)
}

/** "9820010004" → "98200 10004": two fives, the way the number is said. */
function spaced(digits: string): string {
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits
}

/** The demo number for the customer at `i` in the API's list. */
function demoNumber(i: number): string {
  return spaced(String(DEMO_SEED + i))
}

/** The customer a full ten-digit number belongs to, if any. */
function ownerOf(
  digits: string,
  customers: ReadonlyArray<CustomerSummary>,
): CustomerSummary | null {
  if (digits.length !== 10) return null
  return customers.find((_, i) => digitsOf(demoNumber(i)) === digits) ?? null
}

/** What a failed sign-in says, by who failed: the bank, the rate limit, or the connection. */
function failureOf(err: unknown): string {
  if (err instanceof ApiError && [400, 401, 403].includes(err.status)) {
    return "The bank couldn't sign you in. Try again."
  }
  if (err instanceof ApiError && err.status === 429) {
    return 'Too many sign-ins in the last hour. Try again later.'
  }
  return "Couldn't reach the bank. Try again."
}

export default function MobileStep() {
  const { draft, set } = useOnboarding()
  const [customers, setCustomers] = useState<CustomerSummary[]>([])
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busy, setBusy] = useState(false)
  const [signInError, setSignInError] = useState<string | null>(null)

  const load = useCallback(() => {
    setPhase('loading')
    api
      .customers()
      .then((list) => {
        setCustomers(list)
        setPhase('ready')
      })
      .catch(() => setPhase('error'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const digits = digitsOf(draft.mobile)
  const chosen = ownerOf(digits, customers)
  // A full number that belongs to nobody is worth saying so; a half-typed one is not yet wrong.
  const stranger = phase === 'ready' && digits.length === 10 && chosen === null

  async function signIn() {
    if (busy || chosen === null) return
    setBusy(true)
    setSignInError(null)
    // On a phone the number pad would otherwise ride over to consent and cover its button.
    Keyboard.dismiss()
    set({ customer: chosen })
    try {
      await api.createSession(chosen.cif)
      router.push('/(onboarding)/consent')
    } catch (err) {
      setSignInError(failureOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      step={1}
      steps={5}
      onBack={() => leave('/(onboarding)/welcome')}
      title={"What's your\nmobile number?"}
      subtitle="The one registered with your IDBI account."
      footer={
        <Button
          label="Continue"
          loading={busy}
          haptic="none"
          disabled={chosen === null}
          onPress={() => void signIn()}
        />
      }
    >
      <View className="mt-xl">
        <Field
          label="Mobile number"
          prefix="+91"
          hint="This demo signs in as one of the customers below — pick one."
          {...(stranger
            ? { error: 'No demo customer has that number. Pick one below.' }
            : signInError !== null
              ? { error: signInError }
              : {})}
          value={draft.mobile}
          onChangeText={(text) => {
            const next = tenDigits(text, digits)
            set({ mobile: spaced(next), customer: ownerOf(next, customers) })
            setSignInError(null)
          }}
          keyboardType="number-pad"
          inputMode="numeric"
          textContentType="telephoneNumber"
          autoComplete="tel"
          returnKeyType="done"
          placeholder="10-digit number"
        />
      </View>

      <View className="mt-xxl">
        <View className="flex-row items-center gap-sm">
          <Type role="heading">Pick a customer</Type>
          <Chip tone="ground" label="Demo" />
        </View>

        {phase === 'loading' ? (
          <Thinking className="mt-lg" accessibilityLabel="Finding demo customers" />
        ) : phase === 'error' ? (
          <View className="mt-md">
            <RetryLine
              compact
              message="Couldn't reach the bank. Check your connection and try again."
              onRetry={load}
            />
          </View>
        ) : (
          <Card
            accessibilityRole="radiogroup"
            accessibilityLabel="Demo customers"
            className="mt-md overflow-hidden"
          >
            {customers.map((c, i) => (
              <SelectCard
                key={c.cif}
                title={c.name}
                description={c.pitch}
                selected={chosen?.cif === c.cif}
                divide={i > 0}
                onPress={() => set({ customer: c, mobile: demoNumber(i) })}
              />
            ))}
          </Card>
        )}
      </View>
    </Screen>
  )
}
