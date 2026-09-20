// Where this comes from — the provenance of the portfolio, and the switch behind it.
//
// Three things the app knew and never showed. `HoldingSchema.custodian` names the place every
// holding actually sits at. `meta.provenance` says, per block of the file, whether a figure was
// read from IDBI, declared by the customer, or seeded for a demo. `session.scopeOverrides` is
// the list of blocks the customer has switched off, and the engine genuinely recomputes without
// them — withdrawing HOLDINGS here really does take the funds out of net worth and out of the
// plan, which is what makes this a consent screen rather than a settings page.
//
// It is its own route rather than a sixth pill on Grow for that reason. Five pills is already a
// crowded bar, and more to the point: withdrawing consent is not something a customer should be
// able to do by accident while scrolling a portfolio.
//
// The order is deliberate. What the bank holds, then who holds it, then what the bank may read
// — facts first and the control last, so nobody is offered a switch before they have been told
// what it turns off. The consent artefact itself is not repeated here; `record.tsx` owns it,
// carries the reference and the hash, and is linked at the foot rather than copied.
import { useCallback, useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { NavRow } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Count } from '~/ui/Count'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { Note } from '~/ui/Note'
import { Section } from '~/ui/Section'
import { Reveal } from '~/ui/Reveal'
import { ToggleRow } from '~/ui/ToggleRow'
import { SourceMark } from '~/ui/SourceMark'
import { type GlyphName } from '~/ui/Glyph'
import { dur } from '~/ui/motion'
import { cn } from '~/ui/cn'
import { api } from '~/api/client'
import { useSnapshot } from '~/state/snapshot'
import { fullDate, rupees, rupeesShort } from '~/lib/money'
import { provenanceLabel, sourcesOf, type Source } from '~/lib/sources'
import type { ConsentScope, HoldingRecordResponse, SessionState } from '@dhan/contracts'

/**
 * The five blocks, in the order they build on each other: who you are, what you hold, what
 * moves, what you owe, what you own. Each `costs` line is the real consequence of the switch
 * beside it, because a consent control that does not say what it costs is not consent.
 */
const BLOCKS: ReadonlyArray<{
  scope: ConsentScope
  glyph: GlyphName
  title: string
  reads: string
  costs: string
}> = [
  {
    scope: 'PROFILE',
    glyph: 'person',
    title: 'Who you are',
    reads: 'Your age, dependants and the risk answers you gave.',
    costs: 'The gate cannot check whether a product suits you, so nothing can be recommended.',
  },
  {
    scope: 'ACCOUNTS',
    glyph: 'ledger',
    title: 'What you hold here',
    reads: 'Your IDBI savings and deposit balances.',
    costs: 'No safe-to-spend figure and no buffer, because both are read off the balance.',
  },
  {
    scope: 'TXN',
    glyph: 'receipt',
    title: 'What moves',
    reads: 'Two years of credits and debits on those accounts.',
    costs: 'The budget, the insights and the daily action all stop.',
  },
  {
    scope: 'LIABILITIES',
    glyph: 'coins',
    title: 'What you owe',
    reads: 'Cards, loans and their rates.',
    costs: 'The plan stops putting expensive borrowing before investing.',
  },
  {
    scope: 'HOLDINGS',
    glyph: 'grow',
    title: 'What you own',
    reads: 'Funds, retirement balances and cover — here and at the places below.',
    costs: 'Net worth counts only your balances, and the plan stops seeing what you already hold.',
  },
]

/**
 * The composition ramp, positional rather than semantic.
 *
 * The same three tones the Net worth pane already allocates with, continued far enough to
 * carry a sixth custodian. Which rung a place lands on says only how much it holds relative to
 * the others; none of these colours means anything on its own.
 */
const RAMP = ['bg-brand', 'bg-streak', 'bg-budget', 'bg-ink-mid', 'bg-success', 'bg-ink-faint']

export default function Connections() {
  const { data: view, refresh } = useSnapshot()
  const [holdings, setHoldings] = useState<HoldingRecordResponse[]>([])
  const [session, setSession] = useState<SessionState | null>(null)
  const [busy, setBusy] = useState<ConsentScope | null>(null)

  const load = useCallback(async () => {
    await Promise.all([
      api
        .holdings()
        .then((h) => setHoldings(h.holdings))
        .catch(() => setHoldings([])),
      api
        .session()
        .then(setSession)
        .catch(() => setSession(null)),
    ])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const withdrawn = new Set<ConsentScope>(session?.scopeOverrides ?? [])
  const sources = sourcesOf(holdings)
  const total = sources.reduce((sum, s) => sum + s.value, 0)
  const holdingsOff = withdrawn.has('HOLDINGS')

  /**
   * Switched optimistically and reconciled against what the server answers.
   *
   * The engine rebuilds the whole view without the block, so the honest confirmation of this
   * switch is the net worth on the previous screen changing — which means the snapshot has to
   * be refreshed too, not just this row repainted.
   */
  async function setScope(scope: ConsentScope, granted: boolean) {
    const before = session
    setBusy(scope)
    setSession((s) =>
      s === null
        ? s
        : {
            ...s,
            scopeOverrides: granted
              ? s.scopeOverrides.filter((o) => o !== scope)
              : [...s.scopeOverrides.filter((o) => o !== scope), scope],
          },
    )
    try {
      await api.setConsent(scope, granted)
      await Promise.all([refresh(), load()])
    } catch {
      setSession(before)
    } finally {
      setBusy(null)
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onBack={() => router.back()} />

      <ScrollView className="flex-1" contentContainerClassName="px-pad pb-xxl gap-md">
        <View className="pb-lg">
          <Type role="display">Where this comes from</Type>
          <Type role="body" tone="soft" className="mt-xs">
            Every figure in the app is read from somewhere. This is the list, and the switch.
          </Type>
        </View>

        {/* The one saturated surface. It states the total the places below add up to, and the
            date that total was last true — never a sync time, because nothing here syncs. */}
        <View className="rounded-lg bg-hero p-lg">
          <Type role="caption" tone="onInk" className="opacity-85">
            {holdingsOff ? 'NOT COUNTED' : 'HELD ACROSS'}
          </Type>
          {holdingsOff ? (
            <Type role="title" tone="onInk" className="mt-xs">
              You switched this off
            </Type>
          ) : (
            <>
              <View className="mt-xs flex-row items-baseline gap-sm">
                <Count
                  value={total}
                  format={rupeesShort}
                  role="display"
                  tone="onInk"
                  delay={dur.enter}
                />
                <Type role="body" tone="onInk" className="opacity-85">
                  in {sources.length === 1 ? 'one place' : `${sources.length} places`}
                </Type>
              </View>
              {view !== null && (
                <Type role="caption" tone="onInk" className="mt-sm opacity-85">
                  {provenanceLabel(view.meta.provenance.HOLDINGS)} · last read{' '}
                  {fullDate(view.meta.dataFreshnessDate)}
                </Type>
              )}
            </>
          )}
        </View>

        {!holdingsOff && sources.length > 0 && (
          <>
            {/* The comparison the rows underneath cannot make. Eleven holdings across five
                custodians is a composition, and a composition read as five separate meters is
                five facts rather than one shape. */}
            <Reveal delay={dur.state}>
              <Card>
                <View className="px-lg py-lg">
                  <View className="h-[10px] w-full flex-row gap-[3px]">
                    {sources.map((s, i) => (
                      <View
                        key={s.name}
                        className={cn('h-full rounded-pill', RAMP[i % RAMP.length])}
                        style={{ flexGrow: Math.max(s.share, 0.02), flexBasis: 0 }}
                      />
                    ))}
                  </View>
                  <Type role="caption" tone="faint" className="mt-md">
                    Widest is where most of it sits. {sources[0]?.name} holds{' '}
                    {Math.round((sources[0]?.share ?? 0) * 100)}% of what you own.
                  </Type>
                </View>
              </Card>
            </Reveal>

            <Section title="The places" />
            {sources.map((s, i) => (
              <Reveal key={s.name} i={i} delay={dur.state}>
                <SourceRow source={s} swatch={RAMP[i % RAMP.length] as string} />
              </Reveal>
            ))}

            <Type role="caption" tone="faint">
              Holdings away from IDBI come from your consolidated statement, not from the bank. IDBI
              cannot transact on them and does not see them move.
            </Type>
          </>
        )}

        {/* Facts first, control last: nothing above this point asked the customer for anything. */}
        <Section title="What IDBI may read" />
        <Type role="body" tone="soft">
          Each block is granted on its own and can be withdrawn on its own. The advice is recomputed
          without whatever you switch off — this is not a preference, it is the file.
        </Type>

        {BLOCKS.map((b) => (
          <ToggleRow
            key={b.scope}
            glyph={b.glyph}
            title={b.title}
            detail={withdrawn.has(b.scope) ? `Switched off. ${b.costs}` : b.reads}
            value={!withdrawn.has(b.scope)}
            onValueChange={(v) => {
              if (busy === null) void setScope(b.scope, v)
            }}
          />
        ))}

        <Note glyph="lock" title="Withdrawing costs you nothing">
          Nothing is deleted and nothing is held against you. Switch a block back on and the advice
          returns with it, recomputed on the same file it was before.
        </Note>

        <Section title="The consent record" onMore={() => router.push('/record')} />
        <Type role="body" tone="soft">
          The consent reference, the dates it is valid between, and every piece of advice written
          against it live on your record.
        </Type>
      </ScrollView>
    </SafeAreaView>
  )
}

function SourceRow({ source, swatch }: { source: Source; swatch: string }) {
  return (
    <Card>
      <View className="flex-row items-center gap-md px-lg py-lg">
        <SourceMark kind={source.kind} size={40} />
        <View className="flex-1">
          {/* The swatch is a key, not a second bar. The composition above already draws every
              share as a length; repeating that length inside each row says the same number a
              third time, after the chip has already said it exactly. What the row actually
              needs is the thing a shared axis cannot give it — which segment up there is this
              row — and a dot does that in six pixels. */}
          <View className="flex-row items-center gap-sm">
            <View className={cn('h-[8px] w-[8px] rounded-pill', swatch)} />
            <Type role="heading" tone={source.named ? 'ink' : 'soft'} className="flex-1">
              {source.name}
            </Type>
          </View>
          <Type role="caption" tone="soft" className="mt-[2px]">
            {source.count === 1 ? '1 holding' : `${source.count} holdings`} ·{' '}
            {source.classes.join(', ')}
          </Type>
        </View>
        <Type role="label">{rupees(source.value)}</Type>
      </View>

      <View className="px-lg pb-lg">
        <View className="flex-row flex-wrap gap-sm">
          <Chip tone="ground">{Math.round(source.share * 100)}% of what you own</Chip>
          {source.isHome ? (
            <Chip tone="budget">IDBI&apos;s own book</Chip>
          ) : (
            <Chip tone="ground">Via your consolidated statement</Chip>
          )}
        </View>
        {/* The one row a customer cannot act on, said plainly rather than left looking like a
            company called "Place not recorded". */}
        {!source.named && (
          <Type role="caption" tone="faint" className="mt-md">
            Your statement listed these without naming who holds them, so there is nowhere to send
            you to check. Adding the custodian on each one will name it here.
          </Type>
        )}
      </View>
    </Card>
  )
}
