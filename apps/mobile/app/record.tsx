// The record — what the bank told you, and why.
//
// Nothing in Cleo corresponds to this, and nothing needs to: a third-party budgeting app
// owes its user no account of its reasoning. A bank giving investment advice in India does.
// SEBI's Investment Adviser regulations require the suitability assessment, the rationale
// and the record to be kept for five years and produced on demand — so this screen is not
// a trust gesture, it is the obligation, shown to the person it is about.
//
// Three things are on it that a customer could not otherwise see: every verdict including
// the refusals, the nine rules as data rather than as marketing, and the consent the whole
// thing runs on, with its scopes and its expiry.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { NavRow } from '~/ui/NavRow'
import { Pills, usePane } from '~/ui/Pills'
import { Pane } from '~/ui/Reveal'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { Row } from '~/ui/Row'
import { Section } from '~/ui/Section'
import { Chip } from '~/ui/Chip'
import { Glyph } from '~/ui/Glyph'
import { api } from '~/api/client'
import { useSnapshot, type SnapshotState } from '~/state/snapshot'
import { headline } from '~/lib/headline'
import { fullDate, rupees } from '~/lib/money'
import { color } from '@dhan/design'
import { TimeMachine } from '~/ui/TimeMachine'
import type { RecordView, Rule, SessionState } from '@dhan/contracts'

type Pane = 'advice' | 'rules' | 'data'

const PANES = [
  { value: 'advice' as const, label: 'What I was told' },
  { value: 'rules' as const, label: 'The rules' },
  { value: 'data' as const, label: 'My data' },
]

export default function RecordScreen() {
  const { pane, dir, set } = usePane<Pane>('advice')
  // The rules and the shelf are both already in the snapshot — `ViewSchema` carries them —
  // so this screen reads them from the one module every other screen reads rather than
  // re-fetching two routes it would then have to fail quietly. That also means a /rules
  // that sheds load can no longer render "these nine rules run on every product" above an
  // empty card, and a shelf that fails can no longer print "lic ulip 401" where the record
  // should say "LIC Market Plus ULIP": one read, one failure, one sentence about it.
  const { data: view, state: viewState, refresh } = useSnapshot()
  const [record, setRecord] = useState<RecordView | null>(null)
  const [session, setSession] = useState<SessionState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rules: Rule[] = view?.rules ?? []
  const names = useMemo(
    () => new Map((view?.shelf ?? []).map((p) => [p.productId, p.name])),
    [view],
  )

  const load = useCallback(async () => {
    await Promise.all([
      api
        .record()
        .then((r) => {
          setRecord(r)
          setError(null)
        })
        .catch(() => setError('Could not load your record.')),
      api
        .session()
        .then(setSession)
        .catch(() => setSession(null)),
    ])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Moving the clock moves it for the whole app, not for this card. The TimeMachine hands
  // back the new SessionState, and setting that alone is what left Spend, Plan, Grow and
  // Protect rendering the old day's snapshot while this screen said the date had changed —
  // the tabs stay mounted, so nothing of theirs re-fetches on its own. Refreshing the
  // snapshot here is what makes "move it and watch them change" true; the record is re-read
  // with it because advice is written against the date as well.
  const onClockMoved = useCallback(
    (next: SessionState) => {
      setSession(next)
      void refresh()
      void load()
    },
    [refresh, load],
  )

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onBack={() => router.back()} />
      <View className="px-pad pb-lg">
        <Type role="display">Your record</Type>
      </View>
      <Pills options={PANES} value={pane} onChange={set} />

      <ScrollView className="flex-1" contentContainerClassName="px-pad pt-lg pb-xxl gap-md">
        {error ? (
          <Type role="body" tone="danger">
            {error}
          </Type>
        ) : !record ? (
          <Type role="body" tone="soft">
            Opening your record…
          </Type>
        ) : (
          <Pane key={pane} dir={dir} className="gap-md">
            {pane === 'advice' ? (
              <Advice record={record} names={names} />
            ) : pane === 'rules' ? (
              <Rules rules={rules} state={viewState} />
            ) : (
              <Data record={record} session={session} onClockMoved={onClockMoved} />
            )}
          </Pane>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function Advice({ record, names }: { record: RecordView; names: Map<string, string> }) {
  if (record.adviceRecords.length === 0) {
    return (
      <Type role="body" tone="soft">
        Nothing yet. Every piece of advice lands here, including the ones I refuse.
      </Type>
    )
  }
  return (
    <>
      {/* The chain is the claim. Each row carries the hash of the one before it, so a row
          cannot be altered or removed later without every subsequent hash failing — and the
          app says out loud whether that check currently passes. */}
      <View
        className={
          record.chainVerified ? 'rounded-lg bg-success p-lg' : 'rounded-lg bg-danger-soft p-lg'
        }
      >
        <View className="flex-row items-center gap-sm">
          <Glyph name={record.chainVerified ? 'check' : 'lock'} size={18} tint={color.ink} />
          <Type role="heading">
            {record.chainVerified ? 'Chain verified' : 'Chain does not verify'}
          </Type>
        </View>
        <Type role="body" className="mt-sm opacity-80">
          {record.adviceRecords.length} entries, each sealed with the hash of the one before it.
          Kept for five years. Nothing here can be edited after the fact without the check failing.
        </Type>
      </View>

      {record.adviceRecords
        .slice()
        .reverse()
        .map((r) => {
          const blocked = r.verdict === 'BLOCKED'
          return (
            <Card key={r.id}>
              <View className="px-lg py-lg">
                <View className="flex-row items-center justify-between gap-md">
                  <Chip tone={blocked ? 'streak' : 'success'}>
                    {blocked ? `Refused · ${r.ruleId}` : 'Passed all nine'}
                  </Chip>
                  <Type role="caption" tone="faint">
                    #{r.seq}
                  </Type>
                </View>

                <Type role="heading" className="mt-md">
                  {headline(r.actionKind, r.productId, names)}
                  {r.amount !== null && r.amount > 0 ? ` · ${rupees(r.amount)}` : ''}
                </Type>

                <Type role="body" tone="soft" className="mt-xs">
                  {r.spoken ?? r.recorded}
                </Type>

                {/* The auditor's line, not the customer's. Kept visible deliberately: the
                    person the record is about should see exactly what a reviewer sees. */}
                {r.spoken && r.recorded !== r.spoken && (
                  <View className="mt-md rounded-md bg-ground-deep p-md">
                    <Type role="caption" tone="soft">
                      AS RECORDED
                    </Type>
                    <Type role="caption" tone="mid" className="mt-xs">
                      {r.recorded}
                    </Type>
                  </View>
                )}

                <Type role="caption" tone="faint" className="mt-md">
                  {r.rulesPassed.length} of 9 passed · hash {r.recordHash.slice(0, 12)}…
                </Type>
              </View>
            </Card>
          )
        })}
    </>
  )
}

function Rules({ rules, state }: { rules: Rule[]; state: SnapshotState }) {
  // A compliance screen may not assert that a set of rules exists and then list none. If the
  // snapshot is not holding them, say which it is — still reading, or could not read — rather
  // than rendering an empty card under a sentence that claims nine.
  if (rules.length === 0) {
    return state === 'error' ? (
      <Type role="body" tone="danger">
        Could not load the rules. Start the API on :3001 and reopen this screen.
      </Type>
    ) : (
      <Type role="body" tone="soft">
        Reading the rules…
      </Type>
    )
  }
  return (
    <>
      <Type role="body" tone="soft">
        These run in order, on every product, every time. The first one to fail stops the
        recommendation. So the rule named on a refusal is the first thing wrong, not the only thing.
      </Type>
      <Card>
        {rules.map((rule, i) => (
          <View
            key={rule.id}
            className={i > 0 ? 'border-t border-hairline px-lg py-lg' : 'px-lg py-lg'}
          >
            <View className="flex-row items-baseline gap-md">
              <Type role="caption" tone="faint">
                {i + 1}
              </Type>
              <View className="flex-1">
                <Type role="caption" tone="brand">
                  {rule.id}
                </Type>
                <Type role="body" className="mt-xs">
                  {rule.description}
                </Type>
              </View>
            </View>
          </View>
        ))}
      </Card>
    </>
  )
}

function Data({
  record,
  session,
  onClockMoved,
}: {
  record: RecordView
  session: SessionState | null
  onClockMoved: (next: SessionState) => void
}) {
  const { consent, provenance } = record
  return (
    <>
      {/* Null where no consent artefact was ever written against this session. Saying so is
          the honest answer — optional-chaining the six fields into blanks would print a
          consent card with no consent behind it, on the one screen that exists to be audited. */}
      {consent === null ? (
        <View className="rounded-lg bg-hero p-lg">
          <Type role="caption" tone="onInk" className="opacity-85">
            CONSENT
          </Type>
          <Type role="title" tone="onInk" className="mt-xs">
            Nothing on file
          </Type>
          <Type role="body" tone="onInk" className="mt-sm opacity-85">
            No consent was recorded for this session, so there is nothing to show you and nothing a
            reviewer could check.
          </Type>
        </View>
      ) : (
        <>
          <View className="rounded-lg bg-hero p-lg">
            <Type role="caption" tone="onInk" className="opacity-85">
              CONSENT · {consent.status}
            </Type>
            <Type role="title" tone="onInk" className="mt-xs">
              {consent.purpose}
            </Type>
            <Type role="body" tone="onInk" className="mt-sm opacity-85">
              Valid {fullDate(consent.validFrom)} to {fullDate(consent.validTo)}. Reference{' '}
              {consent.consentId}.
            </Type>
          </View>

          <Section title="What you let me read" />
          <Card>
            {consent.scopes.map((scope, i) => (
              <View
                key={scope}
                className={
                  i > 0
                    ? 'flex-row items-center justify-between border-t border-hairline px-lg py-md'
                    : 'flex-row items-center justify-between px-lg py-md'
                }
              >
                <Type role="body" tone="mid">
                  {SCOPE_LABEL[scope] ?? scope}
                </Type>
                <Chip tone="success">Granted</Chip>
              </View>
            ))}
          </Card>
        </>
      )}

      {/* Null under a real bank feed, where the ledger was lived rather than seeded. The
          "this is synthetic data" panel is guarded along with the figures, because the panel
          is a claim about where the rows came from and not a fixed piece of copy — printing
          it over an empty card would be the same untruth in the other direction. Inside the
          guard every field is present: the contract makes them all required. */}
      {provenance !== null && (
        <>
          <Section title="Where this ledger came from" />
          {/* Said plainly rather than buried. This build runs on a generated ledger, and a
              product whose entire argument is "we show our reasoning" cannot be coy about the
              provenance of the numbers that reasoning is built on. The content hash is what
              makes the claim checkable: the same seed run reproduces the same ledger exactly. */}
          <View className="rounded-lg bg-streak p-lg">
            <Type role="heading">This is synthetic data</Type>
            <Type role="body" className="mt-xs opacity-85">
              Every transaction here was generated, not lived. The engine, the rules and the record
              are real. The customer is not.
            </Type>
          </View>
          <Card>
            <Row label="Generated by" value={provenance.generatorVersion} tone="soft" />
            <Row
              label="Ledger covers"
              value={`${fullDate(provenance.historyFrom)} – ${fullDate(provenance.horizonTo)}`}
              divide
              tone="soft"
            />
            <Row label="Clock anchored at" value={fullDate(provenance.anchor)} divide tone="soft" />
            <Row
              label="Content hash"
              value={`${provenance.contentSha256.slice(0, 16)}…`}
              divide
              tone="soft"
            />
          </Card>
        </>
      )}

      <Type role="caption" tone="faint">
        Withdraw anything above and the advice is worked out again without it. The numbers change;
        the screen does not just hide them.
      </Type>

      {session && (
        <>
          <Section title="The clock" />
          <TimeMachine session={session} onMoved={onClockMoved} />
        </>
      )}
    </>
  )
}

const SCOPE_LABEL: Record<string, string> = {
  PROFILE: 'Who you are',
  ACCOUNTS: 'Accounts and balances',
  TXN: 'Transactions',
  LIABILITIES: 'Loans and cards',
  HOLDINGS: 'Investments and cover',
}
